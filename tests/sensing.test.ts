import { describe, expect, it } from "vitest";
import { SENSORS, TrackQuality } from "../src/data/sensing";
import { Terrain } from "../src/data/terrain";
import { DayPhase } from "../src/data/time";
import { observe, submit } from "../src/engine/controller";
import { dexp, pAtLeastOnce } from "../src/engine/dmath";
import { hasLineOfSight } from "../src/engine/los";
import { coverageMap, detectionRate, signatureAt, sensingSystem, trackDecaySystem } from "../src/engine/sensing";
import { runTick, type TickContext } from "../src/engine/sim";
import { Rng } from "../src/engine/rng";
import type { Element, GameState, SimEvent } from "../src/engine/state";
import { buildTestSector } from "../src/scenarios/testSector";
import { bareState, openMap } from "./helpers";

function el(id: string, side: "ua" | "ru", typeId: Element["typeId"], hex: number, patrol: number | null = null): Element {
  return { id, typeId, side, unitId: side === "ua" ? "u" : "r", hex, personnel: 5, move: null, patrol };
}

function ctxFor(state: GameState, seed: number, events: SimEvent[] = []): TickContext {
  return { tick: state.tick, rng: () => new Rng(seed), emit: (e) => events.push({ tick: state.tick + 1, ...e }) };
}

describe("deterministic maths", () => {
  it("dexp matches Math.exp closely", () => {
    for (const x of [-50, -10, -3.3, -1, -0.25, 0, 0.1, 1, 2.5, 7, 20]) {
      expect(Math.abs(dexp(x) - Math.exp(x)) / Math.exp(x)).toBeLessThan(1e-13);
    }
  });
  it("pAtLeastOnce is 1 - e^-rate", () => {
    expect(pAtLeastOnce(0)).toBe(0);
    expect(pAtLeastOnce(1)).toBeCloseTo(1 - Math.exp(-1), 12);
  });
});

describe("line of sight", () => {
  it("is clear over open flat ground and blocked by a forest in between", () => {
    const map = openMap();
    const a = map.index(5, 10);
    const b = map.index(12, 10);
    expect(hasLineOfSight(map, a, b)).toBe(true);
    map.terrain[map.index(8, 10)] = Terrain.Forest;
    expect(hasLineOfSight(map, a, b)).toBe(false);
  });
  it("is blocked by a ridge and restored from high ground", () => {
    const map = openMap();
    const a = map.index(5, 10);
    const b = map.index(12, 10);
    map.elevation[map.index(8, 10)] = 30;
    expect(hasLineOfSight(map, a, b)).toBe(false);
    map.elevation[a] = 80;
    expect(hasLineOfSight(map, a, b)).toBe(true);
  });
});

describe("signatures", () => {
  const map = openMap();
  const open = map.index(5, 5);
  const trees = map.index(6, 5);
  map.terrain[trees] = Terrain.Treeline;
  it("grow when moving, shrink at night (visual) and in cover", () => {
    const still = signatureAt(map, "infantrySquad", open, false, DayPhase.Day);
    expect(signatureAt(map, "infantrySquad", open, true, DayPhase.Day).visual).toBeGreaterThan(still.visual);
    expect(signatureAt(map, "infantrySquad", open, false, DayPhase.Night).visual).toBeLessThan(still.visual);
    expect(signatureAt(map, "infantrySquad", trees, false, DayPhase.Day).visual).toBeLessThan(still.visual);
    expect(signatureAt(map, "mechSection", open, false, DayPhase.Day).visual).toBeGreaterThan(still.visual);
  });
});

describe("detection", () => {
  it("matches the analytical probability (Monte Carlo)", () => {
    const state = bareState(openMap());
    const target = el("r1", "ru", "infantrySquad", state.map.index(20, 20));
    const crew = el("u1", "ua", "reconDroneCrew", state.map.index(20, 35), target.hex);
    state.elements.push(crew, target);
    const sig = signatureAt(state.map, "infantrySquad", target.hex, false, DayPhase.Day);
    const p = pAtLeastOnce(detectionRate(state.map, crew, SENSORS.reconDrone, target.hex, sig, target.hex, DayPhase.Day));
    let hits = 0;
    const trials = 2000;
    for (let s = 0; s < trials; s++) {
      state.tracks = { ua: [], ru: [] };
      sensingSystem(state, ctxFor(state, s + 1));
      if (state.tracks.ua.length > 0) hits++;
    }
    expect(hits / trials).toBeGreaterThan(p - 0.04);
    expect(hits / trials).toBeLessThan(p + 0.04);
  });

  it("sees nothing beyond range, and drones stop while their crew moves", () => {
    const state = bareState(openMap());
    const target = el("r1", "ru", "infantrySquad", state.map.index(20, 5));
    const crew = el("u1", "ua", "reconDroneCrew", state.map.index(20, 38), state.map.index(20, 30));
    state.elements.push(crew, target);
    for (let s = 0; s < 200; s++) sensingSystem(state, ctxFor(state, s));
    expect(state.tracks.ua).toHaveLength(0);
    crew.patrol = target.hex;
    crew.move = { path: [crew.hex, crew.hex - 1], step: 0, progressM: 0 };
    for (let s = 0; s < 200; s++) sensingSystem(state, ctxFor(state, s));
    expect(state.tracks.ua).toHaveLength(0);
  });
});

