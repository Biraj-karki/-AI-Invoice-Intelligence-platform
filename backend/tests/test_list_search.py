from app.models import Invoice

COLLECTION = "/api/v1/invoices"


def _add(db, vendor: str | None, number: str | None) -> Invoice:
    invoice = Invoice(
        vendor_name=vendor,
        invoice_number=number,
        status="extracted",
        currency="NPR",
        total_amount="100.00",
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def _search(api_client, q: str, **params):
    return api_client.get(COLLECTION, params={"q": q, **params})


def test_search_matches_vendor_case_insensitively(api_client, db_session) -> None:
    acme = _add(db_session, "ACME SUPPLIES PVT. LTD.", "INV-1")
    _add(db_session, "Himalayan Office Mart", "INV-2")

    response = _search(api_client, "acme")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [acme.id]


def test_search_matches_invoice_number(api_client, db_session) -> None:
    wanted = _add(db_session, "Himalayan Office Mart", "INV-2026-0042")
    _add(db_session, "ACME SUPPLIES PVT. LTD.", "INV-2026-0099")

    body = _search(api_client, "0042").json()

    assert body["total"] == 1
    assert body["items"][0]["id"] == wanted.id


def test_search_is_a_contains_match(api_client, db_session) -> None:
    _add(db_session, "Kathmandu Print House", "KTM-1")

    # A term from the middle of the vendor name still matches.
    assert _search(api_client, "print").json()["total"] == 1


def test_search_treats_wildcards_as_literal_text(api_client, db_session) -> None:
    percent = _add(db_session, "Discount 50% Store", "PCT-1")
    underscore = _add(db_session, "ACME_1", "US-1")
    _add(db_session, "ACME-1", "US-2")

    # "%" must not behave like "match anything".
    percent_body = _search(api_client, "%").json()
    assert percent_body["total"] == 1
    assert percent_body["items"][0]["id"] == percent.id

    # "_" must not behave like "any single character".
    underscore_body = _search(api_client, "E_1").json()
    assert underscore_body["total"] == 1
    assert underscore_body["items"][0]["id"] == underscore.id


def test_blank_search_is_the_same_as_no_search(api_client, db_session) -> None:
    _add(db_session, "ACME SUPPLIES PVT. LTD.", "INV-1")
    _add(db_session, "Himalayan Office Mart", "INV-2")

    assert _search(api_client, "   ").json()["total"] == 2
    assert api_client.get(COLLECTION).json()["total"] == 2


def test_total_reflects_the_search_not_the_whole_table(
    api_client, db_session
) -> None:
    for index in range(3):
        _add(db_session, "ACME SUPPLIES PVT. LTD.", f"ACME-{index}")
    _add(db_session, "Himalayan Office Mart", "HOM-1")

    body = _search(api_client, "acme", limit=2, offset=0).json()

    # Two rows on the page, but three matches in total.
    assert len(body["items"]) == 2
    assert body["total"] == 3
    assert body["limit"] == 2
    assert body["offset"] == 0


def test_pagination_walks_through_the_filtered_results(
    api_client, db_session
) -> None:
    ids = [_add(db_session, "ACME SUPPLIES PVT. LTD.", f"ACME-{i}").id for i in range(3)]
    _add(db_session, "Himalayan Office Mart", "HOM-1")

    first = _search(api_client, "acme", limit=2, offset=0).json()
    second = _search(api_client, "acme", limit=2, offset=2).json()

    # Newest first, and the second page holds only the leftover match.
    assert [item["id"] for item in first["items"]] == [ids[2], ids[1]]
    assert [item["id"] for item in second["items"]] == [ids[0]]
    assert second["total"] == 3


def test_search_with_no_matches_is_an_empty_page(api_client, db_session) -> None:
    _add(db_session, "ACME SUPPLIES PVT. LTD.", "INV-1")

    body = _search(api_client, "nothing-like-this").json()

    assert body["items"] == []
    assert body["total"] == 0


def test_overlong_search_is_rejected(api_client) -> None:
    response = api_client.get(COLLECTION, params={"q": "x" * 101})

    assert response.status_code == 422
