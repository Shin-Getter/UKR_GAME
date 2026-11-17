/**
 * Element types: the smallest simulated entities (squad to platoon, vehicle
 * sections, drone crews, guns). Compositions are generic placeholders.
 */
import { guess, type Param } from "./param";

export enum Mobility {
  Foot = "foot",
  Wheeled = "wheeled",
  Tracked = "tracked",
}

export enum Category {
  Infantry = "infantry",
  Mechanised = "mechanised",
  Armour = "armour",
  Drone = "drone",
  Fires = "fires",
  EW = "ew",
  Engineer = "engineer",
  Logistics = "logistics",
  Medical = "medical",
  HQ = "hq",
}

export interface ElementType {
  id: string;
  name: string;
  /** Short label for map markers. */
  abbr: string;
  category: Category;
  mobility: Mobility;
  personnel: number;
  vehicles: { kind: string; count: number }[];
  /** Cross-country speed on open, dry ground. */
  speed: Param;
  /** How well the element's vehicles resist strikes ("none" = people only or soft vehicles). */
  protection: Protection;
  /** Remotely operated: hits destroy vehicles (robots), not the crew, who work from the rear. */
  uncrewed?: boolean;
}

export type Protection = "none" | "light" | "armoured";

const t = (e: ElementType): ElementType => e;

export const ELEMENT_TYPES = {
  infantrySquad: t({
    id: "infantrySquad", name: "Infantry squad", abbr: "INF", category: Category.Infantry,
    mobility: Mobility.Foot, personnel: 9, vehicles: [], speed: guess(3, "km/h"), protection: "none",
  }),
  assaultGroup: t({
    id: "assaultGroup", name: "Assault group", abbr: "AG", category: Category.Infantry,
    mobility: Mobility.Foot, personnel: 5, vehicles: [], speed: guess(3, "km/h"), protection: "none",
  }),
  mechSection: t({
    id: "mechSection", name: "Mechanised section", abbr: "MECH", category: Category.Mechanised,
    mobility: Mobility.Tracked, personnel: 12, vehicles: [{ kind: "IFV", count: 2 }], speed: guess(20, "km/h"), protection: "light",
  }),
  tankSection: t({
    id: "tankSection", name: "Tank section", abbr: "TK", category: Category.Armour,
    mobility: Mobility.Tracked, personnel: 6, vehicles: [{ kind: "MBT", count: 2 }], speed: guess(20, "km/h"), protection: "armoured",
  }),
  reconDroneCrew: t({
    id: "reconDroneCrew", name: "Recon drone crew", abbr: "UAV", category: Category.Drone,
    mobility: Mobility.Wheeled, personnel: 3, vehicles: [{ kind: "light vehicle", count: 1 }], speed: guess(30, "km/h"), protection: "none",
  }),
  strikeDroneCrew: t({
    id: "strikeDroneCrew", name: "FPV drone crew", abbr: "FPV", category: Category.Drone,
    mobility: Mobility.Wheeled, personnel: 3, vehicles: [{ kind: "light vehicle", count: 1 }], speed: guess(30, "km/h"), protection: "none",
  }),
  bomberDroneCrew: t({
    id: "bomberDroneCrew", name: "Bomber drone crew", abbr: "BMB", category: Category.Drone,
    mobility: Mobility.Wheeled, personnel: 4, vehicles: [{ kind: "light vehicle", count: 1 }], speed: guess(30, "km/h"), protection: "none",
  }),
  mortarSection: t({
    id: "mortarSection", name: "Mortar section", abbr: "MOR", category: Category.Fires,
    mobility: Mobility.Wheeled, personnel: 8, vehicles: [{ kind: "120 mm mortar", count: 2 }], speed: guess(25, "km/h"), protection: "none",
  }),
  gunSection: t({
    id: "gunSection", name: "Gun section", abbr: "ART", category: Category.Fires,
    mobility: Mobility.Wheeled, personnel: 10, vehicles: [{ kind: "towed howitzer", count: 2 }], speed: guess(25, "km/h"), protection: "none",
  }),
  ewTeam: t({
    id: "ewTeam", name: "EW team", abbr: "EW", category: Category.EW,
    mobility: Mobility.Wheeled, personnel: 4, vehicles: [{ kind: "EW vehicle", count: 1 }], speed: guess(30, "km/h"), protection: "none",
  }),
  engineerSection: t({
    id: "engineerSection", name: "Engineer section", abbr: "ENG", category: Category.Engineer,
    mobility: Mobility.Wheeled, personnel: 10, vehicles: [{ kind: "excavator", count: 1 }], speed: guess(20, "km/h"), protection: "none",
  }),
  logisticsSection: t({
    id: "logisticsSection", name: "Logistics section", abbr: "LOG", category: Category.Logistics,
    mobility: Mobility.Wheeled, personnel: 6, vehicles: [{ kind: "truck", count: 3 }], speed: guess(35, "km/h"), protection: "none",
  }),
  ugvTeam: t({
    id: "ugvTeam", name: "Ground robot team", abbr: "UGV", category: Category.Logistics,
    mobility: Mobility.Wheeled, personnel: 2, vehicles: [{ kind: "ground robot", count: 2 }], speed: guess(6, "km/h"), protection: "none", uncrewed: true,
  }),
  hq: t({
    id: "hq", name: "Command post", abbr: "HQ", category: Category.HQ,
    mobility: Mobility.Wheeled, personnel: 8, vehicles: [{ kind: "command vehicle", count: 1 }], speed: guess(30, "km/h"), protection: "none",
  }),
} satisfies Record<string, ElementType>;

export type ElementTypeId = keyof typeof ELEMENT_TYPES;
