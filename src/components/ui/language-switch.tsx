"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { rememberLocale } from "@/lib/i18n/locale-cookie";
import { pathInLocale } from "@/lib/i18n/locale-path";
import { type AppLocale, directionOf } from "@/lib/i18n/locales";

// FR-01.4: the same page in another language, with its query, and the choice kept for 365 days
// (BR-01). A plain link, so the other language loads as a new document under its own root layout,
// and nothing of this page carries over (D-038). Its text is in the language it opens, "English" or
// "العربية" (DESIGN §7.1.1), and the link says so.
//
// What a prerendered page knows when it is built decides what its HTML links to. A page under a
// param that generateStaticParams doesn't list, such as a car's slug, doesn't know its path, so it
// links to the other language's home. Any other page knows its path but not its query. The link
// gains what was missing once the page runs in the browser. Each boundary's fallback reads no more
// of the URL than its page knows, or the page couldn't be prerendered.

type LanguageSwitchProps = {
  /** The language the link opens */
  locale: AppLocale;
  /** The link's text, in that language */
  children: ReactNode;
  className?: string;
};

export function LanguageSwitch(props: LanguageSwitchProps) {
  return (
    <Suspense fallback={<SwitchLink {...props} href={`/${props.locale}`} />}>
      <SwitchLinkWithPath {...props} />
    </Suspense>
  );
}

/** The link to this page, and its query once the page runs in the browser */
function SwitchLinkWithPath(props: LanguageSwitchProps) {
  const pathname = usePathname();
  return (
    <Suspense fallback={<SwitchLink {...props} href={pathInLocale(pathname, "", props.locale)} />}>
      <SwitchLinkWithQuery {...props} pathname={pathname} />
    </Suspense>
  );
}

function SwitchLinkWithQuery({ pathname, ...props }: LanguageSwitchProps & { pathname: string }) {
  const query = useSearchParams().toString();
  return <SwitchLink {...props} href={pathInLocale(pathname, query, props.locale)} />;
}

function SwitchLink({ locale, children, className, href }: LanguageSwitchProps & { href: string }) {
  return (
    <a
      href={href}
      hrefLang={locale}
      lang={locale}
      dir={directionOf(locale)}
      className={className}
      onClick={() => rememberLocale(locale)}
    >
      {children}
    </a>
  );
}
