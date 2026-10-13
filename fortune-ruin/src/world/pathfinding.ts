import type { MapData } from './maps/types';

export interface Pt {
  x: number;
  y: number;
}

class Heap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, p: number): void {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
      [this.prio[i], this.prio[parent]] = [this.prio[parent], this.prio[i]];
      i = parent;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastI = this.items.pop()!;
    const lastP = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastI;
      this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        [this.items[i], this.items[m]] = [this.items[m], this.items[i]];
        [this.prio[i], this.prio[m]] = [this.prio[m], this.prio[i]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * 4-connected A*. The goal tile may be blocked (e.g. a seat or counter):
 * the path then ends on the closest walkable neighbour.
 */
export function findPath(map: MapData, sx: number, sy: number, tx: number, ty: number, preferWalkways = false, maxNodes = 12000): Pt[] | null {
  const { w, h } = map;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  if (!inside(sx, sy) || !inside(tx, ty)) return null;
  const blocked = (x: number, y: number) => map.blocked[y * w + x] === 1;
  let goalX = tx;
  let goalY = ty;
  if (blocked(tx, ty)) {
    let best: Pt | null = null;
    let bd = Infinity;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (!inside(nx, ny) || blocked(nx, ny)) continue;
      const d = Math.abs(nx - sx) + Math.abs(ny - sy);
      if (d < bd) {
        bd = d;
        best = { x: nx, y: ny };
      }
    }
    if (!best) return null;
    goalX = best.x;
    goalY = best.y;
  }
  const start = sy * w + sx;
  const goal = goalY * w + goalX;
  if (start === goal) return [{ x: goalX, y: goalY }];
  const g = new Float32Array(w * h).fill(Infinity);
  const came = new Int32Array(w * h).fill(-1);
  const open = new Heap();
  g[start] = 0;
  open.push(start, 0);
  let expanded = 0;
  const walk = map.walkways;
  while (open.size > 0 && expanded++ < maxNodes) {
    const cur = open.pop();
    if (cur === goal) break;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inside(nx, ny)) continue;
      const ni = ny * w + nx;
      if (map.blocked[ni] === 1 && ni !== goal) continue;
      const step = preferWalkways && walk && !walk[ni] ? 3 : 1;
      const ng = g[cur] + step;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        open.push(ni, ng + Math.abs(nx - goalX) + Math.abs(ny - goalY));
      }
    }
  }
  if (came[goal] === -1) return null;
  const out: Pt[] = [];
  let c = goal;
  while (c !== start && c !== -1) {
    out.push({ x: c % w, y: Math.floor(c / w) });
    c = came[c];
  }
  out.reverse();
  return out;
}

/** Random walkable tile, optionally restricted to walkways. */
export function randomWalkable(map: MapData, rnd: () => number, walkwaysOnly = false): Pt {
  for (let i = 0; i < 400; i++) {
    const x = Math.floor(rnd() * map.w);
    const y = Math.floor(rnd() * map.h);
    const idx = y * map.w + x;
    if (map.blocked[idx]) continue;
    if (walkwaysOnly && map.walkways && !map.walkways[idx]) continue;
    return { x, y };
  }
  return { x: 1, y: 1 };
}
