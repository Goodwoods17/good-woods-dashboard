"use client";

import { useEffect, useState } from "react";

/**
 * True below the `md` breakpoint (phone). Starts false on the server and the
 * first client render so hydration matches, then corrects after mount.
 */
export function useIsMobile(query = "(max-width: 767px)"): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return mobile;
}
