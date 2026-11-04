import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, getInvoice, resolveInvoice } from "@/lib/api";
import type { InvoiceDetail as InvoiceDetailData } from "@/lib/types";

import InvoiceDetail from "./InvoiceDetail";

// Mock only the two functions this component calls. ApiError stays real so the
// component's `instanceof` checks still behave as they do in the app.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getInvoice: vi.fn(),
    resolveInvoice: vi.fn(),
  };
});

function makeInvoice(
  overrides: Partial<InvoiceDetailData> = {},
): InvoiceDetailData {
  return {
    id: 7,
    vendor_name: "ACME SUPPLIES PVT. LTD.",
    invoice_number: "INV-2026-0042",
    invoice_date: "2026-10-15",
    currency: "NPR",
    total_amount: "6130.25",
    status: "extracted",
    created_at: "2026-11-04T09:52:37.277193+05:45",
    subtotal: "5425.00",
    tax_amount: "705.25",
    source_filename: "sample_invoice.pdf",
    stored_path: "storage/uploads/abc123.pdf",
    issues: [],
    line_items: [
      {
        id: 1,
        description: "Steel Bracket 40mm",
        quantity: "2.000",
        unit_price: "2712.50",
        amount: "5425.00",
      },
    ],
    ...overrides,
  };
}

const REVIEW_ISSUE =
  "Line items sum to 50.00 but the subtotal is 100.00 (difference -50.00).";

beforeEach(() => {
  vi.mocked(getInvoice).mockReset();
  vi.mocked(resolveInvoice).mockReset();
});

describe("InvoiceDetail — loading and failure states", () => {
  it("shows a loading message while the request is in flight", () => {
    vi.mocked(getInvoice).mockReturnValue(new Promise(() => {}));

    render(<InvoiceDetail invoiceId="7" />);

    expect(screen.getByText("Loading invoice…")).toBeInTheDocument();
  });

  it("does not call the API for a non-numeric id", () => {
    render(<InvoiceDetail invoiceId="abc" />);

    expect(screen.getByText("Invoice not found")).toBeInTheDocument();
    expect(screen.getByText("abc")).toBeInTheDocument();
    expect(getInvoice).not.toHaveBeenCalled();
  });

  it("reports a 404 as not found, not as a crash", async () => {
    vi.mocked(getInvoice).mockRejectedValue(
      new ApiError("Invoice 999 does not exist.", 404),
    );

    render(<InvoiceDetail invoiceId="999" />);

    expect(await screen.findByText("Invoice not found")).toBeInTheDocument();
    expect(screen.getByText("999")).toBeInTheDocument();
    // A 404 is a normal answer; the error panel would be the wrong story.
    expect(screen.queryByText("Could not load this invoice")).toBeNull();
  });

  it("shows the server's message for other failures and retries", async () => {
    const user = userEvent.setup();
    vi.mocked(getInvoice)
      .mockRejectedValueOnce(new ApiError("Database is on fire.", 500))
      .mockResolvedValueOnce(makeInvoice());

    render(<InvoiceDetail invoiceId="7" />);

    expect(
      await screen.findByText("Could not load this invoice"),
    ).toBeInTheDocument();
    expect(screen.getByText("Database is on fire.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", {
        name: "ACME SUPPLIES PVT. LTD.",
      }),
    ).toBeInTheDocument();
    expect(getInvoice).toHaveBeenCalledTimes(2);
  });
});

