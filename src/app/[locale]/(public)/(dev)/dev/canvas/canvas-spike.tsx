"use client";

import { useEffect, useRef, useState } from "react";
import { inspectMedia } from "@/lib/storage/inspect";
import type { MediaType } from "@/lib/storage/rules";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  type CardLines,
  drawSpikeCard,
  FAMILY,
  formatInteger,
  type SpikeLocale,
  spikeText,
} from "./card";
import { listContainer } from "./containers";
import type { WorkerReply } from "./encode.worker";

// Spike T-04 (R-01): Arabic and English cards on a canvas, the same card drawn in a worker, and
// what each encoder writes (D-025). The results are shown on the page and, as JSON, in
// <pre data-results> for the capture script.

const LOCALES: SpikeLocale[] = ["ar", "en"];
const TYPES = ["image/webp", "image/jpeg", "image/png"];
const CHECKED_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

type Encoded = {
  via: "toBlob" | "convertToBlob (worker)";
  requested: string;
  type: string;
  bytes: number;
  verdict: string;
  container: string[];
};

type Results = {
  userAgent: string;
  features: Record<string, string | number | boolean>;
  digits: Record<SpikeLocale, string>;
  cards: Record<SpikeLocale, CardLines>;
  worker: { ok: boolean; error?: string; differingPixels?: number };
  encoders: Encoded[];
};

function encoded(via: Encoded["via"], requested: string, type: string, bytes: Uint8Array): Encoded {
  const result = CHECKED_TYPES.has(type) ? inspectMedia(bytes, type as MediaType) : undefined;
  const verdict = !result ? "not checked" : result.ok ? "accepted" : `${result.code} ${result.reason}`;
  return { via, requested, type, bytes: bytes.length, verdict, container: listContainer(bytes) };
}

