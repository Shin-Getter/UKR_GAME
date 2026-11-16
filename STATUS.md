# Status

Handoff file between work sessions. Update it at the end of every slice.

## Done

- **Slice 1: scaffold and map.** Vite + TypeScript + Vitest project, CI with GitHub Pages deploy from `main`. Engine: seeded RNG (sfc32), state hasher, pointy-top hex geometry (250 m), typed-array `HexMap`, procedural test sector generator (fields + windbreak treelines, river, forest, villages, town, roads; 96 × 185 hexes ≈ 24 × 40 km). UI: canvas renderer with pan/zoom, elevation shading, roads, grid, hover inspector, seed control.

- **Slice 1b: map readability.** Roads drawn by luminance contrast (dark-cased paved roads, dark-brown tracks) so they read on pale fields and under warm screen tints; double-ring hover outline. Road connectivity stored per hex edge (`HexMap.roadEdges`), so parallel tracks no longer draw false cross-links.

- **Slice 2: entities, tick loop, orders, replays.** Element types (`src/data/elements.ts`), unit hierarchy, `GameState`; 15-minute tick loop with a system pipeline (`src/engine/sim.ts`, only movement so far) and a 24 h orders cycle; move/hold orders with validation and reasons; basic straight-line movement with terrain, road and bridge costs (placeholder for slice 6 movement modes); controller interface (`observe` returns own side only, `submit` validates); replay files (scenario + seed + orders, self-verifying hash); test scenario with a battalion-plus per side either side of the river. UI: unit markers, click to select, right-click (or Move mode) to queue moves, Run 1 day, event log, download/load replay. `window.killzone` exposes state for console experiments.

## Next

- **Slice 3: real map import.** Script turning DEM tiles + an OpenStreetMap extract for one real sector into a `HexMap` (terrain, treelines, roads, buildings, rivers). May need the elevation/OSM download hosts allowed in the session network.

## Planned slices

| Slice | Ends with |
| --- | --- |
| 4 | Signatures, sensors, tracks; coverage heatmap in the UI |
| 5 | Strikes and ammunition; "squad crosses a field under drones" micro-test |
| 6 | Movement modes, control gradient, assault and consolidation |
| 7 | Orders UI and policy editor; hot-seat WEGO play |
| 8 | After-action causal chains; first two-player playtest |

## Known issues / notes

- Terrain parameters in `src/data/terrain.ts` are placeholders (confidence: guess).
- Treelines are hex terrain for now; the design doc wants them as hex-edge features eventually.
- The UI shows both sides (debug view). Fog of war in the UI arrives with sensing (slice 4) and hot-seat turns (slice 7).
- Movement uses straight hex lines, no pathfinding; elements stop at water unless a road bridge is on the line.
- Events are stamped with the end of the tick they happened in.
- `hexCorners` in `src/engine/hex.ts` uses `Math.cos`; it's for rendering only and must not feed simulation state.

## Design doc

The full design lives in Claude Docs ("Kill Zone — Design Document").
