/**
 * Close combat: what happens when opposing elements share a hex. Placeholder
 * values until calibration (which follows playtesting).
 */
import type { ElementTypeId } from "./elements";
import { guess } from "./param";

/**
 * Combat weight per person by element type: riflemen 1, assault troops a bit
 * more, support crews less. Vehicles add their own weight (below).
 */
export const PERSON_WEIGHT: Record<ElementTypeId, number> = {
  infantrySquad: 1,
  assaultGroup: 1.2,
  mechSection: 1,
  tankSection: 0.5,
  reconDroneCrew: 0.4,
  strikeDroneCrew: 0.4,
  bomberDroneCrew: 0.4,
  mortarSection: 0.5,
  gunSection: 0.4,
  ewTeam: 0.4,
  engineerSection: 0.6,
  logisticsSection: 0.4,
  hq: 0.4,
};

/** Combat weight per operational vehicle, by element type. */
export const VEHICLE_WEIGHT: Partial<Record<ElementTypeId, number>> = {
  mechSection: 3,
  tankSection: 8,
};

/**
 * Expected casualties inflicted per tick per point of combat power. Close
 * combat is meant to be fast and deadly: two full squads in the open lose
 * about one person each per 15 minutes, more with more units in the hex.
 */
export const CLOSE_COMBAT_LETHALITY = guess(0.12, "casualties per power point per tick");

/** The attacker only gets this share of the terrain's cover (moving, exposed). */
export const ATTACKER_COVER_SHARE = guess(0.3, "fraction");

/** A side whose combat power falls below this share of the enemy's in the hex pulls back. */
export const BREAK_RATIO = guess(0.5, "ratio");

/** Suppression added per hit taken from a strike, and per close-combat casualty taken. */
export const SUPPRESSION_PER_HIT = guess(0.35, "suppression");
export const SUPPRESSION_PER_CC_CASUALTY = guess(0.15, "suppression");
/** Share of suppression that remains after each tick. */
export const SUPPRESSION_DECAY = guess(0.7, "fraction per tick");
/** Above this suppression an element is pinned: it does not move and cannot fire. */
export const PINNED_AT = guess(0.5, "suppression");

/** Cohesion lost per casualty and regained per quiet tick. */
export const COHESION_LOSS_PER_CASUALTY = guess(0.05, "cohesion");
export const COHESION_RECOVERY_PER_TICK = guess(0.004, "cohesion per tick", "About 0.4 per day when not under fire");
/** A side whose average cohesion in a close fight drops below this breaks regardless of power. */
export const BREAK_COHESION = guess(0.35, "cohesion");
