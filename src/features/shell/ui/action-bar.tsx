"use client";

import type { ReactNode } from "react";
import { useKeyboardOpen } from "@/components/ui/keyboard";

// FR-02.2 and DESIGN §7.1.1: a car page's action bar, fixed to the bottom of a screen under 1024 px.
// It is 64 px tall over the home indicator's safe area, 48 px on a screen under 480 px tall
// (--bar-height), on opaque --surface-1, with the price at the start and the actions at the end. It
// never hides on scroll, only while the keyboard is open (DESIGN §8.4). The page's last lines and the
// toasts stay clear of it (globals.css's --page-end), and the English offer waits while it shows
// (D-047). T-21 places it on the car page and T-23 fills it.

type ActionBarProps = {
  /**
   * The price, at the start, with car.priceBeforeCustoms beside it as visible text for a car not
   * yet cleared through customs (BR-45)
   */
  price: ReactNode;
  /** The buttons, at the end */
  actions: ReactNode;
};

export function ActionBar({ price, actions }: ActionBarProps) {
  const keyboardOpen = useKeyboardOpen();
  return (
    <div
      data-action-bar
      hidden={keyboardOpen}
      className="fixed inset-x-0 bottom-0 z-30 box-content flex h-(--bar-height) items-center justify-between gap-3 bg-surface-1 px-band pb-[env(safe-area-inset-bottom)] surface-edge lg:hidden"
    >
      <div className="min-w-0">{price}</div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  );
}
