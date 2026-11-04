import { describe, expect, it } from "vitest";

import { formatDate, formatMoney, formatQuantity } from "./format";

/**
 * These tests exist to pin down the money guarantee: amounts are formatted as
 * text, never parsed to Number(). Any future "simplification" that reaches for
 * Number() or toLocaleString() should fail here.
 */

describe("formatMoney", () => {
  it("groups thousands and always shows two decimals", () => {
    expect(formatMoney("6130.25", "NPR")).toBe("6,130.25 NPR");
    expect(formatMoney("1234567.89", "USD")).toBe("1,234,567.89 USD");
    expect(formatMoney("1000", "NPR")).toBe("1,000.00 NPR");
  });

  it("pads a single decimal to two places", () => {
    expect(formatMoney("12.5", "USD")).toBe("12.50 USD");
    expect(formatMoney("0.1", "USD")).toBe("0.10 USD");
    expect(formatMoney("0.2", "USD")).toBe("0.20 USD");
  });

  it("truncates beyond two decimals rather than rounding", () => {
    // Money from the backend is already NUMERIC(12,2), so this only guards
    // against a malformed payload. Truncation is deliberate: rounding here
    // would silently change a number the user is about to approve.
    expect(formatMoney("12.345", "USD")).toBe("12.34 USD");
    expect(formatMoney("0.999", "USD")).toBe("0.99 USD");
  });

  it("keeps the sign", () => {
    expect(formatMoney("-1234.5", "NPR")).toBe("-1,234.50 NPR");
    expect(formatMoney("-0.5", "USD")).toBe("-0.50 USD");
  });

  it("omits the currency when it is missing", () => {
    expect(formatMoney("1000.00", null)).toBe("1,000.00");
  });

  it("tolerates surrounding whitespace", () => {
    expect(formatMoney(" 42.00 ", "NPR")).toBe("42.00 NPR");
  });

  it("renders null as an em dash", () => {
    expect(formatMoney(null, "NPR")).toBe("—");
  });

  it("shows unexpected shapes verbatim instead of guessing", () => {
    expect(formatMoney("abc", "NPR")).toBe("abc");
    expect(formatMoney("1,234.00", "NPR")).toBe("1,234.00");
    expect(formatMoney("1e3", "NPR")).toBe("1e3");
    expect(formatMoney("+5.00", "NPR")).toBe("+5.00");
    expect(formatMoney("", "NPR")).toBe("");
  });

  it("does not lose precision on values a float cannot hold", () => {
    // Number("9007199254740993.01") is 9007199254740992, so a float-based
    // formatter would print ...992.00. String arithmetic keeps every digit.
    expect(formatMoney("9007199254740993.01", "NPR")).toBe(
      "9,007,199,254,740,993.01 NPR",
    );
  });

  it("groups only whole-number digits, never the decimals", () => {
    expect(formatMoney("1234.5678", "USD")).toBe("1,234.56 USD");
  });
});

describe("formatQuantity", () => {
  it("drops trailing zeros from NUMERIC(12,3) values", () => {
    expect(formatQuantity("12.000")).toBe("12");
    expect(formatQuantity("1.500")).toBe("1.5");
    expect(formatQuantity("0.000")).toBe("0");
    expect(formatQuantity("10.010")).toBe("10.01");
  });

  it("leaves significant digits alone", () => {
    expect(formatQuantity("1.234")).toBe("1.234");
    expect(formatQuantity("100.001")).toBe("100.001");
  });

  it("leaves values without a decimal point alone", () => {
    expect(formatQuantity("2")).toBe("2");
    expect(formatQuantity("100")).toBe("100");
  });

  it("renders null as an em dash", () => {
    expect(formatQuantity(null)).toBe("—");
  });
});

describe("formatDate", () => {
  it("takes the date part of an ISO timestamp", () => {
    expect(formatDate("2026-11-04T09:52:37.277193+05:45")).toBe("2026-11-04");
    expect(formatDate("2026-11-04T00:00:00Z")).toBe("2026-11-04");
  });

  it("accepts a plain date unchanged", () => {
    expect(formatDate("2026-11-04")).toBe("2026-11-04");
  });

  it("shows anything else verbatim rather than inventing a date", () => {
    expect(formatDate("04/11/2026")).toBe("04/11/2026");
    expect(formatDate("2026-1-4")).toBe("2026-1-4");
  });

  it("renders null as an em dash", () => {
    expect(formatDate(null)).toBe("—");
  });
});
