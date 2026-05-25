import { cn } from "@shared/lib/utils";

/**
 * Small chip flag for synthetic / placeholder data. Used wherever a value
 * is rendered from a heuristic fallback rather than user-set state — most
 * commonly on blocker chips when `BLOCKER_IS_SYNTHETIC` applies. When the
 * underlying data becomes real, callers stop rendering this.
 */
export function DemoTag({ inline = false }: { inline?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1 text-[9px] font-semibold uppercase tracking-[0.06em]",
        // 9px sits below our token scale; keep arbitrary value
        "bg-surface-sunken text-text-tertiary",
        inline && "mx-1 align-middle"
      )}
      aria-label="demo data"
    >
      demo
    </span>
  );
}
