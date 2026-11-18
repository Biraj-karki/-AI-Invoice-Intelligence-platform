import type { Metadata } from "next";

import LoginForm from "@/components/LoginForm";
import { Logo } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo href="/login" />
        </div>

        <div className="mt-8 rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Your session lasts one day. Signing out removes it from this browser.
        </p>
      </div>
    </main>
  );
}
