import { ELEMENT_TYPES } from "../data/elements";
import { Terrain, TERRAIN } from "../data/terrain";
import { formatClock, clockAt } from "../engine/clock";
import { observe, submit } from "../engine/controller";
import { coverageMap } from "../engine/sensing";
import { ELEMENT_SENSORS, SENSORS, TrackQuality } from "../data/sensing";
import { type Axial, axialToOffset } from "../engine/hex";
import { RoadClass } from "../engine/map";
import type { Order } from "../engine/orders";
import { runReplay, toReplay } from "../engine/replay";
import { resolveCycle } from "../engine/sim";
import { type GameState, hashState, SIDE_NAMES, SIDES, type SideId } from "../engine/state";
import { SCENARIO_LIST, SCENARIOS, type ScenarioInfo } from "../scenarios";
import { ROAD_COLOR, shade, TERRAIN_COLOR } from "./palette";
import { MapRenderer, SIDE_COLOR } from "./renderer";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const seedInput = $<HTMLInputElement>("seed");
const scenarioSelect = $<HTMLSelectElement>("scenario");
const params = new URLSearchParams(location.search);
const initialSeed = Number(params.get("seed") ?? 1) >>> 0;
seedInput.value = String(initialSeed);
scenarioSelect.innerHTML = SCENARIO_LIST.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
const scenarioOf = (id: string): ScenarioInfo => SCENARIO_LIST.find((s) => s.id === id) ?? SCENARIO_LIST[0]!;
let scenario = scenarioOf(params.get("scenario") ?? SCENARIO_LIST[0]!.id);
scenarioSelect.value = scenario.id;

let state: GameState = scenario.build(initialSeed);
/** Orders being drafted in the UI, per side, keyed by element id. */
let drafts: Record<SideId, Map<string, Order>> = { ua: new Map(), ru: new Map() };
let selectedId: string | null = null;
let moveMode = false;
type Viewpoint = SideId | "god";
let viewpoint: Viewpoint = (params.get("view") as Viewpoint) ?? "ua";
$<HTMLSelectElement>("viewpoint").value = viewpoint;
let coverageCache: { key: string; data: Float32Array } | null = null;

const QUALITY_NAMES: Record<number, string> = {
  [TrackQuality.Suspected]: "Suspected (position uncertain)",
  [TrackQuality.Detected]: "Detected (located, type unknown)",
  [TrackQuality.Identified]: "Identified",
  [TrackQuality.Targetable]: "Targetable (precise, current)",
};

const hasDrones = (typeId: keyof typeof ELEMENT_TYPES) => ELEMENT_SENSORS[typeId].some((id) => SENSORS[id].mode === "drone");
const canControl = (side: SideId) => viewpoint === "god" || viewpoint === side;

function updateCoverage(): void {
  const mode = $<HTMLSelectElement>("coverage").value;
  if (viewpoint !== "god") $<HTMLSelectElement>("coverage-side").value = viewpoint;
  $<HTMLSelectElement>("coverage-side").disabled = viewpoint !== "god";
  if (mode === "off") {
    renderer.coverage = null;
    return;
  }
  const side = $<HTMLSelectElement>("coverage-side").value as SideId;
  const key = `${state.scenarioId}|${state.seed}|${state.tick}|${side}|${mode}|${state.history.length}`;
  if (coverageCache?.key !== key) {
    const ref = mode === "vehicles" ? { typeId: "mechSection" as const, moving: true } : { typeId: "infantrySquad" as const, moving: false };
    coverageCache = { key, data: coverageMap(state, side, ref) };
  }
  renderer.coverage = coverageCache.data;
}

const renderer = new MapRenderer($<HTMLCanvasElement>("map"), state.map);

function message(text: string): void {
  $("game-msg").textContent = text;
}

