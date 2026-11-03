import pytest

from app.schemas.extraction import InvoiceExtraction
from app.services.prompt_loader import build_extraction_prompt, load_prompt


def test_prompt_template_exists_and_has_a_slot() -> None:
    template = load_prompt("extract_invoice")

    assert "{invoice_text}" in template
    assert "never invent" in template.lower()


def test_build_extraction_prompt_substitutes_document_text() -> None:
    prompt = build_extraction_prompt("Total Due: NPR 6130.25")

    assert "Total Due: NPR 6130.25" in prompt
    assert "{invoice_text}" not in prompt


def test_schema_is_json_serialisable_for_gemini() -> None:
    schema = InvoiceExtraction.model_json_schema()

    assert schema["type"] == "object"
    assert "vendor_name" in schema["properties"]
    # Amounts must be strings, so JSON float decoding cannot corrupt money.
    assert schema["properties"]["total_amount"]["anyOf"][0]["type"] == "string"


def test_schema_accepts_empty_model_output() -> None:
    extraction = InvoiceExtraction.model_validate({})

    assert extraction.vendor_name is None
    assert extraction.line_items == []
    assert extraction.notes == []


def test_build_prompt_rejects_template_without_slot(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.prompt_loader.load_prompt",
        lambda name: "no placeholder here",
    )

    with pytest.raises(ValueError):
        build_extraction_prompt("text")
