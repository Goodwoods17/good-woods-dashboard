"use client";

import { Database } from "lucide-react";
import { cn } from "@shared/lib/utils";

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border bg-surface-muted flex items-center gap-2">
        {title === "Storage" && (
          <Database className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
        )}
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 p-5">
        {children}
      </dl>
    </section>
  );
}

export function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-0.5">
        {label}
      </dt>
      <dd className={cn("text-sm text-text-primary", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}
