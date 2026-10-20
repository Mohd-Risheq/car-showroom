"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { MotionConfig, motion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { loadZxingPolyfill, ZXING_WASM_PATH } from "@/features/vin/ui/zxing";
import type { WorkerReply, WorkerRequest } from "./probe.worker";
import { PROBE_QR } from "./qr";
import sample from "./sample.png";

// Spike T-06: everything that could trip either policy (SRS §12.5) on one page. A blocked style
// or script often fails silently, so each check looks for a positive result. The results go in
// <pre data-results> for the capture script, which also counts the violations that happen
// before hydration (docs/evidence/T-06). ?diagnostic=worker-wasm adds the worker WASM test.
// The tab indicator renders Base UI's inline pre-hydration script, which needs the nonce from
// CSPProvider on the dealer side; the capture script checks it with hydration blocked.

type Side = "public" | "dealer";
type Check = { ok: boolean; detail: string };
type Results = {
  side: Side;
  userAgent: string;
  checks: Record<string, Check>;
  violationsAfterHydration: string[];
  diagnostic?: { workerWasm: string; workerViolations: string[] };
};

const TIMEOUT_MS = 5000;
const LOCKED = /hidden|clip/;

function within<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS)),
  ]);
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitFor<T>(find: () => T | null | undefined, label: string): Promise<T> {
  const started = performance.now();
  for (;;) {
    const found = find();
    if (found) return found;
    if (performance.now() - started > TIMEOUT_MS) throw new Error(`${label} timed out`);
    await frame();
  }
}

async function check(run: () => Promise<Check>): Promise<Check> {
  try {
    return await run();
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function runWorker(request: WorkerRequest): Promise<WorkerReply> {
  const worker = new Worker(new URL("./probe.worker.ts", import.meta.url), { type: "module" });
  return within(
    new Promise<WorkerReply>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<WorkerReply>) => resolve(event.data);
      worker.onerror = (event) => reject(new Error(event.message || "worker error"));
      worker.postMessage(request);
    }),
    "worker",
  ).finally(() => worker.terminate());
}

// The element whose overflow scrolls the page, as Base UI's scroll lock decides it
function pageScrollLocked(): boolean {
  const html = document.documentElement;
  const scroller = /auto|scroll|hidden|clip/.test(getComputedStyle(html).overflowY) ? html : document.body;
  return LOCKED.test(getComputedStyle(scroller).overflowY);
}

async function decodeProbeQr(): Promise<Check> {
  const { BarcodeDetector } = await loadZxingPolyfill();
  const image = new window.Image();
  image.src = PROBE_QR.dataUrl;
  await image.decode();
  const codes = await within(new BarcodeDetector({ formats: ["qr_code"] }).detect(image), "scanner");
  return {
    ok: codes.length === 1 && codes[0]?.rawValue === PROBE_QR.text,
    detail: `read ${JSON.stringify(codes.map((code) => code.rawValue))}`,
  };
}

