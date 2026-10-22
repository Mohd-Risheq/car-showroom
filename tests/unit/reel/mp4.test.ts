import { describe, expect, it } from "vitest";
import { addAacRollGroup } from "@/features/reel/domain/mp4";

// D-030: Apple's convention for AAC priming. The expected bytes are the ones afconvert and FFmpeg's
// muxer write: sgpd version 1, 'roll', a default length of 2, one entry of -1; then sbgp, 'roll',
// one run covering every sample, in group 1

const ROLL_BYTES = 54;
const SGPD = "0000001a73677064" + "01000000726f6c6c0000000200000001ffff";
const sbgp = (samples: number) =>
  `0000001c73626770${"00000000726f6c6c00000001"}${samples.toString(16).padStart(8, "0")}00000001`;

const CHUNK = 16;
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

const u32 = (value: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
};
const u64 = (value: number) => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value));
  return bytes;
};
const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const full = () => new Uint8Array(4);

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const box = (type: string, ...parts: Uint8Array[]) => {
  const body = concat(parts);
  return concat([u32(8 + body.length), ascii(type), body]);
};
// A box whose size is in the 64-bit field after the type
const largeBox = (type: string, ...parts: Uint8Array[]) => {
  const body = concat(parts);
  return concat([u32(1), ascii(type), u64(16 + body.length), body]);
};

type Track = { handler: string; entry: string; samples: number; offsets: number[]; co64: boolean };

function trak({ handler, entry, samples, offsets, co64 }: Track): Uint8Array {
  const hdlr = box("hdlr", full(), u32(0), ascii(handler), new Uint8Array(12), ascii("test\0"));
  const stsd = box("stsd", full(), u32(1), box(entry, new Uint8Array(28)));
  const stsz = box("stsz", full(), u32(0), u32(samples), ...Array.from({ length: samples }, () => u32(CHUNK / 2)));
  const chunks = co64
    ? box("co64", full(), u32(offsets.length), ...offsets.map(u64))
    : box("stco", full(), u32(offsets.length), ...offsets.map(u32));
  const stbl = box("stbl", stsd, box("stts", full(), u32(0)), box("stsc", full(), u32(0)), stsz, chunks);
  return box(
    "trak",
    box("tkhd", full(), new Uint8Array(80)),
    box("mdia", box("mdhd", full(), new Uint8Array(20)), hdlr, box("minf", stbl)),
  );
}

type Layout = {
  audioFirst?: boolean;
  moovLast?: boolean;
  co64?: boolean;
  largeMoov?: boolean;
  audioEntry?: string | null;
};

/** ftyp, moov and mdat, with three video chunks and two audio chunks of distinct bytes in mdat */
function makeMp4(layout: Layout = {}): ArrayBuffer {
  const co64 = layout.co64 ?? false;
  const moovAt = (base: number) => {
    const video = trak({
      handler: "vide",
      entry: "avc1",
      samples: 6,
      offsets: [0, 1, 2].map((i) => base + i * CHUNK),
      co64,
    });
    const traks = [video];
    if (layout.audioEntry !== null) {
      const audio = trak({
        handler: "soun",
        entry: layout.audioEntry ?? "mp4a",
        samples: 4,
        offsets: [3, 4].map((i) => base + i * CHUNK),
        co64,
      });
      traks[layout.audioFirst ? "unshift" : "push"](audio);
    }
    return (layout.largeMoov ? largeBox : box)("moov", box("mvhd", full(), new Uint8Array(96)), ...traks);
  };
  const ftyp = box("ftyp", ascii("isom"), u32(512), ascii("isomavc1"));
  const mdat = box(
    "mdat",
    Uint8Array.from({ length: 5 * CHUNK }, (_, i) => 1 + Math.floor(i / CHUNK)),
  );
  // The offsets are fixed-width, so the moov is as long whatever they say
  const base = layout.moovLast ? ftyp.length + 8 : ftyp.length + moovAt(0).length + 8;
  return (layout.moovLast ? concat([ftyp, mdat, moovAt(base)]) : concat([ftyp, moovAt(base), mdat])).buffer;
}

type Node = { type: string; at: number; size: number; header: number; children: Node[] };

function parse(view: DataView, start: number, end: number): Node[] {
  const nodes: Node[] = [];
  for (let at = start; at < end;) {
    const large = view.getUint32(at) === 1;
    const size = large ? Number(view.getBigUint64(at + 8)) : view.getUint32(at);
    const header = large ? 16 : 8;
    const type = String.fromCharCode(...new Uint8Array(view.buffer, at + 4, 4));
    nodes.push({ type, at, size, header, children: CONTAINERS.has(type) ? parse(view, at + header, at + size) : [] });
    at += size;
  }
  return nodes;
}

function child(nodes: Node[], type: string): Node {
  const found = nodes.find((node) => node.type === type);
  if (!found) throw new Error(`no ${type}`);
  return found;
}

