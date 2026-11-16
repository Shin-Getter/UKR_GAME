/**
 * Shared force builder: a generic battalion-plus per side, placed by depth
 * behind a line of contact. Works for any map orientation: the front is given
 * as one hex index per "lane" (a column for an east-west front, a row for a
 * north-south front), plus which way each side faces.
 *
 * Compositions are generic placeholders, not real orders of battle.
 */
import type { ElementTypeId } from "../data/elements";
import { Terrain } from "../data/terrain";
import { axialToOffset } from "../engine/hex";
import type { HexMap } from "../engine/map";
import type { Rng } from "../engine/rng";
import { type Echelon, type Element, makeElement, SIDE_NAMES, type SideId, type Unit } from "../engine/state";

const COVER = new Set([Terrain.Treeline, Terrain.Village, Terrain.Forest, Terrain.Urban]);

export interface FrontLine {
  /** "ew": the front runs east-west, lanes are columns, depth is rows. "ns": lanes are rows, depth is columns. */
  orientation: "ew" | "ns";
  /** For each lane, the row (ew) or column (ns) of the line of contact. */
  line: number[];
  /** Direction each side's rear lies in: -1 = towards row/col 0, +1 = away from it. */
  rear: Record<SideId, -1 | 1>;
  /** Lanes the battalion occupies, as fractions of the lane count. */
  laneFrom: number;
  laneTo: number;
}

export function buildForces(map: HexMap, front: FrontLine, rng: Rng): { units: Unit[]; elements: Element[] } {
  const units: Unit[] = [];
  const elements: Element[] = [];
  const counters: Record<SideId, number> = { ua: 0, ru: 0 };
  const lanes = front.line.length;

  const unit = (side: SideId, id: string, name: string, echelon: Echelon, parentId: string | null) => {
    units.push({ id, name, side, parentId, echelon });
    return id;
  };

  /** Place an element in lanes [l0, l1) at a depth of d0..d1 hexes behind the line, preferring cover. */
  const place = (side: SideId, unitId: string, typeId: ElementTypeId, l0: number, l1: number, d0: number, d1: number) => {
    let chosen = -1;
    for (let attempt = 0; attempt < 40; attempt++) {
      const lane = rng.range(l0, l1 - 1);
      const depth = front.line[lane]! + front.rear[side] * rng.range(d0, d1);
      const col = front.orientation === "ew" ? lane : depth;
      const row = front.orientation === "ew" ? depth : lane;
      if (!map.inBounds(col, row)) continue;
      const i = map.index(col, row);
      if (map.terrain[i] === Terrain.Water) continue;
      chosen = i;
      if (COVER.has(map.terrain[i] as Terrain)) break;
    }
    if (chosen < 0) throw new Error(`could not place ${typeId} for ${side}`);
    counters[side]++;
    elements.push(makeElement(`${side}-${String(counters[side]).padStart(3, "0")}`, typeId, side, unitId, chosen));
    return elements.at(-1)!;
  };

  /** Recon drones start patrolling 4 hexes beyond the line of contact, in their own lane. */
  const setPatrol = (el: Element) => {
    const o = axialToOffset(map.axialOfIndex(el.hex));
    const lane = front.orientation === "ew" ? o.col : o.row;
    const depth = front.line[lane]! - front.rear[el.side] * 4;
    const col = front.orientation === "ew" ? lane : depth;
    const row = front.orientation === "ew" ? depth : lane;
    if (map.inBounds(col, row)) el.patrol = map.index(col, row);
  };

  const f0 = Math.floor(lanes * front.laneFrom);
  const f1 = Math.floor(lanes * front.laneTo);
  const third = Math.floor((f1 - f0) / 3);

  for (const side of ["ua", "ru"] as SideId[]) {
    const bde = unit(side, `${side}-bde`, `${SIDE_NAMES[side]} brigade`, "brigade", null);
    const bn = unit(side, `${side}-1bn`, "1st Battalion", "battalion", bde);
    for (let c = 0; c < 3; c++) {
      const coy = unit(side, `${side}-1bn-${c + 1}coy`, `${c + 1}${["st", "nd", "rd"][c]} Company`, "company", bn);
      const a = f0 + c * third;
      const b = a + third;
      for (let s = 0; s < 3; s++) place(side, coy, "infantrySquad", a, b, 2, 6);
      place(side, coy, "assaultGroup", a, b, 3, 7);
    }
    place(side, bn, "hq", f0, f1, 20, 32);
    // Drone company: 2 recon, 3 FPV, 1 bomber crew (placeholder composition).
    setPatrol(place(side, bn, "reconDroneCrew", f0, f0 + Math.floor((f1 - f0) / 2), 12, 24));
    setPatrol(place(side, bn, "reconDroneCrew", f0 + Math.floor((f1 - f0) / 2), f1, 12, 24));
    for (let k = 0; k < 3; k++) place(side, bn, "strikeDroneCrew", f0, f1, 12, 24);
    place(side, bn, "bomberDroneCrew", f0, f1, 10, 18);
    place(side, bn, "mortarSection", f0, f1, 10, 18);
    place(side, bn, "ewTeam", f0, f1, 8, 16);
    place(side, bn, "engineerSection", f0, f1, 16, 28);
    place(side, bn, "logisticsSection", f0, f1, 36, 52);
    const fires = unit(side, `${side}-bde-art`, "Artillery group", "battalion", bde);
    place(side, fires, "gunSection", f0, f1, 44, 64);
    place(side, fires, "gunSection", f0, f1, 44, 64);
    const res = unit(side, `${side}-bde-mech`, "Mechanised company (reserve)", "company", bde);
    for (let s = 0; s < 3; s++) place(side, res, "mechSection", f0, f1, 36, 52);
    place(side, res, "tankSection", f0, f1, 36, 52);
  }
  return { units, elements };
}
