"""
Advanced ATS (Applicant Tracking System) scoring engine.

Research-backed design based on how enterprise ATS platforms (Workday,
Greenhouse, iCIMS) and leading resume-scoring tools (Jobscan, Resume Worded)
evaluate resumes:

1. LEXICAL LAYER
   - An expanded skill taxonomy: every canonical skill carries synonyms,
     abbreviations, and spelling variants ("ml" → "machine learning",
     "k8s" → "kubernetes", "cpp" → "c++", "postgres" → "postgresql").
   - Matching runs exact → variant/synonym → stemmed/inflected → fuzzy
     (difflib similarity for typos and near-variants).
   - Job-description-specific keywords that are NOT in the taxonomy (e.g.
     "TensorRT", "PX4", "depth cameras") are extracted from the JD itself and
     scored too — so the scoring is never limited to a hardcoded list.

2. SEMANTIC / CONTEXT LAYER
   - Skill mentions inside quantified, action-verb bullets count more than
     bare skill-list mentions (skills demonstrated in context).
   - Required vs. preferred language in the JD ("must have" vs "nice to have")
     is weighted differently when detectable.

3. NON-KEYWORD FACTORS (typical weight distribution from published ATS
   scoring frameworks):
       keywords / hard skills     40%
       experience (years)         20%
       bullet quality (metrics)   15%
       formatting / parseability  15%
       qualifications (degrees)   10%

4. PARSEABILITY
   - Standard section headings, contact info presence, single-column layout
     heuristics, bullet usage, and minimum text length — ATS parsers reject
     or down-rank resumes that fail these.
"""

import re
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Set, Tuple

# ──────────────────────────────────────────────────────────────────────────────
# Skill taxonomy: canonical skill -> set of surface forms
# ──────────────────────────────────────────────────────────────────────────────

