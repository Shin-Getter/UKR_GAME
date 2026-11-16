# Status

Handoff file between work sessions. Update it at the end of every slice.

## Done

- **Slice 1: scaffold and map.** Vite + TypeScript + Vitest project, CI with GitHub Pages deploy from `main`. Engine: seeded RNG (sfc32), state hasher, pointy-top hex geometry (250 m), typed-array `HexMap`, procedural test sector generator (fields + windbreak treelines, river, forest, villages, town, roads; 96 × 185 hexes ≈ 24 × 40 km). UI: canvas renderer with pan/zoom, elevation shading, roads, grid, hover inspector, seed control.

- **Slice 1b: map readability.** Roads drawn by luminance contrast (dark-cased paved roads, dark-brown tracks) so they read on pale fields and under warm screen tints; double-ring hover outline. Road connectivity stored per hex edge (`HexMap.roadEdges`), so parallel tracks no longer draw false cross-links.

- **Slice 2: entities, tick loop, orders, replays.** Element types (`src/data/elements.ts`), unit hierarchy, `GameState`; 15-minute tick loop with a system pipeline (`src/engine/sim.ts`, only movement so far) and a 24 h orders cycle; move/hold orders with validation and reasons; basic straight-line movement with terrain, road and bridge costs (placeholder for slice 6 movement modes); controller interface (`observe` returns own side only, `submit` validates); replay files (scenario + seed + orders, self-verifying hash); test scenario with a battalion-plus per side either side of the river. UI: unit markers, click to select, right-click (or Move mode) to queue moves, Run 1 day, event log, download/load replay. `window.killzone` exposes state for console experiments.

- **Slice 3: real terrain, Pokrovsk 2024.** `scripts/import-sector.ts` builds a map file from AWS Terrain Tiles elevation + OpenStreetMap (woods, tree rows, water, wetlands, land use, roads, building counts, place names; Ukrainian names romanised with the 2010 national system when no English name exists). Map files (`src/data/maps/*.json`) are base64 typed arrays + metadata (`src/engine/mapio.ts`). Pokrovsk approaches sector: 42 x 24 km, 168 x 111 hexes, Pokrovsk/Myrnohrad to Ocheretyne. Scenario with an **illustrative, unsourced** north-south line of contact (Russia east, Ukraine west) and the shared generic force builder (`src/scenarios/forces.ts`). UI: scenario picker (Pokrovsk is the default), place labels with collision avoidance, front line, ODbL attribution.

- **Slice 4: sensing and fog of war.** Deterministic `dexp` (`src/engine/dmath.ts`). Signatures per element type and channel (visual, thermal, RF, acoustic) modified by movement, phase of day and terrain concealment (`src/data/sensing.ts`). Sensors: observation (needs line of sight; terrain obstacle heights added), recon drones (patrol area up to 8 km from the crew, grounded while the crew moves), RF direction finding (Suspected only). Per-tick detection rolls; per-side tracks with a quality ladder (Suspected → Detected → Identified → Targetable), decay, and a Targetable fix lost when the target moves. `observe()` returns side-local track reports without the real element id. Patrol orders for drone crews. Coverage heatmap (chance to locate a reference target per hour). UI: viewpoint (Ukraine / Russia with fog of war, or god view), coverage overlay, contact markers by quality, patrol rings, contact events, hover shows contacts and coverage.

- **Slice 5: strikes and ammunition.** Weapons (`src/data/strikes.ts`): FPV, bomber drone, 120 mm mortar, 152/155 mm gun, with range, minimum track quality, latency, cooldown, missions per day, stock, reach, hit chance by track quality, casualties and vehicle-kill chance by protection. Allocation from each side's tracks by default target priority, with overkill and re-shelling limits and no area fire on friendly-occupied hexes (`src/engine/strikes.ts`). Resolution: reach → hit (reduced by terrain cover; precision strikes miss targets that have moved) → effect (killed/wounded, vehicles disabled); elements with no personnel left are removed to `state.destroyed`. Firing raises the shooter's signature for two ticks. Battalion drone company now 2 recon, 3 FPV, 1 bomber crew. Field-crossing calibration micro-test (`tests/fieldCrossing.ts`, probe: `npx tsx scripts/probe-crossing.ts`). UI: losses, ammunition, strength bars, struck/destroyed markers, strike events.

