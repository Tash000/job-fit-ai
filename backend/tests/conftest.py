"""Shared test fixtures.

Environment is configured BEFORE importing the app so that config/database
pick up the test settings.
"""

import os
import uuid

import pytest

from cryptography.fernet import Fernet

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite:///./test_vitralume.db"
os.environ["APP_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
os.environ["SUPABASE_URL"] = "https://test-project.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "test-anon-key"
os.environ["SUPABASE_JWT_SECRET"] = "test-jwt-secret"
os.environ["RATE_LIMIT_ENABLED"] = "false"

import main  # noqa: E402
import security  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

# Ensure the test database schema exists (also covers unit tests that don't
# exercise the FastAPI lifespan).
main.db.init_db()


@pytest.fixture(autouse=True)
def clean_db():
    """Wipe all tables after each test so tests are order-independent."""
    yield
    session = main.db.SessionLocal()
    try:
        for model in (main.db.UserSettings, main.db.Profile, main.db.Application, main.db.CompanyResearch):
            session.query(model).delete()
        session.commit()
    finally:
        session.close()


@pytest.fixture(autouse=True)
def fake_auth(monkeypatch):
    """Map any Bearer token to a deterministic, unique user id."""
    def fake_decode(token: str) -> str:
        digest = uuid.uuid5(uuid.NAMESPACE_URL, token)
        return str(digest)

    monkeypatch.setattr(security, "_decode_supabase_token", fake_decode)
    yield


@pytest.fixture(scope="session")
def client():
    with TestClient(main.app) as c:
        yield c


def auth(token: str = "alice") -> dict:
    return {"Authorization": f"Bearer {token}"}
