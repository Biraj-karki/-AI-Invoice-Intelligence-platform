"use client";

import {
  AlertCircle,
  FileText,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";

import { ApiError, createInvoice } from "@/lib/api";

import { buttonClass, Card, cx } from "./ui";

// Mirrors pdf_service.MAX_UPLOAD_BYTES. Checked here only to fail fast; the
// backend re-checks the real bytes and is the authority.
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_MB = MAX_BYTES / (1024 * 1024);

function humanSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Honest progress copy: the request has no progress events, so we describe
 * what Gemini is doing at each elapsed-time milestone instead of faking a
 * percentage that would sit at 90% forever.
 */
function busyMessage(seconds: number): string {
  if (seconds < 8) return "Reading the document and extracting fields with Gemini…";
  if (seconds < 30)
    return "Still working — Gemini is reading every page. This usually takes 10–45 seconds.";
  return "Large or complex invoices can take up to a minute. The extraction is still running.";
}

export default function UploadInvoice() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  // Count seconds only while a request is in flight, so the message can evolve.
  useEffect(() => {
    if (!busy) return;

    const timer = setInterval(() => {
      setElapsed((seconds) => seconds + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [busy]);

  function choose(next: File | null) {
    setError("");

    if (next === null) {
      setFile(null);
      return;
    }

    // Extension only: MIME types are unreliable, and the backend checks the
    // actual file signature anyway.
    if (!next.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setError(`“${next.name}” is not a PDF.`);
      return;
    }

    if (next.size > MAX_BYTES) {
      setFile(null);
      setError(
        `“${next.name}” is ${humanSize(next.size)}. The limit is ${MAX_MB} MB.`,
      );
      return;
    }

    setFile(next);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;

    const dropped = event.dataTransfer.files.item(0);
    if (dropped !== null) choose(dropped);
  }

  async function upload() {
    if (file === null || busy) return;

    setBusy(true);
    setElapsed(0);
    setError("");

    try {
      const invoice = await createInvoice(file);
      // Only navigate on success. A failed upload must leave the form usable.
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unexpected error.");
      setBusy(false);
    }
  }

  return (
    <Card className="relative overflow-hidden">
      {/* A faint wash behind the header, so the intake reads as the "AI" part
          of the page without a second colour entering the palette. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(460px_140px_at_12%_0%,rgba(99,102,241,0.10),transparent_75%)]"
        aria-hidden
      />

      <div className="relative p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
                New invoice
              </h2>
              <p className="text-[11.5px] text-ink-soft">
                Gemini reads the PDF, the arithmetic decides the outcome.
              </p>
            </div>
          </div>
          <p className="hidden text-[10.5px] font-medium uppercase tracking-[0.12em] text-stone-400 sm:block">
            PDF · up to {MAX_MB} MB
          </p>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            "mt-4 rounded-xl border border-dashed p-4 transition-colors sm:px-5",
            dragging
              ? "border-indigo-400 bg-indigo-50/60"
              : "border-stone-300 bg-[#faf9f6]/70",
            busy && "opacity-90",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={busy}
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
          />

          {busy ? (
            <div className="mx-auto flex max-w-md flex-col items-center py-2">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm ring-1 ring-line">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              </span>
              <p className="mt-3 text-center text-[13px] font-medium text-ink">
                {busyMessage(elapsed)}
              </p>
              {file !== null && (
                <p className="mt-1 max-w-full truncate text-[11.5px] text-ink-soft">
                  {file.name}
                </p>
              )}
              <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-stone-200">
                <div className="animate-sheen h-full w-full bg-gradient-to-r from-indigo-200 via-indigo-500 to-indigo-200" />
              </div>
              <p className="mt-2 text-[10.5px] tabular-nums text-stone-400">
                {elapsed}s elapsed
              </p>
            </div>
          ) : file === null ? (
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-white text-stone-400 shadow-[0_1px_2px_rgba(22,23,28,0.04)]">
                <Upload className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">
                  Drop a PDF invoice here
                </p>
                <p className="mt-0.5 text-[12px] text-ink-soft">
                  or choose a file — Gemini reads vendor, line items and totals.
                </p>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={cx(buttonClass("secondary"), "w-full sm:w-auto")}
              >
                <FileText className="h-4 w-4" aria-hidden />
                Choose a PDF
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
                <FileText className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink">
                  {file.name}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-soft">
                  {humanSize(file.size)} · ready to extract
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void upload()}
                  className={cx(buttonClass("primary"), "flex-1 sm:flex-none")}
                >
                  Extract and save
                </button>
                <button
                  type="button"
                  onClick={() => choose(null)}
                  aria-label="Remove file"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-stone-400 transition-colors hover:bg-stone-900/[0.06] hover:text-ink"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>

        {error !== "" && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-stone-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Every extraction is checked against the invoice&apos;s own arithmetic.
          If the totals disagree, it goes to review — never silently accepted.
        </p>
      </div>
    </Card>
  );
}
