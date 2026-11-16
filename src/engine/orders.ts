import { ELEMENT_SENSORS, SENSORS } from "../data/sensing";
import { ELEMENT_TYPES, Mobility } from "../data/elements";
import { MOVE_MODE_DEFS, type MoveMode } from "../data/movement";
import { TERRAIN } from "../data/terrain";
import { hexDistance, offsetToAxial } from "./hex";
import type { Offset } from "./hex";
import type { GameState, SideId } from "./state";

export type Order =
  | { kind: "move"; elementId: string; to: Offset; mode?: MoveMode }
  | { kind: "hold"; elementId: string }
  /** Drone crews: centre of the area the drones patrol. */
  | { kind: "patrol"; elementId: string; at: Offset };

/** One side's orders for one cycle. */
export interface Orders {
  side: SideId;
  cycle: number;
  orders: Order[];
}

export interface Rejection {
  order: Order;
  reason: string;
}

export interface ValidationResult {
  accepted: Order[];
  rejected: Rejection[];
}

/** Check orders against the current state; invalid ones are rejected with reasons. */
export function validateOrders(state: GameState, orders: Orders): ValidationResult {
  const accepted: Order[] = [];
  const rejected: Rejection[] = [];
  const seen = new Set<string>();
  if (orders.cycle !== state.cycle) {
    return {
      accepted,
      rejected: orders.orders.map((order) => ({ order, reason: `orders are for cycle ${orders.cycle}, current cycle is ${state.cycle}` })),
    };
  }
  for (const order of orders.orders) {
    const el = state.elements.find((e) => e.id === order.elementId);
    if (!el) {
      rejected.push({ order, reason: `unknown element ${order.elementId}` });
      continue;
    }
    if (el.side !== orders.side) {
      rejected.push({ order, reason: `element ${el.id} belongs to the other side` });
      continue;
    }
    if (seen.has(el.id)) {
      rejected.push({ order, reason: `more than one order for element ${el.id}` });
      continue;
    }
    if (order.kind === "move") {
      if (!state.map.inBounds(order.to.col, order.to.row)) {
        rejected.push({ order, reason: "destination is off the map" });
        continue;
      }
      const def = order.mode ? MOVE_MODE_DEFS[order.mode] : undefined;
      if (order.mode && !def) {
        rejected.push({ order, reason: `unknown movement mode ${order.mode}` });
        continue;
      }
      if (def?.footOnly && ELEMENT_TYPES[el.typeId].mobility !== Mobility.Foot) {
        rejected.push({ order, reason: `${def.name} is for troops on foot only` });
        continue;
      }
      if (def?.maxPersonnel !== undefined && el.personnel > def.maxPersonnel) {
        rejected.push({ order, reason: `${def.name} needs a group of at most ${def.maxPersonnel} (element has ${el.personnel})` });
        continue;
      }
      const t = state.map.terrainAt(order.to.col, order.to.row);
      if (!Number.isFinite(TERRAIN[t].footMoveCost.value) && state.map.road[state.map.index(order.to.col, order.to.row)] === 0) {
        rejected.push({ order, reason: "destination is impassable" });
        continue;
      }
    }
    if (order.kind === "patrol") {
      const drone = ELEMENT_SENSORS[el.typeId].map((id) => SENSORS[id]).find((s) => s.mode === "drone");
      if (!drone) {
        rejected.push({ order, reason: `element ${el.id} has no drones` });
        continue;
      }
      if (!state.map.inBounds(order.at.col, order.at.row)) {
        rejected.push({ order, reason: "patrol area is off the map" });
        continue;
      }
      const d = hexDistance(state.map.axialOfIndex(el.hex), offsetToAxial(order.at));
      if (d > (drone.controlRangeHex ?? 0)) {
        rejected.push({ order, reason: `patrol area is ${d} hexes away; control range is ${drone.controlRangeHex}` });
        continue;
      }
    }
    seen.add(el.id);
    accepted.push(order);
  }
  return { accepted, rejected };
}
