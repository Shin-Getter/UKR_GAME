import { describe, expect, it } from "vitest";
import {
  axialToOffset,
  HEX_FLAT_TO_FLAT_M,
  hexDistance,
  hexLine,
  hexToWorld,
  neighbors,
  offsetToAxial,
  worldToHex,
} from "../src/engine/hex";

describe("hex geometry", () => {
  it("round-trips offset and axial coordinates", () => {
    for (let row = 0; row < 30; row++) {
      for (let col = 0; col < 30; col++) {
        expect(axialToOffset(offsetToAxial({ col, row }))).toEqual({ col, row });
      }
    }
  });

  it("puts all six neighbours at distance 1 and 250 m", () => {
    const h = { q: 4, r: 7 };
    const c = hexToWorld(h);
    for (const n of neighbors(h)) {
      expect(hexDistance(h, n)).toBe(1);
      const p = hexToWorld(n);
      expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeCloseTo(HEX_FLAT_TO_FLAT_M, 6);
    }
  });

  it("round-trips hex centre to world and back", () => {
    for (let r = -10; r <= 10; r++) {
      for (let q = -10; q <= 10; q++) {
        const w = hexToWorld({ q, r });
        expect(worldToHex(w.x, w.y)).toEqual({ q, r });
        // Points well inside the hex map to it too.
        expect(worldToHex(w.x + 60, w.y - 50)).toEqual({ q, r });
      }
    }
  });

  it("measures symmetric distances", () => {
    const a = { q: 2, r: -3 };
    const b = { q: -5, r: 8 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
    expect(hexDistance(a, b)).toBe(11);
  });

  it("draws contiguous lines of length distance + 1", () => {
    const a = { q: 0, r: 0 };
    const b = { q: 13, r: -6 };
    const line = hexLine(a, b);
    expect(line.length).toBe(hexDistance(a, b) + 1);
    expect(line[0]).toEqual(a);
    expect(line.at(-1)).toEqual(b);
    for (let i = 1; i < line.length; i++) expect(hexDistance(line[i - 1]!, line[i]!)).toBe(1);
  });
});
