"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Calendar,
  BarChart3,
  BookOpen,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  enabled: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Pipeline", icon: LayoutGrid, enabled: true },
  { href: "/calendar", label: "Calendar", icon: Calendar, enabled: true },
  { href: "/reports", label: "Reports", icon: BarChart3, enabled: true },
  { href: "/catalog", label: "Catalog", icon: BookOpen, enabled: false },
  { href: "/settings", label: "Settings", icon: Settings, enabled: true },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-surface flex flex-col">
      <div className="px-5 py-5 border-b border-border">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-7 w-7 rounded-md bg-accent grid place-items-center">
            <span className="text-white text-xs font-semibold tracking-tight">
              GW
            </span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-text-primary tracking-tight">
              Good Woods
            </span>
            <span className="text-xs text-text-tertiary">Dashboard</span>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-2 py-3">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/" || pathname.startsWith("/jobs")
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            const className = cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-fast ease-standard",
              active
                ? "bg-accent-soft text-accent font-medium"
                : item.enabled
                  ? "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                  : "text-text-disabled cursor-not-allowed"
            );
            const content = (
              <>
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                <span>{item.label}</span>
                {!item.enabled && (
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-text-tertiary">
                    M3
                  </span>
                )}
              </>
            );
            return (
              <li key={item.href}>
                {item.enabled ? (
                  <Link href={item.href} className={className}>
                    {content}
                  </Link>
                ) : (
                  <span className={className} aria-disabled="true">
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-4 py-3 border-t border-border space-y-2">
        <div className="text-[11px] text-text-tertiary flex items-center gap-2">
          <kbd className="font-mono text-[10px] border border-border bg-surface-muted rounded px-1 py-0.5">
            ⌘K
          </kbd>
          jump anywhere
        </div>
        <div className="text-xs text-text-secondary">
          M2 · partial
          <span className="text-text-tertiary"> · v0.2.0</span>
        </div>
      </div>
    </aside>
  );
}
