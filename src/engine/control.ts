/**
 * Control of ground as a gradient, not a flag. Each element projects
 * presence onto nearby hexes (its own hex fully, neighbours less); a hex is
 * held by a side with enough presence and no enemy presence, contested when
 * both have it. Derived from positions each time it is asked for; nothing is
 * stored in the game state.
 */
import { PERSON_WEIGHT } from "../data/combat";
import { ELEMENT_TYPES } from "../data/elements";
import { axialToOffset, offsetToAxial } from "./hex";
import type { HexMap } from "./map";
import type { Element, SideId } from "./state";

export enum Control {
  None = 0,
  Ua = 1,
  Ru = 2,
  Contested = 3,
}

/** Presence falloff by distance in hexes. */
const FALLOFF = [1, 0.5, 0.2];
/** Presence needed to count. */
const THRESHOLD = 0.3;

export interface PresenceSource {
  side: SideId;
  hex: number;
  /** Strength 0..1 (a full rifle squad is about 1). */
  weight: number;
}

export function presenceOf(el: Element): number {
  const raw = (el.personnel * PERSON_WEIGHT[el.typeId]) / 9;
  return Math.min(1, raw) * (ELEMENT_TYPES[el.typeId].category === "infantry" ? 1 : 0.6);
}

export function controlMap(map: HexMap, sources: PresenceSource[]): Uint8Array {
  const ua = new Float32Array(map.size);
  const ru = new Float32Array(map.size);
  const r = FALLOFF.length - 1;
  for (const s of sources) {
    const o = axialToOffset(map.axialOfIndex(s.hex));
    const centre = map.axialOfIndex(s.hex);
    const field = s.side === "ua" ? ua : ru;
    for (let row = Math.max(0, o.row - r); row <= Math.min(map.rows - 1, o.row + r); row++) {
      for (let col = Math.max(0, o.col - r - 1); col <= Math.min(map.cols - 1, o.col + r + 1); col++) {
        const h = offsetToAxial({ col, row });
        const d = (Math.abs(h.q - centre.q) + Math.abs(h.r - centre.r) + Math.abs(h.q + h.r - centre.q - centre.r)) / 2;
        if (d > r) continue;
        field[map.index(col, row)]! += s.weight * FALLOFF[d]!;
      }
    }
  }
  const out = new Uint8Array(map.size);
  for (let i = 0; i < map.size; i++) {
    const a = ua[i]! >= THRESHOLD;
    const b = ru[i]! >= THRESHOLD;
    out[i] = a && b ? Control.Contested : a ? Control.Ua : b ? Control.Ru : Control.None;
  }
  return out;
}
