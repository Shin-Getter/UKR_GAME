import { guess } from "./param";
import { Mobility } from "./elements";

/**
 * Cost multiplier when moving between two hexes joined by a road (lower is
 * faster). Placeholder values; movement modes arrive in slice 6.
 */
export const ROAD_COST = {
  [Mobility.Foot]: guess(0.9, "multiplier"),
  [Mobility.Wheeled]: guess(0.35, "multiplier"),
  [Mobility.Tracked]: guess(0.6, "multiplier"),
};

/** Wheeled vehicles off-road pay this on top of the tracked-vehicle terrain cost. */
export const WHEELED_OFFROAD_PENALTY = guess(1.4, "multiplier");

export type MoveMode = "tactical" | "column" | "dash" | "infiltrate";
export const MOVE_MODES: readonly MoveMode[] = ["tactical", "column", "dash", "infiltrate"];

export interface MoveModeDef {
  id: MoveMode;
  name: string;
  description: string;
  /** Multiplier on the element's speed. */
  speed: number;
  /** Multiplier on the moving signature (on top of the moving multiplier). */
  signature: number;
  /**
   * Route choice: how strongly the pathfinder avoids exposed ground. Path cost
   * is multiplied by 1 + exposureAversion x (1 - concealment of the hex).
   */
  exposureAversion: number;
  /** Only foot elements of at most this many people may use the mode (undefined: anyone). */
  maxPersonnel?: number;
  footOnly?: boolean;
}

export const MOVE_MODE_DEFS: Record<MoveMode, MoveModeDef> = {
  tactical: {
    id: "tactical",
    name: "Tactical",
    description: "Normal movement using cover where convenient.",
    speed: 1,
    signature: 1,
    exposureAversion: 0.5,
  },
  column: {
    id: "column",
    name: "Column",
    description: "Fast along roads, ignores cover, very visible.",
    speed: 1.3,
    signature: 1.6,
    exposureAversion: 0,
  },
  dash: {
    id: "dash",
    name: "Dash",
    description: "Flat out to cut exposure time; loud and visible while it lasts.",
    speed: 2,
    signature: 1.4,
    exposureAversion: 0,
  },
  infiltrate: {
    id: "infiltrate",
    name: "Infiltrate",
    description: "Small groups on foot, slow, along treelines and rubble, pausing in cover.",
    speed: 0.25,
    signature: 0.3,
    exposureAversion: 4,
    maxPersonnel: 6,
    footOnly: true,
  },
};

/** Field fortification by the element itself while stationary (scrapes, trenches, revetments). */
export const DIG_HOURS_TO_FULL = {
  foot: guess(8, "h", "Shell scrapes to connected trench with overhead cover; engineering slice adds real fortification"),
  vehicle: guess(12, "h", "Revetments and camouflage nets"),
};
/** At full dig: share of strike and close-combat effect that the field fortification stops. */
export const DIG_COVER = guess(0.6, "fraction");
/** At full dig: reduction of visual and thermal signature (camouflage, below ground). */
export const DIG_SIGNATURE_REDUCTION = guess(0.4, "fraction");
