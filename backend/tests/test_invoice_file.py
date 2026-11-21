from pathlib import Path

import pytest

from app.models import Invoice
from app.services import pdf_service

FIXTURE = Path(__file__).parent / "fixtures" / "sample_invoice.pdf"


@pytest.fixture(autouse=True)
def uploads(tmp_path, monkeypatch) -> Path:
    """Point the service's upload directory at a throwaway folder."""
    monkeypatch.setattr(pdf_service, "UPLOAD_DIR", tmp_path)
    return tmp_path


def _invoice(db_session, stored_path: str | None) -> Invoice:
    invoice = Invoice(
        owner_id=1,
        vendor_name="ACME SUPPLIES PVT. LTD.",
        status="extracted",
        source_filename="sample invoice.pdf",
        stored_path=stored_path,
    )
    db_session.add(invoice)
    db_session.commit()
    db_session.refresh(invoice)
    return invoice


def test_serves_the_stored_pdf_inline(uploads, api_client, db_session) -> None:
    stored = uploads / "stored.pdf"
    stored.write_bytes(FIXTURE.read_bytes())
    invoice = _invoice(db_session, str(stored))

    response = api_client.get(f"/api/v1/invoices/{invoice.id}/file")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"].startswith("inline;")
    # Non-ASCII-safe filenames are percent-encoded by Starlette.
    assert "sample%20invoice.pdf" in response.headers["content-disposition"]
    assert response.content == FIXTURE.read_bytes()


def test_accepts_a_path_relative_to_the_backend(uploads, api_client, db_session, monkeypatch) -> None:
    """The dev database stores paths like "storage/uploads/x.pdf", not absolute."""
    stored = uploads / "relative.pdf"
    stored.write_bytes(FIXTURE.read_bytes())
    # A relative stored_path is resolved against BASE_DIR, so pretend the
    # throwaway upload dir *is* BASE_DIR for this test.
    monkeypatch.setattr("app.api.v1.invoices.BASE_DIR", uploads.parent)
    invoice = _invoice(db_session, f"{uploads.name}/relative.pdf")

    response = api_client.get(f"/api/v1/invoices/{invoice.id}/file")

    assert response.status_code == 200
    assert response.content == FIXTURE.read_bytes()


def test_unknown_invoice_is_404(api_client) -> None:
    response = api_client.get("/api/v1/invoices/999999/file")

    assert response.status_code == 404
    assert "does not exist" in response.json()["detail"]


def test_invoice_without_a_stored_path_is_404(api_client, db_session) -> None:
    invoice = _invoice(db_session, None)

    response = api_client.get(f"/api/v1/invoices/{invoice.id}/file")

    assert response.status_code == 404
    assert "No stored PDF" in response.json()["detail"]


def test_missing_file_on_disk_is_404(uploads, api_client, db_session) -> None:
    invoice = _invoice(db_session, str(uploads / "gone.pdf"))

    response = api_client.get(f"/api/v1/invoices/{invoice.id}/file")

    assert response.status_code == 404


def test_a_path_outside_the_upload_directory_is_refused(
    uploads, api_client, db_session
) -> None:
    outside = uploads.parent / "secret.txt"
    outside.write_text("not yours", encoding="utf-8")
    invoice = _invoice(db_session, str(outside))

    response = api_client.get(f"/api/v1/invoices/{invoice.id}/file")

    assert response.status_code == 404


def test_traversal_in_a_relative_path_is_refused(
    uploads, api_client, db_session, monkeypatch
) -> None:
    outside = uploads.parent / "secret.txt"
    outside.write_text("not yours", encoding="utf-8")
    # Resolve as the app would: BASE_DIR/<stored_path> escapes the upload dir.
    monkeypatch.setattr("app.api.v1.invoices.BASE_DIR", uploads.parent)
    invoice = _invoice(db_session, f"{uploads.name}/../secret.txt")

    response = api_client.get(f"/api/v1/invoices/{invoice.id}/file")

    assert response.status_code == 404


def test_a_directory_instead_of_a_file_is_404(uploads, api_client, db_session) -> None:
    folder = uploads / "not-a-pdf"
    folder.mkdir()
    invoice = _invoice(db_session, str(folder))

    response = api_client.get(f"/api/v1/invoices/{invoice.id}/file")

    assert response.status_code == 404
