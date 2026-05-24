"use client";

import { X } from "lucide-react";
import { cn } from "@shared/lib/utils";

/**
 * Cross-feature modal shell. Centered, backdrop-blurred overlay with
 * close-on-outside-click. Supports an `andon` tone for safety-critical
 * dialogs (the andon-soft fill on the header — see DESIGN.md "One Loud
 * Red Rule"). For non-andon dialogs use the default tone.
 *
 * Previously lived at `features/shop/components/Modal.tsx`; moved to
 * shared 2026-05-24 since it's not shop-specific — any form-heavy
 * feature can reach for it.
 */
export function Modal({
  title,
  tone,
  children,
  onClose,
}: {
  title: string;
  tone?: "andon";
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-text-primary/30 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-surface rounded-xl shadow-modal overflow-hidden"
      >
        <div
          className={cn(
            "px-5 py-3.5 border-b border-border-faint flex items-center justify-between",
            tone === "andon" ? "bg-status-andon-soft" : "bg-surface-muted/60"
          )}
        >
          <h3
            className={cn(
              "font-serif text-lg font-medium tracking-[-0.01em]",
              tone === "andon" ? "text-status-andon" : "text-text-primary"
            )}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors duration-fast"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
