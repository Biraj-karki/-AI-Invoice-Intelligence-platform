"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, getInvoice, resolveInvoice } from "@/lib/api";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import type { InvoiceDetail as InvoiceDetailData } from "@/lib/types";
import StatusBadge from "./StatusBadge";

type State = "loading" | "ready" | "missing" | "error";

export default function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<InvoiceDetailData | null>(null);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [resolving, setResolving] = useState<"approved" | "rejected" | null>(
    null,
  );
  const [actionError, setActionError] = useState<string>("");

  // Guard before the request: "/invoices/abc" would come back as a 422.
  // Derived during render so an invalid id never needs a state update.
  const numericId = /^\d+$/.test(invoiceId) ? Number(invoiceId) : null;

  useEffect(() => {
    if (numericId === null) return;

    // Ignore a response that arrives after unmount or after navigating to
    // another invoice.
    let cancelled = false;

    getInvoice(numericId)
      .then((data) => {
        if (cancelled) return;
        setInvoice(data);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState("missing");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Unexpected error.");
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [numericId, reloadKey]);

  function retry() {
    setState("loading");
    setReloadKey((key) => key + 1);
  }

  async function resolve(status: "approved" | "rejected") {
    if (invoice === null || resolving !== null) return;

    setResolving(status);
    setActionError("");

    try {
      // The API returns the updated invoice, so the badge and panel update
      // from the server's answer instead of guessing what changed.
      setInvoice(await resolveInvoice(invoice.id, status));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Unexpected error.");
    } finally {
      setResolving(null);
    }
  }

  if (numericId === null || state === "missing") {
    return (
      <div className="mt-6 rounded-lg border border-slate-200 p-6">
        <p className="font-medium text-slate-900">Invoice not found</p>
        <p className="mt-1 text-sm text-slate-600">
          No invoice with id <span className="font-mono">{invoiceId}</span>{" "}
          exists.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-slate-900 underline underline-offset-2"
        >
          Back to all invoices
        </Link>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <p className="mt-6 rounded-lg border border-slate-200 p-6 text-slate-500">
        Loading invoice…
      </p>
    );
  }

  if (state === "error" || invoice === null) {
    return (
      <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="font-medium text-red-800">Could not load this invoice</p>
        <p className="mt-1 text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {invoice.vendor_name ?? "Unknown vendor"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {invoice.invoice_number ?? "No invoice number"}
          </p>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      {invoice.issues.length > 0 && (
        <div
          className={`mt-6 rounded-lg border p-4 ${
            invoice.status === "review"
              ? "border-amber-200 bg-amber-50"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          <p
            className={`text-sm font-medium ${
              invoice.status === "review" ? "text-amber-900" : "text-slate-700"
            }`}
          >
            {invoice.status === "review"
              ? `Needs review — ${invoice.issues.length} ${
                  invoice.issues.length === 1 ? "issue" : "issues"
                } found`
              : `Resolved as ${invoice.status} — ${invoice.issues.length} ${
                  invoice.issues.length === 1 ? "issue" : "issues"
                } kept on record`}
          </p>
          <ul
            className={`mt-2 list-disc space-y-1 pl-5 text-sm ${
              invoice.status === "review" ? "text-amber-900" : "text-slate-600"
            }`}
          >
            {invoice.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>

          {invoice.status === "review" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void resolve("approved")}
                disabled={resolving !== null}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {resolving === "approved" ? "Approving…" : "Approve"}
              </button>
              <button
                type="button"
                onClick={() => void resolve("rejected")}
                disabled={resolving !== null}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resolving === "rejected" ? "Rejecting…" : "Reject"}
              </button>
            </div>
          )}

          {actionError !== "" && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {actionError}
            </p>
          )}
        </div>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Invoice date
          </dt>
          <dd className="mt-1 text-sm text-slate-900">
            {invoice.invoice_date ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Subtotal
          </dt>
          <dd className="mt-1 text-sm tabular-nums text-slate-900">
            {formatMoney(invoice.subtotal, invoice.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Tax</dt>
          <dd className="mt-1 text-sm tabular-nums text-slate-900">
            {formatMoney(invoice.tax_amount, invoice.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Total
          </dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
            {formatMoney(invoice.total_amount, invoice.currency)}
          </dd>
        </div>
      </dl>

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-slate-500">
        Line items
      </h2>

      {invoice.line_items.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          No line items were extracted from this invoice.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Unit price</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.line_items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-slate-900">
                    {item.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {formatQuantity(item.quantity)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {formatMoney(item.unit_price, invoice.currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                    {formatMoney(item.amount, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Saved from{" "}
        <span className="font-mono">{invoice.source_filename ?? "unknown"}</span>{" "}
        on {formatDate(invoice.created_at)}
      </p>
    </div>
  );
}
