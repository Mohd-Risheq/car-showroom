"use client";

import { ListIcon } from "@phosphor-icons/react/ssr";
import { type ComponentType, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MenuSheetProps } from "./menu-sheet";

// FR-02.7: below 768 px the header's navigation folds into this button, which opens the menu sheet.
// The sheet's module loads on the first press, and starts loading as soon as a finger or the focus
// lands on the button. Without JavaScript the button does nothing, and the footer links the site's
// pages and the other language.

type MenuButtonProps = Omit<MenuSheetProps, "open" | "onOpenChange" | "trigger"> & {
  /** nav.menu, the button's name */
  label: string;
  className?: string;
};

const loadSheet = () => import("./menu-sheet").then(({ MenuSheet }) => MenuSheet);

export function MenuButton({ label, className, ...sheet }: MenuButtonProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [Sheet, setSheet] = useState<ComponentType<MenuSheetProps> | null>(null);
  const [open, setOpen] = useState(false);

  function prepare() {
    loadSheet()
      .then((component) => setSheet(() => component))
      .catch(() => {
        // Offline: the press loads it again
      });
  }

  function show() {
    loadSheet()
      .then((component) => {
        setSheet(() => component);
        setOpen(true);
      })
      .catch(() => {
        // Offline: the menu stays closed, and the next press loads the sheet again (D-047)
      });
  }

  return (
    <>
      <Button
        ref={trigger}
        variant="quiet"
        size="icon"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={className}
        onPointerDown={prepare}
        onFocus={prepare}
        onClick={show}
      >
        <ListIcon />
      </Button>
      {Sheet ? <Sheet {...sheet} open={open} onOpenChange={setOpen} trigger={trigger} /> : null}
    </>
  );
}
