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
      router.replace("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
      setBusy(false);
    }
  }

  const registering = mode === "register";

  return (
    <>
      <h1 className="text-lg font-semibold tracking-tight text-slate-900">
        {registering ? "Create your account" : "Sign in"}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {registering
          ? "One account is enough for this workspace."
          : "Use the account you registered for this workspace."}
      </p>

      {/* noValidate: the messages below are ours, so every browser shows the
          same sentence instead of its own native bubble. */}
      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-medium text-slate-700"
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
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium text-slate-700"
          >
            Password
          </label>
          <div className="relative mt-1">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete={registering ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
              placeholder={registering ? "At least 8 characters" : "Your password"}
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
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

      <p className="mt-4 text-center text-sm text-slate-600">
        {registering ? "Already have an account?" : "First time here?"}{" "}
        <button
          type="button"
          onClick={() => switchMode(registering ? "login" : "register")}
          className="font-medium text-indigo-600 hover:text-indigo-700"
        >
          {registering ? "Sign in" : "Create an account"}
        </button>
      </p>
    </>
  );
}
