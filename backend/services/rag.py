"""
RAG (Retrieval-Augmented Generation) & Semantic Chunking Engine for Vitralume.

Deconstructs resumes, projects, and research papers into atomic searchable units,
computes vector embeddings, and provides semantic retrieval and claim-level
grounding for ATS scoring and cover letter generation.
"""

import hashlib
import math
import re
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from database import ResumeChunk

try:
    import config
except ImportError:
    config = None

# Optional Google GenAI SDK for remote embeddings
try:
    from google import genai as _genai
    _GENAI_AVAILABLE = True
except ImportError:
    _genai = None
    _GENAI_AVAILABLE = False


# ──────────────────────────────────────────────────────────────────────────────
# 1. Deterministic Fallback & Remote Vectorizer
# ──────────────────────────────────────────────────────────────────────────────

_DEFAULT_VECTOR_DIM = 128


def _hash_vectorize(text: str, dim: int = _DEFAULT_VECTOR_DIM) -> List[float]:
    """
    Deterministic semantic hash vectorizer (bag of n-grams + word tokens)
    normalized to the unit sphere (L2 norm = 1.0).
    Ensures tests and offline/local usage run with zero remote network calls.
    """
    clean = re.sub(r"[^\w\s]", " ", text.lower())
    tokens = [t for t in clean.split() if len(t) > 2]
    vec = [0.0] * dim

    if not tokens:
        return vec

    # Word unigrams
    for t in tokens:
        h = int(hashlib.md5(t.encode("utf-8")).hexdigest(), 16) % dim
        vec[h] += 1.0

    # Character 3-grams for morphological / typo tolerance
    for i in range(len(clean) - 2):
        trigram = clean[i:i + 3]
        h = int(hashlib.md5(trigram.encode("utf-8")).hexdigest(), 16) % dim
        vec[h] += 0.5

    # L2 normalize
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [round(x / norm, 5) for x in vec]
    return vec


def compute_embedding(text: str, api_keys: Optional[List[str]] = None) -> List[float]:
    """
    Generate dense embedding vector. Uses Gemini text-embedding-004 if available
    and an API key is provided; otherwise falls back to deterministic vectorizer.
    """
    text = (text or "").strip()
    if not text:
        return [0.0] * _DEFAULT_VECTOR_DIM

    valid_keys = [k for k in (api_keys or []) if k.strip()]
    if config and getattr(config, "CURATION_API_KEY", ""):
        cur_key = config.CURATION_API_KEY
        if cur_key and cur_key not in valid_keys:
            valid_keys.insert(0, cur_key)

    if _GENAI_AVAILABLE and valid_keys:
        for key in valid_keys:
            try:
                client = _genai.Client(api_key=key)
                resp = client.models.embed_content(
                    model="text-embedding-004",
                    contents=text[:2000],
                )
                if hasattr(resp, "embedding") and hasattr(resp.embedding, "values"):
                    vals = list(resp.embedding.values)
                    # Normalize
                    norm = math.sqrt(sum(x * x for x in vals))
                    return [round(x / norm, 5) for x in vals] if norm > 0 else vals
            except Exception:
                continue

    return _hash_vectorize(text, dim=_DEFAULT_VECTOR_DIM)


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Compute cosine similarity between two float vectors."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return max(0.0, min(1.0, dot / (norm_a * norm_b)))


# ──────────────────────────────────────────────────────────────────────────────
# 2. Semantic Document Chunking
# ──────────────────────────────────────────────────────────────────────────────

