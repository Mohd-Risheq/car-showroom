import { type SQLWrapper, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { USER_ROLES } from "../auth/roles.ts";
import { LOCALES } from "../i18n/locales.ts";
import { IMAGE_KINDS, MEDIA_KINDS, MEDIA_TYPES } from "../storage/rules.ts";
import type { AuditMeta } from "../validation/audit.ts";
import {
  AUDIO_DURATION_MS,
  BRAND_NAME_CHARS,
  DESCRIPTION_MAX_CHARS,
  ENGINE_CC,
  FEATURED_CARS_MAX,
  FEATURES_MAX,
  FRACTION,
  FRAME_INDEX,
  HOTSPOT_WINDOW,
  KWH_PER_100KM,
  LATITUDE,
  LENGTH_MM,
  LITRES_PER_100KM,
  LONGITUDE,
  MICRONS,
  MILEAGE_KM,
  MILESTONES_MAX,
  MODEL_YEAR_MIN,
  OCTANES,
  OWNERS_COUNT,
  PEAKS_COUNT,
  PERCENT,
  POWER_HP,
  PRICE_JOD,
  type Range,
  SEATS,
  SOLD_VISIBLE_DAYS,
  SPIN_FRAMES,
  STORY_MAX_CHARS,
  UNIT_PRICE_JOD,
  WHEELBASE_MM,
} from "../validation/bounds.ts";
import type { SeedOffsets } from "../validation/car.ts";
import type { ExpectedPaths, MediaVariants, Peaks } from "../validation/media.ts";
import type {
  BaselineConsumption,
  Closure,
  HeroMarks,
  MicronBands,
  MileageBands,
  RamadanSchedule,
  SocialLinks,
  WeeklyHours,
} from "../validation/settings.ts";
import type { SpinCrop } from "../validation/spin.ts";
import type { VinDecodePayload } from "../validation/vin-decode.ts";
import {
  ACCENT_PRESETS,
  AUDIO_CLIP_TYPES,
  AUDIO_SOURCES,
  BODY_TYPES,
  CAR_CONDITIONS,
  CAR_STATUSES,
  COLOR_FAMILIES,
  CONSUMPTION_SOURCES,
  CUSTOMS_STATUSES,
  DRIVETRAINS,
  EVENT_NAMES,
  FUEL_TYPES,
  INSURANCE_TYPES,
  LICENSE_STATUSES,
  MECH_STATES,
  MEDIA_STATUSES,
  MILESTONE_TYPES,
  PAINT_FINISHES,
  PANEL_IDS,
  PANEL_STATES,
  PAYMENT_METHODS,
  PHOTO_GROUPS,
  PLACE_KINDS,
  REGIONAL_SPECS,
  SOH_SOURCES,
  SPIN_DIRECTIONS,
  SPIN_STATUSES,
  TITLE_BRANDS,
  TRANSMISSIONS,
} from "./enums.ts";
import { uuidv7 } from "./id.ts";

// The data model of SRS §6, choices and additions in DECISIONS.md D-043. Properties are camelCase
// and columns snake_case. drizzle-kit and the scripts load this module, so its value imports are
// relative .ts paths to import-free modules.
//
// - Ids are UUIDv7, made in the app; the auth tables keep their database default as well.
// - Every check and partial index writes its values into the SQL text, because drizzle-kit keeps
//   only the text. Each is named, and each DESC index column sorts nulls first, as a plain DESC does.
// - Each jsonb column has the type of the Zod schema in src/lib/validation that every write
//   parses with, so a reader gets the shape that schema promises.
// - Child rows of a car carry no dealer or session columns: they are scoped through the car.
// - A car or a session can't be deleted while Media rows point to it, so a cleanup job deletes the
//   stored files and their rows first, and no file is left behind in storage. Pointers to media are
//   set null instead, so purging a file never waits on them.

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const id = () => uuid("id").primaryKey().$defaultFn(uuidv7);
const createdAt = () => timestamptz("created_at").notNull().defaultNow();
const updatedAt = () =>
  timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const coordinate = (name: string) => numeric(name, { precision: 9, scale: 6, mode: "number" });
const unitPrice = (name: string) => numeric(name, { precision: 6, scale: 3, mode: "number" });
const counter = (name: string) => smallint(name).notNull().default(0);

const dealerReference = () =>
  uuid("dealer_id")
    .notNull()
    .references(() => dealer.id, { onDelete: "restrict" });
const demoSessionReference = (onDelete: "cascade" | "restrict") =>
  varchar("demo_session_id", { length: 32 }).references(() => demoSession.id, { onDelete });
const mediaPointer = (name: string) => uuid(name).references((): AnyPgColumn => media.id, { onDelete: "set null" });
// A removed member's rows stay, without the member (FR-44.6)
const userPointer = (name: string) => uuid(name).references(() => user.id, { onDelete: "set null" });

/** Values for an IN list, written into the SQL text */
const literals = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(", "));

/** A number written into the SQL text, as a check's bound must be */
const literal = (value: number) => sql.raw(String(value));

/** The value lies in the range, the bounds written into the SQL text */
const inRange = (value: SQLWrapper, { min, max }: Range) => sql`${value} BETWEEN ${literal(min)} AND ${literal(max)}`;

/** Both coordinates or neither, each in its range (VR-23) */
const coordinatesCheck = (name: string, lat: SQLWrapper, lng: SQLWrapper) =>
  check(name, sql`(${lat} IS NULL) = (${lng} IS NULL) AND ${inRange(lat, LATITUDE)} AND ${inRange(lng, LONGITUDE)}`);

// Enums (SRS §6.3)

