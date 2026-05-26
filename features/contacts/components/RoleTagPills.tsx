import { Pill, type PillTone } from "@shared/components/ui/Pill";
import { ROLE_TAG_LABELS, type RoleTag } from "@shared/lib/types";

/**
 * Neutral pill row for a contact's role tags. Stays out of the pipeline
 * (taupe / clay) and health (sage / amber / red) colour axes — those
 * are reserved semantics per DESIGN.md. Locked from /impeccable craft
 * review P1 #6.
 */

const NEUTRAL: PillTone = {
  bg: "bg-surface-muted",
  text: "text-text-secondary",
  dot: "bg-text-tertiary",
};

export function RoleTagPills({ tags }: { tags: RoleTag[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <Pill key={tag} tone={NEUTRAL} label={ROLE_TAG_LABELS[tag]} />
      ))}
    </div>
  );
}
