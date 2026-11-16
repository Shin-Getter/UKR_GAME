import { describe, expect, it } from "vitest";
import { Terrain } from "../src/data/terrain";
import { submit } from "../src/engine/controller";
import { Control, controlMap } from "../src/engine/control";
import { effectiveCover, fieldworksSystem, moraleSystem } from "../src/engine/fieldworks";
import { Rng } from "../src/engine/rng";
import type { TickContext } from "../src/engine/sim";
import { buildTestSector } from "../src/scenarios/testSector";
import { bareState, el, openMap } from "./helpers";

const ctx: TickContext = { tick: 0, rng: () => new Rng(1), emit: () => {} };

describe("digging in", () => {
  it("builds field fortification over hours when stationary and raises cover", () => {
    const state = bareState(openMap());
    const e = el("u1", "ua", "infantrySquad", state.map.index(5, 5));
    state.map.terrain[e.hex] = Terrain.Treeline;
    state.elements.push(e);
    const before = effectiveCover(state.map, e);
    for (let t = 0; t < 16; t++) fieldworksSystem(state, ctx);
    expect(e.dig).toBeCloseTo(0.5, 5);
    for (let t = 0; t < 100; t++) fieldworksSystem(state, ctx);
    expect(e.dig).toBe(1);
    expect(effectiveCover(state.map, e)).toBeGreaterThan(before + 0.4);
  });

  it("does not dig while moving or pinned", () => {
    const state = bareState(openMap());
    const a = el("u1", "ua", "infantrySquad", state.map.index(5, 5));
    const b = el("u2", "ua", "infantrySquad", state.map.index(6, 5));
    a.move = { mode: "tactical", path: [a.hex, a.hex + 1], step: 0, progressM: 0 };
    b.suppression = 0.8;
    state.elements.push(a, b);
    fieldworksSystem(state, ctx);
    expect(a.dig).toBe(0);
    expect(b.dig).toBe(0);
  });
});

describe("morale", () => {
  it("lets suppression fade and cohesion recover when quiet", () => {
    const state = bareState(openMap());
    const e = el("u1", "ua", "infantrySquad", 0);
    e.suppression = 1;
    e.cohesion = 0.5;
    state.elements.push(e);
    for (let t = 0; t < 20; t++) moraleSystem(state, ctx);
    expect(e.suppression).toBe(0);
    expect(e.cohesion).toBeGreaterThan(0.5);
  });
});

describe("control map", () => {
  it("marks held, contested and empty ground", () => {
    const map = openMap();
    const c = controlMap(map, [
      { side: "ua", hex: map.index(5, 5), weight: 1 },
      { side: "ru", hex: map.index(20, 5), weight: 1 },
      { side: "ua", hex: map.index(12, 20), weight: 1 },
      { side: "ru", hex: map.index(13, 20), weight: 1 },
    ]);
    expect(c[map.index(5, 5)]).toBe(Control.Ua);
    expect(c[map.index(20, 5)]).toBe(Control.Ru);
    expect(c[map.index(12, 20)]).toBe(Control.Contested);
    expect(c[map.index(30, 30)]).toBe(Control.None);
  });
});

describe("movement mode orders", () => {
  it("reject infiltration for vehicles and for groups that are too big", () => {
    const state = buildTestSector(1);
    const mech = state.elements.find((e) => e.side === "ua" && e.typeId === "mechSection")!;
    const squad = state.elements.find((e) => e.side === "ua" && e.typeId === "infantrySquad")!;
    const group = state.elements.find((e) => e.side === "ua" && e.typeId === "assaultGroup")!;
    const res = submit(state, {
      side: "ua",
      cycle: 0,
      orders: [
        { kind: "move", elementId: mech.id, to: { col: 10, row: 100 }, mode: "infiltrate" },
        { kind: "move", elementId: squad.id, to: { col: 10, row: 100 }, mode: "infiltrate" },
        { kind: "move", elementId: group.id, to: { col: 10, row: 100 }, mode: "infiltrate" },
      ],
    });
    expect(res.accepted.map((o) => o.elementId)).toEqual([group.id]);
    expect(res.rejected.map((r) => r.reason)).toEqual(["Infiltrate is for troops on foot only", "Infiltrate needs a group of at most 6 (element has 9)"]);
  });
});
