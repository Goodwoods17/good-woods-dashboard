import { cn } from "@shared/lib/utils";

/**
 * The shared inline-flex render primitive behind every "dot + label
 * pill" in the system — HealthPill, StatusBadge, BlockerChip, and the
 * Hitlist row chips all share this shape:
 *   [colored dot] [label]
 *
 * Tone is passed as three Tailwind class strings (bg, text, dot) so
 * domain-aware wrappers stay in charge of the tone vocabulary. The Pill
 * itself doesn't know about HealthStatus or PipelineStatus.
 *
 * Shape picks between the badge (rounded-md, sharper) and the pill
 * (rounded-full, softer). Size picks between sm (12px text, tight
 * padding) and md (14px text, looser padding). DESIGN.md §5 component
 * patterns.
 */
export type PillTone = {
  /** Tailwind background class, e.g. "bg-accent-soft". */
  bg: string;
  /** Tailwind text-color class, e.g. "text-accent". */
  text: string;
  /** Tailwind background class for the leading dot, e.g. "bg-accent". */
  dot: string;
};

export function Pill({
  tone,
  label,
  shape = "pill",
  size = "sm",
}: {
  tone: PillTone;
  label: React.ReactNode;
  shape?: "rounded" | "pill";
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        shape === "rounded" ? "rounded-md" : "rounded-full",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        tone.bg,
        tone.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {label}
    </span>
  );
}
