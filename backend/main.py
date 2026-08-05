"""
Vitralume — Job Application Copilot API.

Every endpoint requires an authenticated user (Supabase JWT) and only ever
touches that user's own data. Users' provider API keys are encrypted at rest,
never returned to clients, and decrypted in memory only for the request that
needs them.
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

from cryptography.fernet import InvalidToken
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

import config
import database as db
import security
from database import (
    DEFAULT_FORBIDDEN_PHRASES,
    DEFAULT_GEMINI_MODELS,
    DEFAULT_NIM_MODELS,
    DEFAULT_TONE,
)
from security import KeyCipher, current_user_id
from services.ats_optimizer import calculate_ats_score, suggest_unused_projects
from services.exporter import export_docx, export_latex, export_txt
from services.generator import CopilotGenerator
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
    nim_models: Optional[List[str]] = None
    nim_base_url: Optional[str] = None
    ollama_enabled: Optional[bool] = None
    ollama_base_url: Optional[str] = None
    ollama_model: Optional[str] = None
    active_provider: Optional[str] = None
    forbidden_phrases: Optional[List[str]] = None
    tone_settings: Optional[dict] = None

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


class ApplicationCreate(BaseModel):
    company: str = ""
    position: str = ""
    location: str = ""
    description: str = ""


class ApplicationGenerateRequest(BaseModel):
    style: str = "industrial"
    plan: List[dict] = []


class JobExtractRequest(BaseModel):
    raw_text: str


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


def _check_generation_limit(user_id: str) -> None:
    if not config.RATE_LIMIT_ENABLED:
        return
    if not generation_limiter.allow(user_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait a moment.")


def _check_auth_limit(identity: str) -> None:
    """Rate-limit sensitive actions (e.g. key/settings changes)."""
    if not config.RATE_LIMIT_ENABLED:
        return
    if not auth_limiter.allow(identity):
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait a moment.")


# ══════════════════════════════════════════════════════════════════════════════
# Helpers: settings storage & key handling
# ══════════════════════════════════════════════════════════════════════════════

def _get_or_create_settings(db_session: Session, user_id: str) -> db.UserSettings:
    row = db_session.query(db.UserSettings).filter_by(user_id=user_id).first()
    if row is None:
        row = db.UserSettings(
            user_id=user_id,
            gemini_keys_enc="[]",
            gemini_models=DEFAULT_GEMINI_MODELS,
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


def settings_to_public(row: db.UserSettings) -> Dict[str, Any]:
    """Public settings payload. Provider keys are MASKED, never returned raw."""
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

    return {
        "gemini_models": row.gemini_models or DEFAULT_GEMINI_MODELS,
        "nim_models": row.nim_models or DEFAULT_NIM_MODELS,
        "nim_base_url": row.nim_base_url or "https://integrate.api.nvidia.com/v1",
        "ollama_enabled": bool(row.ollama_enabled),
        "ollama_base_url": row.ollama_base_url or "http://localhost:11434",
        "ollama_model": row.ollama_model or "llama3",
        "active_provider": row.active_provider or "gemini",
        "forbidden_phrases": row.forbidden_phrases or [],
        "tone_settings": row.tone_settings or {},
        "keyInfo": {
            "gemini": gemini_preview,
            "nim": nim_preview,
        },
    }


def _generator_from_row(row: db.UserSettings) -> CopilotGenerator:
    """Build an LLM router from a settings row (user's decrypted keys + server defaults)."""
    gemini_keys = _decrypt_key_list(row.gemini_keys_enc) or list(config.GEMINI_SERVER_KEYS)
    nim_keys = _decrypt_key_list(row.nim_keys_enc) or list(config.NIM_SERVER_KEYS)
    return CopilotGenerator(
        gemini_api_keys=gemini_keys,
        gemini_models=row.gemini_models or DEFAULT_GEMINI_MODELS,
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
    return _generator_from_row(_get_or_create_settings(db_session, user_id))


def _get_owned_application(db_session: Session, user_id: str, app_id: int) -> db.Application:
    row = db_session.query(db.Application).filter_by(id=app_id, user_id=user_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return row


def _get_or_create_profile(db_session: Session, user_id: str) -> db.Profile:
    row = db_session.query(db.Profile).filter_by(user_id=user_id).first()
    if row is None:
        row = db.Profile(user_id=user_id, resume_text="", parsed_profile={})
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
    return row


EMPTY_PROFILE = {
    "name": "", "email": "", "phone": "", "career_goals": "",
    "skills": [], "projects": [], "publications": [],
}


# ══════════════════════════════════════════════════════════════════════════════
# SETTINGS ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/settings")
def get_settings(user_id: str = Depends(current_user_id), db_session: Session = Depends(db.get_db)):
    row = _get_or_create_settings(db_session, user_id)
    return settings_to_public(row)


@app.post("/api/settings")
def update_settings(
    payload: SettingsUpdate,
    user_id: str = Depends(current_user_id),
    db_session: Session = Depends(db.get_db),
):
    _check_auth_limit(user_id)
    row = _get_or_create_settings(db_session, user_id)

    updates = {}
    if payload.gemini_models is not None:
        updates["gemini_models"] = [m for m in payload.gemini_models if m.strip()] or DEFAULT_GEMINI_MODELS
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

    for field, value in updates.items():
        setattr(row, field, value)

    _apply_key_edits(db_session, row, payload)
    db_session.commit()
    db_session.refresh(row)
    return {"status": "success", "message": "Settings updated", "settings": settings_to_public(row)}


# ══════════════════════════════════════════════════════════════════════════════
# PROFILE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/profile")
def get_profile(user_id: str = Depends(current_user_id), db_session: Session = Depends(db.get_db)):
    row = _get_or_create_profile(db_session, user_id)
    profile = row.parsed_profile or {}
    for key in EMPTY_PROFILE:
        profile.setdefault(key, EMPTY_PROFILE[key])
    return {"resume_text": row.resume_text or "", "parsed_profile": profile}


@app.post("/api/profile")
def update_profile(
    payload: ProfileUpdate,
    user_id: str = Depends(current_user_id),
    db_session: Session = Depends(db.get_db),
):
    row = _get_or_create_profile(db_session, user_id)
    row.resume_text = payload.resume_text
    row.parsed_profile = payload.parsed_profile or {}
    db_session.commit()
    return {"status": "success", "message": "Profile updated"}


def _save_profile(db_session: Session, user_id: str, resume_text: str, parsed_profile: dict) -> None:
    row = _get_or_create_profile(db_session, user_id)
    row.resume_text = resume_text
    row.parsed_profile = parsed_profile
    db_session.commit()


@app.post("/api/profile/upload-resume")
async def upload_resume(
    file: UploadFile = File(...),
    user_id: str = Depends(current_user_id),
    db_session: Session = Depends(db.get_db),
):
    """Upload a PDF resume; AI parses it into structured fields (user-scoped)."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    if file.size and file.size > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="PDF too large (max 15 MB).")

    _check_generation_limit(user_id)
    file_bytes = await file.read()
    extracted_text = parse_pdf(file_bytes)

    generator = build_generator_for(user_id, db_session)
    parsed_profile = generator.parse_resume(extracted_text) or {}
    for key in ["name", "email", "phone", "career_goals"]:
        if not parsed_profile.get(key):
            parsed_profile[key] = ""
    for key in ["skills", "projects", "publications"]:
        if not isinstance(parsed_profile.get(key), list):
            parsed_profile[key] = []

    _save_profile(db_session, user_id, extracted_text, parsed_profile)
    return {"status": "success", "resume_text": extracted_text, "parsed_profile": parsed_profile}


@app.post("/api/profile/parse-text")
def parse_resume_text(
    payload: dict,
    user_id: str = Depends(current_user_id),
    db_session: Session = Depends(db.get_db),
):
    raw_text = (payload.get("resume_text") or "").strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="resume_text cannot be empty")

    _check_generation_limit(user_id)
    generator = build_generator_for(user_id, db_session)
    parsed_profile = generator.parse_resume(raw_text) or {}
    _save_profile(db_session, user_id, raw_text, parsed_profile)
    return {"status": "success", "parsed_profile": parsed_profile}


@app.post("/api/jobs/extract")
def extract_job_from_text(
    payload: JobExtractRequest,
    user_id: str = Depends(current_user_id),
    db_session: Session = Depends(db.get_db),
):
    if not payload.raw_text.strip():
        raise HTTPException(status_code=400, detail="raw_text cannot be empty")

    _check_generation_limit(user_id)
    generator = build_generator_for(user_id, db_session)
    return generator.extract_job_details(payload.raw_text)


# ══════════════════════════════════════════════════════════════════════════════
# APPLICATION ENDPOINTS (all user-scoped)
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/applications")
def list_applications(user_id: str = Depends(current_user_id), db_session: Session = Depends(db.get_db)):
    rows = (
        db_session.query(db.Application)
        .filter_by(user_id=user_id)
        .order_by(db.Application.id.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "company": r.company,
            "position": r.position,
            "location": r.location,
            "status": r.status,
            "match_score": r.match_score,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@app.post("/api/applications")
def create_application(
    payload: ApplicationCreate,
    user_id: str = Depends(current_user_id),
    db_session: Session = Depends(db.get_db),
):
    row = db.Application(
        user_id=user_id,
        company=payload.company.strip(),
        position=payload.position.strip(),
        location=payload.location.strip(),
        description=payload.description,
        status="New",
        match_score=0,
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    return {"status": "success", "id": row.id}


@app.delete("/api/applications/{app_id}")
def delete_application(app_id: int, user_id: str = Depends(current_user_id), db_session: Session = Depends(db.get_db)):
    row = _get_owned_application(db_session, user_id, app_id)
    db_session.delete(row)
    db_session.commit()
    return {"status": "success", "message": "Application deleted"}


@app.get("/api/applications/{app_id}")
def get_application(app_id: int, user_id: str = Depends(current_user_id), db_session: Session = Depends(db.get_db)):
    row = _get_owned_application(db_session, user_id, app_id)
    return {
        "id": row.id,
        "company": row.company,
        "position": row.position,
        "location": row.location,
        "description": row.description,
        "status": row.status,
        "match_score": row.match_score,
        "details": row.details or {},
        "resume_suggestions": row.resume_suggestions or {},
        "cover_letter_plan": row.cover_letter_plan or [],
        "cover_letter": row.cover_letter,
        "audit_trail": row.audit_trail or [],
        "feedback": row.feedback or {},
    }


# Mock professor papers — replace with a real publication API (e.g. OpenAlex) later.
_SEED_PROFESSOR_PAPERS = [
    {
        "title": "Vision-guided gaze control for humanoid robots in social settings",
        "abstract": "This paper presents a latency-reduced active gaze control loop for a humanoid robotic head, achieving human-like facial visual responses.",
        "keywords": "ROS2, Gaze control, Face tracking, Humanoid Head",
    },
    {
        "title": "Deep learning models for real-time expression detection",
        "abstract": "We evaluate lightweight convolution networks for high-frequency micro-expression classification on social humanoid devices.",
        "keywords": "Deep learning, facial gesture, camera, expression",
    },
]


@app.post("/api/applications/{app_id}/analyze")
def analyze_application(app_id: int, user_id: str = Depends(current_user_id), db_session: Session = Depends(db.get_db)):
    row = _get_owned_application(db_session, user_id, app_id)
    _check_generation_limit(user_id)

    profile_row = _get_or_create_profile(db_session, user_id)
    profile_data = {"resume_text": profile_row.resume_text or "", "parsed_profile": profile_row.parsed_profile or {}}
    job_desc = row.description or ""

    generator = build_generator_for(user_id, db_session)
    job_analysis = generator.analyze_job(job_desc)
    suit_gap = generator.analyze_suitability(profile_data["parsed_profile"], job_analysis)

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

    research_match = match_research_profile(
        profile_data["parsed_profile"].get("publications", []),
        profile_data["parsed_profile"].get("projects", []),
        _SEED_PROFESSOR_PAPERS,
    )
    details["researchMatcher"] = research_match

    row.details = details
    row.resume_suggestions = ats_results
    row.match_score = int(overall_match)
    row.status = "Analyzed"
    db_session.commit()
    return {"status": "success", "match_score": overall_match}


@app.post("/api/applications/{app_id}/plan")
def plan_application(app_id: int, user_id: str = Depends(current_user_id), db_session: Session = Depends(db.get_db)):
    row = _get_owned_application(db_session, user_id, app_id)
    if not row.details:
        raise HTTPException(status_code=400, detail="Run analysis first")

    _check_generation_limit(user_id)
    generator = build_generator_for(user_id, db_session)
    plan = generator.plan_cover_letter(row.details.get("jobAnalysis", {}), row.details.get("suitability", {}))
    row.cover_letter_plan = plan
    db_session.commit()
    return {"status": "success", "plan": plan}


@app.post("/api/applications/{app_id}/generate")
def generate_application_materials(
    app_id: int,
    payload: ApplicationGenerateRequest,
    user_id: str = Depends(current_user_id),
    db_session: Session = Depends(db.get_db),
):
    row = _get_owned_application(db_session, user_id, app_id)
    if not row.details:
        raise HTTPException(status_code=400, detail="Run analysis first")

    _check_generation_limit(user_id)
    profile_row = _get_or_create_profile(db_session, user_id)
    settings_row = _get_or_create_settings(db_session, user_id)
    settings = settings_to_public(settings_row)

    generator = _generator_from_row(settings_row)
    results = generator.generate_cover_letter(
        profile_row.parsed_profile or {},
        row.details.get("jobAnalysis", {}),
        payload.plan or [],
        settings,
        style=payload.style or "industrial",
    )

    row.cover_letter = results["coverLetter"]
    row.audit_trail = results.get("auditTrail", [])
    row.feedback = results.get("feedback", {})
    row.cover_letter_plan = payload.plan
    row.status = "Completed"
    db_session.commit()
    return {"status": "success"}


@app.get("/api/applications/{app_id}/export/{export_format}")
def export_application_letter(app_id: int, export_format: str, user_id: str = Depends(current_user_id), db_session: Session = Depends(db.get_db)):
    row = _get_owned_application(db_session, user_id, app_id)
    if not row.cover_letter:
        raise HTTPException(status_code=404, detail="Cover letter not found or not generated yet")

    profile_row = _get_or_create_profile(db_session, user_id)
    pp = profile_row.parsed_profile or {}
    candidate_name = pp.get("name") or "Candidate Name"
    candidate_email = pp.get("email") or "email@example.com"
    candidate_phone = pp.get("phone") or "+49 123 456789"

    safe_company = (row.company or "Company").replace(" ", "_")
    safe_position = (row.position or "Position").replace(" ", "_")
    filename = f"CoverLetter_{safe_company}_{safe_position}"

    if export_format == "txt":
        return Response(
            content=export_txt(row.cover_letter),
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{filename}.txt"'},
        )
    if export_format == "docx":
        return Response(
            content=export_docx(row.cover_letter, candidate_name, candidate_email, candidate_phone),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}.docx"'},
        )
    if export_format == "latex":
        return Response(
            content=export_latex(row.cover_letter, candidate_name, candidate_email, candidate_phone),
            media_type="application/x-tex",
            headers={"Content-Disposition": f'attachment; filename="{filename}.tex"'},
        )
    raise HTTPException(status_code=400, detail="Invalid format. Supported: txt, docx, latex")


@app.post("/api/applications/{app_id}/refine")
def refine_application_letter(
    app_id: int,
    payload: CoverLetterRefineRequest,
    user_id: str = Depends(current_user_id),
    db_session: Session = Depends(db.get_db),
):
    row = _get_owned_application(db_session, user_id, app_id)
    if not row.cover_letter:
        raise HTTPException(status_code=400, detail="No cover letter generated yet. Generate one first.")

    _check_generation_limit(user_id)
    profile_row = _get_or_create_profile(db_session, user_id)
    settings = settings_to_public(_get_or_create_settings(db_session, user_id))

    generator = build_generator_for(user_id, db_session)
    results = generator.refine_cover_letter(
        current_letter=row.cover_letter,
        user_feedback=payload.feedback,
        profile=profile_row.parsed_profile or {},
        job_analysis=(row.details or {}).get("jobAnalysis", {}),
        settings=settings,
        style=payload.style or "industrial",
    )

    row.cover_letter = results["coverLetter"]
    row.audit_trail = results.get("auditTrail", [])
    row.feedback = results.get("feedback", {})
    db_session.commit()

    return {
        "status": "success",
        "changesSummary": results.get("changesSummary", "Letter refined."),
        "cover_letter": results["coverLetter"],
        "feedback": results.get("feedback", {}),
    }


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
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
else:
    @app.get("/")
    def index_fallback():
        return {"message": "Vitralume API running. Build the frontend (frontend/) to serve the UI here."}
