// The WebAssembly barcode scanner for browsers without a native BarcodeDetector, such as iOS
// Safari (FR-36.2). Its .wasm is self-hosted, never fetched from jsDelivr (SRS §14, SEC-11).
// tests/unit/vin/zxing.test.ts checks that public/wasm holds the build the installed library expects.
export const ZXING_WASM_PATH = "/wasm/zxing_reader.wasm";

// One object for every call: zxing compares overrides by identity, and new ones would make it
// compile the 1 MB module again
const OVERRIDES = {
  locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? ZXING_WASM_PATH : prefix + path),
};

/** Loads the scanner on demand, pointed at our copy of its .wasm */
export async function loadZxingPolyfill() {
  const scanner = await import("barcode-detector/ponyfill");
  scanner.prepareZXingModule({ overrides: OVERRIDES });
  return scanner;
}

/**
 * Forgets a .wasm that failed to load, which zxing-wasm would otherwise keep failing with, so the
 * next read fetches our copy again. Purging also drops the overrides, and zxing-wasm's default is
 * jsDelivr, so they go straight back.
 */
export async function resetZxingWasm() {
  const scanner = await import("barcode-detector/ponyfill");
  scanner.purgeZXingModule();
  scanner.prepareZXingModule({ overrides: OVERRIDES });
}
