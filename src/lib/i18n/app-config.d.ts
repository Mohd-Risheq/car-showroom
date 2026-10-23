import type en from "../../../messages/en.json";

// next-intl's types: a message key outside the catalogs fails the type check. Its Locale stays a
// string, since next-intl holds the formatting locale (D-040) and the URL's locale is AppLocale.
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof en;
  }
}
