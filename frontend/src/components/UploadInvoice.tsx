"use client";

import { AlertCircle, FileText, Sparkles, Upload, X } from "lucide-react";
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
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-600" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">AI extraction</h2>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-100">
            Gemini
          </span>
        </div>
        <p className="text-xs text-slate-500">PDF only · up to {MAX_MB} MB</p>
      </div>

      <div className="p-5">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            "rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
            dragging
              ? "border-indigo-400 bg-indigo-50/60"
              : "border-slate-200 bg-slate-50/60",
            busy && "opacity-80",
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
            <div className="mx-auto flex max-w-md flex-col items-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              </span>
              <p className="mt-4 text-sm font-medium text-slate-900">
                {busyMessage(elapsed)}
              </p>
              {file !== null && (
                <p className="mt-1 max-w-full truncate text-xs text-slate-500">
                  {file.name}
                </p>
              )}
              <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="animate-sheen h-full w-full bg-gradient-to-r from-indigo-200 via-indigo-500 to-indigo-200" />
              </div>
              <p className="mt-2 text-[11px] tabular-nums text-slate-400">
                {elapsed}s elapsed
              </p>
            </div>
          ) : file === null ? (
            <div className="flex flex-col items-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                <Upload className="h-5 w-5" aria-hidden />
              </span>
              <p className="mt-4 text-sm font-medium text-slate-900">
                Drop a PDF invoice here
              </p>
              <p className="mt-1 text-xs text-slate-500">
                or choose a file — Gemini will read it for you
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={cx(buttonClass("secondary"), "mt-4")}
              >
                <FileText className="h-4 w-4" aria-hidden />
                Choose a PDF
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="flex w-full max-w-md items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {file.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {humanSize(file.size)} · ready to extract
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => choose(null)}
                  aria-label="Remove file"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-3 text-xs font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
              >
                Choose a different file
              </button>
            </div>
          )}
        </div>

        {error !== "" && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            The extraction is checked against the invoice&apos;s own arithmetic.
            If the totals disagree, you get a review, not a guess.
          </p>
          <button
            type="button"
            onClick={() => void upload()}
            disabled={file === null || busy}
            className={buttonClass("primary", "md")}
          >
            {busy ? "Uploading…" : "Extract and save"}
          </button>
        </div>
      </div>
    </Card>
  );
}
