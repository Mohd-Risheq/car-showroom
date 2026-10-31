"use client";

import { usePathname } from "next/navigation";
import { type RefObject, useEffect, useRef } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { buttonClasses } from "@/components/ui/button-classes";
import { LanguageSwitch } from "@/components/ui/language-switch";
import type { AppLocale } from "@/lib/i18n/locales";
import type { SitePath } from "../domain/pages";
import { NavLink } from "./nav-link";

// FR-02.7 and DESIGN §7.1.1: the phone's menu, a sheet that traps the focus, holding the navigation,
// the language switch and, in demo mode, the way to the dealer side. Base UI's Dialog closes it on
// Escape and on a tap outside; it also closes when a page opens, from one of its links or from the
// browser's back and forward buttons. The menu button's own module loads this one on first use, so a
// page that never opens the menu doesn't load the sheet.

export type MenuLink = { href: SitePath; label: string };

export type MenuSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The menu button, which takes the focus back when the sheet closes on the same page */
  trigger: RefObject<HTMLButtonElement | null>;
  /** nav.menu */
  title: string;
  /** common.close */
  closeLabel: string;
  links: readonly MenuLink[];
  /** The other language, which the switch opens, and its name in that language (nav.language) */
  language: { locale: AppLocale; label: string };
};

export function MenuSheet({ open, onOpenChange, trigger, title, closeLabel, links, language }: MenuSheetProps) {
  const pathname = usePathname();
  // Whether the menu button takes the focus back when the sheet closes. Not after another page opens,
  // whose heading takes it (FR-02.4), as Safari would otherwise leave it on the page's body.
  const returnFocus = useRef(true);
  const shownPath = useRef(pathname);

  useEffect(() => {
    if (open) returnFocus.current = true;
  }, [open]);

  useEffect(() => {
    if (pathname === shownPath.current) return;
    shownPath.current = pathname;
    returnFocus.current = false;
    onOpenChange(false);
  }, [pathname, onOpenChange]);

  function onNavigate(href: SitePath) {
    // A link to this same page reloads nothing, so the focus goes back to the button
    returnFocus.current = href === pathname;
    onOpenChange(false);
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      closeLabel={closeLabel}
      finalFocus={() => (returnFocus.current ? trigger.current : false)}
    >
      <ul className="flex flex-col pb-4">
        {links.map(({ href, label }) => (
          <li key={href}>
            <NavLink
              href={href}
              onNavigate={() => onNavigate(href)}
              className="flex min-h-12 items-center type-lead text-muted hover:text-ink aria-[current=page]:text-ink"
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
      <LanguageSwitch locale={language.locale} className={buttonClasses({ variant: "secondary" })}>
        {language.label}
      </LanguageSwitch>
    </BottomSheet>
  );
}
