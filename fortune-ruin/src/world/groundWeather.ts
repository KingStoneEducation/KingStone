import { hash2, makeCanvas } from '../art/canvas';
import { TILE_INDEX } from '../art/tiles';
import type { MapData } from './maps/types';

/**
 * What the weather leaves on the ground: snow lying (thick on grass and gardens, trodden
 * thinner on pavements, slush with the asphalt showing through in the wheel tracks on
 * the roads, none on the water), snow on the roofs, and the puddles that stand on paved
 * ground after rain.
 */
export type SnowKind = 'none' | 'soft' | 'packed' | 'slush';

const SOFT = /^(grass|garden|hedge|sand|rock)/;
const PACKED = /^(sidewalk|plaza|path|cobble|concrete|court|deck|dock|quay|curb)/;
const SLUSH = /^(road|crosswalk|parking)/;

/** How snow lies on a tile, by its name. */
export function snowKind(tile: string): SnowKind {
  if (SOFT.test(tile)) return 'soft';
  if (SLUSH.test(tile)) return 'slush';
  if (PACKED.test(tile)) return 'packed';
  return 'none';
}

/** Paved ground where rainwater stands (not on the wooden decks and piers, which drain). */
const PUDDLED = /^(sidewalk|plaza|path|cobble|concrete|court|road|crosswalk|parking)/;
/** The share of paved tiles with a puddle on them after rain. */
export const PUDDLE_ODDS = 0.06;

const NAME_BY_INDEX: string[] = [];
for (const [name, i] of Object.entries(TILE_INDEX)) NAME_BY_INDEX[i] = name;
const KIND_BY_INDEX: SnowKind[] = NAME_BY_INDEX.map((n) => snowKind(n ?? ''));

export function tileName(index: number): string {
  return NAME_BY_INDEX[index] ?? '';
}

export interface Puddle {
  /** centre, in world pixels */
  x: number;
  y: number;
  /** 0 small, 1 middling, 2 large */
  size: 0 | 1 | 2;
}

/** Where the puddles stand on a map after rain: always the same hollows in the paving. */
export function puddleSpots(map: MapData): Puddle[] {
  const out: Puddle[] = [];
  if (!map.outdoor) return out;
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (map.blocked[i] || !PUDDLED.test(tileName(map.ground[i]))) continue;
      if (hash2(x, y, 401) >= PUDDLE_ODDS) continue;
      const size = Math.min(2, Math.floor(hash2(x, y, 409) * 3)) as 0 | 1 | 2;
      out.push({ x: x * 16 + 8 + Math.round((hash2(x, y, 419) - 0.5) * 6), y: y * 16 + 9 + Math.round((hash2(x, y, 421) - 0.5) * 4), size });
    }
  }
  return out;
}

