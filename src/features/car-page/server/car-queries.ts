import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  car,
  carSlugHistory,
  dealerSettings,
  inspection,
  inspectionPanel,
  journeyMilestone,
  make,
  media,
  model,
  priceChange,
  spinSet,
} from "@/lib/db/schema";
import type { PublicRepo } from "@/lib/db/scoped-repo";
import type { CarPageRows } from "./build-car";

// getCarPage's statements (SRS §11.4), in one batch: one round trip and one snapshot, whatever the
// slug finds. Every scoped table a statement names takes the public repository's predicate. P4 to
// P8 read the rows under the car the slug names now, so an earlier slug or a miss reads none.

/** The statements, in CarPageRows' order: P1 the rules, P2 the car, P3 an earlier slug's car, P4 the files, P5 the inspection, P6 the latest price change, P7 the journey, P8 the spin */
export function carStatements(repo: PublicRepo, slug: string) {
  const { db } = repo;
  const slugCar = () =>
    db
      .select({ id: car.id })
      .from(car)
      .where(and(repo.read(car), eq(car.slug, slug)));

  const rules = db
    .select({
      soldVisibleDays: dealerSettings.soldVisibleDays,
      mileageBands: dealerSettings.mileageBands,
      micronBands: dealerSettings.micronBands,
    })
    .from(dealerSettings)
    .where(repo.read(dealerSettings));

  const live = db
    .select({
      id: car.id,
      slug: car.slug,
      status: car.status,
      bodyType: car.bodyType,
      publishedAt: car.publishedAt,
      soldAt: car.soldAt,
      refCode: car.refCode,
      condition: car.condition,
      makeKey: car.makeKey,
      modelKey: car.modelKey,
      makeNameAr: make.nameAr,
      makeNameEn: make.nameEn,
      modelNameAr: model.nameAr,
      modelNameEn: model.nameEn,
      trim: car.trim,
      modelYear: car.modelYear,
      priceJod: car.priceJod,
      customsStatus: car.customsStatus,
      mileageKm: car.mileageKm,
      fuelType: car.fuelType,
      transmission: car.transmission,
      regionalSpecs: car.regionalSpecs,
      drivetrain: car.drivetrain,
      engineCc: car.engineCc,
      seats: car.seats,
      ownersCount: car.ownersCount,
      licenseStatus: car.licenseStatus,
      licenseExpiry: car.licenseExpiry,
      insuranceType: car.insuranceType,
      exteriorColorNameAr: car.exteriorColorNameAr,
      exteriorColorNameEn: car.exteriorColorNameEn,
      interiorColorNameAr: car.interiorColorNameAr,
      interiorColorNameEn: car.interiorColorNameEn,
      batterySohPct: car.batterySohPct,
      batterySohSource: car.batterySohSource,
      warrantyUntil: car.warrantyUntil,
      // BR-43: a hidden VIN never leaves the database
      vin: sql<string | null>`case when ${car.vinPublic} then ${car.vin} end`,
      features: car.features,
      descriptionAr: car.descriptionAr,
      descriptionEn: car.descriptionEn,
      lengthMm: car.lengthMm,
      wheelbaseMm: car.wheelbaseMm,
      consumptionLPer100km: car.consumptionLPer100km,
      consumptionKwhPer100km: car.consumptionKwhPer100km,
      recommendedOctane: car.recommendedOctane,
      phevElectricSharePct: car.phevElectricSharePct,
      colorFamily: car.colorFamily,
      exteriorColorHex: car.exteriorColorHex,
      paintFinish: car.paintFinish,
      coverMediaId: car.coverMediaId,
      ogMediaId: car.ogMediaId,
    })
    .from(car)
    .leftJoin(make, eq(make.key, car.makeKey))
    .leftJoin(model, eq(model.key, car.modelKey))
    .where(and(repo.read(car), eq(car.slug, slug)));

  const history = db
    .select({
      id: car.id,
      slug: car.slug,
      status: car.status,
      bodyType: car.bodyType,
      publishedAt: car.publishedAt,
      soldAt: car.soldAt,
    })
    .from(carSlugHistory)
    .innerJoin(car, and(eq(car.id, carSlugHistory.carId), repo.read(car)))
    .where(and(repo.read(carSlugHistory), eq(carSlugHistory.slug, slug)));

  const files = db
    .select({
      id: media.id,
      kind: media.kind,
      sortOrder: media.sortOrder,
      photoGroup: media.photoGroup,
      altAr: media.altAr,
      altEn: media.altEn,
      width: media.width,
      height: media.height,
      placeholder: media.placeholder,
      dominantColor: media.dominantColor,
      variants: media.variants,
      mime: media.mime,
      audioSource: media.audioSource,
    })
    .from(media)
    .where(
      and(
        repo.read(media),
        inArray(media.carId, slugCar()),
        inArray(media.kind, ["photo", "engine_audio", "inspection_report", "og_image"]),
        eq(media.status, "ready"),
        isNull(media.deletedAt),
      ),
    );

  const inspected = db
    .select({
      inspectedOn: inspection.inspectedOn,
      updatedAt: inspection.updatedAt,
      testCenterName: inspection.testCenterName,
      reportMediaId: inspection.reportMediaId,
      chassisState: inspection.chassisState,
      engineState: inspection.engineState,
      gearboxState: inspection.gearboxState,
      chassisNoteAr: inspection.chassisNoteAr,
      chassisNoteEn: inspection.chassisNoteEn,
      engineNoteAr: inspection.engineNoteAr,
      engineNoteEn: inspection.engineNoteEn,
      gearboxNoteAr: inspection.gearboxNoteAr,
      gearboxNoteEn: inspection.gearboxNoteEn,
      panelId: inspectionPanel.panelId,
      panelState: inspectionPanel.state,
      microns: inspectionPanel.microns,
      panelNoteAr: inspectionPanel.noteAr,
      panelNoteEn: inspectionPanel.noteEn,
      closeupMediaId: inspectionPanel.closeupMediaId,
    })
    .from(inspection)
    .leftJoin(inspectionPanel, and(eq(inspectionPanel.inspectionId, inspection.id), repo.read(inspectionPanel)))
    .where(and(repo.read(inspection), inArray(inspection.carId, slugCar())));

  const price = db
    .select({
      oldPriceJod: priceChange.oldPriceJod,
      newPriceJod: priceChange.newPriceJod,
      changedAt: priceChange.changedAt,
    })
    .from(priceChange)
    .where(and(repo.read(priceChange), inArray(priceChange.carId, slugCar())))
    .orderBy(desc(priceChange.changedAt), desc(priceChange.id))
    .limit(1);

  const journey = db
    .select({ sortOrder: journeyMilestone.sortOrder, type: journeyMilestone.type })
    .from(journeyMilestone)
    .where(and(repo.read(journeyMilestone), inArray(journeyMilestone.carId, slugCar())));

  const spin = db
    .select({ frameCount: spinSet.frameCount })
    .from(spinSet)
    .where(and(repo.read(spinSet), inArray(spinSet.carId, slugCar()), eq(spinSet.status, "ready")));

  return [rules, live, history, files, inspected, price, journey, spin] as const;
}

/** The slug's rows, read in one batch */
export async function loadCarPageRows(repo: PublicRepo, slug: string): Promise<CarPageRows> {
  const [rules, live, history, files, inspected, price, journey, spin] = await repo.db.batch(carStatements(repo, slug));
  return { rules, car: live, history, media: files, inspection: inspected, price, journey, spin };
}
