"""
Multi-Provider LLM Generator for Job Assistant Copilot.

Provider priority order (configurable via settings):
  1. Gemini  – rotates through a list of API keys AND models on rate-limit / error.
  2. NVIDIA NIM – OpenAI-compatible endpoint, rotates through NIM API keys and models.
  3. Ollama  – local LLM, used as final fallback or when explicitly selected.

When a Gemini key+model pair hits a rate-limit (429) or quota error the router
automatically advances to the next key, then the next model, before giving up and
trying the next provider.  Same logic applies to NIM keys/models.
"""

import json
import os
import re
import time
from typing import List, Dict, Any, Optional

# ── Gemini (new google-genai SDK) ───────────────────────────────────────────
try:
    from google import genai as _genai
    from google.genai import types as _genai_types
    _GENAI_AVAILABLE = True
except ImportError:
    _genai = None
    _genai_types = None
    _GENAI_AVAILABLE = False

# ── NVIDIA NIM (OpenAI-compatible) ────────────────────────────────────────────
try:
    from openai import OpenAI as _OpenAI
    _OPENAI_AVAILABLE = True
except ImportError:
    _OpenAI = None
    _OPENAI_AVAILABLE = False

# ── Ollama ────────────────────────────────────────────────────────────────────
try:
    import requests as _requests
    _REQUESTS_AVAILABLE = True
except ImportError:
    _requests = None
    _REQUESTS_AVAILABLE = False

# ══════════════════════════════════════════════════════════════════════════════
# MOCK DATA (instant high-fidelity experience when no LLM is available)
# ══════════════════════════════════════════════════════════════════════════════
MOCK_ANALYSIS = {
    "company": "NextGen Robotics Lab",
    "position": "Computer Vision & Robotics Researcher",
    "location": "Munich, Germany",
    "skills": [
        {"name": "Computer Vision", "level": 5},
        {"name": "ROS2", "level": 5},
        {"name": "Python", "level": 5},
        {"name": "Docker", "level": 4},
        {"name": "Deep Learning", "level": 5},
        {"name": "German B2", "level": 2},
        {"name": "Publications", "level": 4},
        {"name": "C++", "level": 4},
    ],
    "experience": "Master's degree or PhD in Robotics, CS, or related field.",
    "researchTopics": ["Humanoid Head Control", "Social Robotics", "Real-time Object Detection"],
    "keywords": ["Computer Vision", "ROS2", "MoveIt", "Gaze Control", "Embedded Control"],
    "softSkills": ["Interdisciplinary Collaboration", "Scientific Writing"],
    "responsibilities": [
        "Develop vision-guided control algorithms for a humanoid robot head.",
        "Implement real-time visual tracking and gaze control system.",
        "Publish results in leading robotics conferences (IROS, ICRA).",
    ],
    "hiddenRequirements": "Ability to quickly pick up hardware-level driver development.",
}

MOCK_SUITABILITY = {
    "overallMatch": 86,
    "technical": 92,
    "research": 81,
    "leadership": 75,
    "communication": 88,
    "strengths": [
        {"title": "Humanoid Robotics", "desc": "Substantial experience developing facial and physical humanoid mechanisms."},
        {"title": "AI & Computer Vision", "desc": "Solid foundation in deep learning and image processing."},
        {"title": "Publications", "desc": "Existing record of writing and publishing peer-reviewed research papers."},
    ],
    "weaknesses": [
        {"title": "ROS2 production experience", "desc": "Mostly academic ROS experience, missing enterprise deployment."},
        {"title": "C++ implementation speed", "desc": "Intermediate C++, slower execution compared to Python."},
        {"title": "German B2", "desc": "Position mentions German B2 preferred; candidate is at B1/basic level."},
    ],
}

MOCK_GAPS = [
    {
        "skill": "ROS2 Production Experience",
        "effort": "20 hours",
        "resources": ["ROS2 Navigation2 Tutorials", "MoveIt2 Motion Planning", "ROS2 Humble Documentation"],
        "difficulty": "Medium",
        "impact": "High",
    },
    {
        "skill": "German B2 Language Proficiency",
        "effort": "120 hours",
        "resources": ["Goethe-Institut B2 Course", "DW Learn German Series", "Language Exchange Meetups"],
        "difficulty": "Hard",
        "impact": "Medium",
    },
]

