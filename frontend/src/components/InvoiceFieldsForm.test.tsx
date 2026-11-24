import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, updateInvoiceFields } from "@/lib/api";
import type { InvoiceDetail } from "@/lib/types";

import InvoiceFieldsForm from "./InvoiceFieldsForm";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, updateInvoiceFields: vi.fn() };
});

function makeInvoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: 7,
    vendor_name: "Dodgy Co",
    invoice_number: "D-1",
    invoice_date: "2026-10-15",
    currency: "NPR",
    total_amount: "500.00",
    status: "review",
    created_at: "2026-11-04T09:52:37.277193+05:45",
    subtotal: "100.00",
    tax_amount: "10.00",
    source_filename: "sample.pdf",
    stored_path: "storage/uploads/abc.pdf",
    duplicate_of_id: null,
    duplicate_match: null,
    issues: ["subtotal + tax = 110.00 but total is 500.00"],
    line_items: [],
    ...overrides,
  };
}

const onSaved = vi.fn();
const onCancel = vi.fn();

beforeEach(() => {
  vi.mocked(updateInvoiceFields).mockReset();
  onSaved.mockReset();
  onCancel.mockReset();
});

function renderForm(invoice = makeInvoice()) {
  render(
    <InvoiceFieldsForm invoice={invoice} onSaved={onSaved} onCancel={onCancel} />,
  );
  return userEvent.setup();
}

describe("InvoiceFieldsForm — prefilling", () => {
  it("starts from the invoice's current values", () => {
    renderForm();

    expect(screen.getByLabelText("Vendor")).toHaveValue("Dodgy Co");
    expect(screen.getByLabelText("Invoice number")).toHaveValue("D-1");
    expect(screen.getByLabelText("Invoice date")).toHaveValue("2026-10-15");
    expect(screen.getByLabelText("Currency")).toHaveValue("NPR");
    expect(screen.getByLabelText("Subtotal")).toHaveValue("100.00");
    expect(screen.getByLabelText("Tax")).toHaveValue("10.00");
    expect(screen.getByLabelText("Total")).toHaveValue("500.00");
  });

  it("shows empty boxes for values the extraction never found", () => {
    renderForm(
      makeInvoice({ vendor_name: null, invoice_date: null, tax_amount: null }),
    );

    expect(screen.getByLabelText("Vendor")).toHaveValue("");
    expect(screen.getByLabelText("Invoice date")).toHaveValue("");
    expect(screen.getByLabelText("Tax")).toHaveValue("");
  });
});

describe("InvoiceFieldsForm — saving", () => {
  it("sends every header field and hands the updated invoice back", async () => {
    const updated = makeInvoice({
      total_amount: "110.00",
      status: "extracted",
      issues: [],
    });
    vi.mocked(updateInvoiceFields).mockResolvedValue(updated);

    const user = renderForm();
    const total = screen.getByLabelText("Total");
    await user.clear(total);
    await user.type(total, "110.00");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateInvoiceFields).toHaveBeenCalledWith(7, {
      vendor_name: "Dodgy Co",
      invoice_number: "D-1",
      invoice_date: "2026-10-15",
      currency: "NPR",
      subtotal: "100.00",
      tax_amount: "10.00",
      total_amount: "110.00",
    });
    expect(onSaved).toHaveBeenCalledWith(updated);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("accepts grouping separators but sends the bare decimal", async () => {
    vi.mocked(updateInvoiceFields).mockResolvedValue(makeInvoice());

    const user = renderForm();
    const total = screen.getByLabelText("Total");
    await user.clear(total);
    await user.type(total, "6,130.25");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateInvoiceFields).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ total_amount: "6130.25" }),
    );
  });

  it("turns an emptied box into null so the value is cleared", async () => {
    vi.mocked(updateInvoiceFields).mockResolvedValue(makeInvoice());

    const user = renderForm();
    await user.clear(screen.getByLabelText("Vendor"));
    await user.clear(screen.getByLabelText("Tax"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateInvoiceFields).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ vendor_name: null, tax_amount: null }),
    );
  });

  it("uppercases a lowercase currency before sending it", async () => {
    vi.mocked(updateInvoiceFields).mockResolvedValue(makeInvoice());

    const user = renderForm();
    const currency = screen.getByLabelText("Currency");
    await user.clear(currency);
    await user.type(currency, "usd");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateInvoiceFields).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ currency: "USD" }),
    );
  });
});

describe("InvoiceFieldsForm — checks before sending", () => {
  it("refuses an amount with more than two decimals", async () => {
    const user = renderForm();
    const total = screen.getByLabelText("Total");
    await user.clear(total);
    await user.type(total, "110.001");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Total must be an amount with at most two decimal places",
    );
    expect(updateInvoiceFields).not.toHaveBeenCalled();
  });

  it("refuses text in an amount box", async () => {
    const user = renderForm();
    const subtotal = screen.getByLabelText("Subtotal");
    await user.clear(subtotal);
    await user.type(subtotal, "about a hundred");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Subtotal must be an amount",
    );
    expect(updateInvoiceFields).not.toHaveBeenCalled();
  });

  it("refuses a currency that is not three letters", async () => {
    const user = renderForm();
    const currency = screen.getByLabelText("Currency");
    await user.clear(currency);
    await user.type(currency, "Rs");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Currency must be a three-letter code",
    );
    expect(updateInvoiceFields).not.toHaveBeenCalled();
  });
});

describe("InvoiceFieldsForm — server answers", () => {
  it("shows a 409 and keeps the typed values for a retry", async () => {
    vi.mocked(updateInvoiceFields).mockRejectedValue(
      new ApiError("Invoice 7 is 'approved', so its fields cannot be corrected.", 409),
    );

    const user = renderForm();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("cannot be corrected");
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Total")).toHaveValue("500.00");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("does not claim a save when the network fails", async () => {
    vi.mocked(updateInvoiceFields).mockRejectedValue(new Error("offline"));

    const user = renderForm();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Try again.",
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("cancels without sending anything", async () => {
    const user = renderForm();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
    expect(updateInvoiceFields).not.toHaveBeenCalled();
  });
});
