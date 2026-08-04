"""Authentication behaviour tests."""

import pytest

import main
import security
from fastapi.testclient import TestClient

from tests.conftest import auth


def test_missing_token_is_rejected(client: TestClient):
    resp = client.get("/api/applications")
    assert resp.status_code == 401
    assert "Bearer" in resp.headers.get("WWW-Authenticate", "")


def test_invalid_token_is_rejected(client: TestClient, monkeypatch):
    def boom(token: str):
        raise security.AuthError("Invalid token")

    monkeypatch.setattr(security, "_decode_supabase_token", boom)
    resp = client.get("/api/applications", headers=auth("forged"))
    assert resp.status_code == 401


def test_valid_token_allows_access(client: TestClient):
    resp = client.get("/api/applications", headers=auth("alice"))
    assert resp.status_code == 200
    assert resp.json() == []


def test_applications_are_user_scoped(client: TestClient):
    # Alice creates an application.
    resp = client.post(
        "/api/applications",
        headers=auth("alice"),
        json={"company": "ACME", "position": "Researcher", "location": "Berlin", "description": "jd"},
    )
    assert resp.status_code == 200
    app_id = resp.json()["id"]

    # Bob cannot see it…
    assert client.get("/api/applications", headers=auth("bob")).json() == []
    # …and cannot fetch/delete/modify it.
    assert client.get(f"/api/applications/{app_id}", headers=auth("bob")).status_code == 404
    assert client.delete(f"/api/applications/{app_id}", headers=auth("bob")).status_code == 404
    assert client.post(f"/api/applications/{app_id}/analyze", headers=auth("bob")).status_code == 404

    # Alice can.
    assert client.get(f"/api/applications/{app_id}", headers=auth("alice")).status_code == 200


def test_profile_is_user_scoped(client: TestClient):
    client.post(
        "/api/profile",
        headers=auth("alice"),
        json={"resume_text": "Alice's resume", "parsed_profile": {"name": "Alice"}},
    )
    bob = client.get("/api/profile", headers=auth("bob")).json()
    assert bob["parsed_profile"]["name"] == ""  # Bob sees an empty profile
    alice = client.get("/api/profile", headers=auth("alice")).json()
    assert alice["parsed_profile"]["name"] == "Alice"
