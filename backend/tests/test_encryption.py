"""Tests for KeyCipher (Fernet encryption) and masking."""

import pytest
from cryptography.fernet import InvalidToken

from security import KeyCipher, mask_key


def test_roundtrip():
    key = "AIzaSyDummyKey1234567890abcdefghijklmnop"
    encrypted = KeyCipher.encrypt(key)
    assert encrypted != key
    assert KeyCipher.decrypt(encrypted) == key


def test_encrypted_values_are_unique():
    key = "nvapi-abcdef123456"
    assert KeyCipher.encrypt(key) != KeyCipher.encrypt(key)  # random IV/nonce


def test_decrypt_with_wrong_key_fails(monkeypatch):
    from cryptography.fernet import Fernet

    # Encrypt with the configured key, then rotate the key and expect failure.
    encrypted = KeyCipher.encrypt("secret-key-123")
    wrong_key = Fernet.generate_key().decode()
    monkeypatch.setattr("security.config.APP_ENCRYPTION_KEY", wrong_key)
    monkeypatch.setattr("security._FERNET_INSTANCE", None)  # force rebuild with the wrong key
    with pytest.raises(InvalidToken):
        KeyCipher.decrypt(encrypted)


def test_mask():
    assert mask_key("AIzaSyDummyKey1234567890abcdefghijklmnop") == "AIza••••mnop"
    assert mask_key("short") == "•••••"
    assert mask_key("") == ""


def test_key_cipher_mask_matches():
    assert KeyCipher.mask("ABCD12345678") == "ABCD••••5678"
