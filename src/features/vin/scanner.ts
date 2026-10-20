import type { BarcodeDetector, DetectedBarcode } from "barcode-detector/ponyfill";
import { scanRegion, VIN_FORMATS, vinFromBarcode, type VinFromBarcode } from "./barcode";
import { loadScanner, reloadScanner } from "./zxing";

// "Scan VIN" (FR-36.2): the rear camera, read a frame at a time until a barcode holds a VIN. It
// runs on the dealer page's main thread, whose policy allows WebAssembly (D-028).

export type ScanEngine = "native" | "polyfill";

export type VinScanner = { engine: ScanEngine; detector: BarcodeDetector };

export type Scanned = VinFromBarcode & { text: string; format: string };

/** One read of a frame, for whoever measures the scanner */
export type ScanRead = { ms: number; width: number; height: number; codes: DetectedBarcode[] };

// A read starts at most this often, and never while one is running, so the page answers taps in between
const READ_INTERVAL_MS = 120;

/** Can this page ask for a camera, and does the device have one? "Scan VIN" is offered only then. */
export async function hasCamera(): Promise<boolean> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    return (await navigator.mediaDevices.enumerateDevices()).some((device) => device.kind === "videoinput");
  } catch {
    return false;
  }
}

/**
 * The browser's own detector where it reads all four formats (Chrome on Android), otherwise the
 * zxing-wasm polyfill with its self-hosted .wasm, which is the iOS path. Creating the polyfill
 * starts loading its .wasm, so call this as the camera opens.
 */
export async function createScanner({ polyfill = false }: { polyfill?: boolean } = {}): Promise<VinScanner> {
  const Native = (globalThis as { BarcodeDetector?: typeof BarcodeDetector }).BarcodeDetector;
  if (Native && !polyfill) {
    // Some Android phones list no formats at all, and the constructor throws on an empty list
    const formats: readonly string[] = await Native.getSupportedFormats().catch(() => []);
    if (VIN_FORMATS.every((format) => formats.includes(format))) return { engine: "native", detector: new Native({ formats: [...VIN_FORMATS] }) };
  }
  const scanner = await loadScanner();
  return { engine: "polyfill", detector: new scanner.BarcodeDetector({ formats: [...VIN_FORMATS] }) };
}

/**
 * The rear camera, at 1920 pixels across unless asked for another width: iOS gives a small
 * picture unless asked, and a Code 39 VIN needs about 2 pixels a module (D-032)
 */
export function openCamera({ width = 1920 }: { width?: number } = {}): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: "environment" }, width: { ideal: width }, height: { ideal: Math.round((width * 9) / 16) } },
  });
}

export function closeCamera(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

/** Resolves when start's callback runs or the signal aborts, whichever comes first */
function until(signal: AbortSignal, start: (done: () => void) => void): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      signal.removeEventListener("abort", done);
      resolve();
    };
    signal.addEventListener("abort", done);
    start(done);
  });
}

function nextFrame(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  return until(signal, (done) => {
    if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(done);
    else requestAnimationFrame(done);
  });
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return until(signal, (done) => setTimeout(done, ms));
}

/** The detector's read. The polyfill answers NotSupportedError when its .wasm didn't load, and is reset for the next try. */
async function detect(scanner: VinScanner, source: HTMLVideoElement | HTMLCanvasElement | ImageData): Promise<DetectedBarcode[]> {
  try {
    return await scanner.detector.detect(source);
  } catch (error) {
    if (scanner.engine === "polyfill" && error instanceof DOMException && error.name === "NotSupportedError") await reloadScanner();
    throw error;
  }
}

/** The first barcode that holds a VIN, or null */
function firstVin(codes: DetectedBarcode[]): Scanned | null {
  for (const code of codes) {
    const found = vinFromBarcode(code.rawValue);
    if (found) return { ...found, text: code.rawValue, format: code.format };
  }
  return null;
}

/**
 * Reads the playing camera video until a barcode holds a VIN, which it returns for the user to
 * confirm, or null once the signal aborts. The browser's own detector reads whole frames. The
 * polyfill reads the band of scanRegion, because it cannot be told to try less, and a whole
 * frame costs more than the page can spare between taps.
 */
export async function scanVideo(video: HTMLVideoElement, scanner: VinScanner, { signal, onRead }: { signal: AbortSignal; onRead?: (read: ScanRead) => void }): Promise<Scanned | null> {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No 2D canvas");
  while (!signal.aborted) {
    await nextFrame(video, signal);
    if (signal.aborted || video.videoWidth === 0) continue;
    const started = performance.now();
    let source: HTMLVideoElement | ImageData = video;
    if (scanner.engine === "polyfill") {
      const region = scanRegion(video.videoWidth, video.videoHeight);
      if (canvas.width !== region.width || canvas.height !== region.height) Object.assign(canvas, { width: region.width, height: region.height });
      context.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
      source = context.getImageData(0, 0, region.width, region.height);
    }
    const codes = await detect(scanner, source);
    const ms = performance.now() - started;
    onRead?.({ ms, width: source instanceof ImageData ? source.width : video.videoWidth, height: source instanceof ImageData ? source.height : video.videoHeight, codes });
    const found = firstVin(codes);
    if (found) return found;
    await wait(READ_INTERVAL_MS - ms, signal);
  }
  return null;
}

/** A photo's VIN, the camera-less way in (SRS §10.8). Large photos are read at 2048 pixels on the long side. */
export async function scanPhoto(photo: Blob, scanner: VinScanner): Promise<{ found: Scanned | null; codes: DetectedBarcode[] }> {
  const bitmap = await createImageBitmap(photo);
  try {
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    Object.assign(canvas, { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("No 2D canvas");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const codes = await detect(scanner, scanner.engine === "polyfill" ? context.getImageData(0, 0, canvas.width, canvas.height) : canvas);
    return { found: firstVin(codes), codes };
  } finally {
    bitmap.close();
  }
}
