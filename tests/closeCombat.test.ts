import { describe, expect, it } from "vitest";
import { TrackQuality } from "../src/data/sensing";
import { Terrain } from "../src/data/terrain";
import { closeCombatSystem, combatPower } from "../src/engine/closeCombat";
import { hexDistance } from "../src/engine/hex";
import { beginMove } from "../src/engine/movement";
import { Rng } from "../src/engine/rng";
import { runTick, type TickContext } from "../src/engine/sim";
import type { GameState, SimEvent } from "../src/engine/state";
import { bareState, el, openMap } from "./helpers";

function ctxAt(state: GameState, tick: number, seed: number, events: SimEvent[] = []): TickContext {
  state.tick = tick;
  return { tick, rng: (p) => new Rng((seed * 2654435761 + p.length) >>> 0), emit: (e) => events.push({ tick: tick + 1, ...e }) };
}

/** Defender squads hold a hex; attacker squads have just entered it. Fight up to 16 ticks. */
function fight(terrain: Terrain, defenders: number, attackers: number, seed: number) {
  const state = bareState(openMap());
  const hex = state.map.index(20, 20);
  state.map.terrain[hex] = terrain;
  for (let k = 0; k < defenders; k++) state.elements.push({ ...el(`u${k}`, "ua", "infantrySquad", hex), hexSince: 0 });
  for (let k = 0; k < attackers; k++) state.elements.push({ ...el(`r${k}`, "ru", "infantrySquad", hex), hexSince: 10 });
  const events: SimEvent[] = [];
  for (let t = 20; t < 36; t++) {
    closeCombatSystem(state, ctxAt(state, t, seed * 100 + t, events));
    const sides = new Set(state.elements.filter((e) => e.hex === hex).map((e) => e.side));
    if (sides.size < 2) break;
  }
  const lost = (side: "ua" | "ru") =>
    [...state.elements, ...state.destroyed].filter((e) => e.side === side).reduce((n, e) => n + e.killed + e.wounded, 0);
  const holder = [...new Set(state.elements.filter((e) => e.hex === hex).map((e) => e.side))];
  return { state, events, hex, lostUa: lost("ua"), lostRu: lost("ru"), holder };
}

describe("close combat", () => {
  it("is deadly and settles quickly", () => {
    const r = fight(Terrain.Open, 1, 1, 1);
    expect(r.lostUa + r.lostRu).toBeGreaterThan(2);
    expect(r.holder.length).toBe(1);
  });

  it("favours the defender in cover", () => {
    let ua = 0;
    let ru = 0;
    for (let s = 1; s <= 200; s++) {
      const r = fight(Terrain.Village, 1, 1, s);
      ua += r.lostUa;
      ru += r.lostRu;
    }
    expect(ru).toBeGreaterThan(ua * 1.2);
  });

  it("lets a much stronger force take the hex while the weaker side pulls back", () => {
    let attackersWon = 0;
    for (let s = 1; s <= 50; s++) {
      const r = fight(Terrain.Treeline, 1, 3, s);
      if (r.holder[0] === "ru") attackersWon++;
      const withdrew = r.events.filter((e) => e.kind === "withdrew");
      for (const w of withdrew) {
        expect(hexDistance(r.state.map.axialOfIndex(w.hex), r.state.map.axialOfIndex(r.hex))).toBe(1);
        expect(r.state.elements.some((e) => e.side === "ru" && e.hex === w.hex)).toBe(false);
      }
    }
    expect(attackersWon).toBeGreaterThan(40);
  });

  it("reveals both sides to each other", () => {
    const r = fight(Terrain.Open, 1, 1, 3);
    expect(r.state.tracks.ua.some((t) => t.quality === TrackQuality.Targetable) || r.state.tracks.ru.length > 0).toBe(true);
  });

  it("weights vehicles: a mech section outguns a squad", () => {
    expect(combatPower([el("a", "ua", "mechSection", 0)])).toBeGreaterThan(combatPower([el("b", "ru", "infantrySquad", 0)]));
  });
});

describe("assault movement", () => {
  it("stops a moving element when it enters an enemy hex", () => {
    const state = bareState(openMap());
    const enemyHex = state.map.index(12, 10);
    state.elements.push(el("r1", "ru", "infantrySquad", enemyHex));
    const mover = el("u1", "ua", "infantrySquad", state.map.index(5, 10));
    state.elements.push(mover);
    beginMove(state, mover, state.map.index(20, 10));
    const events: SimEvent[] = [];
    for (let t = 0; t < 8 && mover.hex !== enemyHex; t++) runTick(state, events);
    expect(mover.hex === enemyHex || events.some((e) => e.kind === "withdrew" && e.elementId === "u1")).toBe(true);
    expect(mover.move).toBeNull();
  });
});