/** The same kind of hash as the art's, in integer arithmetic only (this runs for every pixel of a map). */
function hashi(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Soft value noise in 0..1: drifts and hollows rather than speckle. */
function vnoise(x: number, y: number, cell: number, seed: number): number {
  const fx = x / cell;
  const fy = y / cell;
  const gx = Math.floor(fx);
  const gy = Math.floor(fy);
  const sx = smooth(fx - gx);
  const sy = smooth(fy - gy);
  const a = hashi(gx, gy, seed);
  const b = hashi(gx + 1, gy, seed);
  const c = hashi(gx, gy + 1, seed);
  const d = hashi(gx + 1, gy + 1, seed);
  return a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy;
}

/**
 * The share of each kind of ground the first of the snow covers: grass whitens before the
 * pavements, the roads last of all (and never wholly).
 */
const FIRST: Record<Exclude<SnowKind, 'none'>, number> = { soft: 0.72, packed: 0.48, slush: 0.22 };

/** The colours of the snow (r, g, b, alpha), in the order of `S`. */
const SHADES: readonly (readonly [number, number, number, number])[] = [
  [238, 243, 250, 255], // soft
  [222, 230, 242, 255], // soft, in shadow
  [255, 255, 255, 255], // soft, catching the light
  [228, 234, 243, 245], // trodden
  [206, 215, 228, 245], // trodden, in shadow
  [196, 204, 216, 215], // slush
  [176, 186, 200, 215], // slush, darker
  [214, 220, 230, 215], // slush, lighter
  [150, 158, 172, 150], // thin slush, the asphalt showing
  [128, 136, 150, 95], // a wheel track
];
const S = { soft: 0, softShade: 1, softBright: 2, packed: 3, packedShade: 4, slush: 5, slushShade: 6, slushBright: 7, thin: 8, track: 9 } as const;
/** how much a drift lightens (or a hollow darkens) the snow: -LIFT..LIFT */
const LIFT = 7;
/** Every shade at every lift, as pixels ready to write (RGBA in memory order). */
const PIXELS = (() => {
  const out = new Uint32Array(SHADES.length * (LIFT * 2 + 1));
  const bytes = new Uint8ClampedArray(out.buffer);
  SHADES.forEach(([r, g, b, a], i) => {
    for (let l = -LIFT; l <= LIFT; l++) {
      const o = (i * (LIFT * 2 + 1) + l + LIFT) * 4;
      bytes[o] = r + l;
      bytes[o + 1] = g + l;
      bytes[o + 2] = b + (l >> 1);
      bytes[o + 3] = a;
    }
  });
  return out;
})();

export interface SnowLayers {
  /** the first snow: where it settles first */
  patch: HTMLCanvasElement;
  /** the rest, which fills in once it has been snowing a while */
  full: HTMLCanvasElement;
}

const snowCache = new Map<string, SnowLayers>();

/** The snow layers for a map, drawn the first time they are needed and kept (the ground never changes). */
export function snowFor(map: MapData): SnowLayers {
  const steps = snowSteps(map);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/**
 * The snow lying over a whole outdoor map, in two layers (see `FIRST`), drawn a few rows of
 * tiles at a time (it pauses after each few, so it can be spread over several frames), and
 * kept for the next time.
 */
export function* snowSteps(map: MapData): Generator<void, SnowLayers, void> {
  const cached = snowCache.get(map.id);
  if (cached) return cached;
  const W = map.w * 16;
  const H = map.h * 16;
  const a = makeCanvas(W, H);
  const b = makeCanvas(W, H);
  const pa = a.ctx.createImageData(W, H);
  const pb = b.ctx.createImageData(W, H);
  const da = new Uint32Array(pa.data.buffer);
  const db = new Uint32Array(pb.data.buffer);
  const kind = (x: number, y: number): SnowKind => (x < 0 || y < 0 || x >= map.w || y >= map.h ? 'none' : KIND_BY_INDEX[map.ground[y * map.w + x]] ?? 'none');
  // how far each stretch of road runs across and down, to tell which way the traffic goes
  const across = new Uint16Array(map.w * map.h);
  const down = new Uint16Array(map.w * map.h);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; ) {
      let e = x;
      while (e < map.w && kind(e, y) === 'slush') e++;
      for (let k = x; k < e; k++) across[y * map.w + k] = e - x;
      x = e === x ? x + 1 : e;
    }
  }
  for (let x = 0; x < map.w; x++) {
    for (let y = 0; y < map.h; ) {
      let e = y;
      while (e < map.h && kind(x, e) === 'slush') e++;
      for (let k = y; k < e; k++) down[k * map.w + x] = e - y;
      y = e === y ? y + 1 : e;
    }
  }
  const drift = new Float32Array(64);
  const thick = new Uint8Array(64);
  const wander = new Int8Array(4);
  const SPAN = LIFT * 2 + 1;
  for (let ty = 0; ty < map.h; ty++) {
    if (ty % 3 === 2) yield;
    for (let tx = 0; tx < map.w; tx++) {
      const k = kind(tx, ty);
      if (k === 'none') continue;
      const first = FIRST[k];
      const bareN = kind(tx, ty - 1) === 'none';
      const bareS = kind(tx, ty + 1) === 'none';
      const bareW = kind(tx - 1, ty) === 'none';
      const bareE = kind(tx + 1, ty) === 'none';
      // which way the traffic runs over a road tile, for the wheel tracks (none at the junctions)
      let tracks = 0;
      if (k === 'slush') {
        const h = across[ty * map.w + tx];
        const v = down[ty * map.w + tx];
        tracks = h >= 4 && h > v * 1.5 ? 1 : v >= 4 && v > h * 1.5 ? 2 : 0;
        for (let q = 0; q < 4; q++) wander[q] = Math.floor(vnoise(tracks === 1 ? tx * 16 + q * 4 : ty * 16 + q * 4, tracks === 1 ? ty : tx, 37, 557) * 2);
      }
      // the drifts and the slush's thickness vary smoothly, so they are worked out for every other pixel
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          const x = tx * 16 + i * 2;
          const y = ty * 16 + j * 2;
          drift[j * 8 + i] = 0.65 * vnoise(x, y, 13, 509) + 0.35 * vnoise(x, y, 5, 521);
          if (k === 'slush') thick[j * 8 + i] = vnoise(x, y, 7, 523) > 0.62 ? 1 : 0;
        }
      }
      for (let ly = 0; ly < 16; ly++) {
        const y = ty * 16 + ly;
        for (let lx = 0; lx < 16; lx++) {
          const x = tx * 16 + lx;
          const r = hashi(x, y, 503);
          // a ragged edge where the snow meets the water
          let edge = 9;
          if (bareN && ly < edge) edge = ly;
          if (bareS && 15 - ly < edge) edge = 15 - ly;
          if (bareW && lx < edge) edge = lx;
          if (bareE && 15 - lx < edge) edge = 15 - lx;
          if (edge < 3 && r < ((3 - edge) / 3) * 0.85) continue;
          const cell = (ly >> 1) * 8 + (lx >> 1);
          const n = drift[cell];
          let shade: number;
          if (k === 'soft') shade = r < 0.1 ? S.softShade : r > 0.965 ? S.softBright : S.soft;
          else if (k === 'packed') shade = r < 0.16 ? S.packedShade : S.packed;
          else {
            // the traffic keeps the roads to a grey slush, thin enough in places for the asphalt to show
            shade = thick[cell] ? S.thin : r < 0.25 ? S.slushShade : r > 0.9 ? S.slushBright : S.slush;
            if (tracks) {
              // two pairs of wheel tracks along each lane, wandering a little
              const t = (tracks === 1 ? ly : lx) - wander[(tracks === 1 ? lx : ly) >> 2];
              if (t === 3 || t === 4 || t === 11 || t === 12) shade = S.track;
            }
          }
          // drifts a shade brighter, hollows a shade bluer
          const lift = Math.round((n - 0.5) * 14);
          (n < first ? da : db)[y * W + x] = PIXELS[shade * SPAN + lift + LIFT];
        }
      }
    }
  }
  a.ctx.putImageData(pa, 0, 0);
  b.ctx.putImageData(pb, 0, 0);
  const layers = { patch: a.canvas, full: b.canvas };
  snowCache.set(map.id, layers);
  return layers;
}

