"use client";

import { useEffect, useState } from "react";

import { getHealth } from "@/lib/api";
import { cx } from "./ui";

/**
 * A real reachability check, not a decorative green dot: it calls the health
 * endpoint once on mount. If the backend is down the sidebar says so, which is
 * the first thing you want to know when a page looks empty.
 */
export default function SystemStatus() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then(() => {
        if (!cancelled) setOnline(true);
      })
      .catch(() => {
        if (!cancelled) setOnline(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
        <span
          className={cx(
            "h-2 w-2 rounded-full",
            online === null
              ? "bg-slate-300"
              : online
                ? "bg-emerald-500"
                : "bg-red-500",
          )}
          aria-hidden
        />
        {online === null
          ? "Checking backend…"
          : online
            ? "Backend online"
            : "Backend offline"}
      </div>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">
        Gemini extraction · PDF pipeline
      </p>
    </div>
  );
}
