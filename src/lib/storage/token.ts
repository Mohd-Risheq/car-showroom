import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Verifies a client token the way the storage service does, for the local store only.
// Format (@vercel/blob 2.8.2, generateClientTokenFromReadWriteToken):
//   vercel_blob_client_{storeId}_base64("{hmacHex}.{payload}"), where payload is the base64
//   of the JSON claims and hmacHex is HMAC-SHA256(payload) keyed by the read-write token.

const LOCAL_CLIENT_TOKEN_PREFIX = "vercel_blob_client_local_";

// The claims API-16 sets; unknown claims are dropped
const claimsSchema = z.object({
  pathname: z.string(),
  validUntil: z.number(),
  maximumSizeInBytes: z.number().int().positive(),
  allowedContentTypes: z.array(z.string()).min(1),
  addRandomSuffix: z.boolean().optional(),
  allowOverwrite: z.boolean().optional(),
});

export type ClientTokenClaims = z.infer<typeof claimsSchema>;

export type ClientTokenCheck =
  { ok: true; claims: ClientTokenClaims } | { ok: false; code: "forbidden" | "client_token_expired" };

const forbidden: ClientTokenCheck = { ok: false, code: "forbidden" };

export function verifyLocalClientToken(token: string, readWriteToken: string, now = Date.now()): ClientTokenCheck {
  if (!token.startsWith(LOCAL_CLIENT_TOKEN_PREFIX)) return forbidden;
  const encoded = token.slice(LOCAL_CLIENT_TOKEN_PREFIX.length);
  const inner = Buffer.from(encoded, "base64");
  if (inner.toString("base64") !== encoded) return forbidden; // canonical base64 only

  const text = inner.toString("latin1");
  const dot = text.indexOf(".");
  const signature = text.slice(0, dot);
  const payload = text.slice(dot + 1);
  if (dot < 0 || !/^[0-9a-f]{64}$/.test(signature)) return forbidden;
  const expected = createHmac("sha256", readWriteToken).update(payload).digest();
  if (!timingSafeEqual(Buffer.from(signature, "hex"), expected)) return forbidden;

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return forbidden;
  }
  const claims = claimsSchema.safeParse(json);
  if (!claims.success) return forbidden;
  if (claims.data.validUntil <= now) return { ok: false, code: "client_token_expired" };
  return { ok: true, claims: claims.data };
}
