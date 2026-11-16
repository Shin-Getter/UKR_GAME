/**
 * Test scenario on the procedural sector. The river is the line of contact:
 * Russia holds the north bank, Ukraine the south.
 */
import { Terrain } from "../data/terrain";
import { generateSector } from "../engine/mapgen";
import { Rng } from "../engine/rng";
import type { GameState } from "../engine/state";
import { buildForces } from "./forces";

export const TEST_SECTOR_ID = "test-sector";

export function buildTestSector(seed: number): GameState {
  const map = generateSector(seed);
  const rng = new Rng(seed).fork("scenario");

  // Mean river row per column marks the line of contact.
  const riverRow: number[] = [];
  for (let col = 0; col < map.cols; col++) {
    let sum = 0;
    let n = 0;
    for (let row = 0; row < map.rows; row++) {
      if (map.terrainAt(col, row) === Terrain.Water) {
        sum += row;
        n++;
      }
    }
    riverRow.push(n > 0 ? Math.round(sum / n) : Math.floor(map.rows / 2));
  }

  const { units, elements } = buildForces(
    map,
    { orientation: "ew", line: riverRow, rear: { ru: -1, ua: 1 }, laneFrom: 0.15, laneTo: 0.85 },
    rng,
  );

  return {
    scenarioId: TEST_SECTOR_ID,
    seed,
    map,
    startHour: 6,
    tick: 0,
    cycle: 0,
    units,
    elements,
    pending: { ua: null, ru: null },
    history: [],
    lastEvents: [],
  };
}
