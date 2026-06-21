"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Plus,
  Star,
} from "lucide-react";
import { cn } from "@shared/lib/utils";
import type { Trade } from "../lib/types";
import { useTrades } from "../lib/tradesStore";
import { TradePill, tradeColorVar, tradeIcon } from "./TradePill";

// The categorical palette slugs + icon keys (DESIGN.md §2). Editing a trade
// picks from these so colours stay on the sanctioned off-axis palette.
const PALETTE = [
  "installer",
  "finisher",
  "countertop",
  "electrical",
  "plumbing",
  "delivery",
  "upholstery",
  "other",
];
const ICON_KEYS = [
  "wrench",
  "paint-roller",
  "square",
  "zap",
  "droplet",
  "truck",
  "armchair",
  "shapes",
];

/**
 * Settings editor for the trade registry: rename, recolour, re-icon, reorder,
 * toggle "suggested", archive, and add. Inner content only — SettingsView wraps
 * it in a <Section>. Colours are constrained to the off-axis palette.
 */
export function TradeRegistryEditor() {
  const { trades, createTrade, updateTrade, archiveTrade, unarchiveTrade } = useTrades();
  const [newLabel, setNewLabel] = useState("");

  const sorted = useMemo(
    () => [...trades].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
    [trades]
  );
  const active = sorted.filter((t) => t.active);
  const archived = sorted.filter((t) => !t.active);

  function move(trade: Trade, dir: -1 | 1) {
    const idx = active.findIndex((t) => t.id === trade.id);
    const target = idx + dir;
    if (target < 0 || target >= active.length) return;
    // Reorder by array position, then renumber 0..n-1. Robust to duplicate
    // sort_order values (a plain neighbour-swap silently no-ops on a tie).
    const reordered = [...active];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    reordered.forEach((t, i) => {
      if (t.sortOrder !== i) void updateTrade(t.id, { sortOrder: i });
    });
  }

  function addTrade() {
    const label = newLabel.trim();
    if (!label) return;
    if (trades.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
      setNewLabel("");
      return;
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    void createTrade({
      id,
      key: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${id.slice(0, 4)}`,
      label,
      color: PALETTE[trades.length % PALETTE.length],
      icon: "shapes",
      isSuggestedDefault: false,
      sortOrder: (active.at(-1)?.sortOrder ?? 0) + 10,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    setNewLabel("");
  }

  return (
    <div className="space-y-1">
      <ul className="divide-y divide-border-faint">
        {active.map((t, i) => (
          <RegistryRow
            key={t.id}
            trade={t}
            isFirst={i === 0}
            isLast={i === active.length - 1}
            onMoveUp={() => move(t, -1)}
            onMoveDown={() => move(t, 1)}
            onUpdate={(patch) => updateTrade(t.id, patch)}
            onArchive={() => archiveTrade(t.id)}
          />
        ))}
      </ul>

      <div className="flex items-center gap-2 pt-3">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTrade();
            }
          }}
          placeholder="Add a trade (e.g. Tile, Glazier)"
          className="min-h-[36px] flex-1 rounded-md border border-border bg-surface px-3 text-sm placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
        />
        <button
          type="button"
          onClick={addTrade}
          disabled={!newLabel.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-3.5 min-h-[36px] text-xs font-medium hover:bg-accent-active transition-colors duration-fast disabled:bg-text-disabled disabled:cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Add
        </button>
      </div>

      {archived.length > 0 && (
        <div className="pt-4">
          <p className="text-label uppercase tracking-[0.06em] text-text-tertiary mb-2">Archived</p>
          <ul className="space-y-1">
            {archived.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="inline-flex items-center gap-2 text-sm text-text-tertiary">
                  <span
                    className="inline-block h-2 w-2 rounded-full opacity-60"
                    style={{ backgroundColor: tradeColorVar(t.color) }}
                    aria-hidden
                  />
                  {t.label}
                </span>
                <button
                  type="button"
                  onClick={() => unarchiveTrade(t.id)}
                  className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors duration-fast"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RegistryRow({
  trade,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onArchive,
}: {
  trade: Trade;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdate: (patch: Partial<Trade>) => void;
  onArchive: () => void;
}) {
  const [label, setLabel] = useState(trade.label);
  const Icon = tradeIcon(trade.icon);

  function commitLabel() {
    const next = label.trim();
    if (next && next !== trade.label) onUpdate({ label: next });
    else if (!next) setLabel(trade.label);
  }

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="Move up"
            className="p-0.5 text-text-tertiary hover:text-text-primary disabled:opacity-30 transition-colors duration-fast"
          >
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="Move down"
            className="p-0.5 text-text-tertiary hover:text-text-primary disabled:opacity-30 transition-colors duration-fast"
          >
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        <Icon className="h-4 w-4 shrink-0" style={{ color: tradeColorVar(trade.color) }} strokeWidth={1.75} aria-hidden />

        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="min-h-[34px] flex-1 min-w-0 rounded-md bg-surface-muted px-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
        />

        <button
          type="button"
          onClick={() => onUpdate({ isSuggestedDefault: !trade.isSuggestedDefault })}
          aria-pressed={trade.isSuggestedDefault}
          title="Suggest by default on new projects"
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 min-h-[30px] text-xs font-medium transition-colors duration-fast",
            trade.isSuggestedDefault
              ? "bg-accent-soft text-accent"
              : "bg-surface-muted text-text-tertiary hover:text-text-secondary"
          )}
        >
          <Star className={cn("h-3 w-3", trade.isSuggestedDefault && "fill-current")} strokeWidth={1.75} />
          Suggested
        </button>

        <button
          type="button"
          onClick={onArchive}
          aria-label="Archive trade"
          className="p-1.5 rounded-md text-text-tertiary hover:text-status-blocked hover:bg-surface-muted transition-colors duration-fast"
        >
          <Archive className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 pl-7">
        <div className="flex items-center gap-1.5">
          {PALETTE.map((slug) => (
            <button
              key={slug}
              type="button"
              onClick={() => onUpdate({ color: slug })}
              aria-label={`Colour ${slug}`}
              title={slug}
              className={cn(
                "h-4 w-4 rounded-full transition-transform duration-fast hover:scale-110",
                trade.color === slug && "ring-2 ring-offset-1 ring-text-tertiary"
              )}
              style={{ backgroundColor: tradeColorVar(slug) }}
            />
          ))}
        </div>
        <select
          value={trade.icon}
          onChange={(e) => onUpdate({ icon: e.target.value })}
          aria-label="Icon"
          className="min-h-[30px] rounded-md border border-border bg-surface px-2 text-xs text-text-secondary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
        >
          {ICON_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <span className="text-text-tertiary text-xs">Preview:</span>
        <TradePill trade={trade} size="sm" />
      </div>
    </li>
  );
}
