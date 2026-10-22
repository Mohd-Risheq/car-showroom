import { mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_REPORT_KINDS, DEV_UPLOAD_PART_BYTES, postDevMp4 } from "@/app/_dev/report";
import { handleDevMp4Part, handleDevReport, MAX_REPORT_FILES } from "@/app/_dev/report-folder";

// What the report routes take from the spike pages and keep in .dev-reports/, here a temporary
// folder for each test. Two tests need a partial file to go between two steps of a part, so stat
// passes through to the real one, which those tests wrap.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, stat: vi.fn(actual.stat) };
});
const { stat: realStat } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

const SITE = "http://localhost:3000";
const ID = "0123456789ab";
const PART = DEV_UPLOAD_PART_BYTES;
const NOW = new Date("2026-10-22T09:30:00.123Z");

let folder = "";

beforeEach(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), "muftah-dev-reports-"));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(folder, { recursive: true, force: true });
});

const names = async () => (await readdir(folder)).sort();

/** The one file in the folder, and its bytes */
async function onlyFile(): Promise<{ name: string; bytes: Buffer }> {
  const [name, ...others] = await names();
  if (name === undefined || others.length > 0) throw new Error(`expected one file, found ${others.length + 1}`);
  return { name, bytes: await readFile(path.join(folder, name)) };
}

/** Fills the folder with this many earlier reports */
async function fill(count: number): Promise<void> {
  await Promise.all(
    Array.from({ length: count }, (_, k) => writeFile(path.join(folder, `t04-canvas-${k}.json`), "{}")),
  );
}

/** A POST from one of the site's own pages, as a browser sends it */
function pageRequest(pathAndQuery: string, contentType: string, body: BodyInit, site = "same-origin"): Request {
  return new Request(new URL(pathAndQuery, SITE), {
    method: "POST",
    headers: { "content-type": contentType, "sec-fetch-site": site },
    body,
  });
}

describe("handleDevReport", () => {
  const report = JSON.stringify({ kind: "t04-canvas", encoders: [{ type: "image/webp", bytes: 1200 }] });
  const send = (body: BodyInit, target = folder, site?: string) =>
    handleDevReport(pageRequest("/en/dev/report", "application/json", body, site), target);

  it("saves a report as received, named for its kind and the time", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const response = await send(report);
    expect(response.status).toBe(201);
    const saved = await onlyFile();
    expect(await response.json()).toStrictEqual({ saved: saved.name });
    expect(saved.name).toMatch(/^t04-canvas-2026-10-22T09-30-00-123Z-[0-9a-f]{6}\.json$/);
    expect(saved.bytes.toString("utf8")).toBe(report);
  });

  it("takes a report of each spike's kind", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    for (const kind of DEV_REPORT_KINDS) expect((await send(JSON.stringify({ kind }))).status, kind).toBe(201);
    const kinds = (await names()).map((name) => name.replace(/-2026-10-22T09-30-00-123Z-[0-9a-f]{6}\.json$/, ""));
    expect(kinds).toStrictEqual([...DEV_REPORT_KINDS].sort());
  });

  it("makes the folder when there is none yet", async () => {
    const inner = path.join(folder, ".dev-reports");
    expect((await send(report, inner)).status).toBe(201);
    expect(await readdir(inner)).toHaveLength(1);
  });

  it("takes reports until the folder holds its cap", async () => {
    await fill(MAX_REPORT_FILES - 1);
    expect((await send(report)).status).toBe(201);
    expect((await send(report)).status).toBe(507);
    expect(await names()).toHaveLength(MAX_REPORT_FILES);
  });

  it.each([
    ["a report from another site", 403, report, "cross-site"],
    ["a body past 4 MB", 413, "x".repeat(4 * 1024 * 1024 + 1), undefined],
    ["a body that isn't JSON", 400, "kind=t04-canvas", undefined],
    ["a report with no kind", 400, JSON.stringify({ encoders: [] }), undefined],
    ["a kind that isn't text", 400, JSON.stringify({ kind: 4 }), undefined],
    ["a kind with a path in it", 400, JSON.stringify({ kind: "../t04-canvas" }), undefined],
    ["a kind no spike sends", 400, JSON.stringify({ kind: "t99-other" }), undefined],
  ])("refuses %s, and saves nothing", async (_case, status, body, site) => {
    expect((await send(body, folder, site)).status).toBe(status);
    expect(await names()).toStrictEqual([]);
  });
});

