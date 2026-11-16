# Kill Zone — instructions for Claude sessions

Read `STATUS.md` first: it says what is done and which slice is next.

## Workflow

- Work in small **slices**, each on its own branch (`slice-N-short-name`).
- A slice is done only when `npm run typecheck`, `npm test` and `npm run build` all pass and the app still runs.
- Merge finished slices to `main` (fast-forward) and push; `main` deploys to GitHub Pages and must always work.
- Push work-in-progress branches often so a session that hits a usage limit loses little.
- Update `STATUS.md` at the end of every slice.

## Engine rules

- `src/engine/` must stay headless: no DOM, no `window`, no `Math.random()`, no `Date.now()`.
- Randomness only through `Rng` (fork named sub-streams per subsystem).
- Avoid `Math.sin/cos/exp/log/pow` etc. in anything that affects simulation state: they can differ between browser engines and break lockstep play. Use project-provided deterministic versions (add them in `src/engine/` when first needed). Basic arithmetic and `Math.sqrt`/`Math.floor`/`Math.round` are fine.
- State that must stay in sync lives in typed arrays or plain records that `StateHasher` can hash.
- New simulation systems are added to `SYSTEMS` in `src/engine/sim.ts`, in the tick order the design doc gives (movement → emissions → sensing → tracks → strike allocation → strike resolution → close combat → engineering/logistics → morale).
- Per-tick randomness: `ctx.rng("purpose")` inside a system. Never keep RNG objects in state.
- Players only interact through `observe`/`submit` in `src/engine/controller.ts`; the UI's god view is a debug convenience.
- Parameters go in `src/data/` with `value`, `unit`, `confidence` (and `source` when known).

## Testing

- Every mechanic gets a Vitest test in `tests/`.
- Gate on exit codes: run `npm run typecheck && npm test && npm run build` without piping test output through filters (a pipe hides failures).
- Example replays in `public/replays/` must reproduce with the current engine (a test checks). After any change that alters simulation results, regenerate them: `npx tsx scripts/selfplay.ts`.
- Snapshot tests are golden determinism tripwires: update them (`npx vitest run -u`) only for intentional changes, and say so in the commit.
