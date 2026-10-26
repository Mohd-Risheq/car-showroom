import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors/app-error";
import { readCapped, readJsonBody } from "@/lib/http/body";

// Request bodies read under a cap (API-16, API-17, API-30, API-34)

function streamOf(chunks: Uint8Array[]) {
  const state = { pulled: 0, cancelled: false };
  // No queue, so a chunk is pulled only when the reader asks for it
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[state.pulled++];
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, state };
}

const bytes = (length: number) => new Uint8Array(length).fill(7);

function post(body: string, contentType = "application/json") {
  return new Request("https://muftah.test/api/example", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

describe("readCapped", () => {
  it("reads a body that fits, whole", async () => {
    const { stream } = streamOf([bytes(3), bytes(5)]);
    expect(await readCapped(stream, 8)).toEqual(bytes(8));
    expect(await readCapped(null, 8)).toEqual(new Uint8Array(0));
  });

  it("stops at the chunk that passes the cap, and cancels the rest", async () => {
    const { stream, state } = streamOf([bytes(4), bytes(5), bytes(100)]);
    expect(await readCapped(stream, 8)).toBe("too_large");
    expect(state).toEqual({ pulled: 2, cancelled: true });
  });
});

describe("readJsonBody", () => {
  it("returns the JSON a body holds", async () => {
    expect(await readJsonBody(post('{"locale":"en"}'), 64)).toEqual({ locale: "en" });
    expect(await readJsonBody(post('{"a":1}', "application/json; charset=utf-8"), 64)).toEqual({ a: 1 });
    // A media type's name is case-insensitive (RFC 9110, 8.3.1)
    expect(await readJsonBody(post('{"a":1}', "Application/JSON; charset=utf-8"), 64)).toEqual({ a: 1 });
  });

  it("reads text that isn't JSON as undefined, which the handler's schema refuses", async () => {
    expect(await readJsonBody(post("en"), 64)).toBeUndefined();
  });

  it("refuses a body that isn't sent as JSON, or is over the cap", async () => {
    for (const [request, reason] of [
      [post('{"a":1}', "text/plain"), "not JSON"],
      [post('{"a":1}', "application/jsonp"), "not JSON"],
      [post('{"a":1}', "application/json-seq"), "not JSON"],
      [post(`{"a":"${"x".repeat(64)}"}`), "too large"],
    ] as const) {
      const refusal = readJsonBody(request, 64);
      await expect(refusal).rejects.toBeInstanceOf(AppError);
      await expect(refusal).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: reason });
    }
  });
});
