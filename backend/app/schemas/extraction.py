from pydantic import BaseModel, Field


class ExtractedLineItem(BaseModel):
    description: str | None = Field(
        default=None,
        description="Product or service text for this row, as printed.",
    )
    quantity: str | None = Field(
        default=None,
        description="Quantity as printed, for example '12' or '1.5'.",
    )
    unit_price: str | None = Field(
        default=None,
        description="Price per unit as printed, without currency symbols.",
    )
    amount: str | None = Field(
        default=None,
        description="Row total as printed, without currency symbols.",
    )


class InvoiceExtraction(BaseModel):
    """Exactly what the model must return.

    Amounts are strings on purpose: JSON numbers are decoded as floats, which
    silently corrupt money. We parse to Decimal in normalize.py instead.
    """

    vendor_name: str | None = Field(
        default=None, description="Seller / supplier business name."
    )
    invoice_number: str | None = Field(
        default=None, description="Invoice identifier as printed."
    )
    invoice_date: str | None = Field(
        default=None, description="Issue date, ISO 8601 when unambiguous."
    )
    currency: str | None = Field(
        default=None, description="3-letter ISO 4217 currency code."
    )
    subtotal: str | None = Field(
        default=None, description="Amount before tax, without currency symbols."
    )
    tax_amount: str | None = Field(
        default=None, description="Total tax amount, without currency symbols."
    )
    total_amount: str | None = Field(
        default=None, description="Total due, without currency symbols."
    )
    line_items: list[ExtractedLineItem] = Field(
        default_factory=list, description="Billed rows, one per row, in order."
    )
    notes: list[str] = Field(
        default_factory=list,
        description="Anything unclear, missing, or inconsistent in the document.",
    )


class ExtractedText(BaseModel):
    filename: str
    stored_as: str
    page_count: int
    character_count: int
    preview: str = Field(description="First 300 characters of the extracted text.")
