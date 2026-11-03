from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services import pdf_service

client = TestClient(app)

FIXTURE = Path(__file__).parent / "fixtures" / "sample_invoice.pdf"
ENDPOINT = "/api/v1/invoices/extract-text"


def test_extract_pages_reads_the_sample_invoice() -> None:
    pages = pdf_service.extract_pages(FIXTURE.read_bytes())

    assert len(pages) == 1
    assert "ACME SUPPLIES PVT. LTD." in pages[0]
    assert "INV-2026-0042" in pages[0]
    assert "NPR 6130.25" in pages[0]


def test_looks_like_pdf_checks_signature_not_extension() -> None:
    assert pdf_service.looks_like_pdf(b"%PDF-1.4\n...") is True
    assert pdf_service.looks_like_pdf(b"hello world") is False


def test_endpoint_rejects_non_pdf_bytes() -> None:
    response = client.post(
        ENDPOINT,
        files={"file": ("fake.pdf", b"this is plain text", "application/pdf")},
    )

    assert response.status_code == 400


def test_endpoint_rejects_empty_file() -> None:
    response = client.post(
        ENDPOINT,
        files={"file": ("empty.pdf", b"", "application/pdf")},
    )

    assert response.status_code == 400


def test_endpoint_extracts_text_and_stores_file(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(pdf_service, "UPLOAD_DIR", tmp_path)

    response = client.post(
        ENDPOINT,
        files={"file": ("sample_invoice.pdf", FIXTURE.read_bytes(), "application/pdf")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["page_count"] == 1
    assert body["character_count"] > 100
    assert "ACME SUPPLIES" in body["preview"]

    stored = list(tmp_path.glob("*.pdf"))
    assert len(stored) == 1
    assert stored[0].read_bytes() == FIXTURE.read_bytes()
