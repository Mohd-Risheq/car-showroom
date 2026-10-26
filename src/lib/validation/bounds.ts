// The numbers of SRS §7.1's rules and of §6's columns that a column check states as well (D-043), a
// range's bounds, a count or a list of values: each Zod field and its check in lib/db/schema.ts read
// them here, so the two can't drift apart.
// Nothing is imported, so the schema reads them without the validation they serve.

/** The least and the most a value may be, both allowed */
export type Range = { readonly min: number; readonly max: number };

// VR-01: a car's price and both prices of a price change, in whole dinars
export const PRICE_JOD = { min: 300, max: 1_000_000 } as const;

// VR-02's first model year; the last is next year in Amman
export const MODEL_YEAR_MIN = 1990;

// VR-03
export const MILEAGE_KM = { min: 0, max: 1_500_000 } as const;

// VR-07: each language's description, in characters
export const DESCRIPTION_MAX_CHARS = 3000;

// VR-08
export const FEATURES_MAX = 80;

// VR-10
export const LITRES_PER_100KM = { min: 1, max: 40 } as const;

// VR-11
export const KWH_PER_100KM = { min: 5, max: 60 } as const;

// VR-12: a paint reading
export const MICRONS = { min: 0, max: 2000 } as const;

// VR-13: battery health and a plug-in hybrid's electric share
export const PERCENT = { min: 0, max: 100 } as const;

// VR-14: a car's milestones
export const MILESTONES_MAX = 10;

// VR-16: an engine clip's length, in milliseconds
export const AUDIO_DURATION_MS = { min: 5000, max: 30_000 } as const;

// VR-17: a spin's frames, and a frame's number, from 0 to one below the most frames a set may have
export const SPIN_FRAMES = { min: 24, max: 72 } as const;
export const FRAME_INDEX = { min: 0, max: SPIN_FRAMES.max - 1 } as const;

// VR-21: each language's brand name, in characters
export const BRAND_NAME_CHARS = { min: 2, max: 60 } as const;

// VR-23
export const LATITUDE = { min: -90, max: 90 } as const;
export const LONGITUDE = { min: -180, max: 180 } as const;

// VR-25: a fuel or electricity price, in dinars
export const UNIT_PRICE_JOD = { min: 0.05, max: 5 } as const;

// VR-28
export const FEATURED_CARS_MAX = 8;

// VR-31
export const LENGTH_MM = { min: 2500, max: 6500 } as const;
export const WHEELBASE_MM = { min: 1800, max: 4200 } as const;

// VR-32: each language's story, in characters
export const STORY_MAX_CHARS = 1000;

// ENT-Car's own ranges, and the octanes a car may recommend, each with its fuel price (BR-11)
export const ENGINE_CC = { min: 0, max: 10_000 } as const;
export const POWER_HP = { min: 30, max: 2000 } as const;
export const SEATS = { min: 2, max: 15 } as const;
export const OWNERS_COUNT = { min: 1, max: 20 } as const;
export const OCTANES = [90, 95, 98] as const;

// ENT-Media: an engine clip's peaks (BR-19)
export const PEAKS_COUNT = 200;

// ENT-SpinHotspot: a hotspot's place on its key frame, as a fraction of the frame's width or height
// as every place on an image is, and the frames either side of its key frame that it shows on
export const FRACTION = { min: 0, max: 1 } as const;
export const HOTSPOT_WINDOW = { min: 0, max: 12 } as const;

// ENT-DealerSettings: the days a sold car stays public (BR-04), the longest of which the index
// reads every dealer's sales for
export const SOLD_VISIBLE_DAYS = { min: 0, max: 60 } as const;
