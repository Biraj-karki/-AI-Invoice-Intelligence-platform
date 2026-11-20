"use client";

import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Search,
  SearchX,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ApiError, exportInvoicesCsv, listInvoices } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type {
  InvoiceListResponse,
  InvoiceStatus,
  InvoiceSummary,
} from "@/lib/types";

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

// "" is "all statuses": no filter, which is also the cheapest request.
const STATUS_OPTIONS: { value: InvoiceStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "extracted", label: "Extracted" },
  { value: "review", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
];

const STATUS_VALUES = new Set<string>(
  STATUS_OPTIONS.map((option) => option.value).filter((value) => value !== ""),
);

type Filters = {
  term: string;
  status: InvoiceStatus | "";
  offset: number;
};

/**
 * Turn the address bar into the one description of what is being shown.
 *
 * The URL is the source of truth: reloading it, bookmarking it, sharing it or
 * pressing Back all produce the same list, because they all produce the same
 * query string.
 */
function readFilters(searchParams: URLSearchParams): Filters {
  const term = (searchParams.get("q") ?? "").trim();

  // A stale bookmark or a hand-edited URL can carry a status this build does
  // not know. Showing everything is better than an empty list nobody can
  // explain, and the fetch is never asked for a value the API would reject.
  const rawStatus = searchParams.get("status") ?? "";
  const status = STATUS_VALUES.has(rawStatus)
    ? (rawStatus as InvoiceStatus)
    : "";

  // offset=15 is not a page boundary (the API pages by 10), so round down
  // instead of showing items 16–25 under the label "Page 2".
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const offset =
    Number.isFinite(rawOffset) && rawOffset > 0
      ? Math.floor(rawOffset / PAGE_SIZE) * PAGE_SIZE
      : 0;

  return { term, status, offset };
}

function toHref(pathname: string, filters: Filters): string {
  // Only non-default values go in: "/?q=&status=&offset=0" is noise, and "/"
  // is the address people expect when nothing is filtered.
  const search = new URLSearchParams();
  if (filters.term !== "") search.set("q", filters.term);
  if (filters.status !== "") search.set("status", filters.status);
  if (filters.offset > 0) search.set("offset", String(filters.offset));

  const query = search.toString();
  return query === "" ? pathname : `${pathname}?${query}`;
}

