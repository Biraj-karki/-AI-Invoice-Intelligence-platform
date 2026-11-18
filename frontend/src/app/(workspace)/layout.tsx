import type { ReactNode } from "react";

import AppShell from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";

/**
 * Everything under (workspace) is behind the sidebar shell and the session
 * check. /login deliberately lives outside this group, so it neither shows the
 * nav nor requires a token.
 */
export default function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AppShell>
      <AuthGate>{children}</AuthGate>
    </AppShell>
  );
}
