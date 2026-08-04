"""
Security primitives for Vitralume.

- `require_user`: FastAPI dependency that authenticates the caller from a
  Supabase JWT (`Authorization: Bearer <token>`) and returns the user id.
- `KeyCipher`: Fernet (AES-128-CBC) encryption for users' provider API keys.
- `mask_key`: masked previews (write-only key model).
- `SecurityHeadersMiddleware`: hardened HTTP response headers.
"""

import logging
import uuid
from typing import Optional

import jwt as pyjwt
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, Request, status

import config

log = logging.getLogger("vitralume.security")

# ──────────────────────────────────────────────────────────────────────────────
# Authentication
# ──────────────────────────────────────────────────────────────────────────────


class AuthError(Exception):
    """Raised when authentication fails."""


def _decode_supabase_token(token: str) -> str:
    """Validate a Supabase access token and return the user id (sub)."""
    if not config.SUPABASE_JWT_SECRET:
        raise AuthError("Server auth is not configured")
    try:
        payload = pyjwt.decode(
            token,
            config.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
            options={"require": ["exp", "sub"]},
        )
    except pyjwt.ExpiredSignatureError as exc:
        raise AuthError("Token expired") from exc
    except pyjwt.InvalidAudienceError as exc:
        raise AuthError("Token audience mismatch") from exc
    except pyjwt.PyJWTError as exc:
        raise AuthError("Invalid token") from exc

    sub = payload.get("sub")
    if not sub:
        raise AuthError("Token missing subject")
    # Normalise to a canonical string (Supabase uses UUIDs).
    try:
        return str(uuid.UUID(sub))
    except ValueError:
        raise AuthError("Token subject is not a valid user id") from None


def current_user_id(request: Request) -> str:
    """
    FastAPI dependency: returns the authenticated user id (string UUID).

    - Production / configured: validates the Supabase JWT from the Bearer header.
    - Demo mode (local dev, Supabase not configured): returns a fixed dev user.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.lower().startswith("bearer "):
        if config.DEMO_MODE:
            log.warning("DEMO MODE: unauthenticated request mapped to dev user. NEVER use in production.")
            return config.DEV_USER_ID
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header[7:].strip()
    try:
        return _decode_supabase_token(token)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ──────────────────────────────────────────────────────────────────────────────
# API key encryption (write-only secret model)
# ──────────────────────────────────────────────────────────────────────────────


_FERNET_INSTANCE: Optional[Fernet] = None


def _fernet() -> Fernet:
    """
    Build (once) a Fernet instance from the configured master key.

    Cached so that encryption and decryption always use the same key within a
    process — including the dev-mode ephemeral key.
    """
    global _FERNET_INSTANCE
    if _FERNET_INSTANCE is not None:
        return _FERNET_INSTANCE

    key = config.APP_ENCRYPTION_KEY
    if not key:
        if config.APP_ENV == "production":
            raise RuntimeError("APP_ENCRYPTION_KEY is not configured")
        # Dev convenience: ephemeral key for the process. Keys encrypted with it
        # will not survive a restart — acceptable for local demos.
        log.warning("APP_ENCRYPTION_KEY not set: using ephemeral key (dev only).")
        key = Fernet.generate_key().decode()
    try:
        _FERNET_INSTANCE = Fernet(key.encode() if isinstance(key, str) else key)
    except (ValueError, TypeError) as exc:
        raise RuntimeError(
            "APP_ENCRYPTION_KEY is not a valid Fernet key. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        ) from exc
    return _FERNET_INSTANCE


class KeyCipher:
    """Encrypts/decrypts provider API keys at rest."""

    @staticmethod
    def encrypt(plain_key: str) -> str:
        token = _fernet().encrypt(plain_key.encode("utf-8"))
        return token.decode("utf-8")

    @staticmethod
    def decrypt(encrypted: str) -> str:
        try:
            return _fernet().decrypt(encrypted.encode("utf-8")).decode("utf-8")
        except (InvalidToken, ValueError, TypeError) as exc:
            raise InvalidToken("Failed to decrypt API key (wrong master key?)") from exc

    @staticmethod
    def mask(plain_key: str) -> str:
        """Return a masked preview like ``AIza••••wxyz`` — never the full key."""
        return mask_key(plain_key)


def mask_key(key: str) -> str:
    """Mask a secret, keeping the prefix and last 4 chars."""
    if not key:
        return ""
    if len(key) <= 8:
        return "•" * len(key)
    head = key[:4]
    tail = key[-4:]
    return f"{head}••••{tail}"


# ──────────────────────────────────────────────────────────────────────────────
# Security headers middleware
# ──────────────────────────────────────────────────────────────────────────────


class SecurityHeadersMiddleware:
    """Adds hardened response headers to every HTTP response."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = message.get("headers", [])
                extra = [
                    (b"X-Content-Type-Options", b"nosniff"),
                    (b"X-Frame-Options", b"DENY"),
                    (b"Referrer-Policy", b"strict-origin-when-cross-origin"),
                    (b"Permissions-Policy", b"camera=(), microphone=(), geolocation=()"),
                    (b"Content-Security-Policy",
                     b"default-src 'self'; script-src 'self'; "
                     b"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                     b"img-src 'self' data: https:; "
                     b"font-src 'self' https://fonts.gstatic.com data:; "
                     b"connect-src 'self' https://*.supabase.co https://api.openai.com https://generativelanguage.googleapis.com"),
                    (b"Cross-Origin-Opener-Policy", b"same-origin"),
                ]
                if config.APP_ENV == "production":
                    extra.append((b"Strict-Transport-Security", b"max-age=31536000; includeSubDomains"))
                message["headers"] = list(headers) + extra
            await send(message)

        await self.app(scope, receive, send_wrapper)


# ──────────────────────────────────────────────────────────────────────────────
# Rate limiting helpers
# ──────────────────────────────────────────────────────────────────────────────


class InMemoryRateLimiter:
    """Tiny fixed-window limiter (per-instance). Swap for Redis in multi-instance deploys."""

    def __init__(self, limit: int, window_seconds: int = 60):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str) -> bool:
        import time

        now = time.monotonic()
        bucket = [t for t in self._hits.get(key, []) if now - t < self.window]
        if len(bucket) >= self.limit:
            self._hits[key] = bucket
            return False
        bucket.append(now)
        self._hits[key] = bucket
        return True


# Parse "10/minute" style limits.
def parse_limit(spec: str) -> tuple[int, int]:
    try:
        amount, unit = spec.strip().split("/")
        window = 60 if unit in ("minute", "min") else 3600 if unit == "hour" else 1
        return int(amount), window
    except (ValueError, AttributeError):
        return 10, 60
