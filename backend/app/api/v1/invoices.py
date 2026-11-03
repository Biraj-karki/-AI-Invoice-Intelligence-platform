from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.schemas.extraction import (
    ExtractedText,
    InvoiceExtractionOut,
    InvoiceLineItemOut,
)
from app.services import gemini_service, pdf_service
from app.services.normalize import NormalizedInvoice, normalize_invoice

router = APIRouter(prefix="/invoices", tags=["invoices"])

PREVIEW_CHARS = 300


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
    text = "\n".join(pages)

    if not text.strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "This PDF has no text layer, so there is nothing to extract. "
            "It looks like a scan; OCR is not implemented yet.",
        )

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
