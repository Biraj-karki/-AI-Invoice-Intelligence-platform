import type {
  AuthUser,
  InvoiceDetail,
  InvoiceFields,
  InvoiceListResponse,
  InvoiceStats,
  InvoiceStatus,
  TokenResponse,
} from "./types";
import { getToken } from "./session";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * The single place that knows how to talk to the backend.
 * Every page and component goes through here, never through fetch() directly.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const token = getToken();

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        // Every protected route reads this; the public ones ignore it.
        ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    // fetch only throws for network/CORS failures, not for 4xx/5xx.
    throw new ApiError(
      `Cannot reach the API at ${API_BASE_URL}. Is the backend running?`,
      0,
    );
  }

  if (!response.ok) {
    let detail = response.statusText || `Request failed (${response.status})`;
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "detail" in body &&
        typeof (body as { detail: unknown }).detail === "string"
      ) {
        detail = (body as { detail: string }).detail;
      }
    } catch {
      // Body was not JSON; keep the status text.
    }
    throw new ApiError(detail, response.status);
  }

  // 204 means "done, nothing to say": parsing it as JSON would throw.
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function listInvoices(params?: {
  limit?: number;
  offset?: number;
  q?: string;
  status?: InvoiceStatus | "";
}): Promise<InvoiceListResponse> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.offset !== undefined) search.set("offset", String(params.offset));

  // Blank searches are omitted entirely, so clearing the box is the same as
  // never having typed: no "q=" noise in the URL or the request.
  const term = params?.q?.trim();
  if (term) search.set("q", term);

  // Same idea for the filter: "" means "all statuses", which is the default
  // list, so it must not look like a filter in the request.
  if (params?.status) search.set("status", params.status);

  const query = search.toString();
  return request<InvoiceListResponse>(
    `/api/v1/invoices${query ? `?${query}` : ""}`,
  );
}

export function getInvoice(id: number): Promise<InvoiceDetail> {
  return request<InvoiceDetail>(`/api/v1/invoices/${id}`);
}

/**
 * Upload a PDF and wait for Gemini to extract it.
 *
 * No Content-Type header on purpose: the browser must set it itself so it can
 * include the multipart boundary. Setting it by hand breaks the upload.
 */
export function createInvoice(file: File): Promise<InvoiceDetail> {
  const body = new FormData();
  body.append("file", file);

  return request<InvoiceDetail>("/api/v1/invoices", { method: "POST", body });
}

/**
 * Record a human decision on an invoice that needed review.
 *
 * Unlike the upload, this sends JSON, which is not a CORS-safelisted content
 * type, so the browser sends an OPTIONS preflight first.
 */
export function resolveInvoice(
  id: number,
  status: "approved" | "rejected",
): Promise<InvoiceDetail> {
  return request<InvoiceDetail>(`/api/v1/invoices/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

/**
 * Overwrite the header fields a reviewer corrected.
 *
 * The server re-checks the arithmetic and answers with the whole invoice, so
 * the screen can show the remaining issues without recalculating anything.
 */
export function updateInvoiceFields(
  id: number,
  fields: InvoiceFields,
): Promise<InvoiceDetail> {
  return request<InvoiceDetail>(`/api/v1/invoices/${id}/fields`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
}

/** Remove an invoice, its line items and the stored PDF. */
export function deleteInvoice(id: number): Promise<void> {
  return request<void>(`/api/v1/invoices/${id}`, { method: "DELETE" });
}

/**
 * Download the invoices matching the current filters as a CSV file.
 *
 * Fetched rather than linked for the same reason as the PDF: the browser's own
 * download would not carry the Authorization header.
 */
export async function exportInvoicesCsv(params?: {
  q?: string;
  status?: InvoiceStatus | "";
}): Promise<Blob> {
  const search = new URLSearchParams();
  const term = params?.q?.trim();
  if (term) search.set("q", term);
  if (params?.status) search.set("status", params.status);

  const query = search.toString();
  const token = getToken();
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/v1/invoices/export.csv${query ? `?${query}` : ""}`,
      { headers: token !== null ? { Authorization: `Bearer ${token}` } : {} },
    );
  } catch {
    throw new ApiError(
      `Cannot reach the API at ${API_BASE_URL}. Is the backend running?`,
      0,
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status === 401
        ? "Your session expired. Sign in again."
        : "The CSV could not be exported.",
      response.status,
    );
  }

  return response.blob();
}

export function getInvoiceStats(): Promise<InvoiceStats> {
  return request<InvoiceStats>("/api/v1/invoices/stats");
}

/** Used by the sidebar indicator; proves the API is actually reachable. */
export function getHealth(): Promise<{ status: string }> {
  return request<{ status: string }>("/api/v1/health");
}

export function login(
  email: string,
  password: string,
): Promise<TokenResponse> {
  return request<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function register(
  email: string,
  password: string,
): Promise<TokenResponse> {
  return request<TokenResponse>("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function getMe(): Promise<AuthUser> {
  return request<AuthUser>("/api/v1/auth/me");
}

/**
 * Change the signed-in account's password.
 *
 * The token proves who is asking; the current password proves it is really
 * them, so an unlocked browser cannot lock the owner out.
 */
export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  return request<void>("/api/v1/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

/**
 * Download an invoice's original PDF as a Blob.
 *
 * An <iframe src="..."> cannot send an Authorization header, so the preview
 * fetches the bytes itself and hands the browser an object URL. The token
 * never ends up in a URL, browser history or a server access log.
 */
export async function getInvoiceFile(id: number): Promise<Blob> {
  const token = getToken();
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/v1/invoices/${id}/file`, {
      headers: token !== null ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new ApiError(
      `Cannot reach the API at ${API_BASE_URL}. Is the backend running?`,
      0,
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status === 401
        ? "Your session expired. Sign in again."
        : "The original PDF could not be loaded.",
      response.status,
    );
  }

  return response.blob();
}
