"""Tests for the admin console: access control, overview, user directory,
per-user limit overrides, grant/revoke admin, storage clearing, activity log."""

import datetime
import uuid

from fastapi.testclient import TestClient

from tests.conftest import auth


def _token(email: str) -> str:
    import jwt as pyjwt

    # No iat/exp on purpose: the token string must be byte-for-byte identical
    # across calls so the fake-auth user id (uuid5 of the token) is stable.
    payload = {
        "sub": str(uuid.uuid5(uuid.NAMESPACE_URL, email)),
        "aud": "authenticated",
        "email": email,
    }
    return pyjwt.encode(payload, "test-jwt-secret", algorithm="HS256")


def _owner(client: TestClient, monkeypatch, email: str = "owner@example.com") -> dict:
    import config

    monkeypatch.setattr(config, "ADMIN_EMAILS", [email])
    return {"Authorization": f"Bearer {_token(email)}"}


def _uid_for(client: TestClient, owner: dict, email: str) -> str:
    users = client.get("/api/admin/users", headers=owner).json()["users"]
    return next(u["user_id"] for u in users if u["email"] == email)


# ── Access control ────────────────────────────────────────────────────────────

def test_admin_endpoints_require_admin(client: TestClient):
    for method, url in [
        ("get", "/api/admin/overview"),
        ("get", "/api/admin/users"),
        ("get", "/api/admin/activity"),
        ("get", "/api/admin/users/00000000-0000-0000-0000-000000000001"),
        ("post", "/api/admin/users/00000000-0000-0000-0000-000000000001/clear"),
    ]:
        resp = getattr(client, method)(url, headers=auth("alice"))
        assert resp.status_code == 403, (method, url)


def test_admin_status_endpoint(client: TestClient, monkeypatch):
    import config

    monkeypatch.setattr(config, "ADMIN_EMAILS", ["owner@example.com"])
    assert client.get("/api/admin/status", headers=_owner(client, monkeypatch)).json()["is_admin"] is True
    assert client.get("/api/admin/status", headers=auth("alice")).json()["is_admin"] is False


def test_visits_are_recorded_into_user_directory(client: TestClient, monkeypatch):
    # Any authenticated request registers the user (email from JWT).
    client.get("/api/settings", headers={"Authorization": f"Bearer {_token('bob@example.com')}"})
    owner = _owner(client, monkeypatch)
    users = client.get("/api/admin/users", headers=owner).json()["users"]
    assert any(u["email"] == "bob@example.com" for u in users)


# ── Overview ──────────────────────────────────────────────────────────────────

def test_overview_totals_and_provider_breakdown(client: TestClient, monkeypatch):
    client.post(
        "/api/applications",
        headers=auth("alice"),
        json={"company": "ACME", "position": "R", "location": "B", "description": "jd"},
    )
    body = client.get("/api/admin/overview", headers=_owner(client, monkeypatch)).json()
    assert body["totals"]["applications"] == 1
    assert body["totals"]["users"] >= 1
    assert body["totals"]["storage_bytes"] > 0
    assert body["totals"]["analyses"] == 0  # not analyzed yet
    assert body["limits"]["default_analysis"] == 500
    assert "gemini" in body["by_provider"]


# ── Per-user limit overrides ──────────────────────────────────────────────────