describe("handleDevMp4Part", () => {
  /** An MP4 as far as the route checks one: an ftyp box header, then numbered bytes */
  function mp4(length: number): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(length).map((_, index) => index % 251);
    bytes.set([0, 0, 0, 24, ...new TextEncoder().encode("ftyp")]);
    return bytes;
  }

  /** The part of a file that starts at offset, sent as postDevMp4 sends it, for the total it declares */
  function partOf(file: Uint8Array, offset: number, { id = ID, total = file.byteLength } = {}): Request {
    const query = new URLSearchParams({ id, offset: String(offset), total: String(total) });
    const body = file.slice(offset, Math.min(offset + PART, total));
    return pageRequest(`/en/dev/report/mp4?${query}`, "video/mp4", body);
  }

  const send = (request: Request) => handleDevMp4Part(request, folder);
  const mp4Files = async () => (await names()).filter((name) => name.endsWith(".mp4"));

  it("saves the parts in order, and names the file once its last byte is in", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const file = mp4(PART + 6);
    const first = await send(partOf(file, 0));
    expect(first.status).toBe(202);
    expect(await first.json()).toStrictEqual({ received: PART });
    expect(await mp4Files()).toStrictEqual([]);
    const last = await send(partOf(file, PART));
    expect(last.status).toBe(201);
    const saved = await onlyFile();
    expect(await last.json()).toStrictEqual({ saved: saved.name });
    expect(saved.name).toBe(`t08-reel-2026-10-22T09-30-00-123Z-${ID}.mp4`);
    expect(saved.bytes.equals(file)).toBe(true);
  });

  it("refuses a part that doesn't start where the file ends", async () => {
    const file = mp4(2 * PART + 6);
    // Before the first part, after a skipped part, and a part sent twice
    expect((await send(partOf(file, PART))).status).toBe(409);
    expect((await send(partOf(file, 0))).status).toBe(202);
    expect((await send(partOf(file, 2 * PART))).status).toBe(409);
    expect((await send(partOf(file, PART))).status).toBe(202);
    expect((await send(partOf(file, PART))).status).toBe(409);
    expect((await send(partOf(file, 2 * PART))).status).toBe(201);
    expect((await onlyFile()).bytes.equals(file)).toBe(true);
  });

  it("refuses a part that declares another total than the first part did", async () => {
    const file = mp4(2 * PART + 6);
    await send(partOf(file, 0));
    // As the last part of a file of PART + 6 bytes, it would end the upload a part early
    expect((await send(partOf(file, PART, { total: PART + 6 }))).status).toBe(409);
    expect(await mp4Files()).toStrictEqual([]);
  });

  // The last part checks the partial twice: where it ends before the append, and its whole size
  // before the rename. The partial goes just after one of them, as another upload's start removes
  // one idle for an hour.
  it.each([
    ["its offset check", 1],
    ["its size check, before the rename", 2],
  ])("never saves a file whose partial goes just after %s", async (_case, removingCall) => {
    const file = mp4(PART + 6);
    await send(partOf(file, 0));
    const mocked = vi.mocked(stat);
    if (removingCall === 2) mocked.mockImplementationOnce(realStat);
    mocked.mockImplementationOnce(async (target, options) => {
      const found = await realStat(target, options);
      await rm(target);
      return found;
    });
    expect((await send(partOf(file, PART))).status).toBe(409);
    expect(await mp4Files()).toStrictEqual([]);
  });

  it("refuses a part while another part of the same upload is being written", async () => {
    const file = mp4(16);
    const statuses = await Promise.all([
      send(partOf(file, 0)),
      send(partOf(file, 0)),
      send(partOf(file, 0, { id: "ba9876543210" })),
    ]).then((responses) => responses.map((response) => response.status));
    // Each upload saves its file once: the second request for the first upload is refused
    expect(statuses.sort()).toStrictEqual([201, 201, 409]);
    expect(await mp4Files()).toHaveLength(2);
  });

  it("removes partial files idle for over an hour when an upload starts", async () => {
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);
    const earlier = { "t08-reel-aaaaaaaaaaaa-16.part": 61, "t08-reel-bbbbbbbbbbbb-16.part": 59, "t05-spin-x.json": 61 };
    for (const [name, minutes] of Object.entries(earlier)) {
      await writeFile(path.join(folder, name), "x");
      await utimes(path.join(folder, name), minutesAgo(minutes), minutesAgo(minutes));
    }
    expect((await send(partOf(mp4(PART + 6), 0))).status).toBe(202);
    const left = await names();
    expect(left).toHaveLength(3);
    expect(left).toContain("t08-reel-bbbbbbbbbbbb-16.part");
    expect(left).toContain("t05-spin-x.json");
  });

  it("starts no upload once the folder holds its cap", async () => {
    await fill(MAX_REPORT_FILES);
    expect((await send(partOf(mp4(16), 0))).status).toBe(507);
    expect(await names()).toHaveLength(MAX_REPORT_FILES);
  });

  it.each([
    [
      "a part from another site",
      403,
      () => pageRequest(`/en/dev/report/mp4?id=${ID}&offset=0&total=16`, "video/mp4", mp4(16), "cross-site"),
    ],
    [
      "another content type",
      415,
      () => pageRequest(`/en/dev/report/mp4?id=${ID}&offset=0&total=16`, "application/octet-stream", mp4(16)),
    ],
    [
      "a query the parser refuses",
      400,
      () => pageRequest(`/en/dev/report/mp4?id=${ID}&offset=1&total=16`, "video/mp4", mp4(16)),
    ],
    [
      "a body longer than its part",
      413,
      () => pageRequest(`/en/dev/report/mp4?id=${ID}&offset=0&total=16`, "video/mp4", mp4(17)),
    ],
    [
      "a body shorter than its part",
      400,
      () => pageRequest(`/en/dev/report/mp4?id=${ID}&offset=0&total=16`, "video/mp4", mp4(15)),
    ],
    [
      "a first part that doesn't start like an MP4",
      400,
      () => pageRequest(`/en/dev/report/mp4?id=${ID}&offset=0&total=16`, "video/mp4", new Uint8Array(16)),
    ],
  ])("refuses %s, and saves nothing", async (_case, status, request) => {
    expect((await send(request())).status).toBe(status);
    expect(await names()).toStrictEqual([]);
  });
});

describe("postDevMp4 through handleDevMp4Part", () => {
  it("delivers a file of several parts byte for byte, under the name the reply gives", async () => {
    const file = new Uint8Array(2 * PART + 5).map((_, index) => index % 251);
    file.set([0, 0, 0, 24, ...new TextEncoder().encode("ftyp")]);
    // The page's fetch reaches the handler as the browser sends it, from the site's own page
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      headers.set("sec-fetch-site", "same-origin");
      return handleDevMp4Part(new Request(new URL(url, SITE), { ...init, headers }), folder);
    });
    const saved = await postDevMp4("en", file.buffer);
    const only = await onlyFile();
    expect(saved).toBe(only.name);
    expect(only.bytes.equals(file)).toBe(true);
  });
});
