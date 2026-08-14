"""
Job posting scraping + heuristic extraction.

- ``scrape_url``  : fetch a job-posting URL and reduce the HTML to clean text
                    (title + meta description + main body). No heavy deps.
- ``heuristic_extract`` : extract company / position / location from raw text
                    without an LLM. Used as the fallback when no AI provider is
                    configured, and to patch up empty fields from the AI.
"""

import html
import ipaddress
import re
import socket
from html.parser import HTMLParser
from typing import Dict, List, Optional
from urllib.parse import urlparse

import requests as _requests

# Browser-like user agent so job boards / university sites don't block us.
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
_MAX_TEXT_CHARS = 40_000
_REQUEST_TIMEOUT = 20  # seconds

# Tags that carry no useful job-posting content.
_SKIP_TAGS = {
    "script", "style", "noscript", "svg", "head", "header", "footer",
    "nav", "iframe", "form", "button", "aside",
}


class _TextExtractor(HTMLParser):
    """Collects the page's visible text, skipping boilerplate tags."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: List[str] = []
        self._skip_depth = 0
        self.title: str = ""
        self.meta_description: str = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: List) -> None:
        if tag in _SKIP_TAGS:
            self._skip_depth += 1
            return
        if tag == "title":
            self._in_title = True
        if tag in ("p", "div", "br", "li", "h1", "h2", "h3", "tr", "section"):
            self.parts.append("\n")
        if tag in ("h1", "h2", "h3", "h4", "b", "strong"):
            self.parts.append(" ")
        if tag == "meta":
            attrs_dict = {k.lower(): (v or "") for k, v in attrs}
            name = (attrs_dict.get("name") or "").lower()
            if name == "description" and not self.meta_description:
                self.meta_description = attrs_dict.get("content", "")

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP_TAGS:
            if self._skip_depth > 0:
                self._skip_depth -= 1
            return
        if tag == "title":
            self._in_title = False
        if tag in ("p", "div", "li", "h1", "h2", "h3", "tr", "section"):
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0:
            return
        if self._in_title:
            self.title += data
            return
        self.parts.append(data)


def _clean_ws(text: str) -> str:
    """Collapse blank lines and stray spaces to a readable block of text."""
    lines = [ln.strip() for ln in text.splitlines()]
    out: List[str] = []
    blank = 0
    for ln in lines:
        if not ln:
            blank += 1
            if blank >= 2:
                continue
            out.append("")
            continue
        blank = 0
        out.append(re.sub(r"[ \t]{2,}", " ", ln))
    return "\n".join(out).strip()


def scrape_url(url: str) -> Dict:
    """
    Fetch a job-posting URL and return:
        { "url", "title", "description_meta", "text" }
    Raises ``ValueError`` with a user-facing message on any failure.
    """
    url = (url or "").strip()
    if not url.lower().startswith(("http://", "https://")):
        raise ValueError("Enter a full URL starting with http:// or https://")
    parsed = urlparse(url)
    if not parsed.hostname:
        raise ValueError("That doesn't look like a valid URL.")
    _reject_private_host(parsed.hostname)

    try:
        resp = _requests.get(
            url,
            headers={"User-Agent": _USER_AGENT, "Accept": "text/html,*/*"},
            timeout=_REQUEST_TIMEOUT,
            allow_redirects=True,
        )
        resp.raise_for_status()
    except _requests.exceptions.Timeout:
        raise ValueError("The site took too long to respond — try again or paste the text manually.")
    except _requests.exceptions.RequestException:
        raise ValueError("Couldn't reach that page — it may be behind a login or blocking bots. Try pasting the text manually.")

    # Only HTML pages are scrapable.
    ctype = resp.headers.get("Content-Type", "").lower()
    if "html" not in ctype and not resp.text.lstrip().startswith("<"):
        raise ValueError("That page isn't HTML (it may be a PDF). Paste the job text manually instead.")

    parser = _TextExtractor()
    try:
        parser.feed(resp.text)
    except Exception:
        pass  # malformed HTML — keep whatever we collected

    text = _clean_ws(" ".join(parser.parts))
    if not text:
        raise ValueError("Couldn't extract any readable text from that page.")

    # Meta description is useful context (often contains the company name).
    meta = _clean_ws(parser.meta_description) or ""
    body = text[: _MAX_TEXT_CHARS]
    title = html.unescape(parser.title).strip() or parsed.hostname or ""
    return {"url": url, "title": title, "description_meta": meta, "text": body}


def _reject_private_host(hostname: str) -> None:
    """SSRF guard: refuse to fetch internal/private hosts."""
    if hostname.lower() in ("localhost", "localhost.localdomain"):
        raise ValueError("That URL points to a local server — not allowed.")
    try:
        # Resolve and check every address: a public hostname can still resolve
        # to a private IP (DNS rebinding / internal host).
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise ValueError("Couldn't resolve that URL's address.")
    for info in infos:
        ip = info[4][0]
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            continue
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast or addr.is_reserved:
            raise ValueError("That URL points to a private network address — not allowed.")


# ──────────────────────────────────────────────────────────────────────────────
# Heuristic (no-LLM) extraction of company / position / location
# ──────────────────────────────────────────────────────────────────────────────

_COMPANY_LABELS = (
    "company", "employer", "organization", "organisation", "about the company",
    "about us", "who we are", "hiring for", "is hiring", "we are", "at ",
)
_POSITION_LABELS = (
    "position", "job title", "role", "title", "we are looking for",
    "we are hiring", "are you looking for", "apply for",
)
_LOCATION_LABELS = ("location", "based in", "work location", "where", "office")

# Common location tokens (city + country, or remote).
_KNOWN_LOCATIONS = [
    "remote", "hybrid", "on-site", "onsite", "berlin", "munich", "hamburg", "frankfurt",
    "stuttgart", "cologne", "dresden", "leipzig", "dortmund", "essen", "bremen", "hanover",
    "zurich", "geneva", "basel", "lausanne", "vienna", "amsterdam", "rotterdam", "paris",
    "london", "manchester", "oxford", "cambridge", "edinburgh", "dublin", "copenhagen",
    "stockholm", "oslo", "helsinki", "milan", "rome", "turin", "barcelona", "madrid",
    "lisbon", "warsaw", "prague", "budapest", "athens", "istanbul", "tel aviv",
    "new york", "new york city", "san francisco", "los angeles", "seattle", "boston",
    "chicago", "austin", "palo alto", "mountain view", "redmond", "toronto", "vancouver",
    "montreal", "waterloo", "singapore", "hong kong", "tokyo", "seoul", "beijing",
    "shanghai", "shenzhen", "bengaluru", "bangalore", "hyderabad", "pune", "mumbai",
    "delhi", "gurgaon", "chennai", "kolkata", "zurich", "amsterdam", "dubai",
    "abu dhabi", "sydney", "melbourne", "auckland", "cairo", "lagos", "nairobi",
]


def _first_line_after_label(lines: List[str], labels: tuple) -> str:
    """Return the first non-empty line that immediately follows a label line."""
    for i, ln in enumerate(lines):
        low = ln.lower()
        if any(label in low for label in labels):
            for nxt in lines[i + 1 : i + 4]:
                if nxt:
                    return nxt
    return ""


# Captures a proper-noun phrase (up to 5 title-cased words) from the ORIGINAL
# text (case preserved), e.g. "NextGen Robotics Lab" from
# "About the company: NextGen Robotics Lab builds humanoid heads."
_PROPER_NOUN_PHRASE = re.compile(
    r"[A-Z][A-Za-z0-9&.'-]*(?:\s+(?:of|for|&|and)\s+[A-Z][A-Za-z0-9&.'-]*|\s+[A-Z][A-Za-z0-9&.'-]*){0,4}"
)


def _first_proper_phrase(s: str) -> str:
    m = _PROPER_NOUN_PHRASE.search(s)
    if not m:
        return ""
    phrase = m.group(0).strip().rstrip(".")
    if _looks_like_boilerplate(phrase):
        return ""
    return phrase


def _guess_company(lines: List[str], text: str) -> str:
    low = text.lower()

    # "Hiring for X" / "X is hiring" patterns.
    m = re.search(r"(?:hiring for|is hiring|looking for|join)\s+([A-Z][\w&.\- ]{1,40}?)(?:\.|,|\n|$)", low)
    if m:
        return _title_case(m.group(1).strip().rstrip("."))

    # Explicit labels — capture the leading proper-noun phrase only.
    for label in ("about the company", "about us", "who we are", "company:", "employer:", "at "):
        m = re.search(re.escape(label) + r"\s*:?\s*\n?\s*([^\n]{2,80})", text)
        if m:
            phrase = _first_proper_phrase(m.group(1))
            if phrase:
                return phrase

    # First short line that looks like a proper noun (title case, no verb).
    for ln in lines[:12]:
        if _looks_like_company_line(ln):
            return ln
    return ""


def _looks_like_company_line(ln: str) -> bool:
    if not (2 <= len(ln) <= 60):
        return False
    if re.match(r"^(apply|job|career|about|we|our|join|the)\b", ln, re.IGNORECASE):
        return False
    if re.search(r"\b(job|position|role|salary|responsibilities|requirements)\b", ln, re.IGNORECASE):
        return False
    # At least two title-cased words, e.g. "NextGen Robotics Lab" / "Bosch Research".
    words = ln.split()
    titled = sum(1 for w in words if w and w[0].isupper())
    return titled >= 2 and len(words) <= 8 and not ln.endswith((":", "|"))


def _title_case(s: str) -> str:
    """Capitalize the first letter of each significant word (keep acronyms)."""
    out = []
    for w in s.split():
        if not w:
            continue
        if w.isupper() or re.match(r"^[A-Z]{2,}$", w):
            out.append(w)
        else:
            out.append(w[0].upper() + w[1:])
    return " ".join(out)


def _guess_position(lines: List[str], text: str) -> str:
    low = text.lower()

    # Common "Position: X" or "Job Title: X" patterns.
    for label in ("position:", "job title:", "role:", "title:"):
        m = re.search(re.escape(label) + r"\s*([^\n]{2,80})", low)
        if m and not _looks_like_boilerplate(m.group(1)):
            return m.group(1).strip().rstrip(".")

    # "We are looking for a Senior Robotics Engineer" patterns.
    m = re.search(
        r"(?:we are looking for|we're looking for|we are hiring|seeking|looking for)\s+(?:an?|a)?\s+([A-Za-z][\w /&\-]{3,70}?)(?:\.|,|\n|$)",
        low,
    )
    if m:
        return _title_case(m.group(1).strip().rstrip("."))

    # A heading-style line: short, title case, contains role-ish words.
    for ln in lines[:16]:
        if re.match(r"^(?:senior|junior|lead|principal|research|software|phd|student|intern|postdoc|research scientist|data|ml|ai|computer|robotics|machine|engineer|developer|scientist|researcher)\b", ln, re.IGNORECASE) and 3 <= len(ln) <= 80:
            return ln
    return ""


def _guess_location(lines: List[str], text: str) -> str:
    low = text.lower()

    for label in ("location:", "work location:", "based in:", "where:"):
        m = re.search(re.escape(label) + r"\s*([^\n]{2,60})", text)
        if m:
            return m.group(1).strip().rstrip(".")

    if re.search(r"\bremote\b", low):
        return "Remote"

    # "Hybrid · Berlin, Germany" / "Munich, Germany" anywhere in the text.
    m = re.search(
        r"\b((?:[A-Z][a-zA-Z .\-']{2,30}\s+)?[A-Z][a-zA-Z .\-']{2,30}),\s*"
        r"(?:Germany|USA|United States|UK|France|Netherlands|Switzerland|Austria|Spain|Italy|"
        r"Sweden|Denmark|Norway|Finland|Poland|Czech Republic|Ireland|Portugal|Belgium|Canada|"
        r"India|Singapore|Japan|China|Australia|UAE|United Arab Emirates|Netherlands|Luxembourg)\b",
        text,
    )
    if m:
        return m.group(0).strip()

    # Known city names.
    for loc in _KNOWN_LOCATIONS:
        m = re.search(rf"\b{re.escape(loc)}\b", low)
        if m:
            idx = max(0, m.start() - 40)
            snippet = text[idx : m.end() + 20].strip()
            # Prefer "City, Country" style snippets when present.
            city_country = re.search(
                r"\b[A-Z][a-zA-Z .\-']{2,40},\s*[A-Z][a-zA-Z .\-']{2,30}\b", snippet
            )
            return city_country.group(0) if city_country else _title_case(loc)
    return ""


def _looks_like_boilerplate(s: str) -> bool:
    low = s.lower().strip()
    if not low:
        return True
    boiler = (
        "about the company", "about us", "who we are", "we are", "our team",
        "we offer", "what we offer", "apply now", "job description", "overview",
        "the role", "the position", "responsibilities", "requirements",
        "qualifications", "benefits", "salary", "what you will do",
    )
    return low in boiler or any(low.startswith(b) for b in boiler)


def heuristic_extract(text: str) -> Dict:
    """
    Best-effort extraction of company / position / location from raw text —
    no LLM required. Always returns the full original text as ``description``.
    """
    text = (text or "").strip()
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return {
        "company": _guess_company(lines, text),
        "position": _guess_position(lines, text),
        "location": _guess_location(lines, text),
        "description": text,
    }
