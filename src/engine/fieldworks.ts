/**
 * Field fortification and morale bookkeeping, per tick:
 *  - stationary, unpinned elements dig in (scrapes to trenches; vehicles revet);
 *  - suppression decays; cohesion recovers while an element is not under fire.
 * Proper engineered fortifications (per hex, built by engineers) come later.
 */
import { COHESION_RECOVERY_PER_TICK, PINNED_AT, SUPPRESSION_DECAY } from "../data/combat";
import { ELEMENT_TYPES, Mobility } from "../data/elements";
import { DIG_COVER, DIG_HOURS_TO_FULL } from "../data/movement";
import { TERRAIN, type Terrain } from "../data/terrain";
import { TICKS_PER_HOUR } from "../data/time";
import type { HexMap } from "./map";
import type { TickContext } from "./sim";
import type { Element, GameState } from "./state";

/** Cover an element enjoys: terrain cover plus its own field fortification. */
export function effectiveCover(map: HexMap, el: Element): number {
  const terrain = TERRAIN[map.terrain[el.hex] as Terrain].cover.value;
  return 1 - (1 - terrain) * (1 - DIG_COVER.value * el.dig);
}

export function fieldworksSystem(state: GameState, _ctx: TickContext): void {
  for (const el of state.elements) {
    if (el.move || el.suppression >= PINNED_AT.value) continue;
    const hours = ELEMENT_TYPES[el.typeId].mobility === Mobility.Foot ? DIG_HOURS_TO_FULL.foot.value : DIG_HOURS_TO_FULL.vehicle.value;
    el.dig = Math.min(1, el.dig + 1 / (hours * TICKS_PER_HOUR));
  }
}

export function moraleSystem(state: GameState, _ctx: TickContext): void {
  for (const el of state.elements) {
    const underFire = el.suppression > 0.05;
    el.suppression = el.suppression * SUPPRESSION_DECAY.value;
    if (el.suppression < 0.01) el.suppression = 0;
    if (!underFire) el.cohesion = Math.min(1, el.cohesion + COHESION_RECOVERY_PER_TICK.value);
  }
}
