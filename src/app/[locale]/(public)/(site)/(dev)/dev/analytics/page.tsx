import type { Metadata } from "next";
import Link from "next/link";
import { notFoundOnDeployments } from "@/lib/deployment";
import { getAppLocale } from "@/lib/i18n/server";
import { AnalyticsLab } from "./lab";

// T-20: two pages in the shell that stand in for two cars' pages, for tests/e2e/analytics.spec.ts:
// each sends its car's view, and its buttons the spin and a WhatsApp tap, so a page view's events
// are tried across navigations both ways (FR-47.6), and one throws, as an error nothing catches does
// (NFR-OBS-02). Their cars are on no list of the site's, so API-03 counts none of their events.

export const metadata: Metadata = { title: "Muftah dev: analytics" };

export default async function AnalyticsDevPage() {
  notFoundOnDeployments();
  const locale = await getAppLocale();
  return (
    <div className="mx-auto flex max-w-content flex-col gap-4 px-band py-12">
      <h1 className="type-head">Analytics lab</h1>
      <AnalyticsLab car="01923456-7890-7abc-8def-0000000000a1" />
      <p>
        <Link href={`/${locale}/dev/analytics/second`} className="text-accent underline underline-offset-4">
          The second car
        </Link>
      </p>
    </div>
  );
}
