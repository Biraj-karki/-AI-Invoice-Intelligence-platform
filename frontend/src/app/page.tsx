import InvoiceList from "@/components/InvoiceList";
import UploadInvoice from "@/components/UploadInvoice";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Invoice Intelligence
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload a PDF invoice and Gemini extracts the fields for you.
        </p>
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
