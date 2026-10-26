import { normalizeDigits } from "../../../lib/i18n/normalize.ts";

// BR-15: a car's reference code is the dealer's two-letter prefix (dealer.ref_prefix), a hyphen and
// four symbols, chosen so none can be read as another. BR-33 matches a typed code whatever its case.
// It imports other modules by their relative .ts paths, so the seed scripts can load it, and the
// slug module, under plain Node.

/** BR-15's symbols: the digits and capitals without 0, O, 1, I and L */
export const REF_SYMBOLS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const SYMBOL_COUNT = 4;
const PREFIX = /^[A-Z]{2}$/;
// The database's car_ref_code_format
const REF_CODE = /^[A-Z]{2}-[2-9A-HJKMNP-Z]{4}$/;

// 248 is 8 × 31: a byte below it maps onto the 31 symbols evenly, and a byte from 248 up, which
// would favour the first eight, is drawn again. Sixteen rounds without a usable byte only happen
// when the source is broken.
const EVEN_BELOW = 256 - (256 % REF_SYMBOLS.length);
const MAX_ROUNDS = 16;
// A collision takes one code in 923,521 per car already listed, so eight in a row never happen
// at a dealer's scale
const CLAIM_ATTEMPTS = 8;

export type RandomBytes = (count: number) => Uint8Array;

const cryptoBytes: RandomBytes = (count) => crypto.getRandomValues(new Uint8Array(count));

/** A new code with the dealer's prefix. Whether another car has it is the caller's question. */
export function drawRefCode(prefix: string, randomBytes: RandomBytes = cryptoBytes): string {
  if (!PREFIX.test(prefix)) throw new RangeError(`Not a reference prefix: ${JSON.stringify(prefix)}`);
  let symbols = "";
  for (let round = 0; round < MAX_ROUNDS && symbols.length < SYMBOL_COUNT; round += 1) {
    for (const byte of randomBytes(SYMBOL_COUNT - symbols.length)) {
      if (byte < EVEN_BELOW) symbols += REF_SYMBOLS.charAt(byte % REF_SYMBOLS.length);
    }
  }
  if (symbols.length < SYMBOL_COUNT) throw new Error("The random source gave no usable bytes");
  return `${prefix}-${symbols}`;
}

/**
 * Draws codes until `claim` takes one: it resolves to the row it made (the inserted car, say), which
 * carries the code, when the code was free, or to undefined when another car has it. So a claim
 * can't resolve to nothing, a list, or a driver's own result, which is never undefined. BR-15
 * checks a demo-created car against the live cars too, which the claim does, since no unique index
 * spans both.
 *
 * The claim resolves to undefined only when the code itself is taken, and never raises on a taken
 * code: its insert skips a conflict on the code's own unique key alone, the live (dealer_id,
 * ref_code) key for a live car or the session's (demo_session_id, ref_code) key for a demo car. Any
 * other conflict still raises, such as a repeated clientDraftId, which the caller looks up before
 * claiming. A unique violation raised inside the caller's transaction would abort it, and every
 * later draw would fail.
 */
export async function claimRefCode<Result extends { readonly refCode: string }>(
  prefix: string,
  claim: (refCode: string) => Promise<Result | undefined>,
  { randomBytes = cryptoBytes }: { randomBytes?: RandomBytes } = {},
): Promise<Result> {
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
    const result = await claim(drawRefCode(prefix, randomBytes));
    if (result !== undefined) return result;
  }
  throw new Error(`Every reference code drawn was taken, ${CLAIM_ATTEMPTS} times over`);
}

/** Whether the text is a code as stored: capitals, by the database's pattern */
export function isRefCode(text: string): boolean {
  return REF_CODE.test(text);
}

// Direction marks and isolates, which text that isolates a code carries around it (FR-01.8)
const FORMAT_CHARACTERS = /\p{Cf}/gu;

/**
 * BR-33: the stored form of a code typed or pasted in any case, in Arabic digits or with invisible
 * marks around it, or null if it's none
 */
export function parseRefCode(typed: string): string | null {
  const code = normalizeDigits(typed.replace(FORMAT_CHARACTERS, "")).trim().toUpperCase();
  return isRefCode(code) ? code : null;
}
