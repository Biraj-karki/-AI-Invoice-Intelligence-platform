/**
 * Display helpers shared by every invoice view.
 *
 * Money is formatted as text, never via Number(). The backend sends decimals as
 * strings precisely so a binary float can never round 0.1 + 0.2 wrong; parsing
 * to a float just to add thousand separators would give that guarantee away.
 */

export function formatMoney(
  value: string | null,
  currency: string | null,
): string {
  if (value === null) return "—";

  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (match === null) return value; // Unexpected shape: show it verbatim.

  const [, sign, whole, fraction = ""] = match;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimals = fraction.padEnd(2, "0").slice(0, 2);

  const formatted = `${sign}${grouped}.${decimals}`;
  return currency ? `${formatted} ${currency}` : formatted;
}

/** Quantities arrive as "12.000" from NUMERIC(12,3); drop the trailing zeros. */
export function formatQuantity(value: string | null): string {
  if (value === null) return "—";
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

/** ISO timestamp from the API ("2026-11-04T09:52:37.277193+05:45") -> date only. */
export function formatDate(value: string | null): string {
  if (value === null) return "—";
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : value;
}
