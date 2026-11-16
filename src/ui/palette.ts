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

export const ROAD_COLOR = { track: "#e2d9bc", paved: "#f5f2ea" };

/** Number of elevation shading bands. */
export const RELIEF_BANDS = 8;

export function shade([r, g, b]: [number, number, number], factor: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
