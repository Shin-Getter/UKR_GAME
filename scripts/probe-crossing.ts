/**
 * Calibration probe: the field-crossing micro-scenario over 400 seeds per case.
 *   npx tsx scripts/probe-crossing.ts
 */
import { Terrain } from "../src/data/terrain";
import { crossingStats } from "../tests/fieldCrossing";
const cases: [string, Parameters<typeof crossingStats>[0]][] = [
  ["squad, open, day, 3 km", { typeId: "infantrySquad", hour: 11, routeTerrain: Terrain.Open, distanceHex: 12 }],
  ["squad, treeline, day, 3 km", { typeId: "infantrySquad", hour: 11, routeTerrain: Terrain.Treeline, distanceHex: 12 }],
  ["squad, open, night, 3 km", { typeId: "infantrySquad", hour: 1, routeTerrain: Terrain.Open, distanceHex: 12 }],
  ["assault group, treeline, night", { typeId: "assaultGroup", hour: 1, routeTerrain: Terrain.Treeline, distanceHex: 12 }],
  ["assault group, treeline, night, infiltr.", { typeId: "assaultGroup", hour: 1, routeTerrain: Terrain.Treeline, distanceHex: 12, mode: "infiltrate" }],
  ["assault group, treeline, day, infiltr.", { typeId: "assaultGroup", hour: 11, routeTerrain: Terrain.Treeline, distanceHex: 12, mode: "infiltrate" }],
  ["mech section, open, day, dash", { typeId: "mechSection", hour: 11, routeTerrain: Terrain.Open, distanceHex: 12, mode: "dash" }],
  ["mech section, open, day, 3 km", { typeId: "mechSection", hour: 11, routeTerrain: Terrain.Open, distanceHex: 12 }],
  ["tank section, open, day, 3 km", { typeId: "tankSection", hour: 11, routeTerrain: Terrain.Open, distanceHex: 12 }],
];
for (const [name, c] of cases) {
  const r = crossingStats(c, 400);
  console.log(name.padEnd(42), `moving ${r.meanCasualtiesMoving.toFixed(2)}  6h total ${r.meanCasualties.toFixed(2)}  vehicles ${r.meanVehiclesLost.toFixed(2)}  P(hit) ${(r.pHit * 100).toFixed(0)}%  P(destroyed) ${(r.pDestroyed * 100).toFixed(0)}%`);
}
