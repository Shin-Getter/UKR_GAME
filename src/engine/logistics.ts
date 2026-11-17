/**
 * Logistics, per tick:
 *  - every element eats into its sustenance; with none left its cohesion drains;
 *  - wounded waiting for evacuation may die;
 *  - carriers (truck sections, ground robot teams) run on their own: load at
 *    the depot, drive to the neediest consumer of their kind, hand over
 *    sustenance and ammunition, take wounded aboard, and return.
 * Carriers are ordinary elements: every trip is a movement the enemy can
 * detect and strike, which is what makes the last kilometres costly.
 */
import { ELEMENT_TYPES } from "../data/elements";
import {
  CARRIERS,
  type CarrierDef,
  DIED_OF_WOUNDS_PER_TICK,
  FRONTLINE_CATEGORIES,
  HAUL_RETRY_TICKS,
  MAX_SUPPLY_DAYS,
  MUNITION_SP,
  RESUPPLY_THRESHOLD,
  ROBOT_REEQUIP_TICKS,
  ROBOT_REPLACEMENT_SP,
  SP_PER_PERSON_DAY,
  STARVATION_COHESION_LOSS_PER_TICK,
} from "../data/logistics";
import { ELEMENT_WEAPON, WEAPONS } from "../data/strikes";
import { TICKS_PER_DAY } from "../data/time";
import { hexDistance, neighbors } from "./hex";
import { TrackQuality } from "../data/sensing";
import { beginMove } from "./movement";
import type { TickContext } from "./sim";
import { type Depot, type Element, type GameState, SIDES, type SideId } from "./state";

/** What an element is short of, in supply points and as the worse of its two shortfalls (0..1). */
export function needOf(el: Element): { sp: number; urgency: number } {
  const sustDeficit = Math.max(0, MAX_SUPPLY_DAYS.value - el.supply);
  let sp = sustDeficit * el.personnel * SP_PER_PERSON_DAY.value;
  let urgency = sustDeficit / MAX_SUPPLY_DAYS.value;
  const wid = ELEMENT_WEAPON[el.typeId];
  if (wid) {
    const missing = WEAPONS[wid].stock - el.ammo;
    sp += missing * MUNITION_SP[wid];
    urgency = Math.max(urgency, missing / WEAPONS[wid].stock);
  }
  return { sp, urgency };
}

/** Hand over up to `available` SP: sustenance first, then ammunition. Returns SP used. */
export function resupply(el: Element, available: number): number {
  let left = available;
  const perDay = el.personnel * SP_PER_PERSON_DAY.value;
  if (perDay > 0) {
    const days = Math.min(MAX_SUPPLY_DAYS.value - el.supply, left / perDay);
    el.supply += days;
    left -= days * perDay;
  }
  const wid = ELEMENT_WEAPON[el.typeId];
  if (wid) {
    const rounds = Math.min(WEAPONS[wid].stock - el.ammo, Math.floor(left / MUNITION_SP[wid]));
    el.ammo += rounds;
    left -= rounds * MUNITION_SP[wid];
  }
  return available - left;
}

function serves(def: CarrierDef, target: Element): boolean {
  if (CARRIERS[target.typeId]) return false; // carriers look after themselves at the depot
  const frontline = FRONTLINE_CATEGORIES.includes(ELEMENT_TYPES[target.typeId].category);
  return def.serves === "frontline" ? frontline : !frontline;
}

