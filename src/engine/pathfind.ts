/**
 * A* pathfinding on the hex grid. Step costs are the movement costs of the
 * element's mobility class; the movement mode adds a route preference
 * (infiltrators strongly avoid open ground, columns don't care).
 */
import { Mobility } from "../data/elements";
import { MOVE_MODE_DEFS, type MoveMode, ROAD_COST } from "../data/movement";
import { TERRAIN, type Terrain } from "../data/terrain";
import { HEX_FLAT_TO_FLAT_M, hexDistance, neighbors } from "./hex";
import type { HexMap } from "./map";
import { stepCostM } from "./movement";

/** Binary min-heap of [priority, value], ties broken by value for determinism. */
class Heap {
  private items: [number, number][] = [];
  get size(): number {
    return this.items.length;
  }
  private less(a: [number, number], b: [number, number]): boolean {
    return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  }
  push(p: number, v: number): void {
    const it = this.items;
    it.push([p, v]);
    let i = it.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(it[i]!, it[parent]!)) break;
      [it[i], it[parent]] = [it[parent]!, it[i]!];
      i = parent;
    }
  }
  pop(): number {
    const it = this.items;
    const top = it[0]!;
    const last = it.pop()!;
    if (it.length > 0) {
      it[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < it.length && this.less(it[l]!, it[m]!)) m = l;
        if (r < it.length && this.less(it[r]!, it[m]!)) m = r;
        if (m === i) break;
        [it[i], it[m]] = [it[m]!, it[i]!];
        i = m;
      }
    }
    return top[1];
  }
}

/** Route-choice cost of a step: movement cost scaled by the mode's aversion to exposed ground. */
export function routeCost(map: HexMap, a: number, b: number, mobility: Mobility, mode: MoveMode): number {
  const base = stepCostM(map, a, b, mobility);
  if (!Number.isFinite(base)) return Infinity;
  const conc = TERRAIN[map.terrain[b] as Terrain].concealment.value;
  return base * (1 + MOVE_MODE_DEFS[mode].exposureAversion * (1 - conc));
}

/** Cheapest path from start to goal (hex indices, inclusive), or null if unreachable. */
export function findPath(map: HexMap, start: number, goal: number, mobility: Mobility, mode: MoveMode): number[] | null {
  if (start === goal) return [start];
  const goalAx = map.axialOfIndex(goal);
  // Admissible heuristic: the cheapest possible step is along a road.
  const minStep = HEX_FLAT_TO_FLAT_M * Math.min(ROAD_COST[mobility].value, 1);
  const g = new Float64Array(map.size).fill(Infinity);
  const from = new Int32Array(map.size).fill(-1);
  const closed = new Uint8Array(map.size);
  const open = new Heap();
  g[start] = 0;
  open.push(hexDistance(map.axialOfIndex(start), goalAx) * minStep, start);
  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    for (const n of neighbors(map.axialOfIndex(cur))) {
      const ni = map.indexOfAxial(n);
      if (ni < 0 || closed[ni]) continue;
      const c = routeCost(map, cur, ni, mobility, mode);
      if (!Number.isFinite(c)) continue;
      const ng = g[cur]! + c;
      if (ng < g[ni]!) {
        g[ni] = ng;
        from[ni] = cur;
        open.push(ng + hexDistance(n, goalAx) * minStep, ni);
      }
    }
  }
  if (from[goal] === -1) return null;
  const path = [goal];
  for (let i = goal; i !== start; ) {
    i = from[i]!;
    path.push(i);
  }
  return path.reverse();
}
