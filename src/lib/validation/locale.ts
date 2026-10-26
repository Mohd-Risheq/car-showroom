import { LOCALES } from "../i18n/locales.ts";
import { z } from "./zod.ts";

// API-34's body: the language the visitor chose (FR-01.4, SEC-13)
export const localeChoiceSchema = z.object({ locale: z.enum(LOCALES) });
