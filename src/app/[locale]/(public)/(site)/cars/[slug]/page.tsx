import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { carTitleIn } from "@/features/car-page/domain/title";
import { carPageFor } from "@/features/car-page/server/car-page";
import { CarNotFoundView } from "@/features/car-page/ui/car-not-found-view";
import { CarPageView } from "@/features/car-page/ui/car-page-view";
import { getInventoryIndex } from "@/features/inventory/server/inventory-index";
import { getDealerId } from "@/features/settings/server/dealer-id";
import { carPath } from "@/features/shell/domain/pages";
import { NotFoundPage } from "@/features/shell/ui/not-found-page";
import { PageEvent } from "@/lib/analytics/page-event";
import { getAppLocale } from "@/lib/i18n/server";
import { siteUrl } from "@/lib/site-url";

// SCR-03's car page at its slug (FR-09.1, FR-09.2): the car, a redirect from an earlier slug, or the
// 404. Every response is static, so each answers with its true status: under ensureStatic, a slug the
// build didn't list waits for its whole page on its first request rather than streaming a 200 ahead
// of it, and the page is then kept with its data's tags. The route reads its slug alone, so its
// layouts and it stay static. A car's page counts its view once it has hydrated (API-03's car_view),
// and the 404 counts none. The page's own address, which Share sends (FR-09.11), is the route's to
// give, as the demo's route gives its own (FR-45.4a).

export const ensureStatic = "navigation";

// The route must list a page: with no cars yet, the build's one is a 404, at a slug no car can have
const NO_CARS = [{ slug: "_" }];

/** Every public car's page is built with the site, and a car published later on its first visit */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const { cards } = await getInventoryIndex(await getDealerId());
  return cards.length === 0 ? NO_CARS : cards.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/cars/[slug]">): Promise<Metadata> {
  const result = await carPageFor((await params).slug);
  // The page redirects
  if (result.kind === "redirect") return {};
  // Next.js takes the 404's title from not-found.tsx
  if (result.kind === "notFound") notFound();
  return {
    title: carTitleIn(result.car, await getAppLocale()),
    // FR-09.1: a sold car's page stays out of search engines for the days it shows
    robots: result.car.status === "sold" ? { index: false } : undefined,
  };
}

export default async function CarPage({ params }: PageProps<"/[locale]/cars/[slug]">) {
  const result = await carPageFor((await params).slug);
  if (result.kind === "redirect") permanentRedirect(carPath(await getAppLocale(), result.slug));
  if (result.kind === "notFound") return <NotFoundPage view={<CarNotFoundView gone={result.gone} />} />;
  const url = siteUrl(carPath(await getAppLocale(), result.car.slug));
  return (
    <>
      <CarPageView car={result.car} url={url} />
      <PageEvent event="car_view" car={result.car.id} />
    </>
  );
}
