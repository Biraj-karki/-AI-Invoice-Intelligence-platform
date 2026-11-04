const STYLES: Record<string, string> = {
  extracted: "bg-emerald-100 text-emerald-800",
  review: "bg-amber-100 text-amber-900",
  pending: "bg-slate-200 text-slate-700",
  failed: "bg-red-100 text-red-800",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        STYLES[status] ?? "bg-slate-200 text-slate-700"
      }`}
    >
      {status}
    </span>
  );
}
