// Place geometry for the Journey (FR-17), shared by the globe in the browser and the static map on
// the server. Vectors follow cobe 2's convention (its U function): x points at longitude 0, y at
// the north pole and z at longitude -90, on a unit sphere. cobe draws that sphere at radius 0.8.

export type LatLng = readonly [lat: number, lng: number];
export type Vec3 = readonly [x: number, y: number, z: number];
export type MapPoint = [x: number, y: number];

const RAD = Math.PI / 180;
const TURN = 2 * Math.PI;

/** The mean Earth radius (IUGG) */
export const EARTH_RADIUS_KM = 6371.0088;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const along = (a: Vec3, b: Vec3, s: number, t: number): Vec3 => [a[0] * s + b[0] * t, a[1] * s + b[1] * t, a[2] * s + b[2] * t];

export function toVector([lat, lng]: LatLng): Vec3 {
  const cosLat = Math.cos(lat * RAD);
  return [cosLat * Math.cos(lng * RAD), Math.sin(lat * RAD), -cosLat * Math.sin(lng * RAD)];
}

export function toLatLng([x, y, z]: Vec3): LatLng {
  return [Math.atan2(y, Math.hypot(x, z)) / RAD, Math.atan2(-z, x) / RAD];
}

/** The central angle between two places, in radians, accurate for near and antipodal pairs alike */
export function angleBetween(a: LatLng, b: LatLng): number {
  const u = toVector(a);
  const v = toVector(b);
  return Math.atan2(length(cross(u, v)), dot(u, v));
}

export const distanceKm = (a: LatLng, b: LatLng) => angleBetween(a, b) * EARTH_RADIUS_KM;

/**
 * `segments + 1` unit vectors along the shorter great circle from a to b, ends included. Antipodal
 * places have no shorter one, so their path goes over the North Pole.
 */
export function greatCircle(a: LatLng, b: LatLng, segments: number): Vec3[] {
  const u = toVector(a);
  const v = toVector(b);
  const angle = Math.atan2(length(cross(u, v)), dot(u, v));
  // The unit vector a quarter turn from u, in the plane of the path
  let w = along(v, u, 1, -dot(u, v));
  if (length(w) < 1e-9) w = along([0, 1, 0], u, 1, -u[1]);
  if (length(w) < 1e-9) w = [1, 0, 0];
  w = along(w, w, 1 / length(w), 0);
  const points: Vec3[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = (angle * i) / segments;
    points.push(along(u, w, Math.cos(t), Math.sin(t)));
  }
  return points;
}

/** cobe's phi and theta, in radians, that turn a place to the middle of the globe */
export function centreOn([lat, lng]: LatLng): { phi: number; theta: number } {
  return { phi: -Math.PI / 2 - lng * RAD, theta: lat * RAD };
}

/** `to`, moved by whole turns to within half a turn of `from`, so a rotation takes the short way */
export function nearestTurn(from: number, to: number): number {
  return to - TURN * Math.round((to - from) / TURN);
}

/** The static map's frame: plate carrée at 2 units a degree, from 84° N to 58° S (no Antarctica) */
export const MAP = { west: -180, north: 84, unitsPerDegree: 2, width: 720, height: 284 } as const;

export function toMap([lat, lng]: LatLng): MapPoint {
  return [(lng - MAP.west) * MAP.unitsPerDegree, (MAP.north - lat) * MAP.unitsPerDegree];
}

const MAP_STEP_DEGREES = 2;

/**
 * The great circle from a to b on the static map: one polyline, or one more for each crossing of
 * the antimeridian, where each piece runs to the edge of the map.
 */
export function mapRoute(a: LatLng, b: LatLng): MapPoint[][] {
  const segments = Math.max(1, Math.ceil(angleBetween(a, b) / RAD / MAP_STEP_DEGREES));
  const lines: MapPoint[][] = [];
  let line: MapPoint[] = [];
  let previous: LatLng | null = null;
  for (const point of greatCircle(a, b, segments).map(toLatLng)) {
    if (previous && Math.abs(point[1] - previous[1]) > 180) {
      // Crossing the antimeridian: where the path meets the edge, on the latitude between the two
      const edge = previous[1] > 0 ? 180 : -180;
      const next = point[1] + 2 * edge;
      const lat = previous[0] + ((edge - previous[1]) / (next - previous[1])) * (point[0] - previous[0]);
      line.push(toMap([lat, edge]));
      lines.push(line);
      line = [toMap([lat, -edge])];
    }
    line.push(toMap(point));
    previous = point;
  }
  lines.push(line);
  return lines;
}