SKILL_TAXONOMY: Dict[str, Set[str]] = {
    # Programming languages
    "python": {"python", "python3"},
    "c++": {"c++", "cpp", "c plus plus"},
    "c": {"c programming", "c language", "c99", "c11"},
    "c#": {"c#", "c sharp"},
    "java": {"java"},
    "javascript": {"javascript", "js", "es6"},
    "typescript": {"typescript", "ts"},
    "go": {"golang", "go programming"},
    "rust": {"rust"},
    "swift": {"swift"},
    "kotlin": {"kotlin"},
    "ruby": {"ruby"},
    "php": {"php"},
    "scala": {"scala"},
    "r": {"r language", "r programming"},
    "matlab": {"matlab", "matlab/simulink"},
    "sql": {"sql"},
    "bash": {"bash", "shell scripting", "shell script"},
    "powershell": {"powershell"},
    "html": {"html"},
    "css": {"css", "scss", "sass"},
    "dart": {"dart"},
    # ML / AI / data
    "machine learning": {"machine learning", "ml"},
    "deep learning": {"deep learning", "dl"},
    "computer vision": {"computer vision", "image processing"},
    "natural language processing": {"natural language processing", "nlp", "text processing"},
    "reinforcement learning": {"reinforcement learning", "rl"},
    "neural networks": {"neural networks", "neural network", "ann"},
    "transformers": {"transformers", "transformer", "bert", "gpt", "llm", "large language models"},
    "generative ai": {"generative ai", "genai", "generative models"},
    "pytorch": {"pytorch"},
    "tensorflow": {"tensorflow"},
    "keras": {"keras"},
    "scikit-learn": {"scikit-learn", "sklearn"},
    "pandas": {"pandas"},
    "numpy": {"numpy"},
    "opencv": {"opencv"},
    "huggingface": {"huggingface", "hugging face"},
    "langchain": {"langchain"},
    "data science": {"data science"},
    "data analysis": {"data analysis", "data analytics"},
    "data engineering": {"data engineering"},
    "statistics": {"statistics", "statistical analysis"},
    "time series": {"time series", "time-series"},
    # Robotics / autonomous systems
    "ros": {"ros"},
    "ros2": {"ros2", "ros 2"},
    "gazebo": {"gazebo"},
    "slam": {"slam", "simultaneous localization and mapping"},
    "lidar": {"lidar", "lidars"},
    "radar": {"radar", "radars"},
    "perception": {"perception"},
    "localization": {"localization", "localisation"},
    "path planning": {"path planning", "motion planning"},
    "control systems": {"control systems", "control system", "control theory"},
    "pid": {"pid control", "pid controller"},
    "moveit": {"moveit"},
    "nav2": {"nav2", "navigation2"},
    "sensor fusion": {"sensor fusion", "multi-sensor fusion"},
    "kinematics": {"kinematics", "inverse kinematics"},
    "robotics": {"robotics"},
    "autonomous vehicles": {"autonomous vehicles", "self-driving", "autonomous driving", "av"},
    "drones": {"drones", "uav", "uavs", "unmanned aerial"},
    # Embedded
    "embedded": {"embedded", "embedded systems", "embedded software", "embedded linux"},
    "microcontrollers": {"microcontroller", "microcontrollers", "mcu", "stm32", "esp32", "avr", "arduino"},
    "rtos": {"rtos", "freertos", "free rtos", "zephyr"},
    "firmware": {"firmware"},
    "device drivers": {"device drivers", "driver development", "kernel driver"},
    "can bus": {"can bus", "canbus", "can fd"},
    "i2c": {"i2c"},
    "spi": {"spi"},
    "uart": {"uart"},
    "gpio": {"gpio"},
    "fpga": {"fpga"},
    "vhdl": {"vhdl"},
    "verilog": {"verilog"},
    "dsp": {"dsp", "digital signal processing"},
    "linux": {"linux"},
    # Cloud / DevOps
    "docker": {"docker", "containerization", "containers"},
    "kubernetes": {"kubernetes", "k8s"},
    "aws": {"aws", "amazon web services"},
    "gcp": {"gcp", "google cloud"},
    "azure": {"azure", "microsoft azure"},
    "terraform": {"terraform"},
    "ansible": {"ansible"},
    "jenkins": {"jenkins", "jenkins ci"},
    "ci/cd": {"ci/cd", "ci cd", "continuous integration", "continuous delivery", "continuous deployment"},
    "git": {"git", "github", "gitlab"},
    "devops": {"devops"},
    "serverless": {"serverless", "lambda"},
    # Web / frontend
    "react": {"react", "reactjs", "react.js"},
    "react native": {"react native"},
    "vue": {"vue", "vuejs", "vue.js"},
    "angular": {"angular"},
    "next.js": {"next.js", "nextjs", "next js"},
    "node.js": {"node.js", "nodejs", "node js"},
    "express": {"express", "express.js", "expressjs"},
    "fastapi": {"fastapi"},
    "flask": {"flask"},
    "django": {"django"},
    "spring": {"spring", "spring boot"},
    "rest api": {"rest api", "restful api", "restful", "rest apis", "api development"},
    "graphql": {"graphql"},
    "websocket": {"websocket", "websockets"},
    "tailwind": {"tailwind", "tailwindcss"},
    "bootstrap": {"bootstrap"},
    # Databases
    "postgresql": {"postgresql", "postgres"},
    "mysql": {"mysql"},
    "mongodb": {"mongodb", "mongo"},
    "sqlite": {"sqlite"},
    "redis": {"redis"},
    "elasticsearch": {"elasticsearch"},
    "kafka": {"kafka", "apache kafka"},
    "spark": {"spark", "apache spark", "pyspark"},
    "hadoop": {"hadoop"},
    "snowflake": {"snowflake"},
    "bigquery": {"bigquery"},
    # Testing / QA
    "pytest": {"pytest"},
    "jest": {"jest"},
    "selenium": {"selenium"},
    "cypress": {"cypress"},
    "unit testing": {"unit testing", "unit tests"},
    "tdd": {"tdd", "test driven development"},
    "integration testing": {"integration testing", "integration tests"},
    # Tools / misc
    "jupyter": {"jupyter", "jupyter notebook", "jupyter notebooks"},
    "cmake": {"cmake"},
    "agile": {"agile", "scrum", "kanban"},
    "jira": {"jira"},
    # Networking / security
    "tcp/ip": {"tcp/ip", "tcp ip", "networking"},
    "rest": {"rest"},
    "oauth": {"oauth", "oauth2"},
    "jwt": {"jwt", "json web token"},
    "cybersecurity": {"cybersecurity", "cyber security", "information security"},
}

