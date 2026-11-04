"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, listInvoices } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { InvoiceListResponse, InvoiceSummary } from "@/lib/types";
import StatusBadge from "./StatusBadge";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

export default function InvoiceList() {
  const [data, setData] = useState<InvoiceListResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);

  // What the user is typing, and what has actually been sent to the API.
  // They differ for SEARCH_DEBOUNCE_MS, so a request is not fired per keystroke.
  const [search, setSearch] = useState("");
  const [params, setParams] = useState({ term: "", offset: 0 });

  // True between "the user asked for different data" and "the response arrived".
  // Set from event handlers/timeouts, never synchronously inside an effect.
  const [pending, setPending] = useState(false);

  // Debounce: only the last keystroke within the window reaches the API.
  useEffect(() => {
    const term = search.trim();
    if (term === params.term) return;

    const timer = setTimeout(() => {
      setPending(true);
      // A new search always starts at the first page.
      setParams({ term, offset: 0 });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search, params.term]);

  useEffect(() => {
    // Ignore a response that arrives after unmount or after a newer request.
    let cancelled = false;

    listInvoices({ limit: PAGE_SIZE, offset: params.offset, q: params.term })
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setState("ready");
        setPending(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Unexpected error.");
        setState("error");
        setPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.term, params.offset, reloadKey]);

  function retry() {
    setState("loading");
    setReloadKey((key) => key + 1);
  }

  function goToPage(offset: number) {
    setPending(true);
    setParams((current) => ({ ...current, offset }));
  }

  function clearSearch() {
    setSearch("");
  }

  if (state === "loading") {
    return (
      <p className="rounded-lg border border-slate-200 p-6 text-slate-500">
        Loading invoices…
      </p>
    );
  }

  if (state === "error" || data === null) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="font-medium text-red-800">Could not load invoices</p>
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

  const first = data.total === 0 ? 0 : data.offset + 1;
  const last = data.offset + data.items.length;
  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const page = Math.floor(data.offset / PAGE_SIZE) + 1;
  const hasPrevious = data.offset > 0;
  const hasNext = data.offset + data.items.length < data.total;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="invoice-search" className="sr-only">
          Search invoices
        </label>
        <input
          id="invoice-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search vendor or invoice number"
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
        />
        {search !== "" && (
          <button
            type="button"
            onClick={clearSearch}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
        {pending && (
          <span className="text-xs text-slate-500" role="status">
            Updating…
          </span>
        )}
      </div>

      {data.items.length === 0 ? (
        params.term === "" ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-slate-500">
            No invoices yet. Upload one above to see it here.
          </p>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-slate-500">
            No invoices match{" "}
            <span className="font-medium text-slate-700">
              “{params.term}”
            </span>
            .
          </p>
        )
      ) : (
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
              {data.items.map((invoice: InvoiceSummary) => (
                <tr key={invoice.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="text-slate-900 underline-offset-2 hover:underline"
                    >
                      {invoice.vendor_name ?? "Unknown vendor"}
                    </Link>
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
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {data.total === 0
            ? "No results"
            : `Showing ${first}–${last} of ${data.total}`}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToPage(Math.max(0, data.offset - PAGE_SIZE))}
            disabled={!hasPrevious || pending}
            aria-label="Previous page"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => goToPage(data.offset + PAGE_SIZE)}
            disabled={!hasNext || pending}
            aria-label="Next page"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
