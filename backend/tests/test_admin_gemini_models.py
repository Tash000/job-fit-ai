"""Tests for the admin-managed top-5 Gemini model list.

Covers: access control, GET/PUT of the platform default, automatic
propagation to accounts that have NOT customized their list, honoring a
user's custom override, and returning to the admin default via reset.
"""

import datetime
import uuid

from fastapi.testclient import TestClient

from tests.conftest import auth


def _token(email: str) -> str:
    import jwt as pyjwt

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


def _user(token: str = "alice") -> dict:
    return auth(token)


# ── Access control ────────────────────────────────────────────────────────────

def test_gemini_models_endpoints_require_admin(client: TestClient):
    assert client.get("/api/admin/gemini-models", headers=_user()).status_code == 403
    assert client.put("/api/admin/gemini-models", json={"models": ["x"]}, headers=_user()).status_code == 403


def test_gemini_models_default_list(client: TestClient, monkeypatch):
    """GET returns the platform default (seeded from DEFAULT_GEMINI_MODELS)."""
    import main

    data = client.get("/api/admin/gemini-models", headers=_owner(client, monkeypatch)).json()
    assert data["models"] == main.DEFAULT_GEMINI_MODELS


# ── Admin PUT: validation ─────────────────────────────────────────────────────

def test_set_gemini_models_validates(client: TestClient, monkeypatch):
    owner = _owner(client, monkeypatch)
    # Empty list → 400.
    assert client.put("/api/admin/gemini-models", json={"models": []}, headers=owner).status_code == 400
    assert client.put("/api/admin/gemini-models", json={"models": ["  "]}, headers=owner).status_code == 400
    # More than 5 → 400.
    resp = client.put(
        "/api/admin/gemini-models",
        json={"models": [f"gemini-{i}" for i in range(6)]},
        headers=owner,
    )
    assert resp.status_code == 400


def test_set_gemini_models_dedupes_and_strips(client: TestClient, monkeypatch):
    owner = _owner(client, monkeypatch)
    resp = client.put(
        "/api/admin/gemini-models",
        json={"models": [" gemini-3.5-flash ", "gemini-3.5-flash", "gemini-2.0-flash", "", "  "]},
        headers=owner,
    )
    assert resp.status_code == 200
    assert resp.json()["models"] == ["gemini-3.5-flash", "gemini-2.0-flash"]


def test_set_gemini_models_caps_at_five(client: TestClient, monkeypatch):
    owner = _owner(client, monkeypatch)
    models = [f"gemini-{i}" for i in range(1, 6)]
    resp = client.put("/api/admin/gemini-models", json={"models": models}, headers=owner)
    assert resp.status_code == 200
    assert resp.json()["models"] == models


# ── Propagation to non-custom users ──────────────────────────────────────────

def test_platform_default_reaches_non_custom_users(client: TestClient, monkeypatch):
    """A user who never saved a custom list sees the admin's top-5 via GET /api/settings."""
    owner = _owner(client, monkeypatch)
    models = ["gemini-3.5-flash", "gemini-2.5-pro", "gemini-1.5-pro", "gemini-2.0-flash", "gemini-2.5-flash"]
    resp = client.put("/api/admin/gemini-models", json={"models": models}, headers=owner)
    assert resp.status_code == 200

    data = client.get("/api/settings", headers=_user()).json()
    assert data["gemini_models"] == models
    assert data["gemini_models_custom"] is False
    assert data["gemini_default_models"] == models


def test_new_settings_seeded_from_platform_default(client: TestClient, monkeypatch):
    """Freshly created user settings are seeded with the admin's list."""
    import main

    owner = _owner(client, monkeypatch)
    client.put("/api/admin/gemini-models", json={"models": ["gemini-3.5-flash", "gemini-2.5-pro"]}, headers=owner)

    # Force a new settings row for a brand-new user.
    main._get_or_create_settings(main.db.SessionLocal(), "fresh-user")
    data = client.get("/api/settings", headers=_user("fresh-user")).json()
    assert data["gemini_models"] == ["gemini-3.5-flash", "gemini-2.5-pro"]


# ── Custom override ──────────────────────────────────────────────────────────

def test_user_custom_list_wins_over_platform_default(client: TestClient, monkeypatch):
    """A user who saves their own list keeps it after an admin change."""
    owner = _owner(client, monkeypatch)
    client.put("/api/admin/gemini-models", json={"models": ["gemini-3.5-flash", "gemini-2.0-flash"]}, headers=owner)

    # User saves a custom list.
    resp = client.patch("/api/settings", json={"gemini_models": ["my-custom-model"]}, headers=_user())
    assert resp.status_code == 200
    assert resp.json()["settings"]["gemini_models"] == ["my-custom-model"]
    assert resp.json()["settings"]["gemini_models_custom"] is True

    # Admin changes the platform list → the user's custom list is untouched.
    client.put("/api/admin/gemini-models", json={"models": ["gemini-9.9-flash"]}, headers=owner)
    data = client.get("/api/settings", headers=_user()).json()
    assert data["gemini_models"] == ["my-custom-model"]
    assert data["gemini_default_models"] == ["gemini-9.9-flash"]


def test_user_can_rejoin_admin_default(client: TestClient, monkeypatch):
    """Sending gemini_models_custom=False returns the user to the admin list."""
    owner = _owner(client, monkeypatch)
    client.put("/api/admin/gemini-models", json={"models": ["gemini-3.5-flash", "gemini-2.5-pro"]}, headers=owner)
    client.patch("/api/settings", json={"gemini_models": ["custom-a"]}, headers=_user())

    resp = client.patch("/api/settings", json={"gemini_models_custom": False}, headers=_user())
    assert resp.status_code == 200
    assert resp.json()["settings"]["gemini_models_custom"] is False
    assert resp.json()["settings"]["gemini_models"] == ["gemini-3.5-flash", "gemini-2.5-pro"]


# ── Reset behavior ───────────────────────────────────────────────────────────

def test_reset_keys_returns_to_platform_default(client: TestClient, monkeypatch):
    """The Danger-Zone reset restores the admin's top-5, not the code default."""
    import config
    import main

    monkeypatch.setattr(config, "DEMO_MODE", True)
    owner = _owner(client, monkeypatch)
    client.put("/api/admin/gemini-models", json={"models": ["gemini-3.5-flash", "gemini-2.5-pro"]}, headers=owner)
    client.patch("/api/settings", json={"gemini_models": ["custom-a"]}, headers=_user())

    resp = client.post("/api/account/clear", json={"scope": "keys", "password": "anything"}, headers=_user())
    assert resp.status_code == 200

    data = client.get("/api/settings", headers=_user()).json()
    assert data["gemini_models_custom"] is False
    assert data["gemini_models"] == ["gemini-3.5-flash", "gemini-2.5-pro"]
    assert data["gemini_default_models"] == ["gemini-3.5-flash", "gemini-2.5-pro"]


def test_platform_default_is_used_by_generator(client: TestClient, monkeypatch):
    """build_generator_for resolves the admin list for non-custom users."""
    import main

    owner = _owner(client, monkeypatch)
    client.put("/api/admin/gemini-models", json={"models": ["gemini-3.5-flash", "gemini-2.5-pro"]}, headers=owner)
    session = main.db.SessionLocal()
    try:
        gen = main.build_generator_for("gen-user", session)
        assert gen._gemini.models == ["gemini-3.5-flash", "gemini-2.5-pro"]
    finally:
        session.close()
