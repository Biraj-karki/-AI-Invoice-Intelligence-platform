"use client";

import { usePathname } from "next/navigation";

import { NavItems } from "./NavItems";

/**
 * Reads the pathname to mark the active link. Isolated in its own client
 * component so AppShell can wrap only this in Suspense: with Cache Components,
 * usePathname suspends on routes whose dynamic params are not known at build
 * time (e.g. /invoices/[id]), and wrapping the whole shell would defer the
 * entire layout instead of just the nav highlight.
 */
export default function NavLinks({
  variant,
}: {
  variant: "desktop" | "mobile";
}) {
  const pathname = usePathname();

  return <NavItems pathname={pathname} variant={variant} />;
}
