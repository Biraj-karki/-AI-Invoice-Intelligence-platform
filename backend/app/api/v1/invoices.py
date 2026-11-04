from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import BASE_DIR
from app.db.session import get_db
from app.models import Invoice
from app.schemas.extraction import (
    ExtractedText,
    InvoiceExtractionOut,
    InvoiceLineItemOut,
)
from app.schemas.invoice import (
    InvoiceDetailOut,
    InvoiceListOut,
    InvoiceResolutionIn,
    InvoiceStatsOut,
)
from app.services import gemini_service, invoice_service, pdf_service, stats_service
from app.services.normalize import NormalizedInvoice, normalize_invoice

router = APIRouter(prefix="/invoices", tags=["invoices"])

PREVIEW_CHARS = 300


def _like_pattern(term: str) -> str:
    """Build a case-insensitive "contains" pattern for SQL LIKE.

    The wildcards are escaped first: without that, searching for "50%" would
    match every invoice because % means "anything" in LIKE, and "a_b" would
    match "axb" because _ means "one character".
    """
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def _read_pdf(file: UploadFile) -> bytes:
    """Shared upload validation for every PDF endpoint."""
    data = await file.read()

    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty.")

    if len(data) > pdf_service.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File is larger than {pdf_service.MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )

    if not pdf_service.looks_like_pdf(data):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "The file is not a PDF (a .pdf filename is not enough).",
        )

    return data


def _extract_pages_or_422(data: bytes) -> list[str]:
    try:
        return pdf_service.extract_pages(data)
    except pdf_service.PdfReadError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


def _text_or_422(pages: list[str]) -> str:
    text = "\n".join(pages)
    if not text.strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "This PDF has no text layer, so there is nothing to extract. "
            "It looks like a scan; OCR is not implemented yet.",
        )
    return text


def _relative_stored_path(path: Path) -> str:
    try:
        return path.relative_to(BASE_DIR).as_posix()
    except ValueError:  # pragma: no cover - storage outside backend/
        return path.as_posix()


def _to_response(
    filename: str,
    stored_as: str,
    page_count: int,
    normalized: NormalizedInvoice,
) -> InvoiceExtractionOut:
    return InvoiceExtractionOut(
        filename=filename,
        stored_as=stored_as,
        page_count=page_count,
        vendor_name=normalized.vendor_name,
        invoice_number=normalized.invoice_number,
        invoice_date=normalized.invoice_date,
        currency=normalized.currency,
        subtotal=normalized.subtotal,
        tax_amount=normalized.tax_amount,
        total_amount=normalized.total_amount,
        line_items=[
            InvoiceLineItemOut(
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                amount=item.amount,
            )
            for item in normalized.line_items
        ],
        issues=normalized.issues,
    )


@router.post(
    "/extract-text",
    response_model=ExtractedText,
    summary="Upload a PDF invoice and get its raw text back",
)
async def extract_text(file: UploadFile = File(...)) -> ExtractedText:
    data = await _read_pdf(file)
    pages = _extract_pages_or_422(data)
    text = "\n".join(pages)

    stored_path = pdf_service.save_upload(data)

    return ExtractedText(
        filename=file.filename or "upload.pdf",
        stored_as=stored_path.name,
        page_count=len(pages),
        character_count=len(text),
        preview=text[:PREVIEW_CHARS],
    )


@router.post(
    "/extract",
    response_model=InvoiceExtractionOut,
    summary="Upload a PDF invoice and get structured fields extracted by Gemini",
)
async def extract_invoice(file: UploadFile = File(...)) -> InvoiceExtractionOut:
    data = await _read_pdf(file)
    pages = _extract_pages_or_422(data)
    text = _text_or_422(pages)

    try:
        extraction = gemini_service.extract_invoice(text)
    except gemini_service.GeminiError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    normalized = normalize_invoice(extraction)
    stored_path = pdf_service.save_upload(data)

    return _to_response(
        filename=file.filename or "upload.pdf",
        stored_as=stored_path.name,
        page_count=len(pages),
        normalized=normalized,
    )


@router.post(
    "",
    response_model=InvoiceDetailOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a PDF invoice, extract it and save it",
)
async def create_invoice(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> Invoice:
    data = await _read_pdf(file)
    text = _text_or_422(_extract_pages_or_422(data))

    try:
        extraction = gemini_service.extract_invoice(text)
    except gemini_service.GeminiError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    normalized = normalize_invoice(extraction)
    stored_path = pdf_service.save_upload(data)

    return invoice_service.create_invoice(
        db,
        normalized=normalized,
        raw_extraction=extraction.model_dump(),
        source_filename=file.filename,
        stored_path=_relative_stored_path(stored_path),
    )


@router.get("", response_model=InvoiceListOut, summary="List saved invoices")
def list_invoices(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: str | None = Query(
        None,
        max_length=100,
        description="Case-insensitive search over vendor name and invoice number",
    ),
    db: Session = Depends(get_db),
) -> InvoiceListOut:
    # An empty or whitespace-only search is the same as no search at all.
    term = (q or "").strip()

    conditions = []
    if term:
        pattern = _like_pattern(term)
        conditions.append(
            or_(
                Invoice.vendor_name.ilike(pattern, escape="\\"),
                Invoice.invoice_number.ilike(pattern, escape="\\"),
            )
        )

    # The total must describe the same filtered set as the page, otherwise the
    # client would show "page 1 of 5" for a search with one match.
    total = (
        db.scalar(select(func.count()).select_from(Invoice).where(*conditions)) or 0
    )
    invoices = db.scalars(
        select(Invoice)
        .where(*conditions)
        .order_by(Invoice.created_at.desc(), Invoice.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return InvoiceListOut(items=invoices, total=total, limit=limit, offset=offset)


# Declared before "/{invoice_id}" on purpose: Starlette matches routes in
# order, and "/stats" would otherwise be parsed as an invoice id.
@router.get(
    "/stats",
    response_model=InvoiceStatsOut,
    summary="Spend aggregates per currency, vendor and month",
)
def get_stats(db: Session = Depends(get_db)) -> InvoiceStatsOut:
    return stats_service.invoice_stats(db)


@router.get(
    "/{invoice_id}",
    response_model=InvoiceDetailOut,
    summary="Get one saved invoice",
)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)) -> Invoice:
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Invoice {invoice_id} does not exist."
        )
    return invoice


@router.patch(
    "/{invoice_id}",
    response_model=InvoiceDetailOut,
    summary="Approve or reject an invoice that needs review",
)
def resolve_invoice(
    invoice_id: int,
    payload: InvoiceResolutionIn,
    db: Session = Depends(get_db),
) -> Invoice:
    try:
        invoice = invoice_service.resolve_invoice(db, invoice_id, payload.status)
    except invoice_service.InvoiceStateError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    if invoice is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Invoice {invoice_id} does not exist."
        )

    return invoice
