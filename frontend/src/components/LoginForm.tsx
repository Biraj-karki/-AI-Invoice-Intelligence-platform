"use client";

import { AlertCircle, Eye, EyeOff, Loader2, LogIn, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { ApiError, login, register } from "@/lib/api";
import { getToken, setToken } from "@/lib/session";

import { buttonClass, cx } from "./ui";

type Mode = "login" | "register";

const MIN_PASSWORD = 8;

export default function LoginForm() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Already signed in: no reason to show the form.
  useEffect(() => {
    if (getToken() !== null) router.replace("/");
  }, [router]);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setError("");

    // Checked here so the user sees a sentence instead of FastAPI's 422 array.
    const address = email.trim();
    if (!address.includes("@") || address.startsWith("@") || address.endsWith("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode === "register" && password.length < MIN_PASSWORD) {
      setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password === "") {
      setError("Enter your password.");
      return;
    }

    setBusy(true);

    try {
      const result =
        mode === "login"
          ? await login(address, password)
          : await register(address, password);

      setToken(result.access_token);

      // Next keeps visited pages mounted, so this form can be shown again
      // after signing out. It must not come back holding the old password,
      // still in "create an account" mode, or stuck behind a dead spinner.
      setMode("login");
      setPassword("");
      router.replace("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const registering = mode === "register";

  return (
    <>
      <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.03em] text-ink">
        {registering ? "Create your account" : "Sign in"}
      </h1>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-soft">
        {registering
          ? "One account is enough for this workspace."
          : "Use the account you registered for this workspace."}
      </p>

      {/* noValidate: the messages below are ours, so every browser shows the
          same sentence instead of its own native bubble. */}
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-stone-400"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[13px] text-ink transition-colors placeholder:text-stone-400 hover:border-stone-300 focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-stone-400"
          >
            Password
          </label>
          <div className="relative mt-1.5">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete={registering ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2.5 pr-10 text-[13px] text-ink transition-colors placeholder:text-stone-400 hover:border-stone-300 focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              placeholder={registering ? "At least 8 characters" : "Your password"}
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-stone-400 transition-colors hover:bg-stone-900/[0.06] hover:text-ink"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>

        {error !== "" && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className={cx(buttonClass("primary", "md"), "w-full")}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {registering ? "Creating account…" : "Signing in…"}
            </>
          ) : registering ? (
            <>
              <UserPlus className="h-4 w-4" aria-hidden />
              Create account
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" aria-hidden />
              Sign in
            </>
          )}
        </button>
      </form>

      <p className="mt-5 text-center text-[12.5px] text-ink-soft">
        {registering ? "Already have an account?" : "First time here?"}{" "}
        <button
          type="button"
          onClick={() => switchMode(registering ? "login" : "register")}
          className="font-medium text-indigo-600 transition-colors hover:text-indigo-700"
        >
          {registering ? "Sign in" : "Create an account"}
        </button>
      </p>
    </>
  );
}
