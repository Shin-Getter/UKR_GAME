/**
 * Bot-vs-bot self-play: both sides play the "prober" bot through the
 * controller interface; each game is saved as a replay file.
 *
 *   npx tsx scripts/selfplay.ts            # example set into public/replays/
 *   npx tsx scripts/selfplay.ts pokrovsk-2024 7 10   # scenario, seed, days
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { proberOrders } from "../src/bots/prober";
import { observe, submit } from "../src/engine/controller";
import { toReplay } from "../src/engine/replay";
import { resolveCycle } from "../src/engine/sim";
import { SIDES } from "../src/engine/state";
import { lossSummary } from "../src/engine/strikes";
import { SCENARIO_LIST } from "../src/scenarios";

export interface ReplayIndexEntry {
  file: string;
  title: string;
  scenarioId: string;
  seed: number;
  days: number;
  summary: string;
}

function play(scenarioId: string, seed: number, days: number) {
  const info = SCENARIO_LIST.find((s) => s.id === scenarioId);
  if (!info) throw new Error(`unknown scenario ${scenarioId}`);
  const state = info.build(seed);
  let rejected = 0;
  for (let d = 0; d < days; d++) {
    for (const side of SIDES) rejected += submit(state, proberOrders(observe(state, side), state.map, seed)).rejected.length;
    resolveCycle(state);
  }
  if (rejected > 0) console.warn(`  ${rejected} bot orders rejected`);
  const l = (side: "ua" | "ru") => {
    const x = lossSummary(state, side);
    return `${x.killed + x.wounded} casualties, ${x.elementsDestroyed} elements lost`;
  };
  return { replay: toReplay(state), summary: `Ukraine ${l("ua")}; Russia ${l("ru")}`, name: info.name };
}

const outDir = "public/replays";
mkdirSync(outDir, { recursive: true });
const [argScenario, argSeed, argDays] = process.argv.slice(2);
const games: [string, number, number][] = argScenario
  ? [[argScenario, Number(argSeed ?? 1), Number(argDays ?? 7)]]
  : [
      ["pokrovsk-2024", 4, 14],
      ["pokrovsk-2024", 1, 7],
      ["pokrovsk-2024", 2, 7],
      ["test-sector", 3, 7],
    ];
const index: ReplayIndexEntry[] = [];
for (const [scenarioId, seed, days] of games) {
  const { replay, summary, name } = play(scenarioId, seed, days);
  const file = `${scenarioId}-seed${seed}-${days}d.json`;
  writeFileSync(`${outDir}/${file}`, JSON.stringify(replay));
  index.push({ file, title: `${name}: bot vs bot, seed ${seed}, ${days} days`, scenarioId, seed, days, summary });
  console.log(`${file}: ${summary}`);
}
if (!argScenario) writeFileSync(`${outDir}/index.json`, JSON.stringify(index, null, 1));