function runCarrier(
  state: GameState,
  ctx: TickContext,
  el: Element,
  def: CarrierDef,
  depot: Depot,
  claimed: Set<string>,
  avoid: ReadonlySet<number>,
): void {
  const map = state.map;
  const tick = ctx.tick + 1;
  const type = ELEMENT_TYPES[el.typeId];
  const fullVehicles = type.vehicles.reduce((n, v) => n + v.count, 0);
  // Lost vehicles take their share of the load with them.
  const capacity = (def.capacity * el.vehicles) / fullVehicles;
  if (el.cargo > capacity) el.cargo = capacity;

  if (type.uncrewed && el.vehicles === 0 && el.hex !== depot.hex) {
    // All robots lost: the team (which works from the rear) re-equips at the depot.
    el.hex = depot.hex;
    el.hexSince = tick;
    el.move = null;
    el.haulTarget = null;
    el.carried = 0;
    el.haulRetryTick = tick + ROBOT_REEQUIP_TICKS.value;
    return;
  }
  if (el.move) return;
  const dist = (hex: number) => hexDistance(map.axialOfIndex(el.hex), map.axialOfIndex(hex));
  const atDepot = dist(depot.hex) <= 1;

  if (atDepot) {
    depot.evacuated += el.carried;
    el.carried = 0;
    el.supply = MAX_SUPPLY_DAYS.value;
    if (type.uncrewed && el.vehicles < fullVehicles && tick >= el.haulRetryTick) {
      const robots = Math.min(fullVehicles - el.vehicles, Math.floor(depot.stock / ROBOT_REPLACEMENT_SP.value));
      el.vehicles += robots;
      depot.stock -= robots * ROBOT_REPLACEMENT_SP.value;
      return; // loads next tick, with its new capacity
    }
    const load = Math.min(capacity - el.cargo, depot.stock);
    el.cargo += load;
    depot.stock -= load;
  }

  // Arrived next to the consumer: hand over, take wounded aboard.
  const target = el.haulTarget ? state.elements.find((e) => e.id === el.haulTarget) : undefined;
  if (el.haulTarget && !target) el.haulTarget = null; // consumer was lost
  if (target && dist(target.hex) <= 1) {
    const used = resupply(target, el.cargo);
    el.cargo -= used;
    const picked = Math.min(def.seats - el.carried, target.waiting);
    target.waiting -= picked;
    el.carried += picked;
    el.haulTarget = null;
    ctx.emit({
      kind: "resupplied",
      side: el.side,
      elementId: target.id,
      hex: target.hex,
      fromHex: el.hex,
      note: `${Math.round(used)} SP${picked ? `, ${picked} wounded evacuated` : ""}`,
    });
  }

  if (tick < el.haulRetryTick) return;
  const go = (hex: number): boolean => {
    if (beginMove(state, el, hex, "tactical", avoid)) return true;
    el.haulRetryTick = tick + HAUL_RETRY_TICKS;
    return false;
  };

  if (el.haulTarget) {
    // Still on the way (stopped short, or the consumer moved): keep going.
    const t = state.elements.find((e) => e.id === el.haulTarget)!;
    if (!go(t.hex)) el.haulTarget = null;
    return;
  }

  // Choose the next job: the neediest unclaimed consumer, unless we are empty or carrying wounded.
  if (el.cargo > 0 && el.carried === 0) {
    let best: Element | undefined;
    let bestUrgency = RESUPPLY_THRESHOLD.value;
    for (const c of state.elements) {
      if (c.side !== el.side || claimed.has(c.id) || !serves(def, c)) continue;
      const u = needOf(c).urgency + (c.waiting > 0 ? 0.2 : 0);
      if (u > bestUrgency || (u === bestUrgency && best && c.id < best.id)) {
        best = c;
        bestUrgency = u;
      }
    }
    if (best && go(best.hex)) {
      el.haulTarget = best.id;
      claimed.add(best.id);
      return;
    }
  }
  // Nothing to do out here: go home.
  if (!atDepot) go(depot.hex);
}

export function logisticsSystem(state: GameState, ctx: TickContext): void {
  const rng = ctx.rng("wounds");
  for (const el of state.elements) {
    // Consumption and starvation.
    el.supply = Math.max(0, el.supply - 1 / TICKS_PER_DAY);
    if (el.supply === 0) el.cohesion = Math.max(0, el.cohesion - STARVATION_COHESION_LOSS_PER_TICK.value);
    // Wounded who wait too long die.
    for (let k = el.waiting; k > 0; k--) {
      if (rng.float() < DIED_OF_WOUNDS_PER_TICK.value) {
        el.waiting--;
        el.wounded--;
        el.killed++;
      }
    }
  }
  const claimed = new Set<string>();
  for (const el of state.elements) if (el.haulTarget) claimed.add(el.haulTarget);
  // Carriers route around enemy positions their side knows about (and the hexes next to them).
  const avoid: Record<SideId, Set<number>> = { ua: new Set(), ru: new Set() };
  for (const side of SIDES) {
    for (const t of state.tracks[side]) {
      if (t.quality < TrackQuality.Detected) continue;
      avoid[side].add(t.hex);
      for (const n of neighbors(state.map.axialOfIndex(t.hex))) {
        const i = state.map.indexOfAxial(n);
        if (i >= 0) avoid[side].add(i);
      }
    }
  }
  for (const el of state.elements) {
    const def = CARRIERS[el.typeId];
    if (!def) continue;
    const depot = state.depots.find((d) => d.side === el.side);
    if (depot) runCarrier(state, ctx, el, def, depot, claimed, avoid[el.side]);
  }
}

/** Daily delivery from off-map, at the start of each orders cycle. */
export function deliverToDepots(state: GameState, maxStock: number): void {
  for (const d of state.depots) d.stock = Math.min(maxStock, d.stock + d.deliveryPerDay);
}
