// Each seed car's tier (05-SEED-DATA §4.1): how many photos it shows, and how full its inspection
// is. No column holds a tier, so the demo's sample analytics (T-30) and the seed's photo check
// (T-18) read it here. Import-free, so the seed scripts can load it.

/** A seed car's tier: A and B have a complete inspection and a journey, C a partial inspection or none */
export type SeedTier = "A" | "B" | "C";

/** Each seed car's tier, by seed key, in record order */
export const SEED_TIERS: Readonly<Record<string, SeedTier>> = {
  s01: "A",
  s02: "A",
  s03: "B",
  s04: "A",
  s05: "B",
  s06: "C",
  s07: "B",
  s08: "B",
  s09: "B",
  s10: "B",
  s11: "B",
  s12: "B",
  s13: "B",
  s14: "B",
  s15: "A",
  s16: "B",
  s17: "B",
  s18: "B",
  s19: "B",
  s20: "C",
  s21: "B",
  s22: "B",
  s23: "C",
  s24: "C",
  s25: "A",
  s26: "B",
  s27: "C",
  s28: "C",
  s29: "C",
};
