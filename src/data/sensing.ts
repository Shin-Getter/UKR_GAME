/**
 * Signatures, sensors and track behaviour. All values are placeholder guesses
 * until calibration (which follows playtesting).
 *
 * Signatures are relative (a mechanised section in the open, in daylight, on
 * the move is roughly 1 on the visual channel); sensor rate constants turn
 * them into per-tick detection rates.
 */
import { Mobility, type ElementTypeId } from "./elements";
import { guess, type Param } from "./param";
import { DayPhase } from "./time";

export type Channel = "visual" | "thermal" | "rf" | "acoustic";
export const CHANNELS: readonly Channel[] = ["visual", "thermal", "rf", "acoustic"];

export type Signature = Record<Channel, number>;

/** Static signature per element type (stationary, not concealed, reference light). */
export const SIGNATURES: Record<ElementTypeId, Signature> = {
  infantrySquad: { visual: 0.3, thermal: 0.3, rf: 0.2, acoustic: 0.1 },
  assaultGroup: { visual: 0.2, thermal: 0.2, rf: 0.1, acoustic: 0.05 },
  mechSection: { visual: 1.0, thermal: 1.0, rf: 0.4, acoustic: 0.8 },
  tankSection: { visual: 1.0, thermal: 1.0, rf: 0.3, acoustic: 0.9 },
  reconDroneCrew: { visual: 0.25, thermal: 0.3, rf: 0.9, acoustic: 0.1 },
  strikeDroneCrew: { visual: 0.25, thermal: 0.3, rf: 0.9, acoustic: 0.1 },
  mortarSection: { visual: 0.4, thermal: 0.4, rf: 0.3, acoustic: 0.3 },
  gunSection: { visual: 0.6, thermal: 0.6, rf: 0.3, acoustic: 0.3 },
  ewTeam: { visual: 0.4, thermal: 0.5, rf: 1.0, acoustic: 0.3 },
  engineerSection: { visual: 0.6, thermal: 0.6, rf: 0.2, acoustic: 0.6 },
  logisticsSection: { visual: 0.8, thermal: 0.8, rf: 0.3, acoustic: 0.7 },
  hq: { visual: 0.5, thermal: 0.6, rf: 1.0, acoustic: 0.4 },
};

/** Signature multipliers while moving, by mobility class. */
export const MOVING_MULTIPLIER: Record<Mobility, Signature> = {
  [Mobility.Foot]: { visual: 3, thermal: 1.5, rf: 1, acoustic: 2 },
  [Mobility.Wheeled]: { visual: 3, thermal: 2, rf: 1, acoustic: 3 },
  [Mobility.Tracked]: { visual: 3, thermal: 2, rf: 1, acoustic: 3 },
};

/** Light and temperature effects on each channel by phase of day. */
export const PHASE_MULTIPLIER: Record<DayPhase, Signature> = {
  [DayPhase.Day]: { visual: 1, thermal: 0.6, rf: 1, acoustic: 1 },
  [DayPhase.Dawn]: { visual: 0.5, thermal: 0.9, rf: 1, acoustic: 1 },
  [DayPhase.Dusk]: { visual: 0.5, thermal: 0.9, rf: 1, acoustic: 1 },
  [DayPhase.Night]: { visual: 0.15, thermal: 1, rf: 1, acoustic: 1.2 },
};

/** Terrain concealment applies fully to visual, partly to thermal, not to RF or acoustic. */
export const CONCEALMENT_WEIGHT: Signature = { visual: 1, thermal: 0.7, rf: 0, acoustic: 0 };

export enum TrackQuality {
  None = 0,
  /** Something is there (hex-level, position uncertain). */
  Suspected = 1,
  /** Contact located to a hex. */
  Detected = 2,
  /** Contact type known. */
  Identified = 3,
  /** Precise and current enough to strike with drones or precision munitions. */
  Targetable = 4,
}

export type SensorMode = "ground" | "drone" | "rf";

