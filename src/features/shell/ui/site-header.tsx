import { MagnifyingGlassIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonClasses } from "@/components/ui/button-classes";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { GARAGE_MAX } from "@/features/garage/domain/stored-count";
import { GarageKey } from "@/features/garage/ui/garage-key";
import { cn } from "@/lib/class-names";
import type { Names, PublicFile } from "@/lib/db/public-dto";
import { type AppLocale, otherLocale } from "@/lib/i18n/locales";
import { pagePath } from "../domain/pages";
import { HeaderBand } from "./header-band";
import { MenuButton } from "./menu-button";
import { NavLink } from "./nav-link";
import { Wordmark } from "./wordmark";

// FR-02 and DESIGN §7.1.1: the public header. From 768 px: the wordmark, the navigation to Cars,
// Compare and Visit, then the search, the Garage key and the language switch at the end. On a phone:
// the wordmark, then the search, the Garage key and the menu button, whose sheet holds the rest. The
// search opens the cars page until the command palette (T-58) has its shortcut.

type SiteHeaderProps = { locale: AppLocale; brandName: Names; logo: PublicFile | null; demo: boolean };

export async function SiteHeader({ locale, brandName, logo, demo }: SiteHeaderProps) {
  const nav = await getTranslations("nav");
  const common = await getTranslations("common");
  const language = { locale: otherLocale(locale), label: nav("language") };
  const links = [
    { href: pagePath(locale, "cars"), label: nav("cars") },
    { href: pagePath(locale, "compare"), label: nav("compare") },
    { href: pagePath(locale, "visit"), label: nav("visit") },
  ];
  const menuLinks = demo ? [...links, { href: pagePath(locale, "demo"), label: nav("tryDealer") }] : links;
  // Each count's name, formatted here, so the browser needs no message formatting for the key
  const garageLabels = Array.from({ length: GARAGE_MAX + 1 }, (_, count) => nav("garageLabel", { count }));

  return (
    <HeaderBand>
      <div className="flex h-(--header-height) items-center gap-3 px-band transition-transform duration-(--dur-pop) ease-out md:motion-safe:in-data-compact:translate-y-(--header-compact-row)">
        <Wordmark href={pagePath(locale, "home")} name={brandName[locale]} logo={logo} />
        <nav aria-label={nav("label")} className="ms-auto flex items-center gap-1 md:ms-4 md:flex-1">
          <ul className="hidden md:flex md:items-center">
            {links.map(({ href, label }) => (
              <li key={href}>
                <NavLink
                  href={href}
                  className="inline-flex h-11 items-center px-3 text-muted hover:text-ink aria-[current=page]:text-ink"
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="ms-auto flex items-center gap-1">
            <Link
              href={pagePath(locale, "cars")}
              className={cn(
                buttonClasses({ variant: "quiet", size: "icon" }),
                "md:w-auto md:border md:border-line md:px-4",
              )}
            >
              <MagnifyingGlassIcon aria-hidden="true" className="size-icon" />
              <span className="sr-only md:not-sr-only">{nav("search")}</span>
            </Link>
            <GarageKey href={pagePath(locale, "garage")} labels={garageLabels} label={nav("garage")} />
            <LanguageSwitch
              locale={language.locale}
              className={cn(buttonClasses({ variant: "quiet" }), "hidden md:inline-flex")}
            >
              {language.label}
            </LanguageSwitch>
            <MenuButton
              label={nav("menu")}
              title={nav("menu")}
              closeLabel={common("close")}
              links={menuLinks}
              language={language}
              className="md:hidden"
            />
          </div>
        </nav>
      </div>
    </HeaderBand>
  );
}
