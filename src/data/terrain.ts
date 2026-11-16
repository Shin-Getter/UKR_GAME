/**
 * Terrain types and their parameters.
 *
 * Every numeric parameter follows the project convention: value, unit and a
 * confidence rating. All values here are placeholders until calibration
 * (which starts after playtesting).
 */

export type Confidence = "high" | "medium" | "guess";

export interface Param {
  value: number;
  unit: string;
  confidence: Confidence;
  source?: string;
  note?: string;
}

export enum Terrain {
  Open = 0,
  Treeline = 1,
  Forest = 2,
  Village = 3,
  Urban = 4,
  Marsh = 5,
  Water = 6,
}

export interface TerrainDef {
  id: Terrain;
  name: string;
  /** Fraction of visual/thermal signature hidden, 0..1. */
  concealment: Param;
  /** Fraction of fragment/blast effect absorbed, 0..1. */
  cover: Param;
  /** Movement cost multiplier for dismounted infantry, relative to open dry ground. */
  footMoveCost: Param;
  /** Movement cost multiplier for tracked vehicles; Infinity = impassable. */
  vehicleMoveCost: Param;
}

const guess = (value: number, unit: string, note?: string): Param => ({
  value,
  unit,
  confidence: "guess",
  ...(note ? { note } : {}),
});

export const TERRAIN: Record<Terrain, TerrainDef> = {
  [Terrain.Open]: {
    id: Terrain.Open,
    name: "Open field",
    concealment: guess(0.05, "fraction"),
    cover: guess(0.0, "fraction"),
    footMoveCost: guess(1.0, "multiplier"),
    vehicleMoveCost: guess(1.0, "multiplier"),
  },
  [Terrain.Treeline]: {
    id: Terrain.Treeline,
    name: "Treeline / windbreak",
    concealment: guess(0.6, "fraction", "Leaf-on; collapses in winter and under shelling"),
    cover: guess(0.15, "fraction"),
    footMoveCost: guess(1.3, "multiplier"),
    vehicleMoveCost: guess(1.8, "multiplier"),
  },
  [Terrain.Forest]: {
    id: Terrain.Forest,
    name: "Forest",
    concealment: guess(0.75, "fraction"),
    cover: guess(0.2, "fraction"),
    footMoveCost: guess(1.6, "multiplier"),
    vehicleMoveCost: guess(3.0, "multiplier"),
  },
  [Terrain.Village]: {
    id: Terrain.Village,
    name: "Village",
    concealment: guess(0.55, "fraction"),
    cover: guess(0.35, "fraction"),
    footMoveCost: guess(1.4, "multiplier"),
    vehicleMoveCost: guess(1.5, "multiplier"),
  },
  [Terrain.Urban]: {
    id: Terrain.Urban,
    name: "Urban block",
    concealment: guess(0.7, "fraction"),
    cover: guess(0.55, "fraction"),
    footMoveCost: guess(2.0, "multiplier"),
    vehicleMoveCost: guess(2.5, "multiplier"),
  },
  [Terrain.Marsh]: {
    id: Terrain.Marsh,
    name: "Marsh",
    concealment: guess(0.3, "fraction"),
    cover: guess(0.05, "fraction"),
    footMoveCost: guess(2.5, "multiplier"),
    vehicleMoveCost: guess(6.0, "multiplier"),
  },
  [Terrain.Water]: {
    id: Terrain.Water,
    name: "River / water",
    concealment: guess(0.0, "fraction"),
    cover: guess(0.0, "fraction"),
    footMoveCost: guess(Infinity, "multiplier", "Needs a crossing"),
    vehicleMoveCost: guess(Infinity, "multiplier", "Needs a bridge or ford"),
  },
};
