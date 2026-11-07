import InvoiceList from "@/components/InvoiceList";
import UploadInvoice from "@/components/UploadInvoice";
import { PageHeader } from "@/components/ui";

export default function Home() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Invoices"
        description="Upload a PDF and Gemini reads the vendor, line items and totals — then the arithmetic is checked before anything is trusted."
      />

      <UploadInvoice />

      <section aria-labelledby="all-invoices">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2
            id="all-invoices"
            className="text-sm font-semibold text-slate-900"
          >
            All invoices
          </h2>
          <p className="text-xs text-slate-500">Newest first</p>
        </div>
        <InvoiceList />
      </section>
    </div>
  );
}
