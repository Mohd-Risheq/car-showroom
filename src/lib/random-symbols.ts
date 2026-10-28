// Random symbols from an alphabet, each equally likely: BR-15's reference codes and BR-40's
// temporary passwords are drawn with it. It has no imports, so the seed scripts load it under
// plain Node.

export type RandomBytes = (count: number) => Uint8Array;

export const cryptoBytes: RandomBytes = (count) => crypto.getRandomValues(new Uint8Array(count));

// Sixteen rounds without enough usable bytes only happen when the source is broken
const MAX_ROUNDS = 16;

/**
 * `count` symbols of the alphabet, from the bytes of `randomBytes`, which is cryptoBytes outside
 * tests. A byte below the largest multiple of the alphabet's length up to 256, the number of byte
 * values, maps onto the symbols evenly; a byte from there up, which would favour the first symbols,
 * is drawn again.
 */
export function drawSymbols(alphabet: string, count: number, randomBytes: RandomBytes): string {
  if (alphabet.length < 1 || alphabet.length > 256) {
    throw new RangeError(`An alphabet takes 1 to 256 symbols, not ${alphabet.length}`);
  }
  const evenBelow = 256 - (256 % alphabet.length);
  let symbols = "";
  for (let round = 0; round < MAX_ROUNDS && symbols.length < count; round += 1) {
    for (const byte of randomBytes(count - symbols.length)) {
      if (byte < evenBelow) symbols += alphabet.charAt(byte % alphabet.length);
    }
  }
  if (symbols.length < count) throw new Error("The random source gave too few usable bytes");
  return symbols;
}
