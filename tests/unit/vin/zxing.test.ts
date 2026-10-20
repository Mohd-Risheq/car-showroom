import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ZXING_WASM_SHA256 } from "barcode-detector/ponyfill";
import { describe, expect, it } from "vitest";
import { ZXING_WASM_PATH } from "@/features/vin/zxing";

// FR-36.2 and SRS §14: the scanner's .wasm is served from public/wasm, so a library update that
// changes the build must update the copy too
describe("self-hosted zxing-wasm", () => {
  it("is the build the installed barcode-detector expects", async () => {
    const bytes = await readFile(path.join(process.cwd(), "public", ZXING_WASM_PATH));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(ZXING_WASM_SHA256);
  });
});
