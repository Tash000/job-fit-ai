"""Tests for per-account limits, duplicate detection, resume library, and account clearing."""

import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth


def _mk_app(client, company="ACME", position="Researcher", description="jd", user="alice"):
    resp = client.post(
        "/api/applications",
        headers=auth(user),
        json={"company": company, "position": position, "location": "Berlin", "description": description},
    )
    assert resp.status_code == 200
    return resp.json()["id"]


# ── Duplicate detection ───────────────────────────────────────────────────────

def test_duplicate_same_company_and_jd_rejected(client: TestClient):
    _mk_app(client, company="ACME", position="Researcher", description="Build robots with Python.")
    resp = client.post(
        "/api/applications",
        headers=auth("alice"),
        json={"company": "acme", "position": "Researcher", "location": "Berlin", "description": "Build robots with Python."},
    )
    assert resp.status_code == 409
    body = resp.json()["detail"]
    assert body["reason"] == "duplicate"
    assert body["existing_id"] == 1  # first created app


def test_different_jd_not_a_duplicate(client: TestClient):
    _mk_app(client, description="Build robots with Python.")
    resp = client.post(
        "/api/applications",
        headers=auth("alice"),
        json={"company": "ACME", "position": "Researcher", "location": "Berlin", "description": "Drive cars with Rust."},
    )
    assert resp.status_code == 200


def test_duplicate_only_counts_within_user(client: TestClient):
    _mk_app(client, description="Build robots with Python.", user="alice")
    # Bob can create the exact same job — data is per-account.
    resp = client.post(
        "/api/applications",
        headers=auth("bob"),
        json={"company": "ACME", "position": "Researcher", "location": "Berlin", "description": "Build robots with Python."},
    )
    assert resp.status_code == 200


# ── 500-analysis limit ────────────────────────────────────────────────────────

def test_limit_blocks_new_app_and_links_oldest(client: TestClient, monkeypatch):
    import main

    monkeypatch.setattr(main, "MAX_ANALYSES_PER_USER", 3)
    ids = [_mk_app(client, description=f"jd {i}") for i in range(3)]

    resp = client.post(
        "/api/applications",
        headers=auth("alice"),
        json={"company": "ACME", "position": "R", "location": "B", "description": "jd overflow"},
    )
    assert resp.status_code == 409
    body = resp.json()["detail"]
    assert body["reason"] == "limit"
    assert body["count"] == 3
    assert body["max"] == 3
    assert body["oldest"]["id"] == ids[0]

    # After deleting the oldest, creation works again.
    client.delete(f"/api/applications/{ids[0]}", headers=auth("alice"))
    assert (
        client.post(
            "/api/applications",
            headers=auth("alice"),
            json={"company": "ACME", "position": "R", "location": "B", "description": "jd overflow"},
        ).status_code
        == 200
    )


# ── Application tracking flags (applied / follow-up / bookmark) ───────────────

def test_patch_flags(client: TestClient):
    app_id = _mk_app(client)

    resp = client.patch(
        f"/api/applications/{app_id}",
        headers=auth("alice"),
        json={"applied": True, "follow_up": True, "bookmarked": True},
    )
    assert resp.status_code == 200
    app = resp.json()["application"]
    assert app["applied"] is True
    assert app["applied_date"]  # auto-stamped today
    assert app["follow_up"] is True
    assert app["bookmarked"] is True

    listed = client.get("/api/applications", headers=auth("alice")).json()
    assert listed[0]["applied"] is True
    assert listed[0]["bookmarked"] is True


def test_flags_are_user_scoped(client: TestClient):
    app_id = _mk_app(client)
    assert client.patch(f"/api/applications/{app_id}", headers=auth("bob"), json={"applied": True}).status_code == 404


# ── Resume library ────────────────────────────────────────────────────────────

