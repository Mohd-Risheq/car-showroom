import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDecoder } from "@/features/spin/ui/decode";
import type { DecodeRequest, Decoded } from "@/features/spin/ui/fetch-decode";
import type { DecodeMessage, DecodeReply } from "@/features/spin/worker/decode.worker";

// D-027: the decode worker as the page sees it. A reply settles its own request. A worker that
// fails, or a disposed decoder, rejects every request it still owes and every later one at once,
// so the store's six decode slots never wait forever. The worker is a fake the test answers for.

class FakeWorker {
  static last: FakeWorker | undefined;
  onmessage: ((event: MessageEvent<DecodeReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: DecodeMessage[] = [];
  readonly terminate = vi.fn();

  constructor() {
    FakeWorker.last = this;
  }

  postMessage(message: DecodeMessage) {
    this.posted.push(message);
  }

  reply(data: DecodeReply) {
    this.onmessage?.({ data } as MessageEvent<DecodeReply>);
  }

  fail(message: string) {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const REQUEST: DecodeRequest = { url: "low-0.webp", resize: null, quality: "medium" };

function decoded(): Decoded & { bitmap: { close: ReturnType<typeof vi.fn> } } {
  const bitmap = { close: vi.fn() };
  return { bitmap: bitmap as unknown as ImageBitmap & typeof bitmap, encodedBytes: 1, fetchMs: 1, decodeMs: 1 };
}

function workerDecoder() {
  const decoder = createDecoder("worker");
  const worker = FakeWorker.last;
  if (!worker) throw new Error("no worker was created");
  return { decoder, worker };
}

beforeEach(() => {
  vi.stubGlobal("Worker", FakeWorker);
});

describe("the worker decoder", () => {
  it("settles a request with its reply, then stops listening for its abort", async () => {
    const { decoder, worker } = workerDecoder();
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    const request = decoder.decode(REQUEST, controller.signal);
    expect(worker.posted).toEqual([{ id: 0, request: REQUEST }]);

    const reply = decoded();
    worker.reply({ id: 0, decoded: reply });
    await expect(request).resolves.toBe(reply);
    expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
    controller.abort();
    expect(worker.posted).toHaveLength(1);
  });

  it("rejects only the request whose decode failed", async () => {
    const { decoder, worker } = workerDecoder();
    const signal = new AbortController().signal;
    const first = decoder.decode(REQUEST, signal);
    const second = decoder.decode(REQUEST, signal);
    worker.reply({ id: 0, error: "EncodingError: bad frame" });
    await expect(first).rejects.toThrow("EncodingError: bad frame");
    const reply = decoded();
    worker.reply({ id: 1, decoded: reply });
    await expect(second).resolves.toBe(reply);
  });

  it("cancels in the worker on abort, and closes a bitmap that arrives anyway", async () => {
    const { decoder, worker } = workerDecoder();
    const controller = new AbortController();
    const request = decoder.decode(REQUEST, controller.signal);
    controller.abort();
    await expect(request).rejects.toBe(controller.signal.reason);
    expect(worker.posted.at(-1)).toEqual({ cancel: 0 });

    const late = decoded();
    worker.reply({ id: 0, decoded: late });
    expect(late.bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("rejects what a failed worker owes, and every later request without posting it", async () => {
    const { decoder, worker } = workerDecoder();
    const pending = decoder.decode(REQUEST, new AbortController().signal);
    worker.fail("decode.worker.ts failed to load");
    await expect(pending).rejects.toThrow("decode.worker.ts failed to load");
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    await expect(decoder.decode(REQUEST, new AbortController().signal)).rejects.toThrow(
      "decode.worker.ts failed to load",
    );
    expect(worker.posted).toHaveLength(1);
  });

  it("rejects with an AbortError once disposed, now and later", async () => {
    const { decoder, worker } = workerDecoder();
    const pending = decoder.decode(REQUEST, new AbortController().signal);
    decoder.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(decoder.decode(REQUEST, new AbortController().signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.posted).toHaveLength(1);
  });
});
