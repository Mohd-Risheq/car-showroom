import type { MDXContent } from "mdx/types";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Arabic from "@/content/privacy/ar.mdx";
import English from "@/content/privacy/en.mdx";
import type { AppLocale } from "@/lib/i18n/locales";
import { getAppLocale } from "@/lib/i18n/server";

// SCR-14's privacy page (FR-47.5, NFR-PRIV-04, DESIGN §7.2.9): what the site counts and what it
// keeps, in a reading column. The words are each language's MDX (src/content/privacy), headed by the
// footer's name for the page. A later task that keeps something new adds its row to both (D-048).

const CONTENT = { ar: Arabic, en: English } satisfies Record<AppLocale, MDXContent>;

export async function generateMetadata(): Promise<Metadata> {
  const footer = await getTranslations("footer");
  const meta = await getTranslations("meta.privacy");
  return { title: footer("privacy"), description: meta("description") };
}

export default async function PrivacyPage() {
  const Content = CONTENT[await getAppLocale()];
  const footer = await getTranslations("footer");
  return (
    <div className="mx-auto max-w-content px-band py-12 md:py-20">
      <article className="max-w-measure">
        <h1 className="type-head">{footer("privacy")}</h1>
        <Content />
      </article>
    </div>
  );
}
