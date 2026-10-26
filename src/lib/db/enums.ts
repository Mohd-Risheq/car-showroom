// The Postgres enums of SRS §6.3, each a tuple in its declared order, which is also its sort order in
// Postgres. The schema builds each pgEnum from its tuple and the Zod schemas build z.enum from the
// same one, so the two can't drift. user_role, locale and media_kind keep the tuples of their own
// modules (auth/roles.ts, i18n/locales.ts, storage/rules.ts). Import-free, so drizzle-kit, the seed
// scripts and the browser can all load it.

export const CAR_STATUSES = ["draft", "published", "reserved", "sold", "archived"] as const;
export type CarStatus = (typeof CAR_STATUSES)[number];
export const BODY_TYPES = ["suv", "sedan", "hatchback", "pickup", "coupe", "convertible", "van", "truck"] as const;
export type BodyType = (typeof BODY_TYPES)[number];
export const FUEL_TYPES = ["gasoline", "diesel", "electric", "hybrid", "mild_hybrid", "plugin_hybrid"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];
export const TRANSMISSIONS = ["automatic", "manual"] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];
export const DRIVETRAINS = ["fwd", "rwd", "awd", "four_wd"] as const;
export type Drivetrain = (typeof DRIVETRAINS)[number];
export const REGIONAL_SPECS = [
  "american",
  "european",
  "gcc",
  "chinese",
  "korean",
  "japanese",
  "agency",
  "other",
] as const;
export type RegionalSpecs = (typeof REGIONAL_SPECS)[number];
export const CUSTOMS_STATUSES = ["cleared", "not_cleared"] as const;
export type CustomsStatus = (typeof CUSTOMS_STATUSES)[number];
export const LICENSE_STATUSES = ["licensed", "unlicensed"] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];
export const INSURANCE_TYPES = ["comprehensive", "compulsory", "none"] as const;
export type InsuranceType = (typeof INSURANCE_TYPES)[number];
export const PAYMENT_METHODS = ["cash", "instalments"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const CAR_CONDITIONS = ["used", "new"] as const;
export type CarCondition = (typeof CAR_CONDITIONS)[number];
export const PAINT_FINISHES = ["solid", "metallic", "pearl", "matte"] as const;
export type PaintFinish = (typeof PAINT_FINISHES)[number];
export const COLOR_FAMILIES = [
  ...["white", "black", "silver", "gray", "blue", "red", "green"],
  ...["beige", "brown", "gold", "orange", "yellow", "other"],
] as const;
export type ColorFamily = (typeof COLOR_FAMILIES)[number];
export const PHOTO_GROUPS = ["exterior", "interior", "engine", "imperfection"] as const;
export type PhotoGroup = (typeof PHOTO_GROUPS)[number];

// The 13 panels of FR-13
export const PANEL_IDS = [
  ...["front_bumper", "hood", "roof", "trunk", "rear_bumper"],
  ...["fender_front_left", "fender_front_right", "door_front_left", "door_front_right"],
  ...["door_rear_left", "door_rear_right", "quarter_rear_left", "quarter_rear_right"],
] as const;
export type PanelId = (typeof PANEL_IDS)[number];
export const PANEL_STATES = ["original", "touch_up", "repainted", "replaced", "unknown"] as const;
export type PanelState = (typeof PANEL_STATES)[number];
export const MECH_STATES = ["sound", "notes", "issue", "unknown"] as const;
export type MechState = (typeof MECH_STATES)[number];

// The milestones of FR-17
export const MILESTONE_TYPES = [
  ...["built", "first_sold", "auction", "shipped", "arrived_port"],
  ...["free_zone", "customs_cleared", "inspected", "in_showroom"],
] as const;
export type MilestoneType = (typeof MILESTONE_TYPES)[number];
export const TITLE_BRANDS = ["clean", "salvage", "rebuilt", "flood", "hail", "other", "unknown"] as const;
export const AUDIO_CLIP_TYPES = ["cold_start", "idle", "rev"] as const;
export const AUDIO_SOURCES = ["this_car", "same_engine"] as const;
export type AudioSource = (typeof AUDIO_SOURCES)[number];
export const SPIN_DIRECTIONS = ["cw", "ccw"] as const;
// ENT-SpinSet's status, which no screen labels, like media's (SRS §6.3, scripts/checks/messages.ts)
export const SPIN_STATUSES = ["processing", "ready"] as const;
export const PLACE_KINDS = ["port", "city", "free_zone", "auction_yard", "plant", "region"] as const;
export const MEDIA_STATUSES = ["pending", "ready"] as const;
export const ACCENT_PRESETS = ["scan_cyan", "electric_blue", "mint", "ivory", "violet"] as const;
export type AccentPreset = (typeof ACCENT_PRESETS)[number];
export const CONSUMPTION_SOURCES = ["dealer", "epa"] as const;
export const SOH_SOURCES = ["diagnostic_scan", "service_report", "car_display"] as const;
export type SohSource = (typeof SOH_SOURCES)[number];

// API-03's allowed events, in its order
export const EVENT_NAMES = [
  ...["page_home", "page_inventory", "car_view"],
  ...["sig_body_scan", "sig_sound_play", "sig_spin", "sig_journey", "sig_cost", "race_run"],
  ...["contact_whatsapp", "contact_call", "contact_viewing"],
  ...["share_family", "share_native", "window_scan"],
  ...["garage_save", "compare_add"],
  ...["demo_dealer_entered", "car_published", "share_kit_generate", "reel_generated"],
  "client_error",
] as const;
