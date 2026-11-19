"""Turn invoice rows into a spreadsheet-friendly CSV file.

Kept out of the route so the formatting rules (column order, money precision,
formula escaping) can be tested without HTTP.
"""

import csv
import io
from collections.abc import Iterable

from app.models import Invoice

COLUMNS = (
    "id",
    "vendor_name",
    "invoice_number",
    "invoice_date",
    "currency",
    "subtotal",
    "tax_amount",
    "total_amount",
    "status",
    "source_filename",
    "created_at",
)

# Excel and Sheets treat a cell starting with one of these as a formula. A
# vendor called "=HYPERLINK(...)" must stay text, so it gets a leading quote,
# which spreadsheets strip on display.
_FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


def _cell(value: object) -> str:
    if value is None:
        return ""
    text = str(value)
    if text.startswith(_FORMULA_STARTS):
        return f"'{text}"
    return text


def invoices_to_csv(invoices: Iterable[Invoice]) -> str:
    """Return the whole document, including the UTF-8 BOM.

    The BOM is what makes Excel read the file as UTF-8 instead of mangling
    names with non-ASCII characters. Money stays a plain decimal string
    ("6130.25"), never a float, so no precision is lost on the way to a sheet.
    """
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(COLUMNS)

    for invoice in invoices:
        writer.writerow(
            [
                _cell(invoice.id),
                _cell(invoice.vendor_name),
                _cell(invoice.invoice_number),
                _cell(invoice.invoice_date),
                _cell(invoice.currency),
                _cell(invoice.subtotal),
                _cell(invoice.tax_amount),
                _cell(invoice.total_amount),
                _cell(invoice.status),
                _cell(invoice.source_filename),
                _cell(invoice.created_at),
            ]
        )

    return "\ufeff" + buffer.getvalue()
