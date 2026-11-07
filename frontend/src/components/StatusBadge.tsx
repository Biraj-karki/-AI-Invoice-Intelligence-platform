import { Badge } from "./ui";

const TONES: Record<
  string,
  "neutral" | "success" | "warning" | "info" | "danger"
> = {
  extracted: "success",
  review: "warning",
  approved: "info",
  rejected: "danger",
  pending: "neutral",
  failed: "danger",
};

export default function StatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? "neutral"}>{status}</Badge>;
}