describe("InvoiceDetail — a loaded invoice", () => {
  it("renders the header, money, line items and source file", async () => {
    vi.mocked(getInvoice).mockResolvedValue(makeInvoice());

    render(<InvoiceDetail invoiceId="7" />);

    expect(
      await screen.findByRole("heading", { name: "ACME SUPPLIES PVT. LTD." }),
    ).toBeInTheDocument();
    expect(getInvoice).toHaveBeenCalledWith(7);
    expect(screen.getByText("INV-2026-0042")).toBeInTheDocument();
    expect(screen.getByText("extracted")).toBeInTheDocument();

    // Money keeps its currency and grouping, from strings only. Scoped to each
    // totals cell: the line-item amount can legitimately equal the subtotal.
    expect(screen.getByText("Subtotal").parentElement).toHaveTextContent(
      "5,425.00 NPR",
    );
    expect(screen.getByText("Tax").parentElement).toHaveTextContent(
      "705.25 NPR",
    );
    expect(screen.getByText("Total").parentElement).toHaveTextContent(
      "6,130.25 NPR",
    );

    const row = screen.getByText("Steel Bracket 40mm").closest("tr");
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent("2"); // "2.000" trimmed
    expect(row).toHaveTextContent("2,712.50 NPR");

    expect(screen.getByText("sample_invoice.pdf")).toBeInTheDocument();
    // Timestamp is cut to its date part.
    expect(screen.getByText(/on 2026-11-04/)).toBeInTheDocument();
  });

  it("explains an empty line-item list instead of rendering an empty table", async () => {
    vi.mocked(getInvoice).mockResolvedValue(makeInvoice({ line_items: [] }));

    render(<InvoiceDetail invoiceId="7" />);

    expect(
      await screen.findByText(
        "No line items were extracted from this invoice.",
      ),
    ).toBeInTheDocument();
  });

  it("falls back to readable text for missing optional fields", async () => {
    vi.mocked(getInvoice).mockResolvedValue(
      makeInvoice({
        vendor_name: null,
        invoice_number: null,
        invoice_date: null,
        currency: null,
        subtotal: null,
        tax_amount: null,
        total_amount: null,
        source_filename: null,
      }),
    );

    render(<InvoiceDetail invoiceId="7" />);

    expect(
      await screen.findByRole("heading", { name: "Unknown vendor" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No invoice number")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4); // date + 3 amounts
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });
});

describe("InvoiceDetail — resolving a review invoice", () => {
  it("shows the issues and offers Approve / Reject", async () => {
    vi.mocked(getInvoice).mockResolvedValue(
      makeInvoice({ status: "review", issues: [REVIEW_ISSUE] }),
    );

    render(<InvoiceDetail invoiceId="7" />);

    expect(
      await screen.findByText("Needs review — 1 issue found"),
    ).toBeInTheDocument();
    expect(screen.getByText(REVIEW_ISSUE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("uses the plural for more than one issue", async () => {
    vi.mocked(getInvoice).mockResolvedValue(
      makeInvoice({ status: "review", issues: [REVIEW_ISSUE, "Another problem."] }),
    );

    render(<InvoiceDetail invoiceId="7" />);

    expect(
      await screen.findByText("Needs review — 2 issues found"),
    ).toBeInTheDocument();
  });

  it("approves and keeps the issues on record", async () => {
    const user = userEvent.setup();
    vi.mocked(getInvoice).mockResolvedValue(
      makeInvoice({ status: "review", issues: [REVIEW_ISSUE] }),
    );
    vi.mocked(resolveInvoice).mockResolvedValue(
      makeInvoice({ status: "approved", issues: [REVIEW_ISSUE] }),
    );

    render(<InvoiceDetail invoiceId="7" />);
    await user.click(await screen.findByRole("button", { name: "Approve" }));

    expect(resolveInvoice).toHaveBeenCalledWith(7, "approved");
    expect(
      await screen.findByText("Resolved as approved — 1 issue kept on record"),
    ).toBeInTheDocument();
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("rejects and keeps the issues on record", async () => {
    const user = userEvent.setup();
    vi.mocked(getInvoice).mockResolvedValue(
      makeInvoice({ status: "review", issues: [REVIEW_ISSUE] }),
    );
    vi.mocked(resolveInvoice).mockResolvedValue(
      makeInvoice({ status: "rejected", issues: [REVIEW_ISSUE] }),
    );

    render(<InvoiceDetail invoiceId="7" />);
    await user.click(await screen.findByRole("button", { name: "Reject" }));

    expect(resolveInvoice).toHaveBeenCalledWith(7, "rejected");
    expect(
      await screen.findByText("Resolved as rejected — 1 issue kept on record"),
    ).toBeInTheDocument();
    expect(screen.getByText("rejected")).toBeInTheDocument();
  });

  it("surfaces a 409 and leaves the buttons available", async () => {
    const user = userEvent.setup();
    vi.mocked(getInvoice).mockResolvedValue(
      makeInvoice({ status: "review", issues: [REVIEW_ISSUE] }),
    );
    vi.mocked(resolveInvoice).mockRejectedValue(
      new ApiError("Invoice 7 is 'approved', so it cannot be resolved.", 409),
    );

    render(<InvoiceDetail invoiceId="7" />);
    await user.click(await screen.findByRole("button", { name: "Approve" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "cannot be resolved",
    );
    // The invoice is still shown as review, so the user can try again.
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });
});
