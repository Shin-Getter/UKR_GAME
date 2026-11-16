/**
 * Hex grid geometry. Pointy-top hexes, axial coordinates (q, r) for maths,
 * "odd-r" offset coordinates (col, row) for array storage.
 *
 * Scale: 250 m flat-to-flat, i.e. the distance between neighbouring hex
 * centres. For a pointy-top hex that makes the corner radius 250 / sqrt(3) m.
 */

export const HEX_FLAT_TO_FLAT_M = 250;
export const SQRT3 = Math.sqrt(3);
/** Centre-to-corner radius in metres. */
export const HEX_RADIUS_M = HEX_FLAT_TO_FLAT_M / SQRT3;
/** Vertical distance between hex rows in metres. */
export const HEX_ROW_SPACING_M = HEX_RADIUS_M * 1.5;

export interface Axial {
  q: number;
  r: number;
}

export interface Offset {
  col: number;
  row: number;
}

/** Neighbour directions in axial coordinates, clockwise from east. */
export const DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function axialToOffset(h: Axial): Offset {
  return { col: h.q + (h.r - (h.r & 1)) / 2, row: h.r };
}

export function offsetToAxial(o: Offset): Axial {
  return { q: o.col - (o.row - (o.row & 1)) / 2, r: o.row };
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function neighbors(h: Axial): Axial[] {
  return DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

/** Round fractional axial coordinates to the containing hex. */
export function axialRound(q: number, r: number): Axial {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  // Normalise -0 to 0 so equality checks behave.
  return { q: rq + 0, r: rr + 0 };
}

/** Hex centre in world metres (x east, y south). */
export function hexToWorld(h: Axial): { x: number; y: number } {
  return {
    x: HEX_RADIUS_M * SQRT3 * (h.q + h.r / 2),
    y: HEX_RADIUS_M * 1.5 * h.r,
  };
}

/** Hex containing a world point in metres. */
export function worldToHex(x: number, y: number): Axial {
  const q = ((SQRT3 / 3) * x - y / 3) / HEX_RADIUS_M;
  const r = ((2 / 3) * y) / HEX_RADIUS_M;
  return axialRound(q, r);
}

/** World-space corner points of a hex, starting at the top corner. */
export function hexCorners(h: Axial): { x: number; y: number }[] {
  const c = hexToWorld(h);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    out.push({ x: c.x + HEX_RADIUS_M * Math.cos(angle), y: c.y + HEX_RADIUS_M * Math.sin(angle) });
  }
  return out;
}

/** Hexes on the straight line from a to b, inclusive. Used for line of sight. */
export function hexLine(a: Axial, b: Axial): Axial[] {
  const n = hexDistance(a, b);
  if (n === 0) return [{ q: a.q, r: a.r }];
  // Nudge avoids ambiguous rounding exactly on hex edges.
  const aq = a.q + 1e-6;
  const ar = a.r + 1e-6;
  const bq = b.q + 1e-6;
  const br = b.r + 1e-6;
  const out: Axial[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(axialRound(aq + (bq - aq) * t, ar + (br - ar) * t));
  }
  return out;
}
