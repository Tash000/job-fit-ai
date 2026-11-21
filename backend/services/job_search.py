"""
Personalized Job Search & Curated Board Directory Service for Vitralume.

Analyzes candidate resume signals to:
1. Identify primary and secondary target job titles.
2. Extract high-impact search keywords and ATS-preferred skills.
3. Suggest complementary recruiter keywords used in job postings.
4. Generate 1-click deep-search URLs across major curated job boards.
"""

import json
import os
import re
import urllib.parse
from typing import Any, Dict, List, Optional

# Load curated job boards catalog
_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_BOARDS_FILE = os.path.join(_DATA_DIR, "job_boards.json")

# Domain knowledge: Related keyword clustering to recommend terms that recruiters search for
KEYWORD_CLUSTERS = {
    "python": ["FastAPI", "Django", "AsyncIO", "PostgreSQL", "Docker", "PyTest"],
    "fastapi": ["Pydantic", "SQLAlchemy", "Uvicorn", "PostgreSQL", "Docker", "REST API"],
    "react": ["TypeScript", "Next.js", "Tailwind CSS", "Redux", "Vite", "REST API"],
    "typescript": ["React", "Node.js", "Next.js", "Express", "GraphQL", "Jest"],
    "machine learning": ["PyTorch", "TensorFlow", "Hugging Face", "RAG", "LLM", "CUDA"],
    "llm": ["RAG", "LangChain", "LangGraph", "Vector DB", "Prompt Engineering", "Fine-Tuning"],
    "rag": ["Vector Search", "ChromaDB", "pgvector", "Embeddings", "LangChain", "LLM"],
    "devops": ["Docker", "Kubernetes", "Terraform", "CI/CD", "AWS", "GitHub Actions"],
    "cloud": ["AWS", "GCP", "Azure", "Terraform", "Serverless", "Docker"],
    "data engineer": ["Apache Spark", "Airflow", "Kafka", "SQL", "Snowflake", "dbt"],
    "backend": ["PostgreSQL", "Redis", "Microservices", "Docker", "REST API", "System Design"],
    "frontend": ["React", "TypeScript", "Tailwind CSS", "CSS3", "Responsive Design", "Next.js"],
}


