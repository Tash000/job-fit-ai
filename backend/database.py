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
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CompanyResearch(Base):
    __tablename__ = "company_research"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(64), index=True, nullable=False)
    company = Column(String(255), nullable=False)
    researched_info = Column(JSON, default=dict)


# ── Defaults ──────────────────────────────────────────────────────────────────

# "gemini-3.5-flash" is the default model offered when adding a new model.
DEFAULT_GEMINI_MODELS = ["gemini-3.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"]

# ── Per-account limits ────────────────────────────────────────────────────────
MAX_ANALYSES_PER_USER = 500   # max stored job analyses per account
MAX_RESUMES_PER_USER = 5      # max saved resumes/CVs per account
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
