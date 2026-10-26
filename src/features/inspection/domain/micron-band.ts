import type { MicronBand } from "@/lib/db/public-dto";
import type { MicronBands } from "@/lib/validation/settings";

// BR-08: a paint reading's advisory band, by the dealer's bands. The dealer's declared state stays
// authoritative; buyers see the reading and its band.

export function micronBand(microns: number, bands: MicronBands): MicronBand {
  if (microns <= bands.factoryMax) return "factory";
  return microns <= bands.refinishMax ? "refinish" : "filler";
}
