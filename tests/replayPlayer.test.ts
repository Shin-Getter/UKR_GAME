import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { proberOrders } from "../src/bots/prober";
import { observe, submit } from "../src/engine/controller";
import { runReplay, toReplay, type Replay } from "../src/engine/replay";
import { ReplayPlayer } from "../src/engine/replayPlayer";
import { resolveCycle } from "../src/engine/sim";
import { type GameState, hashState, SIDES } from "../src/engine/state";
import { SCENARIOS } from "../src/scenarios";
import { buildTestSector } from "../src/scenarios/testSector";

function botGame(seed: number, days: number): GameState {
  const state = buildTestSector(seed);
  for (let d = 0; d < days; d++) {
    for (const side of SIDES) submit(state, proberOrders(observe(state, side), state.map, seed));
    resolveCycle(state);
  }
  return state;
}

describe("prober bot", () => {
  it("issues orders the engine accepts and plays deterministically", () => {
    const state = buildTestSector(2);
    resolveCycle(state); // let sensors build a picture first
    for (const side of SIDES) {
      const orders = proberOrders(observe(state, side), state.map, 2);
      expect(orders.orders.length).toBeGreaterThan(0);
      expect(submit(state, orders).rejected).toEqual([]);
    }
    expect(hashState(botGame(5, 4))).toBe(hashState(botGame(5, 4)));
  });
});

describe("replay player", () => {
  const game = botGame(6, 4);
  const replay: Replay = JSON.parse(JSON.stringify(toReplay(game)));

  it("plays to the same final state as runReplay", () => {
    const p = new ReplayPlayer(replay, SCENARIOS);
    expect(p.verify()).toBe(true);
    expect(hashState(p.state)).toBe(hashState(runReplay(replay, SCENARIOS)));
  });

  it("gives the same state at a tick whether reached forwards or by seeking back", () => {
    const a = new ReplayPlayer(replay, SCENARIOS);
    a.seek(150);
    const h = hashState(a.state);
    a.seek(300);
    a.seek(150);
    expect(hashState(a.state)).toBe(h);
    const b = new ReplayPlayer(replay, SCENARIOS);
    for (let i = 0; i < 150; i++) b.step();
    expect(hashState(b.state)).toBe(h);
    expect(a.state.lastEvents).toEqual(b.state.lastEvents);
  });

  it("stops at the end", () => {
    const p = new ReplayPlayer(replay, SCENARIOS);
    p.seek(1e9);
    expect(p.atEnd).toBe(true);
    expect(p.step()).toBe(false);
    expect(p.tick).toBe(p.totalTicks);
  });
});

describe("shipped example replays", () => {
  const dir = "public/replays";
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json");
  it.each(files)("%s still reproduces (regenerate with: npx tsx scripts/selfplay.ts)", (file) => {
    const replay = JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as Replay;
    expect(new ReplayPlayer(replay, SCENARIOS).verify()).toBe(true);
  });
});
