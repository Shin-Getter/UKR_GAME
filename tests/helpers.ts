import { Terrain } from "../src/data/terrain";
import { HexMap } from "../src/engine/map";
import type { GameState } from "../src/engine/state";

/** A small all-open map for isolated mechanic tests. */
export function openMap(cols = 40, rows = 40): HexMap {
  const map = new HexMap(cols, rows, 0);
  map.terrain.fill(Terrain.Open);
  return map;
}

export function bareState(map: HexMap): GameState {
  return {
    scenarioId: "test",
    seed: 1,
    map,
    startHour: 6,
    tick: 0,
    cycle: 0,
    units: [{ id: "u", name: "u", side: "ua", parentId: null, echelon: "company" }],
    elements: [],
    pending: { ua: null, ru: null },
    history: [],
    lastEvents: [],
  };
}
