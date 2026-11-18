from app.models import Invoice

COLLECTION = "/api/v1/invoices"


def _add(db, status: str, vendor: str = "ACME", number: str = "INV-1") -> Invoice:
    invoice = Invoice(
        vendor_name=vendor,
        invoice_number=number,
        status=status,
        currency="NPR",
        total_amount="100.00",
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def test_status_filter_returns_only_that_state(api_client, db_session) -> None:
    review = _add(db_session, "review", number="INV-REVIEW")
    _add(db_session, "extracted", number="INV-EXTRACTED")
    _add(db_session, "approved", number="INV-APPROVED")

    response = api_client.get(COLLECTION, params={"status": "review"})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [review.id]


def test_total_counts_the_filtered_set_not_the_table(api_client, db_session) -> None:
    for index in range(3):
        _add(db_session, "approved", number=f"INV-A{index}")
    _add(db_session, "review", number="INV-R0")

    body = api_client.get(COLLECTION, params={"status": "approved"}).json()

    # Three approved rows, so the pager must say "of 3", not "of 4".
    assert body["total"] == 3
    assert len(body["items"]) == 3


def test_filter_and_search_combine(api_client, db_session) -> None:
    acme_review = _add(db_session, "review", vendor="ACME", number="INV-1")
    _add(db_session, "review", vendor="Himalayan Mart", number="INV-2")
    _add(db_session, "approved", vendor="ACME", number="INV-3")

    body = api_client.get(
        COLLECTION,
        params={"q": "acme", "status": "review"},
    ).json()

    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [acme_review.id]


def test_unknown_status_is_rejected(api_client) -> None:
    # A typo must be a loud 422, not a silently empty list.
    response = api_client.get(COLLECTION, params={"status": "aproved"})

    assert response.status_code == 422


def test_omitting_status_returns_every_state(api_client, db_session) -> None:
    _add(db_session, "review", number="INV-1")
    _add(db_session, "approved", number="INV-2")
    _add(db_session, "failed", number="INV-3")

    body = api_client.get(COLLECTION).json()

    assert body["total"] == 3
