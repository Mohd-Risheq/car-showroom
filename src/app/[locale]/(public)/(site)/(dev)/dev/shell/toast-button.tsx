"use client";

import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toaster";

/** Shows a toast, which sits above the action bar while the bar shows */
export function ToastButton() {
  return (
    <Button variant="secondary" onClick={() => showToast("A toast, above the action bar")}>
      Show a toast
    </Button>
  );
}
