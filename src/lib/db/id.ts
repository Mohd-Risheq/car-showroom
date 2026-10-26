// UUID version 7 (RFC 9562 §5.7): 48 bits of Unix time in milliseconds, then 74 random bits, so ids
// sort by the millisecond they were made in, in no order within one, and new rows land at the end
// of each primary-key index (SRS §6). Node 22 has no generator of its own. The schema and the seed
// scripts load this module, so it has no imports.
export function uuidv7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const view = new DataView(bytes.buffer);
  const now = Date.now();
  view.setUint16(0, Math.floor(now / 2 ** 32));
  view.setUint32(2, now % 2 ** 32);
  // The version in the high four bits of byte 6, the variant (binary 10) in the high two of byte 8
  view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x70);
  view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
