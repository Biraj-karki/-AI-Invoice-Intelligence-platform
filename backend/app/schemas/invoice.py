from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LineItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    description: str | None = None
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    amount: Decimal | None = None


class InvoiceSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vendor_name: str | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    currency: str | None = None
    total_amount: Decimal | None = None
    status: str
    created_at: datetime


class InvoiceDetailOut(InvoiceSummaryOut):
    subtotal: Decimal | None = None
    tax_amount: Decimal | None = None
    source_filename: str | None = None
    stored_path: str | None = None
    issues: list[str] = Field(default_factory=list)
    line_items: list[LineItemOut] = Field(default_factory=list)


class InvoiceListOut(BaseModel):
    items: list[InvoiceSummaryOut]
    total: int
    limit: int
    offset: int


class InvoiceResolutionIn(BaseModel):
    """A human decision on an invoice whose numbers did not reconcile."""

    status: Literal["approved", "rejected"]


class VendorSpendOut(BaseModel):
    vendor_name: str
    invoice_count: int
    total_amount: Decimal


class MonthSpendOut(BaseModel):
    month: str  # "2026-10"
    invoice_count: int
    total_amount: Decimal


class CurrencyStatsOut(BaseModel):
    currency: str
    invoice_count: int
    total_amount: Decimal
    by_vendor: list[VendorSpendOut]
    by_month: list[MonthSpendOut]


class InvoiceStatsOut(BaseModel):
    """Spend aggregates, kept separate per currency on purpose.

    Adding NPR to USD would produce a meaningless number, so the client gets
    one block per currency instead of a single total.
    """

    currencies: list[CurrencyStatsOut]
    excluded_count: int  # invoices in review/rejected/pending/failed
    undated_count: int  # counted, but no invoice_date, so absent from by_month
