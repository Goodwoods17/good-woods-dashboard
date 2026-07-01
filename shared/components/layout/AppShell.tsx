"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { isBarePath } from "./barePaths";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isBarePath(pathname)) {
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
