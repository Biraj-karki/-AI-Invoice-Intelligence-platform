from decimal import Decimal

from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models import Invoice, LineItem


def test_invoice_and_line_items_round_trip() -> None:
    """Insert an invoice with a child row, read it back, then undo everything."""
    with SessionLocal() as session:
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

        session.add(invoice)
        session.flush()  # sends the INSERTs, assigns primary keys
        session.refresh(invoice)  # reload server-side defaults

        assert invoice.id is not None
        assert invoice.line_items[0].id is not None
        assert invoice.line_items[0].invoice_id == invoice.id
        assert invoice.status == "pending"
        assert invoice.created_at is not None

        # Money must survive as exact decimals, not floats.
        assert invoice.total_amount == Decimal("110.00")
        assert invoice.raw_extraction == {"vendor": "Acme Supplies"}

        session.rollback()


def test_deleting_invoice_deletes_its_line_items() -> None:
    with SessionLocal() as session:
        invoice = Invoice(vendor_name="Temp Co", status="pending")
        invoice.line_items = [LineItem(description="One-off")]
        session.add(invoice)
        session.flush()

        invoice_id = invoice.id
        session.delete(invoice)
        session.flush()

        remaining = session.scalar(
            select(func.count())
            .select_from(LineItem)
            .where(LineItem.invoice_id == invoice_id)
        )
        assert remaining == 0

        session.rollback()


def test_tests_leave_no_rows_behind() -> None:
    with SessionLocal() as session:
        count = session.scalar(select(func.count()).select_from(Invoice))

    assert count == 0
