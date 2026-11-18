import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, getInvoiceStats } from "@/lib/api";
import type { CurrencyStats, InvoiceStats } from "@/lib/types";

import Dashboard from "./Dashboard";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getInvoiceStats: vi.fn(),
  };
});

/**
 * Recharts needs real layout to draw SVG, which jsdom does not provide. These
 * stubs keep the chart's data visible as an attribute so the test can assert on
 * exactly what the chart was handed: numbers for geometry, formatted strings
 * for anything a human reads.
 */
vi.mock("recharts", async () => {
  const React = await import("react");

  const Passthrough = ({ children }: { children?: ReactNode }) =>
    React.createElement("div", null, children);
  Passthrough.displayName = "Passthrough";

  const dataChart = (testId: string) => {
    const Chart = ({
      data,
      children,
    }: {
      data?: unknown;
      children?: ReactNode;
    }) =>
      React.createElement(
        "div",
        { "data-testid": testId, "data-points": JSON.stringify(data ?? []) },
        children,
      );
    Chart.displayName = `DataChart(${testId})`;
    return Chart;
  };

  return {
    ResponsiveContainer: Passthrough,
    BarChart: dataChart("bar-chart"),
    LineChart: dataChart("line-chart"),
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Bar: () => null,
    Line: () => null,
  };
});

const NPR: CurrencyStats = {
  currency: "NPR",
  invoice_count: 16,
  total_amount: "212892.00",
  by_vendor: [
    {
      vendor_name: "ACME SUPPLIES PVT. LTD.",
      invoice_count: 8,
      total_amount: "120000.00",
    },
    { vendor_name: "Short Co", invoice_count: 2, total_amount: "92892.00" },
  ],
  by_month: [{ month: "2026-10", invoice_count: 4, total_amount: "60000.00" }],
};

const USD: CurrencyStats = {
  currency: "USD",
  invoice_count: 3,
  total_amount: "2592.00",
  by_vendor: [
    {
      vendor_name: "CloudServe Inc.",
      invoice_count: 1,
      total_amount: "2592.00",
    },
  ],
  by_month: [],
};

function stats(overrides: Partial<InvoiceStats> = {}): InvoiceStats {
  return {
    currencies: [NPR, USD],
    excluded_count: 2,
    undated_count: 0,
    ...overrides,
  };
}

/** The KPI card that owns a label, so assertions cannot match a stray number. */
function kpi(label: string): HTMLElement {
  const card = screen.getByText(label).closest("div.rounded-xl");
  if (card === null) throw new Error(`No KPI card for “${label}”`);
  return card as HTMLElement;
}

function chartPoints(testId: string) {  const raw = screen.getByTestId(testId).getAttribute("data-points");
  return JSON.parse(raw ?? "[]") as Array<{
    name: string;
    fullName: string;
    value: number;
    label: string;
  }>;
}

beforeEach(() => {
  vi.mocked(getInvoiceStats).mockReset();
});

describe("Dashboard — loading and totals", () => {
  it("shows the first currency's money, count and review backlog", async () => {
    vi.mocked(getInvoiceStats).mockResolvedValue(stats());

    render(<Dashboard />);

    expect(await screen.findByText("212,892.00 NPR")).toBeInTheDocument();
    expect(screen.getByText("Total spend (NPR)")).toBeInTheDocument();
    // Scoped to the KPI card so a stray "16" or "2" elsewhere cannot satisfy it.
    expect(kpi("Invoices counted")).toHaveTextContent("16");
    expect(kpi("Awaiting review")).toHaveTextContent("2");
    expect(getInvoiceStats).toHaveBeenCalledTimes(1);
  });

  it("explains which invoices are excluded from the totals", async () => {
    vi.mocked(getInvoiceStats).mockResolvedValue(stats());

    render(<Dashboard />);

    expect(
      await screen.findByText(/Only invoices that were extracted cleanly/),
    ).toBeInTheDocument();
  });

  it("mentions undated invoices only when there are some", async () => {
    vi.mocked(getInvoiceStats).mockResolvedValue(stats({ undated_count: 3 }));

    render(<Dashboard />);

    expect(
      await screen.findByText(/3 invoice\(s\) have no invoice date/),
    ).toBeInTheDocument();
  });
});