def test_analysis_limit_override_is_enforced(client: TestClient, monkeypatch):
    import main

    monkeypatch.setattr(main, "MAX_ANALYSES_PER_USER", 500)
    owner = _owner(client, monkeypatch)

    # bob registers, then the owner caps him at 2 analyses.
    bob = {"Authorization": f"Bearer {_token('bob@example.com')}"}
    client.get("/api/settings", headers=bob)
    uid = _uid_for(client, owner, "bob@example.com")
    assert client.patch(f"/api/admin/users/{uid}", headers=owner, json={"analysis_limit": 2}).status_code == 200

    for i in range(2):
        assert client.post(
            "/api/applications",
            headers=bob,
            json={"company": "ACME", "position": "R", "location": "B", "description": f"jd {i}"},
        ).status_code == 200
    resp = client.post(
        "/api/applications",
        headers=bob,
        json={"company": "ACME", "position": "R", "location": "B", "description": "jd overflow"},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["max"] == 2

    # Resetting (0) restores the platform default.
    client.patch(f"/api/admin/users/{uid}", headers=owner, json={"analysis_limit": 0})
    assert client.post(
        "/api/applications",
        headers=bob,
        json={"company": "ACME", "position": "R", "location": "B", "description": "jd 3"},
    ).status_code == 200


def test_resume_limit_override(client: TestClient, monkeypatch):
    import main

    monkeypatch.setattr(main, "MAX_RESUMES_PER_USER", 5)
    owner = _owner(client, monkeypatch)
    bob = {"Authorization": f"Bearer {_token('bob@example.com')}"}
    client.get("/api/settings", headers=bob)
    uid = _uid_for(client, owner, "bob@example.com")

    client.patch(f"/api/admin/users/{uid}", headers=owner, json={"resume_limit": 1})
    assert client.post("/api/resumes", headers=bob, json={"name": "CV 1", "resume_text": "t"}).status_code == 200
    resp = client.post("/api/resumes", headers=bob, json={"name": "CV 2", "resume_text": "t"})
    assert resp.status_code == 409
    assert resp.json()["detail"]["max"] == 1


def test_invalid_limit_rejected(client: TestClient, monkeypatch):
    owner = _owner(client, monkeypatch)
    bob = {"Authorization": f"Bearer {_token('bob@example.com')}"}
    client.get("/api/settings", headers=bob)
    uid = _uid_for(client, owner, "bob@example.com")
    resp = client.patch(f"/api/admin/users/{uid}", headers=owner, json={"analysis_limit": 999_999})
    assert resp.status_code == 400


# ── Grant / revoke admin ──────────────────────────────────────────────────────

def test_grant_admin_via_console(client: TestClient, monkeypatch):
    import config
    import main

    monkeypatch.setattr(config, "ADMIN_EMAILS", ["owner@example.com"])
    monkeypatch.setattr(main, "MAX_RESUMES_PER_USER", 1)
    owner = _owner(client, monkeypatch)
    bob = {"Authorization": f"Bearer {_token('bob@example.com')}"}
    client.get("/api/settings", headers=bob)
    uid = _uid_for(client, owner, "bob@example.com")

    # Before the grant, bob is capped at 1 resume.
    client.post("/api/resumes", headers=bob, json={"name": "CV 1", "resume_text": "t"})
    assert client.post("/api/resumes", headers=bob, json={"name": "CV 2", "resume_text": "t"}).status_code == 409

    # Owner grants admin → bob now bypasses the cap.
    assert client.patch(f"/api/admin/users/{uid}", headers=owner, json={"admin": True}).status_code == 200
    assert client.post("/api/resumes", headers=bob, json={"name": "CV 2", "resume_text": "t"}).status_code == 200
    # …and appears as admin in the directory.
    users = client.get("/api/admin/users", headers=owner).json()["users"]
    assert next(u for u in users if u["email"] == "bob@example.com")["is_admin"] is True


def test_revoke_admin_via_console(client: TestClient, monkeypatch):
    import config
    import main

    monkeypatch.setattr(config, "ADMIN_EMAILS", ["owner@example.com"])
    monkeypatch.setattr(main, "MAX_RESUMES_PER_USER", 1)
    owner = _owner(client, monkeypatch)
    bob = {"Authorization": f"Bearer {_token('bob@example.com')}"}
    client.get("/api/settings", headers=bob)
    uid = _uid_for(client, owner, "bob@example.com")

    client.patch(f"/api/admin/users/{uid}", headers=owner, json={"admin": True})
    client.post("/api/resumes", headers=bob, json={"name": "CV 1", "resume_text": "t"})
    assert client.post("/api/resumes", headers=bob, json={"name": "CV 2", "resume_text": "t"}).status_code == 200

    # Revoke → cap applies again.
    client.patch(f"/api/admin/users/{uid}", headers=owner, json={"admin": False})
    assert client.post("/api/resumes", headers=bob, json={"name": "CV 3", "resume_text": "t"}).status_code == 409


# ── Clear a user's storage ────────────────────────────────────────────────────

def test_admin_clears_user_storage(client: TestClient, monkeypatch):
    import config

    monkeypatch.setattr(config, "ADMIN_EMAILS", ["owner@example.com"])
    owner = _owner(client, monkeypatch)

    client.post(
        "/api/applications",
        headers=auth("alice"),
        json={"company": "ACME", "position": "R", "location": "B", "description": "jd"},
    )
    client.post("/api/resumes", headers=auth("alice"), json={"name": "CV", "resume_text": "t"})
    alice_uid = _uid_for(client, owner, "")  # alice's token is not a JWT → no email

    resp = client.post(
        f"/api/admin/users/{alice_uid}/clear",
        headers=owner,
        json={"scope": "all"},
    )
    assert resp.status_code == 200
    assert resp.json()["stats"]["applications"] == 1
    assert resp.json()["stats"]["resumes"] == 1
    assert client.get("/api/applications", headers=auth("alice")).json() == []
    assert client.get("/api/resumes", headers=auth("alice")).json()["resumes"] == []


# ── Activity log ──────────────────────────────────────────────────────────────

def test_activity_log_records_app_creation(client: TestClient, monkeypatch):
    client.post(
        "/api/applications",
        headers=auth("alice"),
        json={"company": "ACME", "position": "R", "location": "B", "description": "jd"},
    )
    body = client.get("/api/admin/activity", headers=_owner(client, monkeypatch)).json()
    assert len(body) >= 1
    assert body[0]["action"] == "app_create"
    assert "ACME" in body[0]["detail"]
