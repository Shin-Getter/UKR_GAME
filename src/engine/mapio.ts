/**
 * Map files: a HexMap plus metadata (bounding box, place names, sources),
 * stored as JSON with base64-encoded typed arrays. Produced offline by
 * scripts/import-sector.ts, loaded by scenarios at runtime.
 */
import { HexMap } from "./map";

export interface Place {
  name: string;
  nameUk?: string;
  kind: "city" | "town" | "village" | "hamlet";
  col: number;
  row: number;
  population?: number;
}

export interface MapMeta {
  id: string;
  name: string;
  /** Geographic bounds of the hex grid (degrees, WGS84). */
  bounds: { west: number; north: number; east: number; south: number };
  places: Place[];
  sources: string[];
  generated: string;
}

export interface MapFile extends MapMeta {
  version: 1;
  cols: number;
  rows: number;
  terrain: string;
  /** Int16 little-endian metres. */
  elevation: string;
  road: string;
  roadEdges: string;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function encodeMap(map: HexMap, meta: MapMeta): MapFile {
  const elev = new Uint8Array(map.size * 2);
  const dv = new DataView(elev.buffer);
  for (let i = 0; i < map.size; i++) dv.setInt16(i * 2, map.elevation[i]!, true);
  return {
    version: 1,
    ...meta,
    cols: map.cols,
    rows: map.rows,
    terrain: toBase64(map.terrain),
    elevation: toBase64(elev),
    road: toBase64(map.road),
    roadEdges: toBase64(map.roadEdges),
  };
}

export function decodeMap(file: MapFile): { map: HexMap; meta: MapMeta } {
  if (file.version !== 1) throw new Error(`unsupported map file version ${file.version}`);
  const map = new HexMap(file.cols, file.rows, 0);
  const n = map.size;
  const terrain = fromBase64(file.terrain);
  const road = fromBase64(file.road);
  const edges = fromBase64(file.roadEdges);
  const elev = fromBase64(file.elevation);
  if (terrain.length !== n || road.length !== n || edges.length !== n || elev.length !== n * 2) {
    throw new Error("map file arrays do not match its dimensions");
  }
  map.terrain.set(terrain);
  map.road.set(road);
  map.roadEdges.set(edges);
  const dv = new DataView(elev.buffer);
  for (let i = 0; i < n; i++) map.elevation[i] = dv.getInt16(i * 2, true);
  const { id, name, bounds, places, sources, generated } = file;
  return { map, meta: { id, name, bounds, places, sources, generated } };
}
