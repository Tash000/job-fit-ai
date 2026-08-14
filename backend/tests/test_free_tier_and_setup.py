"""
Free-tier allowance, setup gates, and no-LLM heuristic extraction.

Covers:
- analyze / generate require the user's OWN resume first (setup gate).
- Accounts without their own provider key get a small free allowance
  (2 analyses + 1 cover letter) and are blocked afterwards.
- Adding a key flips `has_own_key` in the settings payload.
- heuristic_extract works without any LLM.
"""

import main
import services.job_scraper as job_scraper
from tests.conftest import auth


# ── Fake generator (no real LLM) ─────────────────────────────────────────────

class _FakeGenerator:
    """Stand-in for CopilotGenerator returning canned real-looking data."""

    def analyze_job(self, job_text):
        return {
            "company": "Test Corp",
            "position": "Engineer",
            "skills": [{"name": "Python", "level": 4}],
            "researchTopics": ["Computer Vision"],
        }

    def analyze_suitability(self, profile, job_analysis):
        return {
            "suitability": {
                "overallMatch": 80, "technical": 80, "research": 70,
                "leadership": 60, "communication": 75,
                "strengths": [], "weaknesses": [],
            },
            "gaps": [],
        }

    def plan_cover_letter(self, job_analysis, suitability, style="industrial"):
        return [{"paragraph": 1, "topic": "Hook", "details": "Intro"}]

    def generate_cover_letter(self, profile, job_analysis, plan, settings, style="industrial"):
        return {
            "coverLetter": "Dear Hiring Team,\n\nI am applying.",
            "auditTrail": [],
            "feedback": {"overall": 9.0, "aiRisk": "Low"},
        }

    def refine_cover_letter(self, **kwargs):
        return {
            "coverLetter": kwargs.get("current_letter", ""),
            "auditTrail": [],
            "feedback": {"overall": 9.0, "aiRisk": "Low"},
            "changesSummary": "Tightened wording.",
        }

    def parse_resume(self, resume_text):
        return {"name": "Test User", "skills": ["Python"]}

    def extract_job_details(self, pasted_text):
        return job_scraper.heuristic_extract(pasted_text)


def _use_fake_generator(monkeypatch):
    monkeypatch.setattr(main, "build_generator_for", lambda *a, **k: _FakeGenerator())
    monkeypatch.setattr(main, "_generator_from_row", lambda *a, **k: _FakeGenerator())


def _create_app_with_resume(client, user="alice"):
    """Create an application AND attach a resume so analyze passes the setup gate."""
    headers = auth(user)
    r = client.post("/api/applications", headers=headers, json={
        "company": "Test Corp", "position": "Engineer", "location": "Munich",
        "description": "We are looking for a Python Engineer at Test Corp. Location: Munich, Germany.",
    })
    app_id = r.json()["id"]
    # Give the user their own resume (bypassing the AI parser).
    session = main.db.SessionLocal()
    row = main._get_or_create_profile(session, _user_id_for(user))
    row.resume_text = "Test User — Python Engineer resume."
    session.commit()
    session.close()
    return app_id, headers


def _user_id_for(token: str) -> str:
    import uuid
    return str(uuid.uuid5(uuid.NAMESPACE_URL, token))


# ── Setup gates ──────────────────────────────────────────────────────────────

def test_analyze_requires_resume_first(client):
    """No resume → analyze is refused with reason no_resume (never fake data)."""
    headers = auth("alice")
    r = client.post("/api/applications", headers=headers, json={
        "company": "X", "position": "Y", "description": "job text",
    })
    app_id = r.json()["id"]
    resp = client.post(f"/api/applications/{app_id}/analyze", headers=headers)
    assert resp.status_code == 400
    assert resp.json()["detail"]["reason"] == "no_resume"


def test_generate_requires_resume_even_with_details(client):
    """generate is refused without a resume even if analysis data exists."""
    headers = auth("alice")
    r = client.post("/api/applications", headers=headers, json={
        "company": "X", "position": "Y", "description": "job text",
    })
    app_id = r.json()["id"]
    session = main.db.SessionLocal()
    row = session.query(main.db.Application).filter_by(id=app_id).first()
    row.details = {"jobAnalysis": {}, "suitability": {}}
    session.commit()
    session.close()
    resp = client.post(f"/api/applications/{app_id}/generate", headers=headers, json={
        "style": "industrial", "plan": [],
    })
    assert resp.status_code == 400
    assert resp.json()["detail"]["reason"] == "no_resume"


# ── Free tier ────────────────────────────────────────────────────────────────

