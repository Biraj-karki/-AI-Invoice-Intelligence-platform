import Link from "next/link";

import Dashboard from "@/components/Dashboard";

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link
        href="/"
        className="text-sm text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        ← All invoices
      </Link>

      <header className="mb-8 mt-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Spend dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Where the money goes, per currency. Currencies are never added
          together.
        </p>
      </header>

      <Dashboard />
    </main>
  );
}
