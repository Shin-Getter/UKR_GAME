import { describe, expect, it } from "vitest";
import { Terrain } from "../src/data/terrain";
import { axialToOffset } from "../src/engine/hex";
import { decodeMap, encodeMap, type MapFile } from "../src/engine/mapio";
import { generateSector } from "../src/engine/mapgen";
import { resolveCycle } from "../src/engine/sim";
import { hashState } from "../src/engine/state";
import { buildPokrovsk2024, pokrovskFrontHexes, pokrovskMeta } from "../src/scenarios/pokrovsk2024";
import mapFile from "../src/data/maps/pokrovsk-2024.json";

describe("map files", () => {
  it("round-trip a map exactly", () => {
    const map = generateSector(9);
    const file = JSON.parse(JSON.stringify(encodeMap(map, { id: "x", name: "x", bounds: { west: 0, north: 0, east: 1, south: -1 }, places: [], sources: [], generated: "2026-01-01" })));
    const back = decodeMap(file).map;
    expect(back.hash()).toBe(map.hash());
    expect(Array.from(back.elevation)).toEqual(Array.from(map.elevation));
  });

  it("reject arrays that do not match the dimensions", () => {
    const file = { ...(mapFile as MapFile), cols: 10 };
    expect(() => decodeMap(file)).toThrow(/dimensions/);
  });
});

describe("Pokrovsk 2024 real-terrain map", () => {
  const { map } = decodeMap(mapFile as MapFile);
  const count = (t: Terrain) => map.terrain.filter((x) => x === t).length;

  it("covers 42 x 24 km in 250 m hexes", () => {
    expect(map.cols).toBe(168);
    expect(map.rows).toBe(111);
    expect(map.widthKm).toBeCloseTo(42, 0);
    expect(map.depthKm).toBeCloseTo(24, 0);
  });

  it("has steppe fields, windbreaks, settlements and water", () => {
    expect(count(Terrain.Open) / map.size).toBeGreaterThan(0.4);
    expect(count(Terrain.Treeline) / map.size).toBeGreaterThan(0.1);
    expect(count(Terrain.Village) + count(Terrain.Urban)).toBeGreaterThan(300);
    expect(count(Terrain.Water)).toBeGreaterThan(100);
  });

  it("has plausible Donbas elevations", () => {
    const e = Array.from(map.elevation);
    expect(Math.min(...e)).toBeGreaterThan(50);
    expect(Math.max(...e)).toBeLessThan(350);
  });

  it("carries attribution", () => {
    expect(pokrovskMeta().sources.join(" ")).toMatch(/OpenStreetMap contributors/);
  });
});

describe("Pokrovsk 2024 scenario", () => {
  const state = buildPokrovsk2024(1);
  const front = pokrovskFrontHexes(state).map((i) => axialToOffset(state.map.axialOfIndex(i)).col);

  it("puts Russia east and Ukraine west of the line of contact", () => {
    for (const e of state.elements) {
      const o = axialToOffset(state.map.axialOfIndex(e.hex));
      if (e.side === "ru") expect(o.col).toBeGreaterThan(front[o.row]!);
      else expect(o.col).toBeLessThan(front[o.row]!);
    }
  });

  it("places nothing in water", () => {
    for (const e of state.elements) expect(state.map.terrain[e.hex]).not.toBe(Terrain.Water);
  });

  it("is deterministic and runs a day", () => {
    const a = buildPokrovsk2024(1);
    expect(hashState(a)).toBe(hashState(state));
    resolveCycle(a);
    expect(a.tick).toBe(96);
  });
});
