"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { isPortalPath } from "@shared/lib/portalDomain";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Chromeless for /login + every no-login capability-link portal. The portal
  // list is derived from the single source of truth (PORTAL_PATH_PREFIXES in
  // portalDomain.ts) — NOT a second hardcoded list — so a new /<x>/<token>
  // portal is automatically chromeless and the lists can't drift (the /d + /s
  // leak was exactly that drift).
  const bare = pathname === "/login" || (pathname != null && isPortalPath(pathname));

  if (bare) {
    return <>{children}</>;
  }

  return (
    <div data-testid="app-chrome" className="min-h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">{children}</main>
      <CommandPalette />
    </div>
  );
}
