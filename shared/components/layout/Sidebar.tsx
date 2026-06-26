"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Calculator,
  Calendar,
  BarChart3,
  BookOpen,
  Settings,
  Users,
  Handshake,
  Hammer,
  Truck,
  Package,
  TrendingUp,
  FileText,
  LogOut,
  Sparkles,
  FolderOpen,
  ScanLine,
  Timer,
  ClipboardList,
  Receipt,
  Activity,
} from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useAuth } from "@shared/lib/authStore";
import { versionBadgeLabel } from "@shared/lib/versionBadge";
import { invoicesEnabled } from "@features/invoices/lib/featureFlag";
import { jobStatusEnabled } from "@features/job-status/lib/featureFlag";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  /** When set, the item only renders if the predicate returns true (feature flag). */
  enabled?: () => boolean;
};

type NavSection = {
  label?: string;
  items: NavItem[];
};

const NAV: NavSection[] = [
  {
    items: [
      { href: "/", label: "Pipeline", icon: LayoutGrid },
      { href: "/briefing", label: "Briefing", icon: Sparkles },
    ],
  },
  {
    label: "Sell & Plan",
    items: [
      { href: "/estimator", label: "Estimator", icon: Calculator },
      { href: "/calendar", label: "Calendar", icon: Calendar },
      { href: "/projects", label: "Projects", icon: FolderOpen },
      { href: "/crm", label: "Clients", icon: Users },
      { href: "/partners", label: "Partners", icon: Handshake },
    ],
  },
  {
    label: "Build",
    items: [
      { href: "/shop", label: "Shop floor", icon: Hammer },
      { href: "/reface", label: "Reface Studio", icon: ScanLine },
      { href: "/labour", label: "Labour", icon: Timer },
      { href: "/forms", label: "Forms", icon: ClipboardList },
      { href: "/status", label: "Job status", icon: Activity, enabled: jobStatusEnabled },
      { href: "/sops", label: "SOPs", icon: BookOpen },
      { href: "/installer", label: "Installer", icon: Truck },
    ],
  },
  {
    label: "Stock & Money",
    items: [
      { href: "/catalog", label: "Catalog", icon: FileText },
      { href: "/invoices", label: "Invoices", icon: Receipt, enabled: invoicesEnabled },
      { href: "/inventory", label: "Inventory", icon: Package },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/pnl", label: "P&L", icon: TrendingUp },
    ],
  },
  {
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-surface flex flex-col">
      <div className="px-5 py-5 border-b border-border">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-7 w-7 rounded-md bg-text-primary grid place-items-center">
            <span className="text-white text-xs font-semibold tracking-tight">GW</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-text-primary tracking-tight">
              Good Woods
            </span>
            <span className="text-xs text-text-tertiary">Dashboard</span>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {NAV.map((section, idx) => (
          <div key={idx} className={cn(idx > 0 && "mt-4")}>
            {section.label && (
              <div className="px-2.5 mb-1 text-micro uppercase tracking-[0.08em] text-text-tertiary font-semibold">
                {section.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items
                .filter((item) => !item.enabled || item.enabled())
                .map((item) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : item.href === "/projects"
                        ? pathname.startsWith("/projects") || pathname.startsWith("/jobs")
                        : item.href === "/partners"
                          ? pathname.startsWith("/partners") ||
                            pathname.startsWith("/suppliers") ||
                            pathname.startsWith("/subtrades")
                          : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-fast ease-standard",
                          active
                            ? "bg-accent-soft text-accent font-medium"
                            : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-border space-y-2.5">
        {user && (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-text-primary truncate">{user.email}</div>
              <div className="text-micro uppercase tracking-wider text-text-tertiary">
                Signed in
              </div>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="text-text-tertiary hover:text-status-blocked transition-colors duration-fast p-1 rounded hover:bg-surface-muted"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        )}
        <div className="text-caption text-text-tertiary flex items-center gap-2">
          <kbd className="font-mono text-micro border border-border bg-surface-muted rounded px-1 py-0.5">
            ⌘K
          </kbd>
          jump anywhere
        </div>
        <div className="text-xs text-text-tertiary">{versionBadgeLabel()}</div>
      </div>
    </aside>
  );
}