def load_job_boards() -> List[Dict[str, Any]]:
    """Loads curated job boards configuration from disk."""
    if not os.path.isfile(_BOARDS_FILE):
        return []
    try:
        with open(_BOARDS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def extract_search_profile_from_resume(
    resume_text: str,
    parsed_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Extracts target roles, primary tech stack, and complementary search keywords
    from candidate's resume and structured profile.
    """
    profile = parsed_profile or {}
    detected_titles: List[str] = []
    detected_skills: List[str] = []

    # 1. Extract titles from structured experience
    experiences = profile.get("experience", [])
    if isinstance(experiences, list):
        for exp in experiences:
            if isinstance(exp, dict):
                role = exp.get("role") or exp.get("title")
                if role and isinstance(role, str) and len(role.strip()) > 3:
                    clean_role = re.sub(r"\(.*?\)", "", role).strip()
                    if clean_role and clean_role not in detected_titles:
                        detected_titles.append(clean_role)

    # 2. Extract explicitly listed skills
    skills_field = profile.get("skills", [])
    if isinstance(skills_field, list):
        for s in skills_field:
            if isinstance(s, str) and s.strip() and s.strip() not in detected_skills:
                detected_skills.append(s.strip())
    elif isinstance(skills_field, dict):
        for sub_list in skills_field.values():
            if isinstance(sub_list, list):
                for s in sub_list:
                    if isinstance(s, str) and s.strip() and s.strip() not in detected_skills:
                        detected_skills.append(s.strip())

    # 3. Fallback extraction from raw resume text
    combined_text = (resume_text or "") + " " + json.dumps(profile)
    lower_text = combined_text.lower()

    common_tech = [
        "python", "react", "typescript", "javascript", "fastapi", "django", "node.js",
        "sql", "postgres", "supabase", "docker", "kubernetes", "aws", "gcp", "azure",
        "langchain", "langgraph", "rag", "kafka", "redis", "graphql", "pytorch",
        "go", "rust", "c++", "java", "next.js", "tailwind"
    ]

    for tech in common_tech:
        if re.search(rf"\b{re.escape(tech)}\b", lower_text):
            title_case = tech.upper() if tech in ["sql", "aws", "gcp", "rag", "api"] else tech.title()
            if title_case not in detected_skills:
                detected_skills.append(title_case)

    # If no title detected, infer from skills
    if not detected_titles:
        if any(s.lower() in ["react", "frontend", "next.js"] for s in detected_skills):
            detected_titles.append("Frontend Developer")
        if any(s.lower() in ["fastapi", "django", "backend", "postgres"] for s in detected_skills):
            detected_titles.append("Backend Engineer")
        if any(s.lower() in ["pytorch", "machine learning", "rag", "llm"] for s in detected_skills):
            detected_titles.append("AI / ML Engineer")
        if not detected_titles:
            detected_titles.append("Software Engineer")

    primary_title = detected_titles[0]
    secondary_titles = detected_titles[1:4]

    # 4. Find complementary recruiter keyword recommendations
    recommended_keywords: List[str] = []
    for skill in detected_skills[:8]:
        s_lower = skill.lower()
        if s_lower in KEYWORD_CLUSTERS:
            for related in KEYWORD_CLUSTERS[s_lower]:
                if related not in detected_skills and related not in recommended_keywords:
                    recommended_keywords.append(related)

    # 5. Formulate standard search terms & boolean query string
    top_skills_str = " ".join(detected_skills[:3])
    standard_search_query = f"{primary_title} {top_skills_str}".strip()

    # Boolean recruiter string
    or_skills = " OR ".join([f'"{s}"' for s in detected_skills[:4]]) if detected_skills else '"Python"'
    boolean_query = f'("{primary_title}") AND ({or_skills})'

    return {
        "primary_title": primary_title,
        "secondary_titles": secondary_titles,
        "detected_skills": detected_skills[:12],
        "recommended_keywords": recommended_keywords[:8],
        "standard_query": standard_search_query,
        "boolean_query": boolean_query,
    }


def generate_board_links(
    boards: List[Dict[str, Any]],
    query: str,
    location: str = "remote",
) -> List[Dict[str, Any]]:
    """
    Generates tailored 1-click search deep links for each curated job board.
    """
    clean_query = (query or "").strip()
    encoded_query = urllib.parse.quote_plus(clean_query)
    encoded_location = urllib.parse.quote_plus(location or "remote")

    # Slug for RemoteOK (e.g., 'python-remote' or 'software-engineer')
    slug_query = re.sub(r"[^a-zA-Z0-9]+", "-", clean_query.lower()).strip("-")
    if not slug_query:
        slug_query = "developer"

    results = []
    for b in boards:
        template = b.get("search_url_template", "")
        url = template.replace("{keywords}", encoded_query)
        url = url.replace("{location}", encoded_location)

        if b.get("id") == "remoteok":
            url = f"https://remoteok.com/remote-{slug_query}-jobs"

        results.append({
            "id": b.get("id"),
            "name": b.get("name"),
            "category": b.get("category", "general"),
            "badge": b.get("badge", ""),
            "description": b.get("description", ""),
            "tips": b.get("tips", ""),
            "search_url": url,
            "query_used": clean_query,
        })

    return results


def get_personalized_job_recommendations(
    resume_text: str,
    parsed_profile: Optional[Dict[str, Any]] = None,
    custom_location: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Complete recommendation pipeline:
    Extracts search profile, gathers job boards, and generates customized search links.
    """
    boards = load_job_boards()
    profile_data = extract_search_profile_from_resume(resume_text, parsed_profile)

    location = custom_location or "remote"
    primary_query = profile_data["standard_query"]
    board_links = generate_board_links(boards, query=primary_query, location=location)

    return {
        "profile": profile_data,
        "location": location,
        "board_links": board_links,
        "total_boards": len(board_links),
    }
