import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@shared/lib/utils";

/**
 * The app's real primary button — the ink-pill call-to-action that was
 * hand-rolled ~12× across the documents feature (and elsewhere). This is the
 * canonical home for that design language: a rounded-full pill in `ink-pill`
 * that darkens to `accent-active` on hover, with a warm focus ring.
 *
 * Not to be confused with the unrelated shadcn `Button` in `button.tsx`
 * (`rounded-lg`, `bg-primary`), which is a different, currently-unused system.
 *
 * Variants:
 *  - `primary` — filled ink pill for the main action on a surface.
 *  - `subtle`  — muted fill for a secondary/toggle-off state (matches the
 *                "Close" arm of the Documents add-toggle).
 *
 * Sizes track the three pill footprints already in use: `xs` (compact inline
 * actions), `sm` (default toolbar pill), and `md` (prominent empty-state CTA).
 */
const pillButtonVariants = cva(
  "inline-flex items-center justify-center rounded-full font-medium transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-ink-pill text-white hover:bg-accent-active",
        subtle: "bg-surface-muted text-text-secondary hover:text-text-primary",
      },
      size: {
        xs: "gap-1 px-2.5 py-1 text-xs",
        sm: "gap-1.5 px-3 py-1.5 text-xs",
        md: "gap-1.5 px-4 py-2 text-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "sm",
    },
  }
);

export type PillButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof pillButtonVariants>;

export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(function PillButton(
  { className, variant, size, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(pillButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
