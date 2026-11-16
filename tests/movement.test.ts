import { describe, expect, it } from "vitest";
import { ELEMENT_TYPES, Mobility } from "../src/data/elements";
import { Terrain } from "../src/data/terrain";
import { TICKS_PER_HOUR } from "../src/data/time";
import { HEX_FLAT_TO_FLAT_M } from "../src/engine/hex";
import { beginMove, stepCostM } from "../src/engine/movement";
import { runTick } from "../src/engine/sim";
import type { Element, SimEvent } from "../src/engine/state";
import { bareState, openMap } from "./helpers";

function squadAt(hex: number): Element {
  return { id: "e1", typeId: "infantrySquad", side: "ua", unitId: "u", hex, personnel: 9, move: null };
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

  it("stops at water with no bridge", () => {
    const state = bareState(openMap());
    for (let row = 0; row < state.map.rows; row++) state.map.terrain[state.map.index(10, row)] = Terrain.Water;
    const el = squadAt(state.map.index(5, 10));
    state.elements.push(el);
    beginMove(state, el, state.map.index(15, 10));
    const events: SimEvent[] = [];
    for (let i = 0; i < 20; i++) runTick(state, events);
    expect(el.hex).toBe(state.map.index(9, 10));
    expect(events.some((e) => e.kind === "blocked")).toBe(true);
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
