import * as rootParams from "next/root-params";
import { createTranslator } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import requestConfig from "@/lib/i18n/request";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";

// next-intl's request config (D-040): for the URL's locale, the locale next-intl formats with,
// Amman's time zone and that language's catalog. The root param and next-intl's wrapper exist only
// inside Next.js, so the test stands in for both.

vi.mock("next/root-params", () => ({ locale: vi.fn() }));
// next-intl calls the function getRequestConfig wraps, and so does the test
vi.mock("next-intl/server", () => ({ getRequestConfig: (create: unknown) => create }));

afterEach(() => {
  vi.restoreAllMocks();
});

/** The config for a request under the root param, with the locale a Server Action may pass */
async function configFor(rootParam: string, locale?: string) {
  vi.mocked(rootParams.locale).mockResolvedValue(rootParam);
  const requestLocale = Promise.resolve(undefined);
  return requestConfig(locale === undefined ? { requestLocale } : { locale, requestLocale });
}

describe("the request config", () => {
  it("formats Arabic with BR-02's tag, in Amman's time, with the Arabic catalog", async () => {
    const config = await configFor("ar");
    expect(config).toMatchObject({ locale: "ar-JO-u-nu-latn", timeZone: "Asia/Amman" });
    expect(config.messages).toStrictEqual(ar);
  });

  it("takes a locale passed explicitly over the root param (SRS §11.5 rule 8)", async () => {
    const config = await configFor("ar", "en");
    expect(config).toMatchObject({ locale: "en-GB", timeZone: "Asia/Amman" });
    expect(config.messages).toStrictEqual(en);
  });

  it("answers a locale the site doesn't have with a 404 (FR-01)", async () => {
    await expect(configFor("fr")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("shows a missing message's key in its place, with a warning (FR-01 error states)", async () => {
    const { locale, onError } = await configFor("ar");
    if (!onError) throw new Error("The request config handles no errors");
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});
    // The Arabic catalog with one of its messages missing
    const messages = { ...ar, nav: { ...ar.nav } };
    Reflect.deleteProperty(messages.nav, "search");
    const t = createTranslator({ locale, messages, onError });
    expect(t("nav.search")).toBe("nav.search");
    expect(warned).toHaveBeenCalledOnce();
    expect(warned.mock.calls[0]?.[0]).toContain("nav.search");
    expect(failed).not.toHaveBeenCalled();
  });

  it("logs any other error as an error", async () => {
    const { locale, onError } = await configFor("en");
    if (!onError) throw new Error("The request config handles no errors");
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = createTranslator({ locale, messages: en, onError });
    // The count the message counts, left out
    expect(t("nav.garageLabel")).toBe("nav.garageLabel");
    expect(failed).toHaveBeenCalled();
    expect(warned).not.toHaveBeenCalled();
  });
});