export const userRole = pgEnum("user_role", USER_ROLES);
export const locale = pgEnum("locale", LOCALES);
export const mediaKind = pgEnum("media_kind", MEDIA_KINDS);
export const carStatus = pgEnum("car_status", CAR_STATUSES);
export const bodyType = pgEnum("body_type", BODY_TYPES);
export const fuelType = pgEnum("fuel_type", FUEL_TYPES);
export const transmission = pgEnum("transmission", TRANSMISSIONS);
export const drivetrain = pgEnum("drivetrain", DRIVETRAINS);
export const regionalSpecs = pgEnum("regional_specs", REGIONAL_SPECS);
export const customsStatus = pgEnum("customs_status", CUSTOMS_STATUSES);
export const licenseStatus = pgEnum("license_status", LICENSE_STATUSES);
export const insuranceType = pgEnum("insurance_type", INSURANCE_TYPES);
export const paymentMethod = pgEnum("payment_method", PAYMENT_METHODS);
export const carCondition = pgEnum("car_condition", CAR_CONDITIONS);
export const paintFinish = pgEnum("paint_finish", PAINT_FINISHES);
export const colorFamily = pgEnum("color_family", COLOR_FAMILIES);
export const photoGroup = pgEnum("photo_group", PHOTO_GROUPS);
export const panelId = pgEnum("panel_id", PANEL_IDS);
export const panelState = pgEnum("panel_state", PANEL_STATES);
export const mechState = pgEnum("mech_state", MECH_STATES);
export const milestoneType = pgEnum("milestone_type", MILESTONE_TYPES);
export const titleBrand = pgEnum("title_brand", TITLE_BRANDS);
export const audioClipType = pgEnum("audio_clip_type", AUDIO_CLIP_TYPES);
export const audioSource = pgEnum("audio_source", AUDIO_SOURCES);
export const spinDirection = pgEnum("spin_direction", SPIN_DIRECTIONS);
export const spinStatus = pgEnum("spin_status", SPIN_STATUSES);
export const placeKind = pgEnum("place_kind", PLACE_KINDS);
export const mediaStatus = pgEnum("media_status", MEDIA_STATUSES);
export const accentPreset = pgEnum("accent_preset", ACCENT_PRESETS);
export const consumptionSource = pgEnum("consumption_source", CONSUMPTION_SOURCES);
export const sohSource = pgEnum("soh_source", SOH_SOURCES);
export const eventName = pgEnum("event_name", EVENT_NAMES);

// ENT-Dealer: one per deployment

export const dealer = pgTable(
  "dealer",
  {
    id: id(),
    slug: varchar("slug", { length: 40 }).notNull().unique(),
    // BR-15's two-letter reference prefix: on the dealer, so no sandbox changes it. Read-only in v1
    refPrefix: char("ref_prefix", { length: 2 }).notNull().default("MU"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("dealer_slug_format", sql`${t.slug} ~ '^[a-z0-9-]+$'`),
    check("dealer_ref_prefix_format", sql`${t.refPrefix} ~ '^[A-Z]{2}$'`),
  ],
);

// Auth tables (ENT-User, SRS §11.2). Property names are the auth library's field names. The library
// checks this object against its config at the first request, so a field it writes must exist here
// and any other column must be nullable or have a default. The library leaves ids to the database
// (D-018), and Drizzle fills them with a UUIDv7 before the database default applies. T-28 adds
// two-step sign-in.

export const user = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(uuidv7),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // Server-owned fields, declared to the library with input: false (FR-29.11)
    dealerId: dealerReference(),
    role: userRole("role").notNull().default("staff"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    disabledAt: timestamptz("disabled_at"),
    tempPasswordExpiresAt: timestamptz("temp_password_expires_at"),
    totpLastStep: bigint("totp_last_step", { mode: "number" }),
  },
  (t) => [index("user_dealer_id_idx").on(t.dealerId)],
);

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(uuidv7),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // Always null: the session.create.before hook drops it (SEC-02)
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Set only by the step-up action (BR-41, API-32)
    stepUpAt: timestamptz("step_up_at"),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(uuidv7),
    // For the credential provider this is the user's id: the library's password update matches on it
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").primaryKey().defaultRandom().$defaultFn(uuidv7),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ENT-DemoSession: a visitor's 24-hour sandbox (FR-45). The token stays in the visitor's cookie;
// only its hash is stored.

export const demoSession = pgTable(
  "demo_session",
  {
    // The sandbox id: 128 random bits in base64url, used in keys and storage paths, never a credential
    id: varchar("id", { length: 32 }).primaryKey(),
    tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
    createdAt: createdAt(),
    expiresAt: timestamptz("expires_at")
      .notNull()
      .default(sql`now() + interval '24 hours'`),
    // BR-30's counters, reserved before each upload token or action. Caps live in code, not here
    carsCreated: counter("cars_created"),
    copiesCount: counter("copies_count"),
    photosCount: counter("photos_count"),
    spinFrames: counter("spin_frames"),
    audioCount: counter("audio_count"),
    reportsCount: counter("reports_count"),
    decodesCount: counter("decodes_count"),
    logoCount: counter("logo_count"),
    uploadTokens: counter("upload_tokens"),
  },
  (t) => [
    index("demo_session_expires_at_idx").on(t.expiresAt),
    check("demo_session_id_format", sql`${t.id} ~ '^[A-Za-z0-9_-]{22}$'`),
    check("demo_session_token_hash_format", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "demo_session_counters_min",
      sql`least(${sql.join(
        [
          ...[t.carsCreated, t.copiesCount, t.photosCount, t.spinFrames, t.audioCount],
          ...[t.reportsCount, t.decodesCount, t.logoCount, t.uploadTokens],
        ],
        sql`, `,
      )}) >= 0`,
    ),
  ],
);

// ENT-DealerSettings: the dealer's live row, and a sandbox copy for each demo session

const OPEN_DAY = [{ open: "09:00", close: "21:00", overnight: false }];
const FRIDAY = [{ open: "14:00", close: "21:00", overnight: false }];

