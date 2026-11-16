/**
 * Strike systems: what each shooter fires, how far, how fast, how likely it
 * is to arrive and hit, and what a hit does. All values are placeholder
 * guesses until calibration (which follows playtesting).
 */
import type { ElementTypeId, Protection } from "./elements";
import { guess, type Param } from "./param";
import { TrackQuality } from "./sensing";
import { DayPhase } from "./time";

export type WeaponKind = "precision" | "area";

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  rangeHex: number;
  /** Lowest track quality the shooter will engage. */
  minQuality: TrackQuality;
  /** Ticks from launch to impact (decision, flight, call for fire). */
  latencyTicks: number;
  /** Ticks the shooter is busy after launching. */
  cooldownTicks: number;
  /** Munitions used per mission (FPV: 1 airframe; bomber: drops; artillery: rounds). */
  perMission: number;
  /** Starting stock in munitions. */
  stock: number;
  /** Most missions a crew flies/fires per day (sustained rate, crew rest, fire discipline). */
  missionsPerDay: Param;
  /** Chance the strike arrives at all (link loss, malfunction, interception). */
  reach: Param;
  /** Chance per munition to hit a person-sized target in the open, by track quality at launch. */
  hit: Partial<Record<TrackQuality, number>>;
  /** Casualties caused by one hit on personnel: uniform in [min, max]. */
  casualties: [number, number];
  /** Chance a hit disables one vehicle, by protection. */
  vehicleKill: Record<Protection, number>;
  /** Chance the crew can fly/fire in a given tick, by phase (drones need light or thermal optics). */
  availability: Record<DayPhase, number>;
  /** Shooter must be stationary to fire. */
  requiresStationary: boolean;
}

const allDay = { [DayPhase.Day]: 1, [DayPhase.Dawn]: 1, [DayPhase.Dusk]: 1, [DayPhase.Night]: 1 };

export const WEAPONS = {
  fpv: {
    id: "fpv",
    name: "FPV drone",
    kind: "precision",
    rangeHex: 40,
    minQuality: TrackQuality.Identified,
    latencyTicks: 1,
    cooldownTicks: 1,
    perMission: 1,
    stock: 40,
    missionsPerDay: guess(12, "missions/day"),
    reach: guess(0.6, "probability", "No EW model yet: covers link loss, crashes, nets"),
    hit: { [TrackQuality.Identified]: 0.25, [TrackQuality.Targetable]: 0.5 },
    casualties: [1, 2],
    vehicleKill: { none: 0.8, light: 0.5, armoured: 0.25 },
    availability: { [DayPhase.Day]: 1, [DayPhase.Dawn]: 0.9, [DayPhase.Dusk]: 0.9, [DayPhase.Night]: 0.6 },
    requiresStationary: true,
  },
  bomber: {
    id: "bomber",
    name: "Bomber drone",
    kind: "precision",
    rangeHex: 24,
    minQuality: TrackQuality.Identified,
    latencyTicks: 2,
    cooldownTicks: 3,
    perMission: 4,
    stock: 60,
    missionsPerDay: guess(6, "missions/day"),
    reach: guess(0.85, "probability"),
    hit: { [TrackQuality.Identified]: 0.15, [TrackQuality.Targetable]: 0.3 },
    casualties: [1, 2],
    vehicleKill: { none: 0.6, light: 0.3, armoured: 0.1 },
    availability: { [DayPhase.Day]: 0.4, [DayPhase.Dawn]: 0.8, [DayPhase.Dusk]: 0.8, [DayPhase.Night]: 1 },
    requiresStationary: true,
  },
  mortar120: {
    id: "mortar120",
    name: "120 mm mortar",
    kind: "area",
    rangeHex: 28,
    minQuality: TrackQuality.Detected,
    latencyTicks: 1,
    cooldownTicks: 2,
    perMission: 6,
    stock: 120,
    missionsPerDay: guess(8, "missions/day"),
    reach: guess(1, "probability"),
    hit: { [TrackQuality.Detected]: 0.06, [TrackQuality.Identified]: 0.08, [TrackQuality.Targetable]: 0.12 },
    casualties: [1, 2],
    vehicleKill: { none: 0.3, light: 0.1, armoured: 0.02 },
    availability: allDay,
    requiresStationary: true,
  },
  gun152: {
    id: "gun152",
    name: "152/155 mm gun",
    kind: "area",
    rangeHex: 100,
    minQuality: TrackQuality.Detected,
    latencyTicks: 2,
    cooldownTicks: 3,
    perMission: 8,
    stock: 160,
    missionsPerDay: guess(6, "missions/day"),
    reach: guess(1, "probability"),
    hit: { [TrackQuality.Detected]: 0.05, [TrackQuality.Identified]: 0.07, [TrackQuality.Targetable]: 0.1 },
    casualties: [1, 3],
    vehicleKill: { none: 0.5, light: 0.2, armoured: 0.05 },
    availability: allDay,
    requiresStationary: true,
  },
} satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;

/** The weapon each shooter type carries (one per type for now). */
export const ELEMENT_WEAPON: Partial<Record<ElementTypeId, WeaponId>> = {
  strikeDroneCrew: "fpv",
  bomberDroneCrew: "bomber",
  mortarSection: "mortar120",
  gunSection: "gun152",
};

/** Share of casualties that are killed (the rest wounded). */
export const KIA_SHARE = guess(0.3, "fraction");

/** Area fire does not re-engage the same contact within this many ticks (waits for assessment). */
export const AREA_REENGAGE_TICKS = 3;

/** Most strikes launched at one track in the same tick (limits overkill). */
export const MAX_STRIKES_PER_TRACK_PER_TICK = 2;

/** Default target priority by known type (higher first). Unidentified contacts rank 1. */
export const DEFAULT_TARGET_PRIORITY: Record<ElementTypeId, number> = {
  gunSection: 10,
  mortarSection: 9,
  strikeDroneCrew: 9,
  bomberDroneCrew: 9,
  reconDroneCrew: 9,
  tankSection: 8,
  mechSection: 7,
  ewTeam: 6,
  hq: 6,
  logisticsSection: 5,
  engineerSection: 4,
  infantrySquad: 3,
  assaultGroup: 3,
};
