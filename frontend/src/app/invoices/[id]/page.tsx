import Link from "next/link";
import { Suspense } from "react";

import InvoiceDetail from "@/components/InvoiceDetail";

export default function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <Link
        href="/"
        className="text-sm text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        ← All invoices
      </Link>

      {/*
        Cache Components needs the params promise awaited inside a boundary so
        the static shell can render before the id is known.
      */}
      <Suspense
        fallback={
          <p className="mt-6 rounded-lg border border-slate-200 p-6 text-slate-500">
            Loading invoice…
          </p>
        }
      >
        <InvoiceDetailLoader params={params} />
      </Suspense>
    </main>
  );
}

async function InvoiceDetailLoader({
  params,
}: Pick<PageProps<"/invoices/[id]">, "params">) {
  const { id } = await params;
  return <InvoiceDetail invoiceId={id} />;
}