MOCK_CL_PLAN = [
    {"paragraph": 1, "topic": "Why NextGen Robotics Lab", "details": "Express specific alignment with their humanoid robotics research and outline how your masters project matches their hardware goals."},
    {"paragraph": 2, "topic": "Relevant Project (Humanoid Head)", "details": "Detail your experience building a facially expressive humanoid head, focusing on motor control and stereo vision integration."},
    {"paragraph": 3, "topic": "Research & Publication Overlap", "details": "Outline your published paper on real-time gaze tracking and its direct applicability to their open position."},
    {"paragraph": 4, "topic": "Career Alignment & Next Steps", "details": "Explain why Munich is a perfect research hub and state your availability for a technical interview."},
]

MOCK_COVER_LETTER_CLEANED = (
    "Dear Hiring Committee at NextGen Robotics Lab,\n\n"
    "Your recent research in vision-guided humanoid locomotion aligns closely with my engineering background. "
    "Having developed visual tracking systems for social interaction, I am eager to contribute to your Computer Vision & Robotics Researcher role.\n\n"
    "During my master's project on a facially expressive humanoid head, I realized that integration of visual feedback with motor control is critical. "
    "I designed stereo-vision gaze control loops that reduced tracking latency by 35%. "
    "This work utilized Python and ROS for device driver integration, focusing on real-time hardware execution.\n\n"
    "Additionally, my publication in the IROS 2025 proceedings details a deep learning pipeline for facial gesture recognition under dynamic illumination. "
    "This research maps directly onto the visual tracking responsibilities described in your posting.\n\n"
    "I would welcome the opportunity to discuss my technical qualifications and research interests in an interview."
)

MOCK_AUDIT_TRAIL = [
    {"sentence": "Dear Hiring Committee at NextGen Robotics Lab,", "source": "Job Advertisement", "status": "verified"},
    {"sentence": "Your recent research in vision-guided humanoid locomotion aligns closely with my engineering background.", "source": "Company Research (Website)", "status": "verified"},
    {"sentence": "Having developed visual tracking systems for social interaction, I am eager to contribute to your Computer Vision & Robotics Researcher role.", "source": "Resume (Skills/Experience)", "status": "verified"},
    {"sentence": "During my master's project on a facially expressive humanoid head, I realized that integration of visual feedback with motor control is critical.", "source": "Project: Facially Expressive Humanoid Head", "status": "verified"},
    {"sentence": "I designed stereo-vision gaze control loops that reduced tracking latency by 35%.", "source": "Project: Facially Expressive Humanoid Head", "status": "verified"},
    {"sentence": "This work utilized Python and ROS for device driver integration, focusing on real-time hardware execution.", "source": "Resume (Technologies)", "status": "verified"},
    {"sentence": "Additionally, my publication in the IROS 2025 proceedings details a deep learning pipeline for facial gesture recognition under dynamic illumination.", "source": "Publication: Real-Time Gaze & Expression Tracking", "status": "verified"},
    {"sentence": "This research maps directly onto the visual tracking responsibilities described in your posting.", "source": "Job Advertisement", "status": "verified"},
    {"sentence": "I would welcome the opportunity to discuss my technical qualifications and research interests in an interview.", "source": "General Closing", "status": "verified"},
]

MOCK_FEEDBACK = {
    "naturalness": 9.1,
    "grammar": 9.8,
    "researchFit": 9.4,
    "specificity": 8.9,
    "aiRisk": "Low",
    "overall": 9.3,
}


# ══════════════════════════════════════════════════════════════════════════════
# Rate-limit / quota error detection helpers
# ══════════════════════════════════════════════════════════════════════════════

_RATE_LIMIT_PHRASES = (
    "quota", "rate limit", "429", "resource_exhausted",
    "too many requests", "rateLimitExceeded", "rate_limit",
)

