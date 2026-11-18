import { ExternalLink, FileText, FileX2 } from "lucide-react";

import { invoiceFileUrl } from "@/lib/api";

import { Card } from "./ui";

/**
 * The original PDF, drawn by the browser's own viewer.
 *
 * An <iframe> is deliberate: pdf.js or a canvas renderer would add megabytes
 * and reimplement paging, zoom and text selection that every browser already
 * ships. The backend serves the file inline, so the browser renders it instead
 * of downloading it.
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
  if (!available) {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
            <FileX2 className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              No original PDF stored
            </p>
            <p className="mt-1 text-sm text-slate-600">
              This invoice was saved without a file — demo rows work this way.
              The extracted fields are still available beside it.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const url = invoiceFileUrl(invoiceId);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
          <h2 className="truncate text-sm font-semibold text-slate-900">
            Original document
          </h2>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          Open PDF
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>

      <div className="bg-slate-100 p-2">
        <iframe
          src={`${url}#view=FitH`}
          title={`PDF preview of ${sourceFilename ?? `invoice ${invoiceId}`}`}
          className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white xl:h-[calc(100vh-9rem)]"
        />
      </div>

      {sourceFilename !== null && (
        <p
          className="truncate border-t border-slate-100 px-4 py-2 text-xs text-slate-500"
          title={sourceFilename}
        >
          {sourceFilename}
        </p>
      )}
    </Card>
  );
}
