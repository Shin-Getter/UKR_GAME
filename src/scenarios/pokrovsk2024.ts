/**
 * Pokrovsk approaches, 2024. Real terrain (OpenStreetMap + elevation) for the
 * 42 x 24 km area from Pokrovsk and Myrnohrad east to Ocheretyne.
 *
 * The line of contact is ILLUSTRATIVE: an approximate north-south line east
 * of Selydove and Myrnohrad, roughly as publicly reported in early autumn
 * 2024. It is not sourced and not a record of real positions. Forces and
 * defences are generic placeholders (see design doc: past periods only,
 * invented defences, open-source OOB only where available).
 */
import mapFile from "../data/maps/pokrovsk-2024.json";
import { decodeMap, type MapFile, type MapMeta } from "../engine/mapio";
import { Rng } from "../engine/rng";
import type { GameState } from "../engine/state";
import { buildForces } from "./forces";

export const POKROVSK_2024_ID = "pokrovsk-2024";

export const POKROVSK_FRONT_NOTE =
  "Line of contact is illustrative (approximate, early autumn 2024), not sourced. Forces are generic placeholders.";

/** Column of the illustrative line of contact at a few rows; interpolated between. */
const FRONT_KNOTS: [row: number, col: number][] = [
  [0, 104],
  [30, 98],
  [55, 89],
  [80, 90],
  [110, 92],
];

function frontColumn(row: number): number {
  for (let k = 0; k + 1 < FRONT_KNOTS.length; k++) {
    const [r0, c0] = FRONT_KNOTS[k]!;
    const [r1, c1] = FRONT_KNOTS[k + 1]!;
    if (row >= r0 && row <= r1) return Math.round(c0 + ((c1 - c0) * (row - r0)) / (r1 - r0));
  }
  return FRONT_KNOTS.at(-1)![1];
}

let cached: { meta: MapMeta } | null = null;

export function pokrovskMeta(): MapMeta {
  if (!cached) cached = { meta: decodeMap(mapFile as MapFile).meta };
  return cached.meta;
}

export function buildPokrovsk2024(seed: number): GameState {
  const { map } = decodeMap(mapFile as MapFile);
  const rng = new Rng(seed).fork("scenario");
  const line = Array.from({ length: map.rows }, (_, row) => frontColumn(row));
  const { units, elements } = buildForces(
    map,
    // Russia attacks from the east (rear towards higher columns), Ukraine defends from the west.
    { orientation: "ns", line, rear: { ru: 1, ua: -1 }, laneFrom: 0.1, laneTo: 0.9 },
    rng,
  );
  return {
    scenarioId: POKROVSK_2024_ID,
    seed,
    map,
    startHour: 6,
    tick: 0,
    cycle: 0,
    units,
    elements,
    pending: { ua: null, ru: null },
    history: [],
    lastEvents: [],
  };
}

/** The illustrative front as hex indices, for drawing. */
export function pokrovskFrontHexes(state: GameState): number[] {
  return Array.from({ length: state.map.rows }, (_, row) => state.map.index(frontColumn(row), row));
}
