"use client";

import { useEffect } from "react";
import { dismissToast, showToast } from "@/components/ui/toaster";

// DESIGN §7.2.11: while the browser is offline, a toast says so and that what has loaded stays. It
// stays until the connection is back.
export function OfflineToast({ message }: { message: string }) {
  useEffect(() => {
    let toast: string | undefined;
    const offline = () => {
      toast ??= showToast(message, { duration: Number.POSITIVE_INFINITY });
    };
    const online = () => {
      if (toast === undefined) return;
      dismissToast(toast);
      toast = undefined;
    };
    if (!navigator.onLine) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      online();
    };
  }, [message]);
  return null;
}
