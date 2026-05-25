"use client";

import { type SOP } from "@features/sops/lib/sops";
import { CATEGORY_LABEL } from "./SopLibrary";

export function SopArticle({ sop }: { sop: SOP }) {
  return (
    <article className="bg-surface border border-border rounded-lg p-6 lg:p-8 max-w-3xl">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-label uppercase text-text-tertiary">
          {CATEGORY_LABEL[sop.category]}
        </span>
        <span className="text-text-disabled">·</span>
        <span className="text-label uppercase text-text-tertiary">
          {sop.estTime}
        </span>
      </div>
      <h2 className="text-2xl font-semibold text-text-primary tracking-tight mb-2">
        {sop.title}
      </h2>
      <p className="text-text-secondary leading-relaxed mb-6">{sop.summary}</p>

      <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
        Steps
      </h3>
      <ol className="space-y-2 mb-8">
        {sop.steps.map((step, idx) => (
          <li
            key={idx}
            className="flex items-start gap-3 text-sm text-text-primary leading-relaxed"
          >
            <span className="h-5 w-5 rounded-full bg-accent-soft text-accent grid place-items-center text-caption font-semibold tabular-nums shrink-0 mt-0.5">
              {idx + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
        Common pitfalls
      </h3>
      <ul className="space-y-2">
        {sop.pitfalls.map((p, idx) => (
          <li
            key={idx}
            className="flex items-start gap-3 text-sm text-text-secondary leading-relaxed"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-status-at-risk shrink-0 mt-2" />
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 pt-6 border-t border-border text-xs text-text-tertiary">
        Versioning, attachments, and per-job assignment land in M5.
      </div>
    </article>
  );
}
