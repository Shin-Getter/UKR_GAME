import { describe, expect, it } from "vitest";
import { observe, submit } from "../src/engine/controller";
import { offsetToAxial, axialToOffset } from "../src/engine/hex";
import type { Order } from "../src/engine/orders";
import { runReplay, toReplay } from "../src/engine/replay";
import { resolveCycle } from "../src/engine/sim";
import { type GameState, hashState } from "../src/engine/state";
import { SCENARIOS } from "../src/scenarios";
import { buildTestSector } from "../src/scenarios/testSector";

function offsetOf(state: GameState, hex: number) {
  return axialToOffset(state.map.axialOfIndex(hex));
}

/** A deterministic script: every few cycles, move some infantry 4 hexes towards the river. */
function playScripted(seed: number, days: number): GameState {
  const state = buildTestSector(seed);
  for (let d = 0; d < days; d++) {
    for (const side of ["ua", "ru"] as const) {
      const orders: Order[] = state.elements
        .filter((e) => e.side === side && e.typeId === "infantrySquad")
        .filter((_, i) => (i + d) % 3 === 0)
        .map((e) => {
          const o = offsetOf(state, e.hex);
          const to = { col: o.col + ((d % 2) * 2 - 1), row: o.row + (side === "ua" ? -2 : 2) };
          return { kind: "move", elementId: e.id, to };
        });
      submit(state, { side, cycle: state.cycle, orders });
    }
    resolveCycle(state);
  }
  return state;
}

describe("test sector scenario", () => {
  const state = buildTestSector(1);

  it("fields a force for each side on dry ground", () => {
    for (const side of ["ua", "ru"] as const) {
      const els = state.elements.filter((e) => e.side === side);
      expect(els.length).toBeGreaterThan(20);
      for (const e of els) expect(state.map.terrain[e.hex]).not.toBe(6);
    }
  });

  it("gives every element a unit of its own side", () => {
    for (const e of state.elements) {
      const u = state.units.find((x) => x.id === e.unitId);
      expect(u?.side).toBe(e.side);
    }
  });

  it("is deterministic for a seed", () => {
    expect(hashState(buildTestSector(1))).toBe(hashState(state));
    expect(hashState(buildTestSector(2))).not.toBe(hashState(state));
  });
});

describe("orders and cycles", () => {
  it("advances 96 ticks per cycle", () => {
    const state = buildTestSector(1);
    resolveCycle(state);
    resolveCycle(state);
    expect(state.tick).toBe(192);
    expect(state.cycle).toBe(2);
  });

  it("rejects invalid orders with reasons", () => {
    const state = buildTestSector(1);
    const ua = state.elements.find((e) => e.side === "ua")!;
    const ru = state.elements.find((e) => e.side === "ru")!;
    const result = submit(state, {
      side: "ua",
      cycle: 0,
      orders: [
        { kind: "move", elementId: ru.id, to: { col: 1, row: 1 } },
        { kind: "move", elementId: "nope", to: { col: 1, row: 1 } },
        { kind: "move", elementId: ua.id, to: { col: -5, row: 1 } },
        { kind: "hold", elementId: ua.id },
        { kind: "hold", elementId: ua.id },
      ],
    });
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected.map((r) => r.reason)).toEqual([
      `element ${ru.id} belongs to the other side`,
      "unknown element nope",
      "destination is off the map",
      `more than one order for element ${ua.id}`,
    ]);
  });

  it("rejects orders for the wrong cycle", () => {
    const state = buildTestSector(1);
    const ua = state.elements.find((e) => e.side === "ua")!;
    const result = submit(state, { side: "ua", cycle: 3, orders: [{ kind: "hold", elementId: ua.id }] });
    expect(result.accepted).toHaveLength(0);
  });

  it("moves an ordered element during the cycle", () => {
    const state = buildTestSector(1);
    const el = state.elements.find((e) => e.side === "ua" && e.typeId === "infantrySquad")!;
    const start = el.hex;
    const o = offsetOf(state, start);
    submit(state, { side: "ua", cycle: 0, orders: [{ kind: "move", elementId: el.id, to: { col: o.col, row: o.row + 6 } }] });
    const events = resolveCycle(state);
    expect(el.hex).not.toBe(start);
    expect(events.some((e) => e.kind === "orderApplied" && e.elementId === el.id)).toBe(true);
  });
});

describe("controller interface", () => {
  it("shows a side only its own forces", () => {
    const state = buildTestSector(1);
    const obs = observe(state, "ua");
    expect(obs.elements.every((e) => e.side === "ua")).toBe(true);
    expect(obs.units.every((u) => u.side === "ua")).toBe(true);
    expect(obs.tracks).toEqual([]);
  });

  it("returns a copy that cannot change the game", () => {
    const state = buildTestSector(1);
    const obs = observe(state, "ua");
    obs.elements[0]!.hex = 0;
    expect(state.elements.find((e) => e.id === obs.elements[0]!.id)!.hex).not.toBe(0);
  });
});

describe("determinism and replays", () => {
  it("gives the same result for the same seed and orders over 7 days", () => {
    expect(hashState(playScripted(3, 7))).toBe(hashState(playScripted(3, 7)));
  });

  it("rebuilds a game exactly from its replay, including after a JSON round trip", () => {
    const state = playScripted(4, 5);
    const replay = JSON.parse(JSON.stringify(toReplay(state)));
    const rebuilt = runReplay(replay, SCENARIOS);
    expect(hashState(rebuilt)).toBe(hashState(state));
    expect(rebuilt.elements).toEqual(state.elements);
  });

  it("detects a tampered replay", () => {
    const replay = toReplay(playScripted(4, 2));
    replay.cycles[0]!.ua = null;
    expect(() => runReplay(replay, SCENARIOS)).toThrow(/desync/);
  });

  it("matches the golden hash after a scripted week (update deliberately)", () => {
    expect(hashState(playScripted(5, 7))).toMatchSnapshot();
  });

  it("keeps offset/axial helpers consistent for orders", () => {
    expect(axialToOffset(offsetToAxial({ col: 7, row: 9 }))).toEqual({ col: 7, row: 9 });
  });
});
