import { describe, expect, it } from "vitest";
import { MAP, toMap } from "@/features/journey/domain/geo";
import { landPath, landSvg } from "@/features/journey/server/land";

// The static map's land (FR-17.6), made at build time from world-atlas's land-110m

/** Each subpath's absolute points, from the path's M, l and z commands */
function subpaths(path: string): Array<Array<[number, number]>> {
  const tokens = path.match(/[Mlz]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const rings: Array<Array<[number, number]>> = [];
  let command = "";
  let numbers: number[] = [];
  for (const token of tokens) {
    if (/[Mlz]/.test(token)) {
      command = token;
      if (token === "M") rings.push([]);
      continue;
    }
    numbers.push(Math.round(Number(token) * 10));
    if (numbers.length < 2) continue;
    const ring = rings.at(-1);
    const [x = 0, y = 0] = numbers;
    const last = ring?.at(-1);
    ring?.push(command === "M" || !last ? [x, y] : [last[0] + x, last[1] + y]);
    numbers = [];
  }
  // In tenths while adding up, so no rounding error creeps in
  return rings.map((ring) => ring.map(([x, y]): [number, number] => [x / 10, y / 10]));
}

describe("the static map's land", () => {
  const rings = subpaths(landPath());

  it("is one SVG file on the static map's frame", () => {
    const svg = landSvg();
    expect(svg).toMatch(
      new RegExp(
        `^<svg xmlns="http://www.w3.org/2000/svg" width="${MAP.width}" height="${MAP.height}" viewBox="0 0 ${MAP.width} ${MAP.height}">`,
      ),
    );
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg.length).toBeLessThan(40_000);
  });

  it("stays inside the map from west to east, with no ring jumping across it", () => {
    expect(rings.length).toBeGreaterThan(100);
    for (const ring of rings) {
      expect(ring.length).toBeGreaterThanOrEqual(3);
      ring.forEach(([x], i) => {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(MAP.width);
        if (i > 0) expect(Math.abs(x - (ring[i - 1]?.[0] ?? x))).toBeLessThan(MAP.width / 2);
      });
    }
  });

  it("cuts the land that crosses the antimeridian, so Chukotka shows at the west edge", () => {
    const [, chukotkaY] = toMap([66, -175]);
    const atEdge = (edge: number) =>
      rings.filter((ring) => ring.some(([x, y]) => x === edge && Math.abs(y - chukotkaY) < 12));
    expect(atEdge(0).length).toBeGreaterThan(0);
    expect(atEdge(MAP.width).length).toBeGreaterThan(0);
  });

  it("leaves Antarctica out", () => {
    const [, south] = toMap([-62, 0]);
    expect(rings.every((ring) => ring.some(([, y]) => y < south))).toBe(true);
  });
});
