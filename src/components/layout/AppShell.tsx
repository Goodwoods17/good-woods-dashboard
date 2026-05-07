"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";

const BARE_PATHS = ["/login"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_PATHS.some((p) => pathname?.startsWith(p));

  if (bare) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">{children}</main>
      <CommandPalette />
    </div>
  );
}
