import type { Job } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";
import { DemoTag } from "@shared/components/ui/DemoTag";
import {
  isSyntheticBlocker,
  resolveBlockerText,
  resolveBlockerTone,
} from "@features/jobs/lib/blockers";

type Size = "sm" | "md";

/**
 * Single source of truth for blocker chip rendering. Reads the job's
 * blocker (real or synthetic) and renders a tone-coloured pill plus an
 * optional {@link DemoTag} when the value is synthetic.
 *
 * The `subtle` flag is used by rest-of-pipeline rows on the Hitlist:
 * when true, synthetic "Clear" chips are hidden (since they'd add noise
 * to every row in the compact list).
 *
 * The `size` prop picks between the Hitlist register (md, 10px) and the
 * Schedule register (sm, 9px). Tone colours and text content are the
 * same in both.
 */
export function BlockerChip({
  job,
  subtle = false,
  size = "md",
}: {
  job: Job;
  subtle?: boolean;
  size?: Size;
}) {
  const synthetic = isSyntheticBlocker(job);
  const text = resolveBlockerText(job);
  const tone = resolveBlockerTone(job);

  // Hide synthetic "Clear" pills on rest-of-pipeline rows to keep them quiet.
  if (subtle && synthetic && tone === "on_track") return null;

  const sizeClass =
    size === "sm"
      ? "px-1.5 py-0.5 text-[9px] gap-1"
      : "px-2 py-0.5 text-micro gap-1";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium uppercase tracking-[0.04em] shrink-0",
        sizeClass,
        tone === "blocked" && "bg-status-blocked-soft text-status-blocked",
        tone === "at_risk" && "bg-status-at-risk-soft text-status-at-risk",
        tone === "on_track" && "bg-status-on-track-soft text-status-on-track",
        tone === "neutral" && "bg-surface-muted text-text-secondary",
        subtle && "opacity-80"
      )}
      title={synthetic ? `${text} · synthetic fallback` : text}
    >
      {text}
      {synthetic && <DemoTag />}
    </span>
  );
}
