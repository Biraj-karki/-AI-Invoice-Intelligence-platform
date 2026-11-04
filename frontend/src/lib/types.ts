export type InvoiceStatus = "pending" | "extracted" | "review" | "failed";

/** Mirrors app/schemas/invoice.py::InvoiceSummaryOut */
export interface InvoiceSummary {
  id: number;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string | null;
  /** Money is a string on purpose: JSON floats corrupt decimals. */
  total_amount: string | null;
  status: InvoiceStatus | string;
  created_at: string;
}

/** Mirrors app/schemas/invoice.py::InvoiceListOut */
export interface InvoiceListResponse {
  items: InvoiceSummary[];
  total: number;
  limit: number;
  offset: number;
}
