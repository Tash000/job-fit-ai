"""Tests for admin email whitelisting and the display-name greeting field."""

import datetime
import uuid

from fastapi.testclient import TestClient

from tests.conftest import auth

# A real-looking JWT so `_email_from_request` can read the `email` claim.
def _token(email: str) -> str:
    import jwt as pyjwt

    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "sub": str(uuid.uuid4()),
        "aud": "authenticated",
        "email": email,
        "iat": now,
        "exp": now + datetime.timedelta(hours=1),
    }
    return pyjwt.encode(payload, "test-jwt-secret", algorithm="HS256")


# ── Admin email settings round-trip ───────────────────────────────────────────

def test_admin_emails_roundtrip_and_dedupe(client: TestClient):
    resp = client.patch(
        "/api/settings",
        headers=auth("alice"),
        json={"admin_emails": ["Owner@Example.com", "owner@example.com", "friend@x.com"]},
    )
    assert resp.status_code == 200
    settings = client.get("/api/settings", headers=auth("alice")).json()
    # Lowercased + de-duplicated, order preserved.
    assert settings["admin_emails"] == ["owner@example.com", "friend@x.com"]


def test_admin_emails_reject_malformed(client: TestClient):
    """Non-email junk (SQL-ish / malformed) is never stored."""
    resp = client.patch(
        "/api/settings",
        headers=auth("alice"),
        json={"admin_emails": ["valid@example.com", "not-an-email", "Bob'; DROP TABLE--", "@missing"]},
    )
    assert resp.status_code == 200
    settings = client.get("/api/settings", headers=auth("alice")).json()
    assert settings["admin_emails"] == ["valid@example.com"]


def test_admin_emails_are_user_scoped(client: TestClient):
    client.patch("/api/settings", headers=auth("alice"), json={"admin_emails": ["owner@example.com"]})
    assert client.get("/api/settings", headers=auth("bob")).json()["admin_emails"] == []


# ── Admin bypass: 500-analysis storage limit ──────────────────────────────────

def test_admin_bypasses_analysis_limit(client: TestClient, monkeypatch):
    import main

    monkeypatch.setattr(main, "MAX_ANALYSES_PER_USER", 3)
    headers = {"Authorization": f"Bearer {_token('owner@example.com')}"}

    # Whitelist own email as admin.
    assert client.patch("/api/settings", headers=headers, json={"admin_emails": ["owner@example.com"]}).status_code == 200

    for i in range(5):  # 3 would be the cap for a normal user
        resp = client.post(
            "/api/applications",
            headers=headers,
            json={"company": "ACME", "position": "R", "location": "B", "description": f"jd {i}"},
        )
        assert resp.status_code == 200, resp.text
    assert len(client.get("/api/applications", headers=headers).json()) == 5


def test_non_admin_still_hits_analysis_limit(client: TestClient, monkeypatch):
    import main

    monkeypatch.setattr(main, "MAX_ANALYSES_PER_USER", 2)
    headers = {"Authorization": f"Bearer {_token('someone@example.com')}"}

    for i in range(2):
        assert client.post(
            "/api/applications",
            headers=headers,
            json={"company": "ACME", "position": "R", "location": "B", "description": f"jd {i}"},
        ).status_code == 200
    resp = client.post(
        "/api/applications",
        headers=headers,
        json={"company": "ACME", "position": "R", "location": "B", "description": "jd overflow"},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["reason"] == "limit"


# ── Admin bypass: 5-resume storage limit ─────────────────────────────────────

def test_admin_bypasses_resume_limit(client: TestClient, monkeypatch):
    import main

    monkeypatch.setattr(main, "MAX_RESUMES_PER_USER", 2)
    headers = {"Authorization": f"Bearer {_token('owner@example.com')}"}
    assert client.patch("/api/settings", headers=headers, json={"admin_emails": ["owner@example.com"]}).status_code == 200

    for i in range(4):
        resp = client.post(
            "/api/resumes",
            headers=headers,
            json={"name": f"CV {i}", "resume_text": f"text {i}"},
        )
        assert resp.status_code == 200, resp.text
    assert len(client.get("/api/resumes", headers=headers).json()["resumes"]) == 4


def test_server_level_admin_env_bypasses_limits(client: TestClient, monkeypatch):
    import config
    import main

    monkeypatch.setattr(config, "ADMIN_EMAILS", ["server@example.com"])
    monkeypatch.setattr(main, "MAX_RESUMES_PER_USER", 1)
    headers = {"Authorization": f"Bearer {_token('server@example.com')}"}

    # No per-user whitelist needed — the env list applies.
    for i in range(3):
        assert client.post(
            "/api/resumes",
            headers=headers,
            json={"name": f"CV {i}", "resume_text": f"text {i}"},
        ).status_code == 200


# ── Admin bypass: generation rate limit ──────────────────────────────────────

def test_admin_bypasses_generation_rate_limit(client: TestClient, monkeypatch):
    import main

    headers = {"Authorization": f"Bearer {_token('owner@example.com')}"}
    assert client.patch("/api/settings", headers=headers, json={"admin_emails": ["owner@example.com"]}).status_code == 200

    # Force RATE_LIMIT_ENABLED on and a tiny limit so a normal user would 429.
    monkeypatch.setattr(main.config, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(main, "_gen_limit", 1)
    monkeypatch.setattr(main, "_gen_window", 60)
    main.generation_limiter = main.security.InMemoryRateLimiter(1, 60)

    try:
        for _ in range(5):
            resp = client.post(
                "/api/jobs/extract",
                headers=headers,
                json={"raw_text": "Senior ML Engineer job description text"},
            )
            # No 429 for the admin — the call may 500 (no keys) but never rate-limit.
            assert resp.status_code != 429, resp.text
    finally:
        monkeypatch.setattr(main.config, "RATE_LIMIT_ENABLED", False)


# ── Display name (friendly greeting field) ───────────────────────────────────

def test_display_name_roundtrip(client: TestClient):
    resp = client.patch(
        "/api/profile",
        headers=auth("alice"),
        json={
            "resume_text": "resume",
            "parsed_profile": {"name": "Alice Researcher"},
            "display_name": "Tousif",
        },
    )
    assert resp.status_code == 200
    profile = client.get("/api/profile", headers=auth("alice")).json()
    assert profile["display_name"] == "Tousif"


def test_display_name_isolated_between_users_and_truncated(client: TestClient):
    client.patch(
        "/api/profile",
        headers=auth("alice"),
        json={"resume_text": "r", "parsed_profile": {"name": "A"}, "display_name": "Alice" * 20},
    )
    assert client.get("/api/profile", headers=auth("bob")).json()["display_name"] == ""
    # Long names are capped at 80 chars server-side.
    got = client.get("/api/profile", headers=auth("alice")).json()["display_name"]
    assert len(got) == 80
