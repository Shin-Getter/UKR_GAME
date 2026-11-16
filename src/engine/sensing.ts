/**
 * Sensing: signatures, detection rolls and the per-side track picture.
 *
 * Per tick, every sensor rolls against every enemy element it can reach:
 *   P(detect) = 1 - exp(-k * sum_c(w_c * S_c) * V * availability)
 * where S is the target's effective signature per channel (type, movement,
 * light, terrain concealment), w the sensor's channel weights and V the range
 * factor. Detections raise track quality; tracks decay without fresh looks.
 */
import { ELEMENT_TYPES } from "../data/elements";
import {
  CHANNELS,
  CONCEALMENT_WEIGHT,
  ELEMENT_SENSORS,
  FIRING_MULTIPLIER,
  FIRING_SIGNATURE_TICKS,
  MOVING_MULTIPLIER,
  PHASE_MULTIPLIER,
  type SensorDef,
  SENSORS,
  type Signature,
  SIGNATURES,
  SUSPECTED_POSITION_ERROR_HEX,
  TRACK_DECAY_TICKS,
  TrackQuality,
} from "../data/sensing";
import { TERRAIN, type Terrain } from "../data/terrain";
import type { DayPhase } from "../data/time";
import { clockAt } from "./clock";
import { dexp, pAtLeastOnce } from "./dmath";
import { axialToOffset, hexDistance, offsetToAxial } from "./hex";
import { hasLineOfSight } from "./los";
import type { HexMap } from "./map";
import type { Rng } from "./rng";
import type { TickContext } from "./sim";
import { type Element, type GameState, SIDES, type SideId, type Track } from "./state";

const enemyOf = (side: SideId): SideId => (side === "ua" ? "ru" : "ua");

/** Effective signature of an element type at a hex. */
export function signatureAt(
  map: HexMap,
  typeId: Element["typeId"],
  hex: number,
  moving: boolean,
  phase: DayPhase,
  firing = false,
): Signature {
  const base = SIGNATURES[typeId];
  const mov = MOVING_MULTIPLIER[ELEMENT_TYPES[typeId].mobility];
  const light = PHASE_MULTIPLIER[phase];
  const conc = TERRAIN[map.terrain[hex] as Terrain].concealment.value;
  const out = { visual: 0, thermal: 0, rf: 0, acoustic: 0 };
  for (const c of CHANNELS) {
    out[c] = base[c] * (moving ? mov[c] : 1) * (firing ? FIRING_MULTIPLIER[c] : 1) * light[c] * (1 - conc * CONCEALMENT_WEIGHT[c]);
  }
  return out;
}

/** Where a sensor looks from: drones from their patrol centre, others from the carrier. */
export function sensorOrigin(el: Element, sensor: SensorDef): number | null {
  if (sensor.requiresStationary && el.move) return null;
  if (sensor.mode === "drone") return el.patrol;
  return el.hex;
}

function rangeFactor(d: number, sensor: SensorDef): number {
  if (d > sensor.rangeHex) return 0;
  if (d <= sensor.nearHex) return 1;
  return (sensor.rangeHex - d) / (sensor.rangeHex - sensor.nearHex);
}

/** Detection rate per tick of one sensor against a signature at a hex (0 if out of reach). */
export function detectionRate(
  map: HexMap,
  observer: Element,
  sensor: SensorDef,
  origin: number,
  sig: Signature,
  targetHex: number,
  phase: DayPhase,
): number {
  const d = hexDistance(map.axialOfIndex(origin), map.axialOfIndex(targetHex));
  const v = rangeFactor(d, sensor);
  if (v === 0) return 0;
  if (sensor.needsLineOfSight && !hasLineOfSight(map, observer.hex, targetHex)) return 0;
  let eff = 0;
  for (const c of CHANNELS) eff += sensor.weights[c] * sig[c];
  return sensor.k.value * eff * v * sensor.availability[phase];
}

/** Track quality a sensor yields for a detection at distance d. */
function qualityFor(sensor: SensorDef, d: number): TrackQuality {
  if (sensor.targetableWithinHex !== undefined && d <= sensor.targetableWithinHex) return TrackQuality.Targetable;
  return sensor.maxQuality;
}

function jitter(map: HexMap, hex: number, rng: Rng): number {
  const o = axialToOffset(map.axialOfIndex(hex));
  const e = SUSPECTED_POSITION_ERROR_HEX;
  const col = Math.max(0, Math.min(map.cols - 1, o.col + rng.range(-e, e)));
  const row = Math.max(0, Math.min(map.rows - 1, o.row + rng.range(-e, e)));
  return map.indexOfAxial(offsetToAxial({ col, row }));
}

