"use client";

import Link from "next/link";
import { Briefcase, ArrowUpRight } from "lucide-react";

export function EmptyState() {
  return (
    <div className="bg-surface border border-border border-dashed rounded-lg p-10 text-center">
      <Briefcase
        className="h-6 w-6 text-text-tertiary mx-auto mb-3"
        strokeWidth={1.5}
      />
      <p className="text-sm text-text-secondary">
        No clients yet. Once you create jobs, they&apos;ll group here by client.
      </p>
      <Link
        href="/jobs/new"
        className="inline-flex items-center gap-1 mt-4 text-sm font-medium text-accent hover:text-accent-hover"
      >
        Create your first job
        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
      </Link>
    </div>
  );
}
