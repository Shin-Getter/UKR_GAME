/**
 * Movement: elements follow an A* path to their destination in one of four
 * modes (tactical, column, dash, infiltrate) that trade speed for signature
 * and route choice. Pinned elements do not move; moving loses any field
 * fortification; entering an enemy-held hex is an assault and stops the move.
 */
import { ELEMENT_TYPES, Mobility } from "../data/elements";
import { MOVE_MODE_DEFS, type MoveMode, ROAD_COST, WHEELED_OFFROAD_PENALTY } from "../data/movement";
import { PINNED_AT } from "../data/combat";
import { TERRAIN, type Terrain } from "../data/terrain";
import { TICKS_PER_HOUR } from "../data/time";
import { DIRECTIONS, HEX_FLAT_TO_FLAT_M } from "./hex";
import { findPath } from "./pathfind";
import type { HexMap } from "./map";
import type { Element, GameState } from "./state";
import type { TickContext } from "./sim";

/** Direction index from hex index a to adjacent hex index b, or -1. */
export function directionBetween(map: HexMap, a: number, b: number): number {
  const ha = map.axialOfIndex(a);
  const hb = map.axialOfIndex(b);
  return DIRECTIONS.findIndex((d) => d.q === hb.q - ha.q && d.r === hb.r - ha.r);
}

/** Metres of movement needed to step from hex a into adjacent hex b. Infinity = impassable. */
export function stepCostM(map: HexMap, a: number, b: number, mobility: Mobility): number {
  const d = directionBetween(map, a, b);
  if (d >= 0 && (map.roadEdges[a]! & (1 << d)) !== 0) {
    return HEX_FLAT_TO_FLAT_M * ROAD_COST[mobility].value;
  }
  const def = TERRAIN[map.terrain[b] as Terrain];
  let mult: number;
  if (mobility === Mobility.Foot) mult = def.footMoveCost.value;
  else if (mobility === Mobility.Tracked) mult = def.vehicleMoveCost.value;
  else mult = def.vehicleMoveCost.value * WHEELED_OFFROAD_PENALTY.value;
  return HEX_FLAT_TO_FLAT_M * mult;
}

/** Start a move: find a path from the element's hex to the destination. Returns false if unreachable. */
export function beginMove(
  state: GameState,
  el: Element,
  destination: number,
  mode: MoveMode = "tactical",
  avoid?: ReadonlySet<number>,
): boolean {
  const path = findPath(state.map, el.hex, destination, ELEMENT_TYPES[el.typeId].mobility, mode, avoid);
  el.move = path && path.length > 1 ? { mode, path, step: 0, progressM: 0 } : null;
  return path !== null;
}

export function movementSystem(state: GameState, ctx: TickContext): void {
  for (const el of state.elements) {
    const move = el.move;
    if (!move) continue;
    const type = ELEMENT_TYPES[el.typeId];
    if (el.suppression >= PINNED_AT.value) continue; // pinned: heads down, no progress
    move.progressM += (type.speed.value * MOVE_MODE_DEFS[move.mode].speed * 1000) / TICKS_PER_HOUR;
    for (;;) {
      const next = move.path[move.step + 1];
      if (next === undefined) {
        el.move = null;
        break;
      }
      const cost = stepCostM(state.map, el.hex, next, type.mobility);
      if (!Number.isFinite(cost)) {
        ctx.emit({ kind: "blocked", side: el.side, elementId: el.id, hex: el.hex, note: "impassable ground ahead" });
        el.move = null;
        break;
      }
      if (move.progressM < cost) break;
      move.progressM -= cost;
      move.step++;
      el.hex = next;
      el.hexSince = ctx.tick + 1;
      el.dig = 0;
      // Entering a hex held by the enemy is an assault: the element stops and close combat follows.
      if (state.elements.some((o) => o.side !== el.side && o.hex === next && o.personnel > 0)) {
        el.move = null;
        break;
      }
      if (move.step === move.path.length - 1) {
        ctx.emit({ kind: "arrived", side: el.side, elementId: el.id, hex: el.hex });
        el.move = null;
        break;
      }
    }
  }
}
