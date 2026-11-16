/**
 * Import a real sector into a Kill Zone map file.
 *
 *   npx tsx scripts/import-sector.ts pokrovsk-2024
 *
 * Elevation: AWS Terrain Tiles (Terrarium PNG, zoom 12).
 * Features:  OpenStreetMap via the Overpass API (landuse, woods, tree rows,
 *            water, wetlands, roads, buildings, place names).
 * Raw downloads are cached in .cache/ so re-runs are offline and repeatable.
 *
 * This is an offline tool: it may use floating-point trig freely. Its output
 * (typed arrays) is what the deterministic engine consumes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { Terrain } from "../src/data/terrain";
import { DIRECTIONS, HEX_FLAT_TO_FLAT_M, HEX_ROW_SPACING_M, hexLine, hexToWorld, worldToHex } from "../src/engine/hex";
import { HexMap, RoadClass } from "../src/engine/map";
import { encodeMap, type Place } from "../src/engine/mapio";

interface SectorDef {
  id: string;
  name: string;
  /** North-west corner of the grid. */
  west: number;
  north: number;
  cols: number;
  rows: number;
}

const SECTORS: Record<string, SectorDef> = {
  // Pokrovsk – Myrnohrad – Selydove – Novohrodivka – Ocheretyne: the 2024
  // Russian advance west from Avdiivka towards Pokrovsk. 42 km E-W x 24 km N-S.
  "pokrovsk-2024": { id: "pokrovsk-2024", name: "Pokrovsk approaches", west: 37.05, north: 48.335, cols: 168, rows: 111 },
};

const M_PER_DEG_LAT = 110574;
const CACHE = ".cache";

const id = process.argv[2] ?? "pokrovsk-2024";
const found = SECTORS[id];
if (!found) throw new Error(`unknown sector ${id}; known: ${Object.keys(SECTORS).join(", ")}`);
const def: SectorDef = found;

// --- projection (local equirectangular around the sector centre) ----------
const heightM = def.rows * HEX_ROW_SPACING_M;
const widthM = def.cols * HEX_FLAT_TO_FLAT_M;
const latMid = def.north - heightM / 2 / M_PER_DEG_LAT;
const mPerDegLon = 111320 * Math.cos((latMid * Math.PI) / 180);
const south = def.north - heightM / M_PER_DEG_LAT;
const east = def.west + widthM / mPerDegLon;
const toXY = (lon: number, lat: number) => ({ x: (lon - def.west) * mPerDegLon, y: (def.north - lat) * M_PER_DEG_LAT });
const toLonLat = (x: number, y: number) => ({ lon: def.west + x / mPerDegLon, lat: def.north - y / M_PER_DEG_LAT });

const map = new HexMap(def.cols, def.rows, 0);
const centres = Array.from({ length: map.size }, (_, i) => hexToWorld(map.axialOfIndex(i)));
const hexIndexAt = (x: number, y: number) => map.indexOfAxial(worldToHex(x, y));

mkdirSync(CACHE, { recursive: true });

async function fetchCached(url: string, file: string, init?: RequestInit): Promise<Buffer> {
  const path = `${CACHE}/${file}`;
  if (existsSync(path)) return readFileSync(path);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(path, buf);
      return buf;
    }
    if (attempt >= 4) throw new Error(`${url}: HTTP ${res.status} ${await res.text()}`);
    console.log(`  HTTP ${res.status}, retrying in ${attempt * 10}s`);
    await new Promise((r) => setTimeout(r, attempt * 10000));
  }
}

// --- elevation --------------------------------------------------------------
async function importElevation(): Promise<void> {
  const z = 12;
  const n = 2 ** z;
  const tileX = (lon: number) => ((lon + 180) / 360) * n;
  const tileY = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  };
  const tiles = new Map<string, PNG>();
  for (let tx = Math.floor(tileX(def.west)); tx <= Math.floor(tileX(east)); tx++) {
    for (let ty = Math.floor(tileY(def.north)); ty <= Math.floor(tileY(south)); ty++) {
      const buf = await fetchCached(
        `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`,
        `terrarium-${z}-${tx}-${ty}.png`,
      );
      tiles.set(`${tx}/${ty}`, PNG.sync.read(buf));
    }
  }
  const sample = (fx: number, fy: number): number => {
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const png = tiles.get(`${tx}/${ty}`)!;
    const px = Math.min(255, Math.floor((fx - tx) * 256));
    const py = Math.min(255, Math.floor((fy - ty) * 256));
    const o = (py * 256 + px) * 4;
    return png.data[o]! * 256 + png.data[o + 1]! + png.data[o + 2]! / 256 - 32768;
  };
  for (let i = 0; i < map.size; i++) {
    const { lon, lat } = toLonLat(centres[i]!.x, centres[i]!.y);
    // Average a 3x3 neighbourhood (~35 m spacing) to smooth single-pixel noise.
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += sample(tileX(lon) + dx / 256, tileY(lat) + dy / 256);
    map.elevation[i] = Math.round(sum / 9);
  }
  console.log(`elevation: ${tiles.size} tiles`);
}

