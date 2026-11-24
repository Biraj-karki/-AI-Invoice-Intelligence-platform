from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Invoice, LineItem, User
from app.services.normalize import NormalizedInvoice, reconcile_issues

STATUS_EXTRACTED = "extracted"
STATUS_NEEDS_REVIEW = "review"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"
DUPLICATE_ISSUE = "Possible duplicate detected."

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


def _conditions(term: str, status: str | None, owner_id: int) -> list:
    # Ownership is not optional: it is the first condition on every read, so a
    # forgotten filter cannot leak another account's invoice.
    conditions = [Invoice.owner_id == owner_id]

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


def get_invoice(db: Session, invoice_id: int, owner_id: int) -> Invoice | None:
    """One invoice, but only if the caller owns it.

    Returning None for someone else's invoice is deliberate: the API then
    answers 404, the same as for an id that never existed, so one account
    cannot probe for the existence of another account's documents.
    """
    return db.scalar(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.owner_id == owner_id,
        )
    )


def _find_duplicate(
    db: Session,
    *,
    owner_id: int,
    normalized: NormalizedInvoice,
    content_hash: str,
) -> tuple[int, str] | None:
    """Find the earliest same-account match, preferring identical file bytes."""
    duplicate = db.scalar(
        select(Invoice)
        .where(
            Invoice.owner_id == owner_id,
            Invoice.content_hash == content_hash,
        )
        .order_by(Invoice.id)
        .limit(1)
    )
    if duplicate is not None:
        return duplicate.duplicate_of_id or duplicate.id, "same_file"

    vendor_name = (normalized.vendor_name or "").strip()
    invoice_number = (normalized.invoice_number or "").strip()
    if not vendor_name or not invoice_number:
        return None

    duplicate = db.scalar(
        select(Invoice)
        .where(
            Invoice.owner_id == owner_id,
            func.lower(func.trim(Invoice.vendor_name)) == vendor_name.lower(),
            func.lower(func.trim(Invoice.invoice_number))
            == invoice_number.lower(),
        )
        .order_by(Invoice.id)
        .limit(1)
    )
    if duplicate is None:
        return None

    return duplicate.duplicate_of_id or duplicate.id, "invoice_details"


def list_invoices(
    db: Session,
    *,
    owner_id: int,
    term: str = "",
    status: str | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> tuple[list[Invoice], int]:
    """Return one page of the caller's invoices plus the filtered total.

    The list endpoint and the CSV export both go through here, so a filter can
    never mean one thing on screen and another in the downloaded file.
    `limit=None` means "every match", which is what an export wants.
    """
    conditions = _conditions(term, status, owner_id)

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
    owner_id: int,
    normalized: NormalizedInvoice,
    raw_extraction: dict,
    source_filename: str | None,
    stored_path: str | None,
    storage_provider: str,
    content_hash: str,
) -> Invoice:
    """Persist one invoice and its line items in a single transaction.

    A single commit means a failure cannot leave an invoice without its rows.
    """
    # Serialize uploads for one account so simultaneous n8n retries cannot
    # both miss a match that the other request is about to insert.
    db.execute(select(User.id).where(User.id == owner_id).with_for_update())
    duplicate = _find_duplicate(
        db,
        owner_id=owner_id,
        normalized=normalized,
        content_hash=content_hash,
    )
    duplicate_of_id = duplicate[0] if duplicate is not None else None
    duplicate_match = duplicate[1] if duplicate is not None else None
    issues = list(normalized.issues)
    if duplicate_of_id is not None and duplicate_match is not None:
        issues.append(DUPLICATE_ISSUE)

    invoice = Invoice(
        owner_id=owner_id,
        content_hash=content_hash,
        duplicate_of_id=duplicate_of_id,
        duplicate_match=duplicate_match,
        vendor_name=normalized.vendor_name,
        invoice_number=normalized.invoice_number,
        invoice_date=normalized.invoice_date,
        currency=normalized.currency,
        subtotal=normalized.subtotal,
        tax_amount=normalized.tax_amount,
        total_amount=normalized.total_amount,
        status=STATUS_NEEDS_REVIEW if issues else STATUS_EXTRACTED,
        source_filename=source_filename,
        stored_path=stored_path,
        storage_provider=storage_provider,
        issues=issues,
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
    *,
    owner_id: int,
    invoice_id: int,
    status: str,
) -> Invoice | None:
    """Approve or reject an invoice that is waiting for review.

    Returns None when the invoice does not exist or belongs to another account,
    so the caller can answer 404. Raises InvoiceStateError when the transition
    is not allowed, so the caller can answer 409 rather than silently
    overwriting an already-final status.
    """
    invoice = get_invoice(db, invoice_id, owner_id)
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
    *,
    owner_id: int,
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
    invoice = get_invoice(db, invoice_id, owner_id)
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
    if invoice.duplicate_of_id is not None and invoice.duplicate_match is not None:
        issues.append(DUPLICATE_ISSUE)

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
