/**
 * Step through a replay tick by tick. The engine is deterministic, so the
 * player re-simulates from the replay's seed and orders: forward steps run
 * ticks; seeking backwards rebuilds from the start (about 20 ms per day).
 */
import { TICKS_PER_DAY } from "../data/time";
import type { Replay, ScenarioRegistry } from "./replay";
import { REPLAY_VERSION } from "./replay";
import { beginCycle, endCycle, runTick } from "./sim";
import { type GameState, hashState, type SimEvent } from "./state";

export class ReplayPlayer {
  state!: GameState;
  /** Events of the cycle being played (so far). */
  private events: SimEvent[] = [];
  /** Ticks into the current cycle; TICKS_PER_DAY means the cycle has ended. */
  private inCycle = 0;

  constructor(
    readonly replay: Replay,
    private readonly scenarios: ScenarioRegistry,
  ) {
    if (replay.version !== REPLAY_VERSION) throw new Error(`unsupported replay version ${replay.version}`);
    if (!scenarios[replay.scenarioId]) throw new Error(`unknown scenario ${replay.scenarioId}`);
    this.reset();
  }

  get totalTicks(): number {
    return this.replay.cycles.length * TICKS_PER_DAY;
  }

  get tick(): number {
    return this.state.tick;
  }

  get atEnd(): boolean {
    return this.state.tick >= this.totalTicks;
  }

  private reset(): void {
    this.state = this.scenarios[this.replay.scenarioId]!(this.replay.seed);
    this.events = [];
    this.inCycle = TICKS_PER_DAY; // no cycle open yet
  }

  /** Advance one tick. Returns false at the end of the replay. */
  step(): boolean {
    if (this.atEnd) return false;
    if (this.inCycle === TICKS_PER_DAY) {
      this.state.pending = structuredClone(this.replay.cycles[this.state.cycle]!);
      this.events = beginCycle(this.state);
      this.inCycle = 0;
    }
    runTick(this.state, this.events);
    this.state.lastEvents = this.events;
    this.inCycle++;
    if (this.inCycle === TICKS_PER_DAY) endCycle(this.state, this.events);
    return true;
  }

  /** Jump to a tick (0..totalTicks). */
  seek(tick: number): void {
    const target = Math.max(0, Math.min(this.totalTicks, Math.round(tick)));
    if (target < this.state.tick) this.reset();
    while (this.state.tick < target) this.step();
  }

  /** True if playing to the end reproduces the hash recorded in the replay. */
  verify(): boolean {
    this.seek(this.totalTicks);
    return hashState(this.state) === this.replay.finalHash;
  }
}
