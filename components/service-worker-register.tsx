"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (see public/sw.js). Split into its own
 * tiny client component because service workers can only be registered from
 * the browser, and the root layout is a server component.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability is a nice-to-have on top of the app, not a
        // requirement — a failed registration should never break anything
        // else, so this is deliberately swallowed rather than surfaced.
      });
    }
  }, []);

  return null;
}
