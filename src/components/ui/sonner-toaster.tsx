"use client";

import type { ReactNode } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { Button } from "./button";

// The toaster's Sonner side, which toaster.tsx loads after the page's first load (D-047). DESIGN §6.1:
// Sonner at the bottom centre, in the page's direction, clear of the safe areas and above whatever
// holds the bottom of the screen, as a car page's action bar (globals.css's --page-end). Sonner keeps
// the stacking, swiping and timing; each toast is our own card on the tokens (a raised --surface-2
// with the overlay shadow, square like every panel), so none of Sonner's own colours, radius or system
// font shows. Sonner announces toasts in a polite live region (SRS §10.4, 4.1.3), and under reduced
// motion globals.css turns its slide into a 200 ms crossfade (DESIGN §4.5).

/** The page margin, plus the notch's safe area on that side, or below, the bottom chrome's */
const EDGE = {
  bottom: "calc(var(--spacing-page) + var(--page-end))",
  left: "calc(var(--spacing-page) + env(safe-area-inset-left))",
  right: "calc(var(--spacing-page) + env(safe-area-inset-right))",
};

export type ToasterProps = {
  dir: "rtl" | "ltr";
  /** The toast region's accessible name, from the catalogs */
  label: string;
};

export function SonnerToaster({ dir, label }: ToasterProps) {
  return (
    <Sonner
      dir={dir}
      position="bottom-center"
      customAriaLabel={label}
      offset={EDGE}
      mobileOffset={EDGE}
      // Sonner sets a system font on its list, which only an inline style outranks
      style={{ fontFamily: "inherit" }}
      // Sonner sizes its own cards; ours take its width on desktop (on phones its rule wins)
      toastOptions={{ className: "w-(--width)" }}
    />
  );
}

type ToastAction = { label: string; onClick: () => void };

export type ToastOptions = {
  /** One action, such as trying again after a server error (FR-31's error states) */
  action?: ToastAction;
  /** Milliseconds before it closes; Sonner's 4 s when not given */
  duration?: number;
};

/** Shows a toast under the id toaster.tsx gave it */
export function openToast(id: string, message: ReactNode, { action, duration }: ToastOptions): void {
  toast.custom((shown) => <ToastCard id={shown} message={message} action={action} />, {
    id,
    ...(duration === undefined ? {} : { duration }),
  });
}

export function closeToast(id: string): void {
  toast.dismiss(id);
}

type ToastCardProps = { id: string | number; message: ReactNode; action: ToastAction | undefined };

function ToastCard({ id, message, action }: ToastCardProps) {
  return (
    <div className="flex w-full items-center gap-3 bg-surface-2 px-4 py-3 text-ink shadow-overlay surface-edge">
      <p className="flex-1">{message}</p>
      {action ? (
        <Button
          variant="quiet"
          onClick={() => {
            action.onClick();
            toast.dismiss(id);
          }}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
