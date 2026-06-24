import Link from "next/link";
import { PencilRuler } from "lucide-react";
import { cn } from "@shared/lib/utils";

export function DrawingsButton({ jobId, className }: { jobId: string; className?: string }) {
  return (
    <Link href={`/jobs/${jobId}/drawings`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-sunken hover:text-text-primary duration-fast",
        className
      )}>
      <PencilRuler className="h-3.5 w-3.5" strokeWidth={1.75} />
      Drawings
    </Link>
  );
}
