import { describe, expect, it } from "vitest";
import { DayPhase, TICKS_PER_DAY } from "../src/data/time";
import { clockAt, phaseAt } from "../src/engine/clock";

describe("clock", () => {
  it("has 96 fifteen-minute ticks per day", () => {
    expect(TICKS_PER_DAY).toBe(96);
  });

  it("converts ticks to day and time from the start hour", () => {
    expect(clockAt(0, 6)).toMatchObject({ day: 1, hour: 6, minute: 0 });
    expect(clockAt(3, 6)).toMatchObject({ day: 1, hour: 6, minute: 45 });
    expect(clockAt(72, 6)).toMatchObject({ day: 2, hour: 0, minute: 0 });
    expect(clockAt(96, 6)).toMatchObject({ day: 2, hour: 6, minute: 0 });
  });

  it("assigns day phases", () => {
    expect(phaseAt(3)).toBe(DayPhase.Night);
    expect(phaseAt(5)).toBe(DayPhase.Dawn);
    expect(phaseAt(12)).toBe(DayPhase.Day);
    expect(phaseAt(19)).toBe(DayPhase.Dusk);
    expect(phaseAt(22)).toBe(DayPhase.Night);
  });
});
