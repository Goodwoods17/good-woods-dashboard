"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutGrid,
  Calendar,
  BarChart3,
  Settings,
  Briefcase,
  CornerDownLeft,
  Plus,
  Calculator,
  Users,
  Hammer,
  BookOpen,
  Truck,
  Package,
  TrendingUp,
  FileText,
} from "lucide-react";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { cn } from "@shared/lib/utils";
import { computeMargin, type Job } from "@shared/lib/types";

type CommandItem =
  | { kind: "page"; id: string; label: string; href: string; icon: typeof Search }
  | { kind: "job"; id: string; job: Job };

const PAGES: CommandItem[] = [
  { kind: "page", id: "page-new-job", label: "New Job", href: "/jobs/new", icon: Plus },
  { kind: "page", id: "page-pipeline", label: "Pipeline · Jobs", href: "/", icon: LayoutGrid },
  { kind: "page", id: "page-estimator", label: "Estimator", href: "/estimator", icon: Calculator },
  { kind: "page", id: "page-calendar", label: "Calendar", href: "/calendar", icon: Calendar },
  { kind: "page", id: "page-crm", label: "Clients", href: "/crm", icon: Users },
  { kind: "page", id: "page-shop", label: "Shop floor", href: "/shop", icon: Hammer },
  { kind: "page", id: "page-sops", label: "SOPs", href: "/sops", icon: BookOpen },
  { kind: "page", id: "page-installer", label: "Installer Portal", href: "/installer", icon: Truck },
  { kind: "page", id: "page-catalog", label: "Catalog", href: "/catalog", icon: FileText },
  { kind: "page", id: "page-inventory", label: "Inventory", href: "/inventory", icon: Package },
  { kind: "page", id: "page-reports", label: "Reports", href: "/reports", icon: BarChart3 },
  { kind: "page", id: "page-pnl", label: "P&L", href: "/pnl", icon: TrendingUp },
  { kind: "page", id: "page-settings", label: "Settings", href: "/settings", icon: Settings },
];

// Loose match for a job code like "GW-2026-001" or "gw 26 5" or "26-5".
// Returns the numeric portion to compare against job.code.
function looksLikeJobCode(q: string): string | null {
  // Strip whitespace and uppercase
  const norm = q.trim().toUpperCase();
  if (!norm) return null;
  // Match anything containing "GW-" or 2+ consecutive digits.
  if (/GW-?\d/.test(norm) || /\d{2,}/.test(norm)) return norm;
  return null;
}

