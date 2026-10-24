import "server-only";
import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import { errorResponse } from "@/lib/errors/envelope";
import { readCapped } from "@/lib/storage/stream";
import { localeChoiceSchema } from "@/lib/validation/locale";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "./locale-cookie";

// API-34 (SRS §8.2): the visitor's choice of language, stored from the server. The page stores it
// as well, at once, but Safari keeps a cookie a page writes for 7 days, and one the server sets for
// its whole Max-Age (D-041). It stores nothing else and logs nothing.

/** {"locale":"en"}, with room to spare */
const MAX_BODY_BYTES = 64;

export async function storeLocaleChoice(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return errorResponse(request, "FORBIDDEN"); // SEC-14
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return errorResponse(request, "VALIDATION_ERROR");
  }
  const raw = await readCapped(request.body, MAX_BODY_BYTES);
  if (raw === "too_large") return errorResponse(request, "VALIDATION_ERROR");
  const body = localeChoiceSchema.safeParse(parseJson(new TextDecoder().decode(raw)));
  if (!body.success) return errorResponse(request, "VALIDATION_ERROR");

  // The same cookie the page writes (locale-cookie.ts), Secure where the site is served over HTTPS
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set({
    name: LOCALE_COOKIE,
    value: body.data.locale,
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    httpOnly: false,
  });
  return response;
}

/** The JSON a body holds, or undefined for one that isn't JSON, which the schema then refuses */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
