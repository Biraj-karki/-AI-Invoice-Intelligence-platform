import { Suspense } from "react";

import InvoiceDetail from "@/components/InvoiceDetail";
import { Skeleton } from "@/components/ui";

export default function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  return (
    /*
      Cache Components needs the params promise awaited inside a boundary so
      the static shell can render before the id is known.
    */
    <Suspense fallback={<DetailSkeleton />}>
      <InvoiceDetailLoader params={params} />
    </Suspense>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

async function InvoiceDetailLoader({
  params,
}: Pick<PageProps<"/invoices/[id]">, "params">) {
  const { id } = await params;
  return <InvoiceDetail invoiceId={id} />;
}
