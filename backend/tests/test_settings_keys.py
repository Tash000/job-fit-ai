"""Write-only API key contract tests.

Provider keys must never be returned in plaintext and must be isolated per user.
"""

from tests.conftest import auth

GEMINI_KEY = "AIzaSyRealLookingKey1234567890abcdefghij"


def test_keys_are_never_returned_raw(client):
    resp = client.post(
        "/api/settings",
        headers=auth("alice"),
        json={"gemini_api_keys": [GEMINI_KEY]},
    )
    assert resp.status_code == 200

    body = client.get("/api/settings", headers=auth("alice")).json()
    assert GEMINI_KEY not in str(body)
    previews = body["keyInfo"]["gemini"]
    assert len(previews) == 1
    assert "AIza••••" in previews[0]["masked"]
    assert "RealLookingKey" not in previews[0]["masked"]


def test_keys_isolated_between_users(client):
    client.post("/api/settings", headers=auth("alice"), json={"gemini_api_keys": [GEMINI_KEY]})

    bob = client.get("/api/settings", headers=auth("bob")).json()
    assert bob["keyInfo"]["gemini"] == []


def test_key_replacement_and_removal(client):
    # Store two keys.
    client.post(
        "/api/settings",
        headers=auth("alice"),
        json={"gemini_api_keys": ["key-one-12345678", "key-two-12345678"]},
    )
    previews = client.get("/api/settings", headers=auth("alice")).json()["keyInfo"]["gemini"]
    assert len(previews) == 2

    # Remove index 0.
    client.post("/api/settings", headers=auth("alice"), json={"gemini_remove": [0]})
    previews = client.get("/api/settings", headers=auth("alice")).json()["keyInfo"]["gemini"]
    assert len(previews) == 1
    assert previews[0]["masked"].endswith("5678")

    # Replace with a single new key.
    client.post("/api/settings", headers=auth("alice"), json={"gemini_api_keys": ["brand-new-key-1234"]})
    previews = client.get("/api/settings", headers=auth("alice")).json()["keyInfo"]["gemini"]
    assert len(previews) == 1
    assert previews[0]["masked"].endswith("1234")


def test_non_secret_settings_update_keeps_keys(client):
    client.post("/api/settings", headers=auth("alice"), json={"gemini_api_keys": [GEMINI_KEY]})
    client.post("/api/settings", headers=auth("alice"), json={"active_provider": "ollama"})

    body = client.get("/api/settings", headers=auth("alice")).json()
    assert body["active_provider"] == "ollama"
    assert len(body["keyInfo"]["gemini"]) == 1  # keys untouched
