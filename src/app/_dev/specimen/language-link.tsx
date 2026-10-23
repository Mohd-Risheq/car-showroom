import { type AppLocale, directionOf } from "@/lib/i18n/routing";

type LanguageLinkProps = {
  /** The page's language */
  locale: AppLocale;
  /** The page's path after the locale */
  path: string;
  className?: string;
};

/** A development page's link to itself in the other language, named in that language */
export function LanguageLink({ locale, path, className }: LanguageLinkProps) {
  const other: AppLocale = locale === "ar" ? "en" : "ar";

  return (
    <a href={`/${other}${path}`} lang={other} dir={directionOf(other)} className={className}>
      {other === "ar" ? "العربية" : "English"}
    </a>
  );
}