function codePoints(text: string): string {
  return [...text].map((char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`).join(" ");
}

function runWorker(): Promise<WorkerReply> {
  const worker = new Worker(new URL("./encode.worker.ts", import.meta.url), { type: "module" });
  return new Promise<WorkerReply>((resolve) => {
    worker.onmessage = (event: MessageEvent<WorkerReply>) => resolve(event.data);
    worker.onerror = (event) => resolve({ ok: false, error: event.message || "worker error" });
    worker.postMessage(null);
  }).finally(() => worker.terminate());
}

type Canvases = Record<SpikeLocale | "worker", HTMLCanvasElement>;

async function runSpike(canvases: Canvases): Promise<Results> {
  await document.fonts.ready;
  const cards = {} as Record<SpikeLocale, CardLines>;
  for (const locale of LOCALES) {
    const ctx = canvases[locale].getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    cards[locale] = drawSpikeCard(ctx, locale);
  }

  const encoders: Encoded[] = [];
  for (const type of TYPES) {
    const blob = await new Promise<Blob | null>((resolve) => canvases.ar.toBlob(resolve, type, 0.82));
    if (blob) encoders.push(encoded("toBlob", type, blob.type, new Uint8Array(await blob.arrayBuffer())));
  }

  const reply = await runWorker();
  let worker: Results["worker"] = { ok: false, error: "no reply" };
  const features: Results["features"] = {
    "Intl.Segmenter": typeof Intl.Segmenter === "function",
    "CanvasRenderingContext2D.direction": "direction" in CanvasRenderingContext2D.prototype,
    "CanvasRenderingContext2D.letterSpacing": "letterSpacing" in CanvasRenderingContext2D.prototype,
    OffscreenCanvas: typeof OffscreenCanvas === "function",
    devicePixelRatio: window.devicePixelRatio,
  };
  if (reply.ok) {
    features["OffscreenCanvasRenderingContext2D.direction"] = reply.directionSupported;
    for (const item of reply.encodes) {
      encoders.push(encoded("convertToBlob (worker)", item.requested, item.type, new Uint8Array(item.bytes)));
    }
    const main = canvases.ar.getContext("2d")?.getImageData(0, 0, CARD_WIDTH, CARD_HEIGHT).data;
    const other = new Uint8ClampedArray(reply.pixels);
    canvases.worker.getContext("2d")?.putImageData(new ImageData(other, CARD_WIDTH, CARD_HEIGHT), 0, 0);
    let differing = 0;
    for (let k = 0; main && k < main.length; k += 4) {
      if (main[k] !== other[k] || main[k + 1] !== other[k + 1] || main[k + 2] !== other[k + 2]) differing++;
    }
    worker = { ok: true, differingPixels: differing };
  } else {
    worker = { ok: false, error: reply.error };
  }

  return {
    userAgent: navigator.userAgent,
    features,
    digits: { ar: codePoints(formatInteger(14500, "ar")), en: codePoints(formatInteger(14500, "en")) },
    cards,
    worker,
    encoders,
  };
}

export function CanvasSpike() {
  const canvases = useRef<Partial<Canvases>>({});
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { ar, en, worker } = canvases.current;
    if (!ar || !en || !worker) return;
    runSpike({ ar, en, worker }).then(setResults, (reason: unknown) => setError(String(reason)));
  }, []);

  return (
    <section data-ready={results || error ? "true" : "false"} className="grid gap-6">
      <div className="flex flex-wrap gap-4">
        {LOCALES.map((locale) => (
          <figure key={locale} className="grid gap-2">
            <canvas
              ref={(element) => {
                if (element) canvases.current[locale] = element;
              }}
              data-card={locale}
              lang={locale}
              dir={locale === "ar" ? "rtl" : "ltr"}
              width={CARD_WIDTH}
              height={CARD_HEIGHT}
              className="w-[min(540px,100%)] border border-neutral-700"
            />
            <figcaption>canvas, {locale}</figcaption>
          </figure>
        ))}
        <figure className="grid gap-2">
          <canvas
            ref={(element) => {
              if (element) canvases.current.worker = element;
            }}
            data-card="worker-ar"
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            className="w-[min(540px,100%)] border border-neutral-700"
          />
          <figcaption>OffscreenCanvas in a worker, ar</figcaption>
        </figure>
      </div>

      <div className="grid gap-4">
        <h2 className="text-base">The same text in HTML, in the canvas font, for comparison</h2>
        {LOCALES.map((locale) => {
          const text = spikeText(locale);
          return (
            <div key={locale} lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className="max-w-[540px]" style={{ fontFamily: FAMILY }}>
              <p className="text-2xl font-semibold">{text.title}</p>
              <p className="text-lg">{text.facts}</p>
              <p className="text-base">{text.body}</p>
              <p className="text-lg font-semibold">{text.question}</p>
            </div>
          );
        })}
      </div>

      {error ? <p role="alert">Spike failed: {error}</p> : null}
      {results ? (
        <div className="grid gap-4">
          <h2 className="text-base">Encoders (D-025)</h2>
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="border px-2 text-start">via</th>
                <th className="border px-2 text-start">requested</th>
                <th className="border px-2 text-start">got</th>
                <th className="border px-2 text-start">bytes</th>
                <th className="border px-2 text-start">upload check</th>
                <th className="border px-2 text-start">segments or chunks</th>
              </tr>
            </thead>
            <tbody>
              {results.encoders.map((row) => (
                <tr key={`${row.via}-${row.requested}`}>
                  <td className="border px-2">{row.via}</td>
                  <td className="border px-2">{row.requested}</td>
                  <td className="border px-2">{row.type}</td>
                  <td className="border px-2">{row.bytes}</td>
                  <td className="border px-2">{row.verdict}</td>
                  <td className="border px-2" dir="ltr">
                    {row.container.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="text-base">Results</h2>
          <pre data-results dir="ltr" className="overflow-x-auto whitespace-pre-wrap text-xs">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
