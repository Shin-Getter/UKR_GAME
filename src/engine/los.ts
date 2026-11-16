/**
 * Ground line of sight across the hex grid. Terrain obstacles (trees,
 * buildings) on intermediate hexes block the view if they rise above the
 * straight sight line between observer eye and target.
 */
import { TERRAIN, type Terrain } from "../data/terrain";
import { hexLine } from "./hex";
import type { HexMap } from "./map";

export const EYE_HEIGHT_M = 2;
export const TARGET_HEIGHT_M = 2;

export function hasLineOfSight(map: HexMap, from: number, to: number): boolean {
  if (from === to) return true;
  const line = hexLine(map.axialOfIndex(from), map.axialOfIndex(to));
  const n = line.length - 1;
  if (n <= 1) return true;
  const h0 = map.elevation[from]! + EYE_HEIGHT_M;
  const h1 = map.elevation[to]! + TARGET_HEIGHT_M;
  for (let k = 1; k < n; k++) {
    const i = map.indexOfAxial(line[k]!);
    if (i < 0) return false;
    const sight = h0 + ((h1 - h0) * k) / n;
    const top = map.elevation[i]! + TERRAIN[map.terrain[i] as Terrain].obstacleHeight.value;
    if (top > sight) return false;
  }
  return true;
}
