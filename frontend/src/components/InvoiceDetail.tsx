"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  ApiError,
  deleteInvoice,
  getInvoice,
  resolveInvoice,
} from "@/lib/api";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import type { InvoiceDetail as InvoiceDetailData } from "@/lib/types";

import InvoiceFieldsForm from "./InvoiceFieldsForm";
import PdfPreview from "./PdfPreview";
import StatusBadge from "./StatusBadge";
import { buttonClass, Card, cx, InitialAvatar } from "./ui";

type State = "loading" | "ready" | "missing" | "error";

export default function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetailData | null>(null);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [resolving, setResolving] = useState<"approved" | "rejected" | null>(
    null,
  );
  const [actionError, setActionError] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>("");

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
        // A correction belongs to one invoice: switching invoices or retrying
        // must not leave an editor pointing at the previous one.
        setEditing(false);
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

  async function remove() {
    if (invoice === null || deleting) return;

    setDeleting(true);
    setDeleteError("");

    try {
      await deleteInvoice(invoice.id);
      // The page the user is looking at no longer exists, so replace rather
      // than push: Back must not land on a 404.
      router.replace("/");
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
      setDeleting(false);
    }
  }

  if (numericId === null || state === "missing") {
    return (
      <Card className="p-8">
        <p className="text-[15px] font-semibold text-ink">Invoice not found</p>
        <p className="mt-1.5 text-sm text-ink-soft">
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
      <Card className="flex items-center gap-3 p-8 text-sm text-ink-soft">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        Loading invoice…
      </Card>
    );
  }

  if (state === "error" || invoice === null) {
    return (
      <Card className="border-red-200 bg-red-50/60 p-6">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-red-800">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Could not load this invoice
        </p>
        <p className="mt-1.5 text-sm text-red-700">{error}</p>
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
  // A demo row has no stored file. Reserving the preview column for it would
  // leave half the page empty, so the layout is two columns only when there is
  // actually a document to show.
  const hasPdf =
    invoice.stored_path !== null && invoice.stored_path !== "";

  return (
    <div className="space-y-6 animate-rise">
      <nav className="flex items-center gap-1.5 text-[12px] text-stone-500">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-md py-1 pr-1 font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Invoices
        </Link>
        <span aria-hidden className="text-stone-300">
          /
        </span>
        <span className="truncate text-ink">
          {invoice.invoice_number ?? `#${invoice.id}`}
        </span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5 sm:gap-4">
          <InitialAvatar
            name={invoice.vendor_name}
            className="h-11 w-11 rounded-xl text-base sm:h-14 sm:w-14 sm:text-xl"
          />
          <div className="min-w-0">
            <h1 className="text-[23px] leading-[1.15] font-semibold tracking-[-0.03em] break-words text-ink sm:text-[30px]">
              {invoice.vendor_name ?? "Unknown vendor"}
            </h1>
            <p className="mt-1 truncate text-[12.5px] text-ink-soft">
              {invoice.invoice_number ?? "No invoice number"}
              {invoice.invoice_date !== null && ` · ${invoice.invoice_date}`}
            </p>
          </div>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      <div
        className={cx(
          "grid items-start gap-6",
          hasPdf && "xl:grid-cols-2",
        )}
      >
        <div className="min-w-0 space-y-5">
          {!hasPdf && (
            <PdfPreview
              invoiceId={invoice.id}
              sourceFilename={invoice.source_filename}
              available={false}
            />
          )}

          {invoice.issues.length > 0 && (
            <div
              className={cx(
                "rounded-2xl border p-4 sm:p-5",
                invoice.status === "review"
                  ? "border-amber-200/80 bg-amber-50/80"
                  : "border-line bg-white",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cx(
                    "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg",
                    invoice.status === "review"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-stone-100 text-stone-500",
                  )}
                  aria-hidden
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cx(
                      "text-[13px] font-semibold tracking-[-0.005em]",
                      invoice.status === "review"
                        ? "text-amber-900"
                        : "text-ink",
                    )}
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
                    className={cx(
                      "mt-2 list-disc space-y-1 pl-4 text-[12.5px] leading-5",
                      invoice.status === "review"
                        ? "text-amber-900/85"
                        : "text-ink-soft",
                    )}
                  >
                    {invoice.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>

                  {invoice.status === "review" && !editing && (
                    <div className="mt-4 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        disabled={resolving !== null}
                        className={buttonClass("secondary")}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                        Edit fields
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
                      <button
                        type="button"
                        onClick={() => void resolve("approved")}
                        disabled={resolving !== null}
                        className={cx(
                          buttonClass("primary"),
                          "min-[380px]:col-span-2 sm:col-span-1",
                        )}
                      >
                        <Check className="h-4 w-4" aria-hidden />
                        {resolving === "approved" ? "Approving…" : "Approve"}
                      </button>
                    </div>
                  )}

                  {actionError !== "" && (
                    <p role="alert" className="mt-3 text-[12.5px] text-red-700">
                      {actionError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {editing ? (
            <InvoiceFieldsForm
              key={invoice.id}
              invoice={invoice}
              onSaved={(updated) => {
                setInvoice(updated);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            /*
              2x2, not 4-across: on xl the data column is only half the page, so
              four cards would squeeze "5,425.00 NPR" onto two lines.
            */
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-white p-4">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                  Invoice date
                </dt>
                <dd className="mt-1.5 text-[13px] font-medium text-ink">
                  {invoice.invoice_date ?? "—"}
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-white p-4">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                  Subtotal
                </dt>
                <dd className="mt-1.5 text-[13px] font-medium tabular-nums text-ink">
                  {formatMoney(invoice.subtotal, invoice.currency)}
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-white p-4">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                  Tax
                </dt>
                <dd className="mt-1.5 text-[13px] font-medium tabular-nums text-ink">
                  {formatMoney(invoice.tax_amount, invoice.currency)}
                </dd>
              </div>

              {/* The total is the number people came for, so it gets the one
                  dark surface on the page. */}
              <div className="relative overflow-hidden rounded-xl bg-ink p-4 shadow-[0_12px_28px_-18px_rgba(22,23,28,0.95)] max-[359px]:col-span-2">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(130px_70px_at_100%_0%,rgba(99,102,241,0.5),transparent_72%)]"
                  aria-hidden
                />
                <dt className="relative text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  Total
                </dt>
                <dd className="relative mt-1.5 text-[17px] font-semibold tabular-nums tracking-[-0.02em] text-white">
                  {formatMoney(invoice.total_amount, invoice.currency)}
                </dd>
              </div>
            </dl>
          )}

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
              <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
                Line items
              </h2>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] font-medium tabular-nums text-stone-600">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            </div>

            {itemCount === 0 ? (
              <p className="px-4 py-8 text-sm text-ink-soft sm:px-5">
                No line items were extracted from this invoice.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-[#faf9f6]/70 text-[10px] uppercase tracking-[0.14em] text-stone-400">
                      <th className="px-4 py-2.5 font-semibold sm:px-5">
                        Description
                      </th>
                      <th className="px-2 py-2.5 text-right font-semibold sm:px-5">
                        Qty
                      </th>
                      {/* Unit price is derivable from qty and amount, so it is the
                          first thing to drop when the screen is narrow. */}
                      <th className="hidden px-5 py-2.5 text-right font-semibold sm:table-cell">
                        Unit price
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold sm:px-5">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {invoice.line_items.map((item) => (
                      <tr
                        key={item.id}
                        className="transition-colors hover:bg-[#faf9f6]"
                      >
                        <td className="px-4 py-3 text-ink sm:px-5">
                          {item.description ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums text-ink-soft sm:px-5">
                          {formatQuantity(item.quantity)}
                        </td>
                        <td className="hidden whitespace-nowrap px-5 py-3 text-right tabular-nums text-ink-soft sm:table-cell">
                          {formatMoney(item.unit_price, invoice.currency)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-ink sm:px-5">
                          {formatMoney(item.amount, invoice.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="text-[11.5px] text-stone-500">
            Saved from{" "}
            <span className="font-mono">
              {invoice.source_filename ?? "unknown"}
            </span>{" "}
            on {formatDate(invoice.created_at)}
          </p>

          {/*
            A quiet link until it is clicked, then an explicit two-button confirm.
            Deleting is the one action here that cannot be undone, so it never
            happens on a single stray click.
          */}
          <div className="border-t border-line pt-4">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(true);
                  setDeleteError("");
                }}
                className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-stone-500 transition-colors hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete invoice
              </button>
            ) : (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="flex items-start gap-2 text-[12.5px] leading-5 text-red-800">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden
                  />
                  Delete this invoice and its PDF? This cannot be undone.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 pl-6">
                  <button
                    type="button"
                    onClick={() => void remove()}
                    disabled={deleting}
                    className={buttonClass("danger")}
                  >
                    {deleting ? "Deleting…" : "Delete forever"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className={buttonClass("secondary")}
                  >
                    Keep it
                  </button>
                </div>
                {deleteError !== "" && (
                  <p role="alert" className="mt-3 pl-6 text-[12.5px] text-red-700">
                    {deleteError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/*
          Beside the fields on wide screens, so a reviewer can check the AI
          against the source without switching tabs; below them on narrow ones.
        */}
        {hasPdf && (
          <div className="min-w-0 xl:sticky xl:top-6">
            <PdfPreview
              invoiceId={invoice.id}
              sourceFilename={invoice.source_filename}
              available
            />
          </div>
        )}
      </div>
    </div>
  );
}
