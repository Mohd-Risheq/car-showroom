// The advisory lock every writer of the seed's rows takes first, so no two interleave: the seed
// (scripts/seed.ts) and T-35's nightly re-anchor (05-SEED-DATA §9.2), which runs in the app and so
// takes the key from here. It imports nothing, so the scripts load it under plain Node.

export const SEED_LOCK_KEY = 917_017;
