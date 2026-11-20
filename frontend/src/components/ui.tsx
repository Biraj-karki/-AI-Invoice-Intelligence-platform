import type { ComponentType, ReactNode } from "react";

export function cx(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

/** The one surface every panel is built from: warm border, soft lift. */
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(22,23,28,0.04),0_12px_32px_-24px_rgba(22,23,28,0.35)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        {eyebrow !== undefined && (
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[30px] leading-[1.08] font-semibold tracking-[-0.035em] text-ink sm:text-[34px]">
          {title}
        </h1>
        {description !== undefined && (
          <p className="mt-2.5 max-w-2xl text-sm leading-6 text-ink-soft">
            {description}
          </p>
        )}
      </div>
      {actions}
    </header>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-indigo-600 text-white shadow-[0_1px_2px_rgba(22,23,28,0.12),0_8px_20px_-12px_rgba(79,70,229,0.9)] hover:bg-indigo-500 active:bg-indigo-700",
  secondary:
    "border border-line bg-white text-ink shadow-[0_1px_2px_rgba(22,23,28,0.05)] hover:border-stone-300 hover:bg-[#faf9f6] active:bg-stone-100",
  ghost: "text-ink-soft hover:bg-stone-900/[0.05] hover:text-ink",
  danger:
    "bg-red-600 text-white shadow-[0_1px_2px_rgba(22,23,28,0.12)] hover:bg-red-500 active:bg-red-700",
};

/** Shared button styling, also usable on <Link> so links look like buttons. */
export function buttonClass(
  variant: Variant = "primary",
  size: "sm" | "md" = "sm",
): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45",
    size === "sm" ? "h-9 px-3 text-[13px]" : "h-10 px-4 text-sm",
    VARIANTS[variant],
  );
}

type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-600 ring-stone-200/90",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
  warning: "bg-amber-50 text-amber-800 ring-amber-200/80",
  info: "bg-blue-50 text-blue-700 ring-blue-200/80",
  danger: "bg-red-50 text-red-700 ring-red-200/80",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset",
        TONES[tone],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-[#faf9f6]/60 px-6 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white text-stone-400 shadow-[0_1px_2px_rgba(22,23,28,0.04)]">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] leading-5 text-ink-soft">
        {description}
      </p>
      {action !== undefined && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx("animate-pulse rounded-md bg-stone-200/70", className)}
    />
  );
}

/** The vendor's initial in a quiet tile, reused by the list and detail views. */
export function InitialAvatar({
  name,
  className,
}: {
  name: string | null;
  className?: string;
}) {
  const first = (name ?? "").trim().charAt(0);

  return (
    <span
      className={cx(
        "grid shrink-0 place-items-center rounded-[10px] border border-line bg-[#faf9f6] font-semibold text-stone-600",
        className,
      )}
      aria-hidden
    >
      {first === "" ? "?" : first.toUpperCase()}
    </span>
  );
}
