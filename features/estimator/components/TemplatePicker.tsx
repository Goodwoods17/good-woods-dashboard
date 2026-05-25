"use client";

import { Check } from "lucide-react";
import { cn } from "@shared/lib/utils";
import {
  BUILT_IN_TEMPLATES,
  type EstimateTemplate,
} from "@features/estimator/lib/templates";
import { QUOTE_SECTIONS } from "@features/estimator/lib/sections";

export function TemplatePicker({
  open,
  current,
  onPick,
  onClose,
}: {
  open: boolean;
  current?: EstimateTemplate;
  onPick: (tpl: EstimateTemplate) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">What kind of job?</h2>
          <p className="text-xs text-text-tertiary mt-0.5">
            Pick a template to set which sections appear on this quote. You can
            change it later.
          </p>
        </div>
        <div className="p-4 grid grid-cols-1 gap-2">
          {BUILT_IN_TEMPLATES.map((tpl) => {
            const isCurrent = tpl.id === current?.id;
            const visibleLabels = tpl.activeSections
              .map(
                (id) => QUOTE_SECTIONS.find((s) => s.id === id)?.label ?? id,
              )
              .join(" · ");
            return (
              <button
                key={tpl.id}
                onClick={() => {
                  onPick(tpl);
                  onClose();
                }}
                className={cn(
                  "text-left px-4 py-3 rounded-lg border transition-colors duration-fast",
                  isCurrent
                    ? "border-accent bg-accent-soft/30 ring-1 ring-accent"
                    : "border-border bg-surface-muted/40 hover:border-border-strong hover:bg-surface-muted",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary">
                      {tpl.name}
                    </div>
                    {tpl.description && (
                      <div className="text-xs text-text-tertiary mt-0.5">
                        {tpl.description}
                      </div>
                    )}
                    <div className="text-caption text-text-tertiary mt-2 leading-snug">
                      <span className="font-medium text-text-secondary">Sections:</span>{" "}
                      {visibleLabels}
                    </div>
                  </div>
                  {isCurrent && (
                    <Check
                      className="h-4 w-4 text-accent shrink-0 mt-1"
                      strokeWidth={2}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div className="px-6 py-3 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="text-xs text-text-tertiary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function TemplateChip({
  template,
  onClickChange,
}: {
  template: EstimateTemplate;
  onClickChange: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-accent-soft/40 border border-accent-soft px-3 py-1 text-xs">
      <span className="text-text-secondary">Template:</span>
      <span className="font-medium text-text-primary">{template.name}</span>
      <button
        onClick={onClickChange}
        className="text-accent hover:underline ml-1"
      >
        Change
      </button>
    </div>
  );
}
