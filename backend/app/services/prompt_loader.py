from pathlib import Path

PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"


def load_prompt(name: str) -> str:
    """Read a prompt template from app/prompts/<name>.txt."""
    return (PROMPT_DIR / f"{name}.txt").read_text(encoding="utf-8")


def build_extraction_prompt(invoice_text: str) -> str:
    template = load_prompt("extract_invoice")
    if "{invoice_text}" not in template:
        raise ValueError("extract_invoice prompt is missing the {invoice_text} slot")
    return template.replace("{invoice_text}", invoice_text)
