import { describe, expect, it, vi } from "vitest";
import { chosenLocale, LOCALE_CHOICE_PATH, LOCALE_COOKIE, localeIn, rememberLocale } from "@/lib/i18n/locale-cookie";

// The visitor's choice of language (BR-01, FR-01.4): read by the root redirect and the English
// prompt, stored only by the language switch and the prompt

describe("chosenLocale", () => {
  it("takes exactly one of the site's locales", () => {
    expect(chosenLocale("ar")).toBe("ar");
    expect(chosenLocale("en")).toBe("en");
  });

  it("takes nothing else, a browser's language tag included", () => {
    for (const value of [undefined, "", "fr", "EN", " en", "en-US", "ar-JO"]) {
      expect(chosenLocale(value), String(value)).toBeUndefined();
    }
  });
});

describe("localeIn", () => {
  it("finds the choice among a page's cookies, as document.cookie lists them", () => {
    expect(localeIn(`theme=dark; ${LOCALE_COOKIE}=en; demo=1`)).toBe("en");
    expect(localeIn(`${LOCALE_COOKIE}=ar`)).toBe("ar");
  });

  it("finds none without the cookie, under a longer name or with a value that isn't a locale", () => {
    for (const cookies of ["", "theme=dark", `X${LOCALE_COOKIE}=en; ${LOCALE_COOKIE}X=en`, `${LOCALE_COOKIE}=fr`]) {
      expect(localeIn(cookies), cookies).toBeUndefined();
    }
  });
});

describe("rememberLocale", () => {
  /**
   * The cookie a page stores at this origin, and the requests it sends, which the server answers. A
   * plain function stands in for fetch: vi.fn would watch the promise it returns, and so handle a
   * failure that rememberLocale leaves unhandled.
   */
  function stored(
    origin: string,
    locale: "ar" | "en",
    answer = () => Promise.resolve(new Response(null, { status: 204 })),
  ) {
    const page = { cookie: "" };
    const requests: Parameters<typeof fetch>[] = [];
    vi.stubGlobal("document", page);
    vi.stubGlobal("location", new URL(origin));
    vi.stubGlobal("fetch", (...request: Parameters<typeof fetch>) => {
      requests.push(request);
      return answer();
    });
    rememberLocale(locale);
    return { cookie: page.cookie, requests };
  }

  it("keeps the choice for the whole site for 365 days (FR-01.4), Secure where the page is HTTPS", () => {
    expect(stored("https://muftah.test/ar/cars", "en").cookie).toBe(
      `${LOCALE_COOKIE}=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );
    expect(stored("http://localhost:3000/en", "ar").cookie).toBe(
      `${LOCALE_COOKIE}=ar; Path=/; Max-Age=31536000; SameSite=Lax`,
    );
  });

  it("has the server store it too, in a request that outlives the page (API-34)", () => {
    const { requests } = stored("https://muftah.test/ar/cars", "en");
    expect(requests).toStrictEqual([
      [
        LOCALE_CHOICE_PATH,
        { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: '{"locale":"en"}' },
      ],
    ]);
  });

  it("keeps the page's cookie when that request fails, and handles the failure", async () => {
    const { cookie, requests } = stored("https://muftah.test/ar", "ar", () => Promise.reject(new TypeError("offline")));
    expect(cookie).toContain(`${LOCALE_COOKIE}=ar`);
    expect(requests).toHaveLength(1);
    // Left unhandled, the failure would be reported once this turn ends, and fail the run
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
