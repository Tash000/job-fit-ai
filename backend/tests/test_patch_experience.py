"""Tests for PATCH-based updates and the profile Experience field."""

from fastapi.testclient import TestClient

from tests.conftest import auth


def test_profile_defaults_all_sections(client: TestClient):
    """Every standard resume section key is present with a sane default."""
    pp = client.get("/api/profile", headers=auth("alice")).json()["parsed_profile"]
    for key in ["address", "links", "career_goals", "skills", "experience", "education",
                "projects", "publications", "certifications", "achievements",
                "languages", "hobbies", "declaration", "additional_sections"]:
        assert key in pp, key
    for list_key in ["links", "skills", "experience", "education", "projects", "publications",
                     "certifications", "achievements", "languages", "hobbies", "additional_sections"]:
        assert pp[list_key] == [], list_key


def test_profile_keeps_unknown_sections_in_additional_sections(client: TestClient):
    """Malformed/missing sections are normalized without dropping data."""
    resp = client.patch(
        "/api/profile",
        headers=auth("alice"),
        json={
            "resume_text": "Volunteering: taught kids robotics",
            "parsed_profile": {
                "name": "Alice",
                "additional_sections": [{"title": "Volunteering", "content": "Taught kids robotics."}],
            },
        },
    )
    assert resp.status_code == 200
    pp = client.get("/api/profile", headers=auth("alice")).json()["parsed_profile"]
    # Missing list keys are normalized to [] (never null/string).
    assert pp["skills"] == []
    assert pp["languages"] == []
    assert pp["declaration"] == ""
    assert pp["additional_sections"][0]["title"] == "Volunteering"
    assert pp["additional_sections"][0]["content"] == "Taught kids robotics."


def test_patch_profile_updates_experience(client: TestClient):
    resp = client.patch(
        "/api/profile",
        headers=auth("alice"),
        json={
            "resume_text": "Research Engineer at Bosch Robotics",
            "parsed_profile": {
                "name": "Alice",
                "email": "",
                "phone": "",
                "career_goals": "",
                "skills": [],
                "projects": [],
                "publications": [],
                "experience": [
                    {
                        "role": "Research Engineer",
                        "company": "Bosch",
                        "duration": "2022 - Present",
                        "description": "Vision-guided robotic control.",
                    }
                ],
            },
        },
    )
    assert resp.status_code == 200

    profile = client.get("/api/profile", headers=auth("alice")).json()
    exp = profile["parsed_profile"]["experience"]
    assert len(exp) == 1
    assert exp[0]["company"] == "Bosch"
    assert exp[0]["role"] == "Research Engineer"


def test_patch_settings_updates_models(client: TestClient):
    resp = client.patch(
        "/api/settings",
        headers=auth("alice"),
        json={"gemini_models": ["gemini-3.5-flash", "gemini-2.5-flash"]},
    )
    assert resp.status_code == 200
    settings = client.get("/api/settings", headers=auth("alice")).json()
    assert settings["gemini_models"][0] == "gemini-3.5-flash"
    assert "gemini-2.5-flash" in settings["gemini_models"]


def test_patch_settings_is_user_scoped(client: TestClient):
    client.patch("/api/settings", headers=auth("alice"), json={"gemini_models": ["a", "b"]})
    # Bob's settings are untouched.
    settings = client.get("/api/settings", headers=auth("bob")).json()
    assert settings["gemini_models"][0] != "a"


def test_patch_settings_still_accepts_keys(client: TestClient):
    resp = client.patch(
        "/api/settings",
        headers=auth("alice"),
        json={"gemini_api_keys": ["AIza-test-123"]},
    )
    assert resp.status_code == 200
    settings = client.get("/api/settings", headers=auth("alice")).json()
    assert len(settings["keyInfo"]["gemini"]) == 1