describe("tracks", () => {
  it("climb to Targetable under a drone, but only to Identified by eye at distance", () => {
    const state = bareState(openMap());
    const target = el("r1", "ru", "mechSection", state.map.index(20, 20));
    state.elements.push(el("u1", "ua", "reconDroneCrew", state.map.index(20, 35), target.hex), target);
    for (let s = 0; s < 30; s++) sensingSystem(state, ctxFor(state, s));
    expect(state.tracks.ua[0]!.quality).toBe(TrackQuality.Targetable);
    expect(state.tracks.ua[0]!.typeId).toBe("mechSection");

    const s2 = bareState(openMap());
    const t2 = el("r1", "ru", "mechSection", s2.map.index(20, 20));
    s2.elements.push(el("u1", "ua", "infantrySquad", s2.map.index(20, 25)), t2);
    for (let s = 0; s < 60; s++) sensingSystem(s2, ctxFor(s2, s));
    expect(s2.tracks.ua[0]!.quality).toBe(TrackQuality.Identified);
  });

  it("from RF intercept stay Suspected", () => {
    const state = bareState(openMap());
    const target = el("r1", "ru", "hq", state.map.index(20, 10));
    state.elements.push(el("u1", "ua", "ewTeam", state.map.index(20, 35)), target);
    for (let s = 0; s < 40; s++) sensingSystem(state, ctxFor(state, s));
    expect(state.tracks.ua[0]!.quality).toBe(TrackQuality.Suspected);
    expect(state.tracks.ua[0]!.typeId).toBeNull();
  });

  it("decay without fresh looks and are dropped, and a moved target is no longer Targetable", () => {
    const state = bareState(openMap());
    const target = el("r1", "ru", "mechSection", state.map.index(20, 20));
    state.elements.push(target);
    state.tracks.ua.push({ id: "ua-T1", targetId: "r1", quality: TrackQuality.Targetable, hex: target.hex, lastSeenTick: 0, qualityTick: 0, typeId: "mechSection" });
    target.hex = state.map.index(21, 20);
    trackDecaySystem(state, ctxFor(state, 1));
    expect(state.tracks.ua[0]!.quality).toBe(TrackQuality.Identified);
    const events: SimEvent[] = [];
    for (let t = 0; t < 100; t++) {
      state.tick = t;
      trackDecaySystem(state, ctxFor(state, 1, events));
    }
    expect(state.tracks.ua).toHaveLength(0);
    expect(events.some((e) => e.kind === "lostContact")).toBe(true);
  });
});

describe("fog of war", () => {
  it("reports tracks without revealing which real element they are", () => {
    const state = buildTestSector(1);
    const events: SimEvent[] = [];
    for (let i = 0; i < 48; i++) runTick(state, events);
    const obs = observe(state, "ua");
    expect(obs.tracks.length).toBeGreaterThan(0);
    for (const t of obs.tracks) {
      expect(t).not.toHaveProperty("targetId");
      expect(t.id.startsWith("ua-T")).toBe(true);
    }
    expect(obs.elements.every((e) => e.side === "ua")).toBe(true);
  });
});

describe("coverage map", () => {
  it("is high under a drone patrol, zero far away, higher for moving vehicles", () => {
    const state = bareState(openMap());
    const centre = state.map.index(20, 20);
    state.elements.push(el("u1", "ua", "reconDroneCrew", state.map.index(20, 35), centre));
    const inf = coverageMap(state, "ua", { typeId: "infantrySquad", moving: false });
    const veh = coverageMap(state, "ua", { typeId: "mechSection", moving: true });
    expect(inf[centre]!).toBeGreaterThan(0.5);
    expect(inf[state.map.index(2, 2)]!).toBe(0);
    expect(veh[centre]!).toBeGreaterThan(inf[centre]!);
  });
});

describe("patrol orders", () => {
  it("are accepted for drone crews within control range only", () => {
    const state = buildTestSector(1);
    const crew = state.elements.find((e) => e.side === "ua" && e.typeId === "reconDroneCrew")!;
    const squad = state.elements.find((e) => e.side === "ua" && e.typeId === "infantrySquad")!;
    const res = submit(state, {
      side: "ua",
      cycle: 0,
      orders: [
        { kind: "patrol", elementId: squad.id, at: { col: 10, row: 10 } },
        { kind: "patrol", elementId: crew.id, at: { col: 0, row: 0 } },
      ],
    });
    expect(res.rejected.map((r) => r.reason)).toEqual([
      `element ${squad.id} has no drones`,
      expect.stringMatching(/control range is 32/),
    ]);
  });

  it("start with recon drones watching the far side of the line", () => {
    const state = buildTestSector(1);
    for (const crew of state.elements.filter((e) => e.typeId === "reconDroneCrew")) expect(crew.patrol).not.toBeNull();
  });
});

describe("coverage quality filter", () => {
  it("ignores radio intercept by default, includes it when asked", () => {
    const state = bareState(openMap());
    state.elements.push(el("u1", "ua", "ewTeam", state.map.index(20, 20)));
    const far = state.map.index(20, 4); // beyond the EW team's eyes, inside RF range
    expect(coverageMap(state, "ua", { typeId: "hq", moving: false })[far]!).toBe(0);
    expect(coverageMap(state, "ua", { typeId: "hq", moving: false, minQuality: TrackQuality.Suspected })[far]!).toBeGreaterThan(0);
  });
});
