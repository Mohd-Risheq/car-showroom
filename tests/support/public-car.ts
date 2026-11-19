import { PANEL_IDS } from "@/lib/db/enums";
import type { PublicCarDTO, PublicInspection, PublicPanel } from "@/lib/db/public-dto";

// A public car for the car page's unit tests, shaped like the seed's Land Cruiser, with a test's own
// changes on top. It has no photos, inspection, sound, spin or journey, which a test adds when it is
// about them, the inspection and its panels through their own builders here.

const LAND_CRUISER: PublicCarDTO = {
  id: "01923456-7890-7abc-8def-0000000000c1",
  slug: "2019-toyota-land-cruiser-gxr-mu-3hk8",
  refCode: "MU-3HK8",
  status: "published",
  condition: "used",
  makeName: { ar: "تويوتا", en: "Toyota" },
  modelKey: "toyota-land-cruiser",
  modelName: { ar: "لاند كروزر", en: "Land Cruiser" },
  trim: "GXR",
  modelYear: 2019,
  priceJod: 48_500,
  priceDrop: null,
  customsStatus: "cleared",
  mileageKm: 64_000,
  mileageCheck: { band: "low", kmPerYear: 11_016, low: 12_000, high: 25_000 },
  fuelType: "gasoline",
  transmission: "automatic",
  regionalSpecs: "gcc",
  bodyType: "suv",
  drivetrain: "four_wd",
  engineCc: 4000,
  seats: 7,
  ownersCount: 1,
  licenseStatus: "licensed",
  licenseExpiry: "2027-03-01",
  insuranceType: "comprehensive",
  exteriorColorName: { ar: "أبيض لؤلؤي", en: "Pearl white" },
  interiorColorName: { ar: "بيج", en: "Beige" },
  battery: null,
  warrantyUntil: null,
  vin: null,
  features: ["airbags", "carplay"],
  description: { ar: "مالك واحد، وصيانة لدى الوكالة.", en: "One owner, serviced at the agency." },
  lengthMm: 4950,
  wheelbaseMm: 2850,
  ogImage: null,
  consumption: { lPer100km: 12.5, kwhPer100km: null },
  recommendedOctane: 95,
  phevElectricSharePct: null,
  colorFamily: "white",
  exteriorColorHex: "#f4f2ee",
  paintFinish: "pearl",
  photos: [],
  inspection: null,
  sound: null,
  spin: null,
  journey: [],
};

/** The sample car, with the changes */
export function publicCar(changes: Partial<PublicCarDTO> = {}): PublicCarDTO {
  return { ...LAND_CRUISER, ...changes };
}

const UNWRITTEN = { ar: null, en: null };

/** A panel's reading, a touched-up hood with no note or close-up, with the changes */
export function publicPanel(changes: Partial<PublicPanel> = {}): PublicPanel {
  return {
    panelId: "hood",
    state: "touch_up",
    microns: 180,
    band: "refinish",
    note: UNWRITTEN,
    closeupPhotoId: null,
    ...changes,
  };
}

const SOUND = { state: "sound", note: UNWRITTEN } as const;

/** An inspection with every panel original and every mechanical item sound, with the changes */
export function publicInspection(changes: Partial<PublicInspection> = {}): PublicInspection {
  return {
    declaredOn: "2026-10-24",
    testCenterName: null,
    report: null,
    filled: 16,
    panels: PANEL_IDS.map((panelId) => publicPanel({ panelId, state: "original", microns: 120, band: "factory" })),
    mechanical: { chassis: SOUND, engine: SOUND, gearbox: SOUND },
    ...changes,
  };
}
