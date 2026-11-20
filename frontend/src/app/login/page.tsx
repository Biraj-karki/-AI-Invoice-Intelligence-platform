import type { Metadata } from "next";
import { Calculator, FileSearch, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/AppShell";
import LoginForm from "@/components/LoginForm";
import { Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sign in",
};

const POINTS = [
  {
    icon: FileSearch,
    title: "Gemini reads the PDF",
    body: "Vendor, dates, line items and totals, extracted from the document itself.",
  },
  {
    icon: Calculator,
    title: "The arithmetic is checked",
    body: "Subtotal plus tax must equal the total, and the lines must add up.",
  },
  {
    icon: ShieldCheck,
    title: "Nothing is auto-approved",
    body: "When the numbers disagree, the invoice waits in review for a human.",
  },
];

export default function LoginPage() {
  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel. Hidden on small screens: the form is the job there. */}
      <section className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col xl:p-16">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(760px_420px_at_88%_-10%,rgba(99,102,241,0.38),transparent_70%),radial-gradient(520px_320px_at_-10%_105%,rgba(139,92,246,0.18),transparent_70%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px]"
          aria-hidden
        />

        <div className="relative">
          <Logo tone="dark" href="/login" />
        </div>

        <div className="relative mt-auto pt-16">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300/80">
            Invoice intelligence
          </p>
          <h2 className="mt-4 max-w-lg text-[38px] leading-[1.06] font-semibold tracking-[-0.04em] text-white xl:text-[44px]">
            Every invoice read.
            <br />
            Every total checked.
          </h2>
          <p className="mt-4 max-w-md text-[13.5px] leading-6 text-white/55">
            A working desk for accounts payable: AI extraction with the
            arithmetic as an independent judge.
          </p>

          <ul className="mt-9 space-y-5">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-indigo-300">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[12.5px] font-medium text-white/90">
                    {title}
                  </p>
                  <p className="mt-0.5 max-w-sm text-[12px] leading-5 text-white/40">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-14 border-t border-white/[0.08] pt-5 text-[10.5px] uppercase tracking-[0.14em] text-white/25">
          Gemini extraction · PDF pipeline · Review queue
        </p>
      </section>

      <section className="flex min-h-screen flex-col justify-center px-5 py-12 sm:px-8">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-8 lg:hidden">
            <Logo href="/login" />
          </div>

          <Card className="p-6 sm:p-7">
            <LoginForm />
          </Card>

          <p className="mt-4 text-center text-[11px] leading-5 text-stone-500">
            Your session lasts one day. Signing out removes it from this browser.
          </p>
        </div>
      </section>
    </main>
  );
}
