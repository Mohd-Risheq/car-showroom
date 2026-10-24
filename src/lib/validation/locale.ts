import { z } from "zod";
import { LOCALES } from "@/lib/i18n/locales";

// API-34's body: the language the visitor chose (FR-01.4, SEC-13)
export const localeChoiceSchema = z.object({ locale: z.enum(LOCALES) });