def test_free_allowance_two_analyses_then_blocked(client, monkeypatch):
    _use_fake_generator(monkeypatch)
    app_id, headers = _create_app_with_resume(client)

    # First analysis on the platform key → allowed.
    assert client.post(f"/api/applications/{app_id}/analyze", headers=headers).status_code == 200
    # Second analysis → allowed.
    assert client.post(f"/api/applications/{app_id}/analyze", headers=headers).status_code == 200
    # Third → blocked with reason free_limit.
    resp = client.post(f"/api/applications/{app_id}/analyze", headers=headers)
    assert resp.status_code == 402
    assert resp.json()["detail"]["reason"] == "free_limit"

    # Settings payload exposes the allowance.
    settings = client.get("/api/settings", headers=headers).json()
    assert settings["has_own_key"] is False
    assert settings["freeUsage"]["analysesUsed"] == 2
    assert settings["freeUsage"]["analysesLimit"] == 2


def test_free_allowance_one_cover_letter_then_blocked(client, monkeypatch):
    _use_fake_generator(monkeypatch)
    app_id, headers = _create_app_with_resume(client)
    client.post(f"/api/applications/{app_id}/analyze", headers=headers)

    # Generate a plan, then the letter (1 free).
    assert client.post(f"/api/applications/{app_id}/plan", headers=headers, json={"style": "industrial"}).status_code == 200
    resp = client.post(f"/api/applications/{app_id}/generate", headers=headers, json={
        "style": "industrial", "plan": [{"paragraph": 1, "topic": "Hook", "details": "Intro"}],
    })
    assert resp.status_code == 200

    # Refining also consumes the letter allowance → blocked now.
    resp = client.post(f"/api/applications/{app_id}/refine", headers=headers, json={
        "feedback": "More concise please",
    })
    assert resp.status_code == 402
    assert resp.json()["detail"]["reason"] == "free_limit"

    settings = client.get("/api/settings", headers=headers).json()
    assert settings["freeUsage"]["lettersUsed"] == 1
    assert settings["freeUsage"]["lettersLimit"] == 1


def test_own_key_unlocks_allowance(client, monkeypatch):
    _use_fake_generator(monkeypatch)
    headers = auth("alice")

    # User adds their own Gemini key → has_own_key flips to True.
    r = client.patch("/api/settings", headers=headers, json={"gemini_api_keys": ["AIza-fake-key-for-test"]})
    assert r.status_code == 200
    assert r.json()["settings"]["has_own_key"] is True

    app_id, _ = _create_app_with_resume(client)
    # No longer limited by the free allowance.
    for _ in range(3):
        assert client.post(f"/api/applications/{app_id}/analyze", headers=headers).status_code == 200


def test_free_allowance_per_user(client, monkeypatch):
    """Free counters are isolated per user (user B starts fresh)."""
    _use_fake_generator(monkeypatch)
    app_id_a, headers_a = _create_app_with_resume(client, "alice")
    app_id_b, headers_b = _create_app_with_resume(client, "bob")

    client.post(f"/api/applications/{app_id_a}/analyze", headers=headers_a)

    s_a = client.get("/api/settings", headers=headers_a).json()
    s_b = client.get("/api/settings", headers=headers_b).json()
    assert s_a["freeUsage"]["analysesUsed"] == 1
    assert s_b["freeUsage"]["analysesUsed"] == 0


# ── Heuristic extraction (no LLM) ────────────────────────────────────────────

def test_heuristic_extract_company_position_location():
    text = (
        "Software Engineer at NextGen Robotics Lab\n"
        "About the company: NextGen Robotics Lab builds humanoid heads.\n"
        "We are looking for a Senior Computer Vision Researcher.\n"
        "Location: Munich, Germany\n"
        "Responsibilities: implement gaze control..."
    )
    out = job_scraper.heuristic_extract(text)
    assert "NextGen Robotics Lab" in out["company"]
    assert "Senior Computer Vision Researcher" in out["position"].lower() or "computer vision" in out["position"].lower()
    assert "Munich" in out["location"]
    assert out["description"] == text  # full text always preserved


def test_scrape_rejects_private_hosts(monkeypatch):
    """SSRF guard: localhost / private addresses are refused."""
    for bad in ("http://localhost:8000/x", "http://127.0.0.1/x", "http://169.254.169.254/latest/meta-data"):
        try:
            job_scraper.scrape_url(bad)
            raise AssertionError(f"expected {bad} to be rejected")
        except ValueError as exc:
            assert "not allowed" in str(exc).lower() or "private" in str(exc).lower()


def test_extract_endpoint_works_without_provider_key(client, monkeypatch):
    """Smart Paste falls back to the heuristic when no LLM is configured."""
    # No fake generator → build_generator_for returns a real generator with no
    # keys, whose extract_job_details still returns the heuristic result.
    resp = client.post("/api/jobs/extract", headers=auth("alice"), json={
        "raw_text": "Hiring for Bosch Research\nWe are looking for a PhD Researcher.\nLocation: Stuttgart, Germany",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["description"]  # full text preserved
    assert any(k in body for k in ("company", "position", "location"))
