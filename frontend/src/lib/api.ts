import type { InvoiceDetail, InvoiceListResponse } from "./types";

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

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
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

  return (await response.json()) as T;
}

export function listInvoices(params?: {
  limit?: number;
  offset?: number;
}): Promise<InvoiceListResponse> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.offset !== undefined) search.set("offset", String(params.offset));

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
