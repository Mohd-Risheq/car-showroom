import { describe, expect, it, vi } from "vitest";
import { DEV_UPLOAD_PART_BYTES, type DevReportKind, isSavedReply, postDevMp4, postDevReport } from "@/app/_dev/report";

// The spike pages' channel to the Mac (the phone session): what the pages send and what they
// show. fetch is a fake here; nothing reaches .dev-reports/.

const PART = DEV_UPLOAD_PART_BYTES;
const kind: DevReportKind = "t04-canvas";
const report = { kind, encoders: [{ type: "image/webp", bytes: 1200 }] };

/** A fake fetch that answers each request with the next reply */
function replies(...answers: Array<Response | Error>) {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
  for (const answer of answers) {
    if (answer instanceof Error) fetch.mockRejectedValueOnce(answer);
    else fetch.mockResolvedValueOnce(answer);
  }
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const saved = (name: string, status = 201) => Response.json({ saved: name }, { status });

describe("isSavedReply", () => {
  it("takes a reply that names the saved file", () => {
    expect(isSavedReply({ saved: "t05-spin-2026-10-18T09-00-00-000Z-a1b2c3.json" })).toBe(true);
  });

  it.each([
    ["nothing", null],
    ["a string", "saved"],
    ["an empty object", {}],
    ["a name that isn't text", { saved: 1 }],
    ["a part's reply", { received: PART }],
  ])("refuses %s", (_case, value) => {
    expect(isSavedReply(value)).toBe(false);
  });
});

describe("postDevReport", () => {
  it("sends the report as JSON to the page language's report route and shows the saved name", async () => {
    const fetch = replies(saved("t04-canvas-x.json"));
    await expect(postDevReport("ar", report)).resolves.toEqual({
      ok: true,
      message: "Sent to the Mac: t04-canvas-x.json",
    });
    expect(fetch.mock.calls).toStrictEqual([
      [
        "/ar/dev/report",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report) },
      ],
    ]);
  });

  it("counts a success whose reply names no file as sent, and says so", async () => {
    replies(new Response("not JSON", { status: 201 }));
    await expect(postDevReport("en", report)).resolves.toEqual({
      ok: true,
      message: "Sent to the Mac (the reply named no file)",
    });
  });

  it("shows the status of a refused report", async () => {
    replies(new Response(null, { status: 403 }));
    await expect(postDevReport("en", report)).resolves.toEqual({ ok: false, message: "Sending failed: 403" });
  });

  it("shows why a report never arrived, without throwing", async () => {
    replies(new TypeError("Load failed"));
    await expect(postDevReport("en", report)).resolves.toEqual({
      ok: false,
      message: "Sending failed: TypeError: Load failed",
    });
  });
});

describe("postDevMp4", () => {
  const mp4 = new Uint8Array(2 * PART + 5).map((_, index) => index % 251).buffer;

  it("sends the file in parts, in order, under one upload id, and gives the saved name", async () => {
    const fetch = replies(
      Response.json({ received: PART }, { status: 202 }),
      Response.json({ received: 2 * PART }, { status: 202 }),
      saved("t08-reel-x.mp4"),
    );
    await expect(postDevMp4("en", mp4)).resolves.toBe("t08-reel-x.mp4");
    const sent = fetch.mock.calls.map(([url, init]) => {
      const { pathname, searchParams } = new URL(url, "http://localhost");
      return {
        path: pathname,
        id: searchParams.get("id"),
        offset: searchParams.get("offset"),
        total: searchParams.get("total"),
        method: init.method,
        headers: init.headers,
        body: init.body,
      };
    });
    const id = sent[0]?.id;
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    const part = (offset: number, length: number) => ({
      path: "/en/dev/report/mp4",
      id,
      offset: String(offset),
      total: String(mp4.byteLength),
      method: "POST",
      headers: { "content-type": "video/mp4" },
      body: mp4.slice(offset, offset + length),
    });
    expect(sent).toStrictEqual([part(0, PART), part(PART, PART), part(2 * PART, 5)]);
  });

  it("stops at the first part the route refuses", async () => {
    const fetch = replies(Response.json({ received: PART }, { status: 202 }), new Response(null, { status: 409 }));
    await expect(postDevMp4("en", mp4)).rejects.toThrow(`MP4 409 at byte ${PART}`);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("gives null when the last reply names no file", async () => {
    replies(new Response(null, { status: 201 }));
    await expect(postDevMp4("en", new Uint8Array(16).buffer)).resolves.toBeNull();
  });
});
