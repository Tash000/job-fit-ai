import io
import os
from typing import Dict, Any

try:
    import docx
    from docx.shared import Inches, Pt
except ImportError:
    docx = None

def export_txt(cover_letter_text: str) -> bytes:
    """Export cover letter as plain text bytes."""
    return cover_letter_text.encode('utf-8')

def export_latex(cover_letter_text: str, candidate_name: str = "Candidate Name", candidate_email: str = "email@example.com", candidate_phone: str = "+49 123 456789") -> bytes:
    """
    Export cover letter formatted as a professional LaTeX letter template.
    """
    # Clean text to escape common LaTeX characters
    clean_text = cover_letter_text
    escapes = {
        '&': r'\&',
        '%': r'\%',
        '$': r'\$',
        '#': r'\#',
        '_': r'\_',
        '{': r'\{',
        '}': r'\}',
        '~': r'\textasciitilde{}',
        '^': r'\textasciicircum{}'
    }
    for char, escape in escapes.items():
        clean_text = clean_text.replace(char, escape)
        
    # Standard format: paragraphs separated by double newlines
    paragraphs = clean_text.split('\n\n')
    formatted_paragraphs = "\n\n".join(paragraphs)
    
    latex_template = f"""\\documentclass[11pt,a4paper]{{letter}}
\\usepackage[utf8]{{inputenc}}
\\usepackage[left=2.5cm,right=2.5cm,top=2.5cm,bottom=2.5cm]{{geometry}}
\\usepackage{{hyperref}}

\\address{{
    \\textbf{{{candidate_name}}}\\\\
    Email: \\href{{mailto:{candidate_email}}}{{{candidate_email}}}\\\\
    Phone: {candidate_phone}
}}

\\signature{{{candidate_name}}}

\\begin{{document}}
\\begin{{letter}}{{}}

\\opening{{Dear Hiring Team,}}

{formatted_paragraphs}

\\closing{{Sincerely,}}

\\end{{letter}}
\\end{{document}}
"""
    return latex_template.encode('utf-8')

def export_docx(cover_letter_text: str, candidate_name: str = "Candidate Name", candidate_email: str = "email@example.com", candidate_phone: str = "+49 123 456789") -> bytes:
    """
    Export cover letter as a Microsoft Word DOCX document with professional styling:
    - 1 inch margins
    - Times New Roman or Arial font (11pt)
    - Clean layout
    """
    if docx is None:
        # Fallback to plain text if python-docx isn't available
        return export_txt(cover_letter_text)
        
    doc = docx.Document()
    
    # 1. Set Margins
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        
    # 2. Add Header info
    p_header = doc.add_paragraph()
    p_header.paragraph_format.space_after = Pt(24)
    run_name = p_header.add_run(f"{candidate_name}\n")
    run_name.bold = True
    run_name.font.size = Pt(14)
    run_name.font.name = "Arial"
    
    run_contact = p_header.add_run(f"Email: {candidate_email} | Phone: {candidate_phone}")
    run_contact.font.size = Pt(10)
    run_contact.font.name = "Arial"
    run_contact.font.italic = True
    
    # 3. Add paragraphs
    paragraphs = cover_letter_text.split('\n\n')
    for p_text in paragraphs:
        if not p_text.strip():
            continue
        p = doc.add_paragraph()
        p.paragraph_format.line_spacing = 1.15
        p.paragraph_format.space_after = Pt(12)
        
        run = p.add_run(p_text.strip())
        run.font.name = "Arial"
        run.font.size = Pt(11)
        
    # Save to a byte stream
    file_stream = io.BytesIO()
    doc.save(file_stream)
    return file_stream.getvalue()