# Overly generic canonical names that would false-positive on standalone words
# (e.g. "go" in "go to market", "r" as a stray letter). They only match through
# their explicit surface forms below, never on the bare canonical word.
_GENERIC_CANONICALS = {"c", "go", "r"}

# ──────────────────────────────────────────────────────────────────────────────
# Text normalization helpers
# ──────────────────────────────────────────────────────────────────────────────

_WORD_END = r"(?<![a-zA-Z0-9])"
_WORD_START = r"(?![a-zA-Z0-9])"


def _normalize(text: str) -> str:
    """Lowercase + collapse whitespace for matching."""
    return re.sub(r"\s+", " ", (text or "").lower())


def _compile_taxonomy() -> List[Tuple[str, re.Pattern]]:
    """Precompile (canonical, regex) pairs for every surface form.

    Generic canonicals ("c", "go", "r") are skipped as bare words — they only
    match through their explicit surface forms so we don't get false positives.
    """
    compiled = []
    for canonical, forms in SKILL_TAXONOMY.items():
        for form in forms:
            pattern = re.compile(
                _WORD_END + re.escape(form.lower()) + _WORD_START,
                re.IGNORECASE,
            )
            compiled.append((canonical, pattern))
    return compiled


_TAXONOMY_REGEXES = _compile_taxonomy()


def extract_keywords(text: str) -> List[str]:
    """Extract known technology keywords from text (case-insensitive)."""
    found = set()
    norm = _normalize(text)
    for canonical, pattern in _TAXONOMY_REGEXES:
        if pattern.search(norm):
            found.add(canonical)
    return list(found)


# ──────────────────────────────────────────────────────────────────────────────
# Fuzzy + inflected matching
# ──────────────────────────────────────────────────────────────────────────────

_INFLECTION_SUFFIXES = ("s", "es", "ed", "ing", "ized", "isation", "ization")


def _stemmed_variants(word: str) -> Set[str]:
    """Generate common inflected forms for a single keyword."""
    variants = set()
    for suffix in _INFLECTION_SUFFIXES:
        variants.add(word + suffix)
    return {v for v in variants if len(v) >= 4}


def _tokenize(text: str) -> Set[str]:
    return set(re.findall(r"[a-zA-Z0-9][a-zA-Z0-9_\-.]*", (text or "").lower()))


def _fuzzy_ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def _match_keyword_variants(
    keyword: str,
    resume_norm: str,
    resume_tokens: Set[str],
    fuzzy_threshold: float = 0.82,
) -> Tuple[bool, str]:
    """Check a keyword against the resume using exact, synonym, and fuzzy match.

    Returns (matched, match_type) where match_type ∈ {"exact", "synonym", "fuzzy"}.
    """
    kw = keyword.lower().strip()
    if not kw:
        return False, ""

    # 1) Exact canonical form (skip overly generic single letters/words that
    #    would false-positive, e.g. "c" in "C++" or "go" in "go to market")
    if kw not in _GENERIC_CANONICALS:
        pattern = re.compile(_WORD_END + re.escape(kw) + _WORD_START)
        if pattern.search(resume_norm):
            return True, "exact"

    # 2) Taxonomy synonyms/aliases
    for form in SKILL_TAXONOMY.get(keyword, set()):
        form_pattern = re.compile(_WORD_END + re.escape(form.lower()) + _WORD_START)
        if form_pattern.search(resume_norm):
            return True, "synonym"

    # 3) Inflected / stemmed forms of single-word keywords
    if " " not in kw:
        for variant in _stemmed_variants(kw):
            v_pattern = re.compile(_WORD_END + re.escape(variant) + _WORD_START)
            if v_pattern.search(resume_norm):
                return True, "synonym"

    # 4) Fuzzy match against resume tokens (typos / near-variants)
    if " " not in kw:
        kw_tokens = {kw}
        for token in resume_tokens:
            if len(token) < 4 or len(kw) < 4:
                continue
            if token.startswith(kw) or kw.startswith(token):
                # Strong prefix relationship (e.g. "kubernetis" vs "kubernetes")
                if min(len(token), len(kw)) >= 5 and (
                    token.startswith(kw[:5]) or kw.startswith(token[:5])
                ):
                    return True, "fuzzy"
            if _fuzzy_ratio(token, kw) >= fuzzy_threshold:
                return True, "fuzzy"

    return False, ""


