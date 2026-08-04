"""Unit tests for the ATS optimizer."""

from services.ats_optimizer import calculate_ats_score, extract_keywords, suggest_unused_projects


def test_extract_keywords_is_case_insensitive():
    assert set(extract_keywords("I know PYTHON and ros2")) == {"python", "ros2"}


def test_ats_score_returns_structure():
    result = calculate_ats_score(
        "Experienced in Python, Docker, Git. Led team of 5, improved latency by 35%.",
        "We need Python, Docker and Kubernetes expertise.",
    )
    assert 0 <= result["score"] <= 100
    assert "python" in result["keywords"]["found"]
    assert "kubernetes" in result["keywords"]["missing"]


def test_weak_bullet_detection():
    resume = "- worked on the dashboard\n- Led migration cutting deploy time by 40%"
    result = calculate_ats_score(resume, "Python")
    bullets = result["weakBullets"]
    assert any("worked on" in " ".join(b["issues"]) for b in bullets)
    assert all(b["original"] != "Led migration cutting deploy time by 40%" for b in bullets)


def test_suggest_unused_projects():
    projects = [
        {"title": "Robot Arm", "description": "ROS2 control system", "technologies": ["ros2"]},
        {"title": "Web Shop", "description": "React storefront", "technologies": ["react"]},
    ]
    suggestions = suggest_unused_projects(projects, "Looking for ROS2 engineers", "I did a Web Shop.")
    assert len(suggestions) == 1
    assert suggestions[0]["title"] == "Robot Arm"
    assert "ros2" in suggestions[0]["matchingKeywords"]
