from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models import Invoice

STATS = "/api/v1/invoices/stats"


def _add(
    db,
    *,
    vendor: str | None = "Acme",
    amount: str = "100.00",
    currency: str | None = "NPR",
    invoice_date: date | None = date(2026, 10, 1),
    status: str = "extracted",
) -> Invoice:
    invoice = Invoice(
        vendor_name=vendor,
        currency=currency,
        total_amount=Decimal(amount),
        invoice_date=invoice_date,
        status=status,
    )
    db.add(invoice)
    db.commit()
    return invoice


@pytest.fixture(autouse=True)
def _no_leaked_rows(db_session):
    """Every test starts from an empty test schema."""
    count = db_session.scalar(select(func.count()).select_from(Invoice))
    assert count == 0
    yield


def test_stats_on_an_empty_database(api_client) -> None:
    response = api_client.get(STATS)

    assert response.status_code == 200
    body = response.json()
    assert body["currencies"] == []
    assert body["excluded_count"] == 0
    assert body["undated_count"] == 0


def test_stats_groups_by_currency_and_vendor(api_client, db_session) -> None:
    _add(db_session, vendor="Acme", amount="100.00", invoice_date=date(2026, 10, 1))
    _add(db_session, vendor="Acme", amount="50.00", invoice_date=date(2026, 10, 20))
    _add(db_session, vendor="Beta", amount="200.00", invoice_date=date(2026, 11, 2))
    _add(
        db_session,
        vendor="Acme",
        amount="10.00",
        currency="USD",
        invoice_date=date(2026, 10, 5),
    )

    body = api_client.get(STATS).json()

    # Two currencies, biggest spend first. They are never added together.
    assert [c["currency"] for c in body["currencies"]] == ["NPR", "USD"]

    npr = body["currencies"][0]
    assert npr["invoice_count"] == 3
    assert npr["total_amount"] == "350.00"

    vendors = {v["vendor_name"]: v for v in npr["by_vendor"]}
    assert vendors["Acme"]["invoice_count"] == 2
    assert vendors["Acme"]["total_amount"] == "150.00"
    assert vendors["Beta"]["total_amount"] == "200.00"
    # Vendors are ordered by spend, so the largest bar comes first.
    assert npr["by_vendor"][0]["vendor_name"] == "Beta"

    months = {m["month"]: m for m in npr["by_month"]}
    assert months["2026-10"]["invoice_count"] == 2
    assert months["2026-10"]["total_amount"] == "150.00"
    assert months["2026-11"]["total_amount"] == "200.00"
    # Months come back in chronological order for the chart's x-axis.
    assert [m["month"] for m in npr["by_month"]] == ["2026-10", "2026-11"]

    usd = body["currencies"][1]
    assert usd["total_amount"] == "10.00"
    assert usd["currency"] == "USD"


def test_invoices_needing_review_are_excluded_from_the_numbers(
    api_client, db_session
) -> None:
    _add(db_session, amount="100.00")
    _add(db_session, amount="500.00", status="review")
    _add(db_session, amount="900.00", status="rejected")

    body = api_client.get(STATS).json()

    assert body["currencies"][0]["total_amount"] == "100.00"
    assert body["currencies"][0]["invoice_count"] == 1
    assert body["excluded_count"] == 2


def test_approved_invoices_are_counted(api_client, db_session) -> None:
    _add(db_session, amount="100.00")
    _add(db_session, amount="250.00", status="approved")

    body = api_client.get(STATS).json()

    assert body["currencies"][0]["total_amount"] == "350.00"
    assert body["currencies"][0]["invoice_count"] == 2
    assert body["excluded_count"] == 0


def test_an_invoice_without_a_date_counts_but_has_no_month(
    api_client, db_session
) -> None:
    _add(db_session, amount="100.00", invoice_date=None)
    _add(db_session, amount="40.00", invoice_date=date(2026, 10, 9))

    body = api_client.get(STATS).json()

    assert body["undated_count"] == 1
    npr = body["currencies"][0]
    assert npr["total_amount"] == "140.00"
    assert [m["month"] for m in npr["by_month"]] == ["2026-10"]
    assert npr["by_month"][0]["total_amount"] == "40.00"


def test_missing_currency_and_vendor_get_readable_labels(
    api_client, db_session
) -> None:
    _add(db_session, vendor=None, currency=None, amount="12.50")

    body = api_client.get(STATS).json()

    assert body["currencies"][0]["currency"] == "UNKNOWN"
    assert body["currencies"][0]["by_vendor"][0]["vendor_name"] == "Unknown vendor"


def test_stats_is_not_parsed_as_an_invoice_id(api_client) -> None:
    """The /stats route must win over /{invoice_id}."""
    response = api_client.get(STATS)

    assert response.status_code == 200
