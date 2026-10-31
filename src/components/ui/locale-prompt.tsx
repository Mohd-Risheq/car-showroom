"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { offersEnglish } from "@/lib/i18n/english-prompt";
import { rememberLocale } from "@/lib/i18n/locale-cookie";
import { Button } from "./button";
import { buttonClasses } from "./button-classes";
import { useKeyboardOpen } from "./keyboard";
import { LanguageSwitch } from "./language-switch";

// FR-01.2a and DESIGN §7.1.1: an Arabic page offers its English twin to a browser whose first
// language is English, until the visitor chooses a language. The browser decides after hydration,
// so the prerendered page is the same for everyone and nothing shifts. A small card at the bottom
// start, which never takes focus. It is in English, and its stay button in Arabic, so a screen
// reader reads each in its own voice, and each sets the small step in its own script's metrics. At
// that step the buttons share a row and the card is about 95 px tall, which on its own is within
// DESIGN §8.4's sticky budget, a quarter of the screen's height. On a screen under 480 px tall its
// padding tightens to 8 px, about 87 px: within the quarter on a 360 px phone held sideways, or on
// any screen at least about 350 px tall, but not on a 320 px phone held sideways (D-041). With the
// shell's header it would pass the quarter on a screen under 600 px tall, 640 px from 768 px wide,
// where the header scrolls away with the page while the card shows. Below 1024 px it waits while a
// car page's action bar holds the bottom of the screen, and the page keeps its last lines clear of
// the card by its measured height (globals.css, D-047). While the keyboard is open it steps aside,
// as the action bar does: Android's keyboard shrinks the page, and a small phone's would leave the
// card more than a quarter of what is left (the owner's answer of 2026-10-31, DESIGN §8.4).

type LocalePromptProps = {
  /** locale.prompt.text, which also names the card's region */
  text: string;
  /** locale.prompt.switch */
  switchLabel: string;
  /** locale.prompt.stay */
  stayLabel: string;
};

/**
 * The decision is read again when the page shows from the back-forward cache or comes back into
 * view, as the visitor may have chosen a language in another tab meanwhile
 */
function subscribe(onChange: () => void) {
  window.addEventListener("pageshow", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener("pageshow", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}
const offeredInBrowser = () => offersEnglish(document.cookie, navigator.languages);
// The page's HTML never has the card
const offeredOnServer = () => false;

export function LocalePrompt({ text, switchLabel, stayLabel }: LocalePromptProps) {
  const textId = useId();
  const offered = useSyncExternalStore(subscribe, offeredInBrowser, offeredOnServer);
  // Kept once the visitor stays in Arabic, which stores a choice and so ends the offer at once, so
  // the card can still fade out
  const [dismissed, setDismissed] = useState(false);
  const typing = useKeyboardOpen();
  if (!offered && !dismissed) return null;

  function stay() {
    rememberLocale("ar");
    setDismissed(true);
  }

  return (
    // Placed in the page's direction, so the English card sits at the Arabic page's start. Insets on
    // both sides keep it within the page margins, and its width decides where it sits. Dismissed, it
    // fades out and is then hidden, from screen readers too.
    <div
      ref={measureHeight}
      data-locale-prompt
      data-dismissed={dismissed || undefined}
      hidden={typing}
      className="fixed inset-x-[calc(var(--spacing-page)+max(env(safe-area-inset-left),env(safe-area-inset-right)))] bottom-[calc(var(--spacing-page)+env(safe-area-inset-bottom))] z-40 w-fit max-w-80 transition-[opacity,visibility] duration-(--dur-pop) ease-out starting:opacity-0 data-dismissed:invisible data-dismissed:opacity-0"
    >
      <section
        lang="en"
        dir="ltr"
        aria-labelledby={textId}
        className="flex flex-col gap-2 bg-surface-2 p-3 shadow-overlay type-small surface-edge short:p-2"
      >
        <p id={textId}>{text}</p>
        <div className="flex flex-wrap gap-2">
          <LanguageSwitch locale="en" className={buttonClasses({ variant: "secondary" })}>
            {switchLabel}
          </LanguageSwitch>
          <Button variant="quiet" lang="ar" dir="rtl" className="type-small" onClick={stay}>
            {stayLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

/** Writes the card's height to <html> as --prompt-height while it is mounted: 0 while it is hidden */
function measureHeight(card: HTMLDivElement | null) {
  if (card === null) return;
  const root = document.documentElement;
  const observer = new ResizeObserver(([entry]) => {
    root.style.setProperty("--prompt-height", `${entry?.borderBoxSize[0]?.blockSize ?? 0}px`);
  });
  observer.observe(card);
  return () => {
    observer.disconnect();
    root.style.removeProperty("--prompt-height");
  };
}
