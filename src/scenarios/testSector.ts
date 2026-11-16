/**
 * Test scenario on the procedural sector: one battalion-sized force per side
 * either side of the river, with brigade fires and a mechanised reserve.
 * Russia holds the north bank, Ukraine the south. Compositions and
 * placement are generic placeholders, not real orders of battle.
 */
import { ELEMENT_TYPES, type ElementTypeId } from "../data/elements";
import { Terrain } from "../data/terrain";
import { generateSector } from "../engine/mapgen";
import { Rng } from "../engine/rng";
import type { Echelon, Element, GameState, SideId, Unit } from "../engine/state";
import { SIDE_NAMES } from "../engine/state";

const COVER = new Set([Terrain.Treeline, Terrain.Village, Terrain.Forest, Terrain.Urban]);

export const TEST_SECTOR_ID = "test-sector";

export function buildTestSector(seed: number): GameState {
  const map = generateSector(seed);
  const rng = new Rng(seed).fork("scenario");

  // Mean river row per column marks the line of contact.
  const riverRow: number[] = [];
  for (let col = 0; col < map.cols; col++) {
    let sum = 0;
    let n = 0;
    for (let row = 0; row < map.rows; row++) {
      if (map.terrainAt(col, row) === Terrain.Water) {
        sum += row;
        n++;
      }
    }
    riverRow.push(n > 0 ? Math.round(sum / n) : Math.floor(map.rows / 2));
  }

  const units: Unit[] = [];
  const elements: Element[] = [];
  const counters: Record<SideId, number> = { ua: 0, ru: 0 };

  const unit = (side: SideId, id: string, name: string, echelon: Echelon, parentId: string | null) => {
    units.push({ id, name, side, parentId, echelon });
    return id;
  };

  /**
   * Place an element in column range [c0, c1) at a depth (in rows) behind the
   * river, preferring cover. North side for Russia, south for Ukraine.
   */
  const place = (side: SideId, unitId: string, typeId: ElementTypeId, c0: number, c1: number, d0: number, d1: number) => {
    const dir = side === "ru" ? -1 : 1;
    let chosen = -1;
    for (let attempt = 0; attempt < 30; attempt++) {
      const col = rng.range(c0, c1 - 1);
      const row = riverRow[col]! + dir * rng.range(d0, d1);
      if (!map.inBounds(col, row)) continue;
      const i = map.index(col, row);
      if (map.terrain[i] === Terrain.Water) continue;
      chosen = i;
      if (COVER.has(map.terrain[i] as Terrain)) break;
    }
    if (chosen < 0) throw new Error(`could not place ${typeId} for ${side}`);
    counters[side]++;
    elements.push({
      id: `${side}-${String(counters[side]).padStart(3, "0")}`,
      typeId,
      side,
      unitId,
      hex: chosen,
      personnel: personnelOf(typeId),
      move: null,
    });
  };

  const cols = map.cols;
  const frontC0 = Math.floor(cols * 0.15);
  const frontC1 = Math.floor(cols * 0.85);
  const third = Math.floor((frontC1 - frontC0) / 3);

  for (const side of ["ua", "ru"] as SideId[]) {
    const bde = unit(side, `${side}-bde`, `${SIDE_NAMES[side]} brigade`, "brigade", null);
    const bn = unit(side, `${side}-1bn`, "1st Battalion", "battalion", bde);
    for (let c = 0; c < 3; c++) {
      const coy = unit(side, `${side}-1bn-${c + 1}coy`, `${c + 1}${["st", "nd", "rd"][c]} Company`, "company", bn);
      const a = frontC0 + c * third;
      const b = a + third;
      for (let s = 0; s < 3; s++) place(side, coy, "infantrySquad", a, b, 2, 6);
      place(side, coy, "assaultGroup", a, b, 3, 7);
    }
    place(side, bn, "hq", frontC0, frontC1, 20, 32);
    place(side, bn, "reconDroneCrew", frontC0, frontC1, 12, 24);
    place(side, bn, "strikeDroneCrew", frontC0, frontC1, 12, 24);
    place(side, bn, "strikeDroneCrew", frontC0, frontC1, 12, 24);
    place(side, bn, "mortarSection", frontC0, frontC1, 10, 18);
    place(side, bn, "ewTeam", frontC0, frontC1, 8, 16);
    place(side, bn, "engineerSection", frontC0, frontC1, 16, 28);
    place(side, bn, "logisticsSection", frontC0, frontC1, 36, 52);
    const fires = unit(side, `${side}-bde-art`, "Artillery group", "battalion", bde);
    place(side, fires, "gunSection", frontC0, frontC1, 44, 64);
    place(side, fires, "gunSection", frontC0, frontC1, 44, 64);
    const res = unit(side, `${side}-bde-mech`, "Mechanised company (reserve)", "company", bde);
    for (let s = 0; s < 3; s++) place(side, res, "mechSection", frontC0, frontC1, 36, 52);
    place(side, res, "tankSection", frontC0, frontC1, 36, 52);
  }

  return {
    scenarioId: TEST_SECTOR_ID,
    seed,
    map,
    startHour: 6,
    tick: 0,
    cycle: 0,
    units,
    elements,
    pending: { ua: null, ru: null },
    history: [],
    lastEvents: [],
  };
}

function personnelOf(typeId: ElementTypeId): number {
  return ELEMENT_TYPES[typeId].personnel;
}