export const dealerSettings = pgTable(
  "dealer_settings",
  {
    id: id(),
    dealerId: dealerReference(),
    demoSessionId: demoSessionReference("cascade"),
    brandNameAr: varchar("brand_name_ar", { length: 60 }).notNull(),
    brandNameEn: varchar("brand_name_en", { length: 60 }).notNull(),
    taglineAr: varchar("tagline_ar", { length: 120 }),
    taglineEn: varchar("tagline_en", { length: 120 }),
    // FR-27's story on the Visit page
    storyAr: text("story_ar"),
    storyEn: text("story_en"),
    logoMediaId: mediaPointer("logo_media_id"),
    accentPreset: accentPreset("accent_preset").notNull().default("scan_cyan"),
    whatsappE164: varchar("whatsapp_e164", { length: 16 }),
    phoneE164: varchar("phone_e164", { length: 16 }),
    email: varchar("email", { length: 254 }),
    addressAr: varchar("address_ar", { length: 200 }),
    addressEn: varchar("address_en", { length: 200 }),
    lat: coordinate("lat"),
    lng: coordinate("lng"),
    social: jsonb("social").$type<SocialLinks>().notNull().default({}),
    hours: jsonb("hours").$type<WeeklyHours>().notNull().default({
      sat: OPEN_DAY,
      sun: OPEN_DAY,
      mon: OPEN_DAY,
      tue: OPEN_DAY,
      wed: OPEN_DAY,
      thu: OPEN_DAY,
      fri: FRIDAY,
    }),
    ramadan: jsonb("ramadan").$type<RamadanSchedule>(),
    closures: jsonb("closures").$type<Closure[]>().notNull().default([]),
    // JOD per litre and per kWh, from the October 2026 sheet (§14)
    fuelPrice90: unitPrice("fuel_price_90").default(1.05),
    fuelPrice95: unitPrice("fuel_price_95").default(1.36),
    fuelPrice98: unitPrice("fuel_price_98").default(1.51),
    fuelPriceDiesel: unitPrice("fuel_price_diesel").default(0.9),
    elecHomeOffpeakKwh: unitPrice("elec_home_offpeak_kwh").default(0.108),
    elecHomePeakKwh: unitPrice("elec_home_peak_kwh").default(0.16),
    elecPublicKwh: unitPrice("elec_public_kwh").default(0.133),
    baselineLPer100km: jsonb("baseline_l_per_100km").$type<BaselineConsumption>().notNull().default({
      sedan: 8,
      suv: 11,
      hatchback: 7,
      pickup: 12,
      coupe: 9,
      convertible: 9.5,
      van: 12,
      truck: 16,
    }),
    pricesUpdatedAt: timestamptz("prices_updated_at"),
    heroCarId: uuid("hero_car_id").references((): AnyPgColumn => car.id, { onDelete: "set null" }),
    heroMediaId: mediaPointer("hero_media_id"),
    heroMarks: jsonb("hero_marks").$type<HeroMarks>(),
    featuredCarIds: uuid("featured_car_ids").array().notNull().default([]),
    soldVisibleDays: smallint("sold_visible_days").notNull().default(14),
    mileageBands: jsonb("mileage_bands").$type<MileageBands>().notNull().default({ low: 12000, high: 25000 }),
    micronBands: jsonb("micron_bands").$type<MicronBands>().notNull().default({ factoryMax: 180, refinishMax: 300 }),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("dealer_settings_dealer_demo_key").on(t.dealerId, t.demoSessionId),
    uniqueIndex("dealer_settings_live_key")
      .on(t.dealerId)
      .where(sql`${t.demoSessionId} IS NULL`),
    index("dealer_settings_demo_session_id_idx").on(t.demoSessionId),
    index("dealer_settings_logo_media_id_idx").on(t.logoMediaId),
    index("dealer_settings_hero_car_id_idx").on(t.heroCarId),
    index("dealer_settings_hero_media_id_idx").on(t.heroMediaId),
    check(
      "dealer_settings_brand_name_length",
      sql`${inRange(sql`char_length(${t.brandNameAr})`, BRAND_NAME_CHARS)} AND ${inRange(sql`char_length(${t.brandNameEn})`, BRAND_NAME_CHARS)}`,
    ),
    // VR-32
    check(
      "dealer_settings_story_length",
      sql`char_length(${t.storyAr}) <= ${literal(STORY_MAX_CHARS)} AND char_length(${t.storyEn}) <= ${literal(STORY_MAX_CHARS)}`,
    ),
    check("dealer_settings_whatsapp_format", sql`${t.whatsappE164} ~ '^[+][1-9][0-9]{7,14}$'`),
    check("dealer_settings_phone_format", sql`${t.phoneE164} ~ '^[+][1-9][0-9]{7,14}$'`),
    coordinatesCheck("dealer_settings_coordinates", t.lat, t.lng),
    // VR-25
    check(
      "dealer_settings_unit_prices_range",
      sql.join(
        [
          ...[t.fuelPrice90, t.fuelPrice95, t.fuelPrice98, t.fuelPriceDiesel],
          ...[t.elecHomeOffpeakKwh, t.elecHomePeakKwh, t.elecPublicKwh],
        ].map((price) => inRange(price, UNIT_PRICE_JOD)),
        sql` AND `,
      ),
    ),
    check("dealer_settings_featured_max", sql`cardinality(${t.featuredCarIds}) <= ${literal(FEATURED_CARS_MAX)}`),
    check("dealer_settings_sold_visible_days_range", inRange(t.soldVisibleDays, SOLD_VISIBLE_DAYS)),
  ],
);

// ENT-Car

