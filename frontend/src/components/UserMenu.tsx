"use client";

import { LogOut, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getMe } from "@/lib/api";
import { clearToken } from "@/lib/session";

export default function UserMenu({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "compact";
}) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMe()
      .then((user) => {
        if (!cancelled) setEmail(user.email);
      })
      .catch(() => {
        // AuthGate already handles a dead session; nothing to add here.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function signOut() {
    clearToken();
    router.replace("/login");
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={signOut}
        aria-label="Sign out"
        className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-50"
      >
        <LogOut className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
          <UserRound className="h-3.5 w-3.5" aria-hidden />
        </span>
        <p
          className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700"
          title={email ?? undefined}
        >
          {email ?? "Signed in"}
        </p>
        <button
          type="button"
          onClick={signOut}
          aria-label="Sign out"
          title="Sign out"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
