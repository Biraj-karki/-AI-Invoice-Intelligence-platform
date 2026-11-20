"use client";

import { AlertCircle, Loader2, Save, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ApiError, updateInvoiceFields } from "@/lib/api";
import type { InvoiceDetail, InvoiceFields } from "@/lib/types";

import { buttonClass, cx } from "./ui";

// Money is typed as text, never a number input: a browser number field would
// happily hand back 6130.249999 and lose the exact decimal the server stores.
const MONEY = /^-?\d+(?:\.\d{1,2})?$/;
const CURRENCY = /^[A-Z]{3}$/;

const INPUT =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none";

type Draft = {
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  currency: string;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
};

const MONEY_FIELDS = ["subtotal", "tax_amount", "total_amount"] as const;

const MONEY_LABELS: Record<(typeof MONEY_FIELDS)[number], string> = {
  subtotal: "Subtotal",
  tax_amount: "Tax",
  total_amount: "Total",
};

function draftFrom(invoice: InvoiceDetail): Draft {
  return {
    vendor_name: invoice.vendor_name ?? "",
    invoice_number: invoice.invoice_number ?? "",
    invoice_date: invoice.invoice_date ?? "",
    currency: invoice.currency ?? "",
    subtotal: invoice.subtotal ?? "",
    tax_amount: invoice.tax_amount ?? "",
    total_amount: invoice.total_amount ?? "",
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  inputMode,
  autoFocus,
  maxLength,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
  placeholder?: string;
  inputMode?: "text" | "decimal";
  autoFocus?: boolean;
  maxLength?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        maxLength={maxLength}
        className={INPUT}
      />
    </div>
  );
}

/**
 * The correction form for an invoice in review.
 *
 * Only header fields are editable. The line items are the evidence behind the
 * subtotal, so the reviewer raises the header to meet them (or rejects the
 * document) instead of rewriting both sides until they happen to agree.
 */
export default function InvoiceFieldsForm({
  invoice,
  onSaved,
  onCancel,
}: {
  invoice: InvoiceDetail;
  onSaved: (updated: InvoiceDetail) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(invoice));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setError("");

    // Checked here so a typo reads as a sentence instead of FastAPI's 422 list.
    // Grouping separators are allowed on the way in ("5,425.00"); the server
    // only ever sees the bare decimal string.
    const money: Record<string, string | null> = {};
    for (const field of MONEY_FIELDS) {
      const raw = draft[field].replace(/[,\s]/g, "");
      if (raw !== "" && !MONEY.test(raw)) {
        setError(
          `${MONEY_LABELS[field]} must be an amount with at most two decimal places, like 6130.25.`,
        );
        return;
      }
      money[field] = raw === "" ? null : raw;
    }

    const currency = draft.currency.trim().toUpperCase();
    if (currency !== "" && !CURRENCY.test(currency)) {
      setError("Currency must be a three-letter code, like NPR or USD.");
      return;
    }

    const fields: InvoiceFields = {
      vendor_name: blankToNull(draft.vendor_name),
      invoice_number: blankToNull(draft.invoice_number),
      invoice_date: draft.invoice_date === "" ? null : draft.invoice_date,
      currency: currency === "" ? null : currency,
      subtotal: money.subtotal,
      tax_amount: money.tax_amount,
      total_amount: money.total_amount,
    };

    setSaving(true);

    try {
      // The reply is the re-judged invoice: the caller swaps it in and lets the
      // remaining issues (or the new "extracted" status) speak for themselves.
      onSaved(await updateInvoiceFields(invoice.id, fields));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm"
    >
      <p className="text-sm font-semibold text-slate-900">Correct the fields</p>
      <p className="mt-0.5 text-xs text-slate-500">
        The numbers are checked again when you save. If they add up, the invoice
        leaves the review queue.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field
          id="vendor-name"
          label="Vendor"
          value={draft.vendor_name}
          onChange={(value) => set("vendor_name", value)}
          placeholder="ACME SUPPLIES PVT. LTD."
          autoFocus
          maxLength={255}
          className="sm:col-span-2"
        />
        <Field
          id="invoice-number"
          label="Invoice number"
          value={draft.invoice_number}
          onChange={(value) => set("invoice_number", value)}
          placeholder="INV-2026-0042"
          maxLength={64}
        />
        <Field
          id="invoice-date"
          label="Invoice date"
          type="date"
          value={draft.invoice_date}
          onChange={(value) => set("invoice_date", value)}
        />
        <Field
          id="currency"
          label="Currency"
          value={draft.currency}
          onChange={(value) => set("currency", value)}
          placeholder="NPR"
          maxLength={3}
        />
        <Field
          id="subtotal"
          label="Subtotal"
          value={draft.subtotal}
          onChange={(value) => set("subtotal", value)}
          inputMode="decimal"
          placeholder="5425.00"
        />
        <Field
          id="tax-amount"
          label="Tax"
          value={draft.tax_amount}
          onChange={(value) => set("tax_amount", value)}
          inputMode="decimal"
          placeholder="705.25"
        />
        <Field
          id="total-amount"
          label="Total"
          value={draft.total_amount}
          onChange={(value) => set("total_amount", value)}
          inputMode="decimal"
          placeholder="6130.25"
        />
      </div>

      {error !== "" && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Line items cannot be edited here.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className={buttonClass("ghost")}
          >
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className={cx(buttonClass("primary"), "whitespace-nowrap")}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden />
                Save changes
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
