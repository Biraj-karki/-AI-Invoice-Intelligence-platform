"""Two accounts must never see each other's invoices.

These tests switch the identity dependency between requests, which is exactly
what a real token does: the same URL, a different caller.
"""

from decimal import Decimal
from pathlib import Path

from app.core.auth import get_current_user
from app.main import app
from app.models import Invoice, User
from app.schemas.extraction import ExtractedLineItem, InvoiceExtraction
from app.services import gemini_service, pdf_service

FIXTURE = Path(__file__).parent / "fixtures" / "sample_invoice.pdf"
COLLECTION = "/api/v1/invoices"


def _other_user(db_session) -> User:
    """A second account, created inside the test's savepoint.

    The id is left to the sequence so this row can never collide with an
    account a test registers through the API.
    """
    user = User(
        email="second-account@example.com",
        password_hash="not-used-by-invoice-tests",
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()
    return user


def _sign_in_as(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _invoice(db_session, *, owner_id: int, **overrides) -> Invoice:
    values = {
        "vendor_name": "ACME",
        "invoice_number": "INV-1",
        "currency": "NPR",
        "total_amount": Decimal("100.00"),
        "status": "extracted",
    }
    values.update(overrides)
    invoice = Invoice(owner_id=owner_id, **values)
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)
    return invoice


def _clean_extraction(*args, **kwargs) -> InvoiceExtraction:
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


def test_a_new_account_starts_with_nothing(api_client, db_session) -> None:
    _invoice(db_session, owner_id=1)
    assert api_client.get(COLLECTION).json()["total"] == 1

    _sign_in_as(_other_user(db_session))

    listings = api_client.get(COLLECTION).json()
    assert listings["total"] == 0
    assert listings["items"] == []

    stats = api_client.get(f"{COLLECTION}/stats").json()
    assert stats == {"currencies": [], "excluded_count": 0, "undated_count": 0}

    export = api_client.get(f"{COLLECTION}/export.csv")
    assert export.status_code == 200
    # The header row is still there; no invoice rows.
    assert len(export.content.decode("utf-8-sig").splitlines()) == 1


def test_another_account_cannot_read_or_download(
    api_client, db_session, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr(pdf_service, "UPLOAD_DIR", tmp_path)
    stored = tmp_path / "private.pdf"
    stored.write_bytes(b"%PDF-1.4 private")

    invoice = _invoice(db_session, owner_id=1, stored_path=str(stored))
    assert api_client.get(f"{COLLECTION}/{invoice.id}").status_code == 200

    _sign_in_as(_other_user(db_session))

    # 404, not 403: the other account cannot even confirm the invoice exists.
    assert api_client.get(f"{COLLECTION}/{invoice.id}").status_code == 404
    assert api_client.get(f"{COLLECTION}/{invoice.id}/file").status_code == 404


def test_another_account_cannot_change_or_delete(api_client, db_session) -> None:
    invoice = _invoice(
        db_session,
        owner_id=1,
        status="review",
        issues=["total_amount is wrong"],
    )

    _sign_in_as(_other_user(db_session))

    # A state conflict would leak that the invoice exists; a foreign id is 404.
    assert (
        api_client.patch(
            f"{COLLECTION}/{invoice.id}", json={"status": "approved"}
        ).status_code
        == 404
    )
    assert (
        api_client.patch(
            f"{COLLECTION}/{invoice.id}/fields",
            json={"total_amount": "110.00"},
        ).status_code
        == 404
    )
    assert api_client.delete(f"{COLLECTION}/{invoice.id}").status_code == 404

    db_session.expire_all()
    unchanged = db_session.get(Invoice, invoice.id)
    assert unchanged is not None
    assert unchanged.status == "review"
    assert unchanged.total_amount == Decimal("100.00")


def test_upload_belongs_to_the_account_that_sent_it(
    api_client, db_session, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr(pdf_service, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(gemini_service, "extract_invoice", _clean_extraction)

    other = _other_user(db_session)
    _sign_in_as(other)

    response = api_client.post(
        COLLECTION,
        files={"file": ("sample_invoice.pdf", FIXTURE.read_bytes(), "application/pdf")},
    )

    assert response.status_code == 201
    invoice = db_session.get(Invoice, response.json()["id"])
    assert invoice is not None
    assert invoice.owner_id == other.id

    # The account that did not upload it still sees an empty workspace.
    _sign_in_as(db_session.get(User, 1))
    assert api_client.get(COLLECTION).json()["total"] == 0
