"""Live Gemini call. Skips itself when no API key is configured.

Run explicitly:  pytest tests/test_gemini_live.py -v
"""

from decimal import Decimal
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.services import pdf_service
from app.services.gemini_service import extract_invoice
from app.services.normalize import normalize_invoice

FIXTURE = Path(__file__).parent / "fixtures" / "sample_invoice.pdf"

settings = get_settings()
requires_key = pytest.mark.skipif(
    not settings.gemini_api_key,
    reason="GEMINI_API_KEY is not configured in backend/.env",
)


@requires_key
def test_live_extraction_of_the_sample_invoice() -> None:
    text = "\n".join(pdf_service.extract_pages(FIXTURE.read_bytes()))

    extraction = extract_invoice(text)
    invoice = normalize_invoice(extraction)

    assert invoice.currency == "NPR"
    assert invoice.invoice_date is not None
    assert invoice.total_amount == Decimal("6130.25")
    assert invoice.subtotal == Decimal("5425.00")
    assert invoice.tax_amount == Decimal("705.25")
    assert len(invoice.line_items) == 3
    assert invoice.vendor_name is not None
    assert "ACME" in invoice.vendor_name.upper()
