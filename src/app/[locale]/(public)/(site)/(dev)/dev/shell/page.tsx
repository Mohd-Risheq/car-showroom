import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { pagePath } from "@/features/shell/domain/pages";
import { ActionBar } from "@/features/shell/ui/action-bar";
import { Wordmark } from "@/features/shell/ui/wordmark";
import { notFoundOnDeployments } from "@/lib/deployment";
import { getAppLocale } from "@/lib/i18n/server";
import { ReplaceQueryButton } from "./replace-query-button";
import { ToastButton } from "./toast-button";

// T-19: the public shell on a page long enough to scroll, for tests/e2e/shell.spec.ts. The header
// compacts and keeps clear of the focus, the action bar holds the bottom below 1024 px and steps aside
// for the keyboard, which the text fields open and the checkbox doesn't, the last line and the toasts
// stay clear of it, and the English offer waits while it shows. The links to /dev/shell/plain try a
// navigation's focus move and scroll (FR-02.4, FR-02.5), the query button a router write over the
// page's entry (FR-02.5), and the section links an in-page jump (FR-02.6). Wordmarks of each length
// step show their sizes.

export const metadata: Metadata = { title: "Muftah dev: shell" };

const SECTIONS = Array.from({ length: 12 }, (_, index) => index + 1);

/** Names of each wordmark step, in both scripts, with the logo's place last */
const NAMES = [
  "Muftah Motors",
  "مفتاح للسيارات",
  "Amman Premium Motors Co.",
  "معرض الشرق الحديث للسيار",
  "Jordan Elite Certified Pre-Owned Vehicles Trading Company LL",
  "شركة النخبة الأردنية لتجارة السيارات المستعملة والجديدة ذ.م.م.",
];
const SAMPLE_LOGO = { src: "/icon.svg", width: 32, height: 32 };

export default async function ShellDevPage() {
  notFoundOnDeployments();
  const locale = await getAppLocale();
  const plain = `/${locale}/dev/shell/plain` as const;

  return (
    <div className="mx-auto flex max-w-content flex-col gap-10 px-band py-12">
      <div className="flex flex-col gap-3">
        <h1 className="type-head">Shell lab</h1>
        <p className="max-w-measure text-muted">
          The public shell on a long page, with a car page&apos;s action bar below 1024 px.
        </p>
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          <li>
            <Link href={plain} className="text-accent underline underline-offset-4">
              A plain page
            </Link>
          </li>
          <li>
            <Link href={`/${locale}/dev/shell#section-9`} className="text-accent underline underline-offset-4">
              Jump to section 9
            </Link>
          </li>
          <li>
            <Link href={pagePath(locale, "cars")} className="text-accent underline underline-offset-4">
              An unbuilt page
            </Link>
          </li>
        </ul>
      </div>
      <div className="flex max-w-measure flex-col gap-4">
        <Field label="A text field">
          <Input name="text" />
        </Field>
        <Field label="A second text field">
          <Input name="second" />
        </Field>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="choice" className="size-5" />A checkbox
        </label>
        <div className="flex flex-wrap gap-4">
          <ToastButton />
          <ReplaceQueryButton locale={locale} />
        </div>
      </div>
      {SECTIONS.map((section) => (
        <section key={section} id={`section-${section}`} className="flex max-w-measure flex-col gap-2">
          <h2 className="type-lead">Section {section}</h2>
          <p className="text-muted">
            Section {section} of {SECTIONS.length}, text to scroll past. The header compacts once the page has moved,
            and a step back returns to this place.
          </p>
        </section>
      ))}
      <section className="flex flex-col gap-4">
        <h2 className="type-lead">Wordmarks</h2>
        <ul className="flex flex-col gap-2">
          {NAMES.map((name) => (
            <li key={name}>
              <Wordmark href={pagePath(locale, "home")} name={name} logo={null} />
            </li>
          ))}
          <li>
            <Wordmark href={pagePath(locale, "home")} name="Muftah Motors" logo={SAMPLE_LOGO} />
          </li>
        </ul>
      </section>
      <p id="last-line">The last line, which stays clear of the action bar.</p>
      <ActionBar
        price={<span className="figures">14,500 JOD</span>}
        actions={
          <>
            <Button variant="secondary">Call</Button>
            <Button variant="primary">Push to Start</Button>
          </>
        }
      />
    </div>
  );
}
