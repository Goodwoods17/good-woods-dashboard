import type { MutableRefObject } from "react";

/**
 * Run an optimistic local mutation with automatic rollback.
 *
 * Applies a forward transform to a ref-mirrored list (and pushes it to React via
 * `setState`), runs the `persist` call, and — if `persist` throws — applies the
 * `rollback` transform to the *current* state and re-throws. Rollback is a
 * transform (not a snapshot restore) on purpose: it reverts only the row this
 * mutation touched, so a concurrent in-flight mutation to a different row is not
 * clobbered.
 *
 * `persist` may return a corrected list — e.g. an insert that swaps an optimistic
 * row for the saved DB row. When it returns a list, that becomes the new state;
 * returning `void` leaves the optimistic state in place.
 *
 * The ref is the synchronous source of truth (React 18 defers functional-update
 * bodies); every mutator reads and writes `ref.current` so rapid same-id taps
 * compose deterministically.
 */
export type OptimisticArgs<T> = {
  ref: MutableRefObject<T[]>;
  setState: (next: T[]) => void;
  /** Forward transform — apply the optimistic change to the current list. */
  apply: (cur: T[]) => T[];
  /** Inverse transform — undo just this change, applied on failure. */
  rollback: (cur: T[]) => T[];
  /** The durable write. Throw to trigger rollback; optionally return a corrected list. */
  persist: () => Promise<T[] | void>;
};

export async function optimistic<T>({
  ref,
  setState,
  apply,
  rollback,
  persist,
}: OptimisticArgs<T>): Promise<void> {
  ref.current = apply(ref.current);
  setState(ref.current);
  try {
    const corrected = await persist();
    if (corrected) {
      ref.current = corrected;
      setState(corrected);
    }
  } catch (err) {
    ref.current = rollback(ref.current);
    setState(ref.current);
    throw err;
  }
}
