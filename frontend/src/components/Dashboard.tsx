"use client";

import { Clock, FileText, Info, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ApiError, getInvoiceStats } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { CurrencyStats, InvoiceStats } from "@/lib/types";

import { buttonClass, Card, cx, Skeleton } from "./ui";

const BAR_COLOR = "#4f46e5"; // indigo-600
const LINE_COLOR = "#6366f1"; // indigo-500
const GRID_COLOR = "#e5e3dd"; // the warm hairline used across the app
const AXIS_COLOR = "#8a8880"; // muted stone

type ChartPoint = { name: string; value: number; label: string; fullName: string };

/**
 * Recharts needs numbers to lay out geometry, so the string amounts are
 * converted here and only here. The exact string travels alongside as `label`
 * and is what the tooltip actually shows.
 *
 * `name` is shortened because a long vendor name steals plot width on a phone;
 * `fullName` keeps the untruncated value for the tooltip.
 */
function toChartPoint(name: string, amount: string, currency: string): ChartPoint {
  return {
    name: name.length > 22 ? `${name.slice(0, 21)}…` : name,
    fullName: name,
    value: Number(amount),
    label: formatMoney(amount, currency),
  };
}

function compact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

type TooltipPayload = { payload?: ChartPoint };

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (active !== true || payload === undefined || payload.length === 0) {
    return null;
  }

  const point = payload[0]?.payload;
  if (point === undefined) return null;

  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-[0_8px_24px_-12px_rgba(22,23,28,0.35)]">
      <p className="font-medium text-ink">{point.fullName}</p>
      <p className="mt-0.5 tabular-nums text-ink-soft">{point.label}</p>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  accent?: boolean;
}) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-2xl border p-5",
        accent
          ? "border-transparent bg-ink shadow-[0_16px_36px_-22px_rgba(22,23,28,0.9)]"
          : "border-line bg-white shadow-[0_1px_2px_rgba(22,23,28,0.04),0_12px_32px_-24px_rgba(22,23,28,0.35)]",
      )}
    >
      {accent && (
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(220px_120px_at_100%_0%,rgba(99,102,241,0.5),transparent_72%)]"
          aria-hidden
        />
      )}
      <div className="relative flex items-start justify-between gap-3">
        <p
          className={cx(
            "text-[10px] font-semibold uppercase tracking-[0.14em]",
            accent ? "text-white/45" : "text-stone-400",
          )}
        >
          {label}
        </p>
        <span
          className={cx(
            "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
            accent
              ? "bg-white/10 text-white/70 ring-1 ring-inset ring-white/10"
              : "border border-line bg-[#faf9f6] text-stone-400",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p
        className={cx(
          "relative mt-3 text-[26px] leading-none font-semibold tabular-nums tracking-[-0.03em]",
          accent ? "text-white" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getInvoiceStats()
      .then((data) => {
        if (cancelled) return;
        setStats(data);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Unexpected error.");
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function retry() {
    setState("loading");
    setReloadKey((key) => key + 1);
  }

  if (state === "loading") {
    return (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-[118px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  if (state === "error" || stats === null) {
    return (
      <Card className="border-red-200 bg-red-50/60 p-6">
        <p className="text-[15px] font-semibold text-red-800">
          Could not load the dashboard
        </p>
        <p className="mt-1.5 text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={retry}
          className={cx(buttonClass("danger"), "mt-4")}
        >
          Try again
        </button>
      </Card>
    );
  }

  if (stats.currencies.length === 0) {
    return (
      <Card className="flex flex-col items-center px-6 py-16 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl border border-line bg-[#faf9f6] text-stone-400">
          <Wallet className="h-5 w-5" aria-hidden />
        </span>
        <p className="mt-4 text-[13px] font-semibold text-ink">
          Nothing to chart yet
        </p>
        <p className="mt-1 max-w-sm text-[12.5px] leading-5 text-ink-soft">
          Upload an invoice and its totals will appear here.
        </p>
        <Link href="/" className={cx(buttonClass("secondary"), "mt-5")}>
          Go to invoices
        </Link>
      </Card>
    );
  }

  const active: CurrencyStats =
    stats.currencies.find((c) => c.currency === selected) ?? stats.currencies[0];

  const vendorData = active.by_vendor.map((vendor) =>
    toChartPoint(vendor.vendor_name, vendor.total_amount, active.currency),
  );
  const monthData = active.by_month.map((month) =>
    toChartPoint(month.month, month.total_amount, active.currency),
  );

  return (
    <div className="space-y-5">
      {stats.currencies.length > 1 && (
        <div
          className="inline-flex rounded-xl border border-line bg-white p-1 shadow-[0_1px_2px_rgba(22,23,28,0.04)]"
          role="tablist"
          aria-label="Currency"
        >
          {stats.currencies.map((block) => (
            <button
              key={block.currency}
              type="button"
              role="tab"
              aria-selected={block.currency === active.currency}
              onClick={() => setSelected(block.currency)}
              className={cx(
                "rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                block.currency === active.currency
                  ? "bg-ink text-white shadow-sm"
                  : "text-ink-soft hover:bg-stone-900/[0.05] hover:text-ink",
              )}
            >
              {block.currency}
            </button>
          ))}
        </div>
      )}

      <dl className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label={`Total spend (${active.currency})`}
          value={formatMoney(active.total_amount, active.currency)}
          icon={Wallet}
          accent
        />
        <Kpi
          label="Invoices counted"
          value={String(active.invoice_count)}
          icon={FileText}
        />
        <Kpi
          label="Awaiting review"
          value={String(stats.excluded_count)}
          icon={Clock}
        />
      </dl>

      <p className="flex items-start gap-2 text-[11.5px] leading-5 text-stone-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Only invoices that were extracted cleanly or approved are counted.
          Invoices in review or rejected are excluded, so the totals never
          include numbers nobody has checked.
          {stats.undated_count > 0 && (
            <>
              {" "}
              {stats.undated_count} invoice(s) have no invoice date and appear in
              the vendor chart but not the monthly one.
            </>
          )}
        </span>
      </p>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
            Spend by vendor
          </h2>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] font-medium text-stone-600">
            {active.currency}
          </span>
        </div>
        {vendorData.length === 0 ? (
          <p className="px-5 py-10 text-sm text-ink-soft">No vendor data yet.</p>
        ) : (
          <div className="h-80 p-4">
            <div
              className="h-full w-full"
              role="img"
              aria-label={`Spend by vendor in ${active.currency}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={vendorData}
                  layout="vertical"
                  margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
                >
                  <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={compact}
                    tick={{ fontSize: 11, fill: AXIS_COLOR }}
                    stroke={GRID_COLOR}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    tick={{ fontSize: 11, fill: AXIS_COLOR }}
                    stroke={GRID_COLOR}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: "#faf9f6" }}
                  />
                  <Bar
                    dataKey="value"
                    fill={BAR_COLOR}
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
            Spend by month
          </h2>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] font-medium text-stone-600">
            {active.currency}
          </span>
        </div>
        {monthData.length === 0 ? (
          <p className="px-5 py-10 text-sm text-ink-soft">
            No dated invoices yet, so there is no monthly trend.
          </p>
        ) : (
          <div className="h-72 p-4">
            <div
              className="h-full w-full"
              role="img"
              aria-label={`Spend by month in ${active.currency}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={monthData}
                  margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
                >
                  <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: AXIS_COLOR }}
                    stroke={GRID_COLOR}
                  />
                  <YAxis
                    tickFormatter={compact}
                    width={70}
                    tick={{ fontSize: 11, fill: AXIS_COLOR }}
                    stroke={GRID_COLOR}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={LINE_COLOR}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
