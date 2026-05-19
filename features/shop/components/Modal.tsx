"use client";

import { X } from "lucide-react";
import { cn } from "@shared/lib/utils";

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
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-surface border border-border-strong rounded-lg shadow-lg overflow-hidden"
      >
        <div
          className={cn(
            "px-5 py-3.5 border-b border-border flex items-center justify-between",
            tone === "andon" ? "bg-status-andon-soft" : "bg-surface-muted"
          )}
        >
          <h3
            className={cn(
              "text-sm font-semibold",
              tone === "andon" ? "text-status-andon" : "text-text-primary"
            )}
          >
            {title}
          </h3>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function FieldStack({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
    />
  );
}
