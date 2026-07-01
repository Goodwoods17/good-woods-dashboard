"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copy-to-clipboard with a transient "copied" flag, shared by the various
 * "Copy link" buttons (document share rows, share panels). Writes via
 * `navigator.clipboard.writeText` inside a try/catch — on success it flips
 * `copied` true and resets it after `resetMs`; on failure (clipboard denied /
 * unavailable) it returns false and leaves `copied` untouched, so the caller's
 * visible link/value is still the fallback. The reset timer is cleared on
 * unmount and on a re-copy.
 */
export function useCopyToClipboard(resetMs = 1500): {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        clear();
        timer.current = setTimeout(() => setCopied(false), resetMs);
        return true;
      } catch {
        return false;
      }
    },
    [clear, resetMs]
  );

  return { copied, copy };
}