export function CspProbe({ side, nonce }: { side: Side; nonce?: string | undefined }) {
  const image = useRef<HTMLImageElement>(null);
  const styled = useRef<HTMLDivElement>(null);
  const moved = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const [motionDone] = useState(deferred);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [results, setResults] = useState<Results | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const violations: string[] = [];
    const onViolation = (event: SecurityPolicyViolationEvent) => {
      violations.push(`${event.effectiveDirective} ${event.blockedURI}`);
    };
    document.addEventListener("securitypolicyviolation", onViolation);
    const diagnostic = new URLSearchParams(window.location.search).get("diagnostic") === "worker-wasm";

    void (async () => {
      const checks: Record<string, Check> = {};
      checks.hydration = { ok: true, detail: "effects ran" };
      checks.image = await check(async () => {
        const img = await waitFor(
          () => (image.current?.complete && image.current.naturalWidth > 0 ? image.current : null),
          "image",
        );
        return { ok: true, detail: `naturalWidth ${img.naturalWidth}` };
      });
      checks.styleProp = await check(async () => {
        const width = styled.current ? getComputedStyle(styled.current).width : "missing";
        return { ok: width === "123px", detail: `width ${width}` };
      });
      checks.motion = await check(async () => {
        await within(motionDone.promise, "animation");
        const transform = moved.current ? getComputedStyle(moved.current).transform : "missing";
        return { ok: transform === "matrix(1, 0, 0, 1, 48, 0)", detail: `transform ${transform}` };
      });
      checks.tabs = await check(async () => {
        const span = await waitFor(() => (indicator.current && !indicator.current.hidden ? indicator.current : null), "indicator");
        const width = getComputedStyle(span).width;
        return { ok: Number.parseFloat(width) > 0, detail: `indicator width ${width}` };
      });
      checks.toast = await check(async () => {
        toast("CSP probe toast");
        const toaster = await waitFor(() => document.querySelector("[data-sonner-toaster]"), "toaster");
        const position = getComputedStyle(toaster).position;
        return { ok: position === "fixed", detail: `position ${position}` };
      });
      checks.dialog = await check(async () => {
        if (pageScrollLocked()) return { ok: false, detail: "locked before opening" };
        setDialogOpen(true);
        await waitFor(() => pageScrollLocked(), "scroll lock");
        setDialogOpen(false);
        await waitFor(() => !pageScrollLocked(), "scroll unlock");
        return { ok: true, detail: "locked while open, unlocked after" };
      });
      let reply: WorkerReply | undefined;
      checks.worker = await check(async () => {
        reply = await runWorker({ n: 10, wasm: diagnostic });
        return {
          ok: reply.sum === 55 && reply.violations.length === 0,
          detail: `sum ${reply.sum}, violations inside ${JSON.stringify(reply.violations)}`,
        };
      });
      if (side === "dealer") checks.scanner = await check(decodeProbeQr);
      // The scanner's only .wasm request goes to our own copy, never to a CDN (FR-36.2)
      const wasmRequests = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => new URL(name).pathname.endsWith(".wasm"));
      const expected = side === "dealer" ? [new URL(ZXING_WASM_PATH, window.location.origin).href] : [];
      checks.wasmRequests = {
        ok: JSON.stringify(wasmRequests) === JSON.stringify(expected),
        detail: `requested ${JSON.stringify(wasmRequests)}`,
      };

      // Let late violation events arrive before the results are final
      await new Promise((resolve) => setTimeout(resolve, 300));
      setResults({
        side,
        userAgent: navigator.userAgent,
        checks,
        violationsAfterHydration: violations,
        ...(diagnostic
          ? { diagnostic: { workerWasm: reply?.wasm ?? "no reply", workerViolations: reply?.violations ?? [] } }
          : {}),
      });
    })();
  }, [motionDone, side]);

  const failed = results ? Object.entries(results.checks).filter(([, value]) => !value.ok) : [];

  return (
    <MotionConfig {...(nonce ? { nonce } : {})}>
      <section data-state={results ? "done" : "running"} className="grid max-w-xl gap-4">
        <p>
          {results
            ? failed.length === 0
              ? `All ${Object.keys(results.checks).length} checks passed on the ${side} policy.`
              : `Failed: ${failed.map(([name]) => name).join(", ")}`
            : "Running"}
        </p>
        <Image ref={image} src={sample} alt="Probe sample" placeholder="blur" loading="eager" />
        <div ref={styled} style={{ width: 123, height: 8, background: "#5CC8DB" }} />
        <motion.div
          ref={moved}
          className="size-4 bg-white"
          initial={{ x: 0 }}
          animate={{ x: 48 }}
          transition={{ duration: 0.3 }}
          onAnimationComplete={motionDone.resolve}
        />
        <Tabs.Root defaultValue="one">
          <Tabs.List className="relative flex gap-4 pb-1">
            <Tabs.Tab value="one">One</Tabs.Tab>
            <Tabs.Tab value="two">Two</Tabs.Tab>
            <Tabs.Indicator
              ref={indicator}
              renderBeforeHydration
              className="absolute bottom-0 left-(--active-tab-left) h-0.5 w-(--active-tab-width) bg-white"
            />
          </Tabs.List>
        </Tabs.Root>
        <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 bg-black/50" />
            <Dialog.Popup className="fixed top-1/2 left-1/2 -translate-1/2 bg-neutral-900 p-6 text-white">
              <Dialog.Title>Probe dialog</Dialog.Title>
              <Dialog.Description>Locks the page scroll while open.</Dialog.Description>
              <Dialog.Close>Close</Dialog.Close>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
        <Toaster />
        <pre data-results className="text-xs whitespace-pre-wrap">
          {results ? JSON.stringify(results, null, 2) : ""}
        </pre>
        {/* Makes the page scroll, so the dialog has a scroll to lock */}
        <div aria-hidden style={{ height: "150vh" }} />
      </section>
    </MotionConfig>
  );
}
