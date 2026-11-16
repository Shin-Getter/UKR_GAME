import { Terrain } from "../data/terrain";
import {
  type Axial,
  DIRECTIONS,
  HEX_FLAT_TO_FLAT_M,
  HEX_RADIUS_M,
  HEX_ROW_SPACING_M,
  hexToWorld,
  offsetToAxial,
  worldToHex,
} from "../engine/hex";
import { type HexMap, RoadClass } from "../engine/map";
import type { Element, SideId } from "../engine/state";
import type { Place } from "../engine/mapio";
import type { TrackReport } from "../engine/controller";
import { TrackQuality } from "../data/sensing";
import { ELEMENT_TYPES } from "../data/elements";
import { RELIEF_BANDS, ROAD_COLOR, shade, TERRAIN_COLOR } from "./palette";

export const SIDE_COLOR: Record<SideId, string> = { ua: "#2f6fd6", ru: "#c8352f" };

export interface ViewOptions {
  grid: boolean;
  relief: boolean;
  roads: boolean;
}

/**
 * Canvas 2D map renderer with pan and zoom. Hexes are batched into one path
 * per (terrain, relief band) so a full-sector redraw is a few dozen fills.
 */
export class MapRenderer {
  /** World point (metres) at the canvas centre. */
  private cx = 0;
  private cy = 0;
  /** Screen pixels per metre. */
  private scale = 0.05;
  private hover: Axial | null = null;
  private frame = 0;
  private fitted = false;
  private elevMin = 0;
  private elevMax = 1;

  view: ViewOptions = { grid: true, relief: true, roads: true };
  onHover: (hex: Axial | null) => void = () => {};
  /** Left click without dragging: the element under the cursor (if any) and the hex. */
  onClick: (elementId: string | null, hex: Axial | null) => void = () => {};
  /** Right click on a hex (issue an order). */
  onRightClick: (hex: Axial) => void = () => {};

  /** Forces to draw, the selected element and queued move destinations. */
  forces: {
    elements: Element[];
    selectedId: string | null;
    pendingTargets: Map<string, number>;
    pendingPatrols: Map<string, number>;
    /** Enemy contacts to draw (side views), with the enemy side's colour. */
    tracks: TrackReport[];
    trackSide: SideId | null;
    /** Drone patrol radius in hexes. */
    patrolRadiusHex: number;
    /** Destroyed elements to mark with a cross. */
    destroyed: Element[];
    /** Elements hit during the last day (red outline). */
    struckIds: Set<string>;
  } = {
    elements: [],
    selectedId: null,
    pendingTargets: new Map(),
    pendingPatrols: new Map(),
    tracks: [],
    trackSide: null,
    patrolRadiusHex: 8,
    destroyed: [],
    struckIds: new Set(),
  };
  /** Per-hex detection probability overlay (0..1), or null. */
  coverage: Float32Array | null = null;
  /** Place names to label, and the (illustrative) line of contact to draw. */
  places: Place[] = [];
  frontHexes: number[] = [];
  private markerRects: { id: string; x: number; y: number; w: number; h: number }[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private map: HexMap,
  ) {
    this.setMap(map);
    this.attachInput();
    new ResizeObserver(() => this.fit(false)).observe(canvas);
  }

  setMap(map: HexMap): void {
    this.map = map;
    let lo = Infinity;
    let hi = -Infinity;
    for (const e of map.elevation) {
      lo = Math.min(lo, e);
      hi = Math.max(hi, e);
    }
    this.elevMin = lo;
    this.elevMax = Math.max(hi, lo + 1);
    this.requestDraw();
  }

