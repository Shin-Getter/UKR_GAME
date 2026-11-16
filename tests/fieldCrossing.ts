/**
 * The field-crossing micro-scenario: an element crosses open ground towards
 * enemy positions watched by a recon drone, with FPV and bomber crews and a
 * mortar behind. Shared by the test and the calibration probe script.
 */
import { Terrain } from "../src/data/terrain";
import { beginMove } from "../src/engine/movement";
import { runTick } from "../src/engine/sim";
import type { Element, GameState, SimEvent } from "../src/engine/state";
import { bareState, el, openMap } from "./helpers";

export interface CrossingSetup {
  typeId: Element["typeId"];
  /** Start hour of day. */
  hour: number;
  /** Terrain along the route column. */
  routeTerrain: Terrain;
  /** Hexes to cross (250 m each). */
  distanceHex: number;
  seed: number;
}

export interface CrossingResult {
  /** Casualties while still moving. */
  casualtiesMoving: number;
  /** Casualties over the whole window (crossing plus holding the far side). */
  casualties: number;
  vehiclesLost: number;
  destroyed: boolean;
  arrived: boolean;
}

/** Window measured: crossing plus holding the far side, in ticks (6 hours). */
export const CROSSING_WINDOW_TICKS = 24;

export function runCrossing(setup: CrossingSetup): CrossingResult {
  const map = openMap(40, 60);
  const col = 20;
  for (let row = 0; row < map.rows; row++) map.terrain[map.index(col, row)] = setup.routeTerrain;
  const state: GameState = bareState(map);
  state.seed = setup.seed;
  state.startHour = setup.hour;
  const startRow = 45;
  const endRow = startRow - setup.distanceHex;
  const mover = el("u1", "ua", setup.typeId, map.index(col, startRow));
  // Enemy: recon drone watching the middle of the crossing, strike assets 4-6 km back.
  const mid = map.index(col, Math.round((startRow + endRow) / 2));
  state.elements.push(
    mover,
    el("r1", "ru", "reconDroneCrew", map.index(col + 2, 5), mid),
    el("r2", "ru", "strikeDroneCrew", map.index(col - 3, 6)),
    el("r3", "ru", "strikeDroneCrew", map.index(col + 4, 7)),
    el("r4", "ru", "bomberDroneCrew", map.index(col - 1, 10)),
    el("r5", "ru", "mortarSection", map.index(col + 1, 12)),
  );
  beginMove(state, mover, map.index(col, endRow));
  const events: SimEvent[] = [];
  const startPersonnel = mover.personnel;
  const startVehicles = mover.vehicles;
  let casualtiesMoving = 0;
  for (let t = 0; t < CROSSING_WINDOW_TICKS; t++) {
    const moving = mover.move !== null;
    runTick(state, events);
    if (moving) casualtiesMoving = startPersonnel - mover.personnel;
    if (!state.elements.includes(mover)) break;
  }
  return {
    casualtiesMoving,
    casualties: startPersonnel - mover.personnel,
    vehiclesLost: startVehicles - mover.vehicles,
    destroyed: !state.elements.includes(mover),
    arrived: mover.hex === map.index(col, endRow),
  };
}

export function crossingStats(base: Omit<CrossingSetup, "seed">, runs: number) {
  let cas = 0;
  let casMoving = 0;
  let veh = 0;
  let hit = 0;
  let destroyed = 0;
  for (let s = 1; s <= runs; s++) {
    const r = runCrossing({ ...base, seed: s });
    cas += r.casualties;
    casMoving += r.casualtiesMoving;
    veh += r.vehiclesLost;
    if (r.casualties > 0 || r.vehiclesLost > 0) hit++;
    if (r.destroyed) destroyed++;
  }
  return { meanCasualtiesMoving: casMoving / runs, meanCasualties: cas / runs, meanVehiclesLost: veh / runs, pHit: hit / runs, pDestroyed: destroyed / runs };
}
