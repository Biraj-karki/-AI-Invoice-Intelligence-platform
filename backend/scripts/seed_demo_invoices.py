"""Seed the development database with demo invoices for the dashboard.

Re-runnable: it first deletes the rows it created last time (recognised by
source_filename) and leaves every other invoice alone.

    python scripts/seed_demo_invoices.py
"""
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, func, select

from app.db.session import SessionLocal
from app.models import Invoice, LineItem

DEMO_SOURCE = "demo-seed.pdf"

# (vendor, invoice number, invoice date, currency, subtotal, tax, status)
DEMO_ROWS = [
    ("ACME SUPPLIES PVT. LTD.", "DEMO-0001", date(2026, 5, 12), "NPR", "12000.00", "1560.00", "extracted"),
    ("Himalayan Office Mart", "DEMO-0002", date(2026, 5, 27), "NPR", "4800.00", "624.00", "extracted"),
    ("Kathmandu Print House", "DEMO-0003", date(2026, 6, 4), "NPR", "9500.00", "1235.00", "extracted"),
    ("ACME SUPPLIES PVT. LTD.", "DEMO-0004", date(2026, 6, 18), "NPR", "26000.00", "3380.00", "extracted"),
    ("Everest Logistics", "DEMO-0005", date(2026, 6, 29), "NPR", "7250.00", "942.50", "approved"),
    ("CloudServe Inc.", "DEMO-0006", date(2026, 7, 3), "USD", "1200.00", "96.00", "extracted"),
    ("Himalayan Office Mart", "DEMO-0007", date(2026, 7, 11), "NPR", "3200.00", "416.00", "extracted"),
    ("Kathmandu Print House", "DEMO-0008", date(2026, 7, 22), "NPR", "14800.00", "1924.00", "review"),
    ("ACME SUPPLIES PVT. LTD.", "DEMO-0009", date(2026, 8, 6), "NPR", "18400.00", "2392.00", "extracted"),
    ("Everest Logistics", "DEMO-0010", date(2026, 8, 15), "NPR", "6100.00", "793.00", "extracted"),
    ("CloudServe Inc.", "DEMO-0011", date(2026, 8, 28), "USD", "2400.00", "192.00", "approved"),
    ("Himalayan Office Mart", "DEMO-0012", date(2026, 9, 2), "NPR", "5400.00", "702.00", "extracted"),
    ("Kathmandu Print House", "DEMO-0013", date(2026, 9, 14), "NPR", "11250.00", "1462.50", "extracted"),
    ("ACME SUPPLIES PVT. LTD.", "DEMO-0014", date(2026, 9, 25), "NPR", "31500.00", "4095.00", "extracted"),
    ("Everest Logistics", "DEMO-0015", date(2026, 10, 7), "NPR", "8300.00", "1079.00", "review"),
    ("Himalayan Office Mart", "DEMO-0016", date(2026, 10, 16), "NPR", "2950.00", "383.50", "extracted"),
    ("Kathmandu Print House", "DEMO-0017", date(2026, 10, 23), "NPR", "16400.00", "2132.00", "approved"),
    ("ACME SUPPLIES PVT. LTD.", "DEMO-0018", date(2026, 10, 30), "NPR", "22800.00", "2964.00", "extracted"),
]

ITEMS = [
    "Steel Bracket 40mm",
    "Hex Bolt M8",
    "A4 Paper Ream",
    "Toner Cartridge",
    "Courier Service",
    "Cloud Hosting",
    "Design Retainer",
    "Packaging Material",
]


def _split(subtotal: Decimal, index: int) -> list[LineItem]:
    """Two line items that add up to the subtotal, exactly."""
    first = (subtotal * Decimal("0.6")).quantize(Decimal("0.01"))
    second = subtotal - first
    return [
        LineItem(
            description=ITEMS[index % len(ITEMS)],
            quantity=Decimal("1"),
            unit_price=first,
            amount=first,
        ),
        LineItem(
            description=ITEMS[(index + 1) % len(ITEMS)],
            quantity=Decimal("1"),
            unit_price=second,
            amount=second,
        ),
    ]


def main() -> None:
    db = SessionLocal()
    try:
        removed = db.execute(
            delete(Invoice).where(Invoice.source_filename == DEMO_SOURCE)
        ).rowcount
        db.commit()

        if "--clear" in sys.argv:
            print(f"removed {removed} demo invoice(s); nothing was added (--clear)")
            return

        if removed:
            print(f"removed {removed} previous demo invoice(s)")

        for index, (vendor, number, issued, currency, subtotal, tax, status) in enumerate(
            DEMO_ROWS
        ):
            sub = Decimal(subtotal)
            tax_amount = Decimal(tax)
            invoice = Invoice(
                vendor_name=vendor,
                invoice_number=number,
                invoice_date=issued,
                currency=currency,
                subtotal=sub,
                tax_amount=tax_amount,
                total_amount=sub + tax_amount,
                status=status,
                source_filename=DEMO_SOURCE,
                issues=(
                    ["Seeded demo row: totals were adjusted by hand."]
                    if status == "review"
                    else []
                ),
                raw_extraction=None,
            )
            invoice.line_items = _split(sub, index)
            db.add(invoice)

        db.commit()

        first_id = db.scalar(
            select(func.min(Invoice.id)).where(Invoice.source_filename == DEMO_SOURCE)
        )
        print(f"seeded {len(DEMO_ROWS)} demo invoices (source={DEMO_SOURCE})")
        print(f"your other invoices were not touched (first demo id: {first_id})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