  /** Centre the sector and, if zoom is true, scale it to fit the canvas. */
  fit(zoom = true): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const worldW = this.map.cols * HEX_FLAT_TO_FLAT_M;
    const worldH = this.map.rows * HEX_ROW_SPACING_M;
    if (zoom || !this.fitted) {
      this.fitted = true;
      this.cx = worldW / 2;
      this.cy = worldH / 2;
      this.scale = Math.min(w / worldW, h / worldH) * 0.95;
    }
    this.requestDraw();
  }

  zoomBy(factor: number, sx = this.canvas.clientWidth / 2, sy = this.canvas.clientHeight / 2): void {
    const before = this.screenToWorld(sx, sy);
    this.scale = Math.max(0.005, Math.min(0.8, this.scale * factor));
    const after = this.screenToWorld(sx, sy);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
    this.requestDraw();
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: this.cx + (sx - this.canvas.clientWidth / 2) / this.scale,
      y: this.cy + (sy - this.canvas.clientHeight / 2) / this.scale,
    };
  }

  requestDraw(): void {
    if (this.frame !== 0 && this.frame !== -1) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = -1;
      this.draw();
    });
  }

  private attachInput(): void {
    const c = this.canvas;
    let drag: { x: number; y: number } | null = null;
    let down: { x: number; y: number } | null = null;
    const local = (e: MouseEvent) => {
      const rect = c.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const hexAt = (sx: number, sy: number): Axial | null => {
      const w = this.screenToWorld(sx, sy);
      const h = worldToHex(w.x, w.y);
      return this.map.indexOfAxial(h) >= 0 ? h : null;
    };
    c.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY };
      down = { x: e.clientX, y: e.clientY };
      c.setPointerCapture(e.pointerId);
      c.classList.add("dragging");
    });
    c.addEventListener("pointermove", (e) => {
      if (drag) {
        this.cx -= (e.clientX - drag.x) / this.scale;
        this.cy -= (e.clientY - drag.y) / this.scale;
        drag = { x: e.clientX, y: e.clientY };
        this.requestDraw();
      }
      const p = local(e);
      const next = hexAt(p.x, p.y);
      if (next?.q !== this.hover?.q || next?.r !== this.hover?.r) {
        this.hover = next;
        this.onHover(next);
        this.requestDraw();
      }
    });
    const end = (e: PointerEvent) => {
      if (down && e.type === "pointerup" && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        const p = local(e);
        this.onClick(this.elementAt(p.x, p.y), hexAt(p.x, p.y));
      }
      drag = null;
      down = null;
      c.classList.remove("dragging");
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const p = local(e);
      const h = hexAt(p.x, p.y);
      if (h) this.onRightClick(h);
    });
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", () => {
      if (this.hover) {
        this.hover = null;
        this.onHover(null);
        this.requestDraw();
      }
    });
    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = c.getBoundingClientRect();
        this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
      },
      { passive: false },
    );
  }

  private draw(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#101214";
    ctx.fillRect(0, 0, w, h);

    const map = this.map;
    const s = this.scale;
    const toScreen = (x: number, y: number): [number, number] => [(x - this.cx) * s + w / 2, (y - this.cy) * s + h / 2];

    // Visible offset-coordinate range, with a one-hex margin.
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(w, h);
    const row0 = Math.max(0, Math.floor(tl.y / HEX_ROW_SPACING_M) - 1);
    const row1 = Math.min(map.rows - 1, Math.ceil(br.y / HEX_ROW_SPACING_M) + 1);
    const col0 = Math.max(0, Math.floor(tl.x / HEX_FLAT_TO_FLAT_M) - 1);
    const col1 = Math.min(map.cols - 1, Math.ceil(br.x / HEX_FLAT_TO_FLAT_M) + 1);

    // Unit corner offsets in screen pixels (pointy-top). Slight overdraw hides seams.
    const rad = HEX_RADIUS_M * s * 1.02;
    const corners: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 90);
      corners.push([rad * Math.cos(a), rad * Math.sin(a)]);
    }

    const bands = this.view.relief ? RELIEF_BANDS : 1;
    const paths = new Map<number, Path2D>();
    const span = this.elevMax - this.elevMin;
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const i = map.index(col, row);
        const t = map.terrain[i]!;
        const band = bands === 1 ? 0 : Math.min(bands - 1, Math.floor(((map.elevation[i]! - this.elevMin) / span) * bands));
        const key = t * 16 + band;
        let p = paths.get(key);
        if (!p) paths.set(key, (p = new Path2D()));
        const c = hexToWorld(offsetToAxial({ col, row }));
        const [x, y] = toScreen(c.x, c.y);
        p.moveTo(x + corners[0]![0], y + corners[0]![1]);
        for (let k = 1; k < 6; k++) p.lineTo(x + corners[k]![0], y + corners[k]![1]);
        p.closePath();
      }
    }
    for (const [key, p] of paths) {
      const t = Math.floor(key / 16) as Terrain;
      const band = key % 16;
      const factor = bands === 1 || t === Terrain.Water ? 1 : 0.82 + (0.3 * band) / (bands - 1);
      ctx.fillStyle = shade(TERRAIN_COLOR[t], factor);
      ctx.fill(p);
    }

    // Roads: segments between neighbouring road hexes (three directions avoids duplicates).
    if (this.view.roads) {
      const track = new Path2D();
      const paved = new Path2D();
      for (let row = row0; row <= row1; row++) {
        for (let col = col0; col <= col1; col++) {
          const i = map.index(col, row);
          const cls = map.road[i]!;
          if (cls === RoadClass.None) continue;
          const a = offsetToAxial({ col, row });
          const ca = hexToWorld(a);
          const [ax, ay] = toScreen(ca.x, ca.y);
          // Directions 0, 4, 5 (E, SW, SE) draw each connection once.
          for (const dir of [0, 4, 5]) {
            if ((map.roadEdges[i]! & (1 << dir)) === 0) continue;
            const d = DIRECTIONS[dir]!;
            const b = { q: a.q + d.q, r: a.r + d.r };
            const j = map.indexOfAxial(b);
            if (j < 0) continue;
            const other = map.road[j]!;
            const cb = hexToWorld(b);
            const [bx, by] = toScreen(cb.x, cb.y);
            const p = Math.min(cls, other) === RoadClass.Paved ? paved : track;
            p.moveTo(ax, ay);
            p.lineTo(bx, by);
          }
        }
      }
      ctx.lineCap = "round";
      // Field tracks are dense on real maps: only draw them once zoomed in.
      if (HEX_FLAT_TO_FLAT_M * s >= 7) {
        ctx.strokeStyle = ROAD_COLOR.track;
        ctx.lineWidth = Math.max(1.25, 16 * s);
        ctx.stroke(track);
      }
      const core = Math.max(1.5, 26 * s);
      ctx.strokeStyle = ROAD_COLOR.pavedCasing;
      ctx.lineWidth = core + Math.max(2, 12 * s);
      ctx.stroke(paved);
      ctx.strokeStyle = ROAD_COLOR.paved;
      ctx.lineWidth = core;
      ctx.stroke(paved);
    }

    // Grid lines once hexes are big enough to read.
    const hexPx = HEX_FLAT_TO_FLAT_M * s;
    if (this.view.grid && hexPx >= 12) {
      const grid = new Path2D();
      const r = HEX_RADIUS_M * s;
      for (let row = row0; row <= row1; row++) {
        for (let col = col0; col <= col1; col++) {
          const c = hexToWorld(offsetToAxial({ col, row }));
          const [x, y] = toScreen(c.x, c.y);
          // Three edges per hex (top-right, right, bottom-right) draws each edge once.
          grid.moveTo(x, y - r);
          grid.lineTo(x + (r * Math.sqrt(3)) / 2, y - r / 2);
          grid.lineTo(x + (r * Math.sqrt(3)) / 2, y + r / 2);
          grid.lineTo(x, y + r);
        }
      }
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke(grid);
    }

    // Hover outline.
    if (this.hover) {
      const c = hexToWorld(this.hover);
      const [x, y] = toScreen(c.x, c.y);
      const r = HEX_RADIUS_M * s;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 180) * (60 * k - 90);
        const px = x + r * Math.cos(a);
        const py = y + r * Math.sin(a);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      // Dark outer ring + light inner ring reads on any terrain colour.
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    this.drawCoverage(ctx, toScreen, row0, row1, col0, col1, corners);
    this.drawFront(ctx, toScreen);
    this.drawForces(ctx, toScreen);
    this.drawPlaces(ctx, toScreen);
    this.drawScaleBar(ctx, h);
  }

  private drawCoverage(
    ctx: CanvasRenderingContext2D,
    toScreen: (x: number, y: number) => [number, number],
    row0: number,
    row1: number,
    col0: number,
    col1: number,
    corners: [number, number][],
  ): void {
    const cov = this.coverage;
    if (!cov) return;
    const buckets = Array.from({ length: 10 }, () => new Path2D());
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const p = cov[this.map.index(col, row)]!;
        if (p < 0.02) continue;
        const b = Math.min(9, Math.floor(p * 10));
        const c = hexToWorld(offsetToAxial({ col, row }));
        const [x, y] = toScreen(c.x, c.y);
        const path = buckets[b]!;
        path.moveTo(x + corners[0]![0], y + corners[0]![1]);
        for (let k = 1; k < 6; k++) path.lineTo(x + corners[k]![0], y + corners[k]![1]);
        path.closePath();
      }
    }
    buckets.forEach((path, b) => {
      ctx.fillStyle = `rgba(255,40,40,${(0.1 + 0.06 * b).toFixed(2)})`;
      ctx.fill(path);
    });
  }

  private drawFront(ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => [number, number]): void {
    if (this.frontHexes.length < 2) return;
    const path = new Path2D();
    this.frontHexes.forEach((i, k) => {
      const c = hexToWorld(this.map.axialOfIndex(i));
      const [x, y] = toScreen(c.x, c.y);
      if (k === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 6;
    ctx.stroke(path);
    ctx.strokeStyle = "#ff8c1a";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.stroke(path);
    ctx.setLineDash([]);
  }

  private drawPlaces(ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => [number, number]): void {
    if (this.places.length === 0) return;
    const hexPx = HEX_FLAT_TO_FLAT_M * this.scale;
    const minHexPx: Record<Place["kind"], number> = { city: 0, town: 0, village: 3, hamlet: 12 };
    const size: Record<Place["kind"], number> = { city: 15, town: 13, village: 11.5, hamlet: 10.5 };
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const rank: Record<Place["kind"], number> = { city: 0, town: 1, village: 2, hamlet: 3 };
    const order = [...this.places].sort((a, b) => rank[a.kind] - rank[b.kind] || (b.population ?? 0) - (a.population ?? 0));
    const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const cw = this.canvas.clientWidth;
    for (const p of order) {
      if (hexPx < minHexPx[p.kind]) continue;
      const c = hexToWorld(offsetToAxial({ col: p.col, row: p.row }));
      let [x, y] = toScreen(c.x, c.y);
      ctx.font = `${p.kind === "city" || p.kind === "town" ? 700 : 600} ${size[p.kind]}px system-ui, sans-serif`;
      const half = ctx.measureText(p.name).width / 2 + 3;
      x = Math.max(half, Math.min(cw - half, x)); // keep edge labels on screen
      const box = { x0: x - half, x1: x + half, y0: y - size[p.kind] / 2 - 2, y1: y + size[p.kind] / 2 + 2 };
      // Skip labels that would collide with a more important one already drawn.
      if (taken.some((t) => box.x0 < t.x1 && box.x1 > t.x0 && box.y0 < t.y1 && box.y1 > t.y0)) continue;
      taken.push(box);
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 3.5;
      ctx.strokeText(p.name, x, y);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(p.name, x, y);
    }
  }

  /** Element id under a screen point, topmost first. */
  elementAt(sx: number, sy: number): string | null {
    for (let k = this.markerRects.length - 1; k >= 0; k--) {
      const r = this.markerRects[k]!;
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return r.id;
    }
    return null;
  }

  private drawForces(ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => [number, number]): void {
    const { elements, selectedId, pendingTargets } = this.forces;
    this.markerRects = [];
    if (elements.length === 0 && this.forces.tracks.length === 0 && this.forces.destroyed.length === 0) return;
    const map = this.map;
    const centre = (i: number) => {
      const c = hexToWorld(map.axialOfIndex(i));
      return toScreen(c.x, c.y);
    };
    const hexPx = HEX_FLAT_TO_FLAT_M * this.scale;
    const w = Math.max(9, Math.min(34, hexPx * 0.75));
    const h = Math.round(w * 0.62);

    // Movement lines: active moves solid-dashed, queued orders lighter.
    ctx.lineWidth = 2;
    for (const el of elements) {
      const colour = SIDE_COLOR[el.side];
      if (el.move) {
        ctx.strokeStyle = colour;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        const [x0, y0] = centre(el.hex);
        ctx.moveTo(x0, y0);
        for (let k = el.move.step + 1; k < el.move.path.length; k++) {
          const [x, y] = centre(el.move.path[k]!);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      const target = pendingTargets.get(el.id);
      if (target !== undefined) {
        ctx.strokeStyle = "#ffd23f";
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        const [x0, y0] = centre(el.hex);
        const [x1, y1] = centre(target);
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(x1, y1, Math.max(3, w * 0.2), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // Drone patrol areas (dashed rings), queued patrols in yellow.
    const ringPx = (this.forces.patrolRadiusHex + 0.5) * HEX_FLAT_TO_FLAT_M * this.scale;
    for (const el of elements) {
      const queued = this.forces.pendingPatrols.get(el.id);
      for (const [hex, colour, alpha] of [
        [el.patrol, SIDE_COLOR[el.side], el.id === selectedId ? 1 : 0.45],
        [queued ?? null, "#ffd23f", 1],
      ] as [number | null, string, number][]) {
        if (hex === null) continue;
        const [cx, cy] = centre(hex);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(cx, cy, ringPx, 0, Math.PI * 2);
        ctx.stroke();
        if (el.id === selectedId || colour === "#ffd23f") {
          const [x0, y0] = centre(el.hex);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(cx, cy);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }

    // Enemy contacts.
    if (this.forces.trackSide) {
      const colour = SIDE_COLOR[this.forces.trackSide];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const t of this.forces.tracks) {
        const [cx, cy] = centre(t.hex);
        const x = cx - w / 2;
        const y = cy - h / 2;
        ctx.lineWidth = 2;
        ctx.strokeStyle = colour;
        if (t.quality === TrackQuality.Suspected) {
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(6, w * 0.45), 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          if (w >= 16) {
            ctx.fillStyle = colour;
            ctx.font = `700 ${Math.max(9, Math.round(h * 0.7))}px system-ui, sans-serif`;
            ctx.fillText("?", cx, cy + 1);
          }
          continue;
        }
        ctx.fillStyle = colour;
        ctx.globalAlpha = t.quality === TrackQuality.Detected ? 0.25 : 0.75;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1.5;
        ctx.setLineDash(t.quality === TrackQuality.Detected ? [3, 2] : []);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        if (w >= 24) {
          ctx.fillStyle = "#ffffff";
          ctx.font = `600 ${Math.max(8, Math.round(h * 0.55))}px system-ui, sans-serif`;
          ctx.fillText(t.typeId ? ELEMENT_TYPES[t.typeId].abbr : "?", x + w / 2, y + h / 2 + 1);
        }
        if (t.quality === TrackQuality.Targetable) {
          // Crosshair corners: precise, current fix.
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          const g = 4;
          ctx.beginPath();
          for (const [px, py, dx, dy] of [[x - g, y - g, 1, 1], [x + w + g, y - g, -1, 1], [x - g, y + h + g, 1, -1], [x + w + g, y + h + g, -1, -1]] as const) {
            ctx.moveTo(px + dx * 6, py);
            ctx.lineTo(px, py);
            ctx.lineTo(px, py + dy * 6);
          }
          ctx.stroke();
        }
      }
    }

    // Destroyed elements: grey cross at their last position.
    ctx.lineWidth = 3;
    for (const d of this.forces.destroyed) {
      const [cx, cy] = centre(d.hex);
      const r = Math.max(4, w * 0.3);
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
      ctx.strokeStyle = "#9aa0a6";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.lineWidth = 3;
    }

    // Markers, stacked when several elements share a hex.
    const stackIndex = new Map<number, number>();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${Math.max(8, Math.round(h * 0.55))}px system-ui, sans-serif`;
    for (const el of elements) {
      const k = stackIndex.get(el.hex) ?? 0;
      stackIndex.set(el.hex, k + 1);
      const [cx, cy] = centre(el.hex);
      const x = cx - w / 2 + k * 3;
      const y = cy - h / 2 - k * 3;
      ctx.fillStyle = SIDE_COLOR[el.side];
      ctx.fillRect(x, y, w, h);
      const struck = this.forces.struckIds.has(el.id);
      ctx.lineWidth = el.id === selectedId ? 3 : struck ? 2.5 : 1.5;
      ctx.strokeStyle = el.id === selectedId ? "#ffd23f" : struck ? "#ff2d2d" : "#000000";
      ctx.strokeRect(x, y, w, h);
      // Strength bar: remaining personnel.
      if (w >= 14) {
        const frac = el.personnel / ELEMENT_TYPES[el.typeId].personnel;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(x, y + h + 1, w, 3);
        ctx.fillStyle = frac > 0.66 ? "#4cd964" : frac > 0.33 ? "#ffcc00" : "#ff3b30";
        ctx.fillRect(x, y + h + 1, w * frac, 3);
      }
      if (w >= 24) {
        ctx.fillStyle = "#ffffff";
        ctx.fillText(ELEMENT_TYPES[el.typeId].abbr, x + w / 2, y + h / 2 + 1);
      }
      this.markerRects.push({ id: el.id, x, y, w, h });
    }
  }

  private drawScaleBar(ctx: CanvasRenderingContext2D, h: number): void {
    const targetPx = 120;
    const metres = targetPx / this.scale;
    const steps = [100, 250, 500, 1000, 2000, 5000, 10000, 20000];
    const m = steps.find((v) => v >= metres * 0.6) ?? steps.at(-1)!;
    const px = m * this.scale;
    const x = 16;
    const y = h - 20;
    ctx.fillStyle = "rgba(16,18,20,0.75)";
    ctx.fillRect(x - 8, y - 22, px + 16 + 40, 34);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x, y);
    ctx.lineTo(x + px, y);
    ctx.lineTo(x + px, y - 6);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(m >= 1000 ? `${m / 1000} km` : `${m} m`, x + px + 8, y);
  }
}
