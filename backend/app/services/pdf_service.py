import io
import uuid
from pathlib import Path

import pdfplumber

from app.core.config import BASE_DIR, get_settings

settings = get_settings()

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
PDF_MAGIC = b"%PDF-"

UPLOAD_DIR = BASE_DIR / settings.storage_dir / "uploads"


class PdfReadError(Exception):
    """The bytes are a PDF, but pdfplumber could not parse them."""


def looks_like_pdf(data: bytes) -> bool:
    """Check the file signature, not the extension: a .pdf name proves nothing."""
    return data.startswith(PDF_MAGIC)


def extract_pages(data: bytes) -> list[str]:
    """Return the text of each page, in order. Scanned pages yield ''."""
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            return [(page.extract_text() or "") for page in pdf.pages]
    except Exception as exc:  # pdfplumber raises many unrelated types
        raise PdfReadError("The uploaded file could not be read as a PDF.") from exc


def save_upload(data: bytes) -> Path:
    """Store the PDF under a random name; the client filename is never trusted."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target = UPLOAD_DIR / f"{uuid.uuid4().hex}.pdf"
    target.write_bytes(data)
    return target
