import io
import os

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

def parse_pdf(file_bytes: bytes) -> str:
    """
    Extracts text from PDF bytes.
    If pypdf is not available, returns raw decoded string with fallback.
    """
    if PdfReader is None:
        # Fallback if library failed to import
        try:
            return file_bytes.decode('utf-8', errors='ignore')
        except Exception:
            return "Failed to parse PDF: pypdf library missing and encoding fallback failed."
            
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text.strip()
    except Exception as e:
        return f"Error parsing PDF file: {str(e)}"

if __name__ == "__main__":
    # Test dummy text
    print(parse_pdf(b"Hello world from PDF mock bytes"))
