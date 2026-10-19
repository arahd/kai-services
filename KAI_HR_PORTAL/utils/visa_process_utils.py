from utils.file_utils import extract_pdf_text,extract_docx_text,extract_doc_text
import os


def extract_file_text(uploaded_file):
    ext = os.path.splitext(uploaded_file.filename)[1].lower()
    if ext == ".pdf":
        return extract_pdf_text(uploaded_file)
    if ext == ".docx":
        return extract_docx_text(uploaded_file)
    raise ValueError(f"Unsupported file type: {ext}")