import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { carPageFor } from "@/features/car-page/server/car-page";
import { CarNotFoundView } from "@/features/car-page/ui/car-not-found-view";
import { notFoundMetadata } from "@/features/shell/ui/not-found-page";

// The car page's 404 (FR-09.1, DESIGN §7.2.11), which the browser renders in place of the page's own
// view once it hydrates (D-047), from what that view noted, and whose title Next.js reads. Next.js
// 16.4 passes its metadata the segment's params, which its docs don't say, so
// tests/e2e/car-page.spec.ts pins both titles: a car the site showed is no longer listed, and any
// other slug has the site's 404 title.

type CarNotFoundProps = { params?: Promise<{ slug?: string }> };

export async function generateMetadata({ params }: CarNotFoundProps): Promise<Metadata> {
  const slug = (await params)?.slug;
  const result = slug === undefined ? null : await carPageFor(slug);
  if (result?.kind !== "notFound" || result.gone === null) return notFoundMetadata();
  const errors = await getTranslations("errors");
  return { title: errors("carGone") };
}

export default function CarNotFound() {
  return <CarNotFoundView />;
}
