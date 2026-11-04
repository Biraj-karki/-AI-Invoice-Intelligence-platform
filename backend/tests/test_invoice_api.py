from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models import Invoice, LineItem
from app.schemas.extraction import ExtractedLineItem, InvoiceExtraction
from app.services import gemini_service, pdf_service

FIXTURE = Path(__file__).parent / "fixtures" / "sample_invoice.pdf"
COLLECTION = "/api/v1/invoices"


def _consistent_extraction(*args, **kwargs) -> InvoiceExtraction:
    return InvoiceExtraction(
        vendor_name="ACME SUPPLIES PVT. LTD.",
        invoice_number="INV-2026-0042",
        invoice_date="2026-10-15",
        currency="NPR",
        subtotal="5425.00",
        tax_amount="705.25",
        total_amount="6130.25",
        line_items=[
            ExtractedLineItem(description="Steel Bracket 40mm", quantity="12", unit_price="250.00", amount="3000.00"),
            ExtractedLineItem(description="Hex Bolt M8", quantity="50", unit_price="18.50", amount="925.00"),
            ExtractedLineItem(description="Installation Service", quantity="1", unit_price="1500.00", amount="1500.00"),
        ],
    )


def _inconsistent_extraction(*args, **kwargs) -> InvoiceExtraction:
    return InvoiceExtraction(
        vendor_name="Dodgy Co",
        subtotal="100.00",
        tax_amount="10.00",
        total_amount="500.00",
        line_items=[ExtractedLineItem(description="Mystery", amount="50.00")],
    )


def _upload(client, filename: str = "sample_invoice.pdf"):
    return client.post(
        COLLECTION,
        files={"file": (filename, FIXTURE.read_bytes(), "application/pdf")},
    )


@pytest.fixture(autouse=True)
def _isolate_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(pdf_service, "UPLOAD_DIR", tmp_path)
    return tmp_path


def test_create_invoice_persists_invoice_and_line_items(
    api_client, db_session, monkeypatch
) -> None:
    monkeypatch.setattr(gemini_service, "extract_invoice", _consistent_extraction)

    response = _upload(api_client)

    assert response.status_code == 201
    body = response.json()
    assert body["id"] > 0
    assert body["status"] == "extracted"
    assert body["issues"] == []
    assert body["total_amount"] == "6130.25"
    assert len(body["line_items"]) == 3

    invoice = db_session.get(Invoice, body["id"])
    assert invoice is not None
    assert invoice.stored_path is not None
    assert invoice.stored_path.endswith(".pdf")
    assert Path(invoice.stored_path).exists()
    assert invoice.raw_extraction["vendor_name"] == "ACME SUPPLIES PVT. LTD."
    assert len(invoice.line_items) == 3


def test_create_invoice_flags_inconsistent_totals_for_review(
    api_client, db_session, monkeypatch
) -> None:
    monkeypatch.setattr(gemini_service, "extract_invoice", _inconsistent_extraction)

    response = _upload(api_client)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "review"
    assert any("subtotal + tax" in issue for issue in body["issues"])

    invoice = db_session.get(Invoice, body["id"])
    assert invoice is not None
    assert invoice.status == "review"
    assert invoice.issues


def test_failed_extraction_writes_nothing(api_client, db_session, monkeypatch, tmp_path) -> None:
    def _boom(*args, **kwargs):
        raise gemini_service.GeminiError("service_unavailable")

    monkeypatch.setattr(gemini_service, "extract_invoice", _boom)

    response = _upload(api_client)

    assert response.status_code == 502
    assert db_session.scalar(select(func.count()).select_from(Invoice)) == 0
    assert db_session.scalar(select(func.count()).select_from(LineItem)) == 0
    assert list(tmp_path.glob("*.pdf")) == []


def test_list_returns_newest_first_with_pagination(
    api_client, db_session, monkeypatch
) -> None:
    monkeypatch.setattr(gemini_service, "extract_invoice", _consistent_extraction)

    first = _upload(api_client).json()["id"]
    second = _upload(api_client).json()["id"]

    listing = api_client.get(COLLECTION, params={"limit": 1, "offset": 0}).json()
    assert listing["total"] == 2
    assert listing["limit"] == 1
    assert len(listing["items"]) == 1
    assert listing["items"][0]["id"] == second

    page_two = api_client.get(COLLECTION, params={"limit": 1, "offset": 1}).json()
    assert page_two["items"][0]["id"] == first


