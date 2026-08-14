"""
Vitralume — Job Application Copilot API.

Every endpoint requires an authenticated user (Supabase JWT) and only ever
touches that user's own data. Users' provider API keys are encrypted at rest,
never returned to clients, and decrypted in memory only for the request that
needs them.
"""

import difflib
import json
import logging
import os
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import jwt as pyjwt
import requests as _requests
from cryptography.fernet import InvalidToken
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

import config
import database as db
import security
from database import (
    DEFAULT_FORBIDDEN_PHRASES,
    DEFAULT_GEMINI_MODELS,
    DEFAULT_NIM_MODELS,
    DEFAULT_TONE,
    FREE_ANALYSES_LIMIT,
    FREE_LETTERS_LIMIT,
    MAX_ANALYSES_PER_USER,
    MAX_RESUMES_PER_USER,
    RESUME_NAME_MAX,
    RESUME_NAME_PATTERN,
)
from security import KeyCipher, current_user_id
from services.ats_optimizer import calculate_ats_score, suggest_unused_projects
from services.exporter import export_docx, export_latex, export_pdf, export_txt
from services.generator import CopilotGenerator, NoProviderError
from services.job_scraper import scrape_url
from services.parser import parse_pdf
from services.research_matcher import match_research_profile

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("vitralume")

config.validate_production_config()

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    log.info(
        "Vitralume started — env=%s mode=%s",
        config.APP_ENV,
        "DEMO (auth bypassed)" if config.DEMO_MODE else "auth",
    )
    yield


app = FastAPI(
    title="Vitralume API",
    version="3.0",
    description="Job Application Copilot — suitability, ATS, research matching, and truthfulness-guarded cover letters.",
    lifespan=lifespan,
)

# ── CORS: locked to configured origins (never a wildcard with credentials) ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.APP_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)
app.add_middleware(security.SecurityHeadersMiddleware)


# ══════════════════════════════════════════════════════════════════════════════
# Pydantic models
# ══════════════════════════════════════════════════════════════════════════════

class SettingsUpdate(BaseModel):
    # Non-secret fields (optional → only update what's present)
    gemini_models: Optional[List[str]] = None
    # Explicitly rejoin the admin-managed default (send False to stop using a
    # custom list; sent together with gemini_models it still applies).
    gemini_models_custom: Optional[bool] = None
    nim_models: Optional[List[str]] = None
    nim_base_url: Optional[str] = None
    ollama_enabled: Optional[bool] = None
    ollama_base_url: Optional[str] = None
    ollama_model: Optional[str] = None
    active_provider: Optional[str] = None
    forbidden_phrases: Optional[List[str]] = None
    tone_settings: Optional[dict] = None
    admin_emails: Optional[List[str]] = None

    # Write-only secrets. Presence semantics (per provider):
    #   api_keys: null   → no change
    #   api_keys: []     → clear all stored keys
    #   api_keys: [..]   → replace all stored keys
    #   remove: [index]  → delete stored keys at those indexes
    gemini_api_keys: Optional[List[str]] = None
    nim_api_keys: Optional[List[str]] = None
    gemini_remove: Optional[List[int]] = None
    nim_remove: Optional[List[int]] = None


class ProfileUpdate(BaseModel):
    resume_text: str = ""
    parsed_profile: dict = {}
    display_name: Optional[str] = None


class ApplicationCreate(BaseModel):
    company: str = ""
    position: str = ""
    location: str = ""
    description: str = ""
    job_url: str = ""


class ApplicationGenerateRequest(BaseModel):
    style: str = "industrial"
    plan: List[dict] = []


class ApplicationPlanRequest(BaseModel):
    style: str = "industrial"


class JobExtractRequest(BaseModel):
    raw_text: str


class JobScrapeRequest(BaseModel):
    url: str


class CoverLetterRefineRequest(BaseModel):
    feedback: str
    style: str = "industrial"


# ══════════════════════════════════════════════════════════════════════════════
# Rate limiters (in-memory per instance)
# ══════════════════════════════════════════════════════════════════════════════

_gen_limit, _gen_window = security.parse_limit(config.GENERATION_RATE_LIMIT)
generation_limiter = security.InMemoryRateLimiter(_gen_limit, _gen_window)
_auth_limit, _auth_window = security.parse_limit(config.AUTH_RATE_LIMIT)
auth_limiter = security.InMemoryRateLimiter(_auth_limit, _auth_window)


def _is_admin_user(request: Request, user_id: str, db_session: Session) -> bool:
    """True when the caller's email is whitelisted as an admin (server-level
    ``ADMIN_EMAILS`` env or the user's own ``settings.admin_emails``).

    Admins bypass rate limits and per-account storage caps.

    In demo mode (single-user local dev) the owner is always an admin so the
    admin console is testable out of the box.
    """
    if config.DEMO_MODE:
        return True
    email = _email_from_request(request)
    if not email:
        return False
    email = email.strip().lower()
    if email in {e.strip().lower() for e in config.ADMIN_EMAILS}:
        return True
    row = db_session.query(db.UserSettings).filter_by(user_id=user_id).first()
    if row and row.admin_emails:
        return email in {e.strip().lower() for e in row.admin_emails}
    return False


