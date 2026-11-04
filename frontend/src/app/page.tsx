import Link from "next/link";

import InvoiceList from "@/components/InvoiceList";
import UploadInvoice from "@/components/UploadInvoice";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Invoice Intelligence
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Upload a PDF invoice and Gemini extracts the fields for you.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Spend dashboard →
        </Link>
      </header>

      <div className="mb-10">
        <UploadInvoice />
      </div>

      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
        Saved invoices
      </h2>
      <InvoiceList />
    </main>
  );
}
