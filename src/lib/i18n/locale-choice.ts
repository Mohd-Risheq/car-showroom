import "server-only";
import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth/same-origin";
import { AppError } from "@/lib/errors/app-error";
import { withErrorEnvelope } from "@/lib/errors/envelope";
import { readJsonBody } from "@/lib/http/body";
import { localeChoiceSchema } from "@/lib/validation/locale";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "./locale-cookie";

// API-34 (SRS §8.2): the visitor's choice of language, stored from the server. The page stores it
// as well, at once, but Safari keeps a cookie a page writes for 7 days, and one the server sets for
// its whole Max-Age (D-041). It stores nothing else and logs nothing, a refusal included.

/** {"locale":"en"}, with room to spare */
const MAX_BODY_BYTES = 64;

export const storeLocaleChoice = withErrorEnvelope(
  "/api/locale",
  async (request) => {
    if (!isSameOriginRequest(request)) throw new AppError("FORBIDDEN", "not same-origin"); // SEC-14
    const body = localeChoiceSchema.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
    if (!body.success) throw new AppError("VALIDATION_ERROR", "locale choice");

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
  },
  { logClientRefusals: false },
);
