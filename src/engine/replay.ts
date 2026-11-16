/**
 * Replay files: scenario id + seed + the orders resolved each cycle. Because
 * the engine is deterministic, that is enough to rebuild any game exactly.
 * The final state hash is stored so a replay can verify itself.
 */
import { resolveCycle } from "./sim";
import { type CycleRecord, type GameState, hashState } from "./state";

export const REPLAY_VERSION = 1;

export interface Replay {
  version: number;
  scenarioId: string;
  seed: number;
  cycles: CycleRecord[];
  finalHash: string;
}

export function toReplay(state: GameState): Replay {
  return {
    version: REPLAY_VERSION,
    scenarioId: state.scenarioId,
    seed: state.seed,
    cycles: structuredClone(state.history),
    finalHash: hashState(state),
  };
}

export type ScenarioRegistry = Record<string, (seed: number) => GameState>;

/** Rebuild a game from a replay. Throws if the result does not match the recorded hash. */
export function runReplay(replay: Replay, scenarios: ScenarioRegistry): GameState {
  if (replay.version !== REPLAY_VERSION) throw new Error(`unsupported replay version ${replay.version}`);
  const build = scenarios[replay.scenarioId];
  if (!build) throw new Error(`unknown scenario ${replay.scenarioId}`);
  const state = build(replay.seed);
  for (const cycle of replay.cycles) {
    state.pending = structuredClone(cycle);
    resolveCycle(state);
  }
  const hash = hashState(state);
  if (hash !== replay.finalHash) throw new Error(`replay desync: expected ${replay.finalHash}, got ${hash}`);
  return state;
}
