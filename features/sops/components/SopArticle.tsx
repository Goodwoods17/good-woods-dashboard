"use client";

import { ChevronLeft, Clock, AlertTriangle } from "lucide-react";
import { type SOP } from "@features/sops/lib/sops";
import { CATEGORY_ICON, CATEGORY_LABEL } from "./SopLibrary";

type Props = {
  sop: SOP;
  /** When provided (phone drilldown), renders a back control above the title. */
  onBack?: () => void;
};

/** The article is the product: a well-typeset procedure document. */
export function SopArticle({ sop, onBack }: Props) {
  const CategoryIcon = CATEGORY_ICON[sop.category];

  return (
    <article className="overflow-hidden rounded-2xl bg-surface px-5 py-6 shadow-resting md:px-8 md:py-8">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-secondary text-text-secondary shadow-floating transition-shadow duration-fast hover:shadow-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
          All procedures
        </button>
      )}

      {/* Masthead */}
      <header className="border-b border-border-faint pb-6">
        <div className="flex items-center gap-1.5 text-label uppercase text-text-tertiary">
          <CategoryIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          {CATEGORY_LABEL[sop.category]}
        </div>
        <h1 className="mt-2 font-serif text-headline font-medium text-text-primary">{sop.title}</h1>
        <p className="mt-2 max-w-prose text-body leading-relaxed text-text-secondary">
          {sop.summary}
        </p>
        <div className="mt-4 inline-flex items-center gap-1.5 text-caption text-text-tertiary">
          <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          <span className="font-mono tabular-nums">{sop.estTime}</span>
        </div>
      </header>

      {/* Steps */}
      <section className="mt-7">
        <h2 className="text-label font-medium uppercase text-text-tertiary">Steps</h2>
        <ol className="mt-4 space-y-5">
          {sop.steps.map((step, idx) => (
            <li key={idx} className="flex items-start gap-4">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-muted font-mono text-caption font-semibold tabular-nums text-text-secondary"
                aria-hidden
              >
                {idx + 1}
              </span>
              <p className="pt-0.5 text-body leading-relaxed text-text-primary">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Watch-outs: soft-bg block with a leading icon (no left-stripe callout). */}
      <section className="mt-8 rounded-xl bg-status-at-risk-soft px-4 py-4 md:px-5">
        <h2 className="flex items-center gap-1.5 text-label font-medium uppercase text-status-at-risk">
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Watch-outs
        </h2>
        <ul className="mt-3 space-y-2.5">
          {sop.pitfalls.map((p, idx) => (
            <li key={idx} className="flex items-start gap-2.5">
              <span
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-status-at-risk"
                aria-hidden
              />
              <p className="text-body leading-relaxed text-text-primary">{p}</p>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
