import { describe, expect, it } from "vitest";
import { DayPhase } from "../src/data/time";
import { TrackQuality } from "../src/data/sensing";
import { WEAPONS } from "../src/data/strikes";
import { Rng } from "../src/engine/rng";
import { signatureAt } from "../src/engine/sensing";
import type { TickContext } from "../src/engine/sim";
import { lossSummary, strikeAllocationSystem, strikeResolutionSystem } from "../src/engine/strikes";
import type { GameState, SimEvent, Track } from "../src/engine/state";
import { bareState, el, openMap } from "./helpers";

function ctxAt(state: GameState, tick: number, seed: number, events: SimEvent[] = []): TickContext {
  state.tick = tick;
  return { tick, rng: (p) => new Rng(seed ^ p.length * 7919), emit: (e) => events.push({ tick: tick + 1, ...e }) };
}

function track(side: "ua" | "ru", targetId: string, hex: number, quality: TrackQuality, typeId: Track["typeId"] = "infantrySquad"): Track {
  return { id: `${side}-T${targetId}`, targetId, quality, hex, lastSeenTick: 0, qualityTick: 0, typeId, shelledTick: -1000 };
}

describe("strike allocation", () => {
  it("launches an FPV at an identified contact in range and spends ammunition", () => {
    const state = bareState(openMap());
    const fpv = el("r1", "ru", "strikeDroneCrew", state.map.index(20, 5));
    const target = el("u1", "ua", "infantrySquad", state.map.index(20, 25));
    state.elements.push(fpv, target);
    state.tracks.ru.push(track("ru", "u1", target.hex, TrackQuality.Targetable));
    strikeAllocationSystem(state, ctxAt(state, 40, 1));
    expect(state.strikes).toHaveLength(1);
    expect(fpv.ammo).toBe(WEAPONS.fpv.stock - 1);
    expect(state.strikes[0]!.impactTick).toBe(41 + WEAPONS.fpv.latencyTicks);
  });

  it("respects range, minimum quality, cooldown and stationary rules", () => {
    const state = bareState(openMap());
    const fpv = el("r1", "ru", "strikeDroneCrew", state.map.index(20, 0));
    const mortar = el("r2", "ru", "mortarSection", state.map.index(22, 0));
    const near = el("u1", "ua", "infantrySquad", state.map.index(20, 20));
    state.elements.push(fpv, mortar, near);
    state.tracks.ru.push(track("ru", "u1", near.hex, TrackQuality.Detected, null));
    strikeAllocationSystem(state, ctxAt(state, 40, 1));
    // FPV needs Identified; the mortar (range 28) fires on Detected.
    expect(state.strikes.map((s) => s.weapon)).toEqual(["mortar120"]);
    state.strikes = [];
    strikeAllocationSystem(state, ctxAt(state, 40, 2));
    expect(state.strikes).toHaveLength(0); // mortar still busy
    mortar.busyUntil = 0;
    mortar.move = { path: [mortar.hex, mortar.hex + 1], step: 0, progressM: 0 };
    strikeAllocationSystem(state, ctxAt(state, 41, 3));
    expect(state.strikes).toHaveLength(0); // moving: cannot fire
    state.tracks.ru[0]!.hex = state.map.index(20, 39);
    state.tracks.ru[0]!.quality = TrackQuality.Targetable;
    mortar.move = null;
    strikeAllocationSystem(state, ctxAt(state, 45, 4));
    expect(state.strikes.map((s) => s.weapon)).toEqual(["fpv"]); // beyond mortar range, within FPV range
  });

  it("never drops area fire on a hex holding friendly elements", () => {
    const state = bareState(openMap());
    const mortar = el("r2", "ru", "mortarSection", state.map.index(22, 0));
    const enemy = el("u1", "ua", "infantrySquad", state.map.index(20, 10));
    const friend = el("r3", "ru", "assaultGroup", enemy.hex);
    state.elements.push(mortar, enemy, friend);
    state.tracks.ru.push(track("ru", "u1", enemy.hex, TrackQuality.Targetable));
    strikeAllocationSystem(state, ctxAt(state, 40, 1));
    expect(state.strikes).toHaveLength(0);
  });
});

describe("strike resolution", () => {
  it("lets a precision strike miss a target that has moved away", () => {
    const state = bareState(openMap());
    const target = el("u1", "ua", "infantrySquad", state.map.index(25, 20));
    state.elements.push(target);
    for (let s = 0; s < 50; s++) {
      state.strikes.push({ id: s, side: "ru", shooterId: "r1", weapon: "fpv", targetHex: state.map.index(20, 20), trackId: "x", targetId: "u1", quality: TrackQuality.Targetable, launchTick: 1, impactTick: 2 });
    }
    strikeResolutionSystem(state, ctxAt(state, 1, 9));
    expect(target.personnel).toBe(9);
    expect(state.strikes).toHaveLength(0);
  });

  it("removes an element that loses all its personnel and records the loss", () => {
    const state = bareState(openMap());
    const target = el("u1", "ua", "assaultGroup", state.map.index(20, 20));
    state.elements.push(target);
    const events: SimEvent[] = [];
    for (let s = 0; s < 200; s++) {
      state.strikes.push({ id: s, side: "ru", shooterId: "r1", weapon: "gun152", targetHex: target.hex, trackId: "x", targetId: "u1", quality: TrackQuality.Targetable, launchTick: 1, impactTick: 2 });
    }
    strikeResolutionSystem(state, ctxAt(state, 1, 5, events));
    expect(state.elements).toHaveLength(0);
    expect(state.destroyed[0]!.id).toBe("u1");
    expect(events.some((e) => e.kind === "destroyed")).toBe(true);
    const loss = lossSummary(state, "ua");
    expect(loss.killed + loss.wounded).toBe(5);
    expect(loss.elementsDestroyed).toBe(1);
  });
});

describe("firing signature", () => {
  it("makes a gun much louder and brighter for a moment", () => {
    const map = openMap();
    const quiet = signatureAt(map, "gunSection", map.index(5, 5), false, DayPhase.Day);
    const firing = signatureAt(map, "gunSection", map.index(5, 5), false, DayPhase.Day, true);
    expect(firing.acoustic).toBeGreaterThan(quiet.acoustic * 4);
    expect(firing.visual).toBeGreaterThan(quiet.visual);
  });
});
