/**
 * The tick loop. Each orders cycle applies both sides' orders, then runs
 * 96 fifteen-minute ticks through the system pipeline. Later slices add
 * systems (emissions, sensing, tracks, strikes, combat, engineering,
 * logistics, morale) to SYSTEMS in the order the design doc specifies.
 */
import { TICKS_PER_DAY } from "../data/time";
import { beginMove, movementSystem } from "./movement";
import { sensingSystem, trackDecaySystem } from "./sensing";
import { strikeAllocationSystem, strikeResolutionSystem } from "./strikes";
import { closeCombatSystem } from "./closeCombat";
import { fieldworksSystem, moraleSystem } from "./fieldworks";
import { validateOrders } from "./orders";
import { hashString, Rng } from "./rng";
import { type GameState, SIDES, type SimEvent } from "./state";

export interface TickContext {
  tick: number;
  /** Deterministic RNG for this tick and a named purpose. */
  rng(purpose: string): Rng;
  emit(event: Omit<SimEvent, "tick">): void;
}

export interface System {
  name: string;
  run(state: GameState, ctx: TickContext): void;
}

export const SYSTEMS: readonly System[] = [
  { name: "movement", run: movementSystem },
  { name: "sensing", run: sensingSystem },
  { name: "tracks", run: trackDecaySystem },
  { name: "strikeAllocation", run: strikeAllocationSystem },
  { name: "strikeResolution", run: strikeResolutionSystem },
  { name: "closeCombat", run: closeCombatSystem },
  { name: "fieldworks", run: fieldworksSystem },
  { name: "morale", run: moraleSystem },
];

function makeContext(state: GameState, system: string, events: SimEvent[]): TickContext {
  const tick = state.tick;
  return {
    tick,
    // Derived from seed, tick and purpose: no RNG state needs saving or syncing.
    rng: (purpose) => new Rng((state.seed ^ Math.imul(tick + 1, 0x9e3779b1) ^ hashString(`${system}/${purpose}`)) >>> 0),
    // Events happen during the tick, so they are stamped with its end.
    emit: (e) => events.push({ tick: tick + 1, ...e }),
  };
}

export function runTick(state: GameState, events: SimEvent[]): void {
  for (const system of SYSTEMS) system.run(state, makeContext(state, system.name, events));
  state.tick++;
}

/** Apply pending orders (both sides, fixed order) at the start of a cycle. */
function applyOrders(state: GameState, events: SimEvent[]): void {
  for (const side of SIDES) {
    const orders = state.pending[side];
    if (!orders) continue;
    // Re-validate: state may have changed since submission.
    for (const order of validateOrders(state, orders).accepted) {
      const el = state.elements.find((e) => e.id === order.elementId)!;
      if (order.kind === "move") {
        beginMove(state, el, state.map.index(order.to.col, order.to.row), order.mode ?? "tactical");
      } else if (order.kind === "patrol") {
        el.patrol = state.map.index(order.at.col, order.at.row);
      } else {
        el.move = null;
      }
      events.push({ tick: state.tick, kind: "orderApplied", side, elementId: el.id, hex: el.hex, note: order.kind });
    }
  }
}

/**
 * Start an orders cycle: record and apply pending orders. Returns the events
 * of the cycle so far; pass the same array to runTick for each tick, then
 * call endCycle. resolveCycle does all three.
 */
export function beginCycle(state: GameState): SimEvent[] {
  const events: SimEvent[] = [];
  state.history.push({ ua: state.pending.ua, ru: state.pending.ru });
  applyOrders(state, events);
  for (const el of state.elements) el.missionsToday = 0;
  state.lastEvents = events;
  return events;
}

export function endCycle(state: GameState, events: SimEvent[]): void {
  state.cycle++;
  state.pending = { ua: null, ru: null };
  state.lastEvents = events;
}

/** Resolve one orders cycle (24 h). Returns the cycle's events. */
export function resolveCycle(state: GameState): SimEvent[] {
  const events = beginCycle(state);
  for (let i = 0; i < TICKS_PER_DAY; i++) runTick(state, events);
  endCycle(state, events);
  return events;
}
