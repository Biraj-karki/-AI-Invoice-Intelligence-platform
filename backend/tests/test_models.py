from decimal import Decimal

from sqlalchemy import func, select

from app.models import Invoice, LineItem

# These tests use the `db_session` fixture, so they run against the throwaway
# "pytest" schema rather than the development tables.


def test_invoice_and_line_items_round_trip(db_session) -> None:
    """Insert an invoice with a child row and read it back."""
    invoice = Invoice(
        vendor_name="Acme Supplies",
        invoice_number="INV-1001",
        currency="USD",
        subtotal=Decimal("100.00"),
        tax_amount=Decimal("10.00"),
        total_amount=Decimal("110.00"),
        source_filename="acme-1001.pdf",
        raw_extraction={"vendor": "Acme Supplies"},
    )
    invoice.line_items = [
        LineItem(
            description="Widget",
            quantity=Decimal("2.000"),
            unit_price=Decimal("50.00"),
            amount=Decimal("100.00"),
        )
    ]

    db_session.add(invoice)
    db_session.flush()  # sends the INSERTs, assigns primary keys
    db_session.refresh(invoice)  # reload server-side defaults

    assert invoice.id is not None
    assert invoice.line_items[0].id is not None
    assert invoice.line_items[0].invoice_id == invoice.id
    assert invoice.status == "pending"
    assert invoice.created_at is not None

    # Money must survive as exact decimals, not floats.
    assert invoice.total_amount == Decimal("110.00")
    assert invoice.raw_extraction == {"vendor": "Acme Supplies"}


def test_deleting_invoice_deletes_its_line_items(db_session) -> None:
    invoice = Invoice(vendor_name="Temp Co", status="pending")
    invoice.line_items = [LineItem(description="One-off")]
    db_session.add(invoice)
    db_session.flush()

    invoice_id = invoice.id
    db_session.delete(invoice)
    db_session.flush()

    remaining = db_session.scalar(
        select(func.count())
        .select_from(LineItem)
        .where(LineItem.invoice_id == invoice_id)
    )
    assert remaining == 0


def test_tests_leave_no_rows_behind(db_session) -> None:
    """Nothing from the tests above may survive as a committed row."""
    count = db_session.scalar(select(func.count()).select_from(Invoice))

    assert count == 0
