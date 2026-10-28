// The seed's ids (05-SEED-DATA §5.2): UUID version 5 (RFC 9562 §5.5), the SHA-1 of a namespace and
// a name, so a seed row has the same id on every run and every machine, and a re-seed finds the row
// it wrote. Each name says what the row is, so no two rows share one.
import { createHash } from "node:crypto";

/**
 * The namespace of every seed id, drawn once at random. Changing it would give every seed row a new
 * id, and with it every Car DNA pattern and cached link (05-SEED-DATA §5.2).
 */
export const SEED_NAMESPACE = "70aa2577-b72b-4fc1-83b6-0d9000e1f29b";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A UUID version 5: the SHA-1 of the namespace's bytes and the name's UTF-8, with its version and variant */
export function uuidv5(namespace: string, name: string): string {
  if (!UUID.test(namespace)) throw new RangeError(`Not a UUID in lower case: ${JSON.stringify(namespace)}`);
  const bytes = createHash("sha1")
    .update(Buffer.from(namespace.replaceAll("-", ""), "hex"))
    .update(name, "utf8")
    .digest()
    .subarray(0, 16);
  // The version in the high four bits of byte 6, the variant (binary 10) in the high two of byte 8
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x50, 6);
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const seedId = (name: string) => uuidv5(SEED_NAMESPACE, name);

/** The id of each kind of seed row, from the keys that make it one of a kind */
export const seedIds = {
  car: (seedKey: string) => seedId(`seed:${seedKey}`),
  inspection: (seedKey: string) => seedId(`seed:${seedKey}:inspection`),
  panel: (seedKey: string, panelId: string) => seedId(`seed:${seedKey}:panel:${panelId}`),
  milestone: (seedKey: string, sortOrder: number) => seedId(`seed:${seedKey}:milestone:${sortOrder}`),
  priceChange: (seedKey: string, index: number) => seedId(`seed:${seedKey}:price_change:${index}`),
  place: (key: string) => seedId(`place:${key}`),
  /** An alias as stored, folded (SRS §6.2) */
  alias: (modelKey: string, alias: string) => seedId(`alias:${modelKey}:${alias}`),
  dealer: (slug: string) => seedId(`dealer:${slug}`),
  /** The dealer's live settings */
  settings: (slug: string) => seedId(`settings:${slug}`),
};
