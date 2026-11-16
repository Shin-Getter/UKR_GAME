import { Terrain, TERRAIN } from "../data/terrain";
import { axialToOffset } from "../engine/hex";
import { RoadClass } from "../engine/map";
import { generateSector } from "../engine/mapgen";
import { ROAD_COLOR, shade, TERRAIN_COLOR } from "./palette";
import { MapRenderer } from "./renderer";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const seedInput = $<HTMLInputElement>("seed");
const params = new URLSearchParams(location.search);
const initialSeed = Number(params.get("seed") ?? 1) >>> 0;
seedInput.value = String(initialSeed);

let map = generateSector(initialSeed);
const renderer = new MapRenderer($<HTMLCanvasElement>("map"), map);

function showStats(ms: number): void {
  const counts = new Map<Terrain, number>();
  for (const t of map.terrain) counts.set(t as Terrain, (counts.get(t as Terrain) ?? 0) + 1);
  const pct = (t: Terrain) => `${(((counts.get(t) ?? 0) / map.size) * 100).toFixed(0)}%`;
  $("stats").innerHTML = `
    <dt>Size</dt><dd>${map.widthKm.toFixed(1)} × ${map.depthKm.toFixed(1)} km</dd>
    <dt>Hexes</dt><dd>${map.cols} × ${map.rows} = ${map.size.toLocaleString()}</dd>
    <dt>Fields</dt><dd>${pct(Terrain.Open)}</dd>
    <dt>Treelines</dt><dd>${pct(Terrain.Treeline)}</dd>
    <dt>Generated</dt><dd>${ms.toFixed(0)} ms</dd>
    <dt>State hash</dt><dd><code>${map.hash()}</code></dd>`;
}

function regenerate(seed: number): void {
  const t0 = performance.now();
  map = generateSector(seed);
  const ms = performance.now() - t0;
  renderer.setMap(map);
  showStats(ms);
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  history.replaceState(null, "", url);
}

renderer.onHover = (hex) => {
  const el = $("hover");
  if (!hex) {
    el.textContent = "Hover a hex.";
    return;
  }
  const o = axialToOffset(hex);
  const i = map.index(o.col, o.row);
  const def = TERRAIN[map.terrain[i] as Terrain];
  const road = map.road[i] === RoadClass.Paved ? "paved road" : map.road[i] === RoadClass.Track ? "track" : "none";
  const move = (v: number) => (Number.isFinite(v) ? `×${v}` : "impassable");
  el.innerHTML = `
    <dl>
      <dt>Hex</dt><dd>col ${o.col}, row ${o.row} (q ${hex.q}, r ${hex.r})</dd>
      <dt>Terrain</dt><dd>${def.name}</dd>
      <dt>Elevation</dt><dd>${map.elevation[i]} m</dd>
      <dt>Road</dt><dd>${road}</dd>
      <dt>Concealment</dt><dd>${def.concealment.value}</dd>
      <dt>Cover</dt><dd>${def.cover.value}</dd>
      <dt>Foot move</dt><dd>${move(def.footMoveCost.value)}</dd>
      <dt>Vehicle move</dt><dd>${move(def.vehicleMoveCost.value)}</dd>
    </dl>
    <p class="sub">Parameters are placeholders (confidence: guess).</p>`;
};

$("legend").innerHTML =
  Object.values(TERRAIN)
    .map((d) => `<li><span class="swatch" style="background:${shade(TERRAIN_COLOR[d.id], 1)}"></span>${d.name}</li>`)
    .join("") +
  `<li><span class="line" style="background:${ROAD_COLOR.paved}"></span>Paved road</li>` +
  `<li><span class="line" style="background:${ROAD_COLOR.track}"></span>Track</li>`;

$("regen").addEventListener("click", () => regenerate(Number(seedInput.value) >>> 0));
$("random").addEventListener("click", () => {
  const seed = Math.floor(Math.random() * 1e6); // UI only; engine randomness is always seeded
  seedInput.value = String(seed);
  regenerate(seed);
});
seedInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") regenerate(Number(seedInput.value) >>> 0);
});
for (const key of ["grid", "relief", "roads"] as const) {
  const box = $<HTMLInputElement>(key);
  box.addEventListener("change", () => {
    renderer.view[key] = box.checked;
    renderer.requestDraw();
  });
}
$("zoom-in").addEventListener("click", () => renderer.zoomBy(1.5));
$("zoom-out").addEventListener("click", () => renderer.zoomBy(1 / 1.5));
$("fit").addEventListener("click", () => renderer.fit(true));

regenerate(initialSeed);
