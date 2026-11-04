"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";

import { ApiError, createInvoice } from "@/lib/api";

// Mirrors pdf_service.MAX_UPLOAD_BYTES. Checked here only to fail fast; the
// backend re-checks the real bytes and is the authority.
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_MB = MAX_BYTES / (1024 * 1024);

export default function UploadInvoice() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

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
      setError(`"${next.name}" is not a PDF.`);
      return;
    }

    if (next.size > MAX_BYTES) {
      setFile(null);
      setError(
        `"${next.name}" is ${(next.size / 1024 / 1024).toFixed(1)} MB. ` +
          `The limit is ${MAX_MB} MB.`,
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
    <section className="rounded-lg border border-slate-200 p-6">
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
        Upload an invoice
      </h2>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-slate-900 bg-slate-50" : "border-slate-300"
        } ${busy ? "opacity-60" : ""}`}
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
          <div className="flex flex-col items-center gap-3">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
            <p className="text-sm text-slate-700">
              Extracting with Gemini… this usually takes 10–45 seconds.
            </p>
            {file !== null && (
              <p className="text-xs text-slate-500">{file.name}</p>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              {file === null ? "Drag a PDF here, or" : "Selected:"}
            </p>
            {file !== null && (
              <p className="mt-1 break-all text-sm font-medium text-slate-900">
                {file.name}
              </p>
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              {file === null ? "Choose a PDF" : "Choose a different file"}
            </button>
          </>
        )}
      </div>

      {error !== "" && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={upload}
          disabled={file === null || busy}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? "Uploading…" : "Extract and save"}
        </button>
        <p className="text-xs text-slate-500">
          PDF only, up to {MAX_MB} MB.
        </p>
      </div>
    </section>
  );
}
