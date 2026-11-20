import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { NavItems } from "./NavItems";
import NavLinks from "./NavLinks";
import SystemStatus from "./SystemStatus";
import UserMenu from "./UserMenu";

export function Logo({
  compact = false,
  href = "/",
  tone = "light",
}: {
  compact?: boolean;
  href?: string;
  tone?: "light" | "dark";
}) {
  return (
    <Link href={href} className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.9)] ring-1 ring-inset ring-white/15">
        <Sparkles className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className={compact ? "sr-only" : "block min-w-0"}>
        <span
          className={
            tone === "dark"
              ? "block truncate text-[13px] font-semibold tracking-[-0.01em] text-white"
              : "block truncate text-[13px] font-semibold tracking-[-0.01em] text-ink"
          }
        >
          Invoice Intelligence
        </span>
        <span
          className={
            tone === "dark"
              ? "mt-0.5 block text-[9.5px] font-medium uppercase tracking-[0.16em] text-white/35"
              : "mt-0.5 block text-[9.5px] font-medium uppercase tracking-[0.16em] text-stone-400"
          }
        >
          AI document processing
        </span>
      </span>
    </Link>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas bg-[radial-gradient(1100px_420px_at_88%_-140px,rgba(99,102,241,0.10),transparent_70%)] lg:pl-[264px]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col bg-ink text-white/70 lg:flex">
        <div className="px-5 pb-6 pt-6">
          <Logo tone="dark" />
        </div>

        <Suspense fallback={<NavItems pathname={null} variant="desktop" />}>
          <NavLinks variant="desktop" />
        </Suspense>

        <div className="mt-auto space-y-2 border-t border-white/[0.06] p-3">
          <UserMenu />
          <SystemStatus />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <Logo compact />
          <div className="flex items-center gap-1">
            <Suspense fallback={<NavItems pathname={null} variant="mobile" />}>
              <NavLinks variant="mobile" />
            </Suspense>
            <UserMenu variant="compact" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-8 sm:px-6 lg:px-10 lg:pt-12">
        {children}
      </main>
    </div>
  );
}
