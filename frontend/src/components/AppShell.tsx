import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { NavItems } from "./NavItems";
import NavLinks from "./NavLinks";
import SystemStatus from "./SystemStatus";

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white shadow-sm">
        <Sparkles className="h-4 w-4" aria-hidden />
      </span>
      <span className={compact ? "sr-only" : "block"}>
        <span className="block text-sm font-semibold tracking-tight text-slate-900">
          Invoice Intelligence
        </span>
        <span className="block text-[11px] text-slate-500">
          AI document processing
        </span>
      </span>
    </Link>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-5 py-5">
          <Logo />
        </div>

        <Suspense fallback={<NavItems pathname={null} variant="desktop" />}>
          <NavLinks variant="desktop" />
        </Suspense>

        <div className="p-3">
          <SystemStatus />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo compact />
          <Suspense fallback={<NavItems pathname={null} variant="mobile" />}>
            <NavLinks variant="mobile" />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  );
}
