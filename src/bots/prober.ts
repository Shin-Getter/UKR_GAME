/**
 * "Prober": a deliberately simple scripted bot for self-play and testing.
 * It sees only its side's Observation (plus the public map) and each day:
 *  - points each recon drone at the freshest located contact within reach;
 *  - sends one or two infantry elements forward towards the enemy (to the
 *    nearest located contact, or a few hexes towards the average contact);
 *    groups of six or fewer infiltrate, larger ones move tactically.
 * Everything else holds. It plays through the same controller interface an
 * AI or the UI uses.
 */
import { ELEMENT_SENSORS, SENSORS, TrackQuality } from "../data/sensing";
import type { Observation } from "../engine/controller";
import { axialToOffset, hexDistance, type Offset } from "../engine/hex";
import type { HexMap } from "../engine/map";
import type { Order, Orders } from "../engine/orders";
import { Rng } from "../engine/rng";

export interface ProberOptions {
  /** Infantry elements sent forward per day. */
  probesPerDay?: number;
  /** Furthest a probe is sent in one day, in hexes. */
  maxAdvanceHex?: number;
}

export function proberOrders(obs: Observation, map: HexMap, seed: number, options: ProberOptions = {}): Orders {
  const probes = options.probesPerDay ?? 2;
  const maxAdvance = options.maxAdvanceHex ?? 6;
  const rng = new Rng((seed ^ Math.imul(obs.cycle + 1, 0x2545f491) ^ (obs.side === "ua" ? 0x55 : 0xaa)) >>> 0);
  const orders: Order[] = [];
  const ax = (hex: number) => map.axialOfIndex(hex);
  const off = (hex: number): Offset => axialToOffset(ax(hex));
  const located = obs.tracks.filter((t) => t.quality >= TrackQuality.Detected);

  // Recon drones: watch the freshest located contact within control range.
  for (const e of obs.elements) {
    const drone = ELEMENT_SENSORS[e.typeId].map((id) => SENSORS[id]).find((s) => s.mode === "drone");
    if (!drone) continue;
    const target = [...located]
      .filter((t) => hexDistance(ax(e.hex), ax(t.hex)) <= (drone.controlRangeHex ?? 0))
      .sort((a, b) => b.lastSeenTick - a.lastSeenTick || (a.id < b.id ? -1 : 1))[0];
    if (target && target.hex !== e.patrol) orders.push({ kind: "patrol", elementId: e.id, at: off(target.hex) });
  }

  // Probes: idle infantry move towards the enemy.
  if (obs.tracks.length > 0) {
    const mean = obs.tracks.reduce((m, t) => {
      const o = off(t.hex);
      return { col: m.col + o.col / obs.tracks.length, row: m.row + o.row / obs.tracks.length };
    }, { col: 0, row: 0 });
    const idle = obs.elements.filter((e) => (e.typeId === "infantrySquad" || e.typeId === "assaultGroup") && !e.move);
    for (let k = 0; k < probes && idle.length > 0; k++) {
      const e = idle.splice(rng.int(idle.length), 1)[0]!;
      const from = off(e.hex);
      const nearest = [...located].sort((a, b) => hexDistance(ax(e.hex), ax(a.hex)) - hexDistance(ax(e.hex), ax(b.hex)))[0];
      let to: Offset;
      if (nearest && hexDistance(ax(e.hex), ax(nearest.hex)) <= maxAdvance * 2) {
        to = off(nearest.hex);
      } else {
        const dc = mean.col - from.col;
        const dr = mean.row - from.row;
        const len = Math.max(1, Math.abs(dc) + Math.abs(dr));
        const step = rng.range(Math.ceil(maxAdvance / 2), maxAdvance);
        to = { col: Math.round(from.col + (dc / len) * step), row: Math.round(from.row + (dr / len) * step) };
      }
      to = { col: Math.max(0, Math.min(map.cols - 1, to.col)), row: Math.max(0, Math.min(map.rows - 1, to.row)) };
      // Small groups infiltrate along cover; squads move tactically.
      const mode = e.personnel <= 6 ? "infiltrate" : "tactical";
      orders.push({ kind: "move", elementId: e.id, to, mode });
    }
  }
  return { side: obs.side, cycle: obs.cycle, orders };
}
