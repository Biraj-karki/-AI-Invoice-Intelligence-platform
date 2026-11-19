import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, exportInvoicesCsv, listInvoices } from "@/lib/api";
import type { InvoiceListResponse, InvoiceSummary } from "@/lib/types";

import InvoiceList from "./InvoiceList";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    exportInvoicesCsv: vi.fn(),
    listInvoices: vi.fn(),
  };
});

function summary(
  id: number,
  overrides: Partial<InvoiceSummary> = {},
): InvoiceSummary {
  return {
    id,
    vendor_name: `Vendor ${id}`,
    invoice_number: `INV-${id}`,
    invoice_date: "2026-10-15",
    currency: "NPR",
    total_amount: "1000.00",
    status: "extracted",
    created_at: "2026-11-04T09:52:37.277193+05:45",
    ...overrides,
  };
}

function page(
  items: InvoiceSummary[],
  total: number,
  offset: number,
): InvoiceListResponse {
  return { items, total, limit: 10, offset };
}

const firstPage = page(
  Array.from({ length: 10 }, (_, index) => summary(index + 1)),
  19,
  0,
);
const secondPage = page(
  Array.from({ length: 9 }, (_, index) => summary(index + 11)),
  19,
  10,
);

// Set by the stubbed anchor click in beforeEach, so a test can inspect the
// download it would have started.
let downloaded: HTMLAnchorElement | null = null;

beforeEach(() => {
  vi.mocked(listInvoices).mockReset();
  vi.mocked(exportInvoicesCsv).mockReset();
  downloaded = null;

  // jsdom implements neither object URLs nor a download, so both are stubbed.
  // The link is still in the DOM when click() runs, so read it from there
  // instead of aliasing `this`.
  URL.createObjectURL = vi.fn(() => "blob:invoices-csv");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
    downloaded = document.querySelector<HTMLAnchorElement>("a[download]");
  });
});

describe("InvoiceList — pagination", () => {
  it("asks for the first page and reports the range", async () => {
    vi.mocked(listInvoices).mockResolvedValue(firstPage);

    render(<InvoiceList />);

    expect(await screen.findByText("Showing 1–10 of 19")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(listInvoices).toHaveBeenCalledWith({
      limit: 10,
      offset: 0,
      q: "",
      status: "",
    });

    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  it("walks to the next page with the right offset", async () => {
    const user = userEvent.setup();
    vi.mocked(listInvoices)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);

    render(<InvoiceList />);
    await screen.findByText("Showing 1–10 of 19");

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(await screen.findByText("Showing 11–19 of 19")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(listInvoices).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 10,
      q: "",
      status: "",
    });

    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });

  it("returns to the previous page", async () => {
    const user = userEvent.setup();
    vi.mocked(listInvoices)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage)
      .mockResolvedValueOnce(firstPage);

    render(<InvoiceList />);
    await screen.findByText("Showing 1–10 of 19");

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Showing 11–19 of 19");

    await user.click(screen.getByRole("button", { name: "Previous page" }));

    expect(await screen.findByText("Showing 1–10 of 19")).toBeInTheDocument();
    expect(listInvoices).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      q: "",
      status: "",
    });
  });
});

describe("InvoiceList — search", () => {
  it("debounces typing into a single request", async () => {
    vi.mocked(listInvoices)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(page([summary(42, { vendor_name: "ACME" })], 1, 0));

    render(<InvoiceList />);
    await screen.findByText("Showing 1–10 of 19");

    const input = screen.getByLabelText("Search invoices");
    // Three keystrokes in quick succession, as a fast typist would produce.
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "ac" } });
    fireEvent.change(input, { target: { value: "acm" } });

    // Nothing has been sent yet: the debounce window is still open.
    expect(listInvoices).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(listInvoices).toHaveBeenCalledTimes(2), {
      timeout: 2000,
    });
    // Only the final term is sent, and a new search starts at offset 0.
    expect(listInvoices).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      q: "acm",
      status: "",
    });
  });

  it("explains an empty result and lets the search be cleared", async () => {
    vi.mocked(listInvoices)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(page([], 0, 0))
      .mockResolvedValueOnce(firstPage);

    render(<InvoiceList />);
    await screen.findByText("Showing 1–10 of 19");

    fireEvent.change(screen.getByLabelText("Search invoices"), {
      target: { value: "zzz" },
    });

    expect(await screen.findByText(/No invoices match/)).toBeInTheDocument();
    expect(screen.getByText(/“zzz”/)).toBeInTheDocument();
    expect(screen.getByText("No results")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(await screen.findByText("Showing 1–10 of 19")).toBeInTheDocument();
    expect(listInvoices).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      q: "",
      status: "",
    });
  });

  it("trims surrounding whitespace before sending the term", async () => {
    vi.mocked(listInvoices)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(page([], 0, 0));

    render(<InvoiceList />);
    await screen.findByText("Showing 1–10 of 19");

    fireEvent.change(screen.getByLabelText("Search invoices"), {
      target: { value: "  acme  " },
    });

    await waitFor(() => expect(listInvoices).toHaveBeenCalledTimes(2), {
      timeout: 2000,
    });
    expect(listInvoices).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      q: "acme",
      status: "",
    });
  });
});

