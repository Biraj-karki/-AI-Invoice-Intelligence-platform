import { BarChart3, FileText } from "lucide-react";
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
                "grid h-9 w-9 place-items-center rounded-lg",
                active
                  ? "bg-slate-100 text-indigo-600"
                  : "text-slate-500 hover:bg-slate-50",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex-1 space-y-1 px-3">
      <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        Workspace
      </p>
      {NAV.map((item) => {
        const active = pathname !== null && item.isActive(pathname);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-slate-100 font-medium text-slate-900"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            <Icon
              className={cx(
                "h-4 w-4",
                active ? "text-indigo-600" : "text-slate-400",
              )}
              aria-hidden
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
