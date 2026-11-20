from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Invoice, LineItem
from app.services.normalize import NormalizedInvoice, reconcile_issues

STATUS_EXTRACTED = "extracted"
STATUS_NEEDS_REVIEW = "review"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"

# Only an invoice that is actually waiting for a decision can be resolved.
RESOLVABLE_FROM = frozenset({STATUS_NEEDS_REVIEW})

# Same rule for corrections: once a human has approved or rejected an invoice,
# its numbers are the record. Editing them afterwards would silently move
# dashboard totals with no trace of who changed what.
CORRECTABLE_FROM = frozenset({STATUS_NEEDS_REVIEW})


class InvoiceStateError(Exception):
    """The invoice exists but is not in a state that allows this transition."""


def _like_pattern(term: str) -> str:
    """Build a case-insensitive "contains" pattern for SQL LIKE.

    The wildcards are escaped first: without that, searching for "50%" would
    match every invoice because % means "anything" in LIKE, and "a_b" would
    match "axb" because _ means "one character".
    """
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _conditions(term: str, status: str | None) -> list:
    conditions = []

    if term:
        pattern = _like_pattern(term)
        conditions.append(
            or_(
                Invoice.vendor_name.ilike(pattern, escape="\\"),
                Invoice.invoice_number.ilike(pattern, escape="\\"),
            )
        )

    if status is not None:
        conditions.append(Invoice.status == status)

    return conditions


def list_invoices(
    db: Session,
    *,
    term: str = "",
    status: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[Invoice], int]:
    """Return one page of invoices plus the size of the whole filtered set.

    The list endpoint and the CSV export both go through here, so a filter can
    never mean one thing on screen and another in the downloaded file.
    `limit=None` means "every match", which is what an export wants.
    """
    conditions = _conditions(term, status)

    # The total must describe the same filtered set as the page, otherwise the
    # client would show "page 1 of 5" for a search with one match.
    total = (
        db.scalar(select(func.count()).select_from(Invoice).where(*conditions)) or 0
    )

    query = (
        select(Invoice)
        .where(*conditions)
        .order_by(Invoice.created_at.desc(), Invoice.id.desc())
    )
    if limit is not None:
        query = query.limit(limit).offset(offset)

    return list(db.scalars(query).all()), total


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


def resolve_invoice(
    db: Session,
    invoice_id: int,
    status: str,
) -> Invoice | None:
    """Approve or reject an invoice that is waiting for review.

    Returns None when the invoice does not exist, so the caller can answer 404.
    Raises InvoiceStateError when the transition is not allowed, so the caller
    can answer 409 rather than silently overwriting an already-final status.
    """
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        return None

    if invoice.status not in RESOLVABLE_FROM:
        raise InvoiceStateError(
            f"Invoice {invoice_id} is '{invoice.status}', so it cannot be resolved. "
            f"Only invoices in '{STATUS_NEEDS_REVIEW}' can be approved or rejected."
        )

    invoice.status = status
    db.commit()
    db.refresh(invoice)
    return invoice


def correct_invoice(
    db: Session,
    invoice_id: int,
    corrections: dict[str, object],
) -> Invoice | None:
    """Overwrite the header fields a human corrected, then re-judge the invoice.

    `corrections` holds only the fields the caller sent. The line items are not
    editable here: they are the evidence behind the subtotal, so the reviewer
    fixes the header to match them (or rejects the document).

    The warnings are recomputed from the corrected numbers instead of being
    cleared, because a stale "total is 500.00" next to a total of 110.00 would
    be a lie. When nothing is left to complain about, the invoice stops asking
    for review and becomes a normal extracted invoice.
    """
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        return None

    if invoice.status not in CORRECTABLE_FROM:
        raise InvoiceStateError(
            f"Invoice {invoice_id} is '{invoice.status}', so its fields cannot be "
            f"corrected. Only invoices in '{STATUS_NEEDS_REVIEW}' can be edited."
        )

    for field_name, value in corrections.items():
        setattr(invoice, field_name, value)

    previous_issues = list(invoice.issues)

    issues = reconcile_issues(
        subtotal=invoice.subtotal,
        tax=invoice.tax_amount,
        total=invoice.total_amount,
        item_amounts=[item.amount for item in invoice.line_items],
    )

    invoice.issues = issues
    invoice.status = STATUS_NEEDS_REVIEW if issues else STATUS_EXTRACTED

    # What the extractor originally complained about stays auditable, even
    # though it no longer describes the numbers on screen. setdefault keeps the
    # very first list if the invoice is corrected again.
    if previous_issues:
        raw = dict(invoice.raw_extraction or {})
        raw.setdefault("original_issues", previous_issues)
        invoice.raw_extraction = raw

    db.commit()
    db.refresh(invoice)
    return invoice
