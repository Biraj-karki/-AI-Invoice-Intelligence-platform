import ChangePassword from "@/components/ChangePassword";
import AutomationToken from "@/components/AutomationToken";
import { PageHeader } from "@/components/ui";

// Same reason as the other workspace pages: AuthGate renders the page only in
// the browser, so there is no server shell for instant navigation to inspect.
export const instant = false;

export default function AccountPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="Account"
        description="Manage your password and the credential used by invoice automation."
      />

      <ChangePassword />
      <AutomationToken />
    </div>
  );
}
