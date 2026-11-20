import ChangePassword from "@/components/ChangePassword";
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
        description="The password that protects this workspace. Changing it needs the current one, so someone at an unlocked browser cannot lock you out."
      />

      <ChangePassword />
    </div>
  );
}