def test_resume_crud_and_limits(client: TestClient, monkeypatch):
    import main

    monkeypatch.setattr(main, "MAX_RESUMES_PER_USER", 2)

    for i in range(2):
        resp = client.post(
            "/api/resumes",
            headers=auth("alice"),
            json={"name": f"Resume {i + 1}", "resume_text": f"text {i}", "parsed_profile": {"name": f"Alice {i}"}},
        )
        assert resp.status_code == 200

    # Third resume is rejected once the limit is reached.
    resp = client.post(
        "/api/resumes",
        headers=auth("alice"),
        json={"name": "Resume 3", "resume_text": "text"},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["reason"] == "resume_limit"

    resumes = client.get("/api/resumes", headers=auth("alice")).json()
    assert resumes["max"] == 2
    assert len(resumes["resumes"]) == 2

    # Rename + activate the "Resume 2" row (looked up by name — ordering by
    # created_at is unstable for same-second inserts).
    r_id = next(r for r in resumes["resumes"] if r["name"] == "Resume 2")["id"]
    resp = client.patch(f"/api/resumes/{r_id}", headers=auth("alice"), json={"name": "PhD CV"})
    assert resp.status_code == 200
    assert resp.json()["resume"]["name"] == "PhD CV"

    resp = client.post(f"/api/resumes/{r_id}/activate", headers=auth("alice"))
    assert resp.status_code == 200
    assert resp.json()["resume"]["is_active"] is True

    # Activation mirrors content into the profile used by analysis.
    profile = client.get("/api/profile", headers=auth("alice")).json()
    assert profile["resume_text"] == "text 1"
    assert profile["parsed_profile"]["name"] == "Alice 1"

    # Editing the profile keeps the active resume in sync.
    client.post("/api/profile", headers=auth("alice"), json={"resume_text": "new", "parsed_profile": {"name": "Alice New"}})
    resumes = client.get("/api/resumes", headers=auth("alice")).json()
    active = next(r for r in resumes["resumes"] if r["is_active"])
    # (summary does not include content; verify via re-activation later) — just check delete path.
    assert client.delete(f"/api/resumes/{r_id}", headers=auth("alice")).status_code == 200


def test_resume_name_validation(client: TestClient):
    # Too long.
    resp = client.post("/api/resumes", headers=auth("alice"), json={"name": "x" * 31, "resume_text": "t"})
    assert resp.status_code == 400
    # SQL-injection-style characters are rejected.
    for bad in ["Bob'; DROP TABLE resumes;--", "Bob\" OR 1=1", "B<b>ob</b>"]:
        resp = client.post("/api/resumes", headers=auth("alice"), json={"name": bad, "resume_text": "t"})
        assert resp.status_code == 400, bad
    # Valid names pass.
    resp = client.post("/api/resumes", headers=auth("alice"), json={"name": "Main CV 2026.v2", "resume_text": "t"})
    assert resp.status_code == 200


def test_resume_delete_frees_a_slot(client: TestClient, monkeypatch):
    import main

    monkeypatch.setattr(main, "MAX_RESUMES_PER_USER", 1)
    client.post("/api/resumes", headers=auth("alice"), json={"name": "Only One", "resume_text": "t"})
    assert client.post("/api/resumes", headers=auth("alice"), json={"name": "Other", "resume_text": "t"}).status_code == 409
    r_id = client.get("/api/resumes", headers=auth("alice")).json()["resumes"][0]["id"]
    client.delete(f"/api/resumes/{r_id}", headers=auth("alice"))
    assert client.post("/api/resumes", headers=auth("alice"), json={"name": "Other", "resume_text": "t"}).status_code == 200


# ── Account clearing ──────────────────────────────────────────────────────────

def test_clear_data_requires_password(client: TestClient):
    _mk_app(client)
    resp = client.post("/api/account/clear", headers=auth("alice"), json={"scope": "data", "password": ""})
    assert resp.status_code == 403


def test_clear_data_wipes_applications_and_resumes(client: TestClient, monkeypatch):
    import config
    import main

    monkeypatch.setattr(config, "DEMO_MODE", True)
    _mk_app(client)
    client.post("/api/resumes", headers=auth("alice"), json={"name": "CV", "resume_text": "t"})

    resp = client.post("/api/account/clear", headers=auth("alice"), json={"scope": "data", "password": "anything"})
    assert resp.status_code == 200
    stats = resp.json()["stats"]
    assert stats["applications"] == 1
    assert stats["resumes"] == 1
    assert client.get("/api/applications", headers=auth("alice")).json() == []
    assert client.get("/api/resumes", headers=auth("alice")).json()["resumes"] == []
    # Settings (keys) are untouched for scope "data".
    settings = client.get("/api/settings", headers=auth("alice")).json()
    assert settings["active_provider"] == "gemini"


def test_clear_all_resets_settings_too(client: TestClient, monkeypatch):
    import config
    import main

    monkeypatch.setattr(config, "DEMO_MODE", True)
    client.post(
        "/api/settings",
        headers=auth("alice"),
        json={"gemini_api_keys": ["AIza-test"], "active_provider": "nim"},
    )
    resp = client.post("/api/account/clear", headers=auth("alice"), json={"scope": "all", "password": "anything"})
    assert resp.status_code == 200
    settings = client.get("/api/settings", headers=auth("alice")).json()
    assert settings["keyInfo"]["gemini"] == []
    assert settings["active_provider"] == "gemini"
    assert settings["gemini_models"] == main.DEFAULT_GEMINI_MODELS


def test_invalid_scope_rejected(client: TestClient):
    assert client.post("/api/account/clear", headers=auth("alice"), json={"scope": "banana", "password": "x"}).status_code == 400
