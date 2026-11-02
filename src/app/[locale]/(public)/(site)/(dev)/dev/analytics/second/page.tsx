import type { Metadata } from "next";
import Link from "next/link";
import { notFoundOnDeployments } from "@/lib/deployment";
import { getAppLocale } from "@/lib/i18n/server";
import { AnalyticsLab } from "../lab";

// T-20: the analytics lab's second car (../page.tsx)

export const metadata: Metadata = { title: "Muftah dev: analytics, second car" };

export default async function AnalyticsSecondDevPage() {
  notFoundOnDeployments();
  const locale = await getAppLocale();
  return (
    <div className="mx-auto flex max-w-content flex-col gap-4 px-band py-12">
      <h1 className="type-head">Analytics lab, second car</h1>
      <AnalyticsLab car="01923456-7890-7abc-8def-0000000000a2" />
      <p>
        <Link href={`/${locale}/dev/analytics`} className="text-accent underline underline-offset-4">
          The first car
        </Link>
      </p>
    </div>
  );
}
