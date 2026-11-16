/**
 * Close combat: every tick, each hex holding elements of both sides is a
 * firefight. Each side inflicts casualties in proportion to its combat power
 * (people and vehicles weighted by type), reduced by the target's cover: the
 * side that was in the hex first defends with the terrain's full cover, the
 * attacker gets only a share of it. A side that falls well behind in power
 * pulls back to a neighbouring hex free of enemies. Fighting at close range
 * also reveals each side to the other.
 */
import {
  ATTACKER_COVER_SHARE,
  BREAK_COHESION,
  BREAK_RATIO,
  CLOSE_COMBAT_LETHALITY,
  PERSON_WEIGHT,
  SUPPRESSION_PER_CC_CASUALTY,
  VEHICLE_WEIGHT,
} from "../data/combat";
import { effectiveCover } from "./fieldworks";
import { TrackQuality } from "../data/sensing";
import { TERRAIN, type Terrain } from "../data/terrain";
import { hexDistance, neighbors } from "./hex";
import type { Rng } from "./rng";
import { applyDetection } from "./sensing";
import type { TickContext } from "./sim";
import { type Element, type GameState, SIDES, type SideId } from "./state";
import { applyCasualties, removeDestroyed } from "./strikes";

/** Combat power: people and vehicles weighted by type, reduced by suppression and low cohesion. */
export function combatPower(els: readonly Element[]): number {
  let p = 0;
  for (const e of els) {
    const raw = e.personnel * PERSON_WEIGHT[e.typeId] + e.vehicles * (VEHICLE_WEIGHT[e.typeId] ?? 0);
    p += raw * (1 - 0.5 * e.suppression) * (0.5 + 0.5 * e.cohesion);
  }
  return p;
}

/** Turn an expected value into an integer: floor plus a chance of one more. */
function roundStochastic(x: number, rng: Rng): number {
  const f = Math.floor(x);
  return f + (rng.float() < x - f ? 1 : 0);
}

/** Spread casualties over elements, each one hitting an element chosen by headcount. */
function distribute(els: Element[], casualties: number, rng: Rng): number {
  let dealt = 0;
  for (let k = 0; k < casualties; k++) {
    const total = els.reduce((n, e) => n + e.personnel, 0);
    if (total <= 0) break;
    let pick = rng.int(total);
    const victim = els.find((e) => (pick -= e.personnel) < 0)!;
    dealt += applyCasualties(victim, 1, rng);
  }
  return dealt;
}

/** Neighbouring hex to fall back to: no enemies in it, closest to friendly elements elsewhere. */
function fallbackHex(state: GameState, side: SideId, hex: number): number | null {
  const map = state.map;
  const friends = state.elements.filter((e) => e.side === side && e.hex !== hex);
  const enemyHexes = new Set(state.elements.filter((e) => e.side !== side).map((e) => e.hex));
  let best: number | null = null;
  let bestScore = Infinity;
  for (const n of neighbors(map.axialOfIndex(hex))) {
    const i = map.indexOfAxial(n);
    if (i < 0 || enemyHexes.has(i) || !Number.isFinite(TERRAIN[map.terrain[i] as Terrain].footMoveCost.value)) continue;
    // Average distance to friendly elements: lower means towards our own lines.
    let score = 0;
    for (const f of friends) score += hexDistance(n, map.axialOfIndex(f.hex));
    score = friends.length ? score / friends.length : 0;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

export function closeCombatSystem(state: GameState, ctx: TickContext): void {
  const tick = ctx.tick + 1;
  const rng = ctx.rng("melee");
  const byHex = new Map<number, Record<SideId, Element[]>>();
  for (const e of state.elements) {
    let g = byHex.get(e.hex);
    if (!g) byHex.set(e.hex, (g = { ua: [], ru: [] }));
    g[e.side].push(e);
  }
  const contested = [...byHex.entries()].filter(([, g]) => g.ua.length > 0 && g.ru.length > 0).sort((a, b) => a[0] - b[0]);
  if (contested.length === 0) return;

  for (const [hex, g] of contested) {
    // Both sides see everything in the hex.
    for (const side of SIDES) for (const enemy of g[side === "ua" ? "ru" : "ua"]) applyDetection(state, side, enemy, TrackQuality.Targetable, ctx, rng, hex);

    const since = (side: SideId) => Math.min(...g[side].map((e) => e.hexSince));
    const defender: SideId | null = since("ua") < since("ru") ? "ua" : since("ru") < since("ua") ? "ru" : null;
    // Defenders fight from their full cover (terrain plus field fortification); attackers get a share of the terrain.
    const avgCover = (side: SideId) => g[side].reduce((n, e) => n + effectiveCover(state.map, e), 0) / g[side].length;
    const terrainCover = TERRAIN[state.map.terrain[hex] as Terrain].cover.value;
    const coverOf = (side: SideId) => (side === defender ? avgCover(side) : terrainCover * ATTACKER_COVER_SHARE.value);
    const power = { ua: combatPower(g.ua), ru: combatPower(g.ru) };
    const dealt: Record<SideId, number> = { ua: 0, ru: 0 };
    for (const side of SIDES) {
      const enemy: SideId = side === "ua" ? "ru" : "ua";
      const expected = CLOSE_COMBAT_LETHALITY.value * power[enemy] * (1 - coverOf(side));
      dealt[side] = distribute(g[side], roundStochastic(expected, rng), rng);
      for (const e of g[side]) e.suppression = Math.min(1, e.suppression + (dealt[side] / g[side].length) * SUPPRESSION_PER_CC_CASUALTY.value + 0.1);
    }
    for (const side of SIDES) {
      if (dealt[side] > 0) {
        ctx.emit({
          kind: "closeCombat",
          side,
          elementId: g[side][0]!.id,
          hex,
          note: `${dealt[side]} casualties${side === defender ? " (defending)" : defender ? " (attacking)" : ""}`,
        });
      }
    }

    // Break: the side clearly losing the firefight pulls back.
    const alive = (side: SideId) => g[side].filter((e) => e.personnel > 0);
    const after = { ua: combatPower(alive("ua")), ru: combatPower(alive("ru")) };
    const cohesion = (side: SideId) => alive(side).reduce((n, e) => n + e.cohesion, 0) / Math.max(1, alive(side).length);
    for (const side of SIDES) {
      const enemy: SideId = side === "ua" ? "ru" : "ua";
      const outgunned = after[side] < BREAK_RATIO.value * after[enemy];
      const shaken = cohesion(side) < BREAK_COHESION.value && after[enemy] > 0;
      if (after[side] > 0 && (outgunned || shaken)) {
        const to = fallbackHex(state, side, hex);
        if (to === null) continue; // nowhere to go: fight on
        for (const e of g[side]) {
          if (e.personnel <= 0) continue;
          e.hex = to;
          e.hexSince = tick;
          e.move = null;
          ctx.emit({ kind: "withdrew", side, elementId: e.id, hex: to, fromHex: hex });
        }
        break; // only one side can break
      }
    }
  }
  removeDestroyed(state, ctx);
}
