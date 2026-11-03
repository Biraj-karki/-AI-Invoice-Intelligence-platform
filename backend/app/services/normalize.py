import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.schemas.extraction import InvoiceExtraction

MONEY_STEP = Decimal("0.01")
QUANTITY_STEP = Decimal("0.001")
TOTAL_TOLERANCE = Decimal("0.01")

EMPTY_VALUES = {"", "-", "--", "n/a", "na", "none", "null", "tbd"}
DATE_FORMATS = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d.%m.%Y",
    "%d/%m/%y",
    "%d %b %Y",
    "%d %B %Y",
    "%b %d, %Y",
    "%B %d, %Y",
    "%b %d %Y",
    "%B %d %Y",
)
KEEP_CHARS = re.compile(r"[^0-9,.\-]")


@dataclass(frozen=True)
class NormalizedLineItem:
    description: str | None
    quantity: Decimal | None
    unit_price: Decimal | None
    amount: Decimal | None


@dataclass(frozen=True)
class NormalizedInvoice:
    vendor_name: str | None
    invoice_number: str | None
    invoice_date: date | None
    currency: str | None
    subtotal: Decimal | None
    tax_amount: Decimal | None
    total_amount: Decimal | None
    line_items: list[NormalizedLineItem]
    issues: list[str] = field(default_factory=list)


def parse_amount(raw: str | None) -> Decimal | None:
    """Turn printed money text into an exact Decimal.

    Handles 'NPR 6,130.25', '1.234,56', '1,234', '(1,200.00)' and '12 345'.
    When both ',' and '.' appear, whichever is rightmost is the decimal mark.
    """
    if raw is None:
        return None

    text = raw.strip()
    if text.lower() in EMPTY_VALUES:
        return None

    negative = text.startswith("(") and text.endswith(")")
    digits = KEEP_CHARS.sub("", text)
    if not digits or digits in {"-", ".", ","}:
        return None

    last_comma = digits.rfind(",")
    last_dot = digits.rfind(".")

    if last_comma != -1 and last_dot != -1:
        decimal_mark = "," if last_comma > last_dot else "."
        thousands_mark = "." if decimal_mark == "," else ","
        digits = digits.replace(thousands_mark, "")
        digits = digits.replace(decimal_mark, ".")
    elif last_comma != -1:
        digits = _single_separator(digits, ",")
    elif last_dot != -1:
        digits = _single_separator(digits, ".")

    try:
        value = Decimal(digits)
    except InvalidOperation:
        return None

    return -value if negative else value


def _single_separator(digits: str, mark: str) -> str:
    """One repeated separator: decimal only if the last group has 1-2 digits."""
    parts = digits.split(mark)
    if len(parts) == 2 and 1 <= len(parts[1]) <= 2:
        return f"{parts[0]}.{parts[1]}"
    return "".join(parts)


def parse_date(raw: str | None) -> date | None:
    """Parse common invoice date formats. Day-first is assumed for '03/04/2026'."""
    if raw is None:
        return None

    text = raw.strip()
    if text.lower() in EMPTY_VALUES:
        return None

    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _quantize(value: Decimal | None, step: Decimal) -> Decimal | None:
    return None if value is None else value.quantize(step)


def normalize_invoice(extraction: InvoiceExtraction) -> NormalizedInvoice:
    """Convert model output into typed values and collect data-quality issues."""
    issues: list[str] = []

    subtotal = _parse_field(extraction.subtotal, "subtotal", issues)
    tax = _parse_field(extraction.tax_amount, "tax_amount", issues)
    total = _parse_field(extraction.total_amount, "total_amount", issues)

    items: list[NormalizedLineItem] = []
    for index, item in enumerate(extraction.line_items, start=1):
        items.append(
            NormalizedLineItem(
                description=item.description,
                quantity=_quantize(
                    _parse_field(item.quantity, f"line {index} quantity", issues),
                    QUANTITY_STEP,
                ),
                unit_price=_quantize(
                    _parse_field(item.unit_price, f"line {index} unit_price", issues),
                    MONEY_STEP,
                ),
                amount=_quantize(
                    _parse_field(item.amount, f"line {index} amount", issues),
                    MONEY_STEP,
                ),
            )
        )

    invoice_date = None
    if extraction.invoice_date:
        invoice_date = parse_date(extraction.invoice_date)
        if invoice_date is None:
            issues.append(f"unparseable invoice_date: {extraction.invoice_date!r}")

    currency = None
    if extraction.currency:
        candidate = extraction.currency.strip().upper()
        if len(candidate) == 3 and candidate.isalpha():
            currency = candidate
        else:
            issues.append(f"invalid currency code: {extraction.currency!r}")

    _check_totals(subtotal, tax, total, items, issues)

    return NormalizedInvoice(
        vendor_name=extraction.vendor_name,
        invoice_number=extraction.invoice_number,
        invoice_date=invoice_date,
        currency=currency,
        subtotal=_quantize(subtotal, MONEY_STEP),
        tax_amount=_quantize(tax, MONEY_STEP),
        total_amount=_quantize(total, MONEY_STEP),
        line_items=items,
        issues=issues + extraction.notes,
    )


def _parse_field(raw: str | None, label: str, issues: list[str]) -> Decimal | None:
    if not raw:
        return None
    value = parse_amount(raw)
    if value is None and raw.strip().lower() not in EMPTY_VALUES:
        issues.append(f"unparseable {label}: {raw!r}")
    return value


def _check_totals(
    subtotal: Decimal | None,
    tax: Decimal | None,
    total: Decimal | None,
    items: list[NormalizedLineItem],
    issues: list[str],
) -> None:
    """Totals that disagree are a warning, not a rejection: humans review them."""
    line_sum = sum((item.amount for item in items if item.amount is not None), Decimal("0"))

    if subtotal is not None and items and any(i.amount is not None for i in items):
        if abs(line_sum - subtotal) > TOTAL_TOLERANCE:
            issues.append(
                f"line items sum to {line_sum} but subtotal is {subtotal} "
                f"(difference {abs(line_sum - subtotal)})"
            )

    if subtotal is not None and total is not None:
        expected = subtotal + (tax or Decimal("0"))
        if abs(expected - total) > TOTAL_TOLERANCE:
            issues.append(
                f"subtotal + tax = {expected} but total is {total} "
                f"(difference {abs(expected - total)})"
            )
    elif total is None:
        issues.append("total_amount is missing")
