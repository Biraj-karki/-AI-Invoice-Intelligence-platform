"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";

import { ApiError, getInvoice, resolveInvoice } from "@/lib/api";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import type { InvoiceDetail as InvoiceDetailData } from "@/lib/types";

import StatusBadge from "./StatusBadge";
import { buttonClass, Card, cx, InitialAvatar } from "./ui";

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
      <Card className="p-8">
        <p className="font-medium text-slate-900">Invoice not found</p>
        <p className="mt-1 text-sm text-slate-600">
          No invoice with id <span className="font-mono">{invoiceId}</span>{" "}
          exists.
        </p>
        <Link
          href="/"
          className={cx(buttonClass("secondary"), "mt-5 inline-flex")}
        >
          Back to all invoices
        </Link>
      </Card>
    );
  }

  if (state === "loading") {
    return (
      <Card className="flex items-center gap-3 p-8 text-sm text-slate-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        Loading invoice…
      </Card>
    );
  }

  if (state === "error" || invoice === null) {
    return (
      <Card className="border-red-200 bg-red-50/60 p-6">
        <p className="flex items-center gap-2 font-medium text-red-800">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Could not load this invoice
        </p>
        <p className="mt-1 text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={retry}
          className={cx(buttonClass("danger"), "mt-4")}
        >
          Try again
        </button>
      </Card>
    );
  }

  const itemCount = invoice.line_items.length;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-900">
          Invoices
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-slate-900">
          {invoice.invoice_number ?? `#${invoice.id}`}
        </span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <InitialAvatar
            name={invoice.vendor_name}
            className="h-10 w-10 text-base sm:h-12 sm:w-12 sm:text-lg"
          />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight break-words text-slate-900 sm:text-2xl">
              {invoice.vendor_name ?? "Unknown vendor"}
            </h1>
            <p className="mt-0.5 truncate text-sm text-slate-500">
              {invoice.invoice_number ?? "No invoice number"}
            </p>
          </div>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      {invoice.issues.length > 0 && (
        <div
          className={cx(
            "rounded-xl border p-4",
            invoice.status === "review"
              ? "border-amber-200 bg-amber-50"
              : "border-slate-200 bg-slate-50",
          )}
        >
          <p
            className={cx(
              "flex items-center gap-2 text-sm font-medium",
              invoice.status === "review" ? "text-amber-900" : "text-slate-700",
            )}
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {invoice.status === "review"
              ? `Needs review — ${invoice.issues.length} ${
                  invoice.issues.length === 1 ? "issue" : "issues"
                } found`
              : `Resolved as ${invoice.status} — ${invoice.issues.length} ${
                  invoice.issues.length === 1 ? "issue" : "issues"
                } kept on record`}
          </p>
          <ul
            className={cx(
              "mt-2 list-disc space-y-1 pl-9 text-sm",
              invoice.status === "review" ? "text-amber-900" : "text-slate-600",
            )}
          >
            {invoice.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>

          {invoice.status === "review" && (
            <div className="mt-4 flex flex-wrap gap-2 pl-9">
              <button
                type="button"
                onClick={() => void resolve("approved")}
                disabled={resolving !== null}
                className={buttonClass("primary")}
              >
                <Check className="h-4 w-4" aria-hidden />
                {resolving === "approved" ? "Approving…" : "Approve"}
              </button>
              <button
                type="button"
                onClick={() => void resolve("rejected")}
                disabled={resolving !== null}
                className={buttonClass("secondary")}
              >
                <X className="h-4 w-4" aria-hidden />
                {resolving === "rejected" ? "Rejecting…" : "Reject"}
              </button>
            </div>
          )}

          {actionError !== "" && (
            <p role="alert" className="mt-3 pl-9 text-sm text-red-700">
              {actionError}
            </p>
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Invoice date
          </dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">
            {invoice.invoice_date ?? "—"}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Subtotal
          </dt>
          <dd className="mt-1 text-sm font-medium tabular-nums text-slate-900">
            {formatMoney(invoice.subtotal, invoice.currency)}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Tax
          </dt>
          <dd className="mt-1 text-sm font-medium tabular-nums text-slate-900">
            {formatMoney(invoice.tax_amount, invoice.currency)}
          </dd>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm">
          <dt className="text-xs font-medium uppercase tracking-wide text-indigo-700">
            Total
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-indigo-950">
            {formatMoney(invoice.total_amount, invoice.currency)}
          </dd>
        </div>
      </dl>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
          <span className="text-xs tabular-nums text-slate-500">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        </div>

        {itemCount === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-500 sm:px-5">
            No line items were extracted from this invoice.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2.5 font-medium sm:px-5">
                    Description
                  </th>
                  <th className="px-2 py-2.5 text-right font-medium sm:px-5">
                    Qty
                  </th>
                  {/* Unit price is derivable from qty and amount, so it is the
                      first thing to drop when the screen is narrow. */}
                  <th className="hidden px-5 py-2.5 text-right font-medium sm:table-cell">
                    Unit price
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium sm:px-5">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.line_items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-slate-900 sm:px-5">
                      {item.description ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums text-slate-600 sm:px-5">
                      {formatQuantity(item.quantity)}
                    </td>
                    <td className="hidden whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-600 sm:table-cell">
                      {formatMoney(item.unit_price, invoice.currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-slate-900 sm:px-5">
                      {formatMoney(item.amount, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-500">
        Saved from{" "}
        <span className="font-mono">{invoice.source_filename ?? "unknown"}</span>{" "}
        on {formatDate(invoice.created_at)}
      </p>
    </div>
  );
}