const HOTKEY_LIMIT = 5;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { jobs } = useJobs();

  // Cmd/Ctrl+K toggles
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const q = query.toLowerCase().trim();
    const jobItems: CommandItem[] = jobs.map((j) => ({
      kind: "job" as const,
      id: `job-${j.id}`,
      job: j,
    }));
    const all: CommandItem[] = [...PAGES, ...jobItems];
    if (!q) return all;

    // If the query smells like a job code, boost code matches to the top.
    const codeQuery = looksLikeJobCode(q);
    if (codeQuery) {
      const codeNorm = codeQuery.replace(/[^A-Z0-9]/g, "");
      const exact: CommandItem[] = [];
      const prefix: CommandItem[] = [];
      const rest: CommandItem[] = [];
      for (const it of all) {
        if (it.kind === "job") {
          const cn = it.job.code.toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (cn === codeNorm) {
            exact.push(it);
            continue;
          }
          if (cn.endsWith(codeNorm) || cn.includes(codeNorm)) {
            prefix.push(it);
            continue;
          }
        }
        // Fall back to general fuzzy match for anything else
        const matched =
          it.kind === "page"
            ? it.label.toLowerCase().includes(q)
            : it.job.name.toLowerCase().includes(q) ||
              it.job.client.toLowerCase().includes(q) ||
              it.job.code.toLowerCase().includes(q);
        if (matched) rest.push(it);
      }
      return [...exact, ...prefix, ...rest];
    }

    return all.filter((it) => {
      if (it.kind === "page") return it.label.toLowerCase().includes(q);
      const j = it.job;
      return (
        j.name.toLowerCase().includes(q) ||
        j.client.toLowerCase().includes(q) ||
        j.code.toLowerCase().includes(q)
      );
    });
  }, [query, jobs]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  function executeItem(it: CommandItem) {
    if (it.kind === "page") router.push(it.href);
    else router.push(`/jobs/${it.job.id}`);
    setOpen(false);
  }

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    // Cmd/Ctrl + digit (1–5) jumps to the corresponding result.
    if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < items.length && idx < HOTKEY_LIMIT) {
        e.preventDefault();
        executeItem(items[idx]);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[activeIdx];
      if (it) executeItem(it);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-text-primary/30 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-surface rounded-xl shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-faint">
          <Search className="h-4 w-4 text-text-tertiary shrink-0" strokeWidth={1.75} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Jump to a job, code, or page (try “GW-2026-001”)…"
            className="flex-1 text-sm bg-transparent border-0 placeholder:text-text-tertiary focus:outline-none focus:ring-0 text-text-primary"
            aria-controls="cmdk-list"
            aria-activedescendant={items[activeIdx]?.id}
          />
          <kbd className="text-[10px] font-mono text-text-tertiary border border-border bg-surface-muted rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>
        <ul
          id="cmdk-list"
          role="listbox"
          className="max-h-80 overflow-y-auto py-1.5"
        >
          {items.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-text-tertiary">
              No results for &ldquo;{query}&rdquo;.
            </li>
          ) : (
            items.map((it, i) => {
              const hotkey = i < HOTKEY_LIMIT ? i + 1 : null;
              return (
                <li
                  key={it.id}
                  id={it.id}
                  role="option"
                  aria-selected={activeIdx === i}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => executeItem(it)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2 cursor-pointer",
                    activeIdx === i ? "bg-accent-soft" : "hover:bg-surface-muted"
                  )}
                >
                  {it.kind === "page" ? (
                    <PageRow item={it} active={activeIdx === i} hotkey={hotkey} />
                  ) : (
                    <JobRow item={it} active={activeIdx === i} hotkey={hotkey} />
                  )}
                </li>
              );
            })
          )}
        </ul>
        <div className="px-4 py-2 border-t border-border-faint bg-surface-muted text-[11px] text-text-tertiary flex items-center justify-between">
          <span>↑ ↓ navigate · ↵ open · ⌘1–5 jump</span>
          <span>
            <kbd className="font-mono">⌘K</kbd> toggles this palette
          </span>
        </div>
      </div>
    </div>
  );
}

function HotkeyBadge({ n }: { n: number }) {
  return (
    <kbd className="text-[10px] font-mono text-text-tertiary border border-border-faint bg-surface-muted rounded px-1 py-0.5 shrink-0">
      ⌘{n}
    </kbd>
  );
}

function PageRow({
  item,
  active,
  hotkey,
}: {
  item: Extract<CommandItem, { kind: "page" }>;
  active: boolean;
  hotkey: number | null;
}) {
  const Icon = item.icon;
  return (
    <>
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          active ? "text-accent" : "text-text-tertiary"
        )}
        strokeWidth={1.75}
      />
      <span
        className={cn(
          "flex-1 text-sm",
          active ? "text-accent" : "text-text-primary"
        )}
      >
        {item.label}
      </span>
      {hotkey !== null && !active && <HotkeyBadge n={hotkey} />}
      {active && (
        <CornerDownLeft className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} />
      )}
    </>
  );
}

function JobRow({
  item,
  active,
  hotkey,
}: {
  item: Extract<CommandItem, { kind: "job" }>;
  active: boolean;
  hotkey: number | null;
}) {
  const margin = computeMargin(item.job);
  return (
    <>
      <Briefcase
        className={cn(
          "h-4 w-4 shrink-0",
          active ? "text-accent" : "text-text-tertiary"
        )}
        strokeWidth={1.75}
      />
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-sm truncate",
            active ? "text-accent font-medium" : "text-text-primary"
          )}
        >
          {item.job.name}
        </div>
        <div className="text-xs text-text-tertiary truncate">
          {item.job.code} · {item.job.client}
        </div>
      </div>
      <span className="text-xs tabular-nums text-text-tertiary shrink-0">
        GM {margin.marginPct.toFixed(0)}%
      </span>
      {hotkey !== null && !active && <HotkeyBadge n={hotkey} />}
      {active && (
        <CornerDownLeft className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} />
      )}
    </>
  );
}
