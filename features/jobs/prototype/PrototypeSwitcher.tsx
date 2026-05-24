"use client";

// PROTOTYPE — Floating switcher bar. Dev-only.
// Cycles between Current (no ?variant=) and A/B/C. Updates the URL search
// param so the variant is shareable and reload-stable. Also bound to ←/→.

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, FlaskConical } from "lucide-react";
import { cn } from "@shared/lib/utils";

type VariantKey = "current" | "A" | "B" | "C";

const ORDER: VariantKey[] = ["current", "A", "B", "C"];

const LABELS: Record<VariantKey, string> = {
  current: "Current (List/Kanban)",
  A: "A — Schedule",
  B: "B — Cashflow",
  C: "C — WIP / Funnel",
};

export function PrototypeSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("variant");
  const current: VariantKey =
    raw === "A" || raw === "B" || raw === "C" ? raw : "current";

  const go = (key: VariantKey) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (key === "current") {
      params.delete("variant");
    } else {
      params.set("variant", key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const cycle = (dir: 1 | -1) => {
    const idx = ORDER.indexOf(current);
    const next = ORDER[(idx + dir + ORDER.length) % ORDER.length];
    go(next);
  };

  // Arrow key cycling — but stay out of the way when typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      cycle(e.key === "ArrowRight" ? 1 : -1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // Hide in production builds. If a stray merge lands, no end user ever sees it.
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-1 rounded-full",
        "bg-text-primary text-white shadow-lg",
        "px-1.5 py-1.5 text-xs"
      )}
      role="toolbar"
      aria-label="Prototype variant switcher"
    >
      <span className="flex items-center gap-1.5 pl-2 pr-2 text-white/70">
        <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="uppercase tracking-wider text-[10px]">Prototype</span>
      </span>
      <button
        onClick={() => cycle(-1)}
        className="rounded-full p-1.5 hover:bg-white/10 transition-colors duration-fast"
        aria-label="Previous variant"
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <div className="flex items-center gap-1">
        {ORDER.map((key) => (
          <button
            key={key}
            onClick={() => go(key)}
            className={cn(
              "px-2.5 py-1 rounded-full transition-colors duration-fast tabular-nums",
              key === current
                ? "bg-white text-text-primary font-medium"
                : "text-white/80 hover:bg-white/10"
            )}
          >
            {key === "current" ? "Current" : key}
          </button>
        ))}
      </div>
      <button
        onClick={() => cycle(1)}
        className="rounded-full p-1.5 hover:bg-white/10 transition-colors duration-fast"
        aria-label="Next variant"
      >
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <span className="hidden md:inline pl-2 pr-2 text-white/60 text-[10px]">
        {LABELS[current]}
      </span>
    </div>
  );
}
