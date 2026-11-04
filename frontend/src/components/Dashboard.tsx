"use client";

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

const BAR_COLOR = "#0f172a"; // slate-900
const LINE_COLOR = "#2563eb"; // blue-600
const GRID_COLOR = "#e2e8f0"; // slate-200
const AXIS_COLOR = "#64748b"; // slate-500

type ChartPoint = { name: string; value: number; label: string };

/**
 * Recharts needs numbers to lay out geometry, so the string amounts are
 * converted here and only here. The exact string travels alongside as `label`
 * and is what the tooltip actually shows.
 */
function toChartPoint(name: string, amount: string, currency: string): ChartPoint {
  return { name, value: Number(amount), label: formatMoney(amount, currency) };
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
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-slate-900">{point.name}</p>
      <p className="tabular-nums text-slate-600">{point.label}</p>
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
      <p className="rounded-lg border border-slate-200 p-6 text-slate-500">
        Loading dashboard…
      </p>
    );
  }

  if (state === "error" || stats === null) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="font-medium text-red-800">Could not load the dashboard</p>
        <p className="mt-1 text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
        >
          Try again
        </button>
      </div>
    );
  }

  if (stats.currencies.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-6 text-slate-500">
        <p>Nothing to chart yet.</p>
        <p className="mt-1 text-sm">
          Upload an invoice and its totals will appear here.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-slate-900 underline underline-offset-2"
        >
          Go to invoices
        </Link>
      </div>
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
    <div>
      {stats.currencies.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {stats.currencies.map((block) => (
            <button
              key={block.currency}
              type="button"
              onClick={() => setSelected(block.currency)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                block.currency === active.currency
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {block.currency}
            </button>
          ))}
        </div>
      )}

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Total spend ({active.currency})
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
            {formatMoney(active.total_amount, active.currency)}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Invoices counted
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
            {active.invoice_count}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Awaiting review
          </dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
            {stats.excluded_count}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-slate-500">
        Only invoices that were extracted cleanly or approved are counted.
        Invoices in review or rejected are excluded, so the totals never include
        numbers nobody has checked.
        {stats.undated_count > 0 && (
          <>
            {" "}
            {stats.undated_count} invoice(s) have no invoice date and appear in
            the vendor chart but not the monthly one.
          </>
        )}
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Spend by vendor
        </h2>
        {vendorData.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No vendor data yet.</p>
        ) : (
          <div className="mt-2 h-80 rounded-lg border border-slate-200 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={vendorData}
                layout="vertical"
                margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
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
                  width={160}
                  tick={{ fontSize: 12, fill: AXIS_COLOR }}
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
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Spend by month
        </h2>
        {monthData.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No dated invoices yet, so there is no monthly trend.
          </p>
        ) : (
          <div className="mt-2 h-72 rounded-lg border border-slate-200 p-4">
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
        )}
      </section>
    </div>
  );
}