def _check_generation_limit(request: Request, user_id: str, db_session: Session) -> None:
    if not config.RATE_LIMIT_ENABLED:
        return
    if _is_admin_user(request, user_id, db_session):
        return
    if not generation_limiter.allow(user_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait a moment.")


def _check_auth_limit(request: Request, user_id: str, db_session: Session) -> None:
    """Rate-limit sensitive actions (e.g. key/settings changes)."""
    if not config.RATE_LIMIT_ENABLED:
        return
    if _is_admin_user(request, user_id, db_session):
        return
    if not auth_limiter.allow(user_id):
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait a moment.")


# ══════════════════════════════════════════════════════════════════════════════
# Admin console: user directory, visit recording, activity audit trail
# ══════════════════════════════════════════════════════════════════════════════

def _record_visit(db_session: Session, user_id: str, email: str) -> None:
    """Upsert the users directory (email + last_seen) used by the admin console."""
    now = datetime.utcnow()
    row = db_session.query(db.User).filter_by(id=user_id).first()
    if row is None:
        db_session.add(db.User(id=user_id, email=email or "", created_at=now, last_seen=now))
        db_session.commit()
        return
    if email and row.email != email:
        row.email = email
    if row.last_seen is None or (now - row.last_seen).total_seconds() > 300:
        row.last_seen = now
        db_session.commit()


def authed_user(
    request: Request,
    user_id: str = Depends(current_user_id),
    db_session: Session = Depends(db.get_db),
) -> str:
    """Authenticated-user dependency that also records the visit for analytics.

    Used everywhere ``current_user_id`` used to be, so the users directory and
    last-seen data stay fresh without any extra client work.
    """
    email = _email_from_request(request)
    if config.DEMO_MODE and not email:
        email = "demo@local"
    _record_visit(db_session, user_id, email)
    return user_id


def _log_activity(db_session: Session, user_id: str, action: str, detail: str = "") -> None:
    """Append a row to the audit trail shown in the admin console."""
    db_session.add(db.ActivityLog(user_id=user_id, action=action, detail=(detail or "")[:255]))
    db_session.commit()


def _require_admin(
    request: Request,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
) -> str:
    """Dependency guarding every /api/admin/* endpoint."""
    if not _is_admin_user(request, user_id, db_session):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_id


# ══════════════════════════════════════════════════════════════════════════════
# Helpers: settings storage & key handling
# ══════════════════════════════════════════════════════════════════════════════

def _get_platform_settings(db_session: Session) -> db.PlatformSettings:
    """Singleton row holding admin-managed platform defaults (id=1)."""
    row = db_session.query(db.PlatformSettings).filter_by(id=1).first()
    if row is None:
        row = db.PlatformSettings(id=1, default_gemini_models=DEFAULT_GEMINI_MODELS)
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
    return row


def _platform_gemini_models(db_session: Session) -> List[str]:
    """The admin-managed top-5 Gemini model list (platform default)."""
    return _get_platform_settings(db_session).default_gemini_models or DEFAULT_GEMINI_MODELS


def _effective_gemini_models(row: db.UserSettings, platform_models: List[str]) -> List[str]:
    """A user's live Gemini list: their own if they customized it, else the
    admin-managed platform default. Non-custom accounts therefore follow the
    admin's top-5 automatically — no manual model entry needed."""
    if row.gemini_models_custom and row.gemini_models:
        return row.gemini_models
    return platform_models or DEFAULT_GEMINI_MODELS


def _get_or_create_settings(db_session: Session, user_id: str) -> db.UserSettings:
    row = db_session.query(db.UserSettings).filter_by(user_id=user_id).first()
    if row is None:
        row = db.UserSettings(
            user_id=user_id,
            gemini_keys_enc="[]",
            gemini_models=_platform_gemini_models(db_session),
            nim_keys_enc="[]",
            nim_models=DEFAULT_NIM_MODELS,
            forbidden_phrases=DEFAULT_FORBIDDEN_PHRASES,
            tone_settings=DEFAULT_TONE,
        )
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
    return row


def _decrypt_key_list(enc_json: str) -> List[str]:
    try:
        tokens = json.loads(enc_json or "[]")
    except json.JSONDecodeError:
        return []
    keys = []
    for tok in tokens:
        try:
            keys.append(KeyCipher.decrypt(tok))
        except InvalidToken:
            log.warning("Skipping undecryptable stored key (master key changed?)")
            continue
    return keys


def _encrypt_key_list(plain_keys: List[str]) -> str:
    return json.dumps([KeyCipher.encrypt(k.strip()) for k in plain_keys if k.strip()])


def _apply_key_edits(db_session: Session, row: db.UserSettings, payload: SettingsUpdate) -> None:
    """Handle write-only key updates: replacement and index-based removal.

    Semantics (per provider):
      - `api_keys: null`          → no change
      - `api_keys: []`            → clear ALL stored keys
      - `api_keys: [k1, k2, ...]` → replace all stored keys
      - `remove: [i1, i2, ...]`    → delete stored keys at those indexes
    """
    # 1. Removals by current index
    if payload.gemini_remove is not None:
        tokens = json.loads(row.gemini_keys_enc or "[]")
        tokens = [t for i, t in enumerate(tokens) if i not in set(payload.gemini_remove)]
        row.gemini_keys_enc = json.dumps(tokens)
    if payload.nim_remove is not None:
        tokens = json.loads(row.nim_keys_enc or "[]")
        tokens = [t for i, t in enumerate(tokens) if i not in set(payload.nim_remove)]
        row.nim_keys_enc = json.dumps(tokens)

    # 2. Explicit replacement/clearing (presence of the field, even empty)
    if payload.gemini_api_keys is not None:
        row.gemini_keys_enc = _encrypt_key_list(payload.gemini_api_keys)
    if payload.nim_api_keys is not None:
        row.nim_keys_enc = _encrypt_key_list(payload.nim_api_keys)


def settings_to_public(row: db.UserSettings, platform_models: Optional[List[str]] = None) -> Dict[str, Any]:
    """Public settings payload. Provider keys are MASKED, never returned raw.

    ``platform_models`` is the admin-managed Gemini default list; when omitted,
    the row's own list is used (callers without a session still work).
    """
    gemini_keys = json.loads(row.gemini_keys_enc or "[]")
    nim_keys = json.loads(row.nim_keys_enc or "[]")

    gemini_preview = []
    for i, token in enumerate(gemini_keys):
        try:
            gemini_preview.append({"index": i, "masked": KeyCipher.mask(KeyCipher.decrypt(token))})
        except InvalidToken:
            gemini_preview.append({"index": i, "masked": "••••••••"})

    nim_preview = []
    for i, token in enumerate(nim_keys):
        try:
            nim_preview.append({"index": i, "masked": KeyCipher.mask(KeyCipher.decrypt(token))})
        except InvalidToken:
            nim_preview.append({"index": i, "masked": "••••••••"})

    has_own_key = bool(_decrypt_key_list(row.gemini_keys_enc)) or bool(
        _decrypt_key_list(row.nim_keys_enc)
    ) or bool(row.ollama_enabled)

    return {
        "gemini_models": _effective_gemini_models(row, platform_models or []),
        # The admin-managed top-5 the account falls back to when it has not
        # customized its own list (None → platform default is in effect).
        "gemini_default_models": platform_models or DEFAULT_GEMINI_MODELS,
        "gemini_models_custom": bool(row.gemini_models_custom),
        "nim_models": row.nim_models or DEFAULT_NIM_MODELS,
        "nim_base_url": row.nim_base_url or "https://integrate.api.nvidia.com/v1",
        "ollama_enabled": bool(row.ollama_enabled),
        "ollama_base_url": row.ollama_base_url or "http://localhost:11434",
        "ollama_model": row.ollama_model or "llama3",
        "active_provider": row.active_provider or "gemini",
        "forbidden_phrases": row.forbidden_phrases or [],
        "tone_settings": row.tone_settings or {},
        "admin_emails": row.admin_emails or [],
        # True when the account holds its OWN provider key (no platform-key
        # dependency). Drives the "add your key" onboarding popup.
        "has_own_key": has_own_key,
        # Free allowance counters for accounts without their own key.
        "freeUsage": {
            "analysesUsed": int(row.free_analyses_used or 0),
            "analysesLimit": FREE_ANALYSES_LIMIT,
            "lettersUsed": int(row.free_letters_used or 0),
            "lettersLimit": FREE_LETTERS_LIMIT,
        },
        "keyInfo": {
            "gemini": gemini_preview,
            "nim": nim_preview,
        },
    }


def _generator_from_row(row: db.UserSettings, platform_models: Optional[List[str]] = None) -> CopilotGenerator:
    """Build an LLM router from a settings row (user's decrypted keys + server defaults)."""
    gemini_keys = _decrypt_key_list(row.gemini_keys_enc) or list(config.GEMINI_SERVER_KEYS)
    nim_keys = _decrypt_key_list(row.nim_keys_enc) or list(config.NIM_SERVER_KEYS)
    return CopilotGenerator(
        gemini_api_keys=gemini_keys,
        gemini_models=_effective_gemini_models(row, platform_models or []),
        nim_api_keys=nim_keys,
        nim_models=row.nim_models or DEFAULT_NIM_MODELS,
        nim_base_url=row.nim_base_url or "https://integrate.api.nvidia.com/v1",
        ollama_enabled=bool(row.ollama_enabled),
        ollama_base_url=row.ollama_base_url or "http://localhost:11434",
        ollama_model=row.ollama_model or "llama3",
        active_provider=row.active_provider or "gemini",
    )


def build_generator_for(user_id: str, db_session: Session) -> CopilotGenerator:
    """Build an LLM router using the user's decrypted keys (plus server defaults)."""
    return _generator_from_row(
        _get_or_create_settings(db_session, user_id),
        _platform_gemini_models(db_session),
    )


# ── Free tier & setup gates ───────────────────────────────────────────────────
#
# Accounts WITHOUT their own provider key get a small free allowance on the
# platform key (2 analyses + 1 cover letter). Once that is used up, every AI
# action requires the user's own key. Admins bypass everything.


def _user_has_own_key(row: db.UserSettings) -> bool:
    """True when the account configured its own provider key (any provider)."""
    return bool(_decrypt_key_list(row.gemini_keys_enc)) or bool(
        _decrypt_key_list(row.nim_keys_enc)
    ) or bool(row.ollama_enabled)


def _free_allowance_check(
    request: Request,
    user_id: str,
    db_session: Session,
    kind: str,
) -> db.UserSettings:
    """Gate AI actions for accounts without their own key.

    ``kind`` is ``"analyze"`` or ``"letter"``. Raises 402 when the free
    allowance is exhausted; returns the settings row otherwise. Admins and
    key-holders always pass.
    """
    row = _get_or_create_settings(db_session, user_id)
    if _is_admin_user(request, user_id, db_session) or _user_has_own_key(row):
        return row

    used, limit = (
        (int(row.free_analyses_used or 0), FREE_ANALYSES_LIMIT) if kind == "analyze"
        else (int(row.free_letters_used or 0), FREE_LETTERS_LIMIT)
    )
    if used >= limit:
        raise HTTPException(
            status_code=402,
            detail={
                "reason": "free_limit",
                "message": (
                    f"You've used your free allowance ({limit} "
                    + ("job analyses" if kind == "analyze" else "cover letter")
                    + "). Add your own Google Gemini API key in Settings to keep going."
                ),
                "used": used,
                "limit": limit,
            },
        )
    return row


def _consume_free_allowance(row: db.UserSettings, kind: str) -> None:
    """Increment the free-tier counter AFTER a successful AI action."""
    if kind == "analyze":
        row.free_analyses_used = int(row.free_analyses_used or 0) + 1
    else:
        row.free_letters_used = int(row.free_letters_used or 0) + 1


def _no_provider_http(exc: NoProviderError) -> HTTPException:
    """Convert a missing/broken-provider error into a friendly 503."""
    return HTTPException(status_code=503, detail=str(exc))


def _require_resume(profile_row: db.Profile) -> None:
    """Setup gate: analysis requires the user's OWN resume first."""
    if not (profile_row.resume_text or "").strip():
        raise HTTPException(
            status_code=400,
            detail={
                "reason": "no_resume",
                "message": "Upload your resume first — analyses are based on your own profile. Go to Resume & Profile and upload a PDF or paste your resume text.",
            },
        )


def _get_owned_application(db_session: Session, user_id: str, app_id: int) -> db.Application:
    row = db_session.query(db.Application).filter_by(id=app_id, user_id=user_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return row


def _get_owned_resume(db_session: Session, user_id: str, resume_id: int) -> db.Resume:
    row = db_session.query(db.Resume).filter_by(id=resume_id, user_id=user_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    return row


def _app_summary(r: db.Application) -> Dict[str, Any]:
    """List-item serialization of an application (includes tracking flags)."""
    return {
        "id": r.id,
        "company": r.company,
        "position": r.position,
        "location": r.location,
        "status": r.status,
        "match_score": r.match_score,
        "applied": bool(r.applied),
        "applied_date": r.applied_date,
        "follow_up": bool(r.follow_up),
        "bookmarked": bool(r.bookmarked),
        "job_url": r.job_url or "",
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "analyzed_at": r.analyzed_at.isoformat() if r.analyzed_at else None,
    }


def _app_detail(r: db.Application) -> Dict[str, Any]:
    """Full serialization of an application."""
    return {
        **_app_summary(r),
        "description": r.description,
        "details": r.details or {},
        "resume_suggestions": r.resume_suggestions or {},
        "cover_letter_plan": r.cover_letter_plan or [],
        "cover_letter": r.cover_letter,
        "audit_trail": r.audit_trail or [],
        "feedback": r.feedback or {},
    }


# ── Duplicate detection ───────────────────────────────────────────────────────

def _normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _find_duplicate_application(
    db_session: Session,
    user_id: str,
    company: str,
    position: str,
    description: str,
    exclude_id: Optional[int] = None,
) -> Optional[db.Application]:
    """
    Find an existing application with the SAME company (normalized) and a
    near-identical job description (or same company+position when both
    descriptions are empty). Returns the first match or ``None``.
    """
    norm_company = _normalize_text(company)
    if not norm_company:
        return None
    norm_position = _normalize_text(position)
    norm_desc = _normalize_text(description)

    query = db_session.query(db.Application).filter_by(user_id=user_id)
    if exclude_id is not None:
        query = query.filter(db.Application.id != exclude_id)

    for row in query.all():
        if _normalize_text(row.company) != norm_company:
            continue
        other_desc = _normalize_text(row.description or "")
        if norm_desc and other_desc:
            ratio = difflib.SequenceMatcher(None, norm_desc, other_desc).ratio()
            if ratio >= 0.9:
                return row
        elif not norm_desc and not other_desc:
            if norm_position and _normalize_text(row.position) == norm_position:
                return row
    return None


def _duplicate_error(row: db.Application) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "reason": "duplicate",
            "message": "You already have this job analyzed — same company and job description.",
            "existing_id": row.id,
            "existing_company": row.company,
            "existing_position": row.position,
        },
    )


# ── Resume name validation (injection-safe naming) ────────────────────────────

def _validate_resume_name(name: str) -> str:
    cleaned = (name or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Resume name cannot be empty.")
    if len(cleaned) > RESUME_NAME_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Resume name must be {RESUME_NAME_MAX} characters or fewer.",
        )
    if not re.match(RESUME_NAME_PATTERN, cleaned):
        raise HTTPException(
            status_code=400,
            detail="Resume name may only contain letters, numbers, spaces, dots, dashes and underscores.",
        )
    return cleaned


def _resume_summary(r: db.Resume) -> Dict[str, Any]:
    pp = r.parsed_profile or {}
    return {
        "id": r.id,
        "name": r.name,
        "is_active": bool(r.is_active),
        "profile_name": pp.get("name", ""),
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def _mirror_resume_to_profile(db_session: Session, user_id: str, resume_row: db.Resume) -> None:
    """Copy a resume's content into the Profile row that powers analysis."""
    row = _get_or_create_profile(db_session, user_id)
    row.resume_text = resume_row.resume_text or ""
    row.parsed_profile = resume_row.parsed_profile or {}
    db_session.commit()


def _get_or_create_profile(db_session: Session, user_id: str) -> db.Profile:
    row = db_session.query(db.Profile).filter_by(user_id=user_id).first()
    if row is None:
        row = db.Profile(user_id=user_id, resume_text="", parsed_profile={})
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
    return row


# All standard resume sections the parser understands, plus the catch-all
# "additional_sections" so that ANY section present in a resume is kept — no
# data is ever dropped during parsing.
EMPTY_PROFILE = {
    "name": "", "email": "", "phone": "", "address": "", "links": [],
    "career_goals": "", "skills": [], "experience": [], "education": [],
    "projects": [], "publications": [], "certifications": [],
    "achievements": [], "languages": [], "hobbies": [], "declaration": "",
    "additional_sections": [],
}

_PROFILE_LIST_KEYS = [
    "links", "skills", "experience", "education", "projects", "publications",
    "certifications", "achievements", "languages", "hobbies", "additional_sections",
]
_PROFILE_TEXT_KEYS = ["name", "email", "phone", "address", "career_goals", "declaration"]


def _normalize_profile(parsed: dict) -> dict:
    """Guarantee every standard section key exists with a valid type — even when
    the LLM or a client sends missing or malformed fields."""
    out = dict(parsed or {})
    for key in _PROFILE_TEXT_KEYS:
        if not isinstance(out.get(key), str):
            out[key] = ""
    for key in _PROFILE_LIST_KEYS:
        if not isinstance(out.get(key), list):
            out[key] = []
    return out


# ══════════════════════════════════════════════════════════════════════════════
# SETTINGS ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/settings")
def get_settings(request: Request, user_id: str = Depends(authed_user), db_session: Session = Depends(db.get_db)):
    row = _get_or_create_settings(db_session, user_id)
    data = settings_to_public(row, _platform_gemini_models(db_session))
    is_admin = _is_admin_user(request, user_id, db_session)
    data["is_admin"] = is_admin
    if not is_admin:
        # Don't leak the admin whitelist to regular users.
        data.pop("admin_emails", None)
    return data


@app.post("/api/settings")
@app.patch("/api/settings")
def update_settings(
    payload: SettingsUpdate,
    request: Request,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    _check_auth_limit(request, user_id, db_session)
    row = _get_or_create_settings(db_session, user_id)

    # Admin email whitelist is managed ONLY through the admin console. Rejecting
    # it here closes the self-grant loophole (a user adding their own email).
    if payload.admin_emails is not None and not _is_admin_user(request, user_id, db_session):
        raise HTTPException(status_code=403, detail="Only admins can manage admin emails.")

    updates = {}
    if payload.gemini_models is not None:
        updates["gemini_models"] = [m for m in payload.gemini_models if m.strip()] or DEFAULT_GEMINI_MODELS
        # A user who saves their own model list opts out of the admin-managed
        # platform default. An explicit gemini_models_custom=False (rejoin the
        # admin default) wins over this default.
        updates["gemini_models_custom"] = (
            payload.gemini_models_custom
            if payload.gemini_models_custom is not None
            else True
        )
    elif payload.gemini_models_custom is not None:
        # Rejoin/leave the admin default without changing the stored list.
        updates["gemini_models_custom"] = payload.gemini_models_custom
    if payload.nim_models is not None:
        updates["nim_models"] = [m for m in payload.nim_models if m.strip()] or DEFAULT_NIM_MODELS
    if payload.nim_base_url is not None:
        updates["nim_base_url"] = payload.nim_base_url.strip()
    if payload.ollama_enabled is not None:
        updates["ollama_enabled"] = bool(payload.ollama_enabled)
    if payload.ollama_base_url is not None:
        updates["ollama_base_url"] = payload.ollama_base_url.strip()
    if payload.ollama_model is not None:
        updates["ollama_model"] = payload.ollama_model.strip()
    if payload.active_provider is not None:
        updates["active_provider"] = payload.active_provider if payload.active_provider in ("gemini", "nim", "ollama") else "gemini"
    if payload.forbidden_phrases is not None:
        updates["forbidden_phrases"] = [p.strip() for p in payload.forbidden_phrases if p.strip()]
    if payload.tone_settings is not None:
        updates["tone_settings"] = payload.tone_settings
    if payload.admin_emails is not None:
        # Keep only well-formed emails (consistent with the app's safe-input
        # standard for resume names) — never store arbitrary strings.
        _EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
        cleaned = [
            e.strip().lower()
            for e in payload.admin_emails
            if e and e.strip() and _EMAIL_RE.match(e.strip())
        ]
        # De-duplicate, keep order, cap at a sane number.
        seen: set = set()
        updates["admin_emails"] = [e for e in cleaned if not (e in seen or seen.add(e))][:20]

    for field, value in updates.items():
        setattr(row, field, value)

    _apply_key_edits(db_session, row, payload)
    db_session.commit()
    db_session.refresh(row)
    data = settings_to_public(row, _platform_gemini_models(db_session))
    is_admin = _is_admin_user(request, user_id, db_session)
    data["is_admin"] = is_admin
    if not is_admin:
        # Don't leak the admin whitelist to regular users.
        data.pop("admin_emails", None)
    return {"status": "success", "message": "Settings updated", "settings": data}


# ══════════════════════════════════════════════════════════════════════════════
# PROFILE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/profile")
def get_profile(user_id: str = Depends(authed_user), db_session: Session = Depends(db.get_db)):
    row = _get_or_create_profile(db_session, user_id)
    profile = row.parsed_profile or {}
    for key in EMPTY_PROFILE:
        profile.setdefault(key, EMPTY_PROFILE[key])
    return {"resume_text": row.resume_text or "", "display_name": row.display_name or "", "parsed_profile": profile}


@app.post("/api/profile")
@app.patch("/api/profile")
def update_profile(
    payload: ProfileUpdate,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    row = _get_or_create_profile(db_session, user_id)
    row.resume_text = payload.resume_text
    row.parsed_profile = _normalize_profile(payload.parsed_profile)
    if payload.display_name is not None:
        row.display_name = payload.display_name.strip()[:80]
    # Keep the active saved resume in sync with manual profile edits.
    active = db_session.query(db.Resume).filter_by(user_id=user_id, is_active=True).first()
    if active:
        active.resume_text = payload.resume_text
        active.parsed_profile = _normalize_profile(payload.parsed_profile)
    db_session.commit()
    return {"status": "success", "message": "Profile updated"}


def _save_profile(db_session: Session, user_id: str, resume_text: str, parsed_profile: dict) -> None:
    row = _get_or_create_profile(db_session, user_id)
    row.resume_text = resume_text
    row.parsed_profile = parsed_profile
    db_session.commit()


@app.post("/api/profile/upload-resume")
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    """Upload a PDF resume; AI parses it into structured fields (user-scoped)."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    if file.size and file.size > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="PDF too large (max 15 MB).")

    _check_generation_limit(request, user_id, db_session)
    file_bytes = await file.read()
    extracted_text = parse_pdf(file_bytes)

    generator = build_generator_for(user_id, db_session)
    try:
        parsed_profile = _normalize_profile(generator.parse_resume(extracted_text))
    except NoProviderError as exc:
        raise _no_provider_http(exc)

    _save_profile(db_session, user_id, extracted_text, parsed_profile)
    return {"status": "success", "resume_text": extracted_text, "parsed_profile": parsed_profile}


@app.post("/api/profile/parse-text")
def parse_resume_text(
    payload: dict,
    request: Request,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    raw_text = (payload.get("resume_text") or "").strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="resume_text cannot be empty")

    _check_generation_limit(request, user_id, db_session)
    generator = build_generator_for(user_id, db_session)
    try:
        parsed_profile = _normalize_profile(generator.parse_resume(raw_text))
    except NoProviderError as exc:
        raise _no_provider_http(exc)
    _save_profile(db_session, user_id, raw_text, parsed_profile)
    return {"status": "success", "parsed_profile": parsed_profile}


@app.post("/api/jobs/extract")
def extract_job_from_text(
    payload: JobExtractRequest,
    request: Request,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    if not payload.raw_text.strip():
        raise HTTPException(status_code=400, detail="raw_text cannot be empty")

    _check_generation_limit(request, user_id, db_session)
    generator = build_generator_for(user_id, db_session)
    # extract_job_details degrades gracefully to a heuristic (no-LLM) parse, so
    # Smart Paste keeps working before a provider key is configured.
    return generator.extract_job_details(payload.raw_text)


@app.post("/api/jobs/scrape")
def scrape_job_url(
    payload: JobScrapeRequest,
    request: Request,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    """Fetch a job-posting URL, extract its text, and fill company/position/location."""
    _check_generation_limit(request, user_id, db_session)

    try:
        scraped = scrape_url(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # AI extraction when a provider is available, otherwise the heuristic parse
    # (extract_job_details degrades gracefully and never fails without a key).
    generator = build_generator_for(user_id, db_session)
    meta = generator.extract_job_details(scraped["text"])

    # The scraped body is the description; keep title/url as useful context.
    meta["description"] = scraped["text"]
    meta["source_url"] = payload.url.strip()
    meta["title"] = scraped["title"]
    return meta


# ══════════════════════════════════════════════════════════════════════════════
# APPLICATION ENDPOINTS (all user-scoped)
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/applications")
def list_applications(user_id: str = Depends(authed_user), db_session: Session = Depends(db.get_db)):
    rows = (
        db_session.query(db.Application)
        .filter_by(user_id=user_id)
        .order_by(db.Application.id.desc())
        .all()
    )
    return [_app_summary(r) for r in rows]


@app.post("/api/applications")
def create_application(
    payload: ApplicationCreate,
    request: Request,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    # Duplicate guard: same company + same (near-identical) job description.
    dup = _find_duplicate_application(
        db_session, user_id, payload.company, payload.position, payload.description
    )
    if dup:
        raise _duplicate_error(dup)

    # Per-account storage limit: max analyses (admins exempt). The cap is the
    # per-user override when set, otherwise the platform default (500).
    is_admin = _is_admin_user(request, user_id, db_session)
    count = db_session.query(db.Application).filter_by(user_id=user_id).count()
    cap = MAX_ANALYSES_PER_USER
    if not is_admin:
        cap = _get_or_create_settings(db_session, user_id).analysis_limit or MAX_ANALYSES_PER_USER
    if not is_admin and count >= cap:
        oldest = (
            db_session.query(db.Application)
            .filter_by(user_id=user_id)
            .order_by(db.Application.id.asc())
            .first()
        )
        raise HTTPException(
            status_code=409,
            detail={
                "reason": "limit",
                "message": f"Storage limit reached — this account can hold {cap} job analyses. Delete the oldest one to add a new job.",
                "count": count,
                "max": cap,
                "oldest": {
                    "id": oldest.id,
                    "company": oldest.company,
                    "position": oldest.position,
                }
                if oldest
                else None,
            },
        )

    row = db.Application(
        user_id=user_id,
        company=payload.company.strip(),
        position=payload.position.strip(),
        location=payload.location.strip(),
        description=payload.description,
        job_url=payload.job_url.strip() if payload.job_url else "",
        status="New",
        match_score=0,
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    _log_activity(db_session, user_id, "app_create", f"{row.company} — {row.position}")
    return {"status": "success", "id": row.id}


@app.delete("/api/applications/{app_id}")
def delete_application(app_id: int, user_id: str = Depends(authed_user), db_session: Session = Depends(db.get_db)):
    row = _get_owned_application(db_session, user_id, app_id)
    db_session.delete(row)
    db_session.commit()
    return {"status": "success", "message": "Application deleted"}


class ApplicationFlags(BaseModel):
    """Tracking flags for an application (applied / follow-up / bookmark)."""

    applied: Optional[bool] = None
    applied_date: Optional[str] = None
    follow_up: Optional[bool] = None
    bookmarked: Optional[bool] = None
    job_url: Optional[str] = None


@app.patch("/api/applications/{app_id}")
def update_application_flags(
    app_id: int,
    payload: ApplicationFlags,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    row = _get_owned_application(db_session, user_id, app_id)
    if payload.applied is not None:
        row.applied = payload.applied
    if payload.applied_date is not None:
        row.applied_date = payload.applied_date or None
    if payload.follow_up is not None:
        row.follow_up = payload.follow_up
    if payload.bookmarked is not None:
        row.bookmarked = payload.bookmarked
    if payload.job_url is not None:
        row.job_url = payload.job_url.strip()
    if row.applied and not row.applied_date:
        row.applied_date = datetime.utcnow().strftime("%Y-%m-%d")
    db_session.commit()
    db_session.refresh(row)
    return {"status": "success", "application": _app_summary(row)}


@app.get("/api/applications/{app_id}")
def get_application(app_id: int, user_id: str = Depends(authed_user), db_session: Session = Depends(db.get_db)):
    row = _get_owned_application(db_session, user_id, app_id)
    return _app_detail(row)


@app.post("/api/applications/{app_id}/analyze")
def analyze_application(app_id: int, request: Request, user_id: str = Depends(authed_user), db_session: Session = Depends(db.get_db)):
    row = _get_owned_application(db_session, user_id, app_id)

    # If this application's description matches another saved one for the same
    # company, it's a duplicate job — point the user at the existing analysis.
    dup = _find_duplicate_application(
        db_session, user_id, row.company, row.position, row.description, exclude_id=row.id
    )
    if dup:
        raise _duplicate_error(dup)

    _check_generation_limit(request, user_id, db_session)

    # Setup gate: the user's OWN resume must exist — never analyze against
    # another account's (or empty) profile data.
    profile_row = _get_or_create_profile(db_session, user_id)
    _require_resume(profile_row)
    profile_data = {"resume_text": profile_row.resume_text or "", "parsed_profile": profile_row.parsed_profile or {}}
    job_desc = row.description or ""
    if not job_desc.strip():
        raise HTTPException(status_code=400, detail="This job has no description to analyze. Paste the job posting first.")

    # Free-tier allowance (no-own-key accounts: 2 analyses on the platform key).
    settings_row = _free_allowance_check(request, user_id, db_session, "analyze")
    using_free_allowance = not _is_admin_user(request, user_id, db_session) and not _user_has_own_key(settings_row)

    generator = build_generator_for(user_id, db_session)
    try:
        job_analysis = generator.analyze_job(job_desc)
        suit_gap = generator.analyze_suitability(profile_data["parsed_profile"], job_analysis)
    except NoProviderError as exc:
        raise _no_provider_http(exc)

    ats_results = calculate_ats_score(profile_data["resume_text"], job_desc)
    ats_results["unusedProjects"] = suggest_unused_projects(
        profile_data["parsed_profile"].get("projects", []),
        job_desc,
        profile_data["resume_text"],
    )

    details = {
        "jobAnalysis": job_analysis,
        "suitability": suit_gap.get("suitability", {}),
        "gaps": suit_gap.get("gaps", []),
    }
    overall_match = details["suitability"].get("overallMatch", 85)

    # Research matching is ONLY computed from the candidate's real publications
    # and projects — no seeded/fake professor papers are ever injected. When the
    # candidate has no research output, the tab simply shows "no match yet".
    pubs = profile_data["parsed_profile"].get("publications", [])
    projects = profile_data["parsed_profile"].get("projects", [])
    if pubs or projects:
        research_topics = (job_analysis or {}).get("researchTopics") or []
        job_papers = [{"title": t, "abstract": t, "keywords": t} for t in research_topics if str(t).strip()]
        if job_papers:
            details["researchMatcher"] = match_research_profile(pubs, projects, job_papers)

    row.details = details
    row.resume_suggestions = ats_results
    row.match_score = int(overall_match)
    row.status = "Analyzed"
    row.analyzed_at = datetime.utcnow()
    db_session.commit()
    if using_free_allowance:
        _consume_free_allowance(settings_row, "analyze")
        db_session.commit()
    _log_activity(db_session, user_id, "analyze", f"{row.company} — {row.position} ({int(overall_match)}%)")
    return {"status": "success", "match_score": overall_match}


@app.post("/api/applications/{app_id}/plan")
def plan_application(
    app_id: int,
    request: Request,
    payload: Optional[ApplicationPlanRequest] = None,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    row = _get_owned_application(db_session, user_id, app_id)
    if not row.details:
        raise HTTPException(status_code=400, detail="Run analysis first")

    _check_generation_limit(request, user_id, db_session)
    # Planning is a prerequisite of generation — gate it on the same letter
    # allowance so no-key accounts can't loop the platform key with plans.
    _free_allowance_check(request, user_id, db_session, "letter")

    generator = build_generator_for(user_id, db_session)
    style = (payload.style if payload else "industrial") or "industrial"
    try:
        plan = generator.plan_cover_letter(
            row.details.get("jobAnalysis", {}),
            row.details.get("suitability", {}),
            style=style,
        )
    except NoProviderError as exc:
        raise _no_provider_http(exc)
    row.cover_letter_plan = plan
    db_session.commit()
    _log_activity(db_session, user_id, "plan", f"{row.company} — {row.position}")
    return {"status": "success", "plan": plan}


@app.post("/api/applications/{app_id}/generate")
def generate_application_materials(
    app_id: int,
    payload: ApplicationGenerateRequest,
    request: Request,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    row = _get_owned_application(db_session, user_id, app_id)
    if not row.details:
        raise HTTPException(status_code=400, detail="Run analysis first")

    _check_generation_limit(request, user_id, db_session)
    profile_row = _get_or_create_profile(db_session, user_id)
    _require_resume(profile_row)

    settings_row = _get_or_create_settings(db_session, user_id)
    # Free-tier allowance (no-own-key accounts: 1 cover letter on the platform key).
    is_admin = _is_admin_user(request, user_id, db_session)
    using_free_allowance = not is_admin and not _user_has_own_key(settings_row)
    if using_free_allowance:
        _free_allowance_check(request, user_id, db_session, "letter")

    settings = settings_to_public(settings_row, _platform_gemini_models(db_session))
    generator = _generator_from_row(settings_row, _platform_gemini_models(db_session))
    try:
        results = generator.generate_cover_letter(
            profile_row.parsed_profile or {},
            row.details.get("jobAnalysis", {}),
            payload.plan or [],
            settings,
            style=payload.style or "industrial",
        )
    except NoProviderError as exc:
        raise _no_provider_http(exc)

    row.cover_letter = results["coverLetter"]
    row.audit_trail = results.get("auditTrail", [])
    row.feedback = results.get("feedback", {})
    row.cover_letter_plan = payload.plan
    row.status = "Completed"
    db_session.commit()
    if using_free_allowance:
        _consume_free_allowance(settings_row, "letter")
        db_session.commit()
    _log_activity(db_session, user_id, "generate", f"{row.company} — {row.position}")
    return {"status": "success"}


@app.get("/api/applications/{app_id}/export/{export_format}")
def export_application_letter(app_id: int, export_format: str, user_id: str = Depends(authed_user), db_session: Session = Depends(db.get_db)):
    row = _get_owned_application(db_session, user_id, app_id)
    if not row.cover_letter:
        raise HTTPException(status_code=404, detail="Cover letter not found or not generated yet")

    profile_row = _get_or_create_profile(db_session, user_id)
    pp = profile_row.parsed_profile or {}
    candidate_name = pp.get("name") or "Candidate Name"
    candidate_email = pp.get("email") or "email@example.com"
    candidate_phone = pp.get("phone") or ""
    candidate_address = pp.get("address") or ""
    links = pp.get("links") or []
    candidate_links = " · ".join(str(l) for l in links if str(l).strip()) if links else ""
    subject = f"Application for {row.position or 'the position'} — {row.company or 'your team'}"

    safe_company = re.sub(r"[^A-Za-z0-9_\-]+", "_", row.company or "Company")
    safe_position = re.sub(r"[^A-Za-z0-9_\-]+", "_", row.position or "Position")
    filename = f"CoverLetter_{safe_company}_{safe_position}"

    if export_format == "txt":
        return Response(
            content=export_txt(row.cover_letter),
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{filename}.txt"'},
        )
    if export_format == "pdf":
        try:
            content = export_pdf(
                row.cover_letter, candidate_name, candidate_email, candidate_phone,
                candidate_address, candidate_links, row.company, row.position, subject,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return Response(
            content=content,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
        )
    if export_format == "docx":
        try:
            content = export_docx(
                row.cover_letter, candidate_name, candidate_email, candidate_phone,
                candidate_address, candidate_links, row.company, row.position, subject,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}.docx"'},
        )
    if export_format == "latex":
        return Response(
            content=export_latex(
                row.cover_letter, candidate_name, candidate_email, candidate_phone,
                candidate_address, candidate_links, row.company, row.position, subject,
            ),
            media_type="application/x-tex",
            headers={"Content-Disposition": f'attachment; filename="{filename}.tex"'},
        )
    raise HTTPException(status_code=400, detail="Invalid format. Supported: txt, pdf, docx, latex")


@app.post("/api/applications/{app_id}/refine")
def refine_application_letter(
    app_id: int,
    payload: CoverLetterRefineRequest,
    request: Request,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    row = _get_owned_application(db_session, user_id, app_id)
    if not row.cover_letter:
        raise HTTPException(status_code=400, detail="No cover letter generated yet. Generate one first.")

    _check_generation_limit(request, user_id, db_session)
    profile_row = _get_or_create_profile(db_session, user_id)
    _require_resume(profile_row)

    settings_row = _get_or_create_settings(db_session, user_id)
    # Refining re-runs the LLM — gate it on the same letter allowance for
    # accounts that rely on the platform key (so they can't refine forever).
    is_admin = _is_admin_user(request, user_id, db_session)
    using_free_allowance = not is_admin and not _user_has_own_key(settings_row)
    if using_free_allowance:
        _free_allowance_check(request, user_id, db_session, "letter")

    settings = settings_to_public(settings_row, _platform_gemini_models(db_session))
    generator = build_generator_for(user_id, db_session)
    try:
        results = generator.refine_cover_letter(
            current_letter=row.cover_letter,
            user_feedback=payload.feedback,
            profile=profile_row.parsed_profile or {},
            job_analysis=(row.details or {}).get("jobAnalysis", {}),
            settings=settings,
            style=payload.style or "industrial",
        )
    except NoProviderError as exc:
        raise _no_provider_http(exc)

    row.cover_letter = results["coverLetter"]
    row.audit_trail = results.get("auditTrail", [])
    row.feedback = results.get("feedback", {})
    db_session.commit()
    if using_free_allowance:
        _consume_free_allowance(settings_row, "letter")
        db_session.commit()
    _log_activity(db_session, user_id, "refine", f"{row.company} — {row.position}")

    return {
        "status": "success",
        "changesSummary": results.get("changesSummary", "Letter refined."),
        "cover_letter": results["coverLetter"],
        "feedback": results.get("feedback", {}),
    }


# ══════════════════════════════════════════════════════════════════════════════
# RESUME LIBRARY ENDPOINTS (max 5 per account, injection-safe names)
# ══════════════════════════════════════════════════════════════════════════════

class ResumeCreate(BaseModel):
    name: str = "Resume"
    resume_text: str = ""
    parsed_profile: dict = {}


class ResumeUpdate(BaseModel):
    name: Optional[str] = None
    resume_text: Optional[str] = None
    parsed_profile: Optional[dict] = None


@app.get("/api/resumes")
def list_resumes(user_id: str = Depends(authed_user), db_session: Session = Depends(db.get_db)):
    rows = (
        db_session.query(db.Resume)
        .filter_by(user_id=user_id)
        .order_by(db.Resume.created_at.desc())
        .all()
    )
    cap = _get_or_create_settings(db_session, user_id).resume_limit or MAX_RESUMES_PER_USER
    return {"resumes": [_resume_summary(r) for r in rows], "max": cap}


@app.post("/api/resumes")
def create_resume(
    payload: ResumeCreate,
    request: Request,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    is_admin = _is_admin_user(request, user_id, db_session)
    count = db_session.query(db.Resume).filter_by(user_id=user_id).count()
    cap = MAX_RESUMES_PER_USER
    if not is_admin:
        cap = _get_or_create_settings(db_session, user_id).resume_limit or MAX_RESUMES_PER_USER
    if not is_admin and count >= cap:
        raise HTTPException(
            status_code=409,
            detail={
                "reason": "resume_limit",
                "message": f"Resume library is full ({cap} max). Delete or rename an existing resume first.",
                "count": count,
                "max": cap,
            },
        )
    name = _validate_resume_name(payload.name)
    row = db.Resume(
        user_id=user_id,
        name=name,
        resume_text=payload.resume_text or "",
        parsed_profile=payload.parsed_profile or {},
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    _log_activity(db_session, user_id, "resume_add", name)
    return {"status": "success", "resume": _resume_summary(row)}


@app.post("/api/resumes/upload")
async def upload_resume_pdf(
    request: Request,
    file: UploadFile = File(...),
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    """Upload a PDF into the resume library (max 5), parse it, and make it active."""
    is_admin = _is_admin_user(request, user_id, db_session)
    count = db_session.query(db.Resume).filter_by(user_id=user_id).count()
    cap = MAX_RESUMES_PER_USER
    if not is_admin:
        cap = _get_or_create_settings(db_session, user_id).resume_limit or MAX_RESUMES_PER_USER
    if not is_admin and count >= cap:
        raise HTTPException(
            status_code=409,
            detail={
                "reason": "resume_limit",
                "message": f"Resume library is full ({cap} max). Delete or rename an existing resume first.",
                "count": count,
                "max": cap,
            },
        )
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    if file.size and file.size > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="PDF too large (max 15 MB).")

    _check_generation_limit(request, user_id, db_session)
    file_bytes = await file.read()
    extracted_text = parse_pdf(file_bytes)

    generator = build_generator_for(user_id, db_session)
    try:
        parsed_profile = generator.parse_resume(extracted_text) or {}
    except NoProviderError as exc:
        raise _no_provider_http(exc)
    for key in ["name", "email", "phone", "career_goals"]:
        if not parsed_profile.get(key):
            parsed_profile[key] = ""
    for key in ["skills", "projects", "publications"]:
        if not isinstance(parsed_profile.get(key), list):
            parsed_profile[key] = []

    # Default name from the file name (sanitized to the safe character set).
    base = re.sub(r"\.pdf$", "", file.filename or "", flags=re.IGNORECASE).strip()
    base = re.sub(r"[^A-Za-z0-9 _.-]", " ", base)
    base = re.sub(r"\s+", " ", base).strip().strip("._-")
    name = _validate_resume_name((base[:RESUME_NAME_MAX] or "Resume"))

    # Deactivate others, then make this the active resume.
    db_session.query(db.Resume).filter_by(user_id=user_id, is_active=True).update({"is_active": False})
    row = db.Resume(
        user_id=user_id,
        name=name,
        resume_text=extracted_text,
        parsed_profile=parsed_profile,
        is_active=True,
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    _mirror_resume_to_profile(db_session, user_id, row)
    return {
        "status": "success",
        "resume": _resume_summary(row),
        "resume_text": extracted_text,
        "parsed_profile": parsed_profile,
    }


@app.patch("/api/resumes/{resume_id}")
def update_resume(
    resume_id: int,
    payload: ResumeUpdate,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    row = _get_owned_resume(db_session, user_id, resume_id)
    if payload.name is not None:
        row.name = _validate_resume_name(payload.name)
    if payload.resume_text is not None:
        row.resume_text = payload.resume_text
    if payload.parsed_profile is not None:
        row.parsed_profile = payload.parsed_profile
    db_session.commit()
    db_session.refresh(row)
    return {"status": "success", "resume": _resume_summary(row)}


@app.delete("/api/resumes/{resume_id}")
def delete_resume(
    resume_id: int,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    row = _get_owned_resume(db_session, user_id, resume_id)
    db_session.delete(row)
    db_session.commit()
    return {"status": "success", "message": "Resume deleted"}


@app.post("/api/resumes/{resume_id}/activate")
def activate_resume(
    resume_id: int,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    row = _get_owned_resume(db_session, user_id, resume_id)
    db_session.query(db.Resume).filter_by(user_id=user_id, is_active=True).update({"is_active": False})
    row.is_active = True
    db_session.commit()
    _mirror_resume_to_profile(db_session, user_id, row)
    db_session.refresh(row)
    return {"status": "success", "resume": _resume_summary(row)}


# ══════════════════════════════════════════════════════════════════════════════
# ACCOUNT DATA MANAGEMENT (password-verified clear/reset)
# ══════════════════════════════════════════════════════════════════════════════

class AccountClearRequest(BaseModel):
    # "keys" → clear API keys & setup only; "data" → clear resumes/analyses/profile;
    # "all"  → wipe everything (start as a new account).
    scope: str
    password: str = ""


def _email_from_request(request: Request) -> str:
    """Best-effort email claim from the (already verified) access token."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return ""
    try:
        payload = pyjwt.decode(auth_header[7:].strip(), options={"verify_signature": False})
        return payload.get("email") or ""
    except Exception:
        return ""


def _verify_account_password(user_id: str, email: str, password: str) -> bool:
    """Confirm the account password before destructive actions.

    The API never stores passwords — we verify by attempting a real Supabase
    sign-in with the user's email (from their own access token) + the supplied
    password. In demo mode (auth bypassed) any non-empty password is accepted.
    """
    if config.DEMO_MODE:
        return bool(password)
    if not password or not email or not config.SUPABASE_URL or not config.SUPABASE_ANON_KEY:
        return False
    try:
        resp = _requests.post(
            f"{config.SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={"email": email, "password": password},
            headers={"apikey": config.SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            timeout=15,
        )
        return resp.status_code == 200
    except Exception as exc:
        log.warning("Password verification failed for user %s: %s", user_id, exc)
        return False


@app.post("/api/account/clear")
def clear_account_data(
    payload: AccountClearRequest,
    request: Request,
    user_id: str = Depends(authed_user),
    db_session: Session = Depends(db.get_db),
):
    if payload.scope not in ("keys", "data", "all"):
        raise HTTPException(status_code=400, detail="Invalid scope. Use 'keys', 'data', or 'all'.")
    _check_auth_limit(request, user_id, db_session)

    if not _verify_account_password(user_id, _email_from_request(request), payload.password):
        raise HTTPException(status_code=403, detail="Password verification failed. Enter the correct account password.")

    stats: Dict[str, Any] = {"applications": 0, "resumes": 0, "settings": False, "profile": False}

    if payload.scope in ("data", "all"):
        stats["applications"] = db_session.query(db.Application).filter_by(user_id=user_id).delete()
        stats["resumes"] = db_session.query(db.Resume).filter_by(user_id=user_id).delete()
        profile = db_session.query(db.Profile).filter_by(user_id=user_id).first()
        if profile:
            profile.resume_text = ""
            profile.parsed_profile = {}
            stats["profile"] = True

    if payload.scope in ("keys", "all"):
        row = _get_or_create_settings(db_session, user_id)
        row.gemini_keys_enc = "[]"
        row.nim_keys_enc = "[]"
        # Reset follows the admin-managed platform default — after reset the
        # account returns to the admin's top-5 Gemini models.
        row.gemini_models = _platform_gemini_models(db_session)
        row.gemini_models_custom = False
        row.nim_models = DEFAULT_NIM_MODELS
        row.nim_base_url = "https://integrate.api.nvidia.com/v1"
        row.ollama_enabled = False
        row.ollama_base_url = "http://localhost:11434"
        row.ollama_model = "llama3"
        row.active_provider = "gemini"
        row.forbidden_phrases = DEFAULT_FORBIDDEN_PHRASES
        row.tone_settings = DEFAULT_TONE
        row.admin_emails = []
        stats["settings"] = True

    db_session.commit()
    return {"status": "success", "message": "Account data cleared.", "stats": stats}


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN CONSOLE (owner-only: /api/admin/* — every route requires admin access)
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/admin/status")
def admin_status(request: Request, user_id: str = Depends(authed_user), db_session: Session = Depends(db.get_db)):
    """Whether the caller may use the admin console (drives the UI switch)."""
    email = _email_from_request(request)
    if config.DEMO_MODE and not email:
        email = "demo@local"
    return {"is_admin": _is_admin_user(request, user_id, db_session), "email": email}


@app.get("/api/admin/gemini-models")
def admin_gemini_models(
    user_id: str = Depends(_require_admin),
    db_session: Session = Depends(db.get_db),
):
    """The admin-managed top-5 Gemini model list (platform default)."""
    return {"models": _platform_gemini_models(db_session)}


class AdminGeminiModelsUpdate(BaseModel):
    models: List[str] = []


@app.put("/api/admin/gemini-models")
def admin_set_gemini_models(
    payload: AdminGeminiModelsUpdate,
    user_id: str = Depends(_require_admin),
    db_session: Session = Depends(db.get_db),
):
    """Set the top-5 Gemini models for the whole platform.

    Every account that has NOT customized its own list resolves to these
    models immediately (no mass update needed — resolution happens at read
    time). Users who saved their own list keep theirs until they reset.
    """
    cleaned: List[str] = []
    seen: set = set()
    for m in payload.models:
        m = (m or "").strip()
        if not m:
            continue
        if m not in seen:
            seen.add(m)
            cleaned.append(m)
    if not cleaned:
        raise HTTPException(status_code=400, detail="Provide at least one Gemini model.")
    if len(cleaned) > 5:
        raise HTTPException(status_code=400, detail="At most 5 Gemini models can be set.")
    row = _get_platform_settings(db_session)
    row.default_gemini_models = cleaned
    db_session.commit()
    _log_activity(db_session, user_id, "admin_models", ", ".join(cleaned))
    return {"status": "success", "models": cleaned, "message": "Gemini models updated for all users."}


@app.get("/api/admin/overview")
def admin_overview(user_id: str = Depends(_require_admin), db_session: Session = Depends(db.get_db)):
    """Aggregate platform usage: users, analyses, resumes, storage, activity."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    analyses_q = db_session.query(db.Application).filter(db.Application.details.isnot(None))

    app_bytes = int(db_session.query(func.sum(func.length(db.Application.description))).scalar() or 0)
    resume_bytes = int(db_session.query(func.sum(func.length(db.Resume.resume_text))).scalar() or 0)
    profile_bytes = int(db_session.query(func.sum(func.length(db.Profile.resume_text))).scalar() or 0)

    by_provider = {"gemini": 0, "nim": 0, "ollama": 0}
    for provider, count in (
        db_session.query(db.UserSettings.active_provider, func.count())
        .group_by(db.UserSettings.active_provider)
        .all()
    ):
        by_provider[provider or "gemini"] = count

    avg = db_session.query(func.avg(db.Application.match_score)).filter(db.Application.match_score > 0).scalar()

    return {
        "totals": {
            "users": db_session.query(db.User).count(),
            "applications": db_session.query(db.Application).count(),
            "analyses": analyses_q.count(),
            "resumes": db_session.query(db.Resume).count(),
            "storage_bytes": app_bytes + resume_bytes + profile_bytes,
        },
        "today": {
            "analyses": analyses_q.filter(db.Application.created_at >= today_start).count(),
            "new_users": db_session.query(db.User).filter(db.User.created_at >= today_start).count(),
        },
        "last7d": {
            "analyses": analyses_q.filter(db.Application.created_at >= week_ago).count(),
            "active_users": db_session.query(db.User).filter(db.User.last_seen >= week_ago).count(),
        },
        "avg_match": round(float(avg), 1) if avg else 0,
        "by_provider": by_provider,
        "limits": {
            "default_analysis": MAX_ANALYSES_PER_USER,
            "default_resume": MAX_RESUMES_PER_USER,
        },
    }


@app.get("/api/admin/users")
def admin_list_users(
    q: str = "",
    limit: int = 50,
    offset: int = 0,
    user_id: str = Depends(_require_admin),
    db_session: Session = Depends(db.get_db),
):
    """Directory of users with usage + limits + admin status (searchable)."""
    users = db_session.query(db.User).order_by(db.User.created_at.desc()).all()

    app_counts = dict(db_session.query(db.Application.user_id, func.count()).group_by(db.Application.user_id).all())
    analyses_counts = dict(
        db_session.query(db.Application.user_id, func.count())
        .filter(db.Application.details.isnot(None))
        .group_by(db.Application.user_id)
        .all()
    )
    resume_counts = dict(db_session.query(db.Resume.user_id, func.count()).group_by(db.Resume.user_id).all())
    app_bytes = dict(
        db_session.query(db.Application.user_id, func.sum(func.length(db.Application.description)))
        .group_by(db.Application.user_id)
        .all()
    )
    resume_bytes = dict(
        db_session.query(db.Resume.user_id, func.sum(func.length(db.Resume.resume_text)))
        .group_by(db.Resume.user_id)
        .all()
    )
    profiles = {p.user_id: p for p in db_session.query(db.Profile).all()}
    settings_rows = {s.user_id: s for s in db_session.query(db.UserSettings).all()}
    env_admins = {e.strip().lower() for e in config.ADMIN_EMAILS}

    query = q.strip().lower()
    items = []
    for u in users:
        email = (u.email or "").lower()
        display = (profiles.get(u.id).display_name or "") if u.id in profiles else ""
        if query and query not in email and query not in display.lower():
            continue
        srow = settings_rows.get(u.id)
        is_admin = bool(
            email in env_admins
            or (srow and srow.admin_emails and email in {e.strip().lower() for e in srow.admin_emails})
        )
        items.append(
            {
                "user_id": u.id,
                "email": email,
                "display_name": display,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_seen": u.last_seen.isoformat() if u.last_seen else None,
                "applications": int(app_counts.get(u.id) or 0),
                "analyses": int(analyses_counts.get(u.id) or 0),
                "resumes": int(resume_counts.get(u.id) or 0),
                "storage_bytes": int(app_bytes.get(u.id) or 0) + int(resume_bytes.get(u.id) or 0)
                + (len(profiles[u.id].resume_text or "") if u.id in profiles else 0),
                "analysis_limit": srow.analysis_limit if srow else None,
                "resume_limit": srow.resume_limit if srow else None,
                "is_admin": is_admin,
            }
        )

    return {"total": len(items), "users": items[offset : offset + limit]}


@app.get("/api/admin/users/{uid}")
def admin_user_detail(uid: str, user_id: str = Depends(_require_admin), db_session: Session = Depends(db.get_db)):
    """Per-user detail: profile, usage, limits, and recent applications."""
    target = db_session.query(db.User).filter_by(id=uid).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    srow = db_session.query(db.UserSettings).filter_by(user_id=uid).first()
    profile = db_session.query(db.Profile).filter_by(user_id=uid).first()
    email = (target.email or "").lower()
    is_admin = bool(
        email in {e.strip().lower() for e in config.ADMIN_EMAILS}
        or (srow and srow.admin_emails and email in {e.strip().lower() for e in srow.admin_emails})
    )

    recent = (
        db_session.query(db.Application)
        .filter_by(user_id=uid)
        .order_by(db.Application.id.desc())
        .limit(10)
        .all()
    )
    return {
        "user_id": uid,
        "email": email,
        "display_name": (profile.display_name or "") if profile else "",
        "created_at": target.created_at.isoformat() if target.created_at else None,
        "last_seen": target.last_seen.isoformat() if target.last_seen else None,
        "applications": db_session.query(db.Application).filter_by(user_id=uid).count(),
        "analyses": db_session.query(db.Application).filter(db.Application.user_id == uid, db.Application.details.isnot(None)).count(),
        "resumes": db_session.query(db.Resume).filter_by(user_id=uid).count(),
        "analysis_limit": srow.analysis_limit if srow else None,
        "resume_limit": srow.resume_limit if srow else None,
        "is_admin": is_admin,
        "recent_applications": [_app_summary(r) for r in recent],
    }


class AdminUserUpdate(BaseModel):
    # Per-user limit overrides (null → platform default). Admins always bypass caps.
    analysis_limit: Optional[int] = None
    resume_limit: Optional[int] = None
    # Grant / revoke admin status (writes the user's email into their own whitelist).
    admin: Optional[bool] = None


@app.patch("/api/admin/users/{uid}")
def admin_update_user(
    uid: str,
    payload: AdminUserUpdate,
    user_id: str = Depends(_require_admin),
    db_session: Session = Depends(db.get_db),
):
    """Change a user's limits or admin status (admin console only)."""
    target = db_session.query(db.User).filter_by(id=uid).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    settings = _get_or_create_settings(db_session, uid)

    if payload.analysis_limit is not None:
        if payload.analysis_limit < 0 or payload.analysis_limit > 100_000:
            raise HTTPException(status_code=400, detail="analysis_limit must be between 0 and 100000 (null resets to default)")
        settings.analysis_limit = payload.analysis_limit or None
    if payload.resume_limit is not None:
        if payload.resume_limit < 0 or payload.resume_limit > 100_000:
            raise HTTPException(status_code=400, detail="resume_limit must be between 0 and 100000 (null resets to default)")
        settings.resume_limit = payload.resume_limit or None
    admin_change: Optional[str] = None
    if payload.admin is not None:
        email = (target.email or "").strip().lower()
        if not email:
            raise HTTPException(status_code=400, detail="User has no email on record — cannot manage admin status.")
        emails = [e for e in (settings.admin_emails or []) if isinstance(e, str)]
        if payload.admin:
            if email not in emails:
                emails.append(email)
            admin_change = "granted"
        else:
            emails = [e for e in emails if e != email]
            admin_change = "revoked"
        settings.admin_emails = emails[:20]

    db_session.commit()
    _log_activity(
        db_session,
        user_id,
        "admin_update",
        f"limits a={settings.analysis_limit} r={settings.resume_limit} admin={admin_change or 'unchanged'}",
    )
    return {"status": "success"}


class AdminClearRequest(BaseModel):
    scope: str = "all"  # "applications" | "resumes" | "all"


@app.post("/api/admin/users/{uid}/clear")
def admin_clear_user(
    uid: str,
    payload: AdminClearRequest,
    user_id: str = Depends(_require_admin),
    db_session: Session = Depends(db.get_db),
):
    """Clear a user's storage (applications / resumes / everything)."""
    if payload.scope not in ("applications", "resumes", "all"):
        raise HTTPException(status_code=400, detail="Invalid scope. Use 'applications', 'resumes', or 'all'.")
    if db_session.query(db.User).filter_by(id=uid).first() is None:
        raise HTTPException(status_code=404, detail="User not found")

    stats: Dict[str, Any] = {"applications": 0, "resumes": 0, "profile": False}
    if payload.scope in ("applications", "all"):
        stats["applications"] = db_session.query(db.Application).filter_by(user_id=uid).delete()
    if payload.scope in ("resumes", "all"):
        stats["resumes"] = db_session.query(db.Resume).filter_by(user_id=uid).delete()
    if payload.scope == "all":
        profile = db_session.query(db.Profile).filter_by(user_id=uid).first()
        if profile:
            profile.resume_text = ""
            profile.parsed_profile = {}
            stats["profile"] = True
    db_session.commit()
    _log_activity(db_session, user_id, "admin_clear", f"{uid}: {payload.scope}")
    return {"status": "success", "stats": stats}


@app.get("/api/admin/activity")
def admin_activity(
    limit: int = 50,
    user_id: str = Depends(_require_admin),
    db_session: Session = Depends(db.get_db),
):
    """Recent platform activity (audit trail)."""
    limit = min(max(limit, 1), 200)
    rows = (
        db_session.query(db.ActivityLog)
        .order_by(db.ActivityLog.id.desc())
        .limit(limit)
        .all()
    )
    emails = {u.id: u.email for u in db_session.query(db.User).all()}
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "email": emails.get(r.user_id, ""),
            "action": r.action,
            "detail": r.detail,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# ══════════════════════════════════════════════════════════════════════════════
# Health check (used by Render's health checks and keep-alive pings)
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/healthz")
def healthz():
    return {"status": "ok"}


# ══════════════════════════════════════════════════════════════════════════════
# Serve the built frontend when present (local single-process deploy)
# ══════════════════════════════════════════════════════════════════════════════

frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.isdir(frontend_dist):
    # SPA fallback: serve real files when they exist, otherwise index.html so
    # deep links like /admin/dashboard work on a self-hosted single-process deploy.
    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        index = os.path.join(frontend_dist, "index.html")
        if os.path.isfile(index):
            return FileResponse(index)
        raise HTTPException(status_code=404)

    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
else:
    @app.get("/")
    def index_fallback():
        return {"message": "Vitralume API running. Build the frontend (frontend/) to serve the UI here."}