// --- OpenStreetMap ------------------------------------------------------------
type Pt = { lat: number; lon: number };
interface OsmEl {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: Pt;
  tags?: Record<string, string>;
  geometry?: Pt[];
  members?: { type: string; role: string; geometry?: Pt[] }[];
}

async function fetchOsm(): Promise<OsmEl[]> {
  const pad = 0.01;
  const bbox = `${south - pad},${def.west - pad},${def.north + pad},${east + pad}`;
  const query = `[out:json][timeout:300][bbox:${bbox}];
(
  way["landuse"]; relation["landuse"];
  way["natural"~"^(wood|scrub|wetland|water|tree_row)$"]; relation["natural"~"^(wood|scrub|wetland|water)$"];
  way["waterway"~"^(river|canal|stream|riverbank)$"];
  way["water"]; relation["water"];
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|track)$"];
  way["man_made"="spoil_heap"];
);
out geom;
way["building"];
out tags center;
node["place"~"^(city|town|village|hamlet)$"];
out;`;
  const buf = await fetchCached("https://overpass-api.de/api/interpreter", `osm-${def.id}.json`, {
    method: "POST",
    body: new URLSearchParams({ data: query }),
    headers: { "User-Agent": "kill-zone-map-import/0.1" },
  });
  const json = JSON.parse(buf.toString("utf8")) as { elements: OsmEl[] };
  console.log(`osm: ${json.elements.length} elements`);
  return json.elements;
}

