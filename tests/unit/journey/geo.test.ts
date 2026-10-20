import { describe, expect, it } from "vitest";
import {
  angleBetween,
  centreOn,
  distanceKm,
  EARTH_RADIUS_KM,
  greatCircle,
  type LatLng,
  MAP,
  mapRoute,
  nearestTurn,
  toLatLng,
  toMap,
  toVector,
  type Vec3,
} from "@/features/journey/domain/geo";

// The Journey's place geometry (FR-17, BR-10). How the globe and the static map look is checked
// in the browsers (spike T-09).

const HOUSTON: LatLng = [29.673, -95.0346];
const AQABA: LatLng = [29.4673, 34.977];
const ZARQA: LatLng = [32.0972, 36.2177];
const AMMAN: LatLng = [31.9516, 35.924];
const FREMONT: LatLng = [37.5483, -121.9886];
const INCHEON: LatLng = [37.4677, 126.6117];
const PLACES = [HOUSTON, AQABA, ZARQA, AMMAN, FREMONT, INCHEON, [0, 0], [-33.9, 18.4], [89.9, 10], [-60, -179.9]] as const;

// cobe 2.0.1's own place vector (its U function), as written in dist/index.esm.js
function cobeVector([lat, lng]: LatLng): Vec3 {
  const r = (lat * Math.PI) / 180;
  const a = (lng * Math.PI) / 180 - Math.PI;
  const o = Math.cos(r);
  return [-o * Math.cos(a), Math.sin(r), o * Math.sin(a)];
}

// cobe 2.0.1's rotation, from its marker shader
function cobeRotate([x, y, z]: Vec3, phi: number, theta: number): Vec3 {
  const [c, d, e, f] = [Math.cos(theta), Math.sin(theta), Math.cos(phi), Math.sin(phi)];
  return [e * x + f * z, f * d * x + c * y - e * d * z, -f * c * x + d * y + e * c * z];
}

