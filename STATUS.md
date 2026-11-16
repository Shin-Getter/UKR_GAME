# Status

Handoff file between work sessions. Update it at the end of every slice.

## Done

- **Slice 1: scaffold and map.** Vite + TypeScript + Vitest project, CI with GitHub Pages deploy from `main`. Engine: seeded RNG (sfc32), state hasher, pointy-top hex geometry (250 m), typed-array `HexMap`, procedural test sector generator (fields + windbreak treelines, river, forest, villages, town, roads; 96 × 185 hexes ≈ 24 × 40 km). UI: canvas renderer with pan/zoom, elevation shading, roads, grid, hover inspector, seed control.

- **Slice 1b: map readability.** Roads drawn by luminance contrast (dark-cased paved roads, dark-brown tracks) so they read on pale fields and under warm screen tints; double-ring hover outline. Road connectivity stored per hex edge (`HexMap.roadEdges`), so parallel tracks no longer draw false cross-links.

## Next

- **Slice 2: entities and tick loop.** Element/unit records, 15-minute tick loop, 24 h orders cycle skeleton, replay file (seed + orders), determinism test across a multi-day run.

## Planned slices

| Slice | Ends with |
| --- | --- |
| 3 | Map import for one real sector (DEM + OpenStreetMap) |
| 4 | Signatures, sensors, tracks; coverage heatmap in the UI |
| 5 | Strikes and ammunition; "squad crosses a field under drones" micro-test |
| 6 | Movement modes, control gradient, assault and consolidation |
| 7 | Orders UI and policy editor; hot-seat WEGO play |
| 8 | After-action causal chains; first two-player playtest |

## Known issues / notes

- Terrain parameters in `src/data/terrain.ts` are placeholders (confidence: guess).
- Treelines are hex terrain for now; the design doc wants them as hex-edge features eventually.
- `hexCorners` in `src/engine/hex.ts` uses `Math.cos`; it's for rendering only and must not feed simulation state.

## Design doc

The full design lives in Claude Docs ("Kill Zone — Design Document").
