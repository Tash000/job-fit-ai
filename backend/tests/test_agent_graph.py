"""
Tests for the LangGraph Multi-Agent Pipeline.
"""

import pytest
from tests.conftest import auth
import main
from services.rag import index_user_resume
from services.agent_graph import (
    _heuristic_extract_job,
    ats_evaluator_node,
    human_copy_writer_node,
    requirement_extractor_node,
    run_application_agent_graph,
)


def test_heuristic_extract_job():
    job_text = """
    Software Engineer at Acme Corp
    We are looking for a Python and React developer.
    Responsibilities:
    • Build robust backend APIs with FastAPI and PostgreSQL
    • Develop interactive frontend dashboards in React and TypeScript
    • Deploy microservices on Docker and Kubernetes
    """
    extracted = _heuristic_extract_job(job_text)
    assert "Acme" in extracted["company"]
    assert any("Engineer" in extracted["role"] or "developer" in extracted["role"].lower() for _ in [1])
    assert "python" in [s.lower() for s in extracted["skills"]]
    assert "react" in [s.lower() for s in extracted["skills"]]
    assert len(extracted["requirements"]) >= 2


def test_requirement_extractor_node():
    state = {
        "job_text": "Hiring for Data Scientist at OpenAI\n• Train deep models with PyTorch\n• Evaluate benchmarks",
        "agent_logs": [],
    }
    result = requirement_extractor_node(state)
    assert "OpenAI" in result["company_name"]
    assert "Data Scientist" in result["role_title"]
    assert len(result["agent_logs"]) == 1
    assert result["agent_logs"][0]["agent"] == "RequirementExtractor"


def test_ats_evaluator_node():
    state = {
        "extracted_skills": ["Python", "FastAPI", "Rust", "Kafka"],
        "grounded_chunks": [
            {"content": "Extensive experience building microservices with Python and FastAPI."},
            {"content": "Managed high throughput streaming data pipelines."},
        ],
        "agent_logs": [],
    }
    result = ats_evaluator_node(state)
    assert "Python" in result["keyword_matches"]
    assert "FastAPI" in result["keyword_matches"]
    assert "Rust" in result["missing_keywords"]
    assert result["ats_score"] > 0
    assert len(result["agent_logs"]) == 1


def test_human_copy_writer_node():
    state = {
        "role_title": "Backend Engineer",
        "company_name": "Stripe",
        "grounded_chunks": [
            {"tag": "EXP § 1", "content": "Engineered transactional payment processing systems handling $10M daily volume."},
            {"tag": "EXP § 2", "content": "Designed idempotent webhook delivery architecture with 99.99% uptime."},
        ],
        "agent_logs": [],
    }
    result = human_copy_writer_node(state)
    draft = result["cover_letter_draft"]
    assert "Stripe" in draft
    assert "Backend Engineer" in draft
    # Check that it injected verified facts
    assert "payment processing" in draft.lower() or "transactional" in draft.lower() or "webhook" in draft.lower()
    # Check that generic AI fluff was avoided
    forbidden = ["spearhead", "synergize", "deterministic", "testament", "esteemed"]
    for word in forbidden:
        assert word not in draft.lower()
    assert result["iteration"] == 1


def test_run_application_agent_graph_end_to_end():
    db = main.db.SessionLocal()
    try:
        user_id = "user-langgraph-agent-test"
        sample_profile = {
            "experience": [
                {
                    "company": "Scale AI",
                    "role": "Senior Platform Engineer",
                    "bullets": [
                        "Architected scalable ingestion pipeline using FastAPI, Python, and PostgreSQL.",
                        "Optimized query performance and reduced P99 latency by 65%.",
                    ],
                }
            ],
            "projects": [
                {
                    "name": "CloudOrchestrator",
                    "description": "Distributed task runner with real-time websocket monitoring.",
                    "tech_stack": ["React", "TypeScript", "Docker"],
                }
            ],
        }

        # Index user resume
        index_user_resume(
            db=db,
            user_id=user_id,
            resume_text="",
            parsed_profile=sample_profile,
        )

        job_posting = """
        Platform Engineer at Anthropic
        We are seeking a Platform Engineer to build high-performance data systems.
        Key skills:
        • Python, FastAPI, PostgreSQL
        • Docker and distributed architecture
        """

        result = run_application_agent_graph(
            db=db,
            user_id=user_id,
            job_text=job_posting,
            company_name="Anthropic",
            role_title="Platform Engineer",
            max_iterations=1,
        )

        assert result["role_title"] == "Platform Engineer"
        assert result["company_name"] == "Anthropic"
        assert result["ats_score"] > 0
        assert len(result["grounded_chunks"]) > 0
        assert len(result["cover_letter"]) > 100
        assert result["is_approved"] is True
        assert len(result["agent_logs"]) >= 4

        # Verify logs show agent collaboration
        agent_names = [log["agent"] for log in result["agent_logs"]]
        assert "RequirementExtractor" in agent_names
        assert "RAGRetriever" in agent_names
        assert "ATSEvaluator" in agent_names
        assert "HumanCopyWriter" in agent_names
        assert "TruthfulnessCritic" in agent_names

    finally:
        db.close()
