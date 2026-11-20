import { BarChart3, FileText, UserRound } from "lucide-react";
import Link from "next/link";

import { cx } from "./ui";

const NAV = [
  {
    href: "/",
    label: "Invoices",
    icon: FileText,
    isActive: (path: string) => path === "/" || path.startsWith("/invoices"),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: BarChart3,
    isActive: (path: string) => path.startsWith("/dashboard"),
  },
  {
    href: "/account",
    label: "Account",
    icon: UserRound,
    isActive: (path: string) => path.startsWith("/account"),
  },
];

/**
 * Presentational nav, shared by the client component (which knows the pathname)
 * and the server-rendered Suspense fallback (which does not). With a null
 * pathname nothing is marked active.
 */
export function NavItems({
  pathname,
  variant,
}: {
  pathname: string | null;
  variant: "desktop" | "mobile";
}) {
  if (variant === "mobile") {
    return (
      <nav className="flex items-center gap-1">
        {NAV.map((item) => {
          const active = pathname !== null && item.isActive(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cx(
                "grid h-9 w-9 place-items-center rounded-lg transition-colors",
                active
                  ? "bg-ink text-white shadow-sm"
                  : "text-stone-500 hover:bg-stone-900/[0.06] hover:text-ink",
              )}
            >
              <Icon className="h-[17px] w-[17px]" aria-hidden />
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex-1 px-3">
      <p className="px-3 pb-2.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/30">
        Workspace
      </p>
      <div className="space-y-0.5">
        {NAV.map((item) => {
          const active = pathname !== null && item.isActive(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
                active
                  ? "bg-white/[0.07] font-medium text-white"
                  : "text-white/55 hover:bg-white/[0.04] hover:text-white/90",
              )}
            >
              {active && (
                <span
                  className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-indigo-400"
                  aria-hidden
                />
              )}
              <Icon
                className={cx(
                  "h-[17px] w-[17px]",
                  active ? "text-indigo-300" : "text-white/35",
                )}
                aria-hidden
              />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
