"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { ApiError, getMe } from "@/lib/api";
import { clearToken, getToken } from "@/lib/session";

/**
 * Client-side gate for the workspace.
 *
 * Real enforcement is server-side (every /invoices route requires a bearer
 * token); this only decides what to render. Children mount after the token is
 * verified, so a page never fires its own request with a dead session and
 * flashes an error first.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (getToken() === null) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    getMe()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          router.replace("/login");
          return;
        }

        // Backend unreachable or broken: let the page show its own error
        // instead of trapping the user on a spinner.
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        <p className="text-sm text-ink-soft">Checking your session…</p>
      </div>
    );
  }

  return children;
}
