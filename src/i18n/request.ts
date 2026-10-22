import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  // An explicit locale wins: Server Actions and Route Handlers can't read root params (SRS §11.5 rule 8)
  const requested = locale ?? (await rootParams.locale());

  // An unknown locale prefix such as /fr is a 404 (FR-01 edge cases)
  if (!hasLocale(routing.locales, requested)) notFound();

  return { locale: requested };
});
