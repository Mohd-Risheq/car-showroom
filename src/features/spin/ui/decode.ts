import type { DecodeMessage, DecodeReply } from "../worker/decode.worker";
import { type DecodeRequest, type Decoded, fetchAndDecode } from "./fetch-decode";

// Where spin frames decode (FR-16, NFR-PERF-04). D-027 made the worker the default, with
// decoding on the page as the fallback. T-41 switches a viewer whose worker failed over to it.

export type DecodeStrategy = "worker" | "main";

export interface FrameDecoder {
  decode(request: DecodeRequest, signal: AbortSignal): Promise<Decoded>;
  dispose(): void;
}

type Pending = { resolve: (decoded: Decoded) => void; reject: (reason: unknown) => void };

class WorkerDecoder implements FrameDecoder {
  #worker = new Worker(new URL("../worker/decode.worker.ts", import.meta.url), { type: "module" });
  #pending = new Map<number, Pending>();
  #nextId = 0;
  /** Why the worker stopped. A stopped worker answers nothing, so every request rejects at once. */
  #stopped: Error | null = null;

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
    // A worker that fails, for example because its script didn't load, never answers again
    this.#worker.onerror = (event) => this.#stop(new Error(event.message || "decode worker failed"));
  }

  decode(request: DecodeRequest, signal: AbortSignal): Promise<Decoded> {
    return new Promise<Decoded>((resolve, reject) => {
      if (this.#stopped) {
        reject(this.#stopped);
        return;
      }
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      const id = this.#nextId++;
      const onAbort = () => {
        if (!this.#pending.delete(id)) return;
        this.#post({ cancel: id });
        reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      const settled = () => signal.removeEventListener("abort", onAbort);
      this.#pending.set(id, {
        resolve: (decoded) => {
          settled();
          resolve(decoded);
        },
        reject: (reason) => {
          settled();
          reject(reason);
        },
      });
      this.#post({ id, request });
    });
  }

  dispose(): void {
    this.#stop(new DOMException("The decoder was disposed", "AbortError"));
  }

  #post(message: DecodeMessage): void {
    this.#worker.postMessage(message);
  }

  // Ends the worker, rejects what it still owes, and makes every later request reject
  #stop(reason: Error): void {
    this.#stopped ??= reason;
    this.#worker.terminate();
    for (const pending of this.#pending.values()) pending.reject(reason);
    this.#pending.clear();
  }
}

const mainThreadDecoder: FrameDecoder = { decode: fetchAndDecode, dispose: () => {} };

export function createDecoder(strategy: DecodeStrategy): FrameDecoder {
  return strategy === "worker" ? new WorkerDecoder() : mainThreadDecoder;
}
