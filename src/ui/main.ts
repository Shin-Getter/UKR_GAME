import { ELEMENT_TYPES } from "../data/elements";
import { Terrain, TERRAIN } from "../data/terrain";
import { formatClock, clockAt } from "../engine/clock";
import { submit } from "../engine/controller";
import { type Axial, axialToOffset } from "../engine/hex";
import { RoadClass } from "../engine/map";
import type { Order } from "../engine/orders";
import { runReplay, toReplay } from "../engine/replay";
import { resolveCycle } from "../engine/sim";
import { type GameState, hashState, SIDE_NAMES, SIDES, type SideId } from "../engine/state";
import { SCENARIOS } from "../scenarios";
import { buildTestSector } from "../scenarios/testSector";
import { ROAD_COLOR, shade, TERRAIN_COLOR } from "./palette";
import { MapRenderer, SIDE_COLOR } from "./renderer";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const seedInput = $<HTMLInputElement>("seed");
const params = new URLSearchParams(location.search);
const initialSeed = Number(params.get("seed") ?? 1) >>> 0;
seedInput.value = String(initialSeed);

let state: GameState = buildTestSector(initialSeed);
/** Orders being drafted in the UI, per side, keyed by element id. */
let drafts: Record<SideId, Map<string, Order>> = { ua: new Map(), ru: new Map() };
let selectedId: string | null = null;
let moveMode = false;

const renderer = new MapRenderer($<HTMLCanvasElement>("map"), state.map);

function message(text: string): void {
  $("game-msg").textContent = text;
}