function refresh(): void {
  const pendingTargets = new Map<string, number>();
  const pendingPatrols = new Map<string, number>();
  for (const side of SIDES) {
    if (!canControl(side)) continue;
    for (const o of drafts[side].values()) {
      if (o.kind === "move") pendingTargets.set(o.elementId, state.map.index(o.to.col, o.to.row));
      if (o.kind === "patrol") pendingPatrols.set(o.elementId, state.map.index(o.at.col, o.at.row));
    }
  }
  const obs = viewpoint === "god" ? null : observe(state, viewpoint);
  renderer.forces = {
    elements: obs ? obs.elements : state.elements,
    selectedId,
    pendingTargets,
    pendingPatrols,
    tracks: obs ? obs.tracks : [],
    trackSide: obs ? (viewpoint === "ua" ? "ru" : "ua") : null,
    patrolRadiusHex: SENSORS.reconDrone.rangeHex,
  };
  updateCoverage();
  renderer.requestDraw();

  $("clock").textContent = formatClock(clockAt(state.tick, state.startHour));
  $("orders-summary").textContent = SIDES.filter(canControl)
    .map((s) => `${SIDE_NAMES[s]}: ${drafts[s].size} order(s) queued`)
    .join(" · ");

  const sel = selectedId ? state.elements.find((e) => e.id === selectedId && canControl(e.side)) : undefined;
  if (sel) {
    const type = ELEMENT_TYPES[sel.typeId];
    const unit = state.units.find((u) => u.id === sel.unitId);
    const o = axialToOffset(state.map.axialOfIndex(sel.hex));
    const draft = drafts[sel.side].get(sel.id);
    const status =
      draft?.kind === "move" ? `move queued to ${draft.to.col}, ${draft.to.row}`
      : draft?.kind === "patrol" ? `new patrol area queued at ${draft.at.col}, ${draft.at.row}`
      : sel.move ? "moving" : "holding";
    const patrol = sel.patrol === null ? "none" : (() => {
      const p = axialToOffset(state.map.axialOfIndex(sel.patrol));
      return `centred on ${p.col}, ${p.row}${sel.move ? " (grounded while moving)" : ""}`;
    })();
    $("selected").innerHTML = `<dl>
      <dt>Side</dt><dd><span style="color:${SIDE_COLOR[sel.side]}">■</span> ${SIDE_NAMES[sel.side]}</dd>
      <dt>Type</dt><dd>${esc(type.name)}</dd>
      <dt>Unit</dt><dd>${esc(unit?.name ?? "?")}</dd>
      <dt>Id</dt><dd>${sel.id}</dd>
      <dt>Personnel</dt><dd>${sel.personnel}</dd>
      <dt>Vehicles</dt><dd>${type.vehicles.map((v) => `${v.count} × ${esc(v.kind)}`).join(", ") || "none"}</dd>
      <dt>Speed</dt><dd>${type.speed.value} km/h (${type.mobility})</dd>
      <dt>Sensors</dt><dd>${ELEMENT_SENSORS[sel.typeId].map((id) => esc(SENSORS[id].name)).join("; ")}</dd>
      ${hasDrones(sel.typeId) ? `<dt>Patrol</dt><dd>${patrol}</dd>` : ""}
      <dt>Hex</dt><dd>${o.col}, ${o.row}</dd>
      <dt>Status</dt><dd>${status}</dd>
    </dl>
    <p class="sub">${hasDrones(sel.typeId) ? "Right-click sets the drone patrol area (within 8 km). To relocate the crew instead, turn on Tap to order and tap a hex." : "Right-click a hex to order a move."}</p>`;
  } else {
    $("selected").textContent = "None. Click one of your unit markers.";
  }

  const name = (id: string) => {
    const e = state.elements.find((x) => x.id === id);
    return e ? `${ELEMENT_TYPES[e.typeId].name} ${e.id}` : id;
  };
  $("events").innerHTML =
    state.lastEvents
      .filter((e) => e.kind !== "orderApplied" && canControl(e.side))
      .map((e) => {
        const c = clockAt(e.tick, state.startHour);
        const t = `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;
        const who = viewpoint === "god" ? `${SIDE_NAMES[e.side]}: ` : "";
        if (e.kind === "newContact" || e.kind === "lostContact") {
          return `<li class="contact">${t} ${who}${e.kind === "newContact" ? "new contact" : "lost contact"} ${e.elementId}</li>`;
        }
        const what = e.kind === "arrived" ? "arrived" : `blocked (${e.note ?? ""})`;
        return `<li class="${e.side}">${t} ${who}${esc(name(e.elementId))} ${what}</li>`;
      })
      .join("") || "<li>No events yet.</li>";
}

function applyScenarioView(): void {
  renderer.places = scenario.places?.() ?? [];
  renderer.frontHexes = scenario.frontHexes?.(state) ?? [];
  $("scenario-note").textContent = scenario.note ?? "";
  $("seed-help").textContent = scenario.seedChangesMap
    ? "The seed generates the map and force placement. A new seed starts a new game."
    : "Real terrain: the seed only changes force placement. A new seed starts a new game.";
  $("attribution").textContent = (scenario.attribution?.() ?? []).join(" · ");
}

function newGame(seed: number): void {
  state = scenario.build(seed);
  drafts = { ua: new Map(), ru: new Map() };
  selectedId = null;
  renderer.setMap(state.map);
  applyScenarioView();
  renderer.fit(true);
  showStats();
  refresh();
  const url = new URL(location.href);
  url.searchParams.set("scenario", scenario.id);
  url.searchParams.set("seed", String(seed));
  history.replaceState(null, "", url);
}

scenarioSelect.addEventListener("change", () => {
  scenario = scenarioOf(scenarioSelect.value);
  newGame(Number(seedInput.value) >>> 0);
});

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
    <dt>Built-up</dt><dd>${pct(Terrain.Village)} village · ${pct(Terrain.Urban)} urban</dd>
    <dt>Elements</dt><dd>UA ${per("ua")} · RU ${per("ru")}</dd>
    <dt>State hash</dt><dd><code>${hashState(state)}</code></dd>`;
}

/** Queue an order for the selected unit at a hex: patrol for drone crews, otherwise move. */
function issueOrder(hex: Axial, forceMove = false): void {
  const sel = selectedId ? state.elements.find((e) => e.id === selectedId && canControl(e.side)) : undefined;
  if (!sel) {
    message("Select one of your units first.");
    return;
  }
  const at = axialToOffset(hex);
  const order: Order =
    hasDrones(sel.typeId) && !forceMove ? { kind: "patrol", elementId: sel.id, at } : { kind: "move", elementId: sel.id, to: at };
  drafts[sel.side].set(sel.id, order);
  message("");
  refresh();
}

renderer.onClick = (elementId, hex) => {
  if (moveMode && hex && selectedId && !elementId) {
    issueOrder(hex, true);
    return;
  }
  const el = elementId ? state.elements.find((e) => e.id === elementId) : undefined;
  selectedId = el && canControl(el.side) ? el.id : null;
  refresh();
};
renderer.onRightClick = (hex) => issueOrder(hex);

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
      ${renderer.coverage ? `<dt>Coverage</dt><dd>${Math.round(renderer.coverage[i]! * 100)}% chance per hour</dd>` : ""}
    </dl>${contactsAt(i)}`;
};

function contactsAt(hex: number): string {
  if (viewpoint === "god") return "";
  const tracks = observe(state, viewpoint).tracks.filter((t) => t.hex === hex);
  if (tracks.length === 0) return "";
  return tracks
    .map((t) => {
      const age = state.tick - t.lastSeenTick;
      return `<p class="sub contact">Contact ${t.id}: ${QUALITY_NAMES[t.quality]}${t.typeId ? `, ${esc(ELEMENT_TYPES[t.typeId].name)}` : ""}; last seen ${age * 15} min ago</p>`;
    })
    .join("");
}

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

$("viewpoint").addEventListener("change", () => {
  viewpoint = $<HTMLSelectElement>("viewpoint").value as Viewpoint;
  selectedId = null;
  const url = new URL(location.href);
  url.searchParams.set("view", viewpoint);
  history.replaceState(null, "", url);
  refresh();
});
for (const id of ["coverage", "coverage-side"]) $(id).addEventListener("change", () => refresh());

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
    scenario = scenarioOf(state.scenarioId);
    scenarioSelect.value = scenario.id;
    applyScenarioView();
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
  `<li><span class="front"></span>Line of contact (illustrative)</li>` +
  `<li><span class="ring" style="color:${SIDE_COLOR.ua}"></span>Drone patrol area (2 km)</li>` +
  `<li><span class="heat"></span>Chance to locate an enemy target per hour</li>` +
  `<li>Contacts: dashed ring = suspected · dashed box = detected · solid = identified · corner marks = targetable</li>` +
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