export function InvoiceListSkeleton() {
  return (
    <Card className="overflow-hidden">
      <span className="sr-only">Loading invoices…</span>
      <div className="border-b border-line px-4 py-4 sm:px-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-2 h-3 w-20" />
      </div>
      <div className="divide-y divide-line/70">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-4 sm:px-5">
            <Skeleton className="h-9 w-9 rounded-[10px]" />
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

/**
 * The search box keeps its own draft so typing stays instant, then hands the
 * settled term up. Remounting it (via a key) would drop the caret mid-word, so
 * instead it adopts a term that changed underneath it (Back, "Show all").
 */
function SearchBox({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (term: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);

  // Adjusting state during render is the documented way to follow a prop.
  // It is guarded so it runs once per change, not on every render.
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }

  useEffect(() => {
    const term = draft.trim();
    if (term === value) return;

    const timer = setTimeout(() => onCommit(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, value, onCommit]);

  return (
    <div className="relative w-full sm:w-[240px] lg:w-[260px]">
      <label htmlFor="invoice-search" className="sr-only">
        Search invoices
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
        aria-hidden
      />
      <input
        id="invoice-search"
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Search vendor or number"
        className="h-9 w-full rounded-lg border border-line bg-[#faf9f6] py-0 pl-9 pr-9 text-[13px] text-ink transition-colors placeholder:text-stone-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
      />
      {draft !== "" && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            onCommit("");
          }}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-stone-400 transition-colors hover:bg-stone-900/[0.06] hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** One row's contents, shared by the desktop grid and the phone card. */
function VendorCell({ invoice }: { invoice: InvoiceSummary }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <InitialAvatar
        name={invoice.vendor_name}
        className="h-9 w-9 text-[11px]"
      />
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-medium tracking-[-0.005em] text-ink transition-colors group-hover:text-indigo-700">
          {invoice.vendor_name ?? "Unknown vendor"}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-stone-500">
          {invoice.invoice_number ?? "No invoice number"}
        </p>
      </div>
    </div>
  );
}

export default function InvoiceList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = readFilters(searchParams);
  const currentHref = toHref(pathname, filters);

  const [data, setData] = useState<InvoiceListResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);

  // True between "the user asked for different data" and "the response arrived".
  // Set from event handlers, never synchronously inside an effect.
  const [pending, setPending] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  // replace, not push: a keystroke should not become a history entry, or the
  // Back button would step through every letter typed. scroll: false keeps the
  // list where it is instead of jumping to the top on each filter change.
  const applyFilters = useCallback(
    (next: Filters) => {
      const href = toHref(pathname, next);
      if (href === currentHref) return;

      setPending(true);
      router.replace(href, { scroll: false });
    },
    [currentHref, pathname, router],
  );

  useEffect(() => {
    // Ignore a response that arrives after unmount or after a newer request.
    let cancelled = false;

    listInvoices({
      limit: PAGE_SIZE,
      offset: filters.offset,
      q: filters.term,
      status: filters.status,
    })
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
  }, [filters.term, filters.offset, filters.status, reloadKey]);

  const commitTerm = useCallback(
    (term: string) => {
      applyFilters({ term, status: filters.status, offset: 0 });
    },
    [applyFilters, filters.status],
  );

  function retry() {
    setState("loading");
    setReloadKey((key) => key + 1);
  }

  function goToPage(offset: number) {
    applyFilters({ ...filters, offset });
  }

  function changeStatus(next: InvoiceStatus | "") {
    // A different filter is a different result set, so page 1 is the only
    // offset that is guaranteed to exist.
    applyFilters({ term: filters.term, status: next, offset: 0 });
  }

  // "Show all" resets the filter too: leaving a status active would make the
  // button look broken (still "No matches" after clearing only the text).
  function showAll() {
    applyFilters({ term: "", status: "", offset: 0 });
  }

  async function exportCsv() {
    if (exporting) return;

    setExporting(true);
    setExportError("");

    try {
      // The export uses the filters that are on screen, not the current page.
      const blob = await exportInvoicesCsv({
        q: filters.term,
        status: filters.status,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Give the browser a moment to start the download before dropping the URL.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? err.message
          : "The CSV could not be exported.",
      );
    } finally {
      setExporting(false);
    }
  }

  if (state === "loading") {
    return <InvoiceListSkeleton />;
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
  const page = Math.min(Math.floor(data.offset / PAGE_SIZE) + 1, pageCount);
  const hasPrevious = data.offset > 0;
  const hasNext = data.offset + data.items.length < data.total;

  const statusLabel =
    STATUS_OPTIONS.find((option) => option.value === filters.status)?.label ??
    "";
  const noMatchesDescription = [
    filters.term !== "" ? `No invoices match “${filters.term}”` : "No invoices",
    filters.status !== "" ? `with status “${statusLabel}”` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .concat(".");

  const pageButton =
    "grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-stone-600 transition-colors hover:bg-[#faf9f6] hover:text-ink disabled:pointer-events-none disabled:opacity-40";

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
              All invoices
            </h2>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] font-medium tabular-nums text-stone-600">
              {data.total}
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-ink-soft">Newest first</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchBox value={filters.term} onCommit={commitTerm} />

          {/* On a phone the filter and the export share a row: three stacked
              full-width controls made the list start below the fold. */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:w-[148px] sm:flex-none">
              <label htmlFor="invoice-status" className="sr-only">
                Filter by status
              </label>
              <select
                id="invoice-status"
                value={filters.status}
                onChange={(event) =>
                  changeStatus(event.target.value as InvoiceStatus | "")
                }
                className="h-9 w-full appearance-none rounded-lg border border-line bg-white py-0 pl-3 pr-8 text-[13px] text-ink transition-colors hover:border-stone-300 focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
                aria-hidden
              />
            </div>

            <button
              type="button"
              onClick={exportCsv}
              disabled={exporting || data.total === 0}
              aria-label="Export CSV"
              title="Download these invoices as a CSV file"
              className={buttonClass("secondary")}
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden />
              )}
              <span className="hidden min-[360px]:inline">
                {exporting ? "Exporting…" : "Export CSV"}
              </span>
            </button>

            {/* Fixed slot: the list must not jump when a request starts. */}
            <span className="hidden w-16 text-[11px] text-ink-soft sm:block">
              {pending && (
                <span role="status" className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Updating
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {exportError !== "" && (
        <p
          role="alert"
          className="flex items-start gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-[11.5px] text-red-700 sm:px-5"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {exportError}
        </p>
      )}

      {data.items.length === 0 ? (
        <div className="p-4">
          {data.total > 0 ? (
            // A shared link can point past the last page (an invoice was
            // deleted since, or someone edited offset by hand).
            <EmptyState
              icon={SearchX}
              title="This page is empty"
              description={`There ${
                data.total === 1 ? "is" : "are"
              } only ${data.total} ${
                data.total === 1 ? "invoice" : "invoices"
              } matching this view.`}
              action={
                <button
                  type="button"
                  onClick={() => goToPage(0)}
                  className={buttonClass("secondary")}
                >
                  Back to page 1
                </button>
              }
            />
          ) : filters.term === "" && filters.status === "" ? (
            <EmptyState
              icon={SearchX}
              title="No invoices yet"
              description="Upload one above to see it here."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No matches"
              description={noMatchesDescription}
              action={
                <button
                  type="button"
                  onClick={showAll}
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
            Phones get one tappable card per invoice. A multi-column table
            cannot fit 390px without pushing the total off-screen, which is
            exactly the number people look for first.
          */}
          <ul className="divide-y divide-line/70 sm:hidden">
            {data.items.map((invoice: InvoiceSummary) => (
              <li key={invoice.id}>
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="group flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-[#faf9f6]"
                >
                  <InitialAvatar
                    name={invoice.vendor_name}
                    className="h-9 w-9 text-[11px]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">
                      {invoice.vendor_name ?? "Unknown vendor"}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-stone-500">
                      {invoice.invoice_number ?? "—"} ·{" "}
                      {invoice.invoice_date ?? "no date"}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums tracking-[-0.01em] text-ink">
                      {formatMoney(invoice.total_amount, invoice.currency)}
                    </span>
                    <StatusBadge status={invoice.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: the whole row is one link, so the target is the row. */}
          <div className="hidden sm:block">
            <div className="grid grid-cols-[minmax(0,1fr)_104px_104px_20px] gap-4 border-b border-line bg-[#faf9f6]/60 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400 sm:px-5 md:grid-cols-[minmax(0,1fr)_104px_132px_104px_20px]">
              <span>Vendor</span>
              <span className="hidden md:block">Date</span>
              <span className="text-right">Total</span>
              <span>Status</span>
              <span className="sr-only">Open</span>
            </div>

            <ul className="divide-y divide-line/70">
              {data.items.map((invoice: InvoiceSummary) => (
                <li key={invoice.id}>
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="group grid grid-cols-[minmax(0,1fr)_104px_104px_20px] items-center gap-4 px-4 py-3.5 transition-colors hover:bg-[#faf9f6] sm:px-5 md:grid-cols-[minmax(0,1fr)_104px_132px_104px_20px]"
                  >
                    <VendorCell invoice={invoice} />
                    <span className="hidden text-[12.5px] tabular-nums text-ink-soft md:block">
                      {invoice.invoice_date ?? "—"}
                    </span>
                    <span className="whitespace-nowrap text-right text-[13.5px] font-semibold tabular-nums tracking-[-0.01em] text-ink">
                      {formatMoney(invoice.total_amount, invoice.currency)}
                    </span>
                    <span>
                      <StatusBadge status={invoice.status} />
                    </span>
                    <ChevronRight
                      className="h-4 w-4 justify-self-end text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-stone-500"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11.5px] tabular-nums text-stone-500">
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
            className={pageButton}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="px-2 text-[11.5px] tabular-nums text-ink-soft">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => goToPage(data.offset + PAGE_SIZE)}
            disabled={!hasNext || pending}
            aria-label="Next page"
            className={pageButton}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </Card>
  );
}
