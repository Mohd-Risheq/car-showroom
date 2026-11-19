import { eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { withScriptDatabase } from "../../scripts/database.ts";
import { claimRefCode } from "../../src/features/dealer/domain/ref-code.ts";
import { type BodyType, PANEL_IDS } from "../../src/lib/db/enums.ts";
import {
  car,
  carSlugHistory,
  dealer,
  inspection,
  inspectionPanel,
  make,
  media,
  model,
  priceChange,
} from "../../src/lib/db/schema.ts";
import { carTitle } from "../../src/lib/format/car-title.ts";
import { type FixturePhoto, storedPhoto } from "./fixture-photos.ts";
import { serverSetting } from "./server-env.ts";

// The server's database, for the car page's journeys: the seed's cars as the public sees them, and
// what a test adds where the seed has nothing like it and removes after: an earlier slug of a seed
// car, and copies of a seed car, published after the build, sold, or gone from the site, with a
// price drop of a given age where a test needs one, and facts of a test's own in place of the seed
// car's, for a car the seed has none like. Each takes a slug no earlier run used, so a page the
// server kept from that run is never the one a test reads. A copy carries its seed car's facts but
// those, none of its inspection or other records, and only the photos a test gives it
// (fixture-photos.ts), the first its cover unless the test names another. A photo with a note is
// the close-up of a panel with that note, in an inspection the copy has for its close-ups alone.
//
// A published or sold copy is in the inventory until it is removed, and a page that read the index
// at that time would list it. The pages that read the index are built with the site, so none does
// in a run.
//
// The fixtures write to the server's database (server-env.ts), or to another a test names by its
// URL, as their own integration test does (car-fixture.test.ts). A copy is written whole or not at
// all, so one that fails part-way leaves no car that remove() wouldn't know of.

/** The server's database */
const serverDatabase = () => serverSetting("DATABASE_URL_UNPOOLED");

/**
 * A seed car as the public sees it: its id, slug, reference, title in each language (FR-09), body
 * type, price, kilometres and features
 */
export type SeedCar = {
  id: string;
  slug: string;
  refCode: string;
  title: Record<"ar" | "en", string>;
  bodyType: BodyType;
  priceJod: number | null;
  mileageKm: number | null;
  features: string[];
};

/** The seed car with the key, from the server's database or the one at the URL */
export async function seedCar(seedKey: string, url = serverDatabase()): Promise<SeedCar> {
  const [row] = await withScriptDatabase(url, (db) =>
    db
      .select({
        id: car.id,
        slug: car.slug,
        refCode: car.refCode,
        bodyType: car.bodyType,
        priceJod: car.priceJod,
        mileageKm: car.mileageKm,
        features: car.features,
        year: car.modelYear,
        trim: car.trim,
        makeAr: make.nameAr,
        makeEn: make.nameEn,
        modelAr: model.nameAr,
        modelEn: model.nameEn,
      })
      .from(car)
      .leftJoin(make, eq(make.key, car.makeKey))
      .leftJoin(model, eq(model.key, car.modelKey))
      .where(eq(car.seedKey, seedKey)),
  );
  if (row === undefined) throw new Error(`No seed car has the key ${seedKey}`);
  const { year, bodyType, makeAr, makeEn, modelAr, modelEn, trim } = row;
  if (year === null || bodyType === null || makeAr === null || makeEn === null || modelAr === null || modelEn === null)
    throw new Error(`The seed car ${seedKey} lacks the year, make, model or body type its page shows`);
  return {
    id: row.id,
    slug: row.slug,
    refCode: row.refCode,
    // The title FR-09 gives it in each language (car-title.ts)
    title: {
      ar: carTitle({ modelYear: year, make: makeAr, model: modelAr, trim }),
      en: carTitle({ modelYear: year, make: makeEn, model: modelEn, trim }),
    },
    bodyType,
    priceJod: row.priceJod,
    mileageKm: row.mileageKm,
    features: row.features,
  };
}

// The columns a copy takes from its seed car: all but its identity, its seed keys, its media, its
// statuses' times and the VIN, which is never read
const OWN_COLUMNS = [
  "id",
  "seedKey",
  "seedOffsets",
  "copiedFromCarId",
  "clientDraftId",
  "demoSessionId",
  "refCode",
  "slug",
  "status",
  "vin",
  "vinPublic",
  "coverMediaId",
  "ogMediaId",
  "blueprintMediaId",
  "publishedAt",
  "soldAt",
  "archivedAt",
  "version",
  "draftStep",
  "createdAt",
  "updatedAt",
] as const;
type OwnColumn = (typeof OWN_COLUMNS)[number];
const OWN = new Set<string>(OWN_COLUMNS);
const COLUMNS = getTableColumns(car);
type CopiedColumns = Omit<typeof COLUMNS, OwnColumn>;
// Object.fromEntries can't tell which columns the filter keeps, so the type says it
const COPIED = Object.fromEntries(Object.entries(COLUMNS).filter(([key]) => !OWN.has(key))) as CopiedColumns;

/** A word no earlier run used, for a slug */
const freshWord = () => crypto.randomUUID().slice(0, 8);

const DAY_MS = 86_400_000;

/** A drop to the copy's price from an earlier one, made the days ago given (BR-05) */
export type PriceDrop = { fromJod: number; daysAgo: number };

/** Facts a copy has in place of its seed car's: any column it takes from it */
type CopyChanges = Partial<Omit<typeof car.$inferInsert, OwnColumn>>;

/** The rows one test added, which remove() deletes */
export class CarFixtures {
  readonly #url: string | undefined;
  readonly #cars: string[] = [];
  readonly #earlierSlugs: string[] = [];

  /** Rows written to the server's database, or to the one at the URL */
  constructor(url?: string) {
    this.#url = url;
  }

  /** The database the rows go to: the server's, as its settings are when the first write runs */
  #database(): string {
    return this.#url ?? serverDatabase();
  }

  /** Gives the seed car an earlier slug, as renaming a published car leaves one (BR-16) */
  async earlierSlug(seedKey: string): Promise<{ earlier: string; current: string }> {
    const earlier = `e2e-${freshWord()}-${seedKey}`;
    const current = await withScriptDatabase(this.#database(), async (db) => {
      const [seed] = await db
        .select({ id: car.id, dealerId: car.dealerId, slug: car.slug })
        .from(car)
        .where(eq(car.seedKey, seedKey));
      if (seed === undefined) throw new Error(`No seed car has the key ${seedKey}`);
      await db.insert(carSlugHistory).values({ carId: seed.id, dealerId: seed.dealerId, slug: earlier });
      return seed.slug;
    });
    this.#earlierSlugs.push(earlier);
    return { earlier, current };
  }

  /**
   * A copy of the seed car under a slug and a reference of its own: published or sold now, or
   * archived, as a car the site showed and took down is, with the price drop, the changes and the
   * photos given, in their order, and the cover at the place given (from 0). Its slug is returned.
   */
  async copy(
    seedKey: string,
    status: "published" | "sold" | "archived",
    {
      drop,
      changes = {},
      photos = [],
      cover = 0,
    }: { drop?: PriceDrop; changes?: CopyChanges; photos?: readonly FixturePhoto[]; cover?: number } = {},
  ): Promise<string> {
    // Each close-up is a panel's of its own (below), checked before a photo or a row is written
    if (photos.filter(({ note }) => note !== undefined).length > PANEL_IDS.length)
      throw new Error(`A copy has ${PANEL_IDS.length} close-ups at most`);
    const stored = await Promise.all(
      photos.map(async (photo, index) => ({ photo, file: await storedPhoto(photo, index + 1) })),
    );
    const made = await withScriptDatabase(this.#database(), (database) =>
      database.transaction(async (db) => {
        const [facts] = await db.select(COPIED).from(car).where(eq(car.seedKey, seedKey));
        if (facts === undefined) throw new Error(`No seed car has the key ${seedKey}`);
        const [owner] = await db.select({ prefix: dealer.refPrefix }).from(dealer).where(eq(dealer.id, facts.dealerId));
        if (owner === undefined) throw new Error(`The seed car ${seedKey} has no dealer`);
        const now = new Date();
        const row = await claimRefCode(owner.prefix, async (refCode) => {
          const [inserted] = await db
            .insert(car)
            .values({
              ...facts,
              ...changes,
              refCode,
              slug: `e2e-${freshWord()}-${refCode.toLowerCase()}`,
              status,
              publishedAt: now,
              soldAt: status === "sold" ? now : null,
              archivedAt: status === "archived" ? now : null,
            })
            // A code another live car has is drawn again; any other conflict raises (ref-code.ts)
            .onConflictDoNothing({ target: [car.dealerId, car.refCode], where: sql`${car.demoSessionId} IS NULL` })
            .returning({ id: car.id, slug: car.slug, refCode: car.refCode, priceJod: car.priceJod });
          return inserted;
        });
        if (drop !== undefined) {
          if (row.priceJod === null) throw new Error(`The seed car ${seedKey} has no price to drop to`);
          await db.insert(priceChange).values({
            carId: row.id,
            oldPriceJod: drop.fromJod,
            newPriceJod: row.priceJod,
            changedAt: new Date(now.getTime() - drop.daysAgo * DAY_MS),
          });
        }
        if (stored.length > 0) {
          const rows = await db
            .insert(media)
            .values(
              stored.map(({ photo, file }, index) => ({
                dealerId: facts.dealerId,
                carId: row.id,
                kind: "photo" as const,
                photoGroup: photo.group,
                sortOrder: index,
                altAr: photo.alt?.ar ?? null,
                altEn: photo.alt?.en ?? null,
                width: file.width,
                height: file.height,
                dominantColor: file.color,
                variants: file.variants,
                mime: "image/webp",
                bytes: file.bytes,
                storagePrefix: "fixtures/photos/",
                status: "ready" as const,
                clientUploadId: crypto.randomUUID(),
              })),
            )
            .returning({ id: media.id });
          await db
            .update(car)
            .set({ coverMediaId: rows[cover]?.id ?? null })
            .where(eq(car.id, row.id));
          const closeups = rows.flatMap(({ id }, index) => {
            const note = stored[index]?.photo.note;
            return note === undefined ? [] : [{ id, note }];
          });
          if (closeups.length > 0) {
            const [report] = await db.insert(inspection).values({ carId: row.id }).returning({ id: inspection.id });
            if (report === undefined) throw new Error("The copy's inspection wasn't added");
            // The panels in their order, each with the close-up at its place, as far as they go
            await db.insert(inspectionPanel).values(
              PANEL_IDS.flatMap((panelId, index) => {
                const closeup = closeups[index];
                if (closeup === undefined) return [];
                const { id, note } = closeup;
                return [
                  {
                    inspectionId: report.id,
                    panelId,
                    state: "touch_up" as const,
                    noteAr: note.ar ?? null,
                    noteEn: note.en ?? null,
                    closeupMediaId: id,
                  },
                ];
              }),
            );
          }
        }
        return row;
      }),
    );
    this.#cars.push(made.id);
    return made.slug;
  }

  /** Deletes what this added */
  async remove(): Promise<void> {
    if (this.#cars.length === 0 && this.#earlierSlugs.length === 0) return;
    await withScriptDatabase(this.#database(), async (db) => {
      if (this.#earlierSlugs.length > 0)
        await db.delete(carSlugHistory).where(inArray(carSlugHistory.slug, this.#earlierSlugs));
      if (this.#cars.length > 0) {
        await db.delete(media).where(inArray(media.carId, this.#cars));
        await db.delete(car).where(inArray(car.id, this.#cars));
      }
    });
    this.#cars.length = 0;
    this.#earlierSlugs.length = 0;
  }
}
