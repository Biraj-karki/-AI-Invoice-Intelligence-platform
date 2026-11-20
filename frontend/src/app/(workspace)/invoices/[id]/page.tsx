import { Suspense } from "react";

import InvoiceDetail from "@/components/InvoiceDetail";
import { Skeleton } from "@/components/ui";

// AuthGate renders this page only in the browser, so there is no server shell
// for Next's instant-navigation validator to inspect. The gate is intentional,
// so the dev-only check is opted out rather than worked around.
export const instant = false;

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
      <Skeleton className="h-3.5 w-28" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[74px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
    </div>
  );
}

async function InvoiceDetailLoader({
  params,
}: Pick<PageProps<"/invoices/[id]">, "params">) {
  const { id } = await params;
  return <InvoiceDetail invoiceId={id} />;
}