export interface SensorDef {
  id: string;
  name: string;
  mode: SensorMode;
  /** Ground/RF: range from the carrier. Drone: radius of the patrol area. */
  rangeHex: number;
  /** Full sensitivity out to this range, falling linearly to zero at rangeHex. */
  nearHex: number;
  /** Drone: furthest the patrol centre may be from the crew. */
  controlRangeHex?: number;
  /** Detection rate per tick per unit of effective signature. */
  k: Param;
  weights: Signature;
  /** Best track quality this sensor can produce. */
  maxQuality: TrackQuality;
  /** Within this range a ground sensor can reach Targetable. */
  targetableWithinHex?: number;
  needsLineOfSight: boolean;
  /** Fraction of time the sensor is working, by phase (drone sortie cycles, crew rest). */
  availability: Record<DayPhase, number>;
  /** Carrier must be stationary for the sensor to work (drone launch, mast). */
  requiresStationary: boolean;
}

const always = { [DayPhase.Day]: 1, [DayPhase.Dawn]: 1, [DayPhase.Dusk]: 1, [DayPhase.Night]: 1 };

export const SENSORS = {
  eyes: {
    id: "eyes",
    name: "Observation (optics, basic night sights)",
    mode: "ground",
    rangeHex: 8,
    nearHex: 1,
    k: guess(0.6, "1/tick"),
    weights: { visual: 1, thermal: 0.4, rf: 0, acoustic: 0.5 },
    maxQuality: TrackQuality.Identified,
    targetableWithinHex: 2,
    needsLineOfSight: true,
    availability: always,
    requiresStationary: false,
  },
  reconDrone: {
    id: "reconDrone",
    name: "Recon multicopter (day and thermal camera)",
    mode: "drone",
    rangeHex: 8,
    nearHex: 4,
    controlRangeHex: 32,
    k: guess(1.2, "1/tick"),
    weights: { visual: 1, thermal: 1, rf: 0, acoustic: 0 },
    maxQuality: TrackQuality.Targetable,
    needsLineOfSight: false,
    availability: { [DayPhase.Day]: 0.6, [DayPhase.Dawn]: 0.6, [DayPhase.Dusk]: 0.6, [DayPhase.Night]: 0.45 },
    requiresStationary: true,
  },
  rfIntercept: {
    id: "rfIntercept",
    name: "RF direction finding",
    mode: "rf",
    rangeHex: 40,
    nearHex: 8,
    k: guess(0.8, "1/tick"),
    weights: { visual: 0, thermal: 0, rf: 1, acoustic: 0 },
    maxQuality: TrackQuality.Suspected,
    needsLineOfSight: false,
    availability: always,
    requiresStationary: true,
  },
} satisfies Record<string, SensorDef>;

export type SensorId = keyof typeof SENSORS;

/** Sensors carried by each element type. Every element has eyes. */
export const ELEMENT_SENSORS: Record<ElementTypeId, SensorId[]> = {
  infantrySquad: ["eyes"],
  assaultGroup: ["eyes"],
  mechSection: ["eyes"],
  tankSection: ["eyes"],
  reconDroneCrew: ["eyes", "reconDrone"],
  strikeDroneCrew: ["eyes"],
  mortarSection: ["eyes"],
  gunSection: ["eyes"],
  ewTeam: ["eyes", "rfIntercept"],
  engineerSection: ["eyes"],
  logisticsSection: ["eyes"],
  hq: ["eyes"],
};

/** Ticks without a fresh detection before a track drops one quality level. */
export const TRACK_DECAY_TICKS: Record<Exclude<TrackQuality, TrackQuality.None>, Param> = {
  [TrackQuality.Targetable]: guess(2, "ticks", "30 min: drone strikes need current positions"),
  [TrackQuality.Identified]: guess(8, "ticks"),
  [TrackQuality.Detected]: guess(16, "ticks"),
  [TrackQuality.Suspected]: guess(32, "ticks", "Then the track is dropped"),
};

/** Reported position error for Suspected tracks, in hexes. */
export const SUSPECTED_POSITION_ERROR_HEX = 2;
