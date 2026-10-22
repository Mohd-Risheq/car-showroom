// topojson-client 3.1.0 ships no types. This declares the one function land.ts calls, with the
// GeoJSON it returns for a polygon layer such as world-atlas's land.
declare module "topojson-client" {
  type Position = [lng: number, lat: number];
  type Geometry =
    { type: "Polygon"; coordinates: Position[][] } | { type: "MultiPolygon"; coordinates: Position[][][] };
  type Feature = { type: "Feature"; geometry: Geometry | null };

  export function feature(
    topology: object,
    object: object,
  ): Feature | { type: "FeatureCollection"; features: Feature[] };
}
