import re
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    duplicate_of_id: int | None = None
    duplicate_match: Literal["same_file", "invoice_details"] | None = None
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


class InvoiceFieldsIn(BaseModel):
    """A human correction of the header fields of an invoice in review.

    Only the fields present in the request are written: omitting a field leaves
    it untouched, while sending null clears it. Money arrives as a decimal
    string ("110.00"), never a float, so no cent can be lost on the way in.
    """

    vendor_name: str | None = Field(default=None, max_length=255)
    invoice_number: str | None = Field(default=None, max_length=64)
    invoice_date: date | None = None
    currency: str | None = None
    subtotal: Decimal | None = Field(default=None, max_digits=12, decimal_places=2)
    tax_amount: Decimal | None = Field(default=None, max_digits=12, decimal_places=2)
    total_amount: Decimal | None = Field(default=None, max_digits=12, decimal_places=2)

    @field_validator("vendor_name", "invoice_number", "currency", mode="before")
    @classmethod
    def _tidy_text(cls, value: object) -> object:
        # A form field left empty posts "", which is "no value", not a name.
        if isinstance(value, str):
            value = value.strip()
            if value == "":
                return None
        return value

    @field_validator("currency", mode="before")
    @classmethod
    def _upper_currency(cls, value: object) -> object:
        # "npr" and "NPR" are the same code; storing both would split the
        # dashboard totals into two currencies.
        return value.upper() if isinstance(value, str) else value

    @field_validator("currency")
    @classmethod
    def _three_letters(cls, value: str | None) -> str | None:
        if value is not None and re.fullmatch(r"[A-Z]{3}", value) is None:
            raise ValueError("must be a three-letter currency code such as NPR or USD")
        return value


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