def _is_rate_limit_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(p in msg for p in _RATE_LIMIT_PHRASES)


def _parse_json_response(raw: str) -> Any:
    """Strip markdown fences and parse JSON."""
    clean = re.sub(r"```(?:json)?\s*|\s*```", "", raw).strip()
    return json.loads(clean)


# ══════════════════════════════════════════════════════════════════════════════
# Provider Backends
# ══════════════════════════════════════════════════════════════════════════════

class _GeminiBackend:
    """
    Rotates through (api_key × model) combinations on rate-limit errors.
    Order: key0/model0 → key0/model1 → … → key1/model0 → key1/model1 → …
    """

    def __init__(self, api_keys: List[str], models: List[str]):
        self.api_keys = [k for k in api_keys if k.strip()]
        self.models = models or ["gemini-3.5-flash"]
        self._pairs: List[tuple] = [
            (k, m) for k in self.api_keys for m in self.models
        ]
        self._current = 0

    @property
    def is_available(self) -> bool:
        return _GENAI_AVAILABLE and bool(self._pairs)

    def generate(self, prompt: str) -> str:
        if not self.is_available:
            raise RuntimeError("Gemini not available (no keys or library missing)")

        last_err: Optional[Exception] = None
        for i in range(len(self._pairs)):
            idx = (self._current + i) % len(self._pairs)
            api_key, model_name = self._pairs[idx]
            try:
                client = _genai.Client(api_key=api_key)
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                self._current = (idx + 1) % len(self._pairs)
                return response.text
            except Exception as e:
                last_err = e
                if _is_rate_limit_error(e):
                    print(f"[Gemini] Rate-limit on key[...{api_key[-4:]}]/model[{model_name}] – rotating…")
                    continue
                print(f"[Gemini] Error on key[...{api_key[-4:]}]/model[{model_name}]: {e}")
                continue

        raise RuntimeError(f"All Gemini key/model combinations failed. Last error: {last_err}")


class _NIMBackend:
    """
    NVIDIA NIM – OpenAI-compatible API.
    Rotates through (api_key × model) combinations on error.
    """

    def __init__(self, api_keys: List[str], models: List[str], base_url: str):
        self.api_keys = [k for k in api_keys if k.strip()]
        self.models = models or ["meta/llama-3.1-8b-instruct"]
        self.base_url = base_url or "https://integrate.api.nvidia.com/v1"
        self._pairs: List[tuple] = [
            (k, m) for k in self.api_keys for m in self.models
        ]
        self._current = 0

    @property
    def is_available(self) -> bool:
        return _OPENAI_AVAILABLE and bool(self._pairs)

    def generate(self, prompt: str) -> str:
        if not self.is_available:
            raise RuntimeError("NIM not available (no keys or openai library missing)")

        last_err: Optional[Exception] = None
        for i in range(len(self._pairs)):
            idx = (self._current + i) % len(self._pairs)
            api_key, model_name = self._pairs[idx]
            try:
                client = _OpenAI(api_key=api_key, base_url=self.base_url)
                completion = client.chat.completions.create(
                    model=model_name,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7,
                    max_tokens=4096,
                )
                self._current = (idx + 1) % len(self._pairs)
                return completion.choices[0].message.content
            except Exception as e:
                last_err = e
                if _is_rate_limit_error(e):
                    print(f"[NIM] Rate-limit on key[...{api_key[-4:]}]/model[{model_name}] – rotating…")
                    continue
                print(f"[NIM] Error on key[...{api_key[-4:]}]/model[{model_name}]: {e}")
                continue

        raise RuntimeError(f"All NIM key/model combinations failed. Last error: {last_err}")


