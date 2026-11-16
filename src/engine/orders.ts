import { TERRAIN } from "../data/terrain";
import type { Offset } from "./hex";
import type { GameState, SideId } from "./state";

export type Order =
  | { kind: "move"; elementId: string; to: Offset }
  | { kind: "hold"; elementId: string };

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
      const t = state.map.terrainAt(order.to.col, order.to.row);
      if (!Number.isFinite(TERRAIN[t].footMoveCost.value) && state.map.road[state.map.index(order.to.col, order.to.row)] === 0) {
        rejected.push({ order, reason: "destination is impassable" });
        continue;
      }
    }
    seen.add(el.id);
    accepted.push(order);
  }
  return { accepted, rejected };
}