describe("Dashboard — currency isolation", () => {
  it("switching tabs replaces the totals instead of adding currencies", async () => {
    vi.mocked(getInvoiceStats).mockResolvedValue(stats());

    render(<Dashboard />);

    await screen.findByText("212,892.00 NPR");
    fireEvent.click(screen.getByRole("tab", { name: "USD" }));

    expect(await screen.findByText("2,592.00 USD")).toBeInTheDocument();
    expect(screen.queryByText("212,892.00 NPR")).toBeNull();
    expect(screen.getByText("Total spend (USD)")).toBeInTheDocument();
    expect(kpi("Invoices counted")).toHaveTextContent("3");
  });

  it("hides the tabs when there is only one currency", async () => {
    vi.mocked(getInvoiceStats).mockResolvedValue(
      stats({ currencies: [NPR] }),
    );

    render(<Dashboard />);

    await screen.findByText("212,892.00 NPR");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });
});

describe("Dashboard — chart data", () => {
  it("gives Recharts numbers for geometry and exact strings for display", async () => {
    vi.mocked(getInvoiceStats).mockResolvedValue(stats({ currencies: [NPR] }));

    render(<Dashboard />);

    await screen.findByText("212,892.00 NPR");
    const vendorPoints = chartPoints("bar-chart");

    expect(vendorPoints[0].value).toBe(120000);
    expect(vendorPoints[0].label).toBe("120,000.00 NPR");
  });

  it("shortens long vendor names but keeps the full name for the tooltip", async () => {
    vi.mocked(getInvoiceStats).mockResolvedValue(stats({ currencies: [NPR] }));

    render(<Dashboard />);

    await screen.findByText("212,892.00 NPR");
    const [long, short] = chartPoints("bar-chart");

    expect(long.name).toBe("ACME SUPPLIES PVT. LT…");
    expect(long.fullName).toBe("ACME SUPPLIES PVT. LTD.");
    expect(short.name).toBe("Short Co");
  });

  it("rebuilds both charts from the selected currency", async () => {
    vi.mocked(getInvoiceStats).mockResolvedValue(stats());

    render(<Dashboard />);

    await screen.findByText("212,892.00 NPR");
    fireEvent.click(screen.getByRole("tab", { name: "USD" }));

    await screen.findByText("2,592.00 USD");

    expect(chartPoints("bar-chart").map((point) => point.fullName)).toEqual([
      "CloudServe Inc.",
    ]);
    // USD has no dated invoices, so the monthly chart is replaced by an
    // explanation rather than an empty axis.
    expect(
      screen.getByText("No dated invoices yet, so there is no monthly trend."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Spend by vendor in USD" }),
    ).toBeInTheDocument();
  });
});

describe("Dashboard — empty and failure states", () => {
  it("offers a way back to invoices when there is nothing to chart", async () => {
    vi.mocked(getInvoiceStats).mockResolvedValue(stats({ currencies: [] }));

    render(<Dashboard />);

    expect(await screen.findByText("Nothing to chart yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to invoices" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("reports a failed load and retries on demand", async () => {
    vi.mocked(getInvoiceStats)
      .mockRejectedValueOnce(new ApiError("Database is on fire.", 503))
      .mockResolvedValueOnce(stats());

    render(<Dashboard />);

    expect(
      await screen.findByText("Could not load the dashboard"),
    ).toBeInTheDocument();
    expect(screen.getByText("Database is on fire.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("212,892.00 NPR")).toBeInTheDocument();
    await waitFor(() => expect(getInvoiceStats).toHaveBeenCalledTimes(2));
  });
});
