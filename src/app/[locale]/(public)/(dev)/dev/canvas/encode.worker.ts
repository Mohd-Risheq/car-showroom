import { CARD_HEIGHT, CARD_WIDTH, drawSpikeCard } from "./card";

// Spike T-04: the Arabic card on an OffscreenCanvas in a worker, where the §11.6 pipelines run,
// encoded with convertToBlob as the image worker will encode (D-025). The page compares the
// pixels with its own canvas and checks each encoder's output.

export type WorkerReply =
  | {
      ok: true;
      directionSupported: boolean;
      pixels: ArrayBuffer;
      encodes: { requested: string; type: string; bytes: ArrayBuffer }[];
    }
  | { ok: false; error: string };

const TYPES = ["image/webp", "image/jpeg", "image/png"];

type Scope = {
  onmessage: (() => void) | null;
  postMessage(message: WorkerReply, transfer: Transferable[]): void;
};
const scope = self as unknown as Scope;

scope.onmessage = async () => {
  try {
    const canvas = new OffscreenCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context on OffscreenCanvas");
    drawSpikeCard(ctx, "ar");
    const pixels = ctx.getImageData(0, 0, CARD_WIDTH, CARD_HEIGHT).data.buffer;
    const encodes: { requested: string; type: string; bytes: ArrayBuffer }[] = [];
    for (const type of TYPES) {
      const blob = await canvas.convertToBlob({ type, quality: 0.82 });
      encodes.push({ requested: type, type: blob.type, bytes: await blob.arrayBuffer() });
    }
    const directionSupported = "direction" in OffscreenCanvasRenderingContext2D.prototype;
    scope.postMessage({ ok: true, directionSupported, pixels, encodes }, [pixels, ...encodes.map((e) => e.bytes)]);
  } catch (error) {
    scope.postMessage({ ok: false, error: String(error) }, []);
  }
};
