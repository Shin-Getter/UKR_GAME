# Status

Handoff file between work sessions. Update it at the end of every slice.

## Done

- **Slice 1: scaffold and map.** Vite + TypeScript + Vitest project, CI with GitHub Pages deploy from `main`. Engine: seeded RNG (sfc32), state hasher, pointy-top hex geometry (250 m), typed-array `HexMap`, procedural test sector generator (fields + windbreak treelines, river, forest, villages, town, roads; 96 × 185 hexes ≈ 24 × 40 km). UI: canvas renderer with pan/zoom, elevation shading, roads, grid, hover inspector, seed control.

- **Slice 1b: map readability.** Roads drawn by luminance contrast (dark-cased paved roads, dark-brown tracks) so they read on pale fields and under warm screen tints; double-ring hover outline. Road connectivity stored per hex edge (`HexMap.roadEdges`), so parallel tracks no longer draw false cross-links.

- **Slice 2: entities, tick loop, orders, replays.** Element types (`src/data/elements.ts`), unit hierarchy, `GameState`; 15-minute tick loop with a system pipeline (`src/engine/sim.ts`, only movement so far) and a 24 h orders cycle; move/hold orders with validation and reasons; basic straight-line movement with terrain, road and bridge costs (placeholder for slice 6 movement modes); controller interface (`observe` returns own side only, `submit` validates); replay files (scenario + seed + orders, self-verifying hash); test scenario with a battalion-plus per side either side of the river. UI: unit markers, click to select, right-click (or Move mode) to queue moves, Run 1 day, event log, download/load replay. `window.killzone` exposes state for console experiments.

- **Slice 3: real terrain, Pokrovsk 2024.** `scripts/import-sector.ts` builds a map file from AWS Terrain Tiles elevation + OpenStreetMap (woods, tree rows, water, wetlands, land use, roads, building counts, place names; Ukrainian names romanised with the 2010 national system when no English name exists). Map files (`src/data/maps/*.json`) are base64 typed arrays + metadata (`src/engine/mapio.ts`). Pokrovsk approaches sector: 42 x 24 km, 168 x 111 hexes, Pokrovsk/Myrnohrad to Ocheretyne. Scenario with an **illustrative, unsourced** north-south line of contact (Russia east, Ukraine west) and the shared generic force builder (`src/scenarios/forces.ts`). UI: scenario picker (Pokrovsk is the default), place labels with collision avoidance, front line, ODbL attribution.

## Next

- **Slice 4: sensing.** Signatures per element (visual, thermal, RF, acoustic), sensors (recon drones, observation posts), per-tick detection probability, tracks with quality ladder and decay, coverage heatmap in the UI, and fog of war in `observe()`. Needs deterministic `exp` (CLAUDE.md engine rules).

## Planned slices

| Slice | Ends with |
| --- | --- |
| 5 | Strikes and ammunition; "squad crosses a field under drones" micro-test |
| 6 | Movement modes, control gradient, assault and consolidation |
| 7 | Orders UI and policy editor; hot-seat WEGO play |
| 8 | After-action causal chains; first two-player playtest |

## Known issues / notes

- Terrain parameters in `src/data/terrain.ts` are placeholders (confidence: guess).
- Treelines are hex terrain for now; the design doc wants them as hex-edge features eventually.
- The UI shows both sides (debug view). Fog of war in the UI arrives with sensing (slice 4) and hot-seat turns (slice 7).
- Overpass API is unreachable from Claude cloud sessions (connection reset). OSM data is exported manually from overpass-turbo.eu into `data/osm/` (see its README); the import script reads those files and caches elevation tiles in `.cache/`.
- OSM building coverage around Pokrovsk is partial (~10k buildings), so built-up hexes also come from residential/industrial land use.
- Rivers make whole hexes water (impassable except at road bridges), even small ones; they should become hex-edge obstacles with a crossing cost. Spoil heaps are not a terrain type yet.
- Movement uses straight hex lines, no pathfinding; elements stop at water unless a road bridge is on the line.
- Events are stamped with the end of the tick they happened in.
- `hexCorners` in `src/engine/hex.ts` uses `Math.cos`; it's for rendering only and must not feed simulation state.

## Design doc

The full design lives in Claude Docs ("Kill Zone — Design Document").
