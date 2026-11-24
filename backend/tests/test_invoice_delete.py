"""Deleting an invoice: the row, its line items, and the stored PDF."""

from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.config import BASE_DIR
from app.models import Invoice, LineItem
from app.schemas.extraction import ExtractedLineItem, InvoiceExtraction
from app.services import gemini_service, pdf_service

FIXTURE = Path(__file__).parent / "fixtures" / "sample_invoice.pdf"
COLLECTION = "/api/v1/invoices"

EXTRACTION = InvoiceExtraction(
    vendor_name="ACME SUPPLIES PVT. LTD.",
    invoice_number="INV-2026-0042",
    invoice_date="2026-10-15",
    currency="NPR",
    subtotal="100.00",
    tax_amount="13.00",
    total_amount="113.00",
    line_items=[
        ExtractedLineItem(description="Widget", quantity="1", unit_price="100.00", amount="100.00")
    ],
)


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch) -> Path:
    """Point storage at a scratch directory so no real upload is ever touched."""
    directory = tmp_path / "uploads"
    monkeypatch.setattr(pdf_service, "UPLOAD_DIR", directory)
    return directory


def _upload(client, monkeypatch) -> dict:
    monkeypatch.setattr(gemini_service, "extract_invoice", lambda *a, **k: EXTRACTION)
    response = client.post(
        COLLECTION,
        files={"file": ("sample.pdf", FIXTURE.read_bytes(), "application/pdf")},
    )
    assert response.status_code == 201
    return response.json()


def _pdf_path(invoice: dict) -> Path:
    path = Path(invoice["stored_path"])
    return path if path.is_absolute() else BASE_DIR / path


def test_deleting_removes_the_row_the_line_items_and_the_pdf(
    api_client, db_session, monkeypatch
) -> None:
    invoice = _upload(api_client, monkeypatch)
    pdf = _pdf_path(invoice)
    assert pdf.is_file()

    response = api_client.delete(f"{COLLECTION}/{invoice['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert api_client.get(f"{COLLECTION}/{invoice['id']}").status_code == 404
    assert not pdf.exists()
    assert db_session.get(Invoice, invoice["id"]) is None
    assert db_session.scalar(select(func.count()).select_from(LineItem)) == 0
    assert api_client.get(COLLECTION).json()["total"] == 0


def test_deleting_one_invoice_leaves_the_rest_alone(
    api_client, db_session, monkeypatch
) -> None:
    first = _upload(api_client, monkeypatch)
    second = _upload(api_client, monkeypatch)
    second_pdf = _pdf_path(second)

    assert api_client.delete(f"{COLLECTION}/{first['id']}").status_code == 204

    assert api_client.get(f"{COLLECTION}/{second['id']}").status_code == 200
    assert second_pdf.is_file()
    assert db_session.get(Invoice, second["id"]) is not None
    assert api_client.get(COLLECTION).json()["total"] == 1


def test_an_approved_invoice_can_still_be_deleted(
    api_client, db_session, monkeypatch
) -> None:
    invoice = _upload(api_client, monkeypatch)

    # Only a review invoice can be approved through the API; here the point is
    # the delete rule, so put a finalized invoice on record directly.
    stored = db_session.get(Invoice, invoice["id"])
    stored.status = "approved"
    db_session.commit()

    assert api_client.delete(f"{COLLECTION}/{invoice['id']}").status_code == 204
    assert api_client.get(f"{COLLECTION}/{invoice['id']}").status_code == 404


def test_deleting_an_unknown_invoice_is_a_404(api_client) -> None:
    response = api_client.delete(f"{COLLECTION}/999")

    assert response.status_code == 404
    assert "does not exist" in response.json()["detail"]


def test_deleting_requires_a_token(anonymous_client, db_session) -> None:
    invoice = Invoice(owner_id=1, vendor_name="Kept Co", status="extracted")
    db_session.add(invoice)
    db_session.commit()

    response = anonymous_client.delete(f"{COLLECTION}/{invoice.id}")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert db_session.get(Invoice, invoice.id) is not None


def test_a_file_outside_the_upload_directory_is_not_deleted(
    api_client, db_session, uploads_dir, tmp_path
) -> None:
    """A tampered stored_path must not turn DELETE into "remove any file"."""
    outside = tmp_path / "important.pdf"
    outside.write_bytes(b"%PDF-1.4 not ours")

    invoice = Invoice(
        owner_id=1,
        vendor_name="Tampered Co",
        stored_path=str(outside),
        status="extracted",
    )
    db_session.add(invoice)
    db_session.commit()

    assert api_client.delete(f"{COLLECTION}/{invoice.id}").status_code == 204

    assert db_session.get(Invoice, invoice.id) is None
    # The row is gone; the file it pointed at is untouched.
    assert outside.is_file()


def test_an_invoice_without_a_file_still_deletes(db_session, api_client) -> None:
    invoice = Invoice(
        owner_id=1,
        vendor_name="Demo Co",
        subtotal=Decimal("100.00"),
        total_amount=Decimal("100.00"),
        status="extracted",
    )
    db_session.add(invoice)
    db_session.commit()

    assert api_client.delete(f"{COLLECTION}/{invoice.id}").status_code == 204
    assert db_session.get(Invoice, invoice.id) is None


def test_deleting_a_cloudinary_invoice_removes_its_asset(
    db_session, api_client, monkeypatch
) -> None:
    public_id = "invoice-pdfs/0123456789abcdef0123456789abcdef.pdf"
    invoice = Invoice(
        owner_id=1,
        stored_path=public_id,
        storage_provider="cloudinary",
        status="extracted",
    )
    db_session.add(invoice)
    db_session.commit()
    deleted: list[str] = []
    monkeypatch.setattr(
        pdf_service,
        "delete_cloudinary_upload",
        lambda stored_id: deleted.append(stored_id),
    )

    response = api_client.delete(f"{COLLECTION}/{invoice.id}")

    assert response.status_code == 204
    assert deleted == [public_id]
