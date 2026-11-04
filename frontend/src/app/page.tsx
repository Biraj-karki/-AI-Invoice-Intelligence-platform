import InvoiceList from "@/components/InvoiceList";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Invoice Intelligence
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Invoices extracted from PDFs by the FastAPI backend.
        </p>
      </header>

      <InvoiceList />
    </main>
  );
}
