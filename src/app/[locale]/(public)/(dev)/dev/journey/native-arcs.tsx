"use client";

import { useEffect, useRef } from "react";
import { centreOn, type LatLng } from "@/features/journey/domain/geo";
import { journeySteps } from "@/features/journey/domain/route";

// Spike T-09's comparison for D-031: the same route with cobe 2's own arcs, which all rise to one
// height, set as the COBE Globe pick sets it (arcHeight 0.25, arcWidth 0.5). Drawn once, for a
// screenshot beside the globe.

const ARC_HEIGHT = 0.25;
const ARC_WIDTH = 0.5;

export function NativeArcs({ places, centre }: { places: LatLng[]; centre: number }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = host.current;
    const place = places[centre];
    if (!target || !place) return;
    let cancelled = false;
    let destroy = () => {};
    const timers: number[] = [];
    void Promise.all([import("cobe"), import("@/features/journey/ui/globe")]).then(([{ default: createGlobe }, { globeColours }]) => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "display:block;width:100%;height:100%";
      target.append(canvas);
      const size = target.clientWidth;
      const colours = globeColours(target);
      const surface = colours.baseColor.map((channel) => channel * 0.1);
      const arcColor = colours.accent.map((channel, i) => channel * 0.8 + (surface[i] ?? 0) * 0.2) as [number, number, number];
      const steps = journeySteps(places);
      const { phi, theta } = centreOn(place);
      const globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width: size,
        height: size,
        phi,
        theta,
        dark: 1,
        diffuse: 0.6,
        mapSamples: 16_000,
        mapBrightness: colours.mapBrightness,
        mapBaseBrightness: 0,
        baseColor: colours.baseColor,
        markerColor: colours.accent,
        glowColor: colours.glowColor,
        markerElevation: 0.01,
        markers: steps.flatMap((step) => (step.kind === "unplaced" ? [] : [{ location: [step.place[0], step.place[1]], size: 0.025 }])),
        arcs: steps.flatMap((step) => (step.kind === "arc" ? [{ from: [step.from[0], step.from[1]], to: [step.place[0], step.place[1]] }] : [])),
        arcColor,
        arcHeight: ARC_HEIGHT,
        arcWidth: ARC_WIDTH,
      });
      destroy = () => globe.destroy();
      // cobe draws only when asked, so draw again once its land texture has had time to load
      for (const ms of [100, 500, 1500]) timers.push(window.setTimeout(() => globe.update({}), ms));
    });
    return () => {
      cancelled = true;
      for (const timer of timers) clearTimeout(timer);
      destroy();
      target.replaceChildren();
    };
  }, [places, centre]);

  return <div ref={host} className="aspect-square w-full max-w-[520px]" aria-hidden="true" />;
}
