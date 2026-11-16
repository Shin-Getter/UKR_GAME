/**
 * The controller interface: the only way players (UI, scripted AI, external
 * agents) interact with the engine. observe() returns what a side may know;
 * submit() validates and queues that side's orders for the next cycle.
 */
import { type Clock, clockAt } from "./clock";
import { type Orders, validateOrders, type ValidationResult } from "./orders";
import type { Element, GameState, SideId, SimEvent, Unit } from "./state";

export interface Observation {
  side: SideId;
  tick: number;
  cycle: number;
  clock: Clock;
  units: Unit[];
  elements: Element[];
  /** Enemy contacts. Empty until sensing arrives in slice 4. */
  tracks: never[];
  events: SimEvent[];
}

export function observe(state: GameState, side: SideId): Observation {
  return structuredClone({
    side,
    tick: state.tick,
    cycle: state.cycle,
    clock: clockAt(state.tick, state.startHour),
    units: state.units.filter((u) => u.side === side),
    elements: state.elements.filter((e) => e.side === side),
    tracks: [],
    events: state.lastEvents.filter((e) => e.side === side),
  });
}

/** Validate and queue orders. Replaces any orders this side already queued this cycle. */
export function submit(state: GameState, orders: Orders): ValidationResult {
  const result = validateOrders(state, orders);
  state.pending[orders.side] = { side: orders.side, cycle: orders.cycle, orders: result.accepted };
  return result;
}