/**
 * A building's roof under snow: the roof as drawn, whitened but keeping its light and
 * shade (so the parapets, plant rooms and skylights still show through), and a lip of
 * snow along the cornice below it.
 */
export function snowRoof(src: CanvasImageSource, sx: number, sy: number, w: number, roofH: number): HTMLCanvasElement {
  const lip = 2;
  const h = roofH + lip;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.drawImage(src, sx, sy, w, h, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < w * roofH * 4; i += 4) {
    if (d[i + 3] < 8) continue;
    sum += (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
    n++;
  }
  const mean = n ? sum / n : 0.5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (d[o + 3] < 8) continue;
      if (y >= roofH && hash2(x, y, 541) < (y - roofH + 1) * 0.35) {
        d[o + 3] = 0;
        continue;
      }
      const l = (0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2]) / 255;
      const k = Math.max(0.62, Math.min(1.04, 0.86 + (l - mean) * 0.7)) + (hash2(x, y, 547) < 0.08 ? -0.04 : 0);
      d[o] = Math.min(255, Math.round(236 * k * 0.88 + d[o] * 0.12));
      d[o + 1] = Math.min(255, Math.round(242 * k * 0.88 + d[o + 1] * 0.12));
      d[o + 2] = Math.min(255, Math.round(252 * k * 0.88 + d[o + 2] * 0.12));
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