- **Slice 5b: replay viewer and self-play.** `beginCycle`/`runTick`/`endCycle` split; `ReplayPlayer` (`src/engine/replayPlayer.ts`) steps or seeks tick by tick by re-simulating. "Prober" bot (`src/bots/prober.ts`) plays through `observe`/`submit` only. `scripts/selfplay.ts` writes bot-vs-bot replays to `public/replays/` (shipped as examples, listed from `index.json`). UI: replay transport (play/pause, speed, slider, ±15 min, ±1 day), example picker, load replay file, Continue playing from the end.

- **Slice 5c: close combat, interaction lines, stacks.** Entering an enemy-held hex is an assault (the mover stops). `closeCombatSystem` (`src/engine/closeCombat.ts`, data in `src/data/combat.ts`): each tick, hexes with both sides fight; casualties scale with combat power (people and vehicles weighted by type) and are reduced by cover (first occupant defends with full cover, attacker gets 30%); a side below half the enemy's power pulls back to a neighbouring enemy-free hex; close contact reveals both sides as Targetable. Events carry `fromHex`. UI: strike lines (area fire with dispersion circle), spotting lines, impact bursts, close-combat rings and pull-back arrows, fading over the last hour in replays and shown faintly for the whole day in live play (toggle in View); stacked units fan out in a grid when zoomed in, show a count badge when zoomed out, cycle on repeated clicks and are listed in the selected-unit panel.

## Next

- **Slice 6: movement modes, posture and control.** Movement modes (column, dash, tactical, infiltration, static/concealed) trading speed for signature; postures (dug in, concealed); pathfinding; per-hex control gradient (held / contested / infiltrated / fire-dominated); consolidation; suppression and cohesion (close combat breaks on power ratio only for now).

## Planned slices

| Slice | Ends with |
| --- | --- |
| 7 | Orders UI and policy editor; hot-seat WEGO play |
| 8 | After-action causal chains; first two-player playtest |

## Known issues / notes

- Terrain parameters in `src/data/terrain.ts` are placeholders (confidence: guess).
- Treelines are hex terrain for now; the design doc wants them as hex-edge features eventually.
- The prober bot is deliberately naive (sends a couple of infantry elements forward each day). It exists to exercise the interface and make example replays, not to play well.
- Hot-seat turn handover (hiding one side's screen while the other plans) arrives in slice 7; for now the viewpoint selector is honour-system.
- No resupply yet: shooters run dry after 3–4 days (logistics comes later). No battle damage assessment: a shooter does not learn what its strike did.
- First crossing probe (placeholder numbers, 6 h window): squad in the open by day ~6 casualties of 9, along a treeline ~3, open at night ~3.7, assault group along a treeline at night ~0.7; mech section in the open by day loses ~1.8 of 2 vehicles.
- Sensing has no weather yet, no strike-drone incidental detection, no counter-battery radar, and no posture (dug in / concealed) modifiers; those arrive with strikes (slice 5) and movement modes (slice 6).
- Overpass API is unreachable from Claude cloud sessions (connection reset). OSM data is exported manually from overpass-turbo.eu into `data/osm/` (see its README); the import script reads those files and caches elevation tiles in `.cache/`.
- OSM building coverage around Pokrovsk is partial (~10k buildings), so built-up hexes also come from residential/industrial land use.
- Rivers make whole hexes water (impassable except at road bridges), even small ones; they should become hex-edge obstacles with a crossing cost. Spoil heaps are not a terrain type yet.
- Movement uses straight hex lines, no pathfinding; elements stop at water unless a road bridge is on the line.
- Events are stamped with the end of the tick they happened in.
- `hexCorners` in `src/engine/hex.ts` uses `Math.cos`; it's for rendering only and must not feed simulation state.

## Design doc

The full design lives in Claude Docs ("Kill Zone — Design Document").
