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


def init_db() -> None:
    """Create all tables (idempotent). Call once on startup."""
    Base.metadata.create_all(bind=engine)


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

    details = Column(JSON, default=None)            # job analysis, suitability, research matcher
    resume_suggestions = Column(JSON, default=None)  # ATS scan results
    cover_letter_plan = Column(JSON, default=None)
    cover_letter = Column(Text, default=None)
    audit_trail = Column(JSON, default=None)
    feedback = Column(JSON, default=None)

    created_at = Column(DateTime, default=datetime.utcnow)


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

DEFAULT_GEMINI_MODELS = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"]
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