export const car = pgTable(
  "car",
  {
    id: id(),
    dealerId: dealerReference(),
    demoSessionId: demoSessionReference("cascade"),
    seedKey: varchar("seed_key", { length: 40 }).unique(),
    seedOffsets: jsonb("seed_offsets").$type<SeedOffsets>(),
    copiedFromCarId: uuid("copied_from_car_id").references((): AnyPgColumn => car.id, { onDelete: "set null" }),
    // API-10's idempotency key: a retried create finds the draft it made
    clientDraftId: uuid("client_draft_id"),
    refCode: varchar("ref_code", { length: 10 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull(),
    status: carStatus("status").notNull().default("draft"),
    // The make, the model and the fields after them are required to publish, not to save a draft
    makeKey: varchar("make_key", { length: 40 }).references(() => make.key, { onDelete: "restrict" }),
    modelKey: varchar("model_key", { length: 60 }),
    trim: varchar("trim", { length: 60 }),
    modelYear: smallint("model_year"),
    bodyType: bodyType("body_type"),
    fuelType: fuelType("fuel_type"),
    transmission: transmission("transmission"),
    drivetrain: drivetrain("drivetrain"),
    engineCc: integer("engine_cc"),
    powerHp: smallint("power_hp"),
    seats: smallint("seats"),
    exteriorColorNameAr: varchar("exterior_color_name_ar", { length: 40 }),
    exteriorColorNameEn: varchar("exterior_color_name_en", { length: 40 }),
    exteriorColorHex: char("exterior_color_hex", { length: 7 }),
    paintFinish: paintFinish("paint_finish"),
    colorFamily: colorFamily("color_family"),
    interiorColorNameAr: varchar("interior_color_name_ar", { length: 40 }),
    interiorColorNameEn: varchar("interior_color_name_en", { length: 40 }),
    mileageKm: integer("mileage_km"),
    condition: carCondition("condition").notNull().default("used"),
    regionalSpecs: regionalSpecs("regional_specs"),
    customsStatus: customsStatus("customs_status"),
    licenseStatus: licenseStatus("license_status"),
    licenseExpiry: date("license_expiry"),
    insuranceType: insuranceType("insurance_type"),
    // Information only (C-04)
    paymentMethods: paymentMethod("payment_methods").array().notNull().default(["cash"]),
    ownersCount: smallint("owners_count"),
    warrantyUntil: date("warranty_until"),
    vin: char("vin", { length: 17 }),
    vinPublic: boolean("vin_public").notNull().default(false),
    priceJod: integer("price_jod"),
    descriptionAr: text("description_ar"),
    descriptionEn: text("description_en"),
    features: varchar("features", { length: 40 }).array().notNull().default([]),
    recommendedOctane: smallint("recommended_octane"),
    lengthMm: integer("length_mm"),
    wheelbaseMm: integer("wheelbase_mm"),
    consumptionLPer100km: numeric("consumption_l_per_100km", { precision: 4, scale: 1, mode: "number" }),
    consumptionKwhPer100km: numeric("consumption_kwh_per_100km", { precision: 4, scale: 1, mode: "number" }),
    consumptionSource: consumptionSource("consumption_source"),
    phevElectricSharePct: smallint("phev_electric_share_pct"),
    batterySohPct: smallint("battery_soh_pct"),
    batterySohSource: sohSource("battery_soh_source"),
    coverMediaId: mediaPointer("cover_media_id"),
    ogMediaId: mediaPointer("og_media_id"),
    blueprintMediaId: mediaPointer("blueprint_media_id"),
    platesConfirmed: boolean("plates_confirmed").notNull().default(false),
    publishedAt: timestamptz("published_at"),
    soldAt: timestamptz("sold_at"),
    archivedAt: timestamptz("archived_at"),
    createdBy: userPointer("created_by"),
    // Optimistic concurrency (FR-31)
    version: integer("version").notNull().default(1),
    // The last wizard step visited, where a draft resumes (FR-31.3)
    draftStep: smallint("draft_step"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("car_dealer_status_published_idx").on(t.dealerId, t.status, t.publishedAt.desc().nullsFirst()),
    index("car_dealer_price_idx").on(t.dealerId, t.priceJod),
    index("car_dealer_mileage_idx").on(t.dealerId, t.mileageKm),
    index("car_dealer_model_year_idx").on(t.dealerId, t.modelYear),
    index("car_dealer_make_model_idx").on(t.dealerId, t.makeKey, t.modelKey),
    index("car_features_idx").using("gin", t.features),
    index("car_demo_session_id_idx").on(t.demoSessionId),
    // A live row's code and slug are unique for its dealer. A session's copy keeps its original's
    // (BR-31), so the session's own keys leave live rows out
    uniqueIndex("car_live_ref_code_key")
      .on(t.dealerId, t.refCode)
      .where(sql`${t.demoSessionId} IS NULL`),
    uniqueIndex("car_live_slug_key")
      .on(t.dealerId, t.slug)
      .where(sql`${t.demoSessionId} IS NULL`),
    unique("car_demo_ref_code_key").on(t.demoSessionId, t.refCode),
    unique("car_demo_slug_key").on(t.demoSessionId, t.slug),
    unique("car_demo_copied_from_key").on(t.demoSessionId, t.copiedFromCarId),
    // The public reads (SRS §11.4): the live cars on show, and the sales inside the longest window
    index("car_public_published_idx")
      .on(t.dealerId, t.publishedAt.desc().nullsFirst())
      .where(sql`${t.status} IN ('published', 'reserved') AND ${t.demoSessionId} IS NULL`),
    index("car_public_sold_idx")
      .on(t.dealerId, t.soldAt)
      .where(sql`${t.status} = 'sold' AND ${t.demoSessionId} IS NULL`),
    uniqueIndex("car_live_client_draft_key")
      .on(t.dealerId, t.clientDraftId)
      .where(sql`${t.demoSessionId} IS NULL`),
    unique("car_demo_client_draft_key").on(t.demoSessionId, t.clientDraftId),
    // FR-36's warning when a VIN is already on another of the dealer's cars
    index("car_dealer_vin_idx")
      .on(t.dealerId, t.vin)
      .where(sql`${t.vin} IS NOT NULL`),
    // The 12-month purge of archived cars (SEC-09)
    index("car_archived_at_idx")
      .on(t.archivedAt)
      .where(sql`${t.status} = 'archived'`),
    index("car_copied_from_car_id_idx").on(t.copiedFromCarId),
    index("car_cover_media_id_idx").on(t.coverMediaId),
    index("car_og_media_id_idx").on(t.ogMediaId),
    index("car_blueprint_media_id_idx").on(t.blueprintMediaId),
    index("car_created_by_idx").on(t.createdBy),
    // The model belongs to the make. A model without a make would escape this key, so it is refused
    foreignKey({
      name: "car_model_fk",
      columns: [t.makeKey, t.modelKey],
      foreignColumns: [model.makeKey, model.key],
    }).onDelete("restrict"),
    check("car_model_needs_make", sql`${t.modelKey} IS NULL OR ${t.makeKey} IS NOT NULL`),
    // Seed cars are live rows, and a copy lives in a session
    check("car_seed_live", sql`${t.seedKey} IS NULL OR ${t.demoSessionId} IS NULL`),
    check("car_seed_offsets_seed_only", sql`${t.seedOffsets} IS NULL OR ${t.seedKey} IS NOT NULL`),
    check("car_copy_in_session", sql`${t.copiedFromCarId} IS NULL OR ${t.demoSessionId} IS NOT NULL`),
    check("car_ref_code_format", sql`${t.refCode} ~ '^[A-Z]{2}-[2-9A-HJKMNP-Z]{4}$'`),
    check("car_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    // The upper bound moves with the year, so Zod alone checks it (VR-02)
    check("car_model_year_min", sql`${t.modelYear} >= ${literal(MODEL_YEAR_MIN)}`),
    check("car_engine_cc_range", inRange(t.engineCc, ENGINE_CC)),
    check("car_power_hp_range", inRange(t.powerHp, POWER_HP)),
    check("car_seats_range", inRange(t.seats, SEATS)),
    check("car_exterior_color_hex_format", sql`${t.exteriorColorHex} ~ '^#[0-9a-f]{6}$'`),
    check("car_mileage_km_range", inRange(t.mileageKm, MILEAGE_KM)),
    check("car_license_expiry_month", sql`EXTRACT(DAY FROM ${t.licenseExpiry}) = 1`),
    check("car_owners_count_range", inRange(t.ownersCount, OWNERS_COUNT)),
    check("car_vin_format", sql`${t.vin} ~ '^[A-HJ-NPR-Z0-9]{17}$'`),
    check("car_price_jod_range", inRange(t.priceJod, PRICE_JOD)),
    check("car_description_ar_length", sql`char_length(${t.descriptionAr}) <= ${literal(DESCRIPTION_MAX_CHARS)}`),
    check("car_description_en_length", sql`char_length(${t.descriptionEn}) <= ${literal(DESCRIPTION_MAX_CHARS)}`),
    check("car_features_max", sql`cardinality(${t.features}) <= ${literal(FEATURES_MAX)}`),
    check("car_recommended_octane", sql`${t.recommendedOctane} IN (${sql.join(OCTANES.map(literal), sql`, `)})`),
    check("car_length_mm_range", inRange(t.lengthMm, LENGTH_MM)),
    check("car_wheelbase_mm_range", sql`${inRange(t.wheelbaseMm, WHEELBASE_MM)} AND ${t.wheelbaseMm} < ${t.lengthMm}`),
    check("car_consumption_l_range", inRange(t.consumptionLPer100km, LITRES_PER_100KM)),
    check("car_consumption_kwh_range", inRange(t.consumptionKwhPer100km, KWH_PER_100KM)),
    check("car_phev_electric_share_range", inRange(t.phevElectricSharePct, PERCENT)),
    check("car_battery_soh_range", inRange(t.batterySohPct, PERCENT)),
    check("car_battery_soh_source", sql`${t.batterySohPct} IS NULL OR ${t.batterySohSource} IS NOT NULL`),
    // Each status after a draft has the time it was reached (BR-04)
    check(
      "car_published_at_set",
      sql`${t.status} NOT IN ('published', 'reserved', 'sold') OR ${t.publishedAt} IS NOT NULL`,
    ),
    check("car_sold_at_set", sql`${t.status} <> 'sold' OR ${t.soldAt} IS NOT NULL`),
    check("car_archived_at_set", sql`${t.status} <> 'archived' OR ${t.archivedAt} IS NOT NULL`),
    check("car_version_min", sql`${t.version} >= 1`),
    check("car_draft_step_range", sql`${t.draftStep} BETWEEN 1 AND 10`),
  ],
);

// ENT-Media. A row starts pending at the upload token (API-16) and API-17 fills it in and marks it
// ready, so the file's own fields are null until then.

export const media = pgTable(
  "media",
  {
    id: id(),
    dealerId: dealerReference(),
    // Null for a logo
    carId: uuid("car_id").references((): AnyPgColumn => car.id, { onDelete: "restrict" }),
    demoSessionId: demoSessionReference("restrict"),
    kind: mediaKind("kind").notNull(),
    // Photos only, so no default: the app sets exterior on a new photo
    photoGroup: photoGroup("photo_group"),
    sortOrder: integer("sort_order").notNull().default(0),
    altAr: varchar("alt_ar", { length: 200 }),
    altEn: varchar("alt_en", { length: 200 }),
    // The largest variant's
    width: integer("width"),
    height: integer("height"),
    dominantColor: char("dominant_color", { length: 7 }),
    // A thumbhash in base64
    placeholder: varchar("placeholder", { length: 64 }),
    variants: jsonb("variants").$type<MediaVariants>(),
    mime: varchar("mime", { length: 40 }),
    // The variants' total
    bytes: integer("bytes"),
    durationMs: integer("duration_ms"),
    peaks: jsonb("peaks").$type<Peaks>(),
    audioClipType: audioClipType("audio_clip_type"),
    audioSource: audioSource("audio_source"),
    // The audio's text alternative
    descriptionAr: varchar("description_ar", { length: 300 }),
    descriptionEn: varchar("description_en", { length: 300 }),
    recordedAt: timestamptz("recorded_at"),
    storagePrefix: varchar("storage_prefix", { length: 200 }).notNull(),
    // The undo window; the cleanup job purges the row 24 hours later (SEC-09)
    deletedAt: timestamptz("deleted_at"),
    status: mediaStatus("status").notNull().default("pending"),
    // API-17's idempotency key
    clientUploadId: uuid("client_upload_id").notNull(),
    // The pathname API-16 computed for each variant; registration accepts only these
    expectedPaths: jsonb("expected_paths").$type<ExpectedPaths>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("media_car_kind_sort_idx").on(t.carId, t.kind, t.sortOrder),
    index("media_demo_session_id_idx").on(t.demoSessionId),
    // API-27's sweep of pending uploads
    index("media_status_created_idx").on(t.status, t.createdAt),
    index("media_deleted_at_idx")
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} IS NOT NULL`),
    // API-17's idempotency key, kept apart for the live rows and each session's, as car's keys are:
    // a live upload's id is in its public URL, so a session may send it again
    uniqueIndex("media_live_client_upload_key")
      .on(t.dealerId, t.clientUploadId)
      .where(sql`${t.demoSessionId} IS NULL`),
    unique("media_demo_client_upload_key").on(t.demoSessionId, t.clientUploadId),
    check("media_car_unless_logo", sql`(${t.kind} = 'logo') = (${t.carId} IS NULL)`),
    check("media_photo_group_photos_only", sql`${t.photoGroup} IS NULL OR ${t.kind} = 'photo'`),
    check("media_sort_order_min", sql`${t.sortOrder} >= 0`),
    check("media_size_positive", sql`${t.width} > 0 AND ${t.height} > 0`),
    check("media_dominant_color_format", sql`${t.dominantColor} ~ '^#[0-9a-f]{6}$'`),
    // SEC-08's allow-list
    check("media_mime_allowed", sql`${t.mime} IN (${literals(Object.values(MEDIA_TYPES))})`),
    check("media_bytes_positive", sql`${t.bytes} > 0`),
    check("media_duration_ms_range", inRange(t.durationMs, AUDIO_DURATION_MS)),
    check(
      "media_peaks_shape",
      sql`CASE WHEN jsonb_typeof(${t.peaks}) = 'array' THEN jsonb_array_length(${t.peaks}) = ${literal(PEAKS_COUNT)} ELSE ${t.peaks} IS NULL END`,
    ),
    check(
      "media_audio_fields",
      sql`${t.kind} = 'engine_audio' OR (${t.audioSource} IS NULL AND ${t.audioClipType} IS NULL)`,
    ),
    check(
      "media_ready_registered",
      sql`${t.status} = 'pending' OR (${t.variants} IS NOT NULL AND ${t.mime} IS NOT NULL AND ${t.bytes} IS NOT NULL)`,
    ),
    check(
      "media_ready_photo_group",
      sql`${t.kind} <> 'photo' OR ${t.status} = 'pending' OR ${t.photoGroup} IS NOT NULL`,
    ),
    // A ready image has its size, so a page lays it out before it loads
    check(
      "media_ready_size",
      sql`${t.kind} NOT IN (${literals(IMAGE_KINDS)}) OR ${t.status} = 'pending' OR (${t.width} IS NOT NULL AND ${t.height} IS NOT NULL)`,
    ),
    check(
      "media_ready_audio",
      sql`${t.kind} <> 'engine_audio' OR ${t.status} = 'pending' OR (${t.audioSource} IS NOT NULL AND ${t.audioClipType} IS NOT NULL)`,
    ),
  ],
);

// ENT-Inspection and ENT-InspectionPanel: a car has no inspection or one, made with its 13 panels

export const inspection = pgTable(
  "inspection",
  {
    id: id(),
    carId: uuid("car_id")
      .notNull()
      .unique()
      .references(() => car.id, { onDelete: "cascade" }),
    inspectedOn: date("inspected_on"),
    testCenterName: varchar("test_center_name", { length: 80 }),
    reportMediaId: mediaPointer("report_media_id"),
    chassisState: mechState("chassis_state").notNull().default("unknown"),
    engineState: mechState("engine_state").notNull().default("unknown"),
    gearboxState: mechState("gearbox_state").notNull().default("unknown"),
    chassisNoteAr: varchar("chassis_note_ar", { length: 200 }),
    chassisNoteEn: varchar("chassis_note_en", { length: 200 }),
    engineNoteAr: varchar("engine_note_ar", { length: 200 }),
    engineNoteEn: varchar("engine_note_en", { length: 200 }),
    gearboxNoteAr: varchar("gearbox_note_ar", { length: 200 }),
    gearboxNoteEn: varchar("gearbox_note_en", { length: 200 }),
    updatedBy: userPointer("updated_by"),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("inspection_report_media_id_idx").on(t.reportMediaId),
    index("inspection_updated_by_idx").on(t.updatedBy),
  ],
);

export const inspectionPanel = pgTable(
  "inspection_panel",
  {
    id: id(),
    inspectionId: uuid("inspection_id")
      .notNull()
      .references(() => inspection.id, { onDelete: "cascade" }),
    panelId: panelId("panel_id").notNull(),
    state: panelState("state").notNull().default("unknown"),
    // Null for a plastic panel
    microns: smallint("microns"),
    noteAr: varchar("note_ar", { length: 200 }),
    noteEn: varchar("note_en", { length: 200 }),
    closeupMediaId: mediaPointer("closeup_media_id"),
  },
  (t) => [
    unique("inspection_panel_key").on(t.inspectionId, t.panelId),
    index("inspection_panel_closeup_media_id_idx").on(t.closeupMediaId),
    check("inspection_panel_microns_range", inRange(t.microns, MICRONS)),
  ],
);

// ENT-SpinSet, ENT-SpinFrame and ENT-SpinHotspot: a car has no 360° spin or one (BR-17, BR-18)

export const spinSet = pgTable(
  "spin_set",
  {
    id: id(),
    carId: uuid("car_id")
      .notNull()
      .unique()
      .references(() => car.id, { onDelete: "cascade" }),
    frameCount: smallint("frame_count").notNull(),
    direction: spinDirection("direction").notNull().default("cw"),
    crop: jsonb("crop").$type<SpinCrop>().notNull().default({ x: 0, y: 0, w: 1, h: 1 }),
    posterFrame: smallint("poster_frame").notNull().default(0),
    status: spinStatus("status").notNull().default("processing"),
  },
  (t) => [
    check("spin_set_frame_count_range", inRange(t.frameCount, SPIN_FRAMES)),
    check(
      "spin_set_poster_frame_range",
      sql`${t.posterFrame} >= ${literal(FRAME_INDEX.min)} AND ${t.posterFrame} < ${t.frameCount}`,
    ),
  ],
);

export const spinFrame = pgTable(
  "spin_frame",
  {
    spinSetId: uuid("spin_set_id")
      .notNull()
      .references(() => spinSet.id, { onDelete: "cascade" }),
    index: smallint("index").notNull(),
    // A purged frame image takes its frame row along
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.spinSetId, t.index] }),
    index("spin_frame_media_id_idx").on(t.mediaId),
    // Below the set's own frame count, which the app checks
    check("spin_frame_index_range", inRange(t.index, FRAME_INDEX)),
  ],
);

export const spinHotspot = pgTable(
  "spin_hotspot",
  {
    id: id(),
    spinSetId: uuid("spin_set_id")
      .notNull()
      .references(() => spinSet.id, { onDelete: "cascade" }),
    keyFrame: smallint("key_frame").notNull(),
    // Fractions of the frame
    x: numeric("x", { precision: 5, scale: 4, mode: "number" }).notNull(),
    y: numeric("y", { precision: 5, scale: 4, mode: "number" }).notNull(),
    // Frames on each side of the key frame where the hotspot shows
    window: smallint("window").notNull().default(3),
    noteAr: varchar("note_ar", { length: 160 }),
    noteEn: varchar("note_en", { length: 160 }),
    closeupMediaId: mediaPointer("closeup_media_id"),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  (t) => [
    index("spin_hotspot_set_sort_idx").on(t.spinSetId, t.sortOrder),
    index("spin_hotspot_closeup_media_id_idx").on(t.closeupMediaId),
    check("spin_hotspot_key_frame_range", inRange(t.keyFrame, FRAME_INDEX)),
    check("spin_hotspot_position_range", sql`${inRange(t.x, FRACTION)} AND ${inRange(t.y, FRACTION)}`),
    check("spin_hotspot_window_range", inRange(t.window, HOTSPOT_WINDOW)),
    check("spin_hotspot_note_present", sql`${t.noteAr} IS NOT NULL OR ${t.noteEn} IS NOT NULL`),
  ],
);

// ENT-Place: the presets every dealer shares, and a dealer's own places (FR-40), which may have
// only a name

export const place = pgTable(
  "place",
  {
    id: id(),
    key: varchar("key", { length: 60 }).unique(),
    nameAr: varchar("name_ar", { length: 80 }).notNull(),
    nameEn: varchar("name_en", { length: 80 }).notNull(),
    countryCode: char("country_code", { length: 2 }),
    lat: coordinate("lat"),
    lng: coordinate("lng"),
    kind: placeKind("kind"),
    isPreset: boolean("is_preset").notNull().default(false),
    dealerId: uuid("dealer_id").references(() => dealer.id, { onDelete: "restrict" }),
    demoSessionId: demoSessionReference("cascade"),
  },
  (t) => [
    index("place_dealer_demo_idx").on(t.dealerId, t.demoSessionId),
    index("place_demo_session_id_idx").on(t.demoSessionId),
    // A preset belongs to no dealer and no session; every other place belongs to a dealer
    check(
      "place_owner",
      sql`${t.isPreset} = (${t.dealerId} IS NULL) AND NOT (${t.isPreset} AND ${t.demoSessionId} IS NOT NULL)`,
    ),
    // Every preset has a key and is on the map (TC-17-5)
    check(
      "place_preset_complete",
      sql`NOT ${t.isPreset} OR (${t.key} IS NOT NULL AND ${t.countryCode} IS NOT NULL AND ${t.lat} IS NOT NULL AND ${t.kind} IS NOT NULL)`,
    ),
    check("place_key_format", sql`${t.key} ~ '^[a-z0-9_]+$'`),
    check("place_country_code_format", sql`${t.countryCode} ~ '^[A-Z]{2}$'`),
    coordinatesCheck("place_coordinates", t.lat, t.lng),
  ],
);

// ENT-JourneyMilestone: up to 10 per car, in order (BR-10)

export const journeyMilestone = pgTable(
  "journey_milestone",
  {
    id: id(),
    carId: uuid("car_id")
      .notNull()
      .references(() => car.id, { onDelete: "cascade" }),
    sortOrder: smallint("sort_order").notNull(),
    type: milestoneType("type").notNull(),
    placeId: uuid("place_id").references(() => place.id, { onDelete: "set null" }),
    occurredMonth: date("occurred_month"),
    noteAr: varchar("note_ar", { length: 240 }),
    noteEn: varchar("note_en", { length: 240 }),
    auctionHouse: varchar("auction_house", { length: 60 }),
    titleBrand: titleBrand("title_brand"),
    damageNoteAr: varchar("damage_note_ar", { length: 240 }),
    damageNoteEn: varchar("damage_note_en", { length: 240 }),
  },
  (t) => [
    unique("journey_milestone_key").on(t.carId, t.sortOrder),
    index("journey_milestone_place_id_idx").on(t.placeId),
    check("journey_milestone_sort_order_range", inRange(t.sortOrder, { min: 0, max: MILESTONES_MAX - 1 })),
    check("journey_milestone_month", sql`EXTRACT(DAY FROM ${t.occurredMonth}) = 1`),
    check("journey_milestone_auction_title", sql`${t.type} <> 'auction' OR ${t.titleBrand} IS NOT NULL`),
  ],
);

// ENT-CarSlugHistory: a published car's earlier slugs, each redirecting to the car (BR-16)

export const carSlugHistory = pgTable(
  "car_slug_history",
  {
    carId: uuid("car_id")
      .notNull()
      .references(() => car.id, { onDelete: "cascade" }),
    dealerId: dealerReference(),
    demoSessionId: demoSessionReference("cascade"),
    slug: varchar("slug", { length: 160 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.carId, t.slug] }),
    uniqueIndex("car_slug_history_live_key")
      .on(t.dealerId, t.slug)
      .where(sql`${t.demoSessionId} IS NULL`),
    unique("car_slug_history_demo_key").on(t.demoSessionId, t.slug),
  ],
);

// ENT-PriceChange: BR-05 reads a car's latest change

export const priceChange = pgTable(
  "price_change",
  {
    id: id(),
    carId: uuid("car_id")
      .notNull()
      .references(() => car.id, { onDelete: "cascade" }),
    oldPriceJod: integer("old_price_jod").notNull(),
    newPriceJod: integer("new_price_jod").notNull(),
    changedAt: timestamptz("changed_at").notNull().defaultNow(),
    changedBy: userPointer("changed_by"),
  },
  (t) => [
    index("price_change_car_changed_idx").on(t.carId, t.changedAt.desc().nullsFirst()),
    index("price_change_changed_by_idx").on(t.changedBy),
    check(
      "price_change_prices_range",
      sql`${inRange(t.oldPriceJod, PRICE_JOD)} AND ${inRange(t.newPriceJod, PRICE_JOD)}`,
    ),
    check("price_change_changed", sql`${t.newPriceJod} <> ${t.oldPriceJod}`),
  ],
);

// ENT-Make, ENT-Model and ENT-ModelAlias: reference data every dealer shares (SRS §6.4)

export const make = pgTable(
  "make",
  {
    key: varchar("key", { length: 40 }).primaryKey(),
    nameEn: varchar("name_en", { length: 40 }).notNull(),
    nameAr: varchar("name_ar", { length: 40 }).notNull(),
  },
  (t) => [check("make_key_format", sql`${t.key} ~ '^[a-z0-9-]+$'`)],
);

export const model = pgTable(
  "model",
  {
    key: varchar("key", { length: 60 }).primaryKey(),
    makeKey: varchar("make_key", { length: 40 })
      .notNull()
      .references(() => make.key, { onDelete: "restrict" }),
    nameEn: varchar("name_en", { length: 60 }).notNull(),
    nameAr: varchar("name_ar", { length: 60 }).notNull(),
    defaultBodyType: bodyType("default_body_type"),
  },
  (t) => [
    // What car_model_fk refers to
    unique("model_make_key").on(t.makeKey, t.key),
    check("model_key_format", sql`${t.key} ~ '^[a-z0-9-]+$'`),
  ],
);

export const modelAlias = pgTable(
  "model_alias",
  {
    id: id(),
    modelKey: varchar("model_key", { length: 60 })
      .notNull()
      .references(() => model.key, { onDelete: "cascade" }),
    // Stored as normalizeSearch folds it (FR-08.3)
    alias: varchar("alias", { length: 60 }).notNull(),
  },
  (t) => [unique("model_alias_key").on(t.modelKey, t.alias), index("model_alias_alias_idx").on(t.alias)],
);

// ENT-EventDaily: daily counts and nothing else, ever (FR-47.2). No dealer column either, an
// exception to NFR-SCALE-03 recorded in D-043.

export const eventDaily = pgTable(
  "event_daily",
  {
    day: date("day").notNull(),
    event: eventName("event").notNull(),
    // The nil UUID for an event about no car, so no foreign key
    carId: uuid("car_id").notNull(),
    locale: locale("locale").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.event, t.carId, t.locale] }),
    check("event_daily_count_min", sql`${t.count} >= 0`),
  ],
);

// ENT-VinDecodeCache: vPIC's answer, the mapped fields only, kept 30 days (SEC-09)

export const vinDecodeCache = pgTable(
  "vin_decode_cache",
  {
    vin: char("vin", { length: 17 }).primaryKey(),
    payload: jsonb("payload").$type<VinDecodePayload>().notNull(),
    fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
  },
  (t) => [
    index("vin_decode_cache_fetched_at_idx").on(t.fetchedAt),
    check("vin_decode_cache_vin_format", sql`${t.vin} ~ '^[A-HJ-NPR-Z0-9]{17}$'`),
  ],
);

// ENT-AuditLog, kept 365 days (SEC-09). Its rows are written in the action's own transaction.

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    dealerId: dealerReference(),
    // No foreign keys: the rows keep a removed member's id (FR-44.6) and an expired session's
    actorUserId: uuid("actor_user_id"),
    actorDemoSessionId: varchar("actor_demo_session_id", { length: 32 }),
    action: varchar("action", { length: 60 }).notNull(),
    // A job's rows have no target
    targetType: varchar("target_type", { length: 30 }),
    targetId: uuid("target_id"),
    // No secrets, and no personal data beyond the user id
    meta: jsonb("meta").$type<AuditMeta>().notNull().default({}),
    at: timestamptz("at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_at_idx").on(t.at),
    // API-28's last success of each job, and FR-35.7's notice of a changed number
    index("audit_log_action_at_idx").on(t.action, t.at.desc().nullsFirst()),
    index("audit_log_dealer_action_at_idx").on(t.dealerId, t.action, t.at.desc().nullsFirst()),
    check("audit_log_one_actor", sql`${t.actorUserId} IS NULL OR ${t.actorDemoSessionId} IS NULL`),
  ],
);

// ENT-RateLimit (SEC-12). One row per limited subject, keyed by its HMAC, never a raw address or email:
// the key's check holds it to key.ts's form, so a raw key, such as the auth library's own, can't go in

export const rateLimit = pgTable(
  "rate_limit",
  {
    key: varchar("key", { length: 80 }).primaryKey(),
    windowStart: timestamptz("window_start").notNull().defaultNow(),
    count: integer("count").notNull().default(1),
    // A BR-42 lock holds until then, whatever the window
    blockedUntil: timestamptz("blocked_until"),
  },
  (t) => [
    index("rate_limit_window_start_idx").on(t.windowStart),
    check("rate_limit_key_format", sql`${t.key} ~ '^[A-Za-z0-9_-]{43}$'`),
    check("rate_limit_count_min", sql`${t.count} >= 0`),
  ],
);

// ENT-BlobLedger: the month's storage writes on the Hobby demo (BR-46)

export const blobLedger = pgTable(
  "blob_ledger",
  {
    // YYYY-MM in UTC
    month: char("month", { length: 7 }).primaryKey(),
    advancedOps: integer("advanced_ops").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("blob_ledger_month_format", sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("blob_ledger_advanced_ops_min", sql`${t.advancedOps} >= 0`),
  ],
);
