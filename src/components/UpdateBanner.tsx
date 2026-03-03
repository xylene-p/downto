"use client";

import { useEffect, useRef } from "react";
import { logVersionPing } from "@/lib/db";

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const MIN_BACKGROUND_MS = 5 * 60 * 1000; // 5 minutes

export default function UpdateBanner() {
  const backgroundSince = useRef<number | null>(null);

  useEffect(() => {
    if (CLIENT_BUILD_ID) logVersionPing(CLIENT_BUILD_ID);
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        backgroundSince.current = Date.now();
        return;
      }

      // Returning to foreground
      const since = backgroundSince.current;
      backgroundSince.current = null;
      if (!since || Date.now() - since < MIN_BACKGROUND_MS) return;

      fetch("/api/version")
        .then((r) => r.json())
        .then(async ({ buildId }) => {
          if (!buildId || buildId === CLIENT_BUILD_ID) return;

          // Hard reset: unregister service worker, clear caches, reload
          const regs = await navigator.serviceWorker?.getRegistrations() ?? [];
          await Promise.all(regs.map((r) => r.unregister()));
          const keys = await caches?.keys() ?? [];
          await Promise.all(keys.map((k) => caches.delete(k)));
          window.location.reload();
        })
        .catch(() => {});
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return null;
}