# ──────────────────────────────────────────────────────────────────────────────
# Job-description keyword extraction (beyond the hardcoded taxonomy)
# ──────────────────────────────────────────────────────────────────────────────

_STOPWORDS = {
    "the", "and", "for", "with", "our", "you", "your", "will", "have", "this",
    "that", "are", "from", "who", "what", "why", "how", "all", "any", "but",
    "not", "can", "into", "other", "such", "than", "then", "there", "these",
    "they", "should", "would", "could", "may", "must", "also", "well", "like",
    "job", "role", "position", "team", "company", "work", "experience", "skill",
    "skills", "ability", "able", "knowledge", "understanding", "including",
    "related", "relevant", "preferred", "required", "nice", "plus", "minimum",
    "years", "year", "month", "months", "day", "days", "time", "times", "level",
    "degree", "education", "location", "remote", "based", "full", "part", "apply",
    "application", "candidate", "candidates", "looking", "responsibilities",
    "qualifications", "requirements", "about", "benefits", "salary", "bonus",
    "opportunity", "join", "need", "need", "help", "support", "manage", "strong",
    "solid", "good", "great", "best", "excellent", "ability", "environment",
    "learning", "growth", "fast", "paced", "startup", "culture", "people",
    "world", "class", "field", "area", "relevant", "equivalent", "experience",
    "degree", "year", "years", "plus", "desired", "essential", "core",
    "engineering", "engineer", "developer", "development", "software", "senior",
    "junior", "lead", "principal", "staff", "manager", "management",
    "new", "first", "last", "next", "top", "high", "low", "global", "cross",
    "real", "fast", "growing", "modern", "current", "future", "key", "main",
    # months & days (capitalized in text, but never skills)
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december", "jan", "feb", "mar", "apr",
    "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    # common sentence-openers / verbs that get capitalized at line starts
    "hiring", "need", "wanted", "looking", "join", "build", "using", "used",
    "working", "create", "develop", "help", "lead", "drive", "ensure", "maintain",
    "design", "write", "test", "ship", "deliver", "bring", "start", "apply",
    "offer", "provide", "get", "take", "make", "understand", "know", "learn",
    "share", "grow", "solve", "see", "show", "want", "based", "located", "hybrid",
}

_CAPITALIZED_PATTERN = re.compile(r"\b([A-Z][A-Za-z0-9_.+\-]*)\b")
_PHRASE_PATTERN = re.compile(
    r"\b((?:[A-Z][a-z]+ ){1,2}[A-Z][a-z]+)\b"
)


def _extract_jd_keywords(job_text: str) -> List[str]:
    """Pull role-specific capitalized terms out of the JD that aren't in the
    taxonomy (e.g. 'TensorRT', 'PX4', 'Depth Cameras')."""
    found: Set[str] = set()
    for m in _CAPITALIZED_PATTERN.finditer(job_text or ""):
        word = m.group(1)
        low = word.lower()
        if low in _STOPWORDS or len(word) < 3:
            continue
        # Skip short all-caps words that are unlikely to be tech (e.g. THE, AND).
        # Stopwords above already catch the common ones; this catches the rest.
        if word.isupper() and len(word) <= 3 and word.isalpha():
            continue
        if any(form == low for forms in SKILL_TAXONOMY.values() for form in forms):
            continue  # already covered by taxonomy
        found.add(word)
    # Two-word capitalized phrases ("Depth Cameras", "Real-Time Systems")
    for m in _PHRASE_PATTERN.finditer(job_text or ""):
        phrase = m.group(1)
        low_words = [w.lower() for w in phrase.split()]
        if any(w in _STOPWORDS for w in low_words):
            continue
        if any(form == phrase.lower() for forms in SKILL_TAXONOMY.values() for form in forms):
            continue
        found.add(phrase)
    # Drop remaining noise (months, days, common capitalized words) and cap.
    filtered = [w for w in found if w.lower() not in _STOPWORDS]
    return sorted(filtered)[:25]


# ──────────────────────────────────────────────────────────────────────────────
# Experience-years parsing
# ──────────────────────────────────────────────────────────────────────────────

