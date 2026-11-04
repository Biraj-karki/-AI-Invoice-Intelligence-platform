from datetime import date, datetime
from decimal import Decimal

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
