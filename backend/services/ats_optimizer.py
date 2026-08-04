import re
import math
from typing import List, Dict, Any

# A list of common technology keywords to check for
TECH_KEYWORDS = {
    "python", "c++", "ros", "ros2", "docker", "kubernetes", "pytorch", "tensorflow", 
    "keras", "opencv", "computer vision", "machine learning", "deep learning", 
    "reinforcement learning", "control systems", "simulation", "gazebo", "linux", 
    "git", "aws", "gcp", "azure", "embedded", "microcontrollers", "rtos", "nav2", 
    "moveit", "slam", "lidar", "radar", "perception", "localization", "path planning",
    "matlab", "simulink", "sql", "postgres", "sqlite", "fastapi", "flask", "django",
    "react", "typescript", "javascript", "html", "css", "nodejs", "rest api"
}

def extract_keywords(text: str) -> List[str]:
    """Extract known technology keywords from text (case-insensitive)."""
    found = []
    text_lower = text.lower()
    for kw in TECH_KEYWORDS:
        # Match whole words or phrases
        pattern = rf"\b{re.escape(kw)}\b"
        if re.search(pattern, text_lower):
            found.append(kw)
    return list(set(found))

def calculate_ats_score(resume_text: str, job_text: str) -> Dict[str, Any]:
    """
    Scans the resume against the job description to calculate:
    - ATS score
    - Missing keywords
    - Weak bullets (lack of metrics, passive verbs)
    - Wrong ordering alerts
    - Unused projects suggestion
    """
    resume_lower = resume_text.lower()
    job_lower = job_text.lower()
    
    # 1. Keywords comparison
    job_kws = extract_keywords(job_text)
    resume_kws = extract_keywords(resume_text)
    
    missing_kws = [kw for kw in job_kws if kw not in resume_kws]
    found_kws = [kw for kw in job_kws if kw in resume_kws]
    
    kw_score = (len(found_kws) / len(job_kws)) * 100 if job_kws else 100
    
    # 2. Bullet point analysis
    # Find bullet points: lines starting with -, *, or bullet characters
    bullets = re.findall(r"(?:^|\n)\s*[-*•]\s*(.*)", resume_text)
    weak_bullets = []
    
    passive_verbs = ["worked on", "helped", "responsible for", "assisted", "duties included", "handled"]
    
    for bullet in bullets:
        bullet_lower = bullet.lower()
        reasons = []
        
        # Check for passive verbs
        for verb in passive_verbs:
            if verb in bullet_lower:
                reasons.append(f"Contains passive phrase '{verb}'")
                
        # Check for lack of numbers/metrics (quantifiable outcomes)
        if not any(char.isdigit() for char in bullet) and len(bullet) > 15:
            reasons.append("Lacks quantifiable metrics (%, $, numbers)")
            
        if reasons:
            weak_bullets.append({
                "original": bullet.strip(),
                "issues": reasons,
                "suggestion": f"Rephrase with strong action verbs and include metrics. E.g., 'Led... resulting in 15% increase in...'"
            })
            
    # Calculate score weights
    # 60% Keyword matching, 25% Quantifiable bullets, 15% Text length/formatting
    bullet_score = max(0, 100 - (len(weak_bullets) * 10))
    formatting_score = 90 if len(resume_text) > 100 else 40
    
    ats_score = int((kw_score * 0.6) + (bullet_score * 0.25) + (formatting_score * 0.15))
    
    # 3. Sections ordering check
    ordering_alert = None
    education_idx = resume_lower.find("education")
    experience_idx = resume_lower.find("experience")
    skills_idx = resume_lower.find("skills")
    
    # Standard recommendation: Experience -> Education or Skills -> Experience -> Education
    if education_idx != -1 and experience_idx != -1 and education_idx < experience_idx:
        # Education comes before experience
        ordering_alert = "Education is placed before Experience. For experienced profiles, it's recommended to lead with Professional Experience."
        
    return {
        "score": min(100, max(0, ats_score)),
        "keywords": {
            "found": found_kws,
            "missing": missing_kws,
            "matchRate": round(kw_score, 1)
        },
        "weakBullets": weak_bullets[:5], # top 5
        "orderingAlert": ordering_alert
    }

def suggest_unused_projects(profile_projects: List[Dict[str, Any]], job_text: str, resume_text: str) -> List[Dict[str, Any]]:
    """
    Looks at stored profile projects that are NOT mentioned in the resume,
    and checks if they contain keywords found in the job description.
    """
    job_kws = set(extract_keywords(job_text))
    resume_lower = resume_text.lower()
    
    suggested = []
    for project in profile_projects:
        proj_name = project.get("title", "")
        if proj_name.lower() in resume_lower:
            continue # already in resume
            
        # Match project description/tech against job keywords
        proj_desc = (project.get("description", "") + " " + " ".join(project.get("technologies", []))).lower()
        matching_kws = [kw for kw in job_kws if kw in proj_desc]
        
        if matching_kws:
            suggested.append({
                "title": proj_name,
                "technologies": project.get("technologies", []),
                "matchingKeywords": matching_kws,
                "reason": f"Matches job requirements for {', '.join(matching_kws)} but is currently omitted from your active resume."
            })
            
    return suggested