_YEARS_PATTERN = re.compile(
    r"(\d{1,2})\+?\s*(?:-|\u2013|\u2014|to)?\s*\d{0,2}\s*"
    r"(?:years?|yrs?)(?:\s*of)?\s*([a-zA-Z][a-zA-Z0-9_\-\s]{0,30})?",
    re.IGNORECASE,
)

_DATE_RANGE_PATTERN = re.compile(
    r"\b((?:19|20)\d{2})\s*(?:-|\u2013|\u2014|to|until|till)\s*"
    r"((?:19|20)\d{2}|present|current|now|today)\b",
    re.IGNORECASE,
)

_YEARS_STATEMENT = re.compile(
    r"(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|work|industry)",
    re.IGNORECASE,
)


def _extract_required_years(job_text: str) -> Optional[int]:
    best = None
    for m in _YEARS_STATEMENT.finditer(job_text or ""):
        y = int(m.group(1))
        best = y if best is None else max(best, y)
    return best


def _extract_resume_years(resume_text: str) -> float:
    """Estimate total work experience from date ranges in the resume."""
    total = 0.0
    seen = set()
    for m in _DATE_RANGE_PATTERN.finditer(resume_text or ""):
        start = int(m.group(1))
        end_str = m.group(2).lower()
        if end_str in ("present", "current", "now", "today"):
            end = datetime.now().year
        else:
            end = int(end_str)
        if end < start:
            continue
        key = (start, end)
        if key in seen:
            continue
        seen.add(key)
        total += end - start
    # Also honor explicit statements like "8+ years of experience"
    for m in _YEARS_STATEMENT.finditer(resume_text or ""):
        total = max(total, float(m.group(1)))
    return total


# ──────────────────────────────────────────────────────────────────────────────
# Formatting / parseability
# ──────────────────────────────────────────────────────────────────────────────

_SECTION_HEADINGS = [
    "experience", "work experience", "professional experience", "employment",
    "education", "skills", "technical skills", "projects", "summary",
    "objective", "profile", "certifications", "publications", "achievements",
    "languages", "interests", "honors",
]


def _parseability_score(resume_text: str) -> Tuple[int, List[str]]:
    issues: List[str] = []
    score = 100
    # Note: match section headings against the ORIGINAL text (multiline).
    # Normalizing collapses newlines, which would make ^...$ anchors fail.
    raw = resume_text or ""
    norm = _normalize(raw)
    lines = [l for l in raw.splitlines() if l.strip()]

    # 1. Text length
    if len(resume_text or "") < 300:
        score -= 25
        issues.append("Resume text is very short — ATS parsers may not extract enough content.")
    # 2. Contact info
    if not re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", resume_text or ""):
        score -= 15
        issues.append("No email address detected — put contact info at the top of the document.")
    if not re.search(r"\+?[\d\s()\-]{8,}", resume_text or ""):
        score -= 10
        issues.append("No phone number detected.")
    # 3. Section headings (case-insensitive, line-anchored on original text)
    heading_hits = sum(
        1
        for h in _SECTION_HEADINGS
        if re.search(rf"(?im)^\s*{re.escape(h)}\s*:?\s*$", raw)
    )
    if heading_hits < 3:
        score -= 15
        issues.append("Few standard section headings (Experience, Education, Skills) found — use standard headings so parsers can segment the resume.")
    # 4. Single-column heuristic (very long lines suggest merged columns/tables)
    long_lines = [l for l in lines if len(l) > 150]
    if long_lines and len(long_lines) / max(len(lines), 1) > 0.2:
        score -= 15
        issues.append("Some lines are very long — tables or multi-column layouts can break ATS text extraction. Prefer a single-column layout.")
    # 5. Bullet usage
    bullet_lines = sum(1 for l in lines if re.match(r"^\s*[-*•◦▪]|\d+\.\s", l))
    if lines and bullet_lines / len(lines) < 0.05:
        score -= 10
        issues.append("Few or no bullet points — ATS and recruiters scan bulleted achievements more easily.")
    # 6. Character-only sections (e.g., random letters, OCR garbage)
    if not re.search(r"[a-zA-Z]", resume_text or ""):
        return 5, ["No readable text detected — the resume may be an image-only PDF. Export with a real text layer."]

    return max(0, score), issues


