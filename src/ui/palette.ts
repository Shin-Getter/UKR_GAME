import { Terrain } from "../data/terrain";

export const TERRAIN_COLOR: Record<Terrain, [number, number, number]> = {
  [Terrain.Open]: [201, 192, 140],
  [Terrain.Treeline]: [79, 107, 52],
  [Terrain.Forest]: [52, 84, 40],
  [Terrain.Village]: [176, 137, 104],
  [Terrain.Urban]: [128, 116, 108],
  [Terrain.Marsh]: [140, 160, 120],
  [Terrain.Water]: [74, 127, 168],
};

/**
 * Roads are drawn by luminance contrast, not hue, so they stay readable on the
 * pale field colour and under warm screen tints (f.lux, Night Shift): paved
 * roads get a near-black casing around a light core, tracks are dark brown.
 */
export const ROAD_COLOR = { track: "#4a3826", pavedCasing: "#1c1c1c", paved: "#efece4" };

/** Number of elevation shading bands. */
export const RELIEF_BANDS = 8;

export function shade([r, g, b]: [number, number, number], factor: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
