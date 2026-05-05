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
  Hammer,
  Truck,
  Package,
  TrendingUp,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
};

type NavSection = {
  label?: string;
  items: NavItem[];
};

const NAV: NavSection[] = [
  {
    items: [{ href: "/", label: "Pipeline", icon: LayoutGrid }],
  },
  {
    label: "Sell & Plan",
    items: [
      { href: "/estimator", label: "Estimator", icon: Calculator },
      { href: "/calendar", label: "Calendar", icon: Calendar },
      { href: "/crm", label: "Clients", icon: Users },
    ],
  },
  {
    label: "Build",
    items: [
      { href: "/shop", label: "Shop floor", icon: Hammer },
      { href: "/sops", label: "SOPs", icon: BookOpen },
      { href: "/installer", label: "Installer", icon: Truck },
    ],
  },
  {
    label: "Stock & Money",
    items: [
      { href: "/catalog", label: "Catalog", icon: FileText },
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

      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {NAV.map((section, idx) => (
          <div key={idx} className={cn(idx > 0 && "mt-4")}>
            {section.label && (
              <div className="px-2.5 mb-1 text-[10px] uppercase tracking-[0.08em] text-text-tertiary font-semibold">
                {section.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/" || pathname.startsWith("/jobs")
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

      <div className="px-4 py-3 border-t border-border space-y-2">
        <div className="text-[11px] text-text-tertiary flex items-center gap-2">
          <kbd className="font-mono text-[10px] border border-border bg-surface-muted rounded px-1 py-0.5">
            ⌘K
          </kbd>
          jump anywhere
        </div>
        <div className="text-xs text-text-secondary">
          M1–M7 · all modules
          <span className="text-text-tertiary"> · v0.7.0</span>
        </div>
      </div>
    </aside>
  );
}
