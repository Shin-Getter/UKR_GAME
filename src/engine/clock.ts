import { DayPhase, PHASE_HOURS, TICK_MINUTES, TICKS_PER_DAY } from "../data/time";

export interface Clock {
  /** Scenario day, starting at 1. */
  day: number;
  hour: number;
  minute: number;
  phase: DayPhase;
}

export function phaseAt(hour: number): DayPhase {
  if (hour >= PHASE_HOURS.nightStart.value || hour < PHASE_HOURS.dawnStart.value) return DayPhase.Night;
  if (hour < PHASE_HOURS.dayStart.value) return DayPhase.Dawn;
  if (hour < PHASE_HOURS.duskStart.value) return DayPhase.Day;
  return DayPhase.Dusk;
}

/** Clock for a tick, given the scenario's starting hour of day. */
export function clockAt(tick: number, startHour: number): Clock {
  const minutes = startHour * 60 + tick * TICK_MINUTES;
  const day = Math.floor(minutes / (24 * 60)) + 1;
  const minOfDay = minutes % (24 * 60);
  const hour = Math.floor(minOfDay / 60);
  return { day, hour, minute: minOfDay % 60, phase: phaseAt(hour) };
}

export function formatClock(c: Clock): string {
  const hh = String(c.hour).padStart(2, "0");
  const mm = String(c.minute).padStart(2, "0");
  return `Day ${c.day}, ${hh}:${mm} (${c.phase})`;
}

export { TICKS_PER_DAY };
