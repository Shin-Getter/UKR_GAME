import { describe, expect, it } from "vitest";
import { ELEMENT_TYPES, Mobility } from "../src/data/elements";
import { Terrain } from "../src/data/terrain";
import { TICKS_PER_HOUR } from "../src/data/time";
import { HEX_FLAT_TO_FLAT_M } from "../src/engine/hex";
import { beginMove, stepCostM } from "../src/engine/movement";
import { findPath } from "../src/engine/pathfind";
import { axialToOffset } from "../src/engine/hex";
import { runTick } from "../src/engine/sim";
import type { Element, SimEvent } from "../src/engine/state";
import { bareState, el, openMap } from "./helpers";

function squadAt(hex: number): Element {
  return el("e1", "ua", "infantrySquad", hex);
}

describe("movement", () => {
  it("walks infantry across open ground at its speed", () => {
    const state = bareState(openMap());
    const el = squadAt(state.map.index(5, 10));
    state.elements.push(el);
    beginMove(state, el, state.map.index(25, 10));
    const events: SimEvent[] = [];
    // One hour at 3 km/h on open ground = 3000 m = 12 hexes of 250 m.
    for (let i = 0; i < TICKS_PER_HOUR; i++) runTick(state, events);
    expect(el.hex).toBe(state.map.index(17, 10));
    expect(el.move).not.toBeNull();
  });

  it("reports arrival and clears the move", () => {
    const state = bareState(openMap());
    const el = squadAt(state.map.index(5, 10));
    state.elements.push(el);
    beginMove(state, el, state.map.index(8, 10));
    const events: SimEvent[] = [];
    for (let i = 0; i < 8; i++) runTick(state, events);
    expect(el.hex).toBe(state.map.index(8, 10));
    expect(el.move).toBeNull();
    expect(events.filter((e) => e.kind === "arrived")).toHaveLength(1);
  });

  it("finds no path across an unbridged river, and routes over a bridge when there is one", () => {
    const state = bareState(openMap());
    for (let row = 0; row < state.map.rows; row++) state.map.terrain[state.map.index(10, row)] = Terrain.Water;
    const el = squadAt(state.map.index(5, 10));
    state.elements.push(el);
    expect(beginMove(state, el, state.map.index(15, 10))).toBe(false);
    expect(el.move).toBeNull();
    // A bridge: a road across the river at row 30.
    const a = state.map.index(9, 30);
    const b = state.map.index(10, 30);
    const c = state.map.index(11, 30);
    state.map.roadEdges[a] = 1 << 0;
    state.map.roadEdges[b] = (1 << 0) | (1 << 3);
    state.map.roadEdges[c] = 1 << 3;
    expect(beginMove(state, el, state.map.index(15, 10))).toBe(true);
    expect(el.move!.path).toContain(b);
  });

  it("lets infiltrators keep to treelines while columns take the road", () => {
    const map = openMap();
    // A treeline along row 14 and a road along row 6, both from col 5 to col 25.
    for (let col = 5; col <= 25; col++) map.terrain[map.index(col, 14)] = Terrain.Treeline;
    for (let col = 5; col < 25; col++) {
      map.roadEdges[map.index(col, 6)]! |= 1 << 0;
      map.roadEdges[map.index(col + 1, 6)]! |= 1 << 3;
    }
    const inf = findPath(map, map.index(5, 10), map.index(25, 10), Mobility.Foot, "infiltrate")!;
    const onTreeline = inf.filter((i) => map.terrain[i] === Terrain.Treeline).length;
    expect(onTreeline).toBeGreaterThan(10);
    const col = findPath(map, map.index(5, 10), map.index(25, 10), Mobility.Wheeled, "column")!;
    expect(col.filter((i) => map.roadEdges[i]! !== 0).length).toBeGreaterThan(10);
  });

  it("slows infiltration to a crawl and stops pinned elements", () => {
    const state = bareState(openMap());
    const fast = squadAt(state.map.index(5, 10));
    const slow = el("e2", "ua", "assaultGroup", state.map.index(5, 20));
    const pinned = el("e3", "ua", "infantrySquad", state.map.index(5, 30));
    pinned.suppression = 0.9;
    state.elements.push(fast, slow, pinned);
    beginMove(state, fast, state.map.index(30, 10), "tactical");
    beginMove(state, slow, state.map.index(30, 20), "infiltrate");
    beginMove(state, pinned, state.map.index(30, 30), "tactical");
    const events: SimEvent[] = [];
    runTick(state, events);
    runTick(state, events);
    const dist = (e: Element, from: number) => Math.abs(axialToOffset(state.map.axialOfIndex(e.hex)).col - from);
    expect(dist(fast, 5)).toBeGreaterThan(dist(slow, 5));
    expect(pinned.hex).toBe(state.map.index(5, 30));
    expect(fast.dig).toBe(0);
  });

  it("makes roads cheaper for vehicles and slows them in forest", () => {
    const map = openMap();
    const a = map.index(5, 10);
    const b = map.index(6, 10);
    const open = stepCostM(map, a, b, Mobility.Wheeled);
    map.roadEdges[a] = 1 << 0; // east
    map.roadEdges[b] = 1 << 3; // west
    expect(stepCostM(map, a, b, Mobility.Wheeled)).toBeLessThan(open);
    map.roadEdges[a] = 0;
    map.terrain[b] = Terrain.Forest;
    expect(stepCostM(map, a, b, Mobility.Tracked)).toBeGreaterThan(HEX_FLAT_TO_FLAT_M);
  });

  it("uses each type's speed", () => {
    expect(ELEMENT_TYPES.mechSection.speed.value).toBeGreaterThan(ELEMENT_TYPES.infantrySquad.speed.value);
  });
});
