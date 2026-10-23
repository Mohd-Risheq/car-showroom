import * as rootParams from "next/root-params";
import { describe, expect, it, vi } from "vitest";
import requestConfig from "@/lib/i18n/request";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";

// next-intl's request config (D-040): for the URL's locale, the locale next-intl formats with,
// Amman's time zone and that language's catalog. The root param and next-intl's wrapper exist only
// inside Next.js, so the test stands in for both.

vi.mock("next/root-params", () => ({ locale: vi.fn() }));
// next-intl calls the function getRequestConfig wraps, and so does the test
vi.mock("next-intl/server", () => ({ getRequestConfig: (create: unknown) => create }));

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
});
