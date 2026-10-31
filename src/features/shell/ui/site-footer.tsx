import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitch } from "@/components/ui/language-switch";
import type { PublicSettingsDTO } from "@/lib/db/public-dto";
import { formatPhone } from "@/lib/format/phone";
import { textIn } from "@/lib/i18n/bilingual";
import { type AppLocale, directionOf, otherLocale } from "@/lib/i18n/locales";
import { footerContacts } from "../domain/footer-contacts";
import { pagePath } from "../domain/pages";
import { currentYear } from "../server/year";

// FR-02 and DESIGN §7.1.1: the public footer, on --surface-1. Three columns from 768 px, stacked on
// a phone: Visit, with the address (T-23 adds the hours and whether the showroom is open now);
// Contact, with WhatsApp, the phone and the social links; and the site's own pages. The bottom row
// has the copyright, the demo notice in demo mode, the language switch and the credit to the site's
// author. The footer ends clear of whatever holds the bottom of the screen (globals.css's
// --page-end). Without JavaScript it is how a phone reaches the site's pages and the other language,
// as the header's switch is in the menu there (D-047); the menu's way to the dealer side in demo
// mode needs JavaScript. In demo mode no contact leaves the site (BR-14, footer-contacts.ts).

/** The author's site, which the credit links to */
const AUTHOR_SITE = "https://mrisheq.com";

type SiteFooterProps = { locale: AppLocale; settings: PublicSettingsDTO; demo: boolean };

// Each column's heading and first line take a 44 px row, as its links do, so the columns line up
const HEADING = "mb-2 flex min-h-11 items-center type-small text-meta";
const LINK = "inline-flex min-h-11 items-center text-muted hover:text-ink";

export async function SiteFooter({ locale, settings, demo }: SiteFooterProps) {
  const footer = await getTranslations("footer");
  const nav = await getTranslations("nav");
  const contact = await getTranslations("contact");
  const demoText = await getTranslations("demo");
  const year = await currentYear();
  const address = textIn(settings.address, locale);
  const social = (["instagram", "facebook", "tiktok"] as const).flatMap((network) => {
    const href = settings.social[network];
    return href === undefined ? [] : [{ network, href }];
  });

  return (
    <footer className="bg-surface-1 px-band pt-16 pb-[calc(var(--spacing-page)+var(--page-end))]">
      <div className="mx-auto grid max-w-content gap-10 md:grid-cols-3 md:gap-gutter">
        <div>
          <h2 className={HEADING}>
            <Link href={pagePath(locale, "visit")} className={LINK}>
              {nav("visit")}
            </Link>
          </h2>
          {address === null ? null : (
            <p lang={address.lang} dir={directionOf(address.lang)} className="flex min-h-11 max-w-measure items-center">
              {address.text}
            </p>
          )}
        </div>
        <div>
          <h2 className={HEADING}>{footer("contact")}</h2>
          <ul>
            {footerContacts(settings, demo).map((entry) =>
              entry.kind === "demo" ? (
                <li key={entry.kind} className="flex min-h-11 flex-wrap items-center gap-2">
                  <span dir="ltr">{entry.number}</span>
                  <span className="rounded-full bg-surface-3 px-2 type-small">{demoText("tag")}</span>
                </li>
              ) : (
                <li key={entry.kind}>
                  <a href={entry.href} className={LINK}>
                    {entry.kind === "whatsapp" ? contact("cta") : <span dir="ltr">{formatPhone(entry.e164)}</span>}
                  </a>
                </li>
              ),
            )}
            {social.map(({ network, href }) => (
              <li key={network}>
                <a href={href} className={LINK}>
                  {contact(`social.${network}`)}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={HEADING}>{footer("site")}</h2>
          <ul>
            {(
              [
                ["cars", nav("cars")],
                ["compare", nav("compare")],
                ["garage", nav("garage")],
                ["howBuilt", footer("howBuilt")],
                ["privacy", footer("privacy")],
                ["credits", footer("credits")],
              ] as const
            ).map(([page, label]) => (
              <li key={page}>
                <Link href={pagePath(locale, page)} className={LINK}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-content flex-col gap-2 type-small text-muted md:flex-row md:flex-wrap md:items-center md:gap-x-8">
        <p>{footer("copyright", { year, dealer: settings.brandName[locale] })}</p>
        {demo ? <p>{demoText("banner")}</p> : null}
        <p className="md:ms-auto">
          <LanguageSwitch locale={otherLocale(locale)} className={LINK}>
            {nav("language")}
          </LanguageSwitch>
        </p>
        <p>
          <a href={AUTHOR_SITE} className={LINK}>
            {footer("builtBy", { author: footer("author") })}
            <ArrowUpRightIcon aria-hidden="true" className="ms-1 size-icon rtl:-scale-x-100" />
          </a>
        </p>
      </div>
    </footer>
  );
}
