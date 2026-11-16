import { describe, expect, it } from "vitest";
import { Terrain } from "../src/data/terrain";
import { crossingStats, runCrossing } from "./fieldCrossing";

/**
 * Calibration micro-test: cross 3 km under a recon drone with FPV, bomber
 * and mortar support behind it, then hold the far side (6 hours in all).
 * Asserts orderings that should survive any tuning, not exact numbers.
 */
describe("field crossing under drones", () => {
  const runs = 150;
  const squadOpenDay = crossingStats({ typeId: "infantrySquad", hour: 11, routeTerrain: Terrain.Open, distanceHex: 12 }, runs);
  const squadTreeDay = crossingStats({ typeId: "infantrySquad", hour: 11, routeTerrain: Terrain.Treeline, distanceHex: 12 }, runs);
  const squadOpenNight = crossingStats({ typeId: "infantrySquad", hour: 1, routeTerrain: Terrain.Open, distanceHex: 12 }, runs);
  const groupTreeNight = crossingStats({ typeId: "assaultGroup", hour: 1, routeTerrain: Terrain.Treeline, distanceHex: 12 }, runs);
  const mechOpenDay = crossingStats({ typeId: "mechSection", hour: 11, routeTerrain: Terrain.Open, distanceHex: 12 }, runs);

  it("punishes a squad in open ground by day", () => {
    expect(squadOpenDay.pHit).toBeGreaterThan(0.7);
    expect(squadOpenDay.meanCasualties).toBeGreaterThan(3);
  });

  it("makes treelines and darkness safer", () => {
    expect(squadTreeDay.meanCasualties).toBeLessThan(squadOpenDay.meanCasualties);
    expect(squadOpenNight.meanCasualties).toBeLessThan(squadOpenDay.meanCasualties);
  });

  it("makes a small group infiltrating along a treeline at night the safest option", () => {
    expect(groupTreeNight.meanCasualties).toBeLessThan(squadTreeDay.meanCasualties);
    expect(groupTreeNight.meanCasualties).toBeLessThan(squadOpenNight.meanCasualties);
    expect(groupTreeNight.pHit).toBeLessThan(0.5);
  });

  it("costs a mechanised section most of its vehicles in the open by day", () => {
    expect(mechOpenDay.meanVehiclesLost).toBeGreaterThan(1);
  });

  it("is deterministic per seed", () => {
    const setup = { typeId: "infantrySquad" as const, hour: 11, routeTerrain: Terrain.Open, distanceHex: 12, seed: 7 };
    expect(runCrossing(setup)).toEqual(runCrossing(setup));
  });
});
