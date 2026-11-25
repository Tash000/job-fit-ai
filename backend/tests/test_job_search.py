"""
Tests for Personalized Job Search & Board Directory Service.
"""

from services.job_search import (
    extract_search_profile_from_resume,
    generate_board_links,
    get_personalized_job_recommendations,
    load_job_boards,
)


def test_load_job_boards():
    boards = load_job_boards()
    assert len(boards) >= 6
    board_ids = [b["id"] for b in boards]
    assert "linkedin" in board_ids
    assert "indeed" in board_ids
    assert "wellfound" in board_ids
    assert "remoteok" in board_ids


def test_extract_search_profile_from_resume():
    parsed = {
        "experience": [
            {
                "role": "Staff Platform Engineer",
                "company": "Supabase",
                "bullets": ["Led distributed database replication."],
            }
        ],
        "skills": ["Python", "FastAPI", "React", "PostgreSQL"],
    }
    profile = extract_search_profile_from_resume(resume_text="", parsed_profile=parsed)
    assert profile["primary_title"] == "Staff Platform Engineer"
    assert "Python" in profile["detected_skills"]
    assert "FastAPI" in profile["detected_skills"]
    assert "Pydantic" in profile["recommended_keywords"] or "Docker" in profile["recommended_keywords"]
    assert "Staff Platform Engineer" in profile["standard_query"]
    assert "Staff Platform Engineer" in profile["boolean_query"]


def test_generate_board_links():
    boards = [
        {
            "id": "linkedin",
            "name": "LinkedIn",
            "search_url_template": "https://www.linkedin.com/jobs/search/?keywords={keywords}&location={location}",
        },
        {
            "id": "remoteok",
            "name": "RemoteOK",
            "search_url_template": "https://remoteok.com/remote-{keywords}-jobs",
        },
    ]

    links = generate_board_links(boards, query="Senior Python Engineer", location="remote")
    assert len(links) == 2
    linkedin = next(l for l in links if l["id"] == "linkedin")
    assert "Senior+Python+Engineer" in linkedin["search_url"] or "Senior%20Python%20Engineer" in linkedin["search_url"]

    remoteok = next(l for l in links if l["id"] == "remoteok")
    assert "https://remoteok.com/remote-senior-python-engineer-jobs" == remoteok["search_url"]


def test_get_personalized_job_recommendations():
    raw_text = "Experienced Backend Engineer specializing in Python, FastAPI, Docker, and PostgreSQL."
    res = get_personalized_job_recommendations(resume_text=raw_text)
    assert res["total_boards"] >= 6
    assert len(res["board_links"]) >= 6
    assert "Backend Engineer" in res["profile"]["primary_title"]
    assert res["location"] == "remote"
