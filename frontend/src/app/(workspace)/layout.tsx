import type { ReactNode } from "react";

import AppShell from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";

/**
 * Everything under (workspace) is behind the sidebar shell and the session
 * check. /login deliberately lives outside this group, so it neither shows the
 * nav nor requires a token.
 *
 * Because AuthGate only renders its children in the browser (the token lives in
 * localStorage), each page here exports `instant = false`: there is no server
 * shell for Next's instant-navigation validator to inspect, and opting out
 * keeps the dev overlay quiet without changing how the gate works.
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
