// Arabic first (RTL), English second (LTR) (C-03, FR-01.1). Import-free, so next.config.ts reads
// it as well as routing.ts.
export const LOCALES = ["ar", "en"] as const;
export const DEFAULT_LOCALE = "ar";
