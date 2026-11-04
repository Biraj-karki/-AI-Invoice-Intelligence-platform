from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Invoice
from app.schemas.invoice import (
    CurrencyStatsOut,
    InvoiceStatsOut,
    MonthSpendOut,
    VendorSpendOut,
)
from app.services.invoice_service import STATUS_APPROVED, STATUS_EXTRACTED

# Only data we trust goes into the charts. An invoice still waiting for review
# may be wrong, and a rejected one is known to be wrong.
COUNTED_STATUSES = (STATUS_EXTRACTED, STATUS_APPROVED)

UNKNOWN_CURRENCY = "UNKNOWN"
UNKNOWN_VENDOR = "Unknown vendor"


def _money(value: Decimal | None) -> Decimal:
    return value if value is not None else Decimal("0.00")


def invoice_stats(db: Session) -> InvoiceStatsOut:
    """Aggregate spend per currency, per vendor and per month.

    All three groupings are done in SQL; Python only reshapes the rows, so the
    database never ships every invoice to the app just to add them up.
    """
    currency = func.coalesce(Invoice.currency, UNKNOWN_CURRENCY)
    vendor = func.coalesce(Invoice.vendor_name, UNKNOWN_VENDOR)
    month = func.to_char(Invoice.invoice_date, "YYYY-MM")
    counted = Invoice.status.in_(COUNTED_STATUSES)
    total = func.coalesce(func.sum(Invoice.total_amount), Decimal("0.00"))

    totals = db.execute(
        select(
            currency.label("currency"),
            func.count(Invoice.id).label("invoice_count"),
            total.label("total_amount"),
        )
        .where(counted)
        .group_by(currency)
        .order_by(func.sum(Invoice.total_amount).desc())
    ).all()

    vendors = db.execute(
        select(
            currency.label("currency"),
            vendor.label("vendor_name"),
            func.count(Invoice.id).label("invoice_count"),
            total.label("total_amount"),
        )
        .where(counted)
        .group_by(currency, vendor)
        .order_by(func.sum(Invoice.total_amount).desc())
    ).all()

    months = db.execute(
        select(
            currency.label("currency"),
            month.label("month"),
            func.count(Invoice.id).label("invoice_count"),
            total.label("total_amount"),
        )
        .where(counted, Invoice.invoice_date.is_not(None))
        .group_by(currency, month)
        .order_by(month)
    ).all()

    excluded_count = db.scalar(
        select(func.count()).select_from(Invoice).where(Invoice.status.not_in(COUNTED_STATUSES))
    )
    undated_count = db.scalar(
        select(func.count())
        .select_from(Invoice)
        .where(counted, Invoice.invoice_date.is_(None))
    )

    currencies: list[CurrencyStatsOut] = []
    for row in totals:
        currencies.append(
            CurrencyStatsOut(
                currency=row.currency,
                invoice_count=row.invoice_count,
                total_amount=_money(row.total_amount),
                by_vendor=[
                    VendorSpendOut(
                        vendor_name=v.vendor_name,
                        invoice_count=v.invoice_count,
                        total_amount=_money(v.total_amount),
                    )
                    for v in vendors
                    if v.currency == row.currency
                ],
                by_month=[
                    MonthSpendOut(
                        month=m.month,
                        invoice_count=m.invoice_count,
                        total_amount=_money(m.total_amount),
                    )
                    for m in months
                    if m.currency == row.currency
                ],
            )
        )

    return InvoiceStatsOut(
        currencies=currencies,
        excluded_count=excluded_count or 0,
        undated_count=undated_count or 0,
    )