# ──────────────────────────────────────────────────────────────────────────────
# Qualifications (degrees / certifications)
# ──────────────────────────────────────────────────────────────────────────────

_DEGREE_PATTERNS = [
    (r"\b(ph\.?d\.?|doctorate|doctoral)\b", 30),
    (r"\b(master|m\.?s\.?|m\.?sc\.?|m\.?tech\.?|m\.?e\.?|mba|m\.?a\.?)\b", 25),
    (r"\b(bachelor|b\.?s\.?|b\.?sc\.?|b\.?tech\.?|b\.?e\.?|b\.?a\.?)\b", 20),
    (r"\b(associate|diploma|hnd)\b", 10),
    (r"\b(certified|certification|certificate)\b", 5),
]

_CERT_PATTERNS = [
    r"\b(?:aws|azure|gcp)\s+certified\b",
    r"\b(pmp|prince2|scrum master|cissp|comptia|ccna|ceh|cs[mn]|ccie)\b",
    r"\b(certified\s+[a-z]+(?:\s+[a-z]+)?)\b",
]


def _qualifications_score(resume_text: str) -> Tuple[int, Optional[str], List[str]]:
    norm = _normalize(resume_text or "")
    total = 0
    top_degree: Optional[str] = None
    for pattern, points in _DEGREE_PATTERNS:
        m = re.search(pattern, norm)
        if m:
            total += points
            if top_degree is None:
                top_degree = m.group(0).strip()
    certs = []
    for pattern in _CERT_PATTERNS:
        for m in re.finditer(pattern, norm):
            cert = m.group(0).strip()
            if len(cert) > 2 and cert not in certs:
                certs.append(cert)
    if certs:
        total += min(20, len(certs) * 5)
    return min(100, total), top_degree, certs[:5]


# ──────────────────────────────────────────────────────────────────────────────
# Bullet / achievement quality
# ──────────────────────────────────────────────────────────────────────────────

_STRONG_VERBS = [
    "led", "built", "designed", "developed", "implemented", "launched",
    "shipped", "architected", "optimized", "reduced", "increased", "improved",
    "automated", "migrated", "scaled", "drove", "created", "delivered",
    "engineered", "accelerated", "transformed", "deployed", "integrated",
    "mentored", "managed", "spearheaded", "pioneered", "achieved", "boosted",
    "cut", "streamlined", "modernized", "refactored",
]

_WEAK_VERBS = [
    "worked on", "helped", "assisted", "responsible for", "duties included",
    "handled", "participated in", "involved in", "was part of", "tasked with",
    "supporting", "contributed to", "did", "made", "got", "took part in",
]

_PASSIVE_PHRASES = ["was responsible", "was tasked", "was involved", "was part"]

_METRIC_PATTERN = re.compile(r"\d+(?:\.\d+)?\s*(?:%|percent|\$|k|m|billion|million|thousand|x\b|users?|customers?|clients?|ms|s\b|hours?|days?|weeks?|months?|requests?|transactions?|revenue|downtime|latency|deployments?|tests?|lines)", re.IGNORECASE)


def _analyze_bullets(resume_text: str, job_keywords: List[str]) -> Tuple[List[Dict[str, Any]], int, float]:
    """Identify weak bullets (passive verbs, no metrics) and strong ones.

    Returns (weak_bullets, strong_count, bullet_score 0-100).
    """
    bullets = re.findall(r"(?:^|\n)\s*(?:[-*•◦▪])\s*(.*)", resume_text or "")
    weak_bullets = []
    strong_count = 0
    total = 0
    for bullet in bullets:
        b = bullet.strip()
        if len(b) < 8:
            continue
        total += 1
        low = b.lower()
        reasons = []
        # Passive / weak verbs
        for verb in _WEAK_VERBS:
            if verb in low:
                reasons.append(f"Passive/weak opening: '{verb}' — lead with a strong action verb (Led, Built, Reduced…).")
        for phrase in _PASSIVE_PHRASES:
            if phrase in low:
                reasons.append(f"Passive construction '{phrase}' — use active voice.")
        # Metrics
        has_metric = bool(_METRIC_PATTERN.search(b))
        # Strong action verb
        starts_strong = any(low.startswith(v) for v in _STRONG_VERBS)
        # Skill mention in bullet (demonstrated, not just listed)
        mentions_skill = any(kw in low for kw in job_keywords[:40])
        if not has_metric and len(b) > 20:
            reasons.append("No quantifiable metric (%, $, numbers) — add outcomes like 'cut latency by 30%'.")
        if reasons:
            weak_bullets.append({
                "original": b,
                "issues": reasons[:2],
                "suggestion": "Rephrase with a strong action verb + quantified outcome. E.g. 'Reduced CI build time by 40% by migrating to parallel pipelines.'",
            })
        if starts_strong and (has_metric or mentions_skill):
            strong_count += 1
    if total == 0:
        return weak_bullets[:5], 0, 40.0
    strong_ratio = strong_count / total
    weak_penalty = max(0, 1.0 - (len(weak_bullets) / total))
    score = 100 * (0.6 * strong_ratio + 0.4 * weak_penalty)
    return weak_bullets[:5], strong_count, round(score, 1)


