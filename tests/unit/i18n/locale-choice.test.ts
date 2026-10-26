import { afterEach, describe, expect, it, vi } from "vitest";
import { storeLocaleChoice } from "@/lib/i18n/locale-choice";
import { LOCALE_COOKIE } from "@/lib/i18n/locale-cookie";

// API-34: the visitor's choice of language, stored from the server for 365 days (FR-01.4, D-041),
// from the site's own pages only (SEC-14), and for exactly ar or en (SEC-13). It logs nothing.

afterEach(() => {
  vi.restoreAllMocks();
});

const SAME_ORIGIN = { "sec-fetch-site": "same-origin", "content-type": "application/json" };

function choice(body: string, headers: Record<string, string> = SAME_ORIGIN, url = "https://muftah.test/api/locale") {
  return storeLocaleChoice(new Request(url, { method: "POST", headers, body }));
}

/** A Set-Cookie header's pair and attributes, the attributes' names in lower case */
function cookieOf(response: Response) {
  const [pair = "", ...attributes] = (response.headers.get("set-cookie") ?? "").split("; ");
  return {
    pair,
    attributes: Object.fromEntries(
      attributes.map((attribute) => {
        const [name = "", value = true] = attribute.split("=");
        return [name.toLowerCase(), value];
      }),
    ),
  };
}

/** A refusal's code, from the Route Handler error envelope (SRS §8.1) */
async function refusal(response: Response) {
  const { error } = (await response.json()) as { error: { code: string; requestId: string } };
  expect(error.requestId).not.toBe("");
  return { status: response.status, code: error.code, cookie: response.headers.get("set-cookie") };
}

describe("storeLocaleChoice", () => {
  it("sets the cookie the page writes, for 365 days, Secure over HTTPS", async () => {
    const response = await choice('{"locale":"en"}');
    expect(response.status).toBe(204);
    const { pair, attributes } = cookieOf(response);
    expect(pair).toBe(`${LOCALE_COOKIE}=en`);
    expect(attributes).toMatchObject({ path: "/", "max-age": "31536000", samesite: "lax", secure: true });
    expect(attributes).not.toHaveProperty("httponly");
  });

  it("leaves Secure off where the site is served over plain HTTP, as locally", async () => {
    const { pair, attributes } = cookieOf(
      await choice('{"locale":"ar"}', SAME_ORIGIN, "http://localhost:3000/api/locale"),
    );
    expect(pair).toBe(`${LOCALE_COOKIE}=ar`);
    expect(attributes).toMatchObject({ path: "/", "max-age": "31536000", samesite: "lax" });
    expect(attributes).not.toHaveProperty("secure");
  });

  it("strips a key beside the locale, as every handler does (SRS §8.1)", async () => {
    const response = await choice('{"locale":"en","x":1}');
    expect(response.status).toBe(204);
    expect(cookieOf(response).pair).toBe(`${LOCALE_COOKIE}=en`);
  });

  it("refuses another site's page, setting nothing (SEC-14)", async () => {
    const response = await choice('{"locale":"en"}', { ...SAME_ORIGIN, "sec-fetch-site": "cross-site" });
    expect(await refusal(response)).toStrictEqual({ status: 403, code: "FORBIDDEN", cookie: null });
  });

  it.each([
    ["another language", '{"locale":"fr"}'],
    ["a browser's tag", '{"locale":"en-US"}'],
    ["no locale", "{}"],
    ["text that isn't JSON", "en"],
    // Valid JSON, padded with whitespace, so only the size refuses it
    ["a body over 64 bytes", `{"locale":"en"${" ".repeat(60)}}`],
  ])("refuses %s, setting nothing", async (_case, body) => {
    expect(await refusal(await choice(body))).toStrictEqual({ status: 400, code: "VALIDATION_ERROR", cookie: null });
  });

  it("refuses a body that isn't sent as JSON", async () => {
    const response = await choice('{"locale":"en"}', { ...SAME_ORIGIN, "content-type": "text/plain" });
    expect(await refusal(response)).toStrictEqual({ status: 400, code: "VALIDATION_ERROR", cookie: null });
  });

  it("logs nothing, not even a refusal (D-041)", async () => {
    const lines = ["debug", "info", "warn", "error"].map((level) =>
      vi.spyOn(console, level as "debug" | "info" | "warn" | "error").mockImplementation(() => {}),
    );
    expect((await choice('{"locale":"en"}', { ...SAME_ORIGIN, "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await choice('{"locale":"fr"}')).status).toBe(400);
    expect((await choice('{"locale":"en"}')).status).toBe(204);
    for (const line of lines) expect(line).not.toHaveBeenCalled();
  });
});
