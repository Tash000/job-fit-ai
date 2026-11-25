"""
Tests for the RAG (Retrieval-Augmented Generation) & Semantic Chunking Engine.
"""

import pytest
from tests.conftest import auth
import main
from database import ResumeChunk
from services.rag import (
    audit_claim_with_rag,
    chunk_resume_data,
    compute_embedding,
    cosine_similarity,
    index_user_resume,
    retrieve_grounded_chunks,
)


def test_chunk_resume_structured():
    parsed = {
        "experience": [
            {
                "company": "DeepMind",
                "role": "Research Scientist",
                "bullets": [
                    "Led training of 70B parameter MoE models across 256 H100 GPUs.",
                    "Optimized CUDA kernels reducing latency by 40%.",
                ],
            }
        ],
        "publications": [
            {
                "title": "Scalable Attention Mechanics in Deep Networks",
                "venue": "NeurIPS 2024",
                "abstract": "We introduce sub-quadratic attention approximation.",
            }
        ],
        "projects": [
            {
                "name": "FastInfer",
                "description": "High-throughput serving runtime with vLLM integration.",
                "tech_stack": ["Python", "C++", "CUDA", "Triton"],
            }
        ],
    }

    chunks = chunk_resume_data(resume_text="", parsed_profile=parsed)
    assert len(chunks) == 4

    categories = [c["category"] for c in chunks]
    assert "experience" in categories
    assert "publication" in categories
    assert "project" in categories

    exp_chunk = next(c for c in chunks if c["category"] == "experience")
    assert "70B parameter MoE" in exp_chunk["content"]
    assert exp_chunk["metadata_json"]["tag"].startswith("EXP §")


def test_chunk_resume_raw_fallback():
    raw_text = """
    Jane Doe
    jane@example.com

    EXPERIENCE
    • Senior ML Engineer at TechCorp (2021-2024)
    • Architected distributed embedding pipelines processing 50M requests daily.
    • Mentored junior engineers and instituted code review standards.

    PROJECTS
    • OpenSource RAG Engine - Built vector retrieval system using pgvector and FastAPI.
    """
    chunks = chunk_resume_data(resume_text=raw_text, parsed_profile={})
    assert len(chunks) >= 1
    assert any("distributed embedding pipelines" in c["content"] for c in chunks)


def test_vector_math_and_similarity():
    v1 = compute_embedding("Distributed PyTorch training on GPU clusters")
    v2 = compute_embedding("Deep learning model scaling on multi-GPU hardware")
    v3 = compute_embedding("French pastry baking and sourdough bread fermentation")

    # Normalized vectors
    assert len(v1) == 128
    assert abs(cosine_similarity(v1, v1) - 1.0) < 1e-4

    sim_related = cosine_similarity(v1, v2)
    sim_unrelated = cosine_similarity(v1, v3)

    assert sim_related > sim_unrelated
    assert sim_related > 0.35


def test_index_and_retrieve_rag_corpus():
    db_session = main.db.SessionLocal()
    test_user_id = "test-user-rag-1"
    try:
        parsed = {
            "experience": [
                {
                    "company": "Anthropic",
                    "role": "Alignment Researcher",
                    "bullets": [
                        "Conducted constitutional AI evaluations on reasoning models.",
                        "Implemented automated red-teaming harnesses using LangChain.",
                    ],
                }
            ]
        }

        count = index_user_resume(
            db=db_session,
            user_id=test_user_id,
            resume_text="Sample text",
            parsed_profile=parsed,
        )
        assert count == 2

        # Verify rows in DB
        stored = db_session.query(ResumeChunk).filter_by(user_id=test_user_id).all()
        assert len(stored) == 2

        # Query for alignment and red-teaming
        results = retrieve_grounded_chunks(
            db=db_session,
            user_id=test_user_id,
            query="red-teaming reasoning models",
            top_k=2,
        )
        assert len(results) == 2
        assert "red-teaming" in results[0]["content"]
        assert results[0]["score"] > 0.4
        assert "[VERIFIED:" in results[0]["citation"]
    finally:
        db_session.close()


def test_audit_claim_with_rag():
    db_session = main.db.SessionLocal()
    test_user_id = "test-user-rag-2"
    try:
        parsed = {
            "experience": [
                {
                    "company": "OpenAI",
                    "role": "Systems Engineer",
                    "bullets": [
                        "Engineered Triton kernels for FP8 matrix multiplications.",
                    ],
                }
            ]
        }
        index_user_resume(
            db=db_session,
            user_id=test_user_id,
            resume_text="",
            parsed_profile=parsed,
        )

        # Grounded claim
        audit_grounded = audit_claim_with_rag(
            db=db_session,
            user_id=test_user_id,
            claim="I developed custom Triton kernels for FP8 matrix operations.",
            threshold=0.40,
        )
        assert audit_grounded["verified"] is True
        assert "[VERIFIED:" in audit_grounded["citation"]

        # Ungrounded claim (hallucination)
        audit_hallucination = audit_claim_with_rag(
            db=db_session,
            user_id=test_user_id,
            claim="I won the Nobel Prize in Physics for quantum gravity experiments.",
            threshold=0.55,
        )
        assert audit_hallucination["verified"] is False
    finally:
        db_session.close()


def test_rag_api_endpoints(client):
    headers = auth("alice")

    # 1. Update profile with sample experience
    profile_data = {
        "resume_text": "Experienced software architect.",
        "parsed_profile": {
            "experience": [
                {
                    "company": "Stripe",
                    "role": "Staff Engineer",
                    "bullets": [
                        "Architected global idempotency engine handling $10B annual volume.",
                    ],
                }
            ]
        },
    }
    r = client.post("/api/profile", json=profile_data, headers=headers)
    assert r.status_code == 200

    # 2. Trigger explicit RAG index
    r = client.post("/api/rag/index", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "success"
    assert data["indexed_chunks"] >= 1

    # 3. Retrieve chunks
    r = client.post(
        "/api/rag/retrieve",
        json={"query": "idempotency payment engine volume", "top_k": 3},
        headers=headers,
    )
    assert r.status_code == 200
    ret_data = r.json()
    assert ret_data["count"] >= 1
    assert any("idempotency" in m["content"] for m in ret_data["matches"])

    # 4. Verify claim
    r = client.post(
        "/api/rag/verify-claim",
        json={"claim": "Built high-volume idempotency systems at Stripe.", "threshold": 0.40},
        headers=headers,
    )
    assert r.status_code == 200
    v_data = r.json()
    assert v_data["verified"] is True
