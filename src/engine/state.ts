import type { ElementTypeId } from "../data/elements";
import { StateHasher } from "./hash";
import type { HexMap } from "./map";
import type { Orders } from "./orders";
import { stableStringify } from "./stable";

export type SideId = "ua" | "ru";
export const SIDES: readonly SideId[] = ["ua", "ru"];
export const SIDE_NAMES: Record<SideId, string> = { ua: "Ukraine", ru: "Russia" };

export type Echelon = "brigade" | "battalion" | "company" | "platoon";

/** A command unit: orders are given at this level; elements carry them out. */
export interface Unit {
  id: string;
  name: string;
  side: SideId;
  parentId: string | null;
  echelon: Echelon;
}

export interface MoveState {
  /** Hex indices from the start hex to the destination, inclusive. */
  path: number[];
  /** Index into path of the hex the element currently occupies. */
  step: number;
  /** Metres of movement banked towards entering the next hex. */
  progressM: number;
}

/** The smallest simulated entity. */
export interface Element {
  id: string;
  typeId: ElementTypeId;
  side: SideId;
  unitId: string;
  /** Map index of the occupied hex. */
  hex: number;
  personnel: number;
  move: MoveState | null;
}

export type SimEventKind = "orderApplied" | "arrived" | "blocked";

export interface SimEvent {
  tick: number;
  kind: SimEventKind;
  side: SideId;
  elementId: string;
  hex: number;
  note?: string;
}

export interface CycleRecord {
  ua: Orders | null;
  ru: Orders | null;
}

export interface GameState {
  scenarioId: string;
  seed: number;
  map: HexMap;
  /** Hour of day at tick 0. */
  startHour: number;
  tick: number;
  /** Orders cycles completed. */
  cycle: number;
  units: Unit[];
  elements: Element[];
  /** Validated orders waiting for the next cycle. */
  pending: Record<SideId, Orders | null>;
  /** Orders actually resolved each cycle: everything a replay needs. */
  history: CycleRecord[];
  /** Events of the most recent cycle. */
  lastEvents: SimEvent[];
}

export function elementById(state: GameState, id: string): Element | undefined {
  return state.elements.find((e) => e.id === id);
}

/**
 * Hash of all simulation state that must agree between peers. Excludes the
 * event log and pending orders, which are derived or not yet applied.
 */
export function hashState(state: GameState): string {
  const dynamic = stableStringify({
    tick: state.tick,
    cycle: state.cycle,
    units: state.units,
    elements: state.elements,
  });
  return new StateHasher().bytes(new TextEncoder().encode(state.map.hash() + dynamic)).digest();
}