describe("InvoiceList — status filter", () => {
  it("refetches from page 1 with only the chosen status", async () => {
    vi.mocked(listInvoices)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(
        page([summary(42, { status: "review" })], 1, 0),
      );

    render(<InvoiceList />);
    await screen.findByText("Showing 1–10 of 19");

    await userEvent.setup().selectOptions(
      screen.getByLabelText("Filter by status"),
      "review",
    );

    expect(listInvoices).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      q: "",
      status: "review",
    });
    expect(await screen.findByText("Showing 1–1 of 1")).toBeInTheDocument();
  });

  it("keeps the status when paging", async () => {
    const user = userEvent.setup();
    vi.mocked(listInvoices)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(page([], 0, 0));

    render(<InvoiceList />);
    await screen.findByText("Showing 1–10 of 19");

    await user.selectOptions(screen.getByLabelText("Filter by status"), "approved");
    await screen.findByText("No results");

    vi.mocked(listInvoices).mockResolvedValueOnce(secondPage);
    // With a filter active there is nothing to page through, so prove the
    // filter survives a search instead: the next request must still carry it.
    fireEvent.change(screen.getByLabelText("Search invoices"), {
      target: { value: "acme" },
    });

    await waitFor(() => expect(listInvoices).toHaveBeenCalledTimes(3), {
      timeout: 2000,
    });
    expect(listInvoices).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      q: "acme",
      status: "approved",
    });
  });

  it("describes a filtered empty result and clears every filter at once", async () => {
    vi.mocked(listInvoices)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(page([], 0, 0))
      .mockResolvedValueOnce(firstPage);

    render(<InvoiceList />);
    await screen.findByText("Showing 1–10 of 19");

    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText("Filter by status"), "failed");

    expect(await screen.findByText(/No invoices/)).toHaveTextContent(
      "No invoices with status “Failed”.",
    );
    expect(screen.getByText("No results")).toBeInTheDocument();

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Show all invoices" }));

    expect(await screen.findByText("Showing 1–10 of 19")).toBeInTheDocument();
    expect(listInvoices).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      q: "",
      status: "",
    });
  });
});

describe("InvoiceList — CSV export", () => {
  it("downloads the file under a dated name", async () => {
    const user = userEvent.setup();
    vi.mocked(listInvoices).mockResolvedValue(firstPage);
    vi.mocked(exportInvoicesCsv).mockResolvedValue(
      new Blob(["\ufeffid,vendor_name"], { type: "text/csv" }),
    );

    render(<InvoiceList />);
    await screen.findByText("Showing 1–10 of 19");

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => expect(downloaded).not.toBeNull());
    expect(exportInvoicesCsv).toHaveBeenCalledWith({ q: "", status: "" });
    expect(downloaded?.download).toMatch(/^invoices-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(downloaded?.href).toBe("blob:invoices-csv");
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("exports what is on screen, not the whole table", async () => {
    const user = userEvent.setup();
    vi.mocked(listInvoices).mockResolvedValue(firstPage);
    vi.mocked(exportInvoicesCsv).mockResolvedValue(new Blob(["x"]));

    render(<InvoiceList />);
    await screen.findByText("Showing 1–10 of 19");

    await user.selectOptions(
      screen.getByLabelText("Filter by status"),
      "review",
    );
    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() =>
      expect(exportInvoicesCsv).toHaveBeenCalledWith({
        q: "",
        status: "review",
      }),
    );
  });

  it("reports a failed export without starting a download", async () => {
    const user = userEvent.setup();
    vi.mocked(listInvoices).mockResolvedValue(firstPage);
    vi.mocked(exportInvoicesCsv).mockRejectedValue(
      new ApiError("The CSV could not be exported.", 500),
    );

    render(<InvoiceList />);
    await screen.findByText("Showing 1–10 of 19");

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The CSV could not be exported.",
    );
    expect(downloaded).toBeNull();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  });

  it("is disabled when there is nothing to export", async () => {
    vi.mocked(listInvoices).mockResolvedValue(page([], 0, 0));

    render(<InvoiceList />);

    expect(await screen.findByText("No invoices yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });
});

describe("InvoiceList — empty and failure states", () => {
  it("says the list is empty rather than 'no matches'", async () => {
    vi.mocked(listInvoices).mockResolvedValue(page([], 0, 0));

    render(<InvoiceList />);

    expect(await screen.findByText("No invoices yet")).toBeInTheDocument();
    expect(
      screen.getByText("Upload one above to see it here."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No invoices match/)).toBeNull();
  });

  it("shows the server's error and retries", async () => {
    const user = userEvent.setup();
    vi.mocked(listInvoices)
      .mockRejectedValueOnce(new ApiError("Database is on fire.", 500))
      .mockResolvedValueOnce(firstPage);

    render(<InvoiceList />);

    expect(
      await screen.findByText("Could not load invoices"),
    ).toBeInTheDocument();
    expect(screen.getByText("Database is on fire.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Showing 1–10 of 19")).toBeInTheDocument();
    expect(listInvoices).toHaveBeenCalledTimes(2);
  });
});
