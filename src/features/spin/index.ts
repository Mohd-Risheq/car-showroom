// The spin viewer's engine, loaded as one lazy chunk (NFR-PERF-03: spin ≤ 20 KB gzipped). The
// decode worker is a chunk of its own, started only by the worker strategy.

export { createDecoder, type DecodeStrategy, type FrameDecoder } from "./ui/decode";
export { bitmapBytes, fitInside } from "./domain/ring";
export { type FrameRecord, type FrameSource, FrameStore, LOW_RES_BOX, type SpinSource } from "./ui/store";
export { type DrawInfo, SpinViewer } from "./ui/viewer";
