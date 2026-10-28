import { cryptoBytes, drawSymbols, type RandomBytes } from "../random-symbols.ts";

// BR-40's temporary password: 16 random characters from a set of 56 that leaves out the ones read
// as others (0 and O, 1, I and l, and o). The first sign-in replaces it with one the person chooses,
// which VR-30 then checks. scripts/create-owner.ts draws the owner's first password with it, so the
// module imports nothing but src/lib/random-symbols.ts, by its .ts path, and loads under plain Node.

export const TEMPORARY_SYMBOLS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const LENGTH = 16;

export function drawTemporaryPassword(randomBytes: RandomBytes = cryptoBytes): string {
  return drawSymbols(TEMPORARY_SYMBOLS, LENGTH, randomBytes);
}
