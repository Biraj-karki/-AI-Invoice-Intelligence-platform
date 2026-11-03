from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.schemas.extraction import ExtractedText
from app.services import pdf_service

router = APIRouter(prefix="/invoices", tags=["invoices"])

PREVIEW_CHARS = 300


@router.post(
    "/extract-text",
    response_model=ExtractedText,
    summary="Upload a PDF invoice and get its raw text back",
)
async def extract_text(file: UploadFile = File(...)) -> ExtractedText:
    data = await file.read()
    filename = file.filename or "upload.pdf"

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

    try:
        pages = pdf_service.extract_pages(data)
    except pdf_service.PdfReadError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    stored_path = pdf_service.save_upload(data)
    text = "\n".join(pages)

    return ExtractedText(
        filename=filename,
        stored_as=stored_path.name,
        page_count=len(pages),
        character_count=len(text),
        preview=text[:PREVIEW_CHARS],
    )
