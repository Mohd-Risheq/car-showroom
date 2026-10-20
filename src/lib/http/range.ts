// One byte range from a Range header (RFC 9110 §14), for media: iOS Safari won't play an <audio>
// source whose server ignores ranges. A header this doesn't understand, several ranges included,
// is ignored, and the whole file is served, as RFC 9110 allows.

/** From `start` to `end`, both included */
export type ByteRange = { start: number; end: number };

export function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  if (header === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, first = "", last = ""] = match;
  if (first === "" && last === "") return null;
  if (first === "") {
    // A suffix: the last n bytes
    const length = Number(last);
    if (length === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(first);
  if (last !== "" && Number(last) < start) return null;
  if (start >= size) return "unsatisfiable";
  return { start, end: last === "" ? size - 1 : Math.min(Number(last), size - 1) };
}