/** Join way segments into closed rings (for multipolygon relations). */
function joinRings(segments: Pt[][]): Pt[][] {
  const key = (p: Pt) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
  const rings: Pt[][] = [];
  const open = segments.filter((s) => s.length > 1).map((s) => [...s]);
  while (open.length > 0) {
    let ring = open.pop()!;
    let grew = true;
    while (key(ring[0]!) !== key(ring.at(-1)!) && grew) {
      grew = false;
      for (let k = 0; k < open.length; k++) {
        const s = open[k]!;
        if (key(s[0]!) === key(ring.at(-1)!)) ring = ring.concat(s.slice(1));
        else if (key(s.at(-1)!) === key(ring.at(-1)!)) ring = ring.concat([...s].reverse().slice(1));
        else if (key(s.at(-1)!) === key(ring[0]!)) ring = s.concat(ring.slice(1));
        else if (key(s[0]!) === key(ring[0]!)) ring = [...s].reverse().concat(ring.slice(1));
        else continue;
        open.splice(k, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

type XY = { x: number; y: number };
interface Poly {
  outer: XY[][];
  inner: XY[][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function inRing(p: XY, ring: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function makePoly(outer: Pt[][], inner: Pt[][]): Poly | null {
  const o = outer.map((r) => r.map((p) => toXY(p.lon, p.lat)));
  if (o.length === 0) return null;
  const all = o.flat();
  return {
    outer: o,
    inner: inner.map((r) => r.map((p) => toXY(p.lon, p.lat))),
    minX: Math.min(...all.map((p) => p.x)),
    minY: Math.min(...all.map((p) => p.y)),
    maxX: Math.max(...all.map((p) => p.x)),
    maxY: Math.max(...all.map((p) => p.y)),
  };
}

/** Sample offsets inside a hex (metres): centre plus two rings. 19 points. */
const SAMPLES: XY[] = (() => {
  const pts: XY[] = [{ x: 0, y: 0 }];
  const ap = HEX_FLAT_TO_FLAT_M / 2;
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k;
    pts.push({ x: 0.45 * ap * Math.cos(a), y: 0.45 * ap * Math.sin(a) });
  }
  for (let k = 0; k < 12; k++) {
    const a = (Math.PI / 6) * k + Math.PI / 12;
    pts.push({ x: 0.85 * ap * Math.cos(a), y: 0.85 * ap * Math.sin(a) });
  }
  return pts;
})();

/** Add each hex's covered sample fraction for a polygon into cov. */
function rasterPoly(poly: Poly, cov: Float32Array): void {
  const r0 = Math.max(0, Math.floor(poly.minY / HEX_ROW_SPACING_M) - 1);
  const r1 = Math.min(map.rows - 1, Math.ceil(poly.maxY / HEX_ROW_SPACING_M) + 1);
  const c0 = Math.max(0, Math.floor(poly.minX / HEX_FLAT_TO_FLAT_M) - 1);
  const c1 = Math.min(map.cols - 1, Math.ceil(poly.maxX / HEX_FLAT_TO_FLAT_M) + 1);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const i = map.index(col, row);
      const c = centres[i]!;
      let hits = 0;
      for (const s of SAMPLES) {
        const p = { x: c.x + s.x, y: c.y + s.y };
        if (p.x < poly.minX || p.x > poly.maxX || p.y < poly.minY || p.y > poly.maxY) continue;
        if (poly.outer.some((r) => inRing(p, r)) && !poly.inner.some((r) => inRing(p, r))) hits++;
      }
      if (hits > 0) cov[i] = Math.min(1, cov[i]! + hits / SAMPLES.length);
    }
  }
}

/** Hex indices visited by a polyline, sampled every 40 m, in order. */
function lineHexes(geom: Pt[]): number[] {
  const out: number[] = [];
  for (let k = 0; k + 1 < geom.length; k++) {
    const a = toXY(geom[k]!.lon, geom[k]!.lat);
    const b = toXY(geom[k + 1]!.lon, geom[k + 1]!.lat);
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 40));
    for (let s = 0; s <= steps; s++) {
      const i = hexIndexAt(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps);
      if (out.at(-1) !== i) out.push(i);
    }
  }
  return out;
}

function markRoad(hexes: number[], cls: RoadClass): void {
  for (let k = 0; k < hexes.length; k++) {
    const i = hexes[k]!;
    if (i >= 0 && map.road[i]! < cls) map.road[i] = cls;
    const j = hexes[k + 1];
    if (j === undefined || i < 0 || j < 0) continue;
    // Bridge non-adjacent steps (rare) with a hex line.
    const path = hexLine(map.axialOfIndex(i), map.axialOfIndex(j)).map((h) => map.indexOfAxial(h));
    for (let m = 0; m + 1 < path.length; m++) {
      const a = path[m]!;
      const b = path[m + 1]!;
      if (a < 0 || b < 0) continue;
      if (map.road[b]! < cls) map.road[b] = cls;
      const ha = map.axialOfIndex(a);
      const hb = map.axialOfIndex(b);
      const d = DIRECTIONS.findIndex((v) => v.q === hb.q - ha.q && v.r === hb.r - ha.r);
      if (d < 0) continue;
      map.roadEdges[a]! |= 1 << d;
      map.roadEdges[b]! |= 1 << ((d + 3) % 6);
    }
  }
}

async function importFeatures(): Promise<Place[]> {
  const els = await fetchOsm();
  const n = map.size;
  const cov = {
    forest: new Float32Array(n),
    water: new Float32Array(n),
    wetland: new Float32Array(n),
    residential: new Float32Array(n),
    urbanLanduse: new Float32Array(n),
  };
  const treeRow = new Uint16Array(n);
  const river = new Uint8Array(n);
  const buildings = new Uint16Array(n);
  const bigBuildings = new Uint16Array(n);
  const places: Place[] = [];

  const PAVED = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);
  const TRACK = new Set(["unclassified", "residential", "track"]);
  const BIG = new Set(["apartments", "industrial", "commercial", "retail", "office", "warehouse", "school", "hospital", "public", "university", "civic"]);

  const layerOf = (t: Record<string, string>): keyof typeof cov | null => {
    if (t.natural === "water" || t.water || t.waterway === "riverbank" || t.landuse === "reservoir" || t.landuse === "basin") return "water";
    if (t.natural === "wetland") return "wetland";
    if (t.landuse === "forest" || t.natural === "wood" || t.natural === "scrub") return "forest";
    if (t.landuse === "residential") return "residential";
    if (["industrial", "commercial", "retail", "garages", "railway", "construction", "quarry"].includes(t.landuse ?? "")) return "urbanLanduse";
    return null;
  };

  let polys = 0;
  for (const el of els) {
    const t = el.tags ?? {};
    if (el.type === "node" && t.place) {
      if (el.lat === undefined || el.lon === undefined) continue;
      const p = toXY(el.lon, el.lat);
      const i = hexIndexAt(p.x, p.y);
      if (i < 0) continue;
      const { q, r } = map.axialOfIndex(i);
      const col = q + (r - (r & 1)) / 2;
      places.push({
        name: t["name:en"] ?? t["name:uk"] ?? t.name ?? "?",
        ...(t["name:uk"] ? { nameUk: t["name:uk"] } : {}),
        kind: t.place as Place["kind"],
        col,
        row: r,
        ...(t.population && Number.isFinite(Number(t.population)) ? { population: Number(t.population) } : {}),
      });
      continue;
    }
    if (el.type === "way" && t.building && el.center) {
      const p = toXY(el.center.lon, el.center.lat);
      const i = hexIndexAt(p.x, p.y);
      if (i < 0) continue;
      buildings[i]!++;
      if (BIG.has(t.building)) bigBuildings[i]!++;
      continue;
    }
    if (el.type === "way" && el.geometry) {
      if (t.natural === "tree_row") {
        for (const i of lineHexes(el.geometry)) if (i >= 0) treeRow[i]!++;
        continue;
      }
      if (t.waterway === "river" || t.waterway === "canal") {
        for (const i of lineHexes(el.geometry)) if (i >= 0) river[i] = 1;
        continue;
      }
      if (t.highway) {
        const cls = PAVED.has(t.highway) ? RoadClass.Paved : TRACK.has(t.highway) ? RoadClass.Track : RoadClass.None;
        if (cls !== RoadClass.None) markRoad(lineHexes(el.geometry), cls);
        continue;
      }
    }
    const layer = layerOf(t);
    if (!layer) continue;
    let poly: Poly | null = null;
    if (el.type === "way" && el.geometry && el.geometry.length >= 4) {
      const g = el.geometry;
      if (g[0]!.lat === g.at(-1)!.lat && g[0]!.lon === g.at(-1)!.lon) poly = makePoly([g], []);
    } else if (el.type === "relation" && el.members) {
      const outer = joinRings(el.members.filter((m) => m.role !== "inner" && m.geometry).map((m) => m.geometry!));
      const inner = joinRings(el.members.filter((m) => m.role === "inner" && m.geometry).map((m) => m.geometry!));
      poly = makePoly(outer, inner);
    }
    if (poly) {
      rasterPoly(poly, cov[layer]);
      polys++;
    }
  }
  console.log(`polygons: ${polys}, places: ${places.length}`);

  for (let i = 0; i < n; i++) {
    let t = Terrain.Open;
    if (cov.water[i]! >= 0.5 || river[i]) t = Terrain.Water;
    else if (bigBuildings[i]! >= 2 || buildings[i]! >= 30 || cov.urbanLanduse[i]! >= 0.5) t = Terrain.Urban;
    else if (buildings[i]! >= 4 || cov.residential[i]! >= 0.4) t = Terrain.Village;
    else if (cov.wetland[i]! >= 0.4) t = Terrain.Marsh;
    else if (cov.forest[i]! >= 0.45) t = Terrain.Forest;
    else if (cov.forest[i]! >= 0.08 || treeRow[i]! > 0) t = Terrain.Treeline;
    map.terrain[i] = t;
  }
  return places;
}

await importElevation();
const places = await importFeatures();
const file = encodeMap(map, {
  id: def.id,
  name: def.name,
  bounds: { west: def.west, north: def.north, east, south },
  places: places.sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || a.name.localeCompare(b.name)),
  sources: [
    "Map data © OpenStreetMap contributors, available under the Open Database License (ODbL)",
    "Elevation: AWS Terrain Tiles (Terrarium), derived from SRTM and other public sources",
  ],
  generated: new Date().toISOString().slice(0, 10),
});
const out = `src/data/maps/${def.id}.json`;
writeFileSync(out, JSON.stringify(file));
const counts: Record<string, number> = {};
for (const t of map.terrain) counts[Terrain[t]!] = (counts[Terrain[t]!] ?? 0) + 1;
console.log(`wrote ${out}: ${def.cols} x ${def.rows} hexes`, counts);
