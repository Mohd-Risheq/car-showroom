import type { Metadata } from "next";
import Link from "next/link";
import { notFoundOnDeployments } from "@/lib/deployment";
import { getAppLocale } from "@/lib/i18n/server";

// T-19: a short page in the shell, with no action bar, where tests/e2e/shell.spec.ts arrives by a
// navigation from /dev/shell and steps back to it (FR-02.4, FR-02.5), and opens a page that fails
// (SRS §13.3)

export const metadata: Metadata = { title: "Muftah dev: plain" };

export default async function PlainDevPage() {
  notFoundOnDeployments();
  const locale = await getAppLocale();

  return (
    <div className="mx-auto flex max-w-content flex-col gap-4 px-band py-12">
      <h1 className="type-head">Plain page</h1>
      <p>
        <Link href={`/${locale}/dev/shell`} className="text-accent underline underline-offset-4">
          The shell lab
        </Link>
      </p>
      <p>
        <Link href={`/${locale}/dev/shell/failing`} className="text-accent underline underline-offset-4">
          A page that fails
        </Link>
      </p>
    </div>
  );
}
