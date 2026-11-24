"use client";

import {
  AlertCircle,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  ApiError,
  createAutomationToken,
  getAutomationTokenStatus,
  revokeAutomationToken,
} from "@/lib/api";

import { buttonClass, Card, cx } from "./ui";

export default function AutomationToken() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<"rotate" | "revoke" | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    getAutomationTokenStatus()
      .then(({ enabled: isEnabled }) => {
        if (!cancelled) setEnabled(isEnabled);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Could not load token status.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const result = await createAutomationToken();
      setToken(result.automation_token);
      setEnabled(true);
      setConfirmAction(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create the token.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      await revokeAutomationToken();
      setToken(null);
      setEnabled(false);
      setConfirmAction(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not revoke the token.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
          <KeyRound className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
            Invoice automation
          </h2>
          <p className="mt-0.5 text-[11.5px] leading-5 text-ink-soft">
            Create a dedicated credential for n8n. It can upload invoices only.
          </p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {enabled === null && error === "" ? (
          <p className="flex items-center gap-2 text-[12.5px] text-ink-soft">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Checking automation connection…
          </p>
        ) : (
          <p className="text-[12.5px] text-ink-soft">
            {enabled ? "An automation token is active." : "No automation token is active."}
          </p>
        )}

        {token !== null && (
          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <label
              htmlFor="automation-token"
              className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-emerald-800"
            >
              Copy this token into n8n now
            </label>
            <input
              id="automation-token"
              readOnly
              value={token}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-ink"
            />
            <p className="text-[11.5px] leading-5 text-emerald-800">
              It is shown only once. Store it as the{" "}
              <code>X-Automation-Token</code> header credential in n8n.
            </p>
          </div>
        )}

        {error !== "" && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {confirmAction !== null && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-900">
            {confirmAction === "rotate"
              ? "Rotating the token immediately stops n8n workflows using the old one."
              : "Revoking the token immediately stops invoice uploads from n8n."}
          </p>
        )}

        <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-[11px] text-stone-500">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Only a hash is stored; token access is revocable.
          </p>
          <div className="flex flex-wrap gap-2">
            {enabled === true && confirmAction === null && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmAction("rotate")}
                  disabled={busy}
                  className={buttonClass("secondary")}
                >
                  Rotate token
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction("revoke")}
                  disabled={busy}
                  className={buttonClass("secondary")}
                >
                  Revoke
                </button>
              </>
            )}
            {enabled === false && (
              <button
                type="button"
                onClick={() => void generate()}
                disabled={busy}
                className={cx(buttonClass("primary"), "whitespace-nowrap")}
              >
                {busy ? "Creating…" : "Create token"}
              </button>
            )}
            {confirmAction === "rotate" && (
              <>
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={busy}
                  className={buttonClass("primary")}
                >
                  {busy ? "Rotating…" : "Confirm rotation"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  disabled={busy}
                  className={buttonClass("secondary")}
                >
                  Cancel
                </button>
              </>
            )}
            {confirmAction === "revoke" && (
              <>
                <button
                  type="button"
                  onClick={() => void revoke()}
                  disabled={busy}
                  className={buttonClass("danger")}
                >
                  {busy ? "Revoking…" : "Confirm revoke"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  disabled={busy}
                  className={buttonClass("secondary")}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
