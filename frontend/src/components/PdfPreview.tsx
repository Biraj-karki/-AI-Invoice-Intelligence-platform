"use client";

import { AlertCircle, ExternalLink, FileText, FileX2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, getInvoiceFile } from "@/lib/api";

import { buttonClass, Card, Skeleton } from "./ui";

/**
 * The original PDF, drawn by the browser's own viewer.
 *
 * An <iframe> is deliberate: pdf.js or a canvas renderer would add megabytes
 * and reimplement paging, zoom and text selection that every browser already
 * ships. The bytes are fetched with the auth header and turned into an object
 * URL, because an iframe cannot carry an Authorization header itself.
 */
export default function PdfPreview({
  invoiceId,
  sourceFilename,
  available,
}: {
  invoiceId: number;
  sourceFilename: string | null;
  available: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!available) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    getInvoiceFile(invoiceId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "The PDF could not be loaded.",
        );
        setState("error");
      });

    return () => {
      cancelled = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [invoiceId, available, reloadKey]);

  function retry() {
    setState("loading");
    setReloadKey((key) => key + 1);
  }

  if (!available) {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-[#faf9f6] text-stone-400">
            <FileX2 className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">
              No original PDF stored
            </p>
            <p className="mt-1 text-[12.5px] leading-5 text-ink-soft">
              This invoice was saved without a file — demo rows work this way.
              The extracted fields are still available below.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-red-50 text-red-600 ring-1 ring-inset ring-red-100">
            <FileText className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">
              Original document
            </h2>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-stone-400">
              PDF source
            </p>
          </div>
        </div>
        {state === "ready" && src !== null ? (
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
          >
            Open PDF
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : (
          <span className="text-[11.5px] text-stone-400">Loading…</span>
        )}
      </div>

      <div className="bg-[#f2f0ea] p-2">
        {state === "ready" && src !== null ? (
          <iframe
            src={`${src}#view=FitH`}
            title={`PDF preview of ${sourceFilename ?? `invoice ${invoiceId}`}`}
            className="h-[70vh] w-full rounded-lg border border-line bg-white xl:h-[calc(100vh-9rem)]"
          />
        ) : state === "error" ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg bg-white p-6 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-red-50 text-red-600">
              <AlertCircle className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-[13px] font-semibold text-ink">
              Could not load the PDF
            </p>
            <p className="max-w-sm text-[12.5px] leading-5 text-ink-soft">
              {error}
            </p>
            {error.startsWith("Your session expired") ? (
              <Link href="/login" className={buttonClass("secondary")}>
                Sign in again
              </Link>
            ) : (
              <button
                type="button"
                onClick={retry}
                className={buttonClass("secondary")}
              >
                Try again
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2 rounded-lg bg-white p-4">
            <span className="sr-only">Loading the original PDF…</span>
            <Skeleton className="h-[60vh] w-full rounded-lg" />
          </div>
        )}
      </div>

      {sourceFilename !== null && (
        <p
          className="truncate border-t border-line px-4 py-2 font-mono text-[11px] text-stone-500"
          title={sourceFilename}
        >
          {sourceFilename}
        </p>
      )}
    </Card>
  );
}
