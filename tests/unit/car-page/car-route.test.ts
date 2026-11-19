import { createTranslator } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Children, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateMetadata as notFoundMetadata } from "@/app/[locale]/(public)/(site)/cars/[slug]/not-found";
import CarPage, { generateMetadata, generateStaticParams } from "@/app/[locale]/(public)/(site)/cars/[slug]/page";
import { carPageFor } from "@/features/car-page/server/car-page";
import { CarPageView } from "@/features/car-page/ui/car-page-view";
import { isCarSlug } from "@/features/dealer/domain/slug";
import { getInventoryIndex } from "@/features/inventory/server/inventory-index";
import { getDealerId } from "@/features/settings/server/dealer-id";
import type { CarPageResult, PublicCardDTO } from "@/lib/db/public-dto";
import { isolateScripts } from "@/lib/i18n/bidi";
import { INTL_LOCALE } from "@/lib/i18n/intl-locale";
import type { AppLocale } from "@/lib/i18n/locales";
import { getAppLocale } from "@/lib/i18n/server";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { CATALOGS } from "../../support/catalogs";
import { publicCar } from "../../support/public-car";

// The car route's own parts (FR-09.1, FR-09.2): the pages it builds with the site, the title and
// robots Next.js reads before the page renders, the 404's title, and the redirect from an earlier
// slug. The statuses the server answers with are tests/e2e/car-page.spec.ts's.

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
  permanentRedirect: vi.fn((path: string) => {
    throw new Error(`permanent redirect to ${path}`);
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));
vi.mock("@/features/car-page/server/car-page", () => ({ carPageFor: vi.fn() }));
vi.mock("@/features/inventory/server/inventory-index", () => ({ getInventoryIndex: vi.fn() }));
vi.mock("@/features/settings/server/dealer-id", () => ({ getDealerId: vi.fn() }));
vi.mock("@/lib/i18n/server", () => ({ getAppLocale: vi.fn() }));

const DEALER = "01923456-7890-7abc-8def-0000000000d1";
const GONE: CarPageResult = { kind: "notFound", gone: { bodyType: "suv" } };
const UNKNOWN: CarPageResult = { kind: "notFound", gone: null };

/** The props Next.js passes the route for the slug */
const props = (slug: string, locale: AppLocale = "en") => ({
  params: Promise.resolve({ locale, slug }),
  searchParams: Promise.resolve({}),
});

/** Renders as a page in the locale: getAppLocale gives it, and getTranslations reads its catalog */
function inLocale(locale: AppLocale) {
  vi.mocked(getAppLocale).mockResolvedValue(locale);
  const messages: Record<string, unknown> = CATALOGS[locale];
  const translations = (namespace?: string) =>
    Promise.resolve(
      createTranslator({ locale: INTL_LOCALE[locale], messages, ...(namespace === undefined ? {} : { namespace }) }),
    );
  // getTranslations' overloads type each namespace's translator, which a plain function can't match
  vi.mocked(getTranslations).mockImplementation(translations as unknown as typeof getTranslations);
}

/** The index's cards, with only the slug the route reads */
const cards = (...slugs: string[]) => slugs.map((slug) => ({ slug }) as PublicCardDTO);

beforeEach(() => {
  inLocale("en");
  vi.mocked(getDealerId).mockResolvedValue(DEALER);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the pages built with the site", () => {
  it("are every public car's, for the dealer this deployment serves", async () => {
    const slugs = ["2024-byd-atto-3-mu-ev3k", "2019-toyota-land-cruiser-gxr-mu-3hk8"];
    vi.mocked(getInventoryIndex).mockResolvedValue({ cards: cards(...slugs), makes: {}, models: {} });
    expect(await generateStaticParams()).toStrictEqual(slugs.map((slug) => ({ slug })));
    expect(getInventoryIndex).toHaveBeenCalledWith(DEALER);
  });

  it("are one 404 while the dealer has no cars, as the route must list a page", async () => {
    vi.mocked(getInventoryIndex).mockResolvedValue({ cards: [], makes: {}, models: {} });
    const params = await generateStaticParams();
    expect(params).toHaveLength(1);
    expect(isCarSlug(params[0]?.slug ?? "a")).toBe(false);
  });
});