// The haversine formula, written independently of geo.ts
function haversineKm([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe("place vectors", () => {
  it("are cobe's own vectors", () => {
    for (const place of PLACES) {
      const ours = toVector(place);
      const cobe = cobeVector(place);
      for (let i = 0; i < 3; i += 1) expect(ours[i]).toBeCloseTo(cobe[i] ?? Number.NaN, 12);
    }
  });

  it("turn back into the same latitude and longitude", () => {
    for (const place of PLACES) {
      const [lat, lng] = toLatLng(toVector(place));
      expect(lat).toBeCloseTo(place[0], 9);
      expect(lng).toBeCloseTo(place[1], 9);
    }
  });
});

describe("distances", () => {
  it("match the haversine formula, near and far", () => {
    for (const a of PLACES) {
      for (const b of PLACES) expect(distanceKm(a, b)).toBeCloseTo(haversineKm(a, b), 6);
    }
    expect(distanceKm(ZARQA, AMMAN)).toBeCloseTo(32.1, 1);
    expect(distanceKm(HOUSTON, AQABA)).toBeGreaterThan(11_000);
  });

  it("reach half a turn for antipodal places", () => {
    expect(angleBetween([10, 20], [-10, -160])).toBeCloseTo(Math.PI, 12);
  });
});

describe("great circles", () => {
  it("run from one place to the other in equal steps on the unit sphere", () => {
    const points = greatCircle(HOUSTON, AQABA, 32);
    expect(points).toHaveLength(33);
    const [start, end] = [points[0] ?? [0, 0, 0], points.at(-1) ?? [0, 0, 0]];
    const [a, b] = [toVector(HOUSTON), toVector(AQABA)];
    for (let i = 0; i < 3; i += 1) {
      expect(start[i]).toBeCloseTo(a[i] ?? Number.NaN, 12);
      expect(end[i]).toBeCloseTo(b[i] ?? Number.NaN, 12);
    }
    const step = angleBetween(HOUSTON, AQABA) / 32;
    const normal: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    points.forEach((point, i) => {
      expect(Math.hypot(...point)).toBeCloseTo(1, 12);
      // In the plane of the two places, so on their great circle
      expect(dot(point, normal)).toBeCloseTo(0, 12);
      if (i > 0) expect(Math.acos(Math.min(1, dot(point, points[i - 1] ?? point)))).toBeCloseTo(step, 9);
    });
  });

  it("stay put for one place, and go over the North Pole for antipodal places", () => {
    for (const point of greatCircle(AMMAN, AMMAN, 4)) expect(dot(point, toVector(AMMAN))).toBeCloseTo(1, 12);
    const over = greatCircle([10, 20], [-10, -160], 64);
    expect(Math.max(...over.map(([, y]) => y))).toBeCloseTo(1, 3);
  });
});

describe("turning the globe", () => {
  it("puts each place in the middle, facing the viewer, as cobe draws it", () => {
    for (const place of PLACES) {
      const { phi, theta } = centreOn(place);
      const [x, y, z] = cobeRotate(cobeVector(place), phi, theta);
      expect(x).toBeCloseTo(0, 12);
      expect(y).toBeCloseTo(0, 12);
      expect(z).toBeCloseTo(1, 12);
    }
  });

  it("takes the short way round", () => {
    for (const [from, to] of [
      [0, 6],
      [3, -3],
      [-20, 20],
      [10, 10 + Math.PI - 0.01],
    ] as const) {
      const near = nearestTurn(from, to);
      expect(Math.abs(near - from)).toBeLessThanOrEqual(Math.PI);
      expect(Math.abs(Math.sin((near - to) / 2))).toBeLessThan(1e-12);
    }
  });
});

describe("the static map", () => {
  it("frames 84° N to 58° S at 2 units a degree", () => {
    expect(toMap([84, -180])).toEqual([0, 0]);
    expect(toMap([-58, 180])).toEqual([MAP.width, MAP.height]);
    expect(toMap(AMMAN)[0]).toBeCloseTo((35.924 + 180) * 2, 9);
  });

  it("draws a route that stays on one side of the antimeridian as one line, place to place", () => {
    const lines = mapRoute(HOUSTON, AQABA);
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line?.[0]).toEqual(toMap(HOUSTON));
    expect(line?.at(-1)?.[0]).toBeCloseTo(toMap(AQABA)[0], 9);
    expect(line?.at(-1)?.[1]).toBeCloseTo(toMap(AQABA)[1], 9);
    // One point at least every 2 degrees of arc
    expect(line?.length).toBeGreaterThanOrEqual(Math.ceil((angleBetween(HOUSTON, AQABA) * 180) / Math.PI / 2) + 1);
  });

  it("cuts a route across the antimeridian at the map's edges, on the great circle's latitude", () => {
    const lines = mapRoute(FREMONT, INCHEON);
    expect(lines).toHaveLength(2);
    const [west, east] = lines;
    const exit = west?.at(-1);
    const entry = east?.[0];
    expect(exit?.[0]).toBe(0);
    expect(entry?.[0]).toBe(MAP.width);
    expect(exit?.[1]).toBe(entry?.[1]);
    // The latitude where the great circle meets longitude 180, from its own formula
    const [lat1, lng1] = FREMONT.map((value) => (value * Math.PI) / 180) as [number, number];
    const [lat2, lng2] = INCHEON.map((value) => (value * Math.PI) / 180) as [number, number];
    const at = Math.PI;
    const crossing = Math.atan(
      (Math.tan(lat1) * Math.sin(at - lng2) - Math.tan(lat2) * Math.sin(at - lng1)) / Math.sin(lng1 - lng2),
    );
    expect(MAP.north - (exit?.[1] ?? 0) / MAP.unitsPerDegree).toBeCloseTo((crossing * 180) / Math.PI, 1);
    // No jump across the map inside either piece
    for (const line of lines) {
      line.forEach((point, i) => {
        if (i > 0) expect(Math.abs(point[0] - (line[i - 1]?.[0] ?? point[0]))).toBeLessThan(MAP.width / 2);
      });
    }
  });
});
