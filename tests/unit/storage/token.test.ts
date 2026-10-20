import { generateClientTokenFromReadWriteToken, getPayloadFromClientToken } from "@vercel/blob/client";
import { describe, expect, it } from "vitest";
import { verifyLocalClientToken } from "@/lib/storage/token";

// The local store verifies the client tokens handleUpload signs, as the service does (API-16)

const readWriteToken = `vercel_blob_rw_local_${"ab".repeat(32)}`;
const pathname = "cars/0190f5a0-1111-7000-8000-000000000001/photo/6b0c3f4e-2222-4000-8000-000000000002-960.webp";
const claims = {
  pathname,
  allowedContentTypes: ["image/webp"],
  maximumSizeInBytes: 307_200,
  addRandomSuffix: true,
  allowOverwrite: false,
};

function token(overrides: Record<string, unknown> = {}, key = readWriteToken) {
  return generateClientTokenFromReadWriteToken({
    token: key,
    validUntil: Date.now() + 600_000,
    ...claims,
    ...overrides,
  });
}

describe("local client tokens", () => {
  it("verifies a token from the storage library and returns its claims", async () => {
    const clientToken = await token();
    expect(clientToken.startsWith("vercel_blob_client_local_")).toBe(true);
    const check = verifyLocalClientToken(clientToken, readWriteToken);
    expect(check).toEqual({ ok: true, claims: { ...claims, validUntil: getPayloadFromClientToken(clientToken).validUntil } });
  });

  it("refuses an expired token", async () => {
    const check = verifyLocalClientToken(await token({ validUntil: Date.now() - 1 }), readWriteToken);
    expect(check).toEqual({ ok: false, code: "client_token_expired" });
  });

  it("refuses a token signed with another key or for another store", async () => {
    const otherKey = `vercel_blob_rw_local_${"cd".repeat(32)}`;
    expect(verifyLocalClientToken(await token({}, otherKey), readWriteToken)).toEqual({ ok: false, code: "forbidden" });
    const realStore = await token({}, `vercel_blob_rw_AbCdEf123_${"ef".repeat(16)}`);
    expect(verifyLocalClientToken(realStore, readWriteToken)).toEqual({ ok: false, code: "forbidden" });
  });

  it("refuses a token with any single character changed", async () => {
    const clientToken = await token();
    const prefix = "vercel_blob_client_local_".length;
    for (let i = prefix; i < clientToken.length; i++) {
      const swapped = clientToken[i] === "A" ? "B" : "A";
      const tampered = clientToken.slice(0, i) + swapped + clientToken.slice(i + 1);
      expect(verifyLocalClientToken(tampered, readWriteToken).ok).toBe(false);
    }
  });

  it("refuses non-canonical encodings and tokens without the scoped claims", async () => {
    const clientToken = await token();
    expect(verifyLocalClientToken(`${clientToken}=`, readWriteToken).ok).toBe(false);
    expect(verifyLocalClientToken(`${clientToken.slice(0, 40)}!${clientToken.slice(40)}`, readWriteToken).ok).toBe(false);
    const unscoped = await token({ maximumSizeInBytes: undefined });
    expect(verifyLocalClientToken(unscoped, readWriteToken)).toEqual({ ok: false, code: "forbidden" });
  });
});