function applyDetection(
  state: GameState,
  side: SideId,
  target: Element,
  cap: TrackQuality,
  ctx: TickContext,
  rng: Rng,
): void {
  const tracks = state.tracks[side];
  let track = tracks.find((t) => t.targetId === target.id);
  const tick = ctx.tick + 1;
  if (!track) {
    state.trackCounter[side]++;
    track = {
      id: `${side}-T${state.trackCounter[side]}`,
      targetId: target.id,
      quality: TrackQuality.None,
      hex: target.hex,
      lastSeenTick: tick,
      qualityTick: tick,
      typeId: null,
      shelledTick: -1000,
    };
    tracks.push(track);
    tracks.sort((a, b) => (a.targetId < b.targetId ? -1 : 1));
    ctx.emit({ kind: "newContact", side, elementId: track.id, hex: target.hex });
  }
  track.lastSeenTick = tick;
  // Each detection climbs one level, up to what the sensor can deliver.
  const next = Math.min(cap, track.quality + 1) as TrackQuality;
  if (next >= track.quality) {
    track.quality = next;
    track.qualityTick = tick;
  }
  track.hex = track.quality >= TrackQuality.Detected ? target.hex : jitter(state.map, target.hex, rng);
  if (track.quality >= TrackQuality.Identified) track.typeId = target.typeId;
}

export function sensingSystem(state: GameState, ctx: TickContext): void {
  const phase = clockAt(ctx.tick, state.startHour).phase;
  const rng = ctx.rng("detect");
  const map = state.map;
  for (const side of SIDES) {
    const enemy = enemyOf(side);
    const targets = state.elements.filter((e) => e.side === enemy);
    const sigs = targets.map((t) =>
      signatureAt(map, t.typeId, t.hex, t.move !== null, phase, ctx.tick - t.firedTick < FIRING_SIGNATURE_TICKS),
    );
    for (const obs of state.elements) {
      if (obs.side !== side) continue;
      for (const sid of ELEMENT_SENSORS[obs.typeId]) {
        const sensor: SensorDef = SENSORS[sid];
        const origin = sensorOrigin(obs, sensor);
        if (origin === null) continue;
        for (let t = 0; t < targets.length; t++) {
          const target = targets[t]!;
          const rate = detectionRate(map, obs, sensor, origin, sigs[t]!, target.hex, phase);
          if (rate <= 0) continue;
          if (rng.float() < pAtLeastOnce(rate)) {
            const d = hexDistance(map.axialOfIndex(origin), map.axialOfIndex(target.hex));
            applyDetection(state, side, target, qualityFor(sensor, d), ctx, rng);
          }
        }
      }
    }
  }
}

export function trackDecaySystem(state: GameState, ctx: TickContext): void {
  const tick = ctx.tick + 1;
  for (const side of SIDES) {
    const kept: Track[] = [];
    for (const track of state.tracks[side]) {
      const target = state.elements.find((e) => e.id === track.targetId);
      // A Targetable fix on something that has since moved is no longer targetable.
      if (track.quality === TrackQuality.Targetable && (!target || target.hex !== track.hex)) {
        track.quality = TrackQuality.Identified;
        track.qualityTick = tick;
      }
      while (track.quality > TrackQuality.None && tick - track.qualityTick >= TRACK_DECAY_TICKS[track.quality as 1 | 2 | 3 | 4].value) {
        track.quality--;
        track.qualityTick = tick;
      }
      if (track.quality === TrackQuality.None) {
        ctx.emit({ kind: "lostContact", side, elementId: track.id, hex: track.hex });
        continue;
      }
      kept.push(track);
    }
    state.tracks[side] = kept;
  }
}

export interface CoverageReference {
  typeId: Element["typeId"];
  moving: boolean;
  /** Only count sensors able to produce at least this quality (default: Detected, i.e. located). */
  minQuality?: TrackQuality;
}

/**
 * Probability per hex that a reference enemy element would be detected (by
 * default: located, not just suspected) within one hour by this side's
 * current sensors, at the current phase of day.
 */
export function coverageMap(state: GameState, side: SideId, ref: CoverageReference): Float32Array {
  const map = state.map;
  const phase = clockAt(state.tick, state.startHour).phase;
  const rate = new Float32Array(map.size);
  for (const obs of state.elements) {
    if (obs.side !== side) continue;
    for (const sid of ELEMENT_SENSORS[obs.typeId]) {
      const sensor: SensorDef = SENSORS[sid];
      if (sensor.maxQuality < (ref.minQuality ?? TrackQuality.Detected)) continue;
      const origin = sensorOrigin(obs, sensor);
      if (origin === null) continue;
      const o = axialToOffset(map.axialOfIndex(origin));
      const r = sensor.rangeHex;
      for (let row = Math.max(0, o.row - r); row <= Math.min(map.rows - 1, o.row + r); row++) {
        for (let col = Math.max(0, o.col - r - 1); col <= Math.min(map.cols - 1, o.col + r + 1); col++) {
          const i = map.index(col, row);
          const sig = signatureAt(map, ref.typeId, i, ref.moving, phase);
          rate[i]! += detectionRate(map, obs, sensor, origin, sig, i, phase);
        }
      }
    }
  }
  const ticksPerHour = 4;
  const out = new Float32Array(map.size);
  for (let i = 0; i < map.size; i++) out[i] = rate[i]! > 0 ? 1 - dexp(-rate[i]! * ticksPerHour) : 0;
  return out;
}
