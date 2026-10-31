"use client";

import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import type * as Sonner from "./sonner-toaster";

// DESIGN §6.1's toaster. Sonner (sonner-toaster.tsx) weighs about 10 KB, more than the public pages'
// first load has room for (NFR-PERF-03), so it loads once the page has hydrated (D-047). Not at the
// first toast: the offline toast (DESIGN §7.2.11) comes when nothing can load any more, and the
// toast region should be on the page before a toast is. A toast asked for sooner shows as the toaster
// mounts, as Sonner shows the toasts made before its toaster. Offline before Sonner has loaded, it
// loads when the connection is back, or with the next toast.

/** The toasters still waiting for Sonner, each told when it loads, whichever call loaded it */
const waiting = new Set<(sonner: typeof Sonner) => void>();

async function loadSonner(): Promise<typeof Sonner> {
  const sonner = await import("./sonner-toaster");
  for (const mount of waiting) mount(sonner);
  return sonner;
}

/** Mounted once, in a root layout */
export function Toaster(props: Sonner.ToasterProps) {
  const [SonnerToaster, setSonnerToaster] = useState<ComponentType<Sonner.ToasterProps> | null>(null);

  useEffect(() => {
    if (SonnerToaster !== null) return;
    const mount = (sonner: typeof Sonner) => setSonnerToaster(() => sonner.SonnerToaster);
    const load = () => {
      loadSonner().catch(() => {
        // Offline: it loads when the connection is back, or with the next toast
      });
    };
    waiting.add(mount);
    load();
    window.addEventListener("online", load);
    return () => {
      waiting.delete(mount);
      window.removeEventListener("online", load);
    };
  }, [SonnerToaster]);

  return SonnerToaster === null ? null : <SonnerToaster {...props} />;
}

/** The toast calls so far, each run after the one before, so a toast closed as it opens stays closed */
let calls: Promise<void> = Promise.resolve();
let made = 0;

function withSonner(call: (sonner: typeof Sonner) => void): void {
  calls = calls
    .then(loadSonner)
    .then(call)
    .catch(() => {
      // Sonner couldn't load, as offline: this call is dropped, and the next one loads it again
    });
}

/** Shows a toast: one short message, from the catalogs, and at most one action */
export function showToast(message: ReactNode, options: Sonner.ToastOptions = {}): string {
  made += 1;
  const id = `toast-${made}`;
  withSonner((sonner) => sonner.openToast(id, message, options));
  return id;
}

/** Closes a toast showToast opened */
export function dismissToast(id: string): void {
  withSonner((sonner) => sonner.closeToast(id));
}
