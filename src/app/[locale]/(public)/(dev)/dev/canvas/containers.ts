// Spike T-04, for D-025: lists the segments or chunks a browser's encoder wrote, so the page
// shows them next to the upload check's verdict (src/lib/storage/inspect.ts). Diagnostic only.

const MARKERS: Record<number, string> = {
  0xc0: "SOF0",
  0xc1: "SOF1",
  0xc2: "SOF2",
  0xc4: "DHT",
  0xdb: "DQT",
  0xdd: "DRI",
  0xfe: "COM",
};

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length)).replace(/[^\x20-\x7e]/g, ".");
}

export function listContainer(bytes: Uint8Array): string[] {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSegments(bytes);
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return pngChunks(bytes);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return webpChunks(bytes);
  return [`unknown: ${ascii(bytes, 0, 8)}`];
}

function jpegSegments(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const list: string[] = [];
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xda) {
      list.push("SOS");
      break;
    }
    const length = view.getUint16(at + 2);
    const name =
      marker >= 0xe0 && marker <= 0xef
        ? `APP${marker - 0xe0} "${ascii(bytes, at + 4, Math.min(length - 2, 12))}"`
        : (MARKERS[marker] ?? `FF${marker.toString(16).toUpperCase()}`);
    list.push(`${name} (${length - 2} bytes)`);
    at += 2 + length;
  }
  return list;
}

function pngChunks(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const list: string[] = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at);
    list.push(`${ascii(bytes, at + 4, 4)} (${length} bytes)`);
    at += 12 + length;
  }
  return list;
}

function webpChunks(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const list: string[] = [];
  for (let at = 12; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at + 4, true);
    const fourCC = ascii(bytes, at, 4);
    const flags = fourCC === "VP8X" ? `, flags 0x${(bytes[at + 8] ?? 0).toString(16)}` : "";
    list.push(`${fourCC} (${length} bytes${flags})`);
    at += 8 + length + (length % 2);
  }
  return list;
}