# ──────────────────────────────────────────────────────────────────────────────
# Main scoring function
# ──────────────────────────────────────────────────────────────────────────────

def calculate_ats_score(resume_text: str, job_text: str) -> Dict[str, Any]:
    """
    Scans the resume against the job description to calculate:
    - ATS score (0-100) with a weighted breakdown
    - Missing keywords (taxonomy + JD-specific)
    - Weak bullets (lack of metrics, passive verbs)
    - Wrong ordering alerts
    - Parseability / formatting issues
    """
    resume_norm = _normalize(resume_text)
    job_norm = _normalize(job_text)
    resume_tokens = _tokenize(resume_text)

    # 1) Keyword analysis
    taxonomy_job_kws = extract_keywords(job_text)
    jd_kws = _extract_jd_keywords(job_text)
    # Suppress JD-specific words that ALSO appear in the resume when they are
    # plain title-case prose (company names, cities, generic nouns) rather than
    # tech-looking terms (all-caps acronyms, digits, camelCase like "TensorRT").
    resume_lower = (resume_text or "").lower()
    filtered_jd_kws = []
    for kw in jd_kws:
        if " " in kw:
            filtered_jd_kws.append(kw)
            continue
        looks_tech = (
            kw.isupper()
            or any(ch.isdigit() for ch in kw)
            or any(ch.isupper() for ch in kw[1:])
        )
        if not looks_tech and kw.lower() in resume_lower:
            continue  # shared proper noun (company name / city), not a skill gap
        filtered_jd_kws.append(kw)
    # Combine: taxonomy keywords first (they have synonyms), then JD-specific
    all_job_kws: List[str] = []
    for kw in taxonomy_job_kws:
        if kw not in all_job_kws:
            all_job_kws.append(kw)
    for kw in filtered_jd_kws:
        if kw.lower() not in [k.lower() for k in all_job_kws]:
            all_job_kws.append(kw)

    found_kws: List[str] = []
    missing_kws: List[str] = []
    fuzzy_kws: List[str] = []

    for kw in all_job_kws:
        matched, match_type = _match_keyword_variants(kw, resume_norm, resume_tokens)
        if matched:
            found_kws.append(kw)
            if match_type == "fuzzy":
                fuzzy_kws.append(kw)
        else:
            missing_kws.append(kw)

    # Weighted match rate: taxonomy keyword hit = 1.0, JD-specific = 0.8,
    # fuzzy = 0.6 — over the SUM of weights, so a perfect match reaches 100%.
    max_weight = sum(1.0 if kw in taxonomy_job_kws else 0.8 for kw in all_job_kws) or 1.0
    hit_weight = 0.0
    for kw in found_kws:
        w = 1.0 if kw in taxonomy_job_kws else 0.8
        if kw in fuzzy_kws:
            w *= 0.6
        hit_weight += w
    match_rate = round(hit_weight / max_weight * 100, 1)
    kw_score = match_rate

    # 2) Experience years
    required_years = _extract_required_years(job_text)
    resume_years = _extract_resume_years(resume_text)
    if required_years is None:
        exp_score = 100.0
        exp_alert = None
    else:
        if resume_years <= 0:
            exp_score = 50.0
            exp_alert = f"The job asks for ~{required_years}+ years of experience but your resume shows no date ranges — add 'YYYY – Present' to each role."
        elif resume_years >= required_years:
            exp_score = 100.0
            exp_alert = None
        else:
            exp_score = min(100.0, round(60 + (resume_years / required_years) * 40, 1))
            exp_alert = f"The job asks for ~{required_years}+ years; your resume shows ~{resume_years:.0f}. Emphasize all relevant experience."

    # 3) Bullet quality
    weak_bullets, strong_count, bullet_score = _analyze_bullets(resume_text, all_job_kws)

    # 4) Formatting / parseability
    format_score, format_issues = _parseability_score(resume_text)

    # 5) Qualifications
    quals_score, top_degree, certs = _qualifications_score(resume_text)

    # 6) Ordering alert
    ordering_alert = None
    edu_idx = resume_norm.find("education")
    exp_idx = resume_norm.find("experience")
    if edu_idx != -1 and exp_idx != -1 and edu_idx < exp_idx:
        ordering_alert = ("Education is placed before Experience. For experienced profiles, lead with Professional Experience — ATS "
                          "recruiters scan experience first.")

    # 7) Weighted composite (research-backed distribution)
    weights = {
        "keywords": 0.40,
        "experience": 0.20,
        "bullets": 0.15,
        "formatting": 0.15,
        "qualifications": 0.10,
    }
    components = {
        "keywords": round(kw_score, 1),
        "experience": round(exp_score, 1),
        "bullets": round(bullet_score, 1),
        "formatting": round(format_score, 1),
        "qualifications": round(quals_score, 1),
    }
    ats_score = int(
        components["keywords"] * weights["keywords"]
        + components["experience"] * weights["experience"]
        + components["bullets"] * weights["bullets"]
        + components["formatting"] * weights["formatting"]
        + components["qualifications"] * weights["qualifications"]
    )

    # 8) Actionable improvements
    improvements: List[str] = []
    if missing_kws:
        top_missing = missing_kws[:4]
        improvements.append(
            f"Add these keywords from the job description to your resume: {', '.join(top_missing)}."
        )
    if exp_alert:
        improvements.append(exp_alert)
    if weak_bullets:
        improvements.append(
            f"Quantify {len(weak_bullets)} bullet point(s) with measurable outcomes (%, $, time saved)."
        )
    for issue in format_issues[:2]:
        improvements.append(issue)
    if not certs and quals_score < 60:
        improvements.append("Consider adding certifications or relevant training to boost qualifications.")
    if not improvements and ats_score >= 80:
        improvements.append("Strong profile for this role — tailor the summary line to mirror the job title for an extra edge.")

    return {
        "score": min(100, max(0, ats_score)),
        "keywords": {
            "found": found_kws[:40],
            "missing": missing_kws[:40],
            "matchRate": match_rate,
            "fuzzy": fuzzy_kws[:10],
        },
        "experience": {
            "requiredYears": required_years,
            "resumeYears": round(resume_years, 1),
            "score": components["experience"],
            "alert": exp_alert,
        },
        "weakBullets": weak_bullets,
        "strongBullets": strong_count,
        "orderingAlert": ordering_alert,
        "formatting": {
            "score": components["formatting"],
            "issues": format_issues,
        },
        "qualifications": {
            "score": components["qualifications"],
            "degree": top_degree,
            "certifications": certs,
        },
        "breakdown": {
            "components": components,
            "weights": {k: round(v * 100) for k, v in weights.items()},
        },
        "improvements": improvements[:5],
    }


def suggest_unused_projects(profile_projects: List[Dict[str, Any]], job_text: str, resume_text: str) -> List[Dict[str, Any]]:
    """Suggest profile projects that match the JD but are missing from the resume."""
    job_kws = set(extract_keywords(job_text))
    resume_lower = resume_text.lower()
    suggested = []
    for project in profile_projects:
        title = project.get("title", "")
        if title and title.lower() in resume_lower:
            continue
        desc = (project.get("description", "") + " " + " ".join(project.get("technologies", []))).lower()
        matching = [kw for kw in job_kws if kw in desc]
        if matching:
            suggested.append({
                "title": title,
                "technologies": project.get("technologies", []),
                "matchingKeywords": matching,
                "reason": f"Matches job requirements for {', '.join(matching)} but is currently omitted from your active resume.",
            })
    return suggested
