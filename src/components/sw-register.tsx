"use client";

import { useEffect } from "react";

/** Registers the service worker (enables PWA install + offline resilience). */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
