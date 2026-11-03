from datetime import date
from decimal import Decimal

import pytest

from app.schemas.extraction import ExtractedLineItem, InvoiceExtraction
from app.services.normalize import normalize_invoice, parse_amount, parse_date


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, None),
        ("", None),
        ("n/a", None),
        ("NPR 6,130.25", Decimal("6130.25")),
        ("1.234,56", Decimal("1234.56")),
        ("1,234", Decimal("1234")),
        ("1,234.50", Decimal("1234.50")),
        ("12 345.00", Decimal("12345.00")),
        ("$0.00", Decimal("0.00")),
        ("-12.50", Decimal("-12.50")),
        ("(1,200.00)", Decimal("-1200.00")),
        ("abc", None),
    ],
)
def test_parse_amount(raw: str | None, expected: Decimal | None) -> None:
    assert parse_amount(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2026-10-15", date(2026, 10, 15)),
        ("15/10/2026", date(2026, 10, 15)),
        ("15 Oct 2026", date(2026, 10, 15)),
        ("October 15, 2026", date(2026, 10, 15)),
        ("", None),
        ("not a date", None),
    ],
)
def test_parse_date(raw: str, expected: date | None) -> None:
    assert parse_date(raw) == expected


def test_normalize_consistent_invoice_has_no_issues() -> None:
    extraction = InvoiceExtraction(
        vendor_name="Acme Supplies",
        invoice_number="INV-2026-0042",
        invoice_date="2026-10-15",
        currency="npr",
        subtotal="5,425.00",
        tax_amount="705.25",
        total_amount="6,130.25",
        line_items=[
            ExtractedLineItem(description="Bracket", quantity="12", unit_price="250.00", amount="3000.00"),
            ExtractedLineItem(description="Bolt", quantity="50", unit_price="18.50", amount="925.00"),
            ExtractedLineItem(description="Service", quantity="1", unit_price="1500.00", amount="1500.00"),
        ],
    )

    result = normalize_invoice(extraction)

    assert result.currency == "NPR"
    assert result.invoice_date == date(2026, 10, 15)
    assert result.total_amount == Decimal("6130.25")
    assert result.line_items[0].quantity == Decimal("12.000")
    assert result.issues == []


def test_normalize_flags_totals_that_do_not_add_up() -> None:
    extraction = InvoiceExtraction(
        subtotal="100.00",
        tax_amount="10.00",
        total_amount="120.00",
    )

    result = normalize_invoice(extraction)

    assert any("subtotal + tax" in issue for issue in result.issues)


def test_normalize_flags_line_items_that_do_not_match_subtotal() -> None:
    extraction = InvoiceExtraction(
        subtotal="100.00",
        tax_amount="10.00",
        total_amount="110.00",
        line_items=[ExtractedLineItem(description="Only row", amount="90.00")],
    )

    result = normalize_invoice(extraction)

    assert any("line items sum" in issue for issue in result.issues)


def test_normalize_reports_unparseable_values_instead_of_crashing() -> None:
    extraction = InvoiceExtraction(
        invoice_date="sometime in March",
        currency="rupees",
        subtotal="about a hundred",
        total_amount=None,
    )

    result = normalize_invoice(extraction)

    assert result.invoice_date is None
    assert result.currency is None
    assert result.subtotal is None
    assert any("unparseable invoice_date" in issue for issue in result.issues)
    assert any("invalid currency" in issue for issue in result.issues)
    assert any("total_amount is missing" in issue for issue in result.issues)


def test_normalize_keeps_model_notes() -> None:
    extraction = InvoiceExtraction(notes=["page 2 appears to be a different invoice"])

    result = normalize_invoice(extraction)

    assert "page 2 appears to be a different invoice" in result.issues
