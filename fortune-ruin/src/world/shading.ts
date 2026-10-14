import { makeCanvas } from '../art/canvas';
import { TILE_INDEX } from '../art/tiles';
import { OWN_SHADOW, PROPS } from '../art/props';
import { BUILDING_BY_ID } from './maps/cityLayout';
import type { MapData } from './maps/types';

/**
 * Shadows laid on the floor, between the ground tiles and everything standing
 * on them. Light comes from the upper left, as in all the art.
 *
 * `ao` never changes: floors darken where they meet a wall, furniture sits in
 * a contact shadow, buildings in a strip of shade along their base.
 * `sun` holds what depends on daylight: the shadows buildings cast to the
 * east, and the patches of light that windows throw on indoor floors. The
 * scene fades it with the daylight.
 */
export interface ShadeLayers {
  ao: HTMLCanvasElement;
  sun: HTMLCanvasElement | null;
}

const INK = '16,10,28';

const WALL_TILES = new Set<number>(
  Object.entries(TILE_INDEX)
    .filter(([n]) => n.startsWith('wall_') || n === 'empty')
    .map(([, i]) => i),
);

export function isWallTile(index: number): boolean {
  return WALL_TILES.has(index);
}

function band(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: number): void {
  if (w <= 0 || h <= 0 || a <= 0) return;
  ctx.fillStyle = `rgba(${INK},${a})`;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Filled ellipse, row by row, so the edge stays on the pixel grid. */
function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, a: number): void {
  ctx.fillStyle = `rgba(${INK},${a})`;
  for (let y = -Math.floor(ry); y <= Math.floor(ry); y++) {
    const t = 1 - (y * y) / (ry * ry + 0.01);
    if (t <= 0) continue;
    const half = Math.round(rx * Math.sqrt(t));
    ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2, 1);
  }
}

export function buildShading(map: MapData): ShadeLayers {
  const W = map.w * 16;
  const H = map.h * 16;
  const { canvas: ao, ctx } = makeCanvas(W, H);
  const wall = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return !map.outdoor;
    const i = y * map.w + x;
    return WALL_TILES.has(map.ground[i]) || WALL_TILES.has(map.overlay[i]);
  };

  // 1. floors darken where they meet a wall
  if (!map.outdoor) {
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (wall(x, y)) continue;
        const px = x * 16;
        const py = y * 16;
        const up = wall(x, y - 1);
        const left = wall(x - 1, y);
        const right = wall(x + 1, y);
        if (up) [0.3, 0.2, 0.12, 0.06].forEach((a, k) => band(ctx, px, py + k, 16, 1, a));
        if (left) [0.22, 0.12, 0.05].forEach((a, k) => band(ctx, px + k, py + (up ? 4 : 0), 1, up ? 12 : 16, a));
        if (right) [0.1, 0.04].forEach((a, k) => band(ctx, px + 15 - k, py + (up ? 4 : 0), 1, up ? 12 : 16, a));
        if (!up && !left && wall(x - 1, y - 1)) {
          band(ctx, px, py, 3, 2, 0.12);
          band(ctx, px, py + 2, 1, 1, 0.08);
        }
      }
    }
  }

  // 2. furniture stands in a soft contact shadow (unless its art draws one)
  for (const p of map.props) {
    const d = PROPS[p.id];
    if (!d || d.ground || d.wall || d.overhead || OWN_SHADOW.has(p.id) || d.w < 6) continue;
    const imgX = p.x * 16 + (Math.max(1, d.foot.w) * 16 - d.w) / 2 + (p.ox ?? 0);
    const baseY = (p.y + 1) * 16 + (p.oy ?? 0) + (d.dy ?? 0);
    const deep = Math.max(1, d.foot.h);
    const rx = d.w / 2 + 1;
    const ry = Math.min(7, 2.5 + deep * 1.5);
    // offset toward the lower right, away from the light
    blob(ctx, imgX + d.w / 2 + 2, baseY - 1, rx, ry, 0.17);
    blob(ctx, imgX + d.w / 2 + 1, baseY - 1, rx - 2, Math.max(1.5, ry - 2.5), 0.1);
  }

  let sun: HTMLCanvasElement | null = null;
  let sunCtx: CanvasRenderingContext2D | null = null;
  const sunLayer = () => {
    if (!sunCtx) {
      const c = makeCanvas(W, H);
      sun = c.canvas;
      sunCtx = c.ctx;
    }
    return sunCtx;
  };

  // 3. daylight through the windows falls on the floor below, down and to the right
  if (!map.outdoor) {
    for (const p of map.props) {
      if (p.id !== 'window' && p.id !== 'window_tall') continue;
      const d = PROPS[p.id];
      let fy = p.y + 1;
      while (fy < map.h && wall(p.x, fy)) fy++;
      if (fy >= map.h) continue;
      const g = sunLayer();
      const x0 = p.x * 16 + (16 - d.w) / 2 + (p.ox ?? 0) + 3;
      const w = d.w - 6;
      const len = p.id === 'window_tall' ? 30 : 22;
      for (let k = 0; k < len; k++) {
        const a = k < len * 0.55 ? 0.11 : 0.06;
        g.fillStyle = `rgba(255,240,205,${a})`;
        g.fillRect(Math.round(x0 + k * 0.5), fy * 16 + k, w, 1);
      }
    }
  }

  // 4. buildings: shade along the base of the facade, and a shadow cast to the east
  if (map.outdoor && map.buildings.length) {
    const g = sunLayer();
    for (const id of map.buildings) {
      const b = BUILDING_BY_ID[id];
      if (!b) continue;
      const x0 = b.x * 16;
      const x1 = (b.x + b.w) * 16;
      const yb = (b.y + b.h) * 16;
      [0.24, 0.14, 0.07].forEach((a, k) => band(ctx, x0 + 1, yb + k, b.w * 16 - 1, 1, a));
      // cast shadow to the east: longer for taller buildings
      const tall = b.h + (b.extraHeight ?? 0);
      const len = Math.min(28, 8 + tall * 1.6);
      const top = b.y * 16 - (b.extraHeight ?? 0) * 16 + 8;
      // a parallelogram filled row by row, so its slanted edges stay crisp
      for (let y = Math.floor(top); y < yb + len * 0.35; y++) {
        const from = Math.max(0, (y - yb) / 0.35);
        const to = Math.min(len, (y - top) / 0.7);
        if (to > from) band(g, x1 + from, y, Math.ceil(to - from), 1, 0.22);
      }
    }
  }

  // shadows never fall on the walls themselves
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      if (!wall(x, y)) continue;
      ctx.clearRect(x * 16, y * 16, 16, 16);
      (sunCtx as CanvasRenderingContext2D | null)?.clearRect(x * 16, y * 16, 16, 16);
    }
  return { ao, sun };
}
