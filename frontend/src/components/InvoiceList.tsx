"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError, listInvoices } from "@/lib/api";
import type { InvoiceSummary } from "@/lib/types";

function formatMoney(value: string | null, currency: string | null): string {
  if (value === null) return "—";

  const amount = Number(value);
  if (Number.isNaN(amount)) return value;

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return currency ? `${formatted} ${currency}` : formatted;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    extracted: "bg-emerald-100 text-emerald-800",
    review: "bg-amber-100 text-amber-900",
    pending: "bg-slate-200 text-slate-700",
    failed: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        styles[status] ?? "bg-slate-200 text-slate-700"
      }`}
    >
      {status}
    </span>
  );
}

export default function InvoiceList() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const data = await listInvoices({ limit: 20 });
      setInvoices(data.items);
      setState("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unexpected error.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <p className="rounded-lg border border-slate-200 p-6 text-slate-500">
        Loading invoices…
      </p>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="font-medium text-red-800">Could not load invoices</p>
        <p className="mt-1 text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
        >
          Try again
        </button>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-slate-500">
        No invoices yet. Upload one through the API to see it here.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Vendor</th>
            <th className="px-4 py-3 font-medium">Invoice #</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 text-right font-medium">Total</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">
                {invoice.vendor_name ?? "Unknown vendor"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {invoice.invoice_number ?? "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {invoice.invoice_date ?? "—"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                {formatMoney(invoice.total_amount, invoice.currency)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={invoice.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