def test_get_invoice_returns_detail_and_404(api_client, db_session, monkeypatch) -> None:
    monkeypatch.setattr(gemini_service, "extract_invoice", _consistent_extraction)
    invoice_id = _upload(api_client).json()["id"]

    detail = api_client.get(f"{COLLECTION}/{invoice_id}")
    assert detail.status_code == 200
    assert detail.json()["line_items"][0]["description"] == "Steel Bracket 40mm"

    missing = api_client.get(f"{COLLECTION}/999999")
    assert missing.status_code == 404


def test_list_is_empty_on_a_clean_database(api_client) -> None:
    listing = api_client.get(COLLECTION).json()

    assert listing["total"] == 0
    assert listing["items"] == []


def test_create_invoice_rejects_non_pdf(api_client) -> None:
    response = api_client.post(
        COLLECTION,
        files={"file": ("fake.pdf", b"not a pdf at all", "application/pdf")},
    )

    assert response.status_code == 400


def test_stored_path_is_saved_relative_to_backend() -> None:
    from app.api.v1.invoices import _relative_stored_path
    from app.core.config import BASE_DIR

    path = BASE_DIR / "storage" / "uploads" / "abc123.pdf"

    assert _relative_stored_path(path) == "storage/uploads/abc123.pdf"


# --- review resolution -------------------------------------------------------


def _review_invoice_id(api_client, monkeypatch) -> int:
    """Create an invoice whose totals do not reconcile, so it lands in review."""
    monkeypatch.setattr(gemini_service, "extract_invoice", _inconsistent_extraction)
    response = _upload(api_client)
    assert response.status_code == 201
    assert response.json()["status"] == "review"
    return response.json()["id"]


def test_approve_review_invoice(api_client, db_session, monkeypatch) -> None:
    invoice_id = _review_invoice_id(api_client, monkeypatch)

    response = api_client.patch(
        f"{COLLECTION}/{invoice_id}", json={"status": "approved"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "approved"
    # Approving is a human decision, not a data fix: the issues stay on record.
    assert body["issues"]

    db_session.expire_all()
    assert db_session.get(Invoice, invoice_id).status == "approved"


def test_reject_review_invoice(api_client, db_session, monkeypatch) -> None:
    invoice_id = _review_invoice_id(api_client, monkeypatch)

    response = api_client.patch(
        f"{COLLECTION}/{invoice_id}", json={"status": "rejected"}
    )

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"

    db_session.expire_all()
    assert db_session.get(Invoice, invoice_id).status == "rejected"


def test_cannot_resolve_a_cleanly_extracted_invoice(
    api_client, db_session, monkeypatch
) -> None:
    monkeypatch.setattr(gemini_service, "extract_invoice", _consistent_extraction)
    invoice_id = _upload(api_client).json()["id"]

    response = api_client.patch(
        f"{COLLECTION}/{invoice_id}", json={"status": "approved"}
    )

    assert response.status_code == 409
    assert "review" in response.json()["detail"]

    db_session.expire_all()
    assert db_session.get(Invoice, invoice_id).status == "extracted"


def test_cannot_resolve_the_same_invoice_twice(api_client, monkeypatch) -> None:
    invoice_id = _review_invoice_id(api_client, monkeypatch)

    first = api_client.patch(f"{COLLECTION}/{invoice_id}", json={"status": "approved"})
    second = api_client.patch(f"{COLLECTION}/{invoice_id}", json={"status": "rejected"})

    assert first.status_code == 200
    assert second.status_code == 409
    assert first.json()["status"] == "approved"


def test_resolve_unknown_invoice_returns_404(api_client) -> None:
    response = api_client.patch(
        f"{COLLECTION}/999999", json={"status": "approved"}
    )

    assert response.status_code == 404


def test_resolve_rejects_an_unknown_status(api_client, monkeypatch) -> None:
    invoice_id = _review_invoice_id(api_client, monkeypatch)

    response = api_client.patch(
        f"{COLLECTION}/{invoice_id}", json={"status": "deleted"}
    )

    assert response.status_code == 422
