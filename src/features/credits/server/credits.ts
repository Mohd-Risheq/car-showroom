import "server-only";
import type { AppLocale } from "@/lib/i18n/locales";
import project from "../../../../package.json";
import manifest from "../../../../public/seed/credits.json";
import cars from "../../../../seed/cars.json";
import reference from "../../../../seed/reference.json";
import { type Credits, type CreditsData, creditsTables, readCredits } from "../domain/credits";
import { creditedPins } from "../domain/software";
import software from "../software.json";

// The Credits page's data (DESIGN §7.2.9), read from the files the app is built with. A problem with
// them throws as the page's module loads, so next build stops rather than ship a page that credits
// less than the site holds (D-048). The versions are package.json's pins: the deployment holds no
// installed package's own package.json to read.

function read(): Credits {
  const result = readCredits({ credits: manifest, cars, reference, software, dependencies: creditedPins(project) });
  if (!result.ok) throw new Error(`The Credits page can't be built:\n${result.problems.join("\n")}`);
  return result.credits;
}

const CREDITS = read();

/** The page's tables in a language */
export function creditsTablesIn(locale: AppLocale): CreditsData {
  return creditsTables(CREDITS, locale);
}
