"use client";

/**
 * Blank sketch surface — a fixed 4:3 white card with an optional dot grid.
 * Purely presentational: the markup overlay (MarkupLayer) sits above it via
 * DrawingDoc's `overlay`, so all drawing/selecting happens there. The dots are
 * a light reference grid to sketch off of, toggleable from the toolbar.
 */
export function SketchCanvas({ showDots = true }: { showDots?: boolean }) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-white shadow-resting">
      {showDots && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 motion-reduce:transition-none"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(26,25,22,0.18) 1px, transparent 1.4px)",
            backgroundSize: "24px 24px",
            backgroundPosition: "12px 12px",
          }}
        />
      )}
    </div>
  );
}
