"""
Database layer for Vitralume.

Uses SQLAlchemy so the same code runs on:
- PostgreSQL (production, e.g. Supabase)
- SQLite   (local development, zero setup)

Security model: every table carries a ``user_id`` column; all API queries are
filtered by the authenticated user's id (application-level isolation). Optional
Postgres RLS is documented in ``docs/rls.sql`` for defense in depth.
"""

import os
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    inspect,
    text,
)
from sqlalchemy.orm import declarative_base, sessionmaker

import config

# ── Engine / sessions ─────────────────────────────────────────────────────────

_connect_args = {}
if config.DATABASE_URL.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_engine(
    config.DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

Base = declarative_base()


def get_db():
    """FastAPI dependency: one session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _add_column(table: str, column: str, ddl: str) -> None:
    """Idempotently add a column to an existing table (SQLite + Postgres)."""
    try:
        existing = [c["name"] for c in inspect(engine).get_columns(table)]
    except Exception:
        return  # table does not exist (or is being created fresh)
    if column in existing:
        return
    default = "0" if engine.dialect.name == "sqlite" else "false"
    with engine.begin() as conn:
        conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {ddl.format(default=default)}'))


def _migrate() -> None:
    """Lightweight migrations for schemas created before this release.

    ``create_all`` only adds NEW tables — existing tables keep their old
    columns, so new tracking fields are added here idempotently.
    """
    # Application tracking flags (applied / follow-up / bookmark).
    _add_column("applications", "applied", "BOOLEAN NOT NULL DEFAULT {default}")
    _add_column("applications", "applied_date", "VARCHAR(16)")
    _add_column("applications", "follow_up", "BOOLEAN NOT NULL DEFAULT {default}")
    _add_column("applications", "bookmarked", "BOOLEAN NOT NULL DEFAULT {default}")
    # When the job was last analyzed (shown to the user as a timestamp).
    _add_column("applications", "analyzed_at", "TIMESTAMP")
    # Friendly nickname + admin email whitelist.
    _add_column("profiles", "display_name", "VARCHAR(80)")
    _add_column("user_settings", "admin_emails", "JSON")
    # Per-user limit overrides (None → app default; set by the admin console).
    _add_column("user_settings", "analysis_limit", "INTEGER")
    _add_column("user_settings", "resume_limit", "INTEGER")
    # Free-tier counters: how many free analyses / cover letters this account
    # has consumed (users without their own provider key get a small allowance
    # on the platform key before they must add their own).
    _add_column("user_settings", "free_analyses_used", "INTEGER NOT NULL DEFAULT 0")
    _add_column("user_settings", "free_letters_used", "INTEGER NOT NULL DEFAULT 0")


def init_db() -> None:
    """Create all tables (idempotent). Call once on startup."""
    Base.metadata.create_all(bind=engine)
    _migrate()


# ── Models ────────────────────────────────────────────────────────────────────


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(64), index=True, nullable=False)
    resume_text = Column(Text, default="")
    parsed_profile = Column(JSON, default=dict)
    # Friendly nickname shown on the dashboard greeting ("Hi {name}…").
    display_name = Column(String(80), default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(64), index=True, nullable=False)

    company = Column(String(255), default="")
    position = Column(String(255), default="")
    location = Column(String(255), default="")
    description = Column(Text, default="")
    status = Column(String(32), default="New")
    match_score = Column(Integer, default=0)

    # Application-tracking flags (applied / follow-up / bookmark)
    applied = Column(Boolean, default=False)
    applied_date = Column(String(16), default=None)  # ISO date (YYYY-MM-DD)
    follow_up = Column(Boolean, default=False)
    bookmarked = Column(Boolean, default=False)
    analyzed_at = Column(DateTime, default=None)    # last time the job was analyzed

    details = Column(JSON, default=None)            # job analysis, suitability, research matcher
    resume_suggestions = Column(JSON, default=None)  # ATS scan results
    cover_letter_plan = Column(JSON, default=None)
    cover_letter = Column(Text, default=None)
    audit_trail = Column(JSON, default=None)
    feedback = Column(JSON, default=None)

    created_at = Column(DateTime, default=datetime.utcnow)


class Resume(Base):
    """A saved resume/CV in the user's library (max ``MAX_RESUMES_PER_USER``).

    ``name`` is validated on write: 1–30 chars from a safe character set
    (``[A-Za-z0-9 _.-]``) so stored names can never be interpreted as SQL or
    other injection payloads. One row may be flagged ``is_active`` — the active
    resume's content is mirrored into the ``Profile`` row that powers analysis.
    """

    __tablename__ = "resumes"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(64), index=True, nullable=False)
    name = Column(String(60), default="Resume")
    resume_text = Column(Text, default="")
    parsed_profile = Column(JSON, default=dict)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserSettings(Base):
    __tablename__ = "user_settings"
    __table_args__ = (UniqueConstraint("user_id", name="uq_user_settings_user"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(String(64), index=True, nullable=False)

    # Provider API keys are stored ENCRYPTED (JSON list of Fernet tokens).
    gemini_keys_enc = Column(Text, default="[]")
    gemini_models = Column(JSON, default=list)
    nim_keys_enc = Column(Text, default="[]")
    nim_models = Column(JSON, default=list)
    nim_base_url = Column(String(500), default="https://integrate.api.nvidia.com/v1")

    ollama_enabled = Column(Boolean, default=False)
    ollama_base_url = Column(String(500), default="http://localhost:11434")
    ollama_model = Column(String(255), default="llama3")

    active_provider = Column(String(32), default="gemini")
    forbidden_phrases = Column(JSON, default=list)
    tone_settings = Column(JSON, default=dict)
    # Emails exempt from rate limits and per-account storage caps ("admins").
    # Managed exclusively by the admin console — never editable by the user
    # themselves (closes the self-grant loophole).
    admin_emails = Column(JSON, default=list)
    # Per-user limit overrides set by the admin console (None → app default).
    # Admins themselves always bypass every cap regardless of these values.
    analysis_limit = Column(Integer, default=None)
    resume_limit = Column(Integer, default=None)
    # Free-tier usage counters (see FREE_ANALYSES_LIMIT / FREE_LETTERS_LIMIT).
    free_analyses_used = Column(Integer, default=0)
    free_letters_used = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CompanyResearch(Base):
    __tablename__ = "company_research"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(64), index=True, nullable=False)
    company = Column(String(255), nullable=False)
    researched_info = Column(JSON, default=dict)


class User(Base):
    """Directory of known users, fed by every authenticated request.

    Gives the admin console a stable place to list users and their emails
    (the email comes from the caller's verified JWT, or the demo placeholder
    in local demo mode).
    """

    __tablename__ = "users"

    id = Column(String(64), primary_key=True)  # Supabase user id
    email = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ActivityLog(Base):
    """Lightweight audit trail for the admin console (who did what, when)."""

    __tablename__ = "activity_log"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(64), index=True, nullable=False)
    action = Column(String(32), nullable=False)  # app_create / analyze / plan / generate / resume_add …
    detail = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


# ── Defaults ──────────────────────────────────────────────────────────────────

# "gemini-3.5-flash" is the default model offered when adding a new model.
DEFAULT_GEMINI_MODELS = ["gemini-3.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"]

# ── Per-account limits ────────────────────────────────────────────────────────
MAX_ANALYSES_PER_USER = 500   # max stored job analyses per account
MAX_RESUMES_PER_USER = 5      # max saved resumes/CVs per account

# ── Free tier ─────────────────────────────────────────────────────────────────
# Users WITHOUT their own provider API key may run a small number of analyses /
# cover letters on the platform key (admins and key-holders are unlimited).
# After the allowance is used up they must add their own key in Settings.
FREE_ANALYSES_LIMIT = 2   # free job analyses per account (no own key)
FREE_LETTERS_LIMIT = 1    # free cover letter generations per account (no own key)
RESUME_NAME_MAX = 30          # max characters for a resume name
RESUME_NAME_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9 _.-]{0,29}$"
DEFAULT_NIM_MODELS = ["meta/llama-3.1-8b-instruct", "mistralai/mistral-7b-instruct-v0.3"]
DEFAULT_FORBIDDEN_PHRASES = [
    "I am writing to express",
    "I am passionate about",
    "I am excited to",
    "thrilled to apply",
    "please find my resume attached",
]
DEFAULT_TONE = {
    "writingStyle": "professional",
    "activeVoice": True,
    "showMetricConfidence": True,
}
