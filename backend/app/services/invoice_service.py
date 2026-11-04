from sqlalchemy.orm import Session

from app.models import Invoice, LineItem
from app.services.normalize import NormalizedInvoice

STATUS_EXTRACTED = "extracted"
STATUS_NEEDS_REVIEW = "review"


def create_invoice(
    db: Session,
    *,
    normalized: NormalizedInvoice,
    raw_extraction: dict,
    source_filename: str | None,
    stored_path: str | None,
) -> Invoice:
    """Persist one invoice and its line items in a single transaction.

    A single commit means a failure cannot leave an invoice without its rows.
    """
    invoice = Invoice(
        vendor_name=normalized.vendor_name,
        invoice_number=normalized.invoice_number,
        invoice_date=normalized.invoice_date,
        currency=normalized.currency,
        subtotal=normalized.subtotal,
        tax_amount=normalized.tax_amount,
        total_amount=normalized.total_amount,
        status=STATUS_NEEDS_REVIEW if normalized.issues else STATUS_EXTRACTED,
        source_filename=source_filename,
        stored_path=stored_path,
        issues=list(normalized.issues),
        raw_extraction=raw_extraction,
        line_items=[
            LineItem(
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                amount=item.amount,
            )
            for item in normalized.line_items
        ],
    )

    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice
