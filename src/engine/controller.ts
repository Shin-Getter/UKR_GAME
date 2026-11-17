/**
 * The controller interface: the only way players (UI, scripted AI, external
 * agents) interact with the engine. observe() returns what a side may know;
 * submit() validates and queues that side's orders for the next cycle.
 */
import { type Clock, clockAt } from "./clock";
import { type Orders, validateOrders, type ValidationResult } from "./orders";
import type { Depot, Element, GameState, SideId, SimEvent, Track, Unit } from "./state";

/** A track as its own side sees it: no link to the real element. */
export type TrackReport = Omit<Track, "targetId">;

export interface Observation {
  side: SideId;
  tick: number;
  cycle: number;
  clock: Clock;
  units: Unit[];
  elements: Element[];
  depots: Depot[];
  /** Enemy contacts from this side's sensors. */
  tracks: TrackReport[];
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
    depots: state.depots.filter((d) => d.side === side),
    tracks: state.tracks[side].map(({ targetId: _hidden, ...report }) => report),
    events: state.lastEvents.filter((e) => e.side === side),
  });
}

/** Validate and queue orders. Replaces any orders this side already queued this cycle. */
export function submit(state: GameState, orders: Orders): ValidationResult {
  const result = validateOrders(state, orders);
  state.pending[orders.side] = { side: orders.side, cycle: orders.cycle, orders: result.accepted };
  return result;
}
