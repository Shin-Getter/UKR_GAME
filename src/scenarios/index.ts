import type { GameState } from "../engine/state";
import { buildTestSector, TEST_SECTOR_ID } from "./testSector";

/** Scenario builders by id. Replays name a scenario and seed. */
export const SCENARIOS: Record<string, (seed: number) => GameState> = {
  [TEST_SECTOR_ID]: buildTestSector,
};
