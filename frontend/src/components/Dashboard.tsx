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
const GRID_COLOR = "#e2e8f0"; // slate-200
const AXIS_COLOR = "#64748b"; // slate-500

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
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{point.fullName}</p>
      <p className="tabular-nums text-slate-600">{point.label}</p>
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
        "rounded-xl border p-5 shadow-sm",
        accent
          ? "border-indigo-200 bg-indigo-50/60"
          : "border-slate-200/80 bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cx(
            "text-xs font-medium uppercase tracking-wide",
            accent ? "text-indigo-700" : "text-slate-500",
          )}
        >
          {label}
        </p>
        <span
          className={cx(
            "grid h-8 w-8 place-items-center rounded-lg",
            accent
              ? "bg-indigo-100 text-indigo-700"
              : "bg-slate-100 text-slate-500",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
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
      <div className="space-y-8">
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (state === "error" || stats === null) {
    return (
      <Card className="border-red-200 bg-red-50/60 p-6">
        <p className="font-medium text-red-800">Could not load the dashboard</p>
        <p className="mt-1 text-sm text-red-700">{error}</p>
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
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-500">
          <Wallet className="h-5 w-5" aria-hidden />
        </span>
        <p className="mt-4 text-sm font-medium text-slate-900">
          Nothing to chart yet
        </p>
        <p className="mt-1 max-w-sm text-sm text-slate-600">
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
    <div className="space-y-6">
      {stats.currencies.length > 1 && (
        <div
          className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
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
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                block.currency === active.currency
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50",
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

      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
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
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Spend by vendor
          </h2>
          <span className="text-xs text-slate-500">{active.currency}</span>
        </div>
        {vendorData.length === 0 ? (
          <p className="px-5 py-10 text-sm text-slate-500">No vendor data yet.</p>
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
                    tick={{ fontSize: 12, fill: AXIS_COLOR }}
                    stroke={GRID_COLOR}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    tick={{ fontSize: 11, fill: AXIS_COLOR }}
                    stroke={GRID_COLOR}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f8fafc" }} />
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
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Spend by month
          </h2>
          <span className="text-xs text-slate-500">{active.currency}</span>
        </div>
        {monthData.length === 0 ? (
          <p className="px-5 py-10 text-sm text-slate-500">
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
                    tick={{ fontSize: 12, fill: AXIS_COLOR }}
                    stroke={GRID_COLOR}
                  />
                  <YAxis
                    tickFormatter={compact}
                    width={70}
                    tick={{ fontSize: 12, fill: AXIS_COLOR }}
                    stroke={GRID_COLOR}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={LINE_COLOR}
                    strokeWidth={2}
                    dot={{ r: 3 }}
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
