/**
 * Strikes: shooters pick targets from their side's tracks, launch with a
 * latency, and impacts resolve in three steps.
 *   reach  - does the strike arrive at all (link loss, malfunction)?
 *   hit    - per munition, by track quality at launch, reduced by terrain cover
 *   effect - casualties on personnel, chance to disable a vehicle by protection
 * Precision strikes (drones) go after one element and miss if it has moved
 * away. Area fire (mortars, guns) hits whoever is in the target hex.
 */
import { ELEMENT_TYPES } from "../data/elements";
import {
  DEFAULT_TARGET_PRIORITY,
  AREA_REENGAGE_TICKS,
  ELEMENT_WEAPON,
  KIA_SHARE,
  MAX_STRIKES_PER_TRACK_PER_TICK,
  type WeaponDef,
  WEAPONS,
} from "../data/strikes";
import { TERRAIN, type Terrain } from "../data/terrain";
import { clockAt } from "./clock";
import { hexDistance } from "./hex";
import type { Rng } from "./rng";
import type { TickContext } from "./sim";
import { type Element, type GameState, SIDES, type SideId, type Track } from "./state";

const enemyOf = (side: SideId): SideId => (side === "ua" ? "ru" : "ua");

function priority(track: Track): number {
  return track.typeId ? DEFAULT_TARGET_PRIORITY[track.typeId] : 1;
}

export function strikeAllocationSystem(state: GameState, ctx: TickContext): void {
  const tick = ctx.tick + 1;
  const phase = clockAt(ctx.tick, state.startHour).phase;
  const rng = ctx.rng("allocate");
  const map = state.map;
  for (const side of SIDES) {
    const tracks = [...state.tracks[side]].sort((a, b) => priority(b) - priority(a) || (a.id < b.id ? -1 : 1));
    if (tracks.length === 0) continue;
    const assigned = new Map<string, number>();
    const ownHexes = new Set(state.elements.filter((e) => e.side === side).map((e) => e.hex));
    // Contacts recently engaged by area fire wait for assessment before being shelled again.
    const recentlyShelled = (t: Track) => tick - t.shelledTick < AREA_REENGAGE_TICKS;
    for (const shooter of state.elements) {
      if (shooter.side !== side) continue;
      const wid = ELEMENT_WEAPON[shooter.typeId];
      if (!wid) continue;
      const weapon: WeaponDef = WEAPONS[wid];
      if (shooter.ammo < weapon.perMission || shooter.busyUntil > tick) continue;
      if (shooter.missionsToday >= weapon.missionsPerDay.value) continue;
      if (weapon.requiresStationary && shooter.move) continue;
      if (rng.float() >= weapon.availability[phase]) continue;
      const from = map.axialOfIndex(shooter.hex);
      const target = tracks.find(
        (t) =>
          t.quality >= weapon.minQuality &&
          (assigned.get(t.id) ?? 0) < MAX_STRIKES_PER_TRACK_PER_TICK &&
          hexDistance(from, map.axialOfIndex(t.hex)) <= weapon.rangeHex &&
          // Area weapons never fire onto a hex holding friendly elements.
          !(weapon.kind === "area" && (ownHexes.has(t.hex) || recentlyShelled(t))),
      );
      if (!target) continue;
      assigned.set(target.id, (assigned.get(target.id) ?? 0) + 1);
      shooter.ammo -= weapon.perMission;
      shooter.busyUntil = tick + weapon.cooldownTicks;
      shooter.missionsToday++;
      if (weapon.kind === "area") target.shelledTick = tick;
      shooter.firedTick = ctx.tick;
      state.strikeCounter++;
      state.strikes.push({
        id: state.strikeCounter,
        side,
        shooterId: shooter.id,
        weapon: wid,
        targetHex: target.hex,
        trackId: target.id,
        targetId: target.targetId,
        quality: target.quality,
        launchTick: tick,
        impactTick: tick + weapon.latencyTicks,
      });
      ctx.emit({
        kind: "strikeLaunched",
        side,
        elementId: shooter.id,
        hex: target.hex,
        fromHex: shooter.hex,
        note: `${weapon.name} on contact ${target.id}`,
      });
    }
  }
}

interface Damage {
  casualties: number;
  vehiclesLost: number;
}

/** Apply one hit to an element; returns what it did. */
export function applyCasualties(target: Element, casualties: number, rng: Rng): number {
  const n = Math.min(casualties, target.personnel);
  for (let k = 0; k < n; k++) {
    if (rng.float() < KIA_SHARE.value) target.killed++;
    else target.wounded++;
  }
  target.personnel -= n;
  return n;
}