describe("the page's title", () => {
  it("is the car's title in the page's language", async () => {
    vi.mocked(carPageFor).mockResolvedValue({ kind: "car", car: publicCar() });
    expect(await generateMetadata(props("2019-toyota-land-cruiser-gxr-mu-3hk8"))).toStrictEqual({
      title: `2019 Toyota Land Cruiser ${isolateScripts("GXR")}`,
      robots: undefined,
    });
    expect(carPageFor).toHaveBeenCalledWith("2019-toyota-land-cruiser-gxr-mu-3hk8");
    inLocale("ar");
    expect((await generateMetadata(props("2019-toyota-land-cruiser-gxr-mu-3hk8", "ar"))).title).toBe(
      `2019 تويوتا لاند كروزر ${isolateScripts("GXR")}`,
    );
  });

  it("keeps a sold car out of search engines, and no other (FR-09.1)", async () => {
    for (const status of ["published", "reserved", "sold"] as const) {
      vi.mocked(carPageFor).mockResolvedValue({ kind: "car", car: publicCar({ status }) });
      const { robots } = await generateMetadata(props("2019-toyota-land-cruiser-gxr-mu-3hk8"));
      expect(robots, status).toStrictEqual(status === "sold" ? { index: false } : undefined);
    }
  });

  it("is left to the redirect for an earlier slug", async () => {
    vi.mocked(carPageFor).mockResolvedValue({ kind: "redirect", slug: "2019-toyota-land-cruiser-gxr-mu-3hk8" });
    expect(await generateMetadata(props("2019-toyota-land-cruiser-mu-3hk8"))).toStrictEqual({});
  });

  it("is the 404's where no car is, which Next.js then takes from not-found.tsx", async () => {
    for (const result of [GONE, UNKNOWN]) {
      vi.mocked(carPageFor).mockResolvedValue(result);
      await expect(generateMetadata(props("2019-toyota-land-cruiser-mu-3hk8"))).rejects.toThrow("not found");
    }
  });
});

describe("the 404's title", () => {
  it("says that a car the site showed is no longer listed", async () => {
    vi.mocked(carPageFor).mockResolvedValue(GONE);
    expect(
      await notFoundMetadata({ params: Promise.resolve({ slug: "2019-toyota-land-cruiser-mu-3hk8" }) }),
    ).toStrictEqual({ title: en.errors.carGone });
    inLocale("ar");
    expect(
      await notFoundMetadata({ params: Promise.resolve({ slug: "2019-toyota-land-cruiser-mu-3hk8" }) }),
    ).toStrictEqual({ title: ar.errors.carGone });
  });

  it("is the site's 404 title for any other slug, and without the segment's params", async () => {
    vi.mocked(carPageFor).mockResolvedValue(UNKNOWN);
    expect(await notFoundMetadata({ params: Promise.resolve({ slug: "no-such-car-mu-2222" }) })).toStrictEqual({
      title: en.errors.notFound.title,
    });
    expect(await notFoundMetadata({})).toStrictEqual({ title: en.errors.notFound.title });
    expect(await notFoundMetadata({ params: Promise.resolve({}) })).toStrictEqual({ title: en.errors.notFound.title });
    expect(carPageFor).toHaveBeenCalledTimes(1);
  });
});

describe("the car's page", () => {
  it("hands its view the page's own address on the site's origin, which Share sends (FR-09.11)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://showroom.example");
    vi.mocked(carPageFor).mockResolvedValue({ kind: "car", car: publicCar() });
    inLocale("ar");
    const page = await CarPage(props("2019-toyota-land-cruiser-gxr-mu-3hk8", "ar"));
    // The route renders the view and its page event, side by side
    const [view] = Children.toArray((page as ReactElement<{ children: ReactNode }>).props.children);
    expect(view).toMatchObject({
      type: CarPageView,
      props: { url: "https://showroom.example/ar/cars/2019-toyota-land-cruiser-gxr-mu-3hk8" },
    });
  });
});

describe("an earlier slug", () => {
  it("redirects for good to the car's page under its slug now, in the page's language (FR-09.2)", async () => {
    vi.mocked(carPageFor).mockResolvedValue({ kind: "redirect", slug: "2019-toyota-land-cruiser-gxr-mu-3hk8" });
    inLocale("ar");
    await expect(CarPage(props("2019-toyota-land-cruiser-mu-3hk8", "ar"))).rejects.toThrow(
      "permanent redirect to /ar/cars/2019-toyota-land-cruiser-gxr-mu-3hk8",
    );
  });
});
