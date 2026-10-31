"use client";

import { KeyIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { buttonClasses } from "@/components/ui/button-classes";
import type { SitePath } from "@/features/shell/domain/pages";
import { cn } from "@/lib/class-names";
import { GARAGE_CHANGE_EVENT, GARAGE_STORAGE_KEY, storedCount } from "../domain/stored-count";

// DESIGN §7.1.1: the Garage key in the header, a link to My Garage with the count of cars kept. The
// count is read in the browser after hydration, so the prerendered header is the same for everyone.
// When storage can't be read, as in some private windows, the key shows no count (FR-02).

type GarageKeyProps = {
  href: SitePath;
  /** nav.garageLabel for 0 to 30 cars, by count, formatted on the server */
  labels: readonly string[];
  /** nav.garage, while the count is unknown */
  label: string;
  className?: string;
};

/** Read again when another tab changes the garage, or this tab's store does (T-65) */
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(GARAGE_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(GARAGE_CHANGE_EVENT, onChange);
  };
}

function countInBrowser(): number | null {
  try {
    return storedCount(localStorage.getItem(GARAGE_STORAGE_KEY));
  } catch {
    // Storage blocked
    return null;
  }
}

// The page's HTML has no count
const countOnServer = () => null;

export function GarageKey({ href, labels, label, className }: GarageKeyProps) {
  const count = useSyncExternalStore(subscribe, countInBrowser, countOnServer);
  return (
    <Link
      href={href}
      aria-label={count === null ? label : (labels[count] ?? label)}
      className={cn(buttonClasses({ variant: "quiet", size: "icon" }), "relative", className)}
    >
      <KeyIcon aria-hidden="true" className="size-icon" />
      {count ? (
        <span
          aria-hidden="true"
          className="absolute end-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-on-accent type-small figures"
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
