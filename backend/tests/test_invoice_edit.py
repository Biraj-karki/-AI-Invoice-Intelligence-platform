"""Correcting the header fields of an invoice that is waiting for review."""

from decimal import Decimal
from pathlib import Path

import pytest

from app.models import Invoice
from app.schemas.extraction import ExtractedLineItem, InvoiceExtraction
from app.services import gemini_service, pdf_service

FIXTURE = Path(__file__).parent / "fixtures" / "sample_invoice.pdf"
COLLECTION = "/api/v1/invoices"

# subtotal 100 + tax 10 should be 110, but the model reported 500.
# The single line item matches the subtotal, so correcting the total alone can
# make this invoice clean.
BAD_TOTAL = InvoiceExtraction(
    vendor_name="Dodgy Co",
    invoice_number="D-1",
    invoice_date="2026-10-15",
    currency="NPR",
    subtotal="100.00",
    tax_amount="10.00",
    total_amount="500.00",
    line_items=[
        ExtractedLineItem(
            description="Mystery",
            quantity="1",
            unit_price="100.00",
            amount="100.00",
        )
    ],
)


@pytest.fixture(autouse=True)
def _isolate_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(pdf_service, "UPLOAD_DIR", tmp_path)


def _review_invoice(client, monkeypatch) -> dict:
    monkeypatch.setattr(gemini_service, "extract_invoice", lambda *a, **k: BAD_TOTAL)

    response = client.post(
        COLLECTION,
        files={"file": ("sample.pdf", FIXTURE.read_bytes(), "application/pdf")},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "review"
    return body


def _correct(client, invoice_id: int, **fields):
    return client.patch(f"{COLLECTION}/{invoice_id}/fields", json=fields)


def test_fixing_the_total_ends_the_review(api_client, db_session, monkeypatch) -> None:
    invoice = _review_invoice(api_client, monkeypatch)

    response = _correct(api_client, invoice["id"], total_amount="110.00")

    assert response.status_code == 200
    body = response.json()
    assert body["total_amount"] == "110.00"
    assert body["status"] == "extracted"
    # The stale complaint about 500.00 must not survive the correction.
    assert body["issues"] == []
    # A PATCH that mentions only the total leaves everything else alone.
    assert body["vendor_name"] == "Dodgy Co"
    assert body["subtotal"] == "100.00"
    assert db_session.get(Invoice, invoice["id"]).status == "extracted"


def test_a_correction_that_still_does_not_add_up_stays_in_review(
    api_client, monkeypatch
) -> None:
    invoice = _review_invoice(api_client, monkeypatch)

    response = _correct(api_client, invoice["id"], total_amount="120.00")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "review"
    assert len(body["issues"]) == 1
    assert "subtotal + tax = 110.00" in body["issues"][0]
    assert "120.00" in body["issues"][0]
    # The old numbers are gone from the live warnings.
    assert all("500.00" not in issue for issue in body["issues"])


def test_the_original_warnings_are_kept_for_audit(
    api_client, db_session, monkeypatch
) -> None:
    invoice = _review_invoice(api_client, monkeypatch)
    original = list(invoice["issues"])
    assert any("500.00" in issue for issue in original)

    _correct(api_client, invoice["id"], total_amount="110.00")

    stored = db_session.get(Invoice, invoice["id"])
    assert stored.raw_extraction["original_issues"] == original


def test_an_approved_invoice_cannot_be_corrected(api_client, monkeypatch) -> None:
    invoice = _review_invoice(api_client, monkeypatch)
    approved = api_client.patch(
        f"{COLLECTION}/{invoice['id']}", json={"status": "approved"}
    )
    assert approved.status_code == 200

    response = _correct(api_client, invoice["id"], total_amount="110.00")

    assert response.status_code == 409
    assert "cannot be corrected" in response.json()["detail"]
    # Nothing changed behind the refusal.
    detail = api_client.get(f"{COLLECTION}/{invoice['id']}").json()
    assert detail["total_amount"] == "500.00"
    assert detail["status"] == "approved"


def test_correcting_an_unknown_invoice_is_a_404(api_client) -> None:
    response = _correct(api_client, 999, total_amount="1.00")

    assert response.status_code == 404
    assert "does not exist" in response.json()["detail"]


def test_currency_is_normalised_and_checked(api_client, monkeypatch) -> None:
    invoice = _review_invoice(api_client, monkeypatch)

    fixed = _correct(api_client, invoice["id"], currency="usd", total_amount="110.00")
    assert fixed.status_code == 200
    assert fixed.json()["currency"] == "USD"

    rejected = _correct(api_client, invoice["id"], currency="dollars")
    assert rejected.status_code == 422


def test_money_must_fit_the_column(api_client, monkeypatch) -> None:
    invoice = _review_invoice(api_client, monkeypatch)

    # Three decimals cannot be stored in NUMERIC(12,2) without rounding, and
    # silently rounding money is not acceptable.
    too_precise = _correct(api_client, invoice["id"], total_amount="110.001")
    assert too_precise.status_code == 422

    too_large = _correct(api_client, invoice["id"], total_amount="10000000000.00")
    assert too_large.status_code == 422


def test_blank_text_clears_a_field(api_client, monkeypatch) -> None:
    invoice = _review_invoice(api_client, monkeypatch)

    response = _correct(
        api_client, invoice["id"], vendor_name="   ", invoice_number=""
    )

    assert response.status_code == 200
    assert response.json()["vendor_name"] is None
    assert response.json()["invoice_number"] is None


def test_clearing_the_total_keeps_the_invoice_in_review(
    api_client, monkeypatch
) -> None:
    invoice = _review_invoice(api_client, monkeypatch)

    response = _correct(api_client, invoice["id"], total_amount=None)

    assert response.status_code == 200
    body = response.json()
    assert body["total_amount"] is None
    assert body["status"] == "review"
    assert body["issues"] == ["total_amount is missing"]


def test_correcting_requires_a_token(anonymous_client, db_session) -> None:
    invoice = Invoice(
        vendor_name="Dodgy Co",
        subtotal=Decimal("100.00"),
        tax_amount=Decimal("10.00"),
        total_amount=Decimal("500.00"),
        status="review",
        issues=["subtotal + tax = 110.00 but total is 500.00"],
    )
    db_session.add(invoice)
    db_session.commit()

    response = anonymous_client.patch(
        f"{COLLECTION}/{invoice.id}/fields", json={"total_amount": "110.00"}
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
