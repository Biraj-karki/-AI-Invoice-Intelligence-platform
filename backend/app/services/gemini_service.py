import logging

from google import genai
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.schemas.extraction import InvoiceExtraction
from app.services.prompt_loader import build_extraction_prompt

logger = logging.getLogger(__name__)

RETRYABLE_MARKERS = (
    "503",
    "429",
    "service_unavailable",
    "unavailable",
    "high demand",
    "overloaded",
    "rate limit",
)


class GeminiError(Exception):
    """The extraction call failed or returned unusable output."""


def _response_format() -> dict:
    return {
        "type": "text",
        "mime_type": "application/json",
        "schema": InvoiceExtraction.model_json_schema(),
    }


def _build_client(settings: Settings) -> genai.Client:
    """No hidden SDK retries: our own model fallback chain handles overload."""
    return genai.Client(
        api_key=settings.gemini_api_key,
        http_options={
            "timeout": int(settings.gemini_timeout_seconds * 1000),  # milliseconds
            "retry_options": {"attempts": 1},
        },
    )


def _candidate_models(primary: str, fallbacks: list[str]) -> list[str]:
    ordered: list[str] = []
    for model in [primary, *fallbacks]:
        if model and model not in ordered:
            ordered.append(model)
    return ordered


def _is_retryable(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in RETRYABLE_MARKERS)


def extract_invoice(
    text: str,
    *,
    client: object | None = None,
    model: str | None = None,
    fallback_models: list[str] | None = None,
) -> InvoiceExtraction:
    """Send invoice text to Gemini and return schema-validated output.

    `client` is injectable so tests can run without the network.
    """
    settings = get_settings()

    if not text.strip():
        raise GeminiError(
            "No text to extract. The PDF may be a scan without a text layer."
        )

    if client is None:
        if not settings.gemini_api_key:
            raise GeminiError("GEMINI_API_KEY is not configured.")
        client = _build_client(settings)

    models = _candidate_models(
        model or settings.gemini_model,
        settings.gemini_fallback_list if fallback_models is None else fallback_models,
    )
    prompt = build_extraction_prompt(text)

    for position, candidate in enumerate(models):
        has_fallback_left = position < len(models) - 1
        try:
            interaction = client.interactions.create(
                model=candidate,
                input=prompt,
                response_format=_response_format(),
            )
        except Exception as exc:
            if has_fallback_left and _is_retryable(exc):
                logger.warning("Model %s unavailable (%s); trying next.", candidate, exc)
                continue
            raise GeminiError(f"Gemini request failed on {candidate}: {exc}") from exc

        raw = getattr(interaction, "output_text", None)
        if not raw:
            raise GeminiError(f"Gemini ({candidate}) returned an empty response.")

        try:
            return InvoiceExtraction.model_validate_json(raw)
        except ValidationError as exc:
            logger.warning("Gemini output did not match the schema: %s", raw[:500])
            raise GeminiError(
                f"Gemini ({candidate}) returned JSON that does not match the invoice schema."
            ) from exc

    raise GeminiError("All configured Gemini models are unavailable right now.")
