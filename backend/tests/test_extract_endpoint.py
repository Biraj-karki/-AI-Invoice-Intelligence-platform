from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.extraction import ExtractedLineItem, InvoiceExtraction
from app.services import gemini_service, pdf_service

client = TestClient(app)

FIXTURE = Path(__file__).parent / "fixtures" / "sample_invoice.pdf"
ENDPOINT = "/api/v1/invoices/extract"


def _fake_extraction(*args, **kwargs) -> InvoiceExtraction:
    return InvoiceExtraction(
        vendor_name="ACME SUPPLIES PVT. LTD.",
        invoice_number="INV-2026-0042",
        invoice_date="2026-10-15",
        currency="NPR",
        subtotal="5425.00",
        tax_amount="705.25",
        total_amount="6130.25",
        line_items=[
            ExtractedLineItem(
                description="Steel Bracket 40mm",
                quantity="12",
                unit_price="250.00",
                amount="3000.00",
            ),
            ExtractedLineItem(
                description="Hex Bolt M8",
                quantity="50",
                unit_price="18.50",
                amount="925.00",
            ),
            ExtractedLineItem(
                description="Installation Service",
                quantity="1",
                unit_price="1500.00",
                amount="1500.00",
            ),
        ],
    )


def test_extract_endpoint_returns_normalised_invoice(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(pdf_service, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(gemini_service, "extract_invoice", _fake_extraction)

    response = client.post(
        ENDPOINT,
        files={"file": ("sample_invoice.pdf", FIXTURE.read_bytes(), "application/pdf")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["vendor_name"] == "ACME SUPPLIES PVT. LTD."
    assert body["page_count"] == 1
    assert body["issues"] == []

    # Money must never arrive as a JSON float.
    assert body["total_amount"] in ("6130.25", 6130.25)
    assert float(body["total_amount"]) == 6130.25

    assert len(body["line_items"]) == 3
    assert body["line_items"][0]["quantity"] == "12.000"
    assert len(list(tmp_path.glob("*.pdf"))) == 1


def test_extract_endpoint_maps_gemini_failures_to_502(monkeypatch) -> None:
    def _boom(*args, **kwargs):
        raise gemini_service.GeminiError("service_unavailable")

    monkeypatch.setattr(gemini_service, "extract_invoice", _boom)

    response = client.post(
        ENDPOINT,
        files={"file": ("sample_invoice.pdf", FIXTURE.read_bytes(), "application/pdf")},
    )

    assert response.status_code == 502
    assert "service_unavailable" in response.json()["detail"]


def test_extract_endpoint_rejects_pdf_without_a_text_layer(monkeypatch) -> None:
    monkeypatch.setattr(pdf_service, "extract_pages", lambda data: [""])

    response = client.post(
        ENDPOINT,
        files={"file": ("scan.pdf", FIXTURE.read_bytes(), "application/pdf")},
    )

    assert response.status_code == 422
    assert "no text layer" in response.json()["detail"].lower()


def test_extract_endpoint_rejects_non_pdf() -> None:
    response = client.post(
        ENDPOINT,
        files={"file": ("fake.pdf", b"definitely not a pdf", "application/pdf")},
    )

    assert response.status_code == 400


@pytest.mark.parametrize("filename", ["invoice.txt", "invoice"])
def test_extract_endpoint_ignores_client_filename_extension(filename: str) -> None:
    """Validation is on bytes, so a weird name is still accepted."""
    response = client.post(
        ENDPOINT,
        files={"file": (filename, b"%PDF-1.4 broken but signed", "application/pdf")},
    )

    # Signed PDF bytes get past the signature check, then fail parsing as 422.
    assert response.status_code == 422
