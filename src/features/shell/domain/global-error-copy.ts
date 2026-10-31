import type { AppLocale } from "@/lib/i18n/locales";

// DESIGN §7.2.11: the global error page loads no catalog, so it carries its two lines in each
// language itself. They are the catalogs' errors.global and common.reload, and
// tests/unit/shell/global-error-copy.test.ts keeps them equal.
export const GLOBAL_ERROR_COPY = {
  ar: { text: "حدث خطأ. يُرجى إعادة تحميل الصفحة.", reload: "إعادة التحميل" },
  en: { text: "Something went wrong. Please reload the page.", reload: "Reload" },
} as const satisfies Record<AppLocale, { text: string; reload: string }>;
