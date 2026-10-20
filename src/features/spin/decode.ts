import type { DecodeMessage, DecodeReply } from "./decode.worker";
import { type DecodeRequest, type Decoded, fetchAndDecode } from "./fetch-decode";

// Where spin frames decode (FR-16, NFR-PERF-04): in a worker, or on the page's own thread.
// Spike T-05 measures both (D-027).

export type DecodeStrategy = "worker" | "main";

export interface FrameDecoder {
  decode(request: DecodeRequest, signal: AbortSignal): Promise<Decoded>;
  dispose(): void;
}

type Pending = { resolve: (decoded: Decoded) => void; reject: (reason: unknown) => void };

class WorkerDecoder implements FrameDecoder {
  #worker = new Worker(new URL("./decode.worker.ts", import.meta.url), { type: "module" });
  #pending = new Map<number, Pending>();
  #nextId = 0;

  constructor() {
    this.#worker.onmessage = (event: MessageEvent<DecodeReply>) => {
      const reply = event.data;
      const pending = this.#pending.get(reply.id);
      this.#pending.delete(reply.id);
      if ("decoded" in reply) {
        // A request cancelled while its bitmap was on the way: nobody will draw it
        if (pending) pending.resolve(reply.decoded);
        else reply.decoded.bitmap.close();
      } else {
        pending?.reject(new Error(reply.error));
      }
    };
    this.#worker.onerror = (event) => this.#rejectAll(new Error(event.message || "decode worker failed"));
  }

  decode(request: DecodeRequest, signal: AbortSignal): Promise<Decoded> {
    const id = this.#nextId++;
    return new Promise<Decoded>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      this.#pending.set(id, { resolve, reject });
      signal.addEventListener(
        "abort",
        () => {
          if (!this.#pending.delete(id)) return;
          this.#post({ cancel: id });
          reject(signal.reason);
        },
        { once: true },
      );
      this.#post({ id, request });
    });
  }

  dispose(): void {
    this.#worker.terminate();
    this.#rejectAll(new DOMException("The decoder was disposed", "AbortError"));
  }

  #post(message: DecodeMessage): void {
    this.#worker.postMessage(message);
  }

  #rejectAll(reason: unknown): void {
    for (const pending of this.#pending.values()) pending.reject(reason);
    this.#pending.clear();
  }
}

const mainThreadDecoder: FrameDecoder = { decode: fetchAndDecode, dispose: () => {} };

export function createDecoder(strategy: DecodeStrategy): FrameDecoder {
  return strategy === "worker" ? new WorkerDecoder() : mainThreadDecoder;
}
