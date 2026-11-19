import Dashboard from "@/components/Dashboard";
import { PageHeader } from "@/components/ui";

// AuthGate renders this page only in the browser, so there is no server shell
// for Next's instant-navigation validator to inspect. The gate is intentional,
// so the dev-only check is opted out rather than worked around.
export const instant = false;

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Where the money goes, per currency. NPR and USD are never added together."
      />
      <Dashboard />
    </div>
  );
}
