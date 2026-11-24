from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Invoice(Base):
    """One uploaded invoice document and the header fields extracted from it."""

    __tablename__ = "invoices"
    __table_args__ = (
        Index("ix_invoices_owner_content_hash", "owner_id", "content_hash"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    # The account that uploaded this invoice. Every query filters on it, so one
    # account can never read, export or delete another account's documents.
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    content_hash: Mapped[str | None] = mapped_column(String(64))
    duplicate_of_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoices.id", ondelete="SET NULL")
    )
    duplicate_match: Mapped[str | None] = mapped_column(String(32))

    vendor_name: Mapped[str | None] = mapped_column(String(255))
    invoice_number: Mapped[str | None] = mapped_column(String(64), index=True)
    invoice_date: Mapped[date | None] = mapped_column(Date)
    currency: Mapped[str | None] = mapped_column(String(3))

    # Numeric, never float: money must not lose precision.
    subtotal: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    tax_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    # Lifecycle: pending -> extracted | review -> approved | rejected (or failed).
    # "review" means extraction succeeded but the numbers did not reconcile.
    status: Mapped[str] = mapped_column(
        String(32), default="pending", server_default="pending", index=True
    )

    source_filename: Mapped[str | None] = mapped_column(String(255))
    stored_path: Mapped[str | None] = mapped_column(String(512))
    storage_provider: Mapped[str] = mapped_column(
        String(32), default="local", server_default="local", nullable=False
    )

    # Data-quality warnings raised during normalisation, for the review screen.
    issues: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )

    # Verbatim model output, kept for auditing and re-processing.
    raw_extraction: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    line_items: Mapped[list["LineItem"]] = relationship(
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="LineItem.id",
    )


class LineItem(Base):
    """A single row of the invoice table (one billed product or service)."""

    __tablename__ = "line_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id", ondelete="CASCADE"), index=True
    )

    description: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    invoice: Mapped[Invoice] = relationship(back_populates="line_items")
