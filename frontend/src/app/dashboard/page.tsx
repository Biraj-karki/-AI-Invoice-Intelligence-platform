import Dashboard from "@/components/Dashboard";
import { PageHeader } from "@/components/ui";

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
