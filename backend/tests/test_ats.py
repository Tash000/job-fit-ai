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


# ── New advanced ATS capabilities ────────────────────────────────────────────

def test_synonym_and_abbreviation_matching():
    """'ML' in the resume should match 'machine learning' in the JD."""
    result = calculate_ats_score(
        "Senior engineer with deep ML experience. Built k8s clusters.",
        "We need machine learning expertise and Kubernetes.",
    )
    assert "machine learning" in result["keywords"]["found"]
    assert "kubernetes" in result["keywords"]["found"]


def test_jd_specific_keyword_extraction():
    """Role-specific terms outside the taxonomy (TensorRT, PX4) are scored."""
    result = calculate_ats_score(
        "Used TensorRT for inference acceleration on PX4 drones.",
        "We need TensorRT and PX4 experience.",
    )
    assert "TensorRT" in result["keywords"]["found"]
    assert "PX4" in result["keywords"]["found"]


def test_fuzzy_matching_catches_typos():
    result = calculate_ats_score(
        "Managed kubernetis clusters at scale for 3 years.",
        "Kubernetes admin.",
    )
    assert "kubernetes" in result["keywords"]["found"]
    assert "kubernetes" in result["keywords"]["fuzzy"]


def test_experience_years_parsing():
    result = calculate_ats_score(
        "Jan 2018 - Present: Senior SWE",
        "Requires 8+ years of experience.",
    )
    assert result["experience"]["requiredYears"] == 8
    assert result["experience"]["resumeYears"] == 8.0
    assert result["experience"]["score"] == 100.0


def test_experience_years_shortfall_alert():
    result = calculate_ats_score(
        "2021 - 2023: Junior dev",
        "Requires 10+ years of experience.",
    )
    assert result["experience"]["alert"] is not None
    assert result["experience"]["score"] < 100


def test_formatting_parseability_issues():
    result = calculate_ats_score(
        "no email no phone just some short text",
        "Python developer role",
    )
    assert result["formatting"]["score"] < 70
    assert any("email" in issue.lower() for issue in result["formatting"]["issues"])


def test_qualifications_detection():
    result = calculate_ats_score(
        "B.Tech in Robotics. AWS Certified Solutions Architect.",
        "Any engineering role",
    )
    assert result["qualifications"]["degree"]
    assert any("aws" in c.lower() for c in result["qualifications"]["certifications"])


def test_weighted_breakdown_present():
    result = calculate_ats_score(
        "Python, Docker, Git. 2020 - Present: Led team, cut latency by 38%. s@x.com +91 98273 12345",
        "Python developer with Docker.",
    )
    comps = result["breakdown"]["components"]
    assert set(comps.keys()) == {"keywords", "experience", "bullets", "formatting", "qualifications"}
    # Weights sum to 100 and match the documented distribution
    assert sum(result["breakdown"]["weights"].values()) == 100
    assert result["breakdown"]["weights"]["keywords"] == 40


def test_improvements_are_actionable():
    result = calculate_ats_score(
        "Python engineer.",
        "Need Python, Kubernetes, AWS.",
    )
    assert len(result["improvements"]) >= 1
    assert any("kubernetes" in imp for imp in result["improvements"])


def test_strong_bullets_counted():
    result = calculate_ats_score(
        "- Reduced deploy time by 40% using CI/CD\n- Built microservices on Kubernetes\n- worked on the dashboard",
        "Kubernetes CI/CD engineer",
    )
    assert result["strongBullets"] >= 2


def test_section_headings_detected_on_multiline_text():
    """Headings are matched on the ORIGINAL text, not the single-line normalized copy."""
    result = calculate_ats_score(
        "s@x.com +91 98273 12345\n\nSummary\nML engineer.\n\nExperience\n2020 - Present: Led team\n- Reduced latency by 38%\n\nEducation\nM.Tech\n\nSkills\nPython, AWS",
        "Machine learning engineer with Python and AWS.",
    )
    assert result["formatting"]["score"] >= 70
    assert not any("section headings" in i.lower() for i in result["formatting"]["issues"])


def test_no_month_or_company_noise_in_keywords():
    """Months, days, sentence-openers, and shared company names are not keywords."""
    result = calculate_ats_score(
        "Python engineer at Google.",
        "We are Google. Hiring since January 2025. Need Python and TensorRT.",
    )
    all_kws = result["keywords"]["found"] + result["keywords"]["missing"]
    assert "January" not in all_kws
    assert "Google" not in all_kws
    assert "Hiring" not in all_kws
    assert "python" in result["keywords"]["found"]
    assert "TensorRT" in result["keywords"]["missing"]


def test_perfect_keyword_match_reaches_100_percent():
    result = calculate_ats_score(
        "Python, TensorRT, Kubernetes engineer.",
        "Need Python, TensorRT, Kubernetes.",
    )
    assert result["keywords"]["matchRate"] == 100.0


def test_generic_canonical_does_not_false_positive():
    """The bare word 'go' must not count as the Go language."""
    result = calculate_ats_score(
        "I want to go home and rest.",
        "Go language developer wanted.",
    )
    assert "go" not in result["keywords"]["found"]


def test_camelcase_tech_shared_with_resume_still_counts():
    result = calculate_ats_score(
        "Used TensorRT at work. s@x.com +91 98273 12345",
        "TensorRT experience required.",
    )
    assert "TensorRT" in result["keywords"]["found"]
