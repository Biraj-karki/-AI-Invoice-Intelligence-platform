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

/** Mirrors app/schemas/invoice.py::LineItemOut */
export interface LineItem {
  id: number;
  description: string | null;
  quantity: string | null;
  unit_price: string | null;
  amount: string | null;
}

/** Mirrors app/schemas/invoice.py::InvoiceDetailOut */
export interface InvoiceDetail extends InvoiceSummary {
  subtotal: string | null;
  tax_amount: string | null;
  source_filename: string | null;
  stored_path: string | null;
  /** Data-quality warnings from normalisation, e.g. totals that don't add up. */
  issues: string[];
  line_items: LineItem[];
}
