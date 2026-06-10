"use client";

import { Trash2, Images } from "lucide-react";
import { useReface } from "../lib/refaceStore";
import { summarizeProject } from "../lib/sqft";
import { priceOrder } from "../lib/pricing";
import type { RefaceProject } from "../lib/types";
import { formatCAD, formatDate } from "@shared/lib/format";

/** Cards for existing measurement projects. */
export function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const { projects, deleteProject } = useReface();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          onOpen={() => onOpen(p.id)}
          onDelete={() => deleteProject(p.id)}
        />
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: RefaceProject;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const summary = summarizeProject(project);
  const quote = priceOrder(project);
  const photoCount = project.photos.length;

  return (
    <button
      onClick={onOpen}
      className="text-left rounded-xl border border-border bg-surface shadow-resting hover:shadow-hover hover:border-border-strong transition-all duration-fast p-4 group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-serif text-title text-text-primary truncate">{project.name}</h3>
          <p className="text-caption text-text-tertiary mt-0.5">
            Updated {formatDate(project.updatedAt.slice(0, 10))}
          </p>
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete "${project.name}"? This removes its photos and measurements.`))
              onDelete();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              onDelete();
            }
          }}
          className="text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-status-blocked transition-all duration-fast p-1 rounded"
          aria-label="Delete project"
        >
          <Trash2 className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3 text-caption text-text-tertiary">
        <span className="inline-flex items-center gap-1">
          <Images className="h-3.5 w-3.5" strokeWidth={1.75} />
          {photoCount} photo{photoCount === 1 ? "" : "s"}
        </span>
        <span>·</span>
        <span>{summary.totalCount} pieces</span>
        <span>·</span>
        <span>{summary.totalSqft.toFixed(1)} sq ft</span>
      </div>

      {quote.subtotal > 0 && (
        <div className="mt-3 pt-3 border-t border-border-faint flex items-center justify-between">
          <span className="text-caption text-text-tertiary">Order total</span>
          <span className="font-mono text-sm font-medium text-text-primary">
            {formatCAD(quote.total)}
          </span>
        </div>
      )}
    </button>
  );
}
