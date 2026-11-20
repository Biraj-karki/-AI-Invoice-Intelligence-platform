"use client";

import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { ApiError, changePassword } from "@/lib/api";

import { buttonClass, Card, cx } from "./ui";

const MIN_PASSWORD = 8;

function Field({
  id,
  label,
  hint,
  value,
  autoComplete,
  shown,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  autoComplete: "current-password" | "new-password";
  shown: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={hint}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
      />
    </div>
  );
}

export default function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    // Cleared up front: an old success next to a new failure would be a lie.
    setError("");
    setDone(false);

    // Checked here so the user reads a sentence rather than FastAPI's 422 array.
    if (current === "") {
      setError("Enter your current password.");
      return;
    }
    if (next.length < MIN_PASSWORD) {
      setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (next === current) {
      setError("The new password must be different from your current one.");
      return;
    }
    if (confirm !== next) {
      setError("The two new passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
          <KeyRound className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Change password
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Your email stays the same. You&apos;ll stay signed in on this device.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4 p-5">
        <Field
          id="current-password"
          label="Current password"
          hint="The one you signed in with"
          value={current}
          autoComplete="current-password"
          shown={shown}
          onChange={setCurrent}
        />

        <Field
          id="new-password"
          label="New password"
          hint={`At least ${MIN_PASSWORD} characters`}
          value={next}
          autoComplete="new-password"
          shown={shown}
          onChange={setNext}
        />

        <Field
          id="confirm-password"
          label="Confirm new password"
          hint="Type the new password again"
          value={confirm}
          autoComplete="new-password"
          shown={shown}
          onChange={setConfirm}
        />

        <label className="flex w-fit items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={shown}
            onChange={(event) => setShown(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 accent-indigo-600"
          />
          Show passwords
        </label>

        {error !== "" && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {done && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Password changed. Use the new one the next time you sign in.
          </p>
        )}

        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Stored as an Argon2id hash, never as text.
          </p>
          <button
            type="submit"
            disabled={busy}
            className={cx(
              buttonClass("primary", "md"),
              "w-full whitespace-nowrap sm:w-auto",
            )}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Change password"
            )}
          </button>
        </div>
      </form>
    </Card>
  );
}
