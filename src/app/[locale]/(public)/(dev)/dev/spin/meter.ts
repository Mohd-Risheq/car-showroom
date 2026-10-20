// Spike T-05's frame meter (NFR-PERF-04). It records requestAnimationFrame intervals only while
// the viewer moves, from the interaction to the settle, into a preallocated buffer with no
// React state. Chromium also reports long tasks and long animation frames. Safari reports
// neither, so there an interval over 50 ms stands in for a long task.

const CAPACITY = 1 << 15;
const LONG_MS = 50;

export type LongEntry = { type: string; start: number; duration: number };
export type Stats = { count: number; median: number; p95: number; max: number };

export function stats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return { count: sorted.length, median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] ?? 0 };
}

export const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Long tasks and long animation frames, where the browser reports them */
export class LongTaskLog {
  readonly entries: LongEntry[] = [];
  readonly supported: string[] = [];
  readonly #observers: PerformanceObserver[] = [];

  constructor() {
    const types = typeof PerformanceObserver === "function" ? (PerformanceObserver.supportedEntryTypes ?? []) : [];
    for (const type of ["longtask", "long-animation-frame"]) {
      if (!types.includes(type)) continue;
      this.supported.push(type);
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) this.entries.push({ type, start: entry.startTime, duration: entry.duration });
      });
      observer.observe({ type, buffered: false });
      this.#observers.push(observer);
    }
  }

  within(windows: Array<[number, number]>): Record<string, { count: number; maxMs: number }> {
    const result: Record<string, { count: number; maxMs: number }> = {};
    for (const type of this.supported) result[type] = { count: 0, maxMs: 0 };
    for (const entry of this.entries) {
      const overlaps = windows.some(([from, to]) => entry.start < to && entry.start + entry.duration > from);
      const bucket = result[entry.type];
      if (!overlaps || !bucket) continue;
      bucket.count++;
      bucket.maxMs = Math.max(bucket.maxMs, round(entry.duration));
    }
    return result;
  }

  disconnect(): void {
    for (const observer of this.#observers) observer.disconnect();
  }
}

export class FrameMeter {
  readonly windows: Array<[number, number]> = [];
  readonly #intervals = new Float64Array(CAPACITY);
  #count = 0;
  #last = 0;
  #raf = 0;
  #since = -1;

  get running(): boolean {
    return this.#since >= 0;
  }

  start(): void {
    if (this.running) return;
    this.#since = performance.now();
    this.#last = 0;
    this.#raf = requestAnimationFrame(this.#tick);
  }

  stop(): void {
    if (!this.running) return;
    cancelAnimationFrame(this.#raf);
    this.windows.push([this.#since, performance.now()]);
    this.#since = -1;
  }

  #tick = (now: number): void => {
    if (this.#last > 0 && this.#count < CAPACITY) this.#intervals[this.#count++] = now - this.#last;
    this.#last = now;
    this.#raf = requestAnimationFrame(this.#tick);
  };

  /** NFR-PERF-04: ≥ 55 fps median and no long task over 50 ms while interacting */
  summary(refreshMs: number, longTasks: LongTaskLog) {
    const intervals = Array.from(this.#intervals.subarray(0, this.#count));
    const interval = stats(intervals);
    const windowMs = this.windows.reduce((sum, [from, to]) => sum + (to - from), 0);
    return {
      frames: interval.count,
      windowMs: round(windowMs),
      medianFps: interval.median > 0 ? round(1000 / interval.median) : 0,
      intervalMs: { median: round(interval.median, 2), p95: round(interval.p95, 2), max: round(interval.max, 2) },
      // Intervals longer than one and a half refreshes: frames the display waited for
      missedRefreshes: intervals.filter((value) => value > refreshMs * 1.5).length,
      over50ms: intervals.filter((value) => value > LONG_MS).length,
      longTasks: longTasks.within(this.windows),
    };
  }
}