class _OllamaBackend:
    """
    Ollama local LLM backend.  Uses the /api/generate REST endpoint.
    """

    def __init__(self, base_url: str, model: str):
        self.base_url = (base_url or "http://localhost:11434").rstrip("/")
        self.model = model or "llama3"

    @property
    def is_available(self) -> bool:
        return _REQUESTS_AVAILABLE

    def generate(self, prompt: str) -> str:
        if not self.is_available:
            raise RuntimeError("Ollama not available (requests library missing)")

        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
        }
        try:
            resp = _requests.post(url, json=payload, timeout=120)
            resp.raise_for_status()
            data = resp.json()
            return data.get("response", "")
        except Exception as e:
            raise RuntimeError(f"Ollama error: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# Main Multi-Provider Router
# ══════════════════════════════════════════════════════════════════════════════

class CopilotGenerator:
    """
    Unified LLM interface for all generation tasks.

    Provider resolution order (configurable via `active_provider`):
        "gemini"  → tries Gemini first, then NIM, then Ollama
        "nim"     → tries NIM first, then Gemini, then Ollama
        "ollama"  → tries Ollama first, then Gemini, then NIM

    Falls back to mock data if all providers fail.
    """

    def __init__(
        self,
        # Gemini
        gemini_api_keys: Optional[List[str]] = None,
        gemini_models: Optional[List[str]] = None,
        # Legacy single key support
        api_key: str = "",
        # NIM
        nim_api_keys: Optional[List[str]] = None,
        nim_models: Optional[List[str]] = None,
        nim_base_url: str = "https://integrate.api.nvidia.com/v1",
        # Ollama
        ollama_enabled: bool = False,
        ollama_base_url: str = "http://localhost:11434",
        ollama_model: str = "llama3",
        # Provider preference
        active_provider: str = "gemini",
    ):
        # Merge legacy single key into list
        all_gemini_keys = list(gemini_api_keys or [])
        if api_key and api_key not in all_gemini_keys:
            all_gemini_keys.insert(0, api_key)

        self._gemini = _GeminiBackend(
            api_keys=all_gemini_keys,
            models=gemini_models or ["gemini-3.5-flash"],
        )
        self._nim = _NIMBackend(
            api_keys=nim_api_keys or [],
            models=nim_models or ["meta/llama-3.1-8b-instruct"],
            base_url=nim_base_url,
        )
        self._ollama = _OllamaBackend(
            base_url=ollama_base_url,
            model=ollama_model,
        )
        self._ollama_enabled = ollama_enabled
        self._active_provider = active_provider.lower()

    # ── Provider resolution ─────────────────────────────────────────────────

    def _provider_order(self) -> List[Any]:
        """Return backends in priority order based on active_provider."""
        all_backends = {
            "gemini": self._gemini,
            "nim": self._nim,
            "ollama": self._ollama if self._ollama_enabled else None,
        }
        order_map = {
            "gemini": ["gemini", "nim", "ollama"],
            "nim":    ["nim", "gemini", "ollama"],
            "ollama": ["ollama", "gemini", "nim"],
        }
        order = order_map.get(self._active_provider, ["gemini", "nim", "ollama"])
        result = []
        for name in order:
            b = all_backends.get(name)
            if b is not None and getattr(b, "is_available", False):
                result.append(b)
        return result

    def _generate(self, prompt: str) -> Optional[str]:
        """Try each provider in order. Returns raw text or None if all fail."""
        for backend in self._provider_order():
            try:
                text = backend.generate(prompt)
                if text:
                    return text
            except Exception as e:
                print(f"[Router] Backend {type(backend).__name__} failed: {e}")
                continue
        return None

    @property
    def client_active(self) -> bool:
        return bool(self._provider_order())

    # ══════════════════════════════════════════════════════════════════════════
    # Task Methods
    # ══════════════════════════════════════════════════════════════════════════

    def analyze_job(self, job_text: str) -> Dict[str, Any]:
        """Module 1: Extract Job Requirements."""
        if not self.client_active:
            return MOCK_ANALYSIS

        prompt = f"""
Analyze this job advertisement and return a JSON object with:
- company: Company name
- position: Position title
- location: Location
- skills: List of required/preferred skills, each with a name and rating (1-5) e.g. {{"name": "Python", "level": 5}}
- experience: Brief description of required experience
- researchTopics: List of research topics or technologies mentioned
- keywords: List of important technical keywords
- softSkills: List of soft skills
- responsibilities: List of core responsibilities
- hiddenRequirements: Any implicit requirements (e.g. German language level, publication records)

Job Advertisement:
{job_text}

Return ONLY valid JSON. Do not include markdown tags.
"""
        try:
            raw = self._generate(prompt)
            if raw:
                return _parse_json_response(raw)
        except Exception as e:
            print(f"[analyze_job] Parse error: {e}")
        return MOCK_ANALYSIS

    def analyze_suitability(self, profile: Dict[str, Any], job_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Module 2 & 3: Match profile and produce Suitability and Gap Analysis."""
        if not self.client_active:
            return {"suitability": MOCK_SUITABILITY, "gaps": MOCK_GAPS}

        prompt = f"""
Compare the candidate's Profile with the Job Analysis.
Return a JSON object containing:
1. suitability:
   - overallMatch: Percentage (0-100)
   - technical: Percentage (0-100)
   - research: Percentage (0-100)
   - leadership: Percentage (0-100)
   - communication: Percentage (0-100)
   - strengths: List of strengths, each with {{"title": "...", "desc": "..."}}
   - weaknesses: List of weaknesses, each with {{"title": "...", "desc": "..."}}
2. gaps: List of missing skills, each with:
   - skill: Skill name
   - effort: Estimated learning hours (e.g. "20 hours")
   - resources: List of 3 tutorials or docs
   - difficulty: "Easy", "Medium", or "Hard"
   - impact: "Low", "Medium", or "High"

Candidate Profile:
{json.dumps(profile)}

Job Analysis:
{json.dumps(job_analysis)}

Return ONLY valid JSON.
"""
        try:
            raw = self._generate(prompt)
            if raw:
                return _parse_json_response(raw)
        except Exception as e:
            print(f"[analyze_suitability] Parse error: {e}")
        return {"suitability": MOCK_SUITABILITY, "gaps": MOCK_GAPS}

    def plan_cover_letter(
        self,
        job_analysis: Dict[str, Any],
        suitability: Dict[str, Any],
        style: str = "industrial",
    ) -> List[Dict[str, Any]]:
        """Module 5: Create the structural layout of the cover letter.

        Two letter architectures, following industry templates:
        - Job letters (Anschreiben / company applications): hook → fit with proof
          → why this company → logistics & close. One A4 page, 3-4 short paragraphs.
        - PhD / academic letters (motivation letters): hook → research & publications
          → why this lab (specific papers) → research vision & close.
        """
        if not self.client_active:
            return MOCK_CL_PLAN

        if style in ("phd", "academic"):
            structure = """
Create a ONE-PAGE (~400-500 words) PhD motivation-letter structure for a specific professor/lab.
Return a JSON list of 4 paragraphs. Each item must have:
- paragraph: 1-4
- topic: Focus of the paragraph
- details: exactly what to write (which profile facts to use, what to reference about the lab)

1. Hook — the exact position/project, the candidate's highest degree (institution + CGPA if present), and a one-line research identity.
2. Research experience & publications — the thesis and key systems BUILT (specific, with numbers), with papers integrated contextually (venue + what it demonstrated), not listed like a CV.
3. Why this lab — reference ONE specific paper/project of the professor's group (from job analysis / research context) and bridge it to the candidate's own work; say what they could contribute.
4. Research vision & close — 1-2 sentence future research direction tied to the lab's agenda, then a short closing.
"""
        else:
            structure = """
Create a ONE-A4-PAGE (3-4 short paragraphs) job cover letter structure (German Anschreiben conventions, works globally).
Return a JSON list of 4 paragraphs. Each item must have:
- paragraph: 1-4
- topic: Focus of the paragraph
- details: exactly what to write (which profile facts to use)

1. Hook — the position, where it was advertised (from job analysis), and a one-line current-role summary with a headline metric.
2. Fit with proof — map 2-3 key requirements from the job to QUANTIFIED achievements from the candidate's experience/projects (numbers, not adjectives).
3. Why this company — ONE specific, non-generic reason (their product/tech/mission from job analysis) and what the candidate would contribute.
4. Logistics & close — location/relocation/remote or visa/availability line (use the candidate's address/country), then a short closing.
"""

        prompt = f"""{structure}

Job Info:
{json.dumps(job_analysis)}

Strengths & Weaknesses:
{json.dumps(suitability)}

Return ONLY valid JSON.
"""
        try:
            raw = self._generate(prompt)
            if raw:
                return _parse_json_response(raw)
        except Exception as e:
            print(f"[plan_cover_letter] Parse error: {e}")
        return MOCK_CL_PLAN

    def generate_cover_letter(
        self,
        profile: Dict[str, Any],
        job_analysis: Dict[str, Any],
        plan: List[Dict[str, Any]],
        settings: Dict[str, Any],
        style: str = "industrial",
    ) -> Dict[str, Any]:
        """Modules 6-9: Cover Letter Writer, Humanizer, Truthfulness Guard, Feedback."""
        if not self.client_active:
            cl = MOCK_COVER_LETTER_CLEANED
            forbidden = settings.get("forbidden_phrases", [])
            for phrase in forbidden:
                cl = re.sub(rf"(?i){re.escape(phrase)}", "[STRIPPED CLICHÉ]", cl)
            return {"coverLetter": cl, "auditTrail": MOCK_AUDIT_TRAIL, "feedback": MOCK_FEEDBACK}

        forbidden_list = settings.get("forbidden_phrases", [])
        tone_prefs = settings.get("tone_settings", {})
        phd_mode = style in ("phd", "academic")

        if phd_mode:
            format_rules = """
FORMAT (PhD motivation letter):
- Exactly ONE page (~400-500 words). Single-spaced, formal correspondence.
- Start with \"Dear Prof. [Last Name],\" or \"Dear Dr. [Last Name],\" (or \"Dear Admissions Committee,\" if no name is available).
- Four paragraphs: 1) hook + degree + research identity; 2) research experience with publications integrated contextually;
  3) why this lab — reference ONE specific recent paper/project of theirs and bridge it to the candidate's work;
  4) future research vision (1-2 sentences) tied to the lab's agenda, then a closing line.
