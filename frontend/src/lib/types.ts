/** Mirrors app/schemas/auth.py::UserOut */
export interface AuthUser {
  id: number;
  email: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface AutomationTokenResponse {
  automation_token: string;
}

export interface AutomationTokenStatus {
  enabled: boolean;
}

export type InvoiceStatus =
  | "pending"
  | "extracted"
  | "review"
  | "approved"
  | "rejected"
  | "failed";

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
  duplicate_of_id: number | null;
  duplicate_match: "same_file" | "invoice_details" | null;
  /** Data-quality warnings from normalisation, e.g. totals that don't add up. */
  issues: string[];
  line_items: LineItem[];
}

/** Mirrors app/schemas/invoice.py::InvoiceFieldsIn — the editable header. */
export interface InvoiceFields {
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string | null;
  subtotal: string | null;
  tax_amount: string | null;
  total_amount: string | null;
}

/** Mirrors app/schemas/invoice.py::VendorSpendOut */
export interface VendorSpend {
  vendor_name: string;
  invoice_count: number;
  total_amount: string;
}

/** Mirrors app/schemas/invoice.py::MonthSpendOut */
export interface MonthSpend {
  month: string;
  invoice_count: number;
  total_amount: string;
}

/** Mirrors app/schemas/invoice.py::CurrencyStatsOut */
export interface CurrencyStats {
  currency: string;
  invoice_count: number;
  total_amount: string;
  by_vendor: VendorSpend[];
  by_month: MonthSpend[];
}

/** Mirrors app/schemas/invoice.py::InvoiceStatsOut */
export interface InvoiceStats {
  /** One block per currency: the backend never adds different currencies up. */
  currencies: CurrencyStats[];
  excluded_count: number;
  undated_count: number;
}
