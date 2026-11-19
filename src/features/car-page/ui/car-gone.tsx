"use client";

import Link from "next/link";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { buttonClasses } from "@/components/ui/button-classes";
import { NotFoundIntro } from "@/features/shell/ui/not-found-intro";
import type { BodyType } from "@/lib/db/enums";
import type { AppLocale } from "@/lib/i18n/locales";
import { similarCarsPath } from "../domain/similar";

// DESIGN §7.2.11: the 404 of a car the site showed says that the car is no longer listed, and leads
// to similar cars by its body type, which only the page's result knows. The page's view, which the
// server renders, notes the body type as it comes in, and not-found.tsx's view, which takes its place
// once the page runs (D-047), reads it as it renders. So the heading and the link are there from that
// view's first render, the keyboard's place among the view's controls carries across
// (not-found-focus.tsx), and nothing shifts. A 404 reached through a link inside the site renders
// not-found.tsx's view alone, under the site's 404 heading.

/** The body type the page's view noted, and its address */
let noted: { address: string; bodyType: BodyType } | null = null;

const here = () => window.location.pathname + window.location.search;
// A note is made before the view that reads it renders, and never changes under it
const unchanging = () => () => {};
const readNote = () => (noted?.address === here() ? noted.bodyType : null);
const nothingNoted = () => null;

type CarGoneIntroProps = {
  /** A car that was here's body type, or null, from the page's result; left out, from the note */
  bodyType?: BodyType | null;
  locale: AppLocale;
  labels: { notFound: string; notFoundBody: string; carGone: string; findSimilar: string };
};

/** The car's 404's heading, with Find a similar car under it for a car that was here */
export function CarGoneIntro({ bodyType, locale, labels }: CarGoneIntroProps) {
  const read = useSyncExternalStore(unchanging, readNote, nothingNoted);
  const gone = bodyType === undefined ? read : bodyType;

  useLayoutEffect(() => {
    if (bodyType !== undefined && bodyType !== null) noted = { address: here(), bodyType };
  }, [bodyType]);

  if (gone === null) return <NotFoundIntro title={labels.notFound} body={labels.notFoundBody} />;
  return (
    <>
      <NotFoundIntro title={labels.carGone} />
      <Link
        href={similarCarsPath(locale, gone)}
        className={buttonClasses({ variant: "primary", className: "self-start" })}
      >
        {labels.findSimilar}
      </Link>
    </>
  );
}