function refresh(): void {
  const pendingTargets = new Map<string, number>();
  for (const side of SIDES) {
    for (const o of drafts[side].values()) {
      if (o.kind === "move") pendingTargets.set(o.elementId, state.map.index(o.to.col, o.to.row));
    }
  }
  renderer.forces = { elements: state.elements, selectedId, pendingTargets };
  renderer.requestDraw();

  $("clock").textContent = formatClock(clockAt(state.tick, state.startHour));
  $("orders-summary").textContent = SIDES.map((s) => `${SIDE_NAMES[s]}: ${drafts[s].size} order(s) queued`).join(" · ");

  const sel = selectedId ? state.elements.find((e) => e.id === selectedId) : undefined;
  if (sel) {
    const type = ELEMENT_TYPES[sel.typeId];
    const unit = state.units.find((u) => u.id === sel.unitId);
    const o = axialToOffset(state.map.axialOfIndex(sel.hex));
    const draft = drafts[sel.side].get(sel.id);
    const status = draft?.kind === "move" ? `move queued to ${draft.to.col}, ${draft.to.row}` : sel.move ? "moving" : "holding";
    $("selected").innerHTML = `<dl>
      <dt>Side</dt><dd><span style="color:${SIDE_COLOR[sel.side]}">■</span> ${SIDE_NAMES[sel.side]}</dd>
      <dt>Type</dt><dd>${esc(type.name)}</dd>
      <dt>Unit</dt><dd>${esc(unit?.name ?? "?")}</dd>
      <dt>Id</dt><dd>${sel.id}</dd>
      <dt>Personnel</dt><dd>${sel.personnel}</dd>
      <dt>Vehicles</dt><dd>${type.vehicles.map((v) => `${v.count} × ${esc(v.kind)}`).join(", ") || "none"}</dd>
      <dt>Speed</dt><dd>${type.speed.value} km/h (${type.mobility})</dd>
      <dt>Hex</dt><dd>${o.col}, ${o.row}</dd>
      <dt>Status</dt><dd>${status}</dd>
    </dl>`;
  } else {
    $("selected").textContent = "None. Click a unit marker.";
  }

  const name = (id: string) => {
    const e = state.elements.find((x) => x.id === id);
    return e ? `${ELEMENT_TYPES[e.typeId].name} ${e.id}` : id;
  };
  $("events").innerHTML = state.lastEvents
    .filter((e) => e.kind !== "orderApplied")
    .map((e) => {
      const c = clockAt(e.tick, state.startHour);
      const t = `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;
      const what = e.kind === "arrived" ? "arrived" : `blocked (${e.note ?? ""})`;
      return `<li class="${e.side}">${t} ${esc(name(e.elementId))} ${what}</li>`;
    })
    .join("") || "<li>No events yet.</li>";
}

function newGame(seed: number): void {
  state = buildTestSector(seed);
  drafts = { ua: new Map(), ru: new Map() };
  selectedId = null;
  renderer.setMap(state.map);
  showStats();
  refresh();
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  history.replaceState(null, "", url);
}

function showStats(): void {
  const map = state.map;
  const counts = new Map<Terrain, number>();
  for (const t of map.terrain) counts.set(t as Terrain, (counts.get(t as Terrain) ?? 0) + 1);
  const pct = (t: Terrain) => `${(((counts.get(t) ?? 0) / map.size) * 100).toFixed(0)}%`;
  const per = (s: SideId) => state.elements.filter((e) => e.side === s).length;
  $("stats").innerHTML = `
    <dt>Size</dt><dd>${map.widthKm.toFixed(1)} × ${map.depthKm.toFixed(1)} km</dd>
    <dt>Hexes</dt><dd>${map.cols} × ${map.rows} = ${map.size.toLocaleString()}</dd>
    <dt>Fields</dt><dd>${pct(Terrain.Open)}</dd>
    <dt>Treelines</dt><dd>${pct(Terrain.Treeline)}</dd>
    <dt>Elements</dt><dd>UA ${per("ua")} · RU ${per("ru")}</dd>
    <dt>State hash</dt><dd><code>${hashState(state)}</code></dd>`;
}

function issueMove(hex: Axial): void {
  const sel = selectedId ? state.elements.find((e) => e.id === selectedId) : undefined;
  if (!sel) {
    message("Select a unit first.");
    return;
  }
  const to = axialToOffset(hex);
  drafts[sel.side].set(sel.id, { kind: "move", elementId: sel.id, to });
  message("");
  refresh();
}

renderer.onClick = (elementId, hex) => {
  if (moveMode && hex && selectedId && !elementId) {
    issueMove(hex);
    return;
  }
  selectedId = elementId;
  refresh();
};
renderer.onRightClick = (hex) => issueMove(hex);

renderer.onHover = (hex) => {
  const el = $("hover");
  if (!hex) {
    el.textContent = "Hover a hex.";
    return;
  }
  const map = state.map;
  const o = axialToOffset(hex);
  const i = map.index(o.col, o.row);
  const def = TERRAIN[map.terrain[i] as Terrain];
  const road = map.road[i] === RoadClass.Paved ? "paved road" : map.road[i] === RoadClass.Track ? "track" : "none";
  const move = (v: number) => (Number.isFinite(v) ? `×${v}` : "impassable");
  el.innerHTML = `
    <dl>
      <dt>Hex</dt><dd>col ${o.col}, row ${o.row}</dd>
      <dt>Terrain</dt><dd>${def.name}</dd>
      <dt>Elevation</dt><dd>${map.elevation[i]} m</dd>
      <dt>Road</dt><dd>${road}</dd>
      <dt>Concealment</dt><dd>${def.concealment.value}</dd>
      <dt>Cover</dt><dd>${def.cover.value}</dd>
      <dt>Foot move</dt><dd>${move(def.footMoveCost.value)}</dd>
      <dt>Vehicle move</dt><dd>${move(def.vehicleMoveCost.value)}</dd>
    </dl>`;
};

$("run-day").addEventListener("click", () => {
  const rejected: string[] = [];
  for (const side of SIDES) {
    const result = submit(state, { side, cycle: state.cycle, orders: [...drafts[side].values()] });
    for (const r of result.rejected) rejected.push(`${r.order.elementId}: ${r.reason}`);
  }
  resolveCycle(state);
  drafts = { ua: new Map(), ru: new Map() };
  message(rejected.length ? `Rejected: ${rejected.join("; ")}` : "");
  showStats();
  refresh();
});

$("move-mode").addEventListener("click", () => {
  moveMode = !moveMode;
  $("move-mode").setAttribute("aria-pressed", String(moveMode));
  $("map").classList.toggle("move-mode", moveMode);
});
$("clear-orders").addEventListener("click", () => {
  drafts = { ua: new Map(), ru: new Map() };
  refresh();
});

$("save-replay").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(toReplay(state), null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `killzone-replay-seed${state.seed}-day${state.cycle}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$<HTMLInputElement>("load-replay").addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const loaded = runReplay(JSON.parse(await file.text()), SCENARIOS);
    state = loaded;
    drafts = { ua: new Map(), ru: new Map() };
    selectedId = null;
    seedInput.value = String(state.seed);
    renderer.setMap(state.map);
    showStats();
    refresh();
    message(`Replay loaded and verified (day ${state.cycle}).`);
  } catch (err) {
    message(`Could not load replay: ${(err as Error).message}`);
  }
  (e.target as HTMLInputElement).value = "";
});

$("legend").innerHTML =
  `<li><span class="swatch" style="background:${SIDE_COLOR.ua}"></span>Ukraine unit</li>` +
  `<li><span class="swatch" style="background:${SIDE_COLOR.ru}"></span>Russia unit</li>` +
  Object.values(TERRAIN)
    .map((d) => `<li><span class="swatch" style="background:${shade(TERRAIN_COLOR[d.id], 1)}"></span>${d.name}</li>`)
    .join("") +
  `<li><span class="line" style="background:${ROAD_COLOR.paved};box-shadow:0 0 0 2px ${ROAD_COLOR.pavedCasing}"></span>Paved road</li>` +
  `<li><span class="line" style="background:${ROAD_COLOR.track}"></span>Track</li>`;

$("regen").addEventListener("click", () => newGame(Number(seedInput.value) >>> 0));
$("random").addEventListener("click", () => {
  const seed = Math.floor(Math.random() * 1e6); // UI only; engine randomness is always seeded
  seedInput.value = String(seed);
  newGame(seed);
});
seedInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") newGame(Number(seedInput.value) >>> 0);
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

newGame(initialSeed);

// Console access for experimenting and automated UI checks: window.killzone.state etc.
Object.assign(window, { killzone: { get state() { return state; }, renderer } });
