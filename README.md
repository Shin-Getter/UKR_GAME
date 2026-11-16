# Kill Zone

A two-player simulation wargame of a single 20–30 km front sector in the Russia–Ukraine war. Players make operational decisions; the engine simulates the tactical fight underneath at 250 m hex / 15-minute resolution: sensing, drone and artillery strikes, electronic warfare, engineering and logistics.

The aim is that players *discover* why the front moves at hundreds of metres per week, rather than being told.

**Play the latest build:** https://shin-getter.github.io/UKR_GAME/

## Status

Early development. See [STATUS.md](STATUS.md) for what works now and what's next.

## Development

Requires Node 22+.

```bash
npm install
npm run dev        # local dev server
npm test           # engine tests
npm run build      # typecheck + production build into dist/
```

## Layout

| Path | Contents |
| --- | --- |
| `src/engine/` | Headless, deterministic simulation engine (no DOM access) |
| `src/data/` | Parameter files: every value has a unit and a confidence rating |
| `src/scenarios/` | Scenario builders (forces, placement) by id |
| `src/ui/` | Browser UI (canvas renderer, panels) |
| `tests/` | Engine tests (Vitest) |

## How to play (current build)

Choose a **viewpoint**: Ukraine or Russia (fog of war: own units plus sensor contacts) or the debug god view. Click one of your unit markers, right-click a hex to queue a move (drone crews: set the patrol area), then **Run 1 day**. The **coverage** overlay shows where your sensors would locate an enemy within an hour. Games can be downloaded as replay files and loaded back; a replay verifies itself against a state hash.

## Maps

Real sectors are built offline from elevation tiles and OpenStreetMap:

```bash
npx tsx scripts/import-sector.ts pokrovsk-2024
```

OSM extracts live in `data/osm/` (see the README there for how to export them). Generated map files go to `src/data/maps/`.

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License (ODbL). Elevation: AWS Terrain Tiles, derived from SRTM and other public sources.

Lines of contact and forces in scenarios are illustrative, not records of real positions.

## Principles

- **Deterministic engine.** Seeded RNG only, no `Math.random()` in engine code, state hashes for desync checks. Same seed and orders → same result in every browser.
- **Everything is a visible number.** Parameters live in `src/data/` with units and confidence; all values are placeholders until calibration, which follows playtesting.
- **Main always works.** Work happens on slice branches; a slice merges only when tests pass and the build runs.
