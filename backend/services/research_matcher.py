from typing import List, Dict, Any

# Simple TF-IDF or keyword overlap similarity between text blocks
def compute_similarity(text1: str, text2: str) -> float:
    words1 = set(text1.lower().split())
    words2 = set(text2.lower().split())
    if not words1 or not words2:
        return 0.0
    intersection = words1.intersection(words2)
    return len(intersection) / (len(words1) * 0.5 + len(words2) * 0.5)

def match_research_profile(candidate_pubs: List[Dict[str, Any]], candidate_projects: List[Dict[str, Any]], professor_papers: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compares the candidate's publications/projects with a professor's papers/interests.
    Generates:
    - Alignment scores per field (Computer Vision, HRI, NLP, Medical Robotics, etc.)
    - Specific publications overlaps
    - Recommendations for what projects/papers to highlight.
    """
    fields = {
        "Computer Vision": ["cv", "vision", "camera", "image", "detection", "segmentation", "pose", "depth", "optical"],
        "Human-Robot Interaction": ["hri", "human", "interaction", "facial", "expression", "gesture", "social", "robot", "humanoid"],
        "Medical Robotics": ["medical", "surgery", "surgical", "haptic", "rehabilitation", "prosthetic", "mri", "biomedical"],
        "Reinforcement Learning": ["reinforcement", "rl", "policy", "q-learning", "ppo", "actor-critic", "deep rl", "dynamics"],
        "Embedded Systems / Control": ["embedded", "control", "microcontroller", "rtos", "stm32", "arduino", "imu", "motor", "actuator"]
    }
    
    # Concatenate candidate's research items
    cand_text = ""
    for pub in candidate_pubs:
        cand_text += f" {pub.get('title', '')} {pub.get('abstract', '')} {pub.get('journal', '')}"
    for proj in candidate_projects:
        cand_text += f" {proj.get('title', '')} {proj.get('description', '')} {' '.join(proj.get('technologies', []))}"
        
    cand_text_lower = cand_text.lower()
    
    # Concatenate professor's research items
    prof_text = ""
    for paper in professor_papers:
        prof_text += f" {paper.get('title', '')} {paper.get('abstract', '')} {paper.get('keywords', '')}"
        
    prof_text_lower = prof_text.lower()
    
    # Calculate alignment score per field
    alignment = {}
    for field_name, keywords in fields.items():
        # Count keyword frequency in candidate and professor text
        cand_count = sum(cand_text_lower.count(kw) for kw in keywords)
        prof_count = sum(prof_text_lower.count(kw) for kw in keywords)
        
        if prof_count == 0:
            score = 0.0
        else:
            # Score matches candidate contribution relative to professor focus
            score = min(95.0, (cand_count / (prof_count + 1)) * 100)
            if cand_count > 0:
                # Base match if at least one keyword overlap exists
                score = max(score, 50.0 + min(45.0, cand_count * 10))
            else:
                score = max(0.0, score)
                
        alignment[field_name] = int(score)
        
    # Check for specific paper overlaps
    overlaps = []
    for cand_pub in candidate_pubs:
        cand_pub_title = cand_pub.get('title', '')
        best_match = None
        best_score = 0.0
        
        for prof_paper in professor_papers:
            sim = compute_similarity(cand_pub_title + " " + cand_pub.get('abstract', ''), 
                                     prof_paper.get('title', '') + " " + prof_paper.get('abstract', ''))
            if sim > best_score:
                best_score = sim
                best_match = prof_paper
                
        if best_score > 0.15:
            overlaps.append({
                "candidatePub": cand_pub_title,
                "professorPub": best_match.get('title', ''),
                "similarity": int(best_score * 100),
                "topic": cand_pub.get('journal', 'Joint Research')
            })
            
    # Recommendations
    recommendations = []
    max_field = max(alignment, key=alignment.get) if alignment else None
    if max_field and alignment[max_field] > 70:
        recommendations.append(f"Highlight your strong background in **{max_field}** ({alignment[max_field]}% alignment) in the cover letter's third paragraph.")
    else:
        recommendations.append("The profile alignment with the professor's recent publications is moderate. Focus on core transferable technical skills.")
        
    return {
        "alignment": alignment,
        "overlaps": overlaps[:3],
        "recommendations": recommendations
    }
