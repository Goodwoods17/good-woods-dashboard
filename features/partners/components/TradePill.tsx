"use client";

import {
  Armchair,
  Droplet,
  PaintRoller,
  Shapes,
  Square,
  Truck,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@shared/lib/utils";
import type { Trade } from "../lib/types";

/**
 * Lucide icon per trade icon-key (DESIGN.md Trade Chip spec). Icon carries
 * identity; colour carries the glance. Unknown keys fall back to Shapes.
 */
const TRADE_ICONS: Record<string, LucideIcon> = {
  wrench: Wrench,
  "paint-roller": PaintRoller,
  square: Square,
  zap: Zap,
  droplet: Droplet,
  truck: Truck,
  armchair: Armchair,
  shapes: Shapes,
};

export function tradeIcon(key: string): LucideIcon {
  return TRADE_ICONS[key] ?? Shapes;
}

/** Resolve a trade's colour slug to its CSS custom property. */
export function tradeColorVar(color: string): string {
  return `var(--trade-${color})`;
}

type TradeVisual = Pick<Trade, "label" | "color" | "icon">;

/**
 * The trade chip: a colour dot + Lucide icon on a neutral pill, with a label.
 * Deliberately quieter than a Health Pill (no coloured soft-fill) so category
 * ranks below condition in the eight-feet glance. Colour rides the dot + icon
 * only, and the icon + label keep it unambiguous (never colour alone).
 */
export function TradePill({
  trade,
  size = "md",
}: {
  trade: TradeVisual;
  size?: "sm" | "md";
}) {
  const Icon = tradeIcon(trade.icon);
  const color = tradeColorVar(trade.color);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-surface-muted font-medium text-text-secondary",
        size === "sm" ? "gap-1.5 px-2 py-0.5 text-xs" : "gap-2 px-2.5 py-1 text-xs"
      )}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <Icon
        className={size === "sm" ? "h-3 w-3 shrink-0" : "h-3.5 w-3.5 shrink-0"}
        style={{ color }}
        strokeWidth={1.75}
        aria-hidden
      />
      {trade.label}
    </span>
  );
}

/** Just the colour dot, for dense rows where the label is elsewhere. */
export function TradeDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: tradeColorVar(color) }}
      aria-hidden
    />
  );
}
