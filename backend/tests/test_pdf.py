from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services import pdf_service

FIXTURE = Path(__file__).parent / "fixtures" / "sample_invoice.pdf"
ENDPOINT = "/api/v1/invoices/extract-text"


def test_extract_pages_reads_the_sample_invoice() -> None:
    pages = pdf_service.extract_pages(FIXTURE.read_bytes())

    assert len(pages) == 1
    assert "ACME SUPPLIES PVT. LTD." in pages[0]
    assert "INV-2026-0042" in pages[0]
    assert "NPR 6130.25" in pages[0]


def test_looks_like_pdf_checks_signature_not_extension() -> None:
    assert pdf_service.looks_like_pdf(b"%PDF-1.4\n...") is True
    assert pdf_service.looks_like_pdf(b"hello world") is False


def test_endpoint_rejects_non_pdf_bytes(api_client) -> None:
    response = api_client.post(
        ENDPOINT,
        files={"file": ("fake.pdf", b"this is plain text", "application/pdf")},
    )

    assert response.status_code == 400


def test_endpoint_rejects_empty_file(api_client) -> None:
    response = api_client.post(
        ENDPOINT,
        files={"file": ("empty.pdf", b"", "application/pdf")},
    )

    assert response.status_code == 400


def test_endpoint_extracts_text_and_stores_file(api_client, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(pdf_service, "UPLOAD_DIR", tmp_path)

    response = api_client.post(
        ENDPOINT,
        files={"file": ("sample_invoice.pdf", FIXTURE.read_bytes(), "application/pdf")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["page_count"] == 1
    assert body["character_count"] > 100
    assert "ACME SUPPLIES" in body["preview"]

    stored = list(tmp_path.glob("*.pdf"))
    assert len(stored) == 1
    assert stored[0].read_bytes() == FIXTURE.read_bytes()


def test_invoice_upload_uses_authenticated_cloudinary_storage(monkeypatch) -> None:
    captured: dict = {}

    def fake_upload(file, **options):
        captured.update(options)
        assert file.read() == FIXTURE.read_bytes()
        return {
            "public_id": options["public_id"],
            "resource_type": "raw",
            "type": "authenticated",
        }

    monkeypatch.setattr(
        pdf_service,
        "settings",
        SimpleNamespace(cloudinary_url="cloudinary://key:secret@example"),
    )
    monkeypatch.setattr(pdf_service, "_configure_cloudinary", lambda: None)
    monkeypatch.setattr(pdf_service.cloudinary.uploader, "upload", fake_upload)

    stored = pdf_service.save_invoice_upload(FIXTURE.read_bytes())

    assert stored.provider == "cloudinary"
    assert pdf_service.CLOUDINARY_PUBLIC_ID.fullmatch(stored.identifier)
    assert captured["resource_type"] == "raw"
    assert captured["type"] == "authenticated"
    assert captured["overwrite"] is False


def test_cloudinary_download_uses_a_short_lived_signed_url(monkeypatch) -> None:
    expected_id = "invoice-pdfs/0123456789abcdef0123456789abcdef.pdf"
    signed_options: dict = {}
    requested: dict = {}

    class DownloadResponse:
        content = FIXTURE.read_bytes()

        @staticmethod
        def raise_for_status() -> None:
            return None

    def signed_url(public_id, format, **options):
        signed_options.update(
            {"public_id": public_id, "format": format, **options}
        )
        return "https://private.example/signed-download"

    def get(url, **options):
        requested.update({"url": url, **options})
        return DownloadResponse()

    monkeypatch.setattr(
        pdf_service,
        "settings",
        SimpleNamespace(cloudinary_url="cloudinary://key:secret@example"),
    )
    monkeypatch.setattr(pdf_service, "_configure_cloudinary", lambda: None)
    monkeypatch.setattr(pdf_service.cloudinary.utils, "private_download_url", signed_url)
    monkeypatch.setattr(pdf_service.httpx, "get", get)

    data = pdf_service.read_cloudinary_upload(expected_id)

    assert data == FIXTURE.read_bytes()
    assert signed_options["resource_type"] == "raw"
    assert signed_options["type"] == "authenticated"
    assert signed_options["expires_at"] > 0
    assert requested["url"] == "https://private.example/signed-download"
    assert requested["follow_redirects"] is True


def test_cloudinary_refuses_asset_ids_outside_its_invoice_folder(monkeypatch) -> None:
    monkeypatch.setattr(
        pdf_service,
        "settings",
        SimpleNamespace(cloudinary_url="cloudinary://key:secret@example"),
    )
    monkeypatch.setattr(pdf_service, "_configure_cloudinary", lambda: None)

    with pytest.raises(pdf_service.InvalidStoredAsset):
        pdf_service.read_cloudinary_upload("other-folder/private.pdf")