function applyHit(target: Element, weapon: WeaponDef, rng: Rng): Damage {
  const type = ELEMENT_TYPES[target.typeId];
  let casualties = 0;
  let vehiclesLost = 0;
  if (target.vehicles > 0 && type.protection !== "none") {
    // Protected vehicles: the hit lands on a vehicle; crew casualties only if it is knocked out.
    if (rng.float() < weapon.vehicleKill[type.protection]) {
      vehiclesLost = 1;
      casualties = rng.range(1, 2);
    }
  } else {
    if (target.vehicles > 0 && rng.float() < weapon.vehicleKill.none * 0.5) vehiclesLost = 1;
    casualties = rng.range(weapon.casualties[0], weapon.casualties[1]);
  }
  casualties = Math.min(casualties, target.personnel);
  for (let k = 0; k < casualties; k++) {
    if (rng.float() < KIA_SHARE.value) target.killed++;
    else target.wounded++;
  }
  target.personnel -= casualties;
  target.vehicles = Math.max(0, target.vehicles - vehiclesLost);
  return { casualties, vehiclesLost };
}

export function strikeResolutionSystem(state: GameState, ctx: TickContext): void {
  const tick = ctx.tick + 1;
  const rng = ctx.rng("resolve");
  const map = state.map;
  const due = state.strikes.filter((s) => s.impactTick <= tick);
  if (due.length === 0) return;
  state.strikes = state.strikes.filter((s) => s.impactTick > tick);
  const damage = new Map<string, Damage>();
  const record = (e: Element, d: Damage) => {
    if (d.casualties === 0 && d.vehiclesLost === 0) return;
    const prev = damage.get(e.id) ?? { casualties: 0, vehiclesLost: 0 };
    damage.set(e.id, { casualties: prev.casualties + d.casualties, vehiclesLost: prev.vehiclesLost + d.vehiclesLost });
  };

  for (const strike of due) {
    const weapon: WeaponDef = WEAPONS[strike.weapon];
    if (rng.float() >= weapon.reach.value) continue;
    const baseHit = weapon.hit[strike.quality] ?? 0;
    const coverAt = (hex: number) => TERRAIN[map.terrain[hex] as Terrain].cover.value;
    if (weapon.kind === "precision") {
      const target = state.elements.find((e) => e.id === strike.targetId);
      if (!target || target.personnel <= 0) continue;
      const d = hexDistance(map.axialOfIndex(target.hex), map.axialOfIndex(strike.targetHex));
      // The operator can chase a target that has moved one hex; further away it is lost.
      const chase = d === 0 ? 1 : d === 1 ? 0.5 : 0;
      for (let m = 0; m < weapon.perMission && target.personnel > 0; m++) {
        if (rng.float() < baseHit * chase * (1 - coverAt(target.hex))) record(target, applyHit(target, weapon, rng));
      }
    } else {
      const victims = state.elements.filter((e) => e.side === enemyOf(strike.side) && e.hex === strike.targetHex);
      for (let m = 0; m < weapon.perMission; m++) {
        for (const v of victims) {
          if (v.personnel > 0 && rng.float() < baseHit * (1 - coverAt(v.hex))) record(v, applyHit(v, weapon, rng));
        }
      }
    }
  }

  for (const [id, d] of damage) {
    const e = state.elements.find((x) => x.id === id)!;
    ctx.emit({
      kind: "struck",
      side: e.side,
      elementId: e.id,
      hex: e.hex,
      note: `${d.casualties} casualties${d.vehiclesLost ? `, ${d.vehiclesLost} vehicle(s) lost` : ""}`,
    });
  }
  removeDestroyed(state, ctx);
}

/** Move elements with no personnel left out of play, recording the loss. */
export function removeDestroyed(state: GameState, ctx: TickContext): void {
  const gone = state.elements.filter((e) => e.personnel <= 0);
  for (const e of gone) {
    e.move = null;
    state.destroyed.push(e);
    ctx.emit({ kind: "destroyed", side: e.side, elementId: e.id, hex: e.hex });
  }
  if (gone.length > 0) state.elements = state.elements.filter((e) => e.personnel > 0);
}

/** Totals of losses per side, for summaries. */
export function lossSummary(state: GameState, side: SideId) {
  const all = [...state.elements, ...state.destroyed].filter((e) => e.side === side);
  const startVehicles = all.reduce((n, e) => n + ELEMENT_TYPES[e.typeId].vehicles.reduce((m, v) => m + v.count, 0), 0);
  return {
    killed: all.reduce((n, e) => n + e.killed, 0),
    wounded: all.reduce((n, e) => n + e.wounded, 0),
    vehiclesLost: startVehicles - all.reduce((n, e) => n + e.vehicles, 0),
    elementsDestroyed: state.destroyed.filter((e) => e.side === side).length,
  };
}

