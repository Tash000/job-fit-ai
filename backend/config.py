"""
Central configuration for the Vitralume backend.

All configuration comes from environment variables (optionally loaded from a
`.env` file via python-dotenv). Secrets are NEVER hardcoded here.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env (or cwd .env) if present. Real secrets live in env vars /
# platform secret managers in production.
_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR / ".env")
load_dotenv()  # fall back to cwd

APP_ENV = os.getenv("APP_ENV", "development").strip().lower()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{( _BACKEND_DIR / 'copilot.db').as_posix()}",
)

# ── Supabase (auth) ──────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "").strip()

# ── Encryption master key ────────────────────────────────────────────────────
# Fernet key (44-char urlsafe base64). Used to encrypt users' provider keys.
APP_ENCRYPTION_KEY = os.getenv("APP_ENCRYPTION_KEY", "").strip()

# ── CORS / origins ───────────────────────────────────────────────────────────
def _split_list(raw: str) -> list[str]:
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]

APP_ORIGINS = _split_list(os.getenv(
    "APP_ORIGINS",
    "http://localhost:5173,http://localhost:8000,http://127.0.0.1:5173,http://127.0.0.1:8000",
))
APP_PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "http://localhost:8000").strip().rstrip("/")

# ── Rate limiting ────────────────────────────────────────────────────────────
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").strip().lower() in ("1", "true", "yes")
GENERATION_RATE_LIMIT = os.getenv("GENERATION_RATE_LIMIT", "10/minute")
AUTH_RATE_LIMIT = os.getenv("AUTH_RATE_LIMIT", "30/minute")

# ── Server-level default provider keys (optional, used only if a user has none) ──
GEMINI_SERVER_KEYS = _split_list(os.getenv("GEMINI_SERVER_KEYS", ""))
NIM_SERVER_KEYS = _split_list(os.getenv("NIM_SERVER_KEYS", ""))

# ── Demo mode ────────────────────────────────────────────────────────────────
# When Supabase is not configured AND environment is not production, the API
# runs in a single-user demo mode (fixed dev user) so the app is runnable out
# of the box. This is FOR DEVELOPMENT ONLY.
DEMO_MODE = APP_ENV != "production" and not (SUPABASE_URL and SUPABASE_JWT_SECRET)
DEV_USER_ID = "00000000-0000-0000-0000-000000000001"


def validate_production_config() -> None:
    """Fail fast if production configuration is unsafe."""
    if APP_ENV != "production":
        return
    missing = []
    if not SUPABASE_URL or not SUPABASE_JWT_SECRET:
        missing.append("SUPABASE_URL / SUPABASE_JWT_SECRET")
    if not APP_ENCRYPTION_KEY:
        missing.append("APP_ENCRYPTION_KEY")
    if len(APP_ENCRYPTION_KEY) < 32:
        missing.append("APP_ENCRYPTION_KEY (weak)")
    if missing:
        raise RuntimeError(
            "Refusing to start in production: missing configuration "
            f"({', '.join(missing)}). See backend/.env.example"
        )
