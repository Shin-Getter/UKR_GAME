import type { Place } from "../engine/mapio";
import type { GameState } from "../engine/state";
import { buildPokrovsk2024, POKROVSK_2024_ID, POKROVSK_FRONT_NOTE, pokrovskFrontHexes, pokrovskMeta } from "./pokrovsk2024";
import { buildTestSector, TEST_SECTOR_ID } from "./testSector";

export interface ScenarioInfo {
  id: string;
  name: string;
  build: (seed: number) => GameState;
  /** Whether the seed changes the map (procedural) or only force placement. */
  seedChangesMap: boolean;
  places?: () => Place[];
  frontHexes?: (state: GameState) => number[];
  note?: string;
  attribution?: () => string[];
}

export const SCENARIO_LIST: ScenarioInfo[] = [
  {
    id: POKROVSK_2024_ID,
    name: "Pokrovsk approaches, 2024 (real terrain)",
    build: buildPokrovsk2024,
    seedChangesMap: false,
    places: () => pokrovskMeta().places,
    frontHexes: pokrovskFrontHexes,
    note: POKROVSK_FRONT_NOTE,
    attribution: () => pokrovskMeta().sources,
  },
  { id: TEST_SECTOR_ID, name: "Test sector (procedural)", build: buildTestSector, seedChangesMap: true },
];

/** Scenario builders by id. Replays name a scenario and seed. */
export const SCENARIOS: Record<string, (seed: number) => GameState> = Object.fromEntries(
  SCENARIO_LIST.map((s) => [s.id, s.build]),
);
