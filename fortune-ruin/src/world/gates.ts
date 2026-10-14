import type { MapData } from './maps/types';

type Pt = { x: number; y: number };

/** The player's feet hit-box, relative to the sprite's base point (pixels). */
export const FEET = { halfW: 4.5, top: 6, bottom: 1 };

/** Centre of the feet hit-box in tile units, where tile (x, y) is centred on (x, y). */
export function feetTile(px: number, py: number): Pt {
  return { x: px / 16 - 0.5, y: (py - (FEET.top + FEET.bottom) / 2) / 16 - 0.5 };
}

/**
 * Which side of a gate a sprite standing at (px, py) is on: the sign of its
 * offset from the gate's middle along the inside→outside axis.
 */
export function gateSide(g: { inside: Pt; outside: Pt }, px: number, py: number): 'inside' | 'outside' {
  const f = feetTile(px, py);
  const ax = g.outside.x - g.inside.x;
  const ay = g.outside.y - g.inside.y;
  const mx = (g.inside.x + g.outside.x) / 2;
  const my = (g.inside.y + g.outside.y) / 2;
  return (f.x - mx) * ax + (f.y - my) * ay < 0 ? 'inside' : 'outside';
}

/** Tiles reachable on foot from (x, y) (4-connected over unblocked tiles). */
export function reachable(map: MapData, x: number, y: number): Uint8Array {
  const seen = new Uint8Array(map.w * map.h);
  const free = (i: number, j: number) => i >= 0 && j >= 0 && i < map.w && j < map.h && map.blocked[j * map.w + i] === 0;
  if (!free(x, y)) return seen;
  const queue = [y * map.w + x];
  seen[queue[0]] = 1;
  while (queue.length) {
    const k = queue.pop()!;
    const i = k % map.w;
    const j = (k - i) / map.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + dx;
      const nj = j + dy;
      if (!free(ni, nj) || seen[nj * map.w + ni]) continue;
      seen[nj * map.w + ni] = 1;
      queue.push(nj * map.w + ni);
    }
  }
  return seen;
}
