import "server-only";
import { feature } from "topojson-client";
import land110m from "world-atlas/land-110m.json";
import { MAP, toMap } from "../domain/geo";

// The static map's land (FR-17.6): Natural Earth's 1:110m land from world-atlas, drawn on the
// static map's frame when the app is built (SRS §14: no runtime fetch). world-atlas keeps rings
// whole across the antimeridian, as a globe needs, so each one that crosses it is cut in two on
// the flat map. Antarctica falls outside the frame and is left out.

type Ring = Array<[lng: number, lat: number]>;

const SOUTH = MAP.north - MAP.height / MAP.unitsPerDegree;

/** The ring with each longitude moved by whole turns to within 180° of the one before it */
function unwrap(ring: Ring): Ring {
  let shift = 0;
  return ring.map(([lng, lat], i) => {
    const before = ring[i - 1];
    if (before) {
      const step = lng - before[0];
      if (step > 180) shift -= 360;
      else if (step < -180) shift += 360;
    }
    return [lng + shift, lat];
  });
}

/** The part of the ring on one side of a meridian (Sutherland–Hodgman) */
function clip(ring: Ring, meridian: number, keep: "west" | "east"): Ring {
  const inside = (lng: number) => (keep === "west" ? lng <= meridian : lng >= meridian);
  const out: Ring = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length] ?? a;
    if (inside(a[0])) out.push(a);
    if (inside(a[0]) !== inside(b[0])) out.push([meridian, a[1] + ((meridian - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]);
  });
  return out;
}

/** The ring as it falls on the flat map: itself, or its pieces either side of the antimeridian */
function pieces(ring: Ring): Ring[] {
  const whole = unwrap(ring);
  return [-360, 0, 360]
    .map((turn) => clip(clip(whole.map(([lng, lat]): [number, number] => [lng + turn, lat]), 180, "west"), -180, "east"))
    .filter((piece) => piece.length >= 3);
}

// Tenths of a map unit, written as SVG's shortest number: "-.5", "12", "3.4"
const number = (tenths: number) => (tenths / 10).toString().replace(/^(-?)0\./, "$1.");

/** One subpath: the first point, then each step from the one before, to a tenth of a unit */
function ringPath(ring: Ring): string {
  const points: Array<[number, number]> = [];
  for (const [lng, lat] of ring) {
    const [x, y] = toMap([lat, lng]);
    const point: [number, number] = [Math.round(x * 10), Math.round(y * 10)];
    const last = points.at(-1);
    if (!last || last[0] !== point[0] || last[1] !== point[1]) points.push(point);
  }
  const [first] = points;
  const last = points.at(-1);
  if (first && last && points.length > 1 && first[0] === last[0] && first[1] === last[1]) points.pop();
  if (!first || points.length < 3) return "";
  let path = `M${number(first[0])} ${number(first[1])}l`;
  for (let i = 1; i < points.length; i += 1) {
    const [x, y] = points[i] ?? first;
    const [px, py] = points[i - 1] ?? first;
    for (const value of [number(x - px), number(y - py)]) path += `${value.startsWith("-") || path.endsWith("l") ? "" : " "}${value}`;
  }
  return `${path}z`;
}

export function landPath(): string {
  const land = feature(land110m, land110m.objects.land);
  const features = land.type === "FeatureCollection" ? land.features : [land];
  const polygons = features.flatMap(({ geometry }) => {
    if (!geometry) return [];
    return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  });
  return polygons
    .flat()
    .filter((ring) => ring.some(([, lat]) => lat > SOUTH))
    .flatMap(pieces)
    .map(ringPath)
    .join("");
}

/** The land as an SVG file, black on clear, for the static map to use as a mask */
export function landSvg(): string {
  const { width, height } = MAP;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path fill-rule="evenodd" d="${landPath()}"/></svg>\n`;
}