- Never generic flattery of rankings/campuses — talk about the research itself.
- Confident but humble: report what was built and measured; never boast.
"""
        else:
            format_rules = """
FORMAT (job application letter, one A4 page):
- 3-4 SHORT paragraphs only. Recruiters spend ~30 seconds — every sentence must earn its place.
- Start with \"Dear Hiring Team,\" or a named salutation if one is known.
- Paragraph 1: hook (position + where found + one-line role summary with a headline metric).
- Paragraph 2: fit with 2-3 QUANTIFIED achievements mapped to the role's key requirements.
- Paragraph 3: ONE specific reason for this company (their product/tech/mission — never generic praise).
- Paragraph 4: logistics — location/relocation/remote availability or notice period (use the candidate's address/country), then a closing line.
- Professional, factual, direct. No hype, humor, casual tone, or empty buzzwords (\"passionate team player\", \"fast learner\" without proof).
"""

        prompt = f"""
You are an advanced application agent. Write a personalized, tailored cover letter.

CRITICAL CONSTRAINTS (Cover Letter Memory):
- You MUST NOT use any of these phrases/words (strictly forbidden): {json.dumps(forbidden_list)}
- Enforce this writing style: {json.dumps(tone_prefs)}
- Style mode: {style}

HUMANIZER RULE:
- Do not use generic enthusiasm. Write about concrete projects, achievements, and statistics.

TRUTHFULNESS GUARD RULE:
- Every claim MUST be traceable to the Candidate Profile (including experience, education, projects, publications, certifications). Do not invent details.

UNIVERSAL RULES:
- Never repeat the CV line by line — the letter explains the WHY and connects the candidate's highlights to the role/lab.
- Numbers, not adjectives: \"moved from embedded firmware to deployed LLM apps in one project\" beats \"fast learner\".
- End the letter body with a short closing paragraph. Do NOT include a signature block or \"Sincerely,\" line — the template adds it.
- Keep to ONE page. Trim ruthlessly.

{format_rules}

Candidate Profile:
{json.dumps(profile)}

Job Analysis:
{json.dumps(job_analysis)}

Paragraph Layout:
{json.dumps(plan)}

Return a JSON object containing:
- coverLetter: The full text of the letter (salutation + paragraphs + closing paragraph, no signature)
- auditTrail: A list of objects matching each sentence to its source:
  {{"sentence": "...", "source": "...", "status": "verified"|"unverified"}}
- feedback: An object with scores (0-10) for:
  - naturalness, grammar, researchFit, specificity
  - aiRisk: "Low", "Medium", or "High"
  - overall: Combined rating

Return ONLY valid JSON.
"""
        try:
            raw = self._generate(prompt)
            if raw:
                return _parse_json_response(raw)
        except Exception as e:
            print(f"[generate_cover_letter] Parse error: {e}")
        return {"coverLetter": MOCK_COVER_LETTER_CLEANED, "auditTrail": MOCK_AUDIT_TRAIL, "feedback": MOCK_FEEDBACK}

    def refine_cover_letter(
        self,
        current_letter: str,
        user_feedback: str,
        profile: Dict[str, Any],
        job_analysis: Dict[str, Any],
        settings: Dict[str, Any],
        style: str = "industrial",
    ) -> Dict[str, Any]:
        """
        Iterative refinement: takes the existing cover letter and user feedback,
        then rewrites it addressing the specific issues raised.
        """
        if not self.client_active:
            # Mock: append a note that feedback was applied
            improved = current_letter + f"\n\n[Refined based on feedback: {user_feedback}]"
            return {"coverLetter": improved, "auditTrail": MOCK_AUDIT_TRAIL, "feedback": MOCK_FEEDBACK}

        forbidden_list = settings.get("forbidden_phrases", [])
        tone_prefs = settings.get("tone_settings", {})

        prompt = f"""
You are an advanced cover letter editor. Below is an existing cover letter and specific feedback from the user.
Your task is to rewrite the letter addressing ALL of the feedback points while keeping what was good.

CURRENT COVER LETTER:
{current_letter}

USER FEEDBACK (must be addressed):
{user_feedback}

CONSTRAINTS (never break these):
- Strictly forbidden phrases: {json.dumps(forbidden_list)}
- Writing style: {json.dumps(tone_prefs)}
- Style mode: {style}
- TRUTHFULNESS: every claim must be traceable to the profile. Do not invent details.
- HUMANIZER: no generic enthusiasm phrases. Use concrete facts and metrics.

Candidate Profile (for verification):
{json.dumps(profile)}

Job Info:
{json.dumps(job_analysis)}

Return a JSON object containing:
- coverLetter: The improved full text of the letter
- auditTrail: A list of objects matching each sentence to its source:
  {{"sentence": "...", "source": "...", "status": "verified"|"unverified"}}
- feedback: An object with scores (0-10) for:
  - naturalness, grammar, researchFit, specificity
  - aiRisk: "Low", "Medium", or "High"
  - overall: Combined rating
- changesSummary: A short plain-text description of what was changed (1-3 sentences)

Return ONLY valid JSON.
"""
        try:
            raw = self._generate(prompt)
            if raw:
                return _parse_json_response(raw)
        except Exception as e:
            print(f"[refine_cover_letter] Parse error: {e}")
        return {"coverLetter": current_letter, "auditTrail": MOCK_AUDIT_TRAIL, "feedback": MOCK_FEEDBACK, "changesSummary": "Refinement failed, original kept."}

    def parse_resume(self, resume_text: str) -> Dict[str, Any]:
        """
        AI-powered resume parser.
        Reads EVERY section of the resume into a structured profile — known
        sections are mapped to standard fields and any unknown section is kept
        verbatim in ``additional_sections`` so no data is ever dropped.
        """
        EMPTY_PROFILE = {
            "name": "", "email": "", "phone": "", "address": "", "links": [],
            "career_goals": "", "skills": [], "experience": [], "education": [],
            "projects": [], "publications": [], "certifications": [],
            "achievements": [], "languages": [], "hobbies": [], "declaration": "",
            "additional_sections": [],
        }
        _LIST_KEYS = {
            "links", "skills", "experience", "education", "projects", "publications",
            "certifications", "achievements", "languages", "hobbies", "additional_sections",
        }

        if not self.client_active:
            return EMPTY_PROFILE

        prompt = f"""
You are an expert resume/CV parser. Read EVERY section of the resume and map it into
a structured JSON object. Never drop any section — if it does not fit one of the
standard fields, capture it verbatim in additional_sections.

Return a JSON object with EXACTLY these fields:
- name: Full name (string, only the name)
- email: Email address (string)
- phone: Phone number (string)
- address: City/country or full address (string)
- links: List of profile/portfolio URLs, e.g. LinkedIn, GitHub, personal site (list of strings)
- career_goals: Content of the Objective / Summary / Profile / About section (string)
- skills: List of technical and soft skills as plain strings (list)
- experience: List of work/research experience, each: {{"role", "company", "duration", "description"}}
- education: List of education entries, each: {{"degree", "institution", "duration", "description"}} (include GPA if present)
- projects: List of objects: {{"title", "technologies": [..], "description"}}
- publications: List of objects: {{"title", "authors", "journal", "year", "abstract"}}
- certifications: List of certifications/courses: {{"name", "issuer", "year"}}
- achievements: List of awards/honours/achievements: {{"title", "year", "description"}}
- languages: List of languages: {{"language", "proficiency"}} (e.g. "Fluent", "B2", "Native")
- hobbies: List of hobbies/interests (list of strings)
- declaration: The declaration statement if present (string)
- additional_sections: ANY other section found in the resume (e.g. Workshops, Volunteering,
  Internships, Extracurricular, Patents, Grants, References, Training, Personal Projects,
  or anything else) as a list of {{"title": section heading, "content": full section text}}

IMPORTANT RULES:
- Preserve ALL sections. If you cannot map a section to a standard field, put it verbatim in additional_sections.
- name must be ONLY the person's name.
- Extract ALL experience, education, projects, publications, certifications, achievements and languages.
- If a field is missing, use empty string or empty list.
- Do not invent data that is not in the resume.

RESUME TEXT:
{resume_text}

Return ONLY valid JSON. No markdown, no explanation.
"""
        try:
            raw = self._generate(prompt)
            if raw:
                parsed = _parse_json_response(raw)
                # Validate required keys exist (list keys default to [], text to "").
                for key in EMPTY_PROFILE:
                    if key not in parsed:
                        parsed[key] = [] if key in _LIST_KEYS else ""
                return parsed
        except Exception as e:
            print(f"[parse_resume] Parse error: {e}")
        return EMPTY_PROFILE

    def extract_job_details(self, pasted_text: str) -> Dict[str, Any]:
        """
        AI-powered job posting extractor.
        AI extracts ONLY company, position, location.
        The full raw pasted_text is ALWAYS used as description — nothing is shortened.
        """
        if not self.client_active:
            return {"company": "", "position": "", "location": "", "description": pasted_text}

        prompt = f"""
Extract ONLY the following three fields from this job posting text.

Return a JSON object with EXACTLY these fields:
- company: The hiring company, university department, or research lab name (string)
- position: The exact job title or position name (string)
- location: City and Country, or "Remote" (string)

Do NOT include any description or summary field. Just the three fields above.

JOB POSTING TEXT:
{pasted_text[:3000]}

Return ONLY valid JSON. No markdown. Example: {{"company": "TU Munich", "position": "PhD Researcher", "location": "Munich, Germany"}}
"""
        try:
            raw = self._generate(prompt)
            if raw:
                meta = _parse_json_response(raw)
                # Always attach the COMPLETE original text as description
                meta["description"] = pasted_text
                return meta
        except Exception as e:
            print(f"[extract_job_details] Parse error: {e}")

        # Fallback: best-effort from first lines
        lines = [l.strip() for l in pasted_text.split('\n') if l.strip()]
        return {
            "company": lines[0] if lines else "",
            "position": lines[1] if len(lines) > 1 else "",
            "location": "",
            "description": pasted_text  # full text always preserved
        }

