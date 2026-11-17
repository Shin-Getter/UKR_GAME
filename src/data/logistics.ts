/**
 * Logistics: supply points (SP, roughly 10 kg of mixed supply), what things
 * cost, who carries them, and what happens to wounded who wait. Placeholder
 * values until calibration (which follows playtesting).
 */
import { Category, type ElementTypeId } from "./elements";
import { guess } from "./param";
import type { WeaponId } from "./strikes";

/** Sustenance (water, food, batteries) an element can hold, in days. */
export const MAX_SUPPLY_DAYS = guess(3, "days");
/** Sustenance cost per person per day. */
export const SP_PER_PERSON_DAY = guess(1, "SP");

/** Supply cost of one munition. */
export const MUNITION_SP: Record<WeaponId, number> = {
  fpv: 0.5,
  bomber: 0.5,
  mortar120: 2,
  gun152: 6,
};

export interface CarrierDef {
  /** Cargo capacity in SP. */
  capacity: number;
  /** Wounded it can carry back. */
  seats: number;
  /** Which consumers it serves. */
  serves: "frontline" | "rear";
}

/** Elements that haul supply. Trucks serve rear consumers; ground robots serve the infantry in contact. */
export const CARRIERS: Partial<Record<ElementTypeId, CarrierDef>> = {
  logisticsSection: { capacity: 400, seats: 12, serves: "rear" },
  ugvTeam: { capacity: 20, seats: 2, serves: "frontline" },
};

/** Consumers in contact, served by ground robots rather than trucks. */
export const FRONTLINE_CATEGORIES: readonly Category[] = [Category.Infantry];

/** A consumer asks for resupply once this share of its sustenance or ammunition is gone. */
export const RESUPPLY_THRESHOLD = guess(0.3, "fraction");
/** After a failed route search a carrier waits this long before trying again. */
export const HAUL_RETRY_TICKS = 8;

/** Depot: starting stock, daily delivery from off-map, and the most it holds. */
export const DEPOT_START_SP = guess(2500, "SP");
export const DEPOT_DELIVERY_SP_PER_DAY = guess(1200, "SP/day", "Scenario input; stands in for rear-area interdiction");
export const DEPOT_MAX_SP = guess(5000, "SP");

/** Cohesion lost per tick by an element with no sustenance left. */
export const STARVATION_COHESION_LOSS_PER_TICK = guess(0.01, "cohesion per tick", "Collapses in about a day");
/** Below this cohesion a shooter is combat-ineffective and does not fire. */
export const INEFFECTIVE_COHESION = guess(0.2, "cohesion");

/** Chance per tick that a wounded soldier still waiting for evacuation dies. */
export const DIED_OF_WOUNDS_PER_TICK = guess(0.004, "probability per tick", "About 30% over a day of waiting");
/** Cohesion recovery is scaled down by this for each wounded soldier waiting in the element. */
export const WAITING_WOUNDED_RECOVERY_PENALTY = guess(0.25, "fraction per wounded");

/** Ground robot teams that lose all their robots re-equip at the depot: time and cost per robot. */
export const ROBOT_REEQUIP_TICKS = guess(48, "ticks", "12 hours");
export const ROBOT_REPLACEMENT_SP = guess(40, "SP per robot");
