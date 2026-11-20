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
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
      <div className="flex items-center gap-2 text-[11px] font-medium text-white/65">
        <span
          className={cx(
            "h-1.5 w-1.5 rounded-full",
            online === null
              ? "bg-white/30"
              : online
                ? "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.15)]"
                : "bg-red-400",
          )}
          aria-hidden
        />
        {online === null
          ? "Checking backend…"
          : online
            ? "Backend online"
            : "Backend offline"}
      </div>
      <p className="mt-1 text-[10.5px] leading-4 text-white/30">
        Gemini extraction · PDF pipeline
      </p>
    </div>
  );
}