def chunk_resume_data(
    resume_text: str,
    parsed_profile: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Deconstructs raw resume text and structured parsed profile into discrete
    semantic chunks: experience bullets, publications, projects, education, and skills.
    """
    chunks: List[Dict[str, Any]] = []
    idx = 1
    profile = parsed_profile or {}

    # 1. Experience chunks
    experiences = profile.get("experience", [])
    if isinstance(experiences, list) and experiences:
        for exp in experiences:
            if isinstance(exp, dict):
                company = exp.get("company") or exp.get("employer") or "Experience"
                role = exp.get("role") or exp.get("title") or "Role"
                bullets = exp.get("bullets") or exp.get("highlights") or []
                if isinstance(bullets, list) and bullets:
                    for b in bullets:
                        if isinstance(b, str) and b.strip():
                            chunks.append({
                                "chunk_index": idx,
                                "category": "experience",
                                "title": f"{role} at {company}",
                                "content": f"{role} at {company}: {b.strip()}",
                                "metadata_json": {"company": company, "role": role, "tag": f"EXP § {idx}"},
                            })
                            idx += 1
                elif exp.get("description"):
                    chunks.append({
                        "chunk_index": idx,
                        "category": "experience",
                        "title": f"{role} at {company}",
                        "content": f"{role} at {company}: {exp.get('description')}",
                        "metadata_json": {"company": company, "role": role, "tag": f"EXP § {idx}"},
                    })
                    idx += 1

    # 2. Publication chunks
    publications = profile.get("publications", [])
    if isinstance(publications, list) and publications:
        for pub in publications:
            if isinstance(pub, dict):
                title = pub.get("title") or "Research Publication"
                venue = pub.get("venue") or pub.get("journal") or pub.get("conference") or ""
                summary = pub.get("summary") or pub.get("abstract") or ""
                chunks.append({
                    "chunk_index": idx,
                    "category": "publication",
                    "title": title,
                    "content": f"Publication: {title}. {f'Venue: {venue}. ' if venue else ''}{summary}".strip(),
                    "metadata_json": {"title": title, "venue": venue, "tag": f"PUB § {idx}"},
                })
                idx += 1

    # 3. Project chunks
    projects = profile.get("projects", [])
    if isinstance(projects, list) and projects:
        for proj in projects:
            if isinstance(proj, dict):
                p_name = proj.get("name") or proj.get("title") or "Project"
                desc = proj.get("description") or proj.get("summary") or ""
                stack = proj.get("tech_stack") or proj.get("technologies") or []
                stack_str = f" Stack: {', '.join(stack)}." if stack else ""
                chunks.append({
                    "chunk_index": idx,
                    "category": "project",
                    "title": p_name,
                    "content": f"Project {p_name}: {desc}{stack_str}".strip(),
                    "metadata_json": {"project": p_name, "tag": f"PRJ § {idx}"},
                })
                idx += 1

    # 4. Fallback / Raw text chunking if structured sections yielded few chunks
    if len(chunks) < 3 and resume_text:
        lines = [ln.strip() for ln in resume_text.splitlines() if ln.strip()]
        current_block: List[str] = []
        for line in lines:
            if re.match(r"^([•\-\*]|\d+\.|\b(experience|education|projects|skills|publications)\b)", line, re.I):
                if current_block:
                    text_chunk = " ".join(current_block)
                    if len(text_chunk) > 40:
                        chunks.append({
                            "chunk_index": idx,
                            "category": "experience",
                            "title": f"Resume Excerpt {idx}",
                            "content": text_chunk,
                            "metadata_json": {"tag": f"RES § {idx}"},
                        })
                        idx += 1
                    current_block = [line]
                else:
                    current_block.append(line)
            else:
                current_block.append(line)
                if len(" ".join(current_block)) > 350:
                    chunks.append({
                        "chunk_index": idx,
                        "category": "experience",
                        "title": f"Resume Excerpt {idx}",
                        "content": " ".join(current_block),
                        "metadata_json": {"tag": f"RES § {idx}"},
                    })
                    idx += 1
                    current_block = []

        if current_block:
            text_chunk = " ".join(current_block)
            if len(text_chunk) > 30:
                chunks.append({
                    "chunk_index": idx,
                    "category": "experience",
                    "title": f"Resume Excerpt {idx}",
                    "content": text_chunk,
                    "metadata_json": {"tag": f"RES § {idx}"},
                })
                idx += 1

    return chunks


# ──────────────────────────────────────────────────────────────────────────────
# 3. Ingestion, Indexing & Retrieval
# ──────────────────────────────────────────────────────────────────────────────

def index_user_resume(
    db: Session,
    user_id: str,
    resume_text: str,
    parsed_profile: Optional[Dict[str, Any]] = None,
    resume_id: Optional[int] = None,
    api_keys: Optional[List[str]] = None,
) -> int:
    """
    Chunks and indexes a user's resume into the database with precalculated embeddings.
    Replaces existing chunks for the same user and resume_id.
    """
    query = db.query(ResumeChunk).filter(ResumeChunk.user_id == user_id)
    if resume_id is not None:
        query = query.filter(ResumeChunk.resume_id == resume_id)
    query.delete(synchronize_session=False)

    raw_chunks = chunk_resume_data(resume_text, parsed_profile)
    for c in raw_chunks:
        emb = compute_embedding(c["content"], api_keys=api_keys)
        chunk_row = ResumeChunk(
            user_id=user_id,
            resume_id=resume_id,
            category=c.get("category", "experience"),
            chunk_index=c.get("chunk_index", 0),
            title=c.get("title", ""),
            content=c.get("content", ""),
            embedding=emb,
            metadata_json=c.get("metadata_json", {}),
        )
        db.add(chunk_row)

    db.commit()
    return len(raw_chunks)


def retrieve_grounded_chunks(
    db: Session,
    user_id: str,
    query: str,
    top_k: int = 5,
    category: Optional[str] = None,
    api_keys: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Finds the top_k most relevant chunks from the user's indexed corpus for the given query.
    Returns chunk content, tag, score, and title.
    """
    query_vec = compute_embedding(query, api_keys=api_keys)
    q = db.query(ResumeChunk).filter(ResumeChunk.user_id == user_id)
    if category:
        q = q.filter(ResumeChunk.category == category)

    candidates = q.all()
    if not candidates:
        return []

    scored = []
    for c in candidates:
        emb = c.embedding or []
        sim = cosine_similarity(query_vec, emb)
        tag = (c.metadata_json or {}).get("tag") or f"§ {c.chunk_index}"
        scored.append({
            "chunk_id": c.id,
            "category": c.category,
            "title": c.title,
            "content": c.content,
            "score": round(sim, 4),
            "tag": tag,
            "citation": f"[VERIFIED: {tag} - {c.title}]" if c.title else f"[VERIFIED: {tag}]",
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


def audit_claim_with_rag(
    db: Session,
    user_id: str,
    claim: str,
    threshold: float = 0.45,
    api_keys: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Verifies an individual claim or sentence against the user's indexed corpus.
    Returns verified=True if at least one chunk has cosine similarity >= threshold.
    """
    results = retrieve_grounded_chunks(
        db=db,
        user_id=user_id,
        query=claim,
        top_k=1,
        api_keys=api_keys,
    )
    if not results or results[0]["score"] < threshold:
        return {
            "claim": claim,
            "verified": False,
            "score": results[0]["score"] if results else 0.0,
            "citation": None,
            "best_match": results[0]["content"] if results else None,
        }

    top = results[0]
    return {
        "claim": claim,
        "verified": True,
        "score": top["score"],
        "citation": top["citation"],
        "best_match": top["content"],
    }
