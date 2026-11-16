import { guess } from "./param";

/** Simulation tick length. */
export const TICK_MINUTES = 15;
export const TICKS_PER_HOUR = 60 / TICK_MINUTES;
export const TICKS_PER_DAY = 24 * TICKS_PER_HOUR;

export enum DayPhase {
  Dawn = "dawn",
  Day = "day",
  Dusk = "dusk",
  Night = "night",
}

/**
 * Phase boundaries in hours (local time). Fixed for now; later they will
 * follow the scenario date and latitude.
 */
export const PHASE_HOURS = {
  dawnStart: guess(5, "h", "Fixed placeholder; should follow date and latitude"),
  dayStart: guess(7, "h"),
  duskStart: guess(19, "h"),
  nightStart: guess(21, "h"),
};
