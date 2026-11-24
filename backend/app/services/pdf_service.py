import io
import re
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

import cloudinary
import cloudinary.exceptions
import cloudinary.uploader
import cloudinary.utils
import httpx
import pdfplumber

from app.core.config import BASE_DIR, get_settings

settings = get_settings()

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
PDF_MAGIC = b"%PDF-"

UPLOAD_DIR = BASE_DIR / settings.storage_dir / "uploads"
CLOUDINARY_PUBLIC_ID = re.compile(r"invoice-pdfs/[0-9a-f]{32}\.pdf\Z")


class PdfReadError(Exception):
    """The bytes are a PDF, but pdfplumber could not parse them."""


class StorageError(Exception):
    """A PDF could not be stored or retrieved from the configured provider."""


class InvalidStoredAsset(StorageError):
    """A stored Cloudinary identifier is outside this app's asset namespace."""


@dataclass(frozen=True)
class StoredUpload:
    provider: str
    identifier: str


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


def save_invoice_upload(data: bytes) -> StoredUpload:
    """Store an invoice in Cloudinary when configured, otherwise use local disk."""
    if not settings.cloudinary_url:
        return StoredUpload(provider="local", identifier=str(save_upload(data)))

    _configure_cloudinary()
    public_id = f"invoice-pdfs/{uuid.uuid4().hex}.pdf"
    try:
        result = cloudinary.uploader.upload(
            io.BytesIO(data),
            resource_type="raw",
            type="authenticated",
            public_id=public_id,
            overwrite=False,
        )
    except (cloudinary.exceptions.Error, ValueError) as exc:
        raise StorageError("Cloudinary could not store the invoice PDF.") from exc

    if (
        result.get("public_id") != public_id
        or result.get("resource_type") != "raw"
        or result.get("type") != "authenticated"
    ):
        raise StorageError("Cloudinary returned an unexpected asset identifier.")

    return StoredUpload(provider="cloudinary", identifier=public_id)


def read_cloudinary_upload(public_id: str) -> bytes:
    """Fetch one authenticated Cloudinary asset without exposing its signed URL."""
    public_id = _validated_public_id(public_id)
    _configure_cloudinary()

    try:
        url = cloudinary.utils.private_download_url(
            public_id,
            "pdf",
            resource_type="raw",
            type="authenticated",
            expires_at=int(time.time()) + 60,
            attachment=False,
            secure=True,
        )
        response = httpx.get(url, timeout=30, follow_redirects=True)
        response.raise_for_status()
    except (cloudinary.exceptions.Error, httpx.HTTPError, ValueError) as exc:
        raise StorageError("Cloudinary could not retrieve the invoice PDF.") from exc

    data = response.content
    if len(data) > MAX_UPLOAD_BYTES or not looks_like_pdf(data):
        raise StorageError("Cloudinary returned an invalid invoice PDF.")
    return data


def delete_cloudinary_upload(public_id: str) -> None:
    """Delete an invoice asset, refusing identifiers outside our own folder."""
    public_id = _validated_public_id(public_id)
    _configure_cloudinary()

    try:
        result = cloudinary.uploader.destroy(
            public_id,
            resource_type="raw",
            type="authenticated",
            invalidate=True,
        )
    except (cloudinary.exceptions.Error, ValueError) as exc:
        raise StorageError("Cloudinary could not delete the invoice PDF.") from exc

    if result.get("result") not in {"ok", "not found"}:
        raise StorageError("Cloudinary did not confirm PDF deletion.")


def _configure_cloudinary() -> None:
    if not settings.cloudinary_url:
        raise StorageError("Cloudinary is not configured.")
    try:
        cloudinary.config(cloudinary_url=settings.cloudinary_url, secure=True)
    except ValueError as exc:
        raise StorageError("Cloudinary configuration is invalid.") from exc


def _validated_public_id(public_id: str) -> str:
    if CLOUDINARY_PUBLIC_ID.fullmatch(public_id) is None:
        raise InvalidStoredAsset("The stored Cloudinary identifier is invalid.")
    return public_id
