import { describe, expect, it } from "vitest";
import { hash2, Rng } from "../src/engine/rng";

describe("Rng", () => {
  it("produces identical sequences for the same seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it("produces different sequences for different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 100 }, () => a.nextU32() === b.nextU32()).filter(Boolean).length;
    expect(same).toBeLessThan(3);
  });

  it("keeps floats in [0, 1) and ints in range", () => {
    const r = new Rng(7);
    for (let i = 0; i < 10000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.range(-3, 3);
      expect(n).toBeGreaterThanOrEqual(-3);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it("is roughly uniform", () => {
    const r = new Rng(99);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100000; i++) buckets[r.int(10)]++;
    for (const b of buckets) expect(Math.abs(b - 10000)).toBeLessThan(500);
  });

  it("forks deterministic, independent streams", () => {
    const a = new Rng(5).fork("sensing");
    const b = new Rng(5).fork("sensing");
    const c = new Rng(5).fork("logistics");
    const x = a.nextU32();
    expect(b.nextU32()).toBe(x);
    expect(c.nextU32()).not.toBe(x);
  });

  it("matches the golden sequence (cross-platform determinism tripwire)", () => {
    const r = new Rng(12345);
    expect([r.nextU32(), r.nextU32(), r.nextU32()]).toMatchSnapshot();
    expect(hash2(3, -4, 9)).toMatchSnapshot();
  });
});
