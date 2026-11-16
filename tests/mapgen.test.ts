import { describe, expect, it } from "vitest";
import { Terrain } from "../src/data/terrain";
import { neighbors } from "../src/engine/hex";
import { RoadClass } from "../src/engine/map";
import { generateSector } from "../src/engine/mapgen";

describe("generateSector", () => {
  const map = generateSector(1);

  it("has the design-doc sector size (~24 km x ~40 km of 250 m hexes)", () => {
    expect(map.widthKm).toBeCloseTo(24, 0);
    expect(map.depthKm).toBeGreaterThan(39);
    expect(map.depthKm).toBeLessThan(41);
  });

  it("is deterministic for a seed", () => {
    expect(generateSector(1).hash()).toBe(map.hash());
    expect(generateSector(2).hash()).not.toBe(map.hash());
  });

  it("matches the golden hash (update deliberately when the generator changes)", () => {
    expect(map.hash()).toMatchSnapshot();
  });

  it("contains every terrain type", () => {
    const seen = new Set(map.terrain);
    for (const t of [Terrain.Open, Terrain.Treeline, Terrain.Forest, Terrain.Village, Terrain.Urban, Terrain.Marsh, Terrain.Water]) {
      expect(seen.has(t)).toBe(true);
    }
  });

  it("is mostly fields, with treelines a substantial minority", () => {
    const count = (t: Terrain) => map.terrain.filter((x) => x === t).length / map.size;
    expect(count(Terrain.Open)).toBeGreaterThan(0.4);
    expect(count(Terrain.Treeline)).toBeGreaterThan(0.1);
    expect(count(Terrain.Treeline)).toBeLessThan(0.35);
  });

  it("runs the river across every column", () => {
    for (let col = 0; col < map.cols; col++) {
      let found = false;
      for (let row = 0; row < map.rows && !found; row++) found = map.terrainAt(col, row) === Terrain.Water;
      expect(found).toBe(true);
    }
  });

  it("stores road connections symmetrically", () => {
    for (let i = 0; i < map.size; i++) {
      const ns = neighbors(map.axialOfIndex(i));
      for (let d = 0; d < 6; d++) {
        if ((map.roadEdges[i]! & (1 << d)) === 0) continue;
        const j = map.indexOfAxial(ns[d]!);
        expect(j).toBeGreaterThanOrEqual(0);
        expect(map.roadEdges[j]! & (1 << ((d + 3) % 6))).not.toBe(0);
      }
    }
  });

  it("connects every road hex into one network along road edges", () => {
    const roadHexes: number[] = [];
    for (let i = 0; i < map.size; i++) if (map.road[i] !== RoadClass.None) roadHexes.push(i);
    expect(roadHexes.length).toBeGreaterThan(100);
    const seen = new Set<number>([roadHexes[0]!]);
    const queue = [roadHexes[0]!];
    while (queue.length > 0) {
      const i = queue.pop()!;
      const ns = neighbors(map.axialOfIndex(i));
      for (let d = 0; d < 6; d++) {
        if ((map.roadEdges[i]! & (1 << d)) === 0) continue;
        const j = map.indexOfAxial(ns[d]!);
        if (j >= 0 && map.road[j] !== RoadClass.None && !seen.has(j)) {
          seen.add(j);
          queue.push(j);
        }
      }
    }
    expect(seen.size).toBe(roadHexes.length);
  });
});
