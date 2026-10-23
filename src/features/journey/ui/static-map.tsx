import type { CSSProperties } from "react";
import { MAP, type MapPoint, mapRoute, toMap, type LatLng } from "../domain/geo";
import { journeySteps } from "../domain/route";

// The Journey's static map (FR-17.6, DESIGN §5.5): the route over a dotted world in SVG and CSS
// only, so it needs neither JavaScript nor WebGL. The land is one file made at build time
// (land.ts), used as a mask over a dot pattern; the route follows each great circle, as the
// globe's arcs do.

const LAND = "/maps/land-110m.svg";

/* eslint-disable muftah/no-raw-style-values -- the dots' size and spacing draw the land as the globe
   draws it; DESIGN §5.5 sets only their colour and opacity */
const land: CSSProperties = {
  backgroundImage: "radial-gradient(circle, var(--line) 0.7px, transparent 0.9px)",
  backgroundSize: "3px 3px",
  maskImage: `url(${LAND})`,
  maskSize: "100% 100%",
  maskRepeat: "no-repeat",
};
/* eslint-enable muftah/no-raw-style-values */

const path = (points: MapPoint[]) => `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}`;

export function StaticRouteMap({ places }: { places: ReadonlyArray<LatLng | null> }) {
  const steps = journeySteps(places);
  const route = steps.flatMap((step) => (step.kind === "arc" ? mapRoute(step.from, step.place) : [])).map(path);
  // A marker is a zero-length stroke with round caps, so it keeps its size at any map size
  const markers = [...new Set(steps.flatMap((step) => (step.kind === "unplaced" ? [] : [path([toMap(step.place)])])))];

  return (
    <div className="relative w-full" style={{ aspectRatio: `${MAP.width} / ${MAP.height}` }} aria-hidden="true">
      <div className="absolute inset-0 opacity-40" style={land} />
      <svg className="absolute inset-0 size-full" viewBox={`0 0 ${MAP.width} ${MAP.height}`}>
        {/* vector-effect is not inherited, so each path carries it */}
        <g fill="none" stroke="var(--scan)" strokeLinecap="round" strokeLinejoin="round">
          <path d={route.join("")} strokeOpacity={0.8} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={markers.map((marker) => `${marker}h0`).join("")} strokeWidth={6} vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
    </div>
  );
}
