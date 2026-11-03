"""Generate the sample invoice PDF used by tests.

Run from backend/:  python scripts/generate_sample_invoice.py

Written by hand (no PDF library) so the fixture adds no runtime dependency.
Output: tests/fixtures/sample_invoice.pdf
"""

from __future__ import annotations

from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "sample_invoice.pdf"

# (x, y, font_size, text) - absolute position on a 595x842 (A4) page.
LINES: list[tuple[int, int, int, str]] = [
    (50, 800, 18, "ACME SUPPLIES PVT. LTD."),
    (50, 780, 10, "123 Market Street, Kathmandu, Nepal"),
    (50, 766, 10, "PAN: 601234567   |   billing@acmesupplies.example"),
    (50, 742, 16, "INVOICE"),
    (50, 716, 10, "Invoice Number: INV-2026-0042"),
    (50, 700, 10, "Invoice Date: 2026-10-15"),
    (50, 684, 10, "Due Date: 2026-11-14"),
    (50, 668, 10, "Bill To: Himalayan Traders, Lalitpur"),
    (50, 636, 11, "Description                    Qty     Unit Price      Amount"),
    (50, 620, 10, "Steel Bracket 40mm             12       250.00      3000.00"),
    (50, 604, 10, "Hex Bolt M8                    50        18.50       925.00"),
    (50, 588, 10, "Installation Service            1      1500.00      1500.00"),
    (50, 560, 10, "Subtotal: 5425.00"),
    (50, 544, 10, "Tax (13%): 705.25"),
    (50, 528, 11, "Total Due: NPR 6130.25"),
    (50, 496, 9, "Payment terms: due within 30 days. Thank you for your business."),
]


def escape_pdf_text(text: str) -> str:
    return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def build_content_stream() -> bytes:
    parts = []
    for x, y, size, text in LINES:
        parts.append(
            f"BT /F1 {size} Tf 1 0 0 1 {x} {y} Tm ({escape_pdf_text(text)}) Tj ET"
        )
    return "\n".join(parts).encode("latin-1")


def build_pdf() -> bytes:
    content = build_content_stream()

    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = []

    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{index} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_start = len(out)
    count = len(objects) + 1
    out += f"xref\n0 {count}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()

    out += b"trailer\n" + f"<< /Size {count} /Root 1 0 R >>\n".encode()
    out += b"startxref\n" + str(xref_start).encode() + b"\n%%EOF\n"
    return bytes(out)


if __name__ == "__main__":
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(build_pdf())
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes)")
