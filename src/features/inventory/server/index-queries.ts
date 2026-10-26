import "server-only";
import { and, desc, eq, gt, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PanelState } from "@/lib/db/enums";
import {
  car,
  dealerSettings,
  inspection,
  inspectionPanel,
  make,
  media,
  model,
  priceChange,
  spinSet,
} from "@/lib/db/schema";
import type { PublicRepo } from "@/lib/db/scoped-repo";
import type { IndexRows } from "./build-index";

// getInventoryIndex's statements (SRS §11.4), in one batch: one round trip and one snapshot,
// however many cars there are (NFR-SCALE-02). Every scoped table a statement names takes the public
// repository's predicate. The cars are read for BR-04's longest window, and the builder applies
// the dealer's own.

/** The public cars at `bound`'s window. Statuses are literals, so the planner can match the partial indexes */
function onShow(bound: Date): SQL {
  return sql`(${car.status} in ('published', 'reserved') or (${car.status} = 'sold' and ${gt(car.soldAt, bound)}))`;
}

/** The statements, in IndexRows' order: S0 the rules, S1 the cars, S2 the covers, S3 the inspections, S4 the latest price changes, S5 the names */
export function indexStatements(repo: PublicRepo, bound: Date) {
  const { db } = repo;
  const publicCars = () =>
    db
      .select({ id: car.id })
      .from(car)
      .where(and(repo.read(car), onShow(bound)));

  const rules = db
    .select({ soldVisibleDays: dealerSettings.soldVisibleDays })
    .from(dealerSettings)
    .where(repo.read(dealerSettings));

  const cars = db
    .select({
      id: car.id,
      slug: car.slug,
      refCode: car.refCode,
      status: car.status,
      makeKey: car.makeKey,
      modelKey: car.modelKey,
      trim: car.trim,
      modelYear: car.modelYear,
      mileageKm: car.mileageKm,
      priceJod: car.priceJod,
      fuelType: car.fuelType,
      regionalSpecs: car.regionalSpecs,
      customsStatus: car.customsStatus,
      bodyType: car.bodyType,
      transmission: car.transmission,
      licenseStatus: car.licenseStatus,
      insuranceType: car.insuranceType,
      paymentMethods: car.paymentMethods,
      seats: car.seats,
      colorFamily: car.colorFamily,
      ownersCount: car.ownersCount,
      features: car.features,
      publishedAt: car.publishedAt,
      updatedAt: car.updatedAt,
      soldAt: car.soldAt,
      hasSpin: sql<boolean>`exists (select 1 from ${spinSet} where ${and(
        eq(spinSet.carId, car.id),
        eq(spinSet.status, "ready"),
        repo.read(spinSet),
      )})`,
      hasClip: sql<boolean>`exists (select 1 from ${media} where ${and(
        eq(media.carId, car.id),
        eq(media.kind, "engine_audio"),
        eq(media.status, "ready"),
        isNull(media.deletedAt),
        repo.read(media),
      )})`,
    })
    .from(car)
    .where(and(repo.read(car), onShow(bound)));

  // The cover, else the first photo (FR-06), read only when the cover is missing
  const cover = alias(media, "cover");
  const photo = alias(media, "photo");
  const firstPhoto = db
    .select({ variants: photo.variants, placeholder: photo.placeholder, dominantColor: photo.dominantColor })
    .from(photo)
    .where(
      and(
        isNull(cover.id),
        eq(photo.carId, car.id),
        eq(photo.kind, "photo"),
        eq(photo.status, "ready"),
        isNull(photo.deletedAt),
        repo.read(media, photo),
      ),
    )
    .orderBy(photo.sortOrder, photo.id)
    .limit(1)
    .as("first_photo");
  const variants = sql`coalesce(${cover.variants}, ${firstPhoto.variants})`;
  const covers = db
    .select({
      carId: car.id,
      // The card widths alone leave the database
      variant480: sql<string | null>`${variants} ->> '480'`,
      variant960: sql<string | null>`${variants} ->> '960'`,
      placeholder: sql<string | null>`coalesce(${cover.placeholder}, ${firstPhoto.placeholder})`,
      dominantColor: sql<string | null>`coalesce(${cover.dominantColor}, ${firstPhoto.dominantColor})`,
    })
    .from(car)
    .leftJoin(
      cover,
      and(
        eq(cover.id, car.coverMediaId),
        eq(cover.carId, car.id),
        eq(cover.kind, "photo"),
        eq(cover.status, "ready"),
        isNull(cover.deletedAt),
        repo.read(media, cover),
      ),
    )
    .leftJoinLateral(firstPhoto, sql`true`)
    .where(and(repo.read(car), onShow(bound)));

  const inspections = db
    .select({
      carId: inspection.carId,
      updatedAt: inspection.updatedAt,
      // As text[], which the driver reads as an array
      panelStates: sql<
        PanelState[]
      >`coalesce(array_agg(${inspectionPanel.state}::text) filter (where ${inspectionPanel.id} is not null), '{}')`,
      chassisState: inspection.chassisState,
      engineState: inspection.engineState,
      gearboxState: inspection.gearboxState,
    })
    .from(inspection)
    .leftJoin(inspectionPanel, and(eq(inspectionPanel.inspectionId, inspection.id), repo.read(inspectionPanel)))
    .where(and(repo.read(inspection), inArray(inspection.carId, publicCars())))
    .groupBy(inspection.id);

  // BR-05 reads each car's latest change alone
  const prices = db
    .selectDistinctOn([priceChange.carId], {
      carId: priceChange.carId,
      oldPriceJod: priceChange.oldPriceJod,
      newPriceJod: priceChange.newPriceJod,
      changedAt: priceChange.changedAt,
    })
    .from(priceChange)
    .where(and(repo.read(priceChange), inArray(priceChange.carId, publicCars())))
    .orderBy(priceChange.carId, desc(priceChange.changedAt), desc(priceChange.id));

  const models = db
    .select({
      modelKey: model.key,
      makeKey: model.makeKey,
      modelNameAr: model.nameAr,
      modelNameEn: model.nameEn,
      makeNameAr: make.nameAr,
      makeNameEn: make.nameEn,
    })
    .from(model)
    .innerJoin(make, eq(make.key, model.makeKey))
    .where(
      inArray(
        model.key,
        db
          .select({ key: car.modelKey })
          .from(car)
          .where(and(repo.read(car), onShow(bound))),
      ),
    );

  return [rules, cars, covers, inspections, prices, models] as const;
}

/** The index's rows, read in one batch */
export async function loadIndexRows(repo: PublicRepo, bound: Date): Promise<IndexRows> {
  const [rules, cars, covers, inspections, prices, models] = await repo.db.batch(indexStatements(repo, bound));
  return { rules, cars, covers, inspections, prices, models };
}
