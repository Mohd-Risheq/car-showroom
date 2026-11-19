"use client";

import { type ReactElement, type ReactNode, useLayoutEffect, useRef } from "react";
import { useKeyboardOpen } from "@/components/ui/keyboard";
import { cn } from "@/lib/class-names";

// FR-02.2 and DESIGN §7.1.1: a car page's action bar, fixed to the bottom of a screen under
// 1024 px. It is 64 px tall over the home indicator's safe area, 48 px on a screen under 480 px
// tall (--bar-height), on opaque --surface-2, a step the eye sees over the page and the footer,
// with the price at the start and the actions at the end. A bar without a price, as a sold car's
// is, shares its width among its actions (D-049). It never hides on scroll, only while the keyboard
// is open (DESIGN §8.4). The page's last lines and the toasts stay clear of it (globals.css's
// --page-end), and the English offer waits while it shows (D-047). T-21 places it on the car page
// and T-23 fills it.
//
// A client navigation keeps the page it leaves in the document, out of sight, for the way back
// (React's Activity), and stops that page's effects while it is. The bar marks itself away then,
// and globals.css makes no room for a bar so marked, nor holds the offer back for it (D-049). The
// server's bar carries no mark, so it counts without JavaScript too.

type ActionBarProps = {
  /**
   * The price, at the start, with car.priceBeforeCustoms beside it as visible text for a car not
   * yet cleared through customs (BR-45); without one the actions take the bar's width. An element,
   * so a choice that comes to null or false can't leave an empty start
   */
  price?: ReactElement | undefined;
  /** The buttons, at the end */
  actions: ReactNode;
};

export function ActionBar({ price, actions }: ActionBarProps) {
  const keyboardOpen = useKeyboardOpen();
  const bar = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = bar.current;
    element?.removeAttribute("data-away");
    return () => element?.setAttribute("data-away", "");
  }, []);

  return (
    <div
      ref={bar}
      data-action-bar
      hidden={keyboardOpen}
      className="fixed inset-x-0 bottom-0 z-30 box-content flex h-(--bar-height) items-center justify-between gap-3 bg-surface-2 px-band pb-[env(safe-area-inset-bottom)] surface-edge lg:hidden"
    >
      {price === undefined ? null : <div className="min-w-0">{price}</div>}
      <div className={cn("flex items-center gap-2", price === undefined ? "flex-1 *:flex-1" : "shrink-0")}>
        {actions}
      </div>
    </div>
  );
}
