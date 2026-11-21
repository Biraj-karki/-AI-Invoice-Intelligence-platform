import csv
import io

from app.models import Invoice
from app.services.csv_service import COLUMNS

COLLECTION = "/api/v1/invoices"
EXPORT = f"{COLLECTION}/export.csv"


def _add(
    db,
    *,
    vendor: str = "ACME",
    number: str = "INV-1",
    status: str = "extracted",
    total: str = "6130.25",
) -> Invoice:
    invoice = Invoice(
        owner_id=1,
        vendor_name=vendor,
        invoice_number=number,
        invoice_date="2026-10-15",
        status=status,
        currency="NPR",
        subtotal="5425.00",
        tax_amount="705.25",
        total_amount=total,
        source_filename="sample_invoice.pdf",
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def _rows(response) -> list[list[str]]:
    # utf-8-sig drops the BOM that makes Excel read the file correctly.
    text = response.content.decode("utf-8-sig")
    return list(csv.reader(io.StringIO(text)))


def test_export_returns_a_csv_with_a_header_and_one_row_per_invoice(
    api_client, db_session
) -> None:
    first = _add(db_session, vendor="ACME", number="INV-1")
    second = _add(db_session, vendor="Himalayan Mart", number="INV-2")

    response = api_client.get(EXPORT)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"].startswith("attachment;")
    assert ".csv" in response.headers["content-disposition"]

    # Excel needs the BOM to treat the bytes as UTF-8 rather than ANSI.
    assert response.content.startswith(b"\xef\xbb\xbf")

    rows = _rows(response)
    assert rows[0] == list(COLUMNS)
    # Newest first, matching the list.
    assert [row[0] for row in rows[1:]] == [str(second.id), str(first.id)]


def test_export_keeps_money_as_exact_decimal_strings(api_client, db_session) -> None:
    _add(db_session, total="6130.25")

    rows = _rows(api_client.get(EXPORT))
    row = dict(zip(rows[0], rows[1]))

    assert row["total_amount"] == "6130.25"
    assert row["subtotal"] == "5425.00"
    assert row["currency"] == "NPR"
    assert row["invoice_date"] == "2026-10-15"


def test_export_honours_the_status_filter(api_client, db_session) -> None:
    _add(db_session, status="approved", number="INV-A")
    _add(db_session, status="review", number="INV-R")

    rows = _rows(api_client.get(EXPORT, params={"status": "review"}))

    assert len(rows) == 2
    assert rows[1][COLUMNS.index("invoice_number")] == "INV-R"


def test_export_honours_the_search_term(api_client, db_session) -> None:
    _add(db_session, vendor="ACME Supplies", number="INV-1")
    _add(db_session, vendor="Himalayan Mart", number="INV-2")

    rows = _rows(api_client.get(EXPORT, params={"q": "acme"}))

    assert len(rows) == 2
    assert rows[1][COLUMNS.index("vendor_name")] == "ACME Supplies"


def test_export_includes_every_match_not_just_the_first_page(
    api_client, db_session
) -> None:
    for index in range(25):
        _add(db_session, number=f"INV-{index:03d}")

    rows = _rows(api_client.get(EXPORT))

    # The list endpoint would have stopped at 10 or 20; an export must not.
    assert len(rows) - 1 == 25


def test_export_neutralises_spreadsheet_formulas(api_client, db_session) -> None:
    # A vendor name is just text from a PDF. Excel would execute a leading "=".
    _add(db_session, vendor="=HYPERLINK(\"http://evil\",\"click\")")

    rows = _rows(api_client.get(EXPORT))
    vendor = rows[1][COLUMNS.index("vendor_name")]

    assert vendor.startswith("'=")
    # The original text is still readable, just no longer a formula.
    assert "HYPERLINK" in vendor


def test_export_requires_a_signed_in_user(anonymous_client) -> None:
    response = anonymous_client.get(EXPORT)

    assert response.status_code == 401


def test_export_is_not_mistaken_for_an_invoice_id(api_client) -> None:
    # "/export.csv" sits before "/{invoice_id}" in the router; if the order were
    # wrong this would be a 404 or a 422 from parsing the id.
    response = api_client.get(EXPORT)

    assert response.status_code == 200
