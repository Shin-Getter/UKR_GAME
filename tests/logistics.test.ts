import { describe, expect, it } from "vitest";
import { MAX_SUPPLY_DAYS } from "../src/data/logistics";
import { WEAPONS } from "../src/data/strikes";
import { observe } from "../src/engine/controller";
import { needOf, resupply } from "../src/engine/logistics";
import { resolveCycle, runTick } from "../src/engine/sim";
import type { GameState, SimEvent } from "../src/engine/state";
import { buildTestSector } from "../src/scenarios/testSector";
import { bareState, el, openMap } from "./helpers";

function withDepot(): GameState {
  const state = bareState(openMap(40, 60));
  state.depots.push({ side: "ua", hex: state.map.index(20, 50), stock: 1000, deliveryPerDay: 300, evacuated: 0 });
  return state;
}

function run(state: GameState, ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) runTick(state, events);
  return events;
}

describe("needs and handover", () => {
  it("measures shortfalls and fills sustenance before ammunition", () => {
    const gun = el("u1", "ua", "gunSection", 0);
    expect(needOf(gun)).toEqual({ sp: 0, urgency: 0 });
    gun.supply = 1.5;
    gun.ammo = WEAPONS.gun152.stock / 2;
    expect(needOf(gun).urgency).toBeCloseTo(0.5, 5);
    const used = resupply(gun, 40);
    expect(used).toBeGreaterThan(14);
    expect(gun.supply).toBe(MAX_SUPPLY_DAYS.value);
    expect(gun.ammo).toBeGreaterThan(WEAPONS.gun152.stock / 2);
    expect(resupply(gun, 1e6)).toBeGreaterThan(0);
    expect(gun.ammo).toBe(WEAPONS.gun152.stock);
  });
});

describe("consumption and starvation", () => {
  it("uses a day of sustenance per day, then drains cohesion", () => {
    const state = bareState(openMap());
    const squad = el("u1", "ua", "infantrySquad", state.map.index(5, 5));
    state.elements.push(squad);
    run(state, 96);
    expect(squad.supply).toBeCloseTo(MAX_SUPPLY_DAYS.value - 1, 5);
    expect(squad.cohesion).toBe(1);
    run(state, 96 * 3);
    expect(squad.supply).toBe(0);
    expect(squad.cohesion).toBeLessThan(0.3);
  });
});

describe("carriers", () => {
  it("a truck section loads at the depot, restocks a gun section and comes back", () => {
    const state = withDepot();
    const truck = el("u1", "ua", "logisticsSection", state.depots[0]!.hex);
    const gun = el("u2", "ua", "gunSection", state.map.index(20, 20));
    gun.ammo = 0;
    state.elements.push(truck, gun);
    const events = run(state, 40);
    expect(gun.ammo).toBeGreaterThan(40);
    expect(events.some((e) => e.kind === "resupplied" && e.elementId === "u2")).toBe(true);
    expect(state.depots[0]!.stock).toBeLessThan(1000);
    run(state, 40);
    expect(truck.hex).toBe(state.depots[0]!.hex);
  });

  it("ground robots serve the infantry and bring wounded back; trucks do not go forward", () => {
    const state = withDepot();
    const ugv = el("u1", "ua", "ugvTeam", state.depots[0]!.hex);
    const truck = el("u3", "ua", "logisticsSection", state.depots[0]!.hex);
    const squad = el("u2", "ua", "infantrySquad", state.map.index(20, 30));
    squad.supply = 0.5;
    squad.personnel = 7;
    squad.wounded = 2;
    squad.waiting = 2;
    state.elements.push(ugv, truck, squad);
    run(state, 96);
    expect(squad.supply).toBeGreaterThan(1.5);
    expect(squad.waiting).toBe(0);
    expect(state.depots[0]!.evacuated + squad.killed).toBe(2);
    expect(truck.hex).toBe(state.depots[0]!.hex);
  });

  it("cannot deliver what the depot does not have", () => {
    const state = withDepot();
    state.depots[0]!.stock = 0;
    const truck = el("u1", "ua", "logisticsSection", state.depots[0]!.hex);
    const gun = el("u2", "ua", "gunSection", state.map.index(20, 20));
    gun.ammo = 0;
    state.elements.push(truck, gun);
    run(state, 60);
    expect(gun.ammo).toBe(0);
    expect(truck.hex).toBe(state.depots[0]!.hex);
  });
});

describe("ground robots", () => {
  it("lose machines, not operators, and re-equip at the depot", () => {
    const state = withDepot();
    const ugv = el("u1", "ua", "ugvTeam", state.map.index(20, 20));
    ugv.vehicles = 0;
    state.elements.push(ugv);
    run(state, 1);
    expect(ugv.hex).toBe(state.depots[0]!.hex);
    expect(ugv.personnel).toBe(2);
    run(state, 60);
    expect(ugv.vehicles).toBe(2);
    expect(state.depots[0]!.stock).toBeLessThan(1000 - 79);
  });

  it("route around enemy positions their side knows about", () => {
    const state = withDepot();
    const ugv = el("u1", "ua", "ugvTeam", state.depots[0]!.hex);
    const squad = el("u2", "ua", "infantrySquad", state.map.index(20, 30));
    squad.supply = 0.2;
    const enemy = el("r1", "ru", "infantrySquad", state.map.index(20, 40));
    state.elements.push(ugv, squad, enemy);
    state.tracks.ua.push({ id: "ua-T1", targetId: "r1", quality: 3, hex: enemy.hex, lastSeenTick: 0, qualityTick: 0, typeId: "infantrySquad", shelledTick: -1000 });
    run(state, 2);
    expect(ugv.move).not.toBeNull();
    expect(ugv.move!.path).not.toContain(enemy.hex);
  });
});

describe("wounded", () => {
  it("die at a steady rate while they wait", () => {
    const state = bareState(openMap());
    const squads = Array.from({ length: 40 }, (_, k) => {
      const s = el(`u${k}`, "ua", "infantrySquad", state.map.index(k % 30, 5 + Math.floor(k / 30)));
      s.personnel = 4;
      s.wounded = 5;
      s.waiting = 5;
      return s;
    });
    state.elements.push(...squads);
    run(state, 96);
    const died = squads.reduce((n, s) => n + s.killed, 0);
    expect(died).toBeGreaterThan(40);
    expect(died).toBeLessThan(90);
    for (const s of squads) expect(s.killed + s.wounded).toBe(5);
  });
});

describe("scenario logistics", () => {
  it("gives each side a depot, trucks and ground robots, and shows a side only its own depot", () => {
    const state = buildTestSector(1);
    expect(state.depots.map((d) => d.side).sort()).toEqual(["ru", "ua"]);
    for (const side of ["ua", "ru"] as const) {
      const own = state.elements.filter((e) => e.side === side);
      expect(own.filter((e) => e.typeId === "ugvTeam")).toHaveLength(3);
      expect(own.filter((e) => e.typeId === "logisticsSection")).toHaveLength(2);
      expect(observe(state, side).depots).toHaveLength(1);
    }
  });

  it("keeps shooters supplied over ten quiet days and tops the depot up daily", () => {
    const state = buildTestSector(1);
    for (let d = 0; d < 10; d++) resolveCycle(state);
    // A few front-line elements may go short when their side's robots are shot up: that is the model working.
    const hungry = state.elements.filter((e) => e.supply === 0);
    expect(hungry.length).toBeLessThan(6);
    const launched = state.lastEvents.filter((e) => e.kind === "strikeLaunched").length;
    expect(launched).toBeGreaterThan(5);
  });
});
