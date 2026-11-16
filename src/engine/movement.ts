/**
 * Basic movement: elements walk a straight hex line towards their
 * destination, paying terrain and road costs. A placeholder for the full
 * movement modes (infiltration, dashes, columns) planned for slice 6.
 */
import { ELEMENT_TYPES, Mobility } from "../data/elements";
import { ROAD_COST, WHEELED_OFFROAD_PENALTY } from "../data/movement";
import { TERRAIN, type Terrain } from "../data/terrain";
import { TICKS_PER_HOUR } from "../data/time";
import { DIRECTIONS, HEX_FLAT_TO_FLAT_M, hexLine } from "./hex";
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

/** Start a move: compute the path from the element's hex to the destination. */
export function beginMove(state: GameState, el: Element, destination: number): void {
  const map = state.map;
  const path = hexLine(map.axialOfIndex(el.hex), map.axialOfIndex(destination))
    .map((h) => map.indexOfAxial(h))
    .filter((i) => i >= 0);
  el.move = path.length > 1 ? { path, step: 0, progressM: 0 } : null;
}

export function movementSystem(state: GameState, ctx: TickContext): void {
  for (const el of state.elements) {
    const move = el.move;
    if (!move) continue;
    const type = ELEMENT_TYPES[el.typeId];
    move.progressM += (type.speed.value * 1000) / TICKS_PER_HOUR;
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
      if (move.step === move.path.length - 1) {
        ctx.emit({ kind: "arrived", side: el.side, elementId: el.id, hex: el.hex });
        el.move = null;
        break;
      }
    }
  }
}
