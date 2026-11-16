/**
 * Procedural test sector: steppe fields divided by windbreak treelines, a
 * river roughly parallel to the front, forest patches, villages, one town
 * and a road network.
 *
 * This is a stand-in until real maps are imported from elevation and
 * OpenStreetMap data (slice 3). It is fully deterministic for a given seed.
 */
import { Terrain } from "../data/terrain";
import { type Axial, hexDistance, hexLine, hexToWorld, offsetToAxial } from "./hex";
import { HexMap, RoadClass } from "./map";
import { hash2, Rng } from "./rng";

export interface SectorOptions {
  /** Hex columns (east-west). 96 x 250 m = 24 km frontage. */
  cols?: number;
  /** Hex rows (north-south). 185 rows = about 40 km depth. */
  rows?: number;
  villages?: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise in [0, 1) over world metres with the given cell size. */
function valueNoise(x: number, y: number, cell: number, seed: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smooth(gx - x0);
  const ty = smooth(gy - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

export function generateSector(seed: number, options: SectorOptions = {}): HexMap {
  const cols = options.cols ?? 96;
  const rows = options.rows ?? 185;
  const map = new HexMap(cols, rows, seed);
  const rng = new Rng(seed);
  const at = (col: number, row: number) => map.index(col, row);
  const world = (col: number, row: number) => hexToWorld(offsetToAxial({ col, row }));

  // 1. Elevation: gentle rolling steppe, 150-250 m.
  const elevSeed = rng.fork("elevation").nextU32();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const { x, y } = world(col, row);
      const e =
        150 +
        70 * valueNoise(x, y, 6000, elevSeed) +
        20 * valueNoise(x, y, 1800, elevSeed ^ 0x1234) +
        6 * valueNoise(x, y, 600, elevSeed ^ 0x5678);
      map.elevation[at(col, row)] = Math.round(e);
    }
  }

  // 2. River: a meandering line across the sector, roughly parallel to the front.
  const riverRng = rng.fork("river");
  const riverRow = new Int32Array(cols);
  let rRow = Math.floor(rows * (0.45 + 0.15 * riverRng.float()));
  let drift = 0;
  for (let col = 0; col < cols; col++) {
    drift = Math.max(-2, Math.min(2, drift + riverRng.range(-1, 1)));
    const next = Math.max(4, Math.min(rows - 5, rRow + Math.sign(drift) * riverRng.range(0, 1)));
    const lo = Math.min(rRow, next);
    const hi = Math.max(rRow, next);
    for (let row = lo; row <= hi; row++) map.terrain[at(col, row)] = Terrain.Water;
    rRow = next;
    riverRow[col] = rRow;
  }
  // Carve a valley so the river sits low.
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const d = Math.abs(row - riverRow[col]!);
      if (d < 10) map.elevation[at(col, row)]! -= Math.round(18 * (1 - d / 10));
    }
  }

  // 3. Forest: larger woods from low-frequency noise, riparian woods near the river.
  const forestSeed = rng.fork("forest").nextU32();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = at(col, row);
      if (map.terrain[i] !== Terrain.Open) continue;
      const { x, y } = world(col, row);
      const n = valueNoise(x, y, 2200, forestSeed) * 0.75 + valueNoise(x, y, 500, forestSeed ^ 0x9e37) * 0.25;
      const nearRiver = Math.abs(row - riverRow[col]!) <= 4;
      if (n > (nearRiver ? 0.58 : 0.74)) map.terrain[i] = Terrain.Forest;
    }
  }

  // 4. Windbreak treelines dividing fields of roughly 1-2 km.
  const treeRng = rng.fork("treelines");
  const markTree = (col: number, row: number) => {
    if (!map.inBounds(col, row)) return;
    const i = at(col, row);
    if (map.terrain[i] === Terrain.Open) map.terrain[i] = Terrain.Treeline;
  };
  const lineRows: number[] = [];
  for (let row = treeRng.range(2, 5); row < rows; row += treeRng.range(5, 8)) lineRows.push(row);
  for (const baseRow of lineRows) {
    let col = 0;
    while (col < cols) {
      const segLen = treeRng.range(6, 20);
      const row = baseRow + treeRng.range(-1, 1);
      for (let c = col; c < Math.min(cols, col + segLen); c++) {
        if (treeRng.chance(0.07)) {
          c += treeRng.range(0, 2); // gap in the windbreak
          continue;
        }
        markTree(c, row);
      }
      col += segLen;
    }
  }
  const lineCols: number[] = [];
  for (let col = treeRng.range(2, 6); col < cols; col += treeRng.range(6, 10)) lineCols.push(col);
  for (const baseCol of lineCols) {
    for (let k = 0; k + 1 < lineRows.length; k++) {
      if (treeRng.chance(0.25)) continue; // merged fields: no divider here
      const col = baseCol + treeRng.range(-1, 1);
      for (let row = lineRows[k]!; row <= lineRows[k + 1]!; row++) {
        if (!treeRng.chance(0.06)) markTree(col, row);
      }
    }
  }

  // 5. Settlements: one town by the river, villages elsewhere.
  const setRng = rng.fork("settlements");
  const centres: Axial[] = [];
  const placeSettlement = (centre: Axial, radius: number, urbanRadius: number) => {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dq = -radius; dq <= radius; dq++) {
        const h = { q: centre.q + dq, r: centre.r + dr };
        const dist = hexDistance(centre, h);
        if (dist > radius) continue;
        const i = map.indexOfAxial(h);
        if (i < 0 || map.terrain[i] === Terrain.Water) continue;
        // Ragged edges: outer ring only partly built up.
        if (dist === radius && setRng.chance(0.4)) continue;
        map.terrain[i] = dist <= urbanRadius ? Terrain.Urban : Terrain.Village;
      }
    }
    centres.push(centre);
  };
  const townCol = setRng.range(Math.floor(cols * 0.3), Math.floor(cols * 0.7));
  const town = offsetToAxial({ col: townCol, row: riverRow[townCol]! + 3 });
  placeSettlement(town, 5, 2);
  const villageCount = options.villages ?? 12;
  for (let attempt = 0; attempt < villageCount * 40 && centres.length < villageCount + 1; attempt++) {
    const col = setRng.range(3, cols - 4);
    const row = setRng.range(3, rows - 4);
    if (map.terrain[at(col, row)] === Terrain.Water) continue;
    const h = offsetToAxial({ col, row });
    if (centres.some((c) => hexDistance(c, h) < 14)) continue;
    placeSettlement(h, setRng.range(1, 3), 0);
  }

  // 6. Marsh along low river banks.
  const marshRng = rng.fork("marsh");
  for (let col = 0; col < cols; col++) {
    for (let dr = -2; dr <= 2; dr++) {
      const row = riverRow[col]! + dr;
      if (!map.inBounds(col, row)) continue;
      const i = at(col, row);
      if (map.terrain[i] === Terrain.Open && marshRng.chance(0.35)) map.terrain[i] = Terrain.Marsh;
    }
  }

  // 7. Roads: tracks link settlements (minimum spanning tree), a paved road runs
  //    north-south through the town, and a paved lateral road runs behind the river.
  const markRoad = (a: Axial, b: Axial, cls: RoadClass) => {
    for (const h of hexLine(a, b)) {
      const i = map.indexOfAxial(h);
      if (i >= 0 && map.road[i]! < cls) map.road[i] = cls;
    }
  };
  const inTree = [0];
  const remaining = centres.map((_, i) => i).slice(1);
  while (remaining.length > 0) {
    let best = { from: 0, to: 0, d: Infinity };
    for (const a of inTree) {
      for (const b of remaining) {
        const d = hexDistance(centres[a]!, centres[b]!);
        if (d < best.d) best = { from: a, to: b, d };
      }
    }
    markRoad(centres[best.from]!, centres[best.to]!, RoadClass.Track);
    inTree.push(best.to);
    remaining.splice(remaining.indexOf(best.to), 1);
  }
  const roadRng = rng.fork("roads");
  const north = offsetToAxial({ col: Math.max(0, Math.min(cols - 1, townCol + roadRng.range(-12, 12))), row: 0 });
  const south = offsetToAxial({ col: Math.max(0, Math.min(cols - 1, townCol + roadRng.range(-12, 12))), row: rows - 1 });
  markRoad(north, town, RoadClass.Paved);
  markRoad(town, south, RoadClass.Paved);
  const lateralRow = Math.min(rows - 1, riverRow[townCol]! + roadRng.range(12, 20));
  markRoad(offsetToAxial({ col: 0, row: lateralRow }), offsetToAxial({ col: cols - 1, row: lateralRow }), RoadClass.Paved);

  return map;
}
