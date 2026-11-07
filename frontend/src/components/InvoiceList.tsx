"use client";

import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  SearchX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, listInvoices } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { InvoiceListResponse, InvoiceSummary } from "@/lib/types";

import StatusBadge from "./StatusBadge";
import {
  buttonClass,
  Card,
  cx,
  EmptyState,
  InitialAvatar,
  Skeleton,
} from "./ui";

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
      <Card className="overflow-hidden">
        <span className="sr-only">Loading invoices…</span>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 px-4 py-4">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="ml-auto h-4 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (state === "error" || data === null) {
    return (
      <Card className="border-red-200 bg-red-50/60 p-6">
        <p className="flex items-center gap-2 font-medium text-red-800">
          <AlertCircle className="h-4 w-4" aria-hidden />
          Could not load invoices
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

  const first = data.total === 0 ? 0 : data.offset + 1;
  const last = data.offset + data.items.length;
  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const page = Math.floor(data.offset / PAGE_SIZE) + 1;
  const hasPrevious = data.offset > 0;
  const hasNext = data.offset + data.items.length < data.total;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="relative w-full max-w-sm">
          <label htmlFor="invoice-search" className="sr-only">
            Search invoices
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            id="invoice-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search vendor or invoice number"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none"
          />
          {search !== "" && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          {pending && (
            <span role="status" className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Updating…
            </span>
          )}
          <span className="tabular-nums">
            {data.total} {data.total === 1 ? "invoice" : "invoices"}
          </span>
        </div>
      </div>

      {data.items.length === 0 ? (
        <div className="p-4">
          {params.term === "" ? (
            <EmptyState
              icon={SearchX}
              title="No invoices yet"
              description="Upload one above to see it here."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No matches"
              description={`No invoices match “${params.term}”.`}
              action={
                <button
                  type="button"
                  onClick={clearSearch}
                  className={buttonClass("secondary")}
                >
                  Show all invoices
                </button>
              }
            />
          )}
        </div>
      ) : (
        <>
          {/*
            Phones get one tappable card per invoice. A five-column table
            cannot fit 390px without pushing the total off-screen, which is
            exactly the number people look for first.
          */}
          <ul className="divide-y divide-slate-100 sm:hidden">
            {data.items.map((invoice: InvoiceSummary) => (
              <li key={invoice.id}>
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="flex items-center gap-3 px-4 py-3 active:bg-slate-50"
                >
                  <InitialAvatar
                    name={invoice.vendor_name}
                    className="h-9 w-9 text-xs"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">
                      {invoice.vendor_name ?? "Unknown vendor"}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {invoice.invoice_number ?? "—"} ·{" "}
                      {invoice.invoice_date ?? "no date"}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="whitespace-nowrap text-sm font-medium tabular-nums text-slate-900">
                      {formatMoney(invoice.total_amount, invoice.currency)}
                    </span>
                    <StatusBadge status={invoice.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Vendor</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                    Invoice #
                  </th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                    Date
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((invoice: InvoiceSummary) => (
                  <tr
                    key={invoice.id}
                    className="transition-colors hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="group flex min-w-0 items-center gap-3"
                      >
                        <InitialAvatar
                          name={invoice.vendor_name}
                          className="h-8 w-8 text-xs"
                        />
                        <span className="truncate font-medium text-slate-900 group-hover:text-indigo-700">
                          {invoice.vendor_name ?? "Unknown vendor"}
                        </span>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                      {invoice.invoice_number ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                      {invoice.invoice_date ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                      {formatMoney(invoice.total_amount, invoice.currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={invoice.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
        <p className="text-xs tabular-nums text-slate-500">
          {data.total === 0
            ? "No results"
            : `Showing ${first}–${last} of ${data.total}`}
        </p>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goToPage(Math.max(0, data.offset - PAGE_SIZE))}
            disabled={!hasPrevious || pending}
            aria-label="Previous page"
            className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="px-2 text-xs tabular-nums text-slate-500">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => goToPage(data.offset + PAGE_SIZE)}
            disabled={!hasNext || pending}
            aria-label="Next page"
            className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </Card>
  );
}
