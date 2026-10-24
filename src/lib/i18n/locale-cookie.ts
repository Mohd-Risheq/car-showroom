import { type AppLocale, isAppLocale } from "./locales";

// The visitor's choice of language (BR-01). Only the language switch and the English prompt store it
// (FR-01.4, FR-01.2a). A visit never does, so a first visit from a browser that prefers English still
// gets the prompt. proxy.ts reads it for the root redirect and the prompt reads it in the browser, so
// it isn't HttpOnly.
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** FR-01.4: a choice lasts 365 days */
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** API-34, where the server stores the choice too */
export const LOCALE_CHOICE_PATH = "/api/locale";

/** The locale a stored value names: exactly ar or en, never a browser's tag such as en-US */
export function chosenLocale(value: string | undefined): AppLocale | undefined {
  return isAppLocale(value) ? value : undefined;
}

/** The choice stored among a page's cookies, as document.cookie lists them */
export function localeIn(cookies: string): AppLocale | undefined {
  const pair = cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  return chosenLocale(pair?.slice(LOCALE_COOKIE.length + 1));
}

/**
 * Stores the visitor's choice for the whole site, in the browser at once and then from the server.
 * SameSite=Lax sends it with a link from another site too, so the root redirect follows the choice,
 * and Secure keeps it to HTTPS where the page is served over HTTPS.
 */
export function rememberLocale(locale: AppLocale): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  // Safari keeps a cookie a page writes for 7 days, and one the server sets for its whole Max-Age
  // (D-041). keepalive lets the request finish while the switch opens the other language. Should it
  // fail, the cookie written above stands.
  fetch(LOCALE_CHOICE_PATH, {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ locale }),
  }).catch(() => undefined);
}
