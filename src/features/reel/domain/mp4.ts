// Apple's convention for AAC in MP4, as afconvert writes it (D-030): the encoder's priming sits in
// the edit list, and every packet belongs to a 'roll' sample group with a distance of -1. Without
// the group, AVFoundation (Safari, iOS Photos) trims the priming a second time and the sound plays
// 44 ms early; FFmpeg-based players read the edit list either way, and FFmpeg's own muxer writes
// the same group. Mediabunny (1.61.5 and 1.61.6) writes the edit list but no group, so
// addAacRollGroup adds one to a finished, non-fragmented file.

type Box = { type: string; at: number; size: number; header: number };

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);
const ROLL_BOXES_BYTES = 54;

function children(view: DataView, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  for (let at = start; at + 8 <= end;) {
    let size = view.getUint32(at);
    let header = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) throw new Error(`malformed MP4 box at ${at}`);
    const type = String.fromCharCode(
      view.getUint8(at + 4),
      view.getUint8(at + 5),
      view.getUint8(at + 6),
      view.getUint8(at + 7),
    );
    boxes.push({ type, at, size, header });
    at += size;
  }
  return boxes;
}

const inside = (view: DataView, box: Box) => children(view, box.at + box.header, box.at + box.size);
const find = (view: DataView, box: Box, type: string) => inside(view, box).find((child) => child.type === type);

/** The path from moov down to the stbl of the first AAC audio track, or null without one */
function aacTrackPath(view: DataView, moov: Box): Box[] | null {
  for (const trak of inside(view, moov).filter((box) => box.type === "trak")) {
    const mdia = find(view, trak, "mdia");
    const hdlr = mdia && find(view, mdia, "hdlr");
    // hdlr: version and flags, pre_defined, then handler_type
    if (!mdia || !hdlr || view.getUint32(hdlr.at + hdlr.header + 8) !== 0x736f756e) continue; // 'soun'
    const minf = find(view, mdia, "minf");
    const stbl = minf && find(view, minf, "stbl");
    const stsd = stbl && find(view, stbl, "stsd");
    // stsd: version and flags, entry_count, then the first entry's size and type
    if (!minf || !stbl || !stsd || view.getUint32(stsd.at + stsd.header + 12) !== 0x6d703461) continue; // 'mp4a'
    return [moov, trak, mdia, minf, stbl];
  }
  return null;
}

function hasRollGroup(view: DataView, stbl: Box): boolean {
  return inside(view, stbl).some(
    (box) => box.type === "sgpd" && view.getUint32(box.at + box.header + 4) === 0x726f6c6c,
  ); // 'roll'
}

function sampleCount(view: DataView, stbl: Box): number {
  const stsz = find(view, stbl, "stsz") ?? find(view, stbl, "stz2");
  if (!stsz) throw new Error("audio track has no sample size box");
  // stsz: version and flags, sample_size, sample_count; stz2: version and flags, reserved and field_size, sample_count
  return view.getUint32(stsz.at + stsz.header + 8);
}

/** sgpd version 1 (one 2-byte roll_distance of -1), then sbgp mapping all `samples` to it */
function rollBoxes(samples: number): Uint8Array {
  const bytes = new Uint8Array(ROLL_BOXES_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 26);
  bytes.set([0x73, 0x67, 0x70, 0x64, 1, 0, 0, 0, 0x72, 0x6f, 0x6c, 0x6c], 4); // 'sgpd', v1, 'roll'
  view.setUint32(16, 2); // default_length
  view.setUint32(20, 1); // entry_count
  view.setInt16(24, -1); // roll_distance
  view.setUint32(26, 28);
  bytes.set([0x73, 0x62, 0x67, 0x70, 0, 0, 0, 0, 0x72, 0x6f, 0x6c, 0x6c], 30); // 'sbgp', v0, 'roll'
  view.setUint32(42, 1); // entry_count
  view.setUint32(46, samples); // sample_count
  view.setUint32(50, 1); // group_description_index
  return bytes;
}

/** Adds `by` to every chunk offset at or past `from`, in every track */
function shiftChunkOffsets(view: DataView, box: Box, from: number, by: number): void {
  for (const child of inside(view, box)) {
    if (CONTAINERS.has(child.type)) shiftChunkOffsets(view, child, from, by);
    if (child.type !== "stco" && child.type !== "co64") continue;
    const count = view.getUint32(child.at + child.header + 4);
    const first = child.at + child.header + 8;
    for (let i = 0; i < count; i += 1) {
      if (child.type === "stco") {
        const at = first + i * 4;
        const offset = view.getUint32(at);
        if (offset >= from) view.setUint32(at, offset + by);
      } else {
        const at = first + i * 8;
        const offset = view.getBigUint64(at);
        if (offset >= BigInt(from)) view.setBigUint64(at, offset + BigInt(by));
      }
    }
  }
}

/**
 * The file with a 'roll' group on its AAC track, or the same buffer when there is no AAC track or
 * it already has one. Throws on a file it can't read; encodeReel then keeps the file as it was.
 */
export function addAacRollGroup(mp4: ArrayBuffer): ArrayBuffer {
  const view = new DataView(mp4);
  const moov = children(view, 0, mp4.byteLength).find((box) => box.type === "moov");
  if (!moov) throw new Error("no moov box");
  const path = aacTrackPath(view, moov);
  const stbl = path?.at(-1);
  if (!path || !stbl || hasRollGroup(view, stbl)) return mp4;

  const insertAt = stbl.at + stbl.size;
  const out = new Uint8Array(mp4.byteLength + ROLL_BOXES_BYTES);
  out.set(new Uint8Array(mp4, 0, insertAt), 0);
  out.set(rollBoxes(sampleCount(view, stbl)), insertAt);
  out.set(new Uint8Array(mp4, insertAt), insertAt + ROLL_BOXES_BYTES);

  // Every box on the path ends at or after the insertion, so each grows; none moves
  const outView = new DataView(out.buffer);
  for (const box of path) {
    if (box.header === 16) outView.setBigUint64(box.at + 8, BigInt(box.size + ROLL_BOXES_BYTES));
    else outView.setUint32(box.at, box.size + ROLL_BOXES_BYTES);
  }
  const newMoov = { ...moov, size: moov.size + ROLL_BOXES_BYTES };
  shiftChunkOffsets(outView, newMoov, insertAt, ROLL_BOXES_BYTES);
  return out.buffer;
}
