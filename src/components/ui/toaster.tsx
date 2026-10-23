"use client";

import type { ReactNode } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { Button } from "./button";

// DESIGN §6.1: Sonner at the bottom centre, in the page's direction, clear of the safe areas.
// Sonner keeps the stacking, swiping and timing; each toast is our own card on the tokens (a raised
// --surface-2 with the overlay shadow, square like every panel), so none of Sonner's own colours,
// radius or system font shows. Sonner announces toasts in a polite live region (SRS §10.4, 4.1.3),
// and under reduced motion globals.css turns its slide into a 200 ms crossfade (DESIGN §4.5).

/** The page margin, plus the notch or home indicator's safe area on that side */
const EDGE = {
  bottom: "calc(var(--spacing-page) + env(safe-area-inset-bottom))",
  left: "calc(var(--spacing-page) + env(safe-area-inset-left))",
  right: "calc(var(--spacing-page) + env(safe-area-inset-right))",
};

type ToasterProps = {
  dir: "rtl" | "ltr";
  /** The toast region's accessible name, from the catalogs */
  label: string;
};

/** Mounted once, in a root layout */
export function Toaster({ dir, label }: ToasterProps) {
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

type ToastOptions = {
  /** One action, such as trying again after a server error (FR-31's error states) */
  action?: ToastAction;
  /** Milliseconds before it closes; Sonner's 4 s when not given */
  duration?: number;
};

/** Shows a toast: one short message, from the catalogs, and at most one action */
export function showToast(message: ReactNode, { action, duration }: ToastOptions = {}): string | number {
  return toast.custom((id) => <ToastCard id={id} message={message} action={action} />, {
    ...(duration === undefined ? {} : { duration }),
  });
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
