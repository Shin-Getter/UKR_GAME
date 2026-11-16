import type { ElementTypeId } from "../data/elements";
import type { TrackQuality } from "../data/sensing";
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
  /** Drone crews: hex at the centre of the patrol area, or null. */
  patrol: number | null;
}

/**
 * What one side believes about one enemy element. targetId links it to the
 * real element inside the engine; observe() never reveals it.
 */
export interface Track {
  /** Side-local id, e.g. "ua-T7". */
  id: string;
  targetId: string;
  quality: TrackQuality;
  /** Reported hex (may be off by a couple of hexes while Suspected). */
  hex: number;
  /** Tick of the last detection of any quality. */
  lastSeenTick: number;
  /** Tick the current quality was last confirmed (decay timer). */
  qualityTick: number;
  /** Known element type, once Identified. */
  typeId: ElementTypeId | null;
}

export type SimEventKind = "orderApplied" | "arrived" | "blocked" | "newContact" | "lostContact";

export interface SimEvent {
  tick: number;
  kind: SimEventKind;
  side: SideId;
  /** The acting element; for contact events, the side-local track id. */
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
  /** Each side's picture of the enemy. */
  tracks: Record<SideId, Track[]>;
  /** Counters for side-local track ids. */
  trackCounter: Record<SideId, number>;
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
    tracks: state.tracks,
    trackCounter: state.trackCounter,
  });
  return new StateHasher().bytes(new TextEncoder().encode(state.map.hash() + dynamic)).digest();
}

/** A fresh game state at tick 0. */
export function newGameState(init: {
  scenarioId: string;
  seed: number;
  map: HexMap;
  startHour: number;
  units: Unit[];
  elements: Element[];
}): GameState {
  return {
    ...init,
    tick: 0,
    cycle: 0,
    tracks: { ua: [], ru: [] },
    trackCounter: { ua: 0, ru: 0 },
    pending: { ua: null, ru: null },
    history: [],
    lastEvents: [],
  };
}
