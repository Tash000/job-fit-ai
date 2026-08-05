"""Authentication behaviour tests."""

import datetime
import uuid

import pytest

import main
import security
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from tests.conftest import auth

# The autouse `fake_auth` fixture replaces this with a stub for API tests; keep
# the real implementation to unit-test JWT verification directly.
_real_decode_supabase_token = security._decode_supabase_token


# ── JWT verification helpers (new + legacy signing) ──────────────────────────

def _mint_token(payload: dict, key, algorithm: str, kid: str | None = None) -> str:
    import jwt as pyjwt

    headers = {"kid": kid} if kid else {}
    return pyjwt.encode(payload, key, algorithm=algorithm, headers=headers)


def _make_es256_pair() -> tuple[str, str, object]:
    """Return (private_key, public_pem, FakeClient) for new-style Supabase tokens."""
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_pem = (
        private_key.public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )

    class _Key:
        key = public_pem

    class _Client:
        def get_signing_key_from_jwt(self, _token: str) -> _Key:
            return _Key()

    return private_key, public_pem, _Client()


def _future_payload(sub: str) -> dict:
    now = datetime.datetime.now(datetime.timezone.utc)
    return {
        "sub": sub,
        "aud": "authenticated",
        "iat": now,
        "exp": now + datetime.timedelta(hours=1),
    }


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


# ── JWT verification (new ES256 JWKS vs legacy HS256) ────────────────────────

def test_new_style_es256_token_verified_via_jwks(monkeypatch):
    """New Supabase projects sign access tokens with ES256 + JWKS keys."""
    private_key, _public_pem, fake_client = _make_es256_pair()
    sub = str(uuid.uuid4())
    token = _mint_token(_future_payload(sub), private_key, "ES256", kid="test-key-1")

    monkeypatch.setattr(security, "_get_jwks_client", lambda: fake_client)
    assert _real_decode_supabase_token(token) == sub


def test_legacy_hs256_token_still_verified(monkeypatch):
    """Older projects still sign with the HS256 shared secret."""
    sub = str(uuid.uuid4())
    token = _mint_token(_future_payload(sub), "test-jwt-secret", "HS256")

    monkeypatch.setattr(security, "_get_jwks_client", lambda: None)
    assert _real_decode_supabase_token(token) == sub


def test_forged_token_rejected_by_both_verifiers(monkeypatch):
    monkeypatch.setattr(security, "_get_jwks_client", lambda: None)
    with pytest.raises(security.AuthError):
        _real_decode_supabase_token("forged.token.value")


def test_expired_token_rejected(monkeypatch):
    sub = str(uuid.uuid4())
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {"sub": sub, "aud": "authenticated", "iat": now - datetime.timedelta(hours=2), "exp": now - datetime.timedelta(hours=1)}
    token = _mint_token(payload, "test-jwt-secret", "HS256")

    monkeypatch.setattr(security, "_get_jwks_client", lambda: None)
    with pytest.raises(security.AuthError, match="expired"):
        _real_decode_supabase_token(token)
