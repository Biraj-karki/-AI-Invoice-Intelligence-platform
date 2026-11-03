from types import SimpleNamespace

import pytest

from app.services import gemini_service
from app.services.gemini_service import GeminiError, extract_invoice

VALID_PAYLOAD = """
{
  "vendor_name": "Acme Supplies",
  "invoice_number": "INV-2026-0042",
  "invoice_date": "2026-10-15",
  "currency": "NPR",
  "subtotal": "5425.00",
  "tax_amount": "705.25",
  "total_amount": "6130.25",
  "line_items": [
    {"description": "Steel Bracket 40mm", "quantity": "12", "unit_price": "250.00", "amount": "3000.00"}
  ],
  "notes": []
}
"""


class _FakeClient:
    """Replays a scripted sequence of responses or exceptions."""

    def __init__(self, *outcomes: object) -> None:
        self.outcomes = list(outcomes) or [VALID_PAYLOAD]
        self.calls: list[dict] = []
        self.interactions = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(output_text=outcome)


def test_extract_invoice_parses_model_output() -> None:
    client = _FakeClient()

    result = extract_invoice("some invoice text", client=client, fallback_models=[])

    assert result.vendor_name == "Acme Supplies"
    assert result.total_amount == "6130.25"
    assert result.line_items[0].quantity == "12"


def test_extract_invoice_sends_schema_and_prompt() -> None:
    client = _FakeClient()

    extract_invoice("Total Due: NPR 6130.25", client=client, fallback_models=[])

    call = client.calls[0]
    assert call["response_format"]["mime_type"] == "application/json"
    assert call["response_format"]["schema"]["properties"]["total_amount"]
    assert "Total Due: NPR 6130.25" in call["input"]


def test_extract_invoice_wraps_api_failures() -> None:
    client = _FakeClient(RuntimeError("invalid argument"))

    with pytest.raises(GeminiError, match="invalid argument"):
        extract_invoice("text", client=client, fallback_models=[])


def test_extract_invoice_falls_back_when_the_primary_model_is_overloaded() -> None:
    client = _FakeClient(
        RuntimeError("Error code: 503 - service_unavailable"),
        VALID_PAYLOAD,
    )

    result = extract_invoice(
        "text",
        client=client,
        model="gemini-3.8-flash",
        fallback_models=["gemini-3.6-flash"],
    )

    assert result.total_amount == "6130.25"
    assert [call["model"] for call in client.calls] == [
        "gemini-3.8-flash",
        "gemini-3.6-flash",
    ]


def test_extract_invoice_does_not_fall_back_on_credential_errors() -> None:
    client = _FakeClient(RuntimeError("401 API key not valid"))

    with pytest.raises(GeminiError, match="401"):
        extract_invoice(
            "text",
            client=client,
            model="gemini-3.8-flash",
            fallback_models=["gemini-3.6-flash"],
        )

    assert len(client.calls) == 1


def test_extract_invoice_reports_when_every_model_is_down() -> None:
    client = _FakeClient(
        RuntimeError("503 service_unavailable"),
        RuntimeError("503 service_unavailable"),
    )

    with pytest.raises(GeminiError, match="503"):
        extract_invoice(
            "text",
            client=client,
            model="gemini-3.8-flash",
            fallback_models=["gemini-3.6-flash"],
        )


def test_extract_invoice_rejects_output_that_breaks_the_schema() -> None:
    client = _FakeClient('{"total_amount": {"unexpected": "object"}}')

    with pytest.raises(GeminiError, match="does not match"):
        extract_invoice("text", client=client, fallback_models=[])


def test_extract_invoice_rejects_empty_response() -> None:
    client = _FakeClient(None)

    with pytest.raises(GeminiError, match="empty response"):
        extract_invoice("text", client=client, fallback_models=[])


def test_extract_invoice_rejects_empty_text() -> None:
    with pytest.raises(GeminiError, match="No text to extract"):
        extract_invoice("   ")


def test_candidate_models_are_deduplicated() -> None:
    assert gemini_service._candidate_models("a", ["b", "a", ""]) == ["a", "b"]


def test_extract_invoice_requires_a_key_when_no_client_is_injected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        gemini_service,
        "get_settings",
        lambda: SimpleNamespace(
            gemini_api_key="",
            gemini_model="gemini-3.6-flash",
            gemini_fallback_list=[],
        ),
    )

    with pytest.raises(GeminiError, match="not configured"):
        extract_invoice("text")