/** The parsed file, and per handler the boxes from moov down to stbl */
function read(file: ArrayBuffer) {
  const view = new DataView(file);
  const top = parse(view, 0, file.byteLength);
  const moov = child(top, "moov");
  const tracks = new Map<string, { trak: Node; mdia: Node; minf: Node; stbl: Node }>();
  for (const trak of moov.children.filter((node) => node.type === "trak")) {
    const mdia = child(trak.children, "mdia");
    const hdlr = child(mdia.children, "hdlr");
    const minf = child(mdia.children, "minf");
    tracks.set(String.fromCharCode(...new Uint8Array(file, hdlr.at + 16, 4)), {
      trak,
      mdia,
      minf,
      stbl: child(minf.children, "stbl"),
    });
  }
  const offsets = (handler: string) => {
    const stbl = tracks.get(handler)?.stbl;
    const table = stbl?.children.find((node) => node.type === "stco" || node.type === "co64");
    if (!table) throw new Error(`no chunk offsets for ${handler}`);
    const count = view.getUint32(table.at + 12);
    return Array.from({ length: count }, (_, i) =>
      table.type === "stco" ? view.getUint32(table.at + 16 + i * 4) : Number(view.getBigUint64(table.at + 16 + i * 8)),
    );
  };
  const track = (handler: string) => {
    const found = tracks.get(handler);
    if (!found) throw new Error(`no ${handler} track`);
    return found;
  };
  return { top, moov, track, offsets, bytes: (node: Node) => hex(new Uint8Array(file, node.at, node.size)) };
}

const chunkAt = (file: ArrayBuffer, offset: number) => hex(new Uint8Array(file, offset, CHUNK));

describe("addAacRollGroup", () => {
  it("adds Apple's roll group at the end of the AAC track's sample table", () => {
    const input = makeMp4();
    const output = addAacRollGroup(input);
    expect(output.byteLength).toBe(input.byteLength + ROLL_BYTES);

    const file = read(output);
    const tables = file.track("soun").stbl.children;
    expect(tables.map((node) => node.type)).toEqual(["stsd", "stts", "stsc", "stsz", "stco", "sgpd", "sbgp"]);
    expect(file.bytes(child(tables, "sgpd"))).toBe(SGPD);
    expect(file.bytes(child(tables, "sbgp"))).toBe(sbgp(4));
    expect(file.track("vide").stbl.children.map((node) => node.type)).toEqual(["stsd", "stts", "stsc", "stsz", "stco"]);
  });

  it("grows every box from moov to the audio sample table, and only those", () => {
    const before = read(makeMp4());
    const after = read(addAacRollGroup(makeMp4()));
    expect(after.moov.size).toBe(before.moov.size + ROLL_BYTES);
    for (const level of ["trak", "mdia", "minf", "stbl"] as const) {
      expect(after.track("soun")[level].size).toBe(before.track("soun")[level].size + ROLL_BYTES);
      expect(after.track("vide")[level].size).toBe(before.track("vide")[level].size);
    }
    expect(after.top.map((node) => [node.type, node.size])).toEqual(
      before.top.map((node) => [node.type, node.type === "moov" ? node.size + ROLL_BYTES : node.size]),
    );
  });

  it.each([
    ["audio after video", {}],
    ["audio before video", { audioFirst: true }],
    ["64-bit chunk offsets", { co64: true }],
    ["a 64-bit moov size", { largeMoov: true }],
  ])("moves every chunk offset with the media, %s", (_, layout: Layout) => {
    const input = makeMp4(layout);
    const output = addAacRollGroup(input);
    const before = read(input);
    const after = read(output);
    for (const handler of ["vide", "soun"]) {
      expect(after.offsets(handler)).toEqual(before.offsets(handler).map((offset) => offset + ROLL_BYTES));
      after
        .offsets(handler)
        .forEach((offset, i) => expect(chunkAt(output, offset)).toBe(chunkAt(input, before.offsets(handler)[i] ?? -1)));
    }
    expect(after.moov.size).toBe(before.moov.size + ROLL_BYTES);
  });

  it("keeps the 64-bit size form of a box on the path", () => {
    const output = addAacRollGroup(makeMp4({ largeMoov: true }));
    const moov = read(output).moov;
    expect(moov.header).toBe(16);
    expect(new DataView(output).getUint32(moov.at)).toBe(1);
  });

  it("leaves the offsets alone when the media comes before the index", () => {
    const input = makeMp4({ moovLast: true });
    const output = addAacRollGroup(input);
    const before = read(input);
    const after = read(output);
    for (const handler of ["vide", "soun"]) {
      expect(after.offsets(handler)).toEqual(before.offsets(handler));
      for (const offset of after.offsets(handler)) expect(chunkAt(output, offset)).toBe(chunkAt(input, offset));
    }
  });

  it("returns the same buffer when the AAC track already has the group", () => {
    const once = addAacRollGroup(makeMp4());
    expect(addAacRollGroup(once)).toBe(once);
  });

  it("returns the same buffer for a silent reel or an audio track that isn't AAC", () => {
    const silent = makeMp4({ audioEntry: null });
    expect(addAacRollGroup(silent)).toBe(silent);
    const opus = makeMp4({ audioEntry: "Opus" });
    expect(addAacRollGroup(opus)).toBe(opus);
  });

  it("throws on a file it can't read", () => {
    expect(() => addAacRollGroup(concat([box("ftyp", ascii("isom")), box("mdat", new Uint8Array(8))]).buffer)).toThrow(
      "no moov box",
    );
    const cut = makeMp4().slice(0, 200);
    expect(() => addAacRollGroup(cut)).toThrow("malformed MP4 box");
  });
});
