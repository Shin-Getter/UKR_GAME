import { guess } from "./param";
import { Mobility } from "./elements";

/**
 * Cost multiplier when moving between two hexes joined by a road (lower is
 * faster). Placeholder values; movement modes arrive in slice 6.
 */
export const ROAD_COST = {
  [Mobility.Foot]: guess(0.9, "multiplier"),
  [Mobility.Wheeled]: guess(0.35, "multiplier"),
  [Mobility.Tracked]: guess(0.6, "multiplier"),
};

/** Wheeled vehicles off-road pay this on top of the tracked-vehicle terrain cost. */
export const WHEELED_OFFROAD_PENALTY = guess(1.4, "multiplier");
