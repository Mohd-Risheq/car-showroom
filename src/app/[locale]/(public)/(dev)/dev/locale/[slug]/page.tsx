import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { notFoundOnDeployments } from "@/lib/deployment";
import { otherLocale } from "@/lib/i18n/locales";
import { getAppLocale } from "@/lib/i18n/server";

// T-15: the language switch on a page under a param that generateStaticParams doesn't list, as a car's
// slug will be (FR-01.4). The build prerenders a shell for it in which the path is unknown, so
// `pnpm build` fails here if the switch reads the path where its shell can't.
// tests/e2e/locale.spec.ts checks where the link goes.

export const metadata: Metadata = { title: "Muftah dev: the language switch under an unknown param" };

export default async function UnknownParamDevPage() {
  notFoundOnDeployments();
  const [locale, t] = await Promise.all([getAppLocale(), getTranslations("nav")]);

  return (
    <main lang="en" dir="ltr" className="mx-auto grid max-w-content gap-6 px-page py-12 font-mono text-sm text-muted">
      <h1 className="text-ink">Muftah dev: the language switch under an unknown param (T-15)</h1>
      <LanguageSwitch locale={otherLocale(locale)} className="text-accent underline underline-offset-4">
        {t("language")}
      </LanguageSwitch>
    </main>
  );
}
