/**
 * Half-body portraits for conversations, the phone and the relationship page.
 *
 * 64 × 80 pixels, built from the same look data as the walking sprite (skin,
 * hair style and colour, clothes, accessories) plus a FaceSpec that gives each
 * character their own eyes, brows, nose, jaw, age and resting expression.
 * Shapes are rasterised on the pixel grid, shaded in flat steps with the light
 * from the upper left and finished with a coloured outline, so the result is
 * plain pixel art when shown at 2× or 3×: no smoothing, no filters.
 */
import { P } from './palette';
import { hexToRgb, mix, shade } from './canvas';
import type { CharacterLook } from '../data/npcs';

export const PORTRAIT_W = 64;
export const PORTRAIT_H = 80;
const W = PORTRAIT_W;
const H = PORTRAIT_H;
/** vertical centre line of the face, between pixel columns 31 and 32 */
const CX = 32;

export type Expression = 'neutral' | 'smile' | 'grin' | 'smirk' | 'frown' | 'sad' | 'worried' | 'surprised' | 'angry';
export const EXPRESSIONS: Expression[] = ['neutral', 'smile', 'grin', 'smirk', 'frown', 'sad', 'worried', 'surprised', 'angry'];

export interface FaceSpec {
  eyes: 'round' | 'almond' | 'narrow' | 'droopy';
  eyeColor: string;
  brows: 'thin' | 'normal' | 'thick' | 'arched';
  nose: 'small' | 'button' | 'straight' | 'long';
  jaw: 'soft' | 'round' | 'square' | 'narrow';
  age: number;
  /** lipstick; natural lips when absent */
  lips?: string;
  lashes?: boolean;
  freckles?: boolean;
  blush?: boolean;
  mole?: 'cheek' | 'lip' | null;
  beard?: 'full' | 'short' | 'goatee' | 'stubble';
  /** frame colour */
  glasses?: string;
  earrings?: 'stud' | 'hoop';
  eyeshadow?: string;
  /** what the face does when nothing in particular is going on */
  rest?: Expression;
}

export interface PortraitOpts {
  expr?: Expression;
  blink?: boolean;
  /** mouth open mid-sentence */
  talk?: boolean;
  /** backdrop colour; transparent when absent */
  bg?: string | null;
}

// ------------------------------------------------------------------ raster helpers

type Pt = [number, number];

function inPoly(pts: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** One bit per pixel; shapes are tested at pixel centres. */
class Mask {
  readonly a = new Uint8Array(W * H);
  has(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < W && y < H && this.a[y * W + x] === 1;
  }
  on(x: number, y: number): void {
    if (x >= 0 && y >= 0 && x < W && y < H) this.a[y * W + x] = 1;
  }
  where(f: (x: number, y: number) => boolean): this {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (f(x + 0.5, y + 0.5)) this.a[y * W + x] = 1;
    return this;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number): this {
    return this.where((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  }
  poly(pts: Pt[]): this {
    return this.where((x, y) => inPoly(pts, x, y));
  }
  /** Polygon given as its right half in (dx, y), mirrored about the centre line. */
  sym(half: Pt[]): this {
    const right = half.map(([dx, y]) => [CX + dx, y] as Pt);
    const left = half
      .slice()
      .reverse()
      .map(([dx, y]) => [CX - dx, y] as Pt);
    return this.poly([...right, ...left]);
  }
  /** Same shape on both sides: a polygon in (dx, y) for the right side plus its mirror. */
  pair(side: Pt[]): this {
    this.poly(side.map(([dx, y]) => [CX + dx, y] as Pt));
    return this.poly(side.map(([dx, y]) => [CX - dx, y] as Pt));
  }
  add(m: Mask): this {
    for (let i = 0; i < this.a.length; i++) this.a[i] |= m.a[i];
    return this;
  }
  cut(m: Mask): this {
    for (let i = 0; i < this.a.length; i++) if (m.a[i]) this.a[i] = 0;
    return this;
  }
  keep(m: Mask): this {
    for (let i = 0; i < this.a.length; i++) this.a[i] &= m.a[i];
    return this;
  }
  clone(): Mask {
    const m = new Mask();
    m.a.set(this.a);
    return m;
  }
  each(f: (x: number, y: number) => void): void {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.a[y * W + x]) f(x, y);
  }
  /** steps (1..max) until leaving the shape in direction (dx, dy); max + 1 when still inside */
  run(x: number, y: number, dx: number, dy: number, max: number): number {
    for (let i = 1; i <= max; i++) if (!this.has(x + dx * i, y + dy * i)) return i;
    return max + 1;
  }
}

const T = { none: 0, back: 1, neck: 2, body: 3, ear: 4, skin: 5, feat: 6, hair: 7, hat: 8, acc: 9 } as const;

class Buf {
  readonly c: (string | null)[] = new Array<string | null>(W * H).fill(null);
  readonly t = new Uint8Array(W * H);
  get(x: number, y: number): string | null {
    return x >= 0 && y >= 0 && x < W && y < H ? this.c[y * W + x] : null;
  }
  tag(x: number, y: number): number {
    return x >= 0 && y >= 0 && x < W && y < H ? this.t[y * W + x] : T.none;
  }
  put(x: number, y: number, col: string | null, tag: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    this.c[i] = col;
    this.t[i] = col ? tag : T.none;
  }
  fill(m: Mask, col: string | ((x: number, y: number) => string | null), tag: number): void {
    m.each((x, y) => {
      const c = typeof col === 'string' ? col : col(x, y);
      if (c) this.put(x, y, c, tag);
    });
  }
  /** Paint a small pixel template; '.' and ' ' leave the pixel alone. */
  stamp(x0: number, y0: number, rows: string[], pal: Record<string, string>, tag: number): void {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = pal[row[i]];
        if (c) this.put(x0 + i, y0 + j, c, tag);
      }
    });
  }
}

function line(x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => void): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    f(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Quadratic curve through (x0,y0) → control → (x2,y2), visited pixel by pixel. */
function curve(p0: Pt, c: Pt, p2: Pt, f: (x: number, y: number) => void): void {
  let prev: Pt | null = null;
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p2[0];
    const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p2[1];
    if (prev) line(prev[0], prev[1], x, y, f);
    prev = [x, y];
  }
}

// ------------------------------------------------------------------ colour

function lum(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function sat(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}

interface Ramp {
  hi: string;
  mid: string;
  sh: string;
  dk: string;
}

function ramp(base: string, shadow?: string): Ramp {
  const l = lum(base);
  if (l < 0.13) {
    // very dark cloth or hair: lift the highlight so the form still reads
    return { hi: mix(base, '#8a8aa6', 0.22), mid: base, sh: shadow ?? shade(base, -0.3), dk: mix(base, '#000000', 0.45) };
  }
  if (l > 0.8) return { hi: shade(base, 0.35), mid: base, sh: shadow ?? shade(base, -0.13), dk: shade(base, -0.27) };
  return { hi: shade(base, 0.16), mid: base, sh: shadow ?? shade(base, -0.2), dk: shade(shadow ?? shade(base, -0.2), -0.24) };
}

function outlineOf(c: string): string {
  return mix(shade(c, -0.62), '#1a0f18', 0.38);
}

function isGold(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return r > 180 && g > 140 && b < 150 && r - b > 70;
}

// ------------------------------------------------------------------ head geometry

interface Geo {
  fem: boolean;
  /** half width of the face at the cheekbones */
  R: number;
  chin: number;
  chinHalf: number;
  k: number;
  /** half width of the neck */
  NW: number;
  /** row where the neck meets the chest */
  neckBase: number;
}

function geometry(look: CharacterLook, face: FaceSpec): Geo {
  const fem = look.body === 'f';
  const jaw = {
    soft: { k: 1.7, chinHalf: 3.4 },
    round: { k: 2.3, chinHalf: 4.2 },
    square: { k: 3.2, chinHalf: 5.4 },
    narrow: { k: 1.35, chinHalf: 2.8 },
  }[face.jaw];
  return { fem, R: fem ? 11.6 : 12.3, chin: 47, chinHalf: jaw.chinHalf + (fem ? 0 : 0.4), k: jaw.k, NW: fem ? 5.2 : 6.3, neckBase: fem ? 52 : 51.5 };
}

/** half width of the head at row-centre y */
function hw(g: Geo, y: number): number {
  if (y <= 30) return g.R * Math.sqrt(Math.max(0, 1 - ((30 - y) / 18) ** 2));
  if (y <= 34) return g.R;
  const t = Math.min(1, (y - 34) / (g.chin - 34));
  return g.R - (g.R - g.chinHalf) * Math.pow(t, g.k);
}

function faceMask(g: Geo): Mask {
  return new Mask().where((x, y) => y >= 12 && y <= g.chin && Math.abs(x - CX) <= hw(g, y));
}

// ------------------------------------------------------------------ hair shapes

interface HairShape {
  back: Mask;
  front: Mask;
  /** extra front pieces drawn after the main front (buns, ponytails, loose strands) */
  extra: Mask;
  curly: boolean;
  buzz: boolean;
  strands: Pt[][];
  /** hair tie colour for tails, if any */
  tie?: { mask: Mask; color: string };
}

function hairShape(style: number, g: Geo): HairShape {
  const R = g.R;
  const cap = (v: number) => new Mask().ellipse(CX, 27, R + v, 15.5 + v);
  const below = (f: (dx: number) => number) => new Mask().where((x, y) => y < f(x - CX));
  const temple = (dx: number, inner: number, y: number) => (Math.abs(dx) > R - inner ? y : 0);
  const none = new Mask();
  const empty: HairShape = { back: none, front: new Mask(), extra: new Mask(), curly: false, buzz: false, strands: [] };
  // fan of strands from a parting point down to the hairline
  const fan = (px: number, ends: number[], y1: number, bend: number): Pt[][] =>
    ends.map((ex) => [
      [px, 13] as Pt,
      [px + (ex - px) * 0.5 + bend, 15] as Pt,
      [ex, y1] as Pt,
    ]);
  const longBack = (wave: number) =>
    new Mask()
      .ellipse(CX, 27, R + 3.6, 17)
      .add(new Mask().where((x, y) => y >= 27 && y < 72 - Math.abs(x - CX) * 0.25 && Math.abs(x - CX) <= R + 3.4 + Math.sin(y / 2.6) * wave));
  const longLocks = (wave: number, bulge: number) =>
    new Mask().where((x, y) => {
      const dx = Math.abs(x - CX);
      const sway = Math.sin(y / 2.6 + (x < CX ? 0 : 1.3)) * wave;
      if (y < 21 || y > 70) return false;
      if (y < 44) {
        const inner = y < 30 ? R - 2.2 : Math.max(hw(g, y) - 1.6, R - 3.5);
        return dx >= inner + sway * 0.3 && dx <= R + 2.8 + bulge + sway;
      }
      // past the jaw the locks fall in front of the shoulders
      const t = (y - 44) / 26;
      const inner = 9.2 + t * 2 + sway * 0.5;
      const outer = R + 3 + bulge - t * 3.4 + sway;
      const tip = y > 64 ? (y - 64) * 0.9 : 0;
      return dx >= inner + tip * 0.5 && dx <= outer - tip;
    });
  switch (style) {
    case 0: {
      // short, messy fringe
      const front = cap(1.6).keep(below((dx) => Math.max(21.6 + [2, 0.6, 0, 1.4, 0.2][Math.floor(dx + 40) % 5] + dx * 0.08, temple(dx, 2.2, 30.5))));
      return { ...empty, back: cap(1.6), front, strands: fan(CX - 2, [CX - 9, CX - 4, CX + 2, CX + 7, CX + 11], 22, 1) };
    }
    case 1: {
      // side parting, sweeping across to the right
      const part = -4;
      const front = cap(1.9).keep(below((dx) => Math.max(dx < part ? 19.2 + (part - dx) * 0.18 : 19.4 + (dx - part) * 0.44, temple(dx, 2.2, 30))));
      return { ...empty, back: cap(1.9), front, strands: fan(CX + part, [CX + part - 6, CX + 1, CX + 5, CX + 9, CX + 12], 24, -1) };
    }
    case 2: {
      // long and straight, centre parting
      const front = cap(1.4)
        .keep(below((dx) => Math.max(18.6 + Math.abs(dx) * 0.64, temple(dx, 2.4, 27))))
        .add(longLocks(0, 0));
      const strands: Pt[][] = [...fan(CX, [CX - 8, CX - 4, CX + 4, CX + 8], 24, 0)];
      for (const s of [-1, 1]) for (const o of [R + 0.2, R + 1.8]) strands.push([[CX + s * o, 24], [CX + s * (o + 0.6), 44], [CX + s * (o - 1.4), 64]]);
      return { ...empty, back: longBack(0), front, strands };
    }
    case 3: {
      // bob with blunt bangs
      const front = cap(2)
        .keep(below((dx) => Math.max(Math.abs(dx) > R - 2.6 ? 27 : 24.4, temple(dx, 2.2, 28))))
        .add(
          new Mask().pair([
            [R - 2.3, 22],
            [R + 3.1, 22],
            [R + 3.5, 34],
            [R + 2.6, 42],
            [R + 0.6, 45.6],
            [R - 2.6, 46.4],
            [R - 3.6, 44.2],
            [R - 2.2, 36],
          ]),
        );
      return { ...empty, back: cap(2).add(new Mask().ellipse(CX, 30, R + 3.4, 16.5)), front, strands: fan(CX, [CX - 10, CX - 5, CX, CX + 5, CX + 10], 24, 0) };
    }
    case 4: {
      // pulled back into a low ponytail over the right shoulder
      const front = cap(1.2)
        .keep(below((dx) => Math.max(19 + Math.max(0, dx) * 0.08, temple(dx, 2, 28))))
        .add(
          new Mask().poly(
            (
              [
                [R - 2.5, 21],
                [R + 0.9, 21],
                [R + 1.5, 30],
                [R + 0.7, 40],
                [R - 0.6, 41.6],
                [R - 1.5, 36],
                [R - 2.3, 28],
              ] as Pt[]
            ).map(([dx, y]) => [CX + dx, y] as Pt),
          ),
        );
      const extra = new Mask().poly(
        (
          [
            [9, 45],
            [14.2, 45.6],
            [16.9, 52],
            [17.3, 60],
            [15.7, 68],
            [13.2, 72.5],
            [12.5, 66],
            [12.1, 58],
            [10.4, 51],
          ] as Pt[]
        ).map(([dx, y]) => [CX + dx, y] as Pt),
      );
      const tie = new Mask().where((x, y) => x - CX >= 9.6 && x - CX <= 14.2 && y >= 45.2 && y <= 47.2);
      const strands: Pt[][] = [
        [[CX - 8, 20], [CX - 3, 13], [CX + 4, 14]],
        [[CX - 2, 19.5], [CX + 2, 13], [CX + 8, 15]],
        [[CX + 11, 47], [CX + 15, 56], [CX + 14, 68]],
        [[CX + 13, 47], [CX + 16.5, 55], [CX + 15.5, 64]],
      ];
      return { ...empty, back: cap(1.2), front, extra, strands, tie: { mask: tie, color: '#c8a24a' } };
    }
    case 5: {
      // bun on top, a few loose strands at the temples
      const front = cap(1).keep(below((dx) => Math.max(18.6 + Math.abs(dx) * 0.2, temple(dx, 2, 29))));
      const extra = new Mask().ellipse(CX, 11.4, 6.8, 5.4);
      const strands: Pt[][] = [
        [[CX - 7, 19], [CX - 3, 13.5], [CX, 13]],
        [[CX + 7, 19], [CX + 3, 13.5], [CX, 13]],
        [[CX - 4, 9], [CX, 7.5], [CX + 4, 10]],
      ];
      return { ...empty, back: cap(1), front, extra, strands };
    }
    case 6: {
      // full, springy curls
      const bumpy = (cy: number, rx: number, ry: number, n: number, amp: number) =>
        new Mask().where((x, y) => {
          const a = Math.atan2(y - cy, x - CX);
          return ((x - CX) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 + amp * Math.sin(a * n);
        });
      const front = bumpy(25, R + 4.2, 15.5, 11, 0.07).keep(below((dx) => Math.max(21.6 + 1.6 * Math.abs(Math.sin(dx * 0.85)), temple(dx, 2.6, 33))));
      return { ...empty, back: bumpy(26, R + 5.6, 18.5, 11, 0.07).keep(new Mask().where((_, y) => y < 47)), front, curly: true };
    }
    case 7: {
      // slicked back
      const front = cap(1.3).keep(below((dx) => Math.max(18.3 + (Math.abs(dx) < 1.7 ? 1.3 : 0) + Math.abs(dx) * 0.08, temple(dx, 2, 27.5))));
      const strands: Pt[][] = [];
      for (const ox of [-9, -5, -1, 3, 7, 10]) strands.push([[CX + ox, 19], [CX + ox * 0.9, 14], [CX + ox * 0.55, 11.5]]);
      return { ...empty, back: cap(1.3), front, strands };
    }
    case 8: {
      // buzz cut
      const front = cap(0.5).keep(below((dx) => Math.max(19.8 + Math.abs(dx) * 0.05, temple(dx, 1.8, 28))));
      return { ...empty, back: cap(0.5), front, buzz: true };
    }
    case 9: {
      // long waves with a side parting
      const front = cap(1.8)
        .keep(below((dx) => Math.max(18.6 + Math.abs(dx + 3) * 0.6, temple(dx, 2.4, 27))))
        .add(longLocks(1.1, 0.6));
      const strands: Pt[][] = [...fan(CX - 3, [CX - 9, CX - 5, CX + 2, CX + 7], 24, 0)];
      for (const s of [-1, 1]) for (const o of [R + 0.4, R + 2.2]) strands.push([[CX + s * o, 26], [CX + s * (o + 1.6), 40], [CX + s * (o - 1), 52]], [[CX + s * (o - 1), 52], [CX + s * (o - 3), 60], [CX + s * (o - 2), 66]]);
      return { ...empty, back: longBack(1.1), front, strands };
    }
    case 10:
      return { ...empty, buzz: true };
    case 11:
    default: {
      // long curls
      const front = cap(2.6)
        .keep(below((dx) => Math.max(19.2 + Math.abs(dx) * 0.5 + Math.abs(Math.sin(dx * 0.7)) * 1.2, temple(dx, 2.6, 28))))
        .add(longLocks(1.5, 1.6));
      return { ...empty, back: longBack(1.6), front, curly: true };
    }
  }
}

// ------------------------------------------------------------------ the portrait

interface Pal {
  skin: Ramp & { deep: string; blush: string };
  hair: Ramp & { sheen: string };
  brow: string;
  lashes: string;
  lip: string;
  lipLine: string;
}

function palette(look: CharacterLook, face: FaceSpec): Pal {
  const base = P.skin[Math.max(0, Math.min(P.skin.length - 1, look.skin))];
  const dark = look.skin >= 4;
  const skin = {
    hi: shade(base, dark ? 0.15 : 0.12),
    mid: base,
    sh: shade(base, -0.13),
    dk: shade(base, -0.26),
    deep: shade(base, -0.42),
    blush: mix(base, '#e8606e', dark ? 0.22 : 0.32),
  };
  const hc = look.hairColor;
  const hl = lum(hc);
  const hair = {
    hi: hl < 0.16 ? mix(hc, '#7a7896', 0.32) : shade(hc, 0.22),
    sheen: hl < 0.16 ? mix(hc, '#a4a2bc', 0.42) : shade(hc, 0.42),
    mid: hc,
    sh: shade(hc, hl > 0.6 ? -0.2 : -0.26),
    dk: shade(hc, hl > 0.6 ? -0.36 : -0.46),
  };
  const lip = face.lips ?? mix(base, '#b0484e', dark ? 0.3 : 0.4);
  return {
    skin,
    hair,
    brow: hl > 0.55 ? shade(hc, -0.38) : shade(hc, -0.4),
    lashes: mix(shade(hc, -0.6), '#1a1016', 0.55),
    lip,
    lipLine: face.lips ? shade(face.lips, -0.38) : mix(shade(base, -0.48), '#5a1a26', 0.35),
  };
}

const EYE_W = { round: 5, almond: 6, narrow: 6, droopy: 6 } as const;
const EYE_H = { round: 3, almond: 2, narrow: 2, droopy: 2 } as const;

type EyeMode = 'open' | 'happy' | 'arc' | 'closed' | 'wide' | 'sad' | 'angry' | 'narrowed';

function eyeMode(expr: Expression, blink: boolean): EyeMode {
  if (blink) return 'closed';
  switch (expr) {
    case 'smile':
      return 'happy';
    case 'grin':
      return 'arc';
    case 'surprised':
      return 'wide';
    case 'sad':
    case 'worried':
      return 'sad';
    case 'angry':
      return 'angry';
    case 'frown':
      return 'narrowed';
    default:
      return 'open';
  }
}

/**
 * The left eye (viewer's left, outer corner on the left) as a character grid;
 * the right eye is its mirror image.
 * L lash line · W white · w white in the lid's shadow · I iris · i lit iris ·
 * D pupil · H highlight · S skin shadow · K eyeshadow
 */
export function eyeGrid(face: FaceSpec, mode: EyeMode, fem: boolean): { rows: string[]; top: number } {
  const w = EYE_W[face.eyes];
  let h: number = EYE_H[face.eyes];
  if (mode === 'wide') h += 1;
  if (mode === 'narrowed' && h > 1) h -= 1;
  const cols = w + 2;
  const grid: string[][] = [];
  const rowsN = h + 3;
  for (let r = 0; r < rowsN; r++) grid.push(new Array(cols).fill('.'));
  // column 0 is room for a lash flick, the eye itself spans 1..w
  const c0 = 1;
  const c1 = w;
  const top = 0; // lid row index inside the grid
  if (mode === 'closed' || mode === 'arc') {
    const mid = top + Math.max(1, Math.ceil(h / 2));
    if (mode === 'closed') {
      for (let c = c0; c <= c1; c++) grid[mid][c] = 'L';
      grid[mid + 1][c0] = 'L';
      for (let c = c0 + 1; c < c1; c++) grid[mid + 1][c] = 'S';
    } else {
      grid[mid + 1][c0] = 'L';
      grid[mid][c0 + 1] = 'L';
      for (let c = c0 + 2; c <= c1 - 1; c++) grid[mid - 1][c] = 'L';
      grid[mid][c1] = 'L';
      for (let c = c0 + 1; c < c1; c++) grid[mid + 1][c] = 'S';
    }
    if (fem || face.lashes) grid[mid][0] = 'L';
    return { rows: grid.map((r) => r.join('')), top: -1 };
  }
  // opening rows
  const open: [number, number, number][] = [];
  for (let r = 0; r < h; r++) {
    let a = c0;
    let b = c1;
    if (h >= 3 && (r === 0 || r === h - 1)) {
      a += 1;
      b -= 1;
    }
    open.push([top + 1 + r, a, b]);
  }
  // upper lid
  for (let c = c0 + (h >= 3 ? 1 : 0); c <= c1; c++) grid[top][c] = 'L';
  const ir = Math.floor((c0 + c1) / 2) + (w === 5 ? 0 : 1);
  const irisW = face.eyes === 'narrow' ? 2 : 3;
  const ia = ir - 1;
  const ib = irisW === 3 ? ir + 1 : ir;
  for (const [row, a, b] of open) {
    for (let c = a; c <= b; c++) {
      const isIris = c >= ia && c <= ib && !(mode === 'wide' && (row === top + 1 || row === top + h) && c !== ir);
      if (isIris) grid[row][c] = row === top + h && h > 1 ? 'i' : 'I';
      else grid[row][c] = row === top + 1 ? 'w' : 'W';
      if (c === a && row === top + 1 && h < 3) grid[row][c] = 'L';
    }
  }
  // pupil and highlight
  for (const [row] of open) if (grid[row][ir] === 'I' || grid[row][ir] === 'i') grid[row][ir] = 'D';
  const hr = top + 1;
  if (grid[hr][ia] === 'I' || grid[hr][ia] === 'D') grid[hr][ia] = 'H';
  else if (grid[hr][ir] === 'D') grid[hr][ir] = 'H';
  // lid tilt for moods
  if (mode === 'sad' || face.eyes === 'droopy') grid[top + 1][c0 + 1] = 'L';
  if (face.eyes === 'narrow' && h >= 2) {
    // a heavy lid: only the middle of the top row stays open
    grid[top + 1][c0 + 1] = 'L';
    grid[top + 1][c1] = 'L';
  }
  if (mode === 'angry') {
    grid[top + 1][c1] = 'L';
    grid[top + 1][c1 - 1] = 'L';
  }
  // lower lid
  const low = top + h + 1;
  if (mode === 'happy') {
    // cheeks push the lower lid up
    const last = open[open.length - 1];
    if (open.length > 1) for (let c = last[1]; c <= last[2]; c++) grid[last[0]][c] = 'S';
    for (let c = c0 + 1; c < c1; c++) grid[low][c] = 'S';
    grid[low][c0] = 'S';
  } else {
    for (let c = c0 + 1; c < c1; c++) grid[low][c] = 'S';
  }
  // lashes and crease
  if (fem || face.lashes) {
    grid[top][0] = 'L';
    grid[top][c0] = 'L';
  }
  return { rows: grid.map((r) => r.join('')), top: 0 };
}

function mirrorRows(rows: string[]): string[] {
  return rows.map((r) => r.split('').reverse().join(''));
}

function drawEyes(buf: Buf, g: Geo, face: FaceSpec, pal: Pal, expr: Expression, blink: boolean): void {
  const mode = eyeMode(expr, blink);
  const { rows } = eyeGrid(face, mode, g.fem);
  const w = EYE_W[face.eyes];
  const lidY = face.eyes === 'round' ? 28 : 29;
  // grid column 0 sits one left of the outer corner
  const iris = face.eyeColor;
  const pal2: Record<string, string> = {
    L: pal.lashes,
    W: '#f3eee6',
    w: mix('#f3eee6', pal.skin.sh, 0.45),
    I: iris,
    i: shade(iris, 0.22),
    D: shade(iris, -0.55),
    H: '#ffffff',
    S: pal.skin.sh,
    K: face.eyeshadow ?? pal.skin.sh,
  };
  const ox = w === 5 ? 23 : 22;
  buf.stamp(ox, lidY, rows, pal2, T.feat);
  // the other eye: mirror; a smirk squints it a little
  let other = rows;
  if (expr === 'smirk' && !blink) other = eyeGrid(face, 'happy', g.fem).rows;
  const mr = mirrorRows(other);
  buf.stamp(W - ox - mr[0].length, lidY, mr, pal2, T.feat);
  // eyeshadow above the lid
  if (face.eyeshadow && mode !== 'closed') {
    for (let c = 2; c < w; c++) {
      buf.put(ox + c, lidY - 1, face.eyeshadow, T.feat);
      buf.put(W - 1 - (ox + c), lidY - 1, face.eyeshadow, T.feat);
    }
  }
}

function drawBrows(buf: Buf, face: FaceSpec, pal: Pal, expr: Expression): void {
  const base = 26;
  let lift = 0;
  let inner = 0;
  let arch = face.brows === 'arched' ? 1 : 0;
  switch (expr) {
    case 'surprised':
      lift = -2;
      arch += 1;
      break;
    case 'angry':
      inner = 2;
      break;
    case 'frown':
      inner = 1;
      break;
    case 'sad':
    case 'worried':
      inner = -2;
      arch = 0;
      break;
    case 'smile':
    case 'grin':
      lift = -1;
      break;
  }
  const thick = face.brows === 'thick' ? 2 : 1;
  const draw = (mirror: boolean, extraLift: number) => {
    const X = (x: number) => (mirror ? W - 1 - x : x);
    const outer: Pt = [21.5, base + 1 + lift + extraLift];
    const peak: Pt = [24.5, base - arch + lift + extraLift];
    const end: Pt = [28.4, base + 0.4 + inner + lift + extraLift];
    const paint = (x: number, y: number) => {
      for (let t = 0; t < thick; t++) buf.put(X(x), y + t, pal.brow, T.feat);
    };
    line(outer[0], outer[1], peak[0], peak[1], paint);
    line(peak[0], peak[1], end[0], end[1], paint);
    if (face.brows === 'normal') buf.put(X(Math.round(end[0])), Math.round(end[1]) + 1, pal.brow, T.feat);
  };
  draw(false, 0);
  draw(true, expr === 'smirk' ? -1 : 0);
}

const NOSES: Record<FaceSpec['nose'], string[]> = {
  // 6 wide from x = 29, starting at y = 31; h highlight · s shadow · d nostril
  small: ['......', '......', '....s.', '..h.s.', '...ss.', '......'],
  button: ['......', '......', '....s.', '.h..s.', '.s.ss.', '..ss..'],
  straight: ['....s.', '....s.', '...hs.', '...hs.', '..h.s.', '.dssd.'],
  long: ['...s..', '...s..', '...hs.', '...hs.', '..hhs.', '.dsssd'],
};

function drawNose(buf: Buf, face: FaceSpec, pal: Pal): void {
  buf.stamp(29, 31, NOSES[face.nose], { h: pal.skin.hi, s: pal.skin.sh, d: pal.skin.dk }, T.feat);
}

function drawMouth(buf: Buf, g: Geo, face: FaceSpec, pal: Pal, expr: Expression, talk: boolean): void {
  const y = 40;
  const half = g.fem ? 2.5 : 3;
  const a = Math.round(CX - half);
  const b = Math.round(CX + half) - 1;
  const L = pal.lipLine;
  const lip = pal.lip;
  const lipHi = shade(lip, 0.18);
  const inside = '#5a1e28';
  const teeth = '#f2ede4';
  const put = (x: number, yy: number, c: string) => buf.put(x, yy, c, T.feat);
  const lowerLip = (yy: number, from = a + 1, to = b - 1) => {
    if (g.fem || face.lips) {
      for (let x = from; x <= to; x++) put(x, yy, lip);
      put(from, yy, lipHi);
    } else {
      for (let x = from + 1; x <= to - 1; x++) put(x, yy, pal.skin.sh);
    }
  };
  let e = expr;
  if (talk) e = e === 'smile' || e === 'grin' ? 'grin' : e === 'surprised' ? 'surprised' : 'neutral';
  switch (e) {
    case 'smile':
      for (let x = a + 1; x <= b - 1; x++) put(x, y, L);
      put(a, y - 1, L);
      put(b, y - 1, L);
      lowerLip(y + 1, a + 2, b - 2);
      put(a - 1, y - 1, pal.skin.sh);
      put(b + 1, y - 1, pal.skin.sh);
      break;
    case 'grin':
      for (let x = a; x <= b; x++) put(x, y - 1, L);
      put(a - 1, y - 2, L);
      put(b + 1, y - 2, L);
      for (let x = a; x <= b; x++) put(x, y, teeth);
      for (let x = a + 1; x <= b - 1; x++) put(x, y + 1, inside);
      put(a, y + 1, L);
      put(b, y + 1, L);
      for (let x = a + 1; x <= b - 1; x++) put(x, y + 2, g.fem || face.lips ? lip : L);
      break;
    case 'smirk':
      for (let x = a; x <= b - 1; x++) put(x, y, L);
      put(b, y - 1, L);
      put(b + 1, y - 2, pal.skin.sh);
      lowerLip(y + 1, a + 1, b - 2);
      break;
    case 'frown':
      for (let x = a + 1; x <= b - 1; x++) put(x, y, L);
      put(a, y + 1, L);
      put(b, y + 1, L);
      lowerLip(y + 1, a + 2, b - 2);
      break;
    case 'sad':
      for (let x = a + 1; x <= b - 1; x++) put(x, y, L);
      put(a, y + 1, L);
      put(b, y + 1, L);
      lowerLip(y + 1, a + 2, b - 2);
      put(CX - 1, y + 2, pal.skin.sh);
      put(CX, y + 2, pal.skin.sh);
      break;
    case 'worried':
      put(a, y + 1, L);
      put(a + 1, y, L);
      put(a + 2, y, L);
      put(b - 2, y + 1, L);
      put(b - 1, y, L);
      put(b, y + 1, L);
      if (b - a > 4) put(a + 3, y + 1, L);
      lowerLip(y + 2, a + 2, b - 2);
      break;
    case 'surprised':
      put(CX - 1, y - 1, L);
      put(CX, y - 1, L);
      put(CX - 2, y, L);
      put(CX - 1, y, inside);
      put(CX, y, inside);
      put(CX + 1, y, L);
      put(CX - 2, y + 1, L);
      put(CX - 1, y + 1, inside);
      put(CX, y + 1, inside);
      put(CX + 1, y + 1, L);
      put(CX - 1, y + 2, g.fem || face.lips ? lip : L);
      put(CX, y + 2, g.fem || face.lips ? lip : L);
      break;
    case 'angry':
      for (let x = a; x <= b; x++) put(x, y, L);
      for (let x = a + 1; x <= b - 1; x++) put(x, y + 1, (x - a) % 2 === 0 ? teeth : shade(teeth, -0.15));
      put(a, y + 2, L);
      for (let x = a + 1; x <= b - 1; x++) put(x, y + 2, L);
      put(b, y + 2, L);
      break;
    default:
      if (talk) {
        for (let x = a + 1; x <= b - 1; x++) put(x, y, L);
        for (let x = a + 1; x <= b - 1; x++) put(x, y + 1, inside);
        put(a + 1, y + 1, L);
        put(b - 1, y + 1, L);
        lowerLip(y + 2, a + 2, b - 2);
      } else {
        for (let x = a; x <= b; x++) put(x, y, L);
        lowerLip(y + 1);
      }
  }
}

function drawCheeks(buf: Buf, g: Geo, face: FaceSpec, pal: Pal, expr: Expression): void {
  const skinAt = (x: number, y: number) => buf.tag(x, y) === T.skin;
  const blush = face.blush || expr === 'grin' || (g.fem && expr === 'smile');
  if (blush) {
    for (const [x, y] of [
      [21, 34],
      [22, 34],
      [23, 34],
      [22, 35],
      [24, 35],
    ] as Pt[]) {
      if (skinAt(x, y)) buf.put(x, y, pal.skin.blush, T.feat);
      if (skinAt(W - 1 - x, y)) buf.put(W - 1 - x, y, pal.skin.blush, T.feat);
    }
  }
  if (face.freckles) {
    for (const [x, y] of [
      [22, 35],
      [24, 34],
      [26, 35],
      [29, 34],
    ] as Pt[]) {
      const c = mix(pal.skin.sh, pal.skin.dk, 0.5);
      if (skinAt(x, y)) buf.put(x, y, c, T.feat);
      if (skinAt(W - 1 - x + (y % 2), y)) buf.put(W - 1 - x + (y % 2), y, c, T.feat);
    }
  }
  if (face.mole === 'cheek' && skinAt(38, 37)) buf.put(38, 37, pal.skin.deep, T.feat);
  if (face.mole === 'lip' && skinAt(36, 41)) buf.put(36, 41, pal.skin.deep, T.feat);
  // age lines
  const age = face.age;
  const fold = (pts: Pt[], c: string) => {
    for (const [x, y] of pts) {
      if (skinAt(x, y)) buf.put(x, y, c, T.feat);
      if (skinAt(W - 1 - x, y)) buf.put(W - 1 - x, y, c, T.feat);
    }
  };
  if (age >= 38) fold([[27, 38], [27, 39]], pal.skin.sh);
  if (age >= 48) {
    fold([[26, 40], [21, 30], [21, 32]], pal.skin.sh);
    fold([[24, 33], [25, 33], [26, 33]], pal.skin.sh);
  }
  if (age >= 58) {
    fold([[27, 38], [27, 39], [26, 40]], pal.skin.dk);
    fold([[28, 22], [29, 22], [30, 22], [27, 24], [28, 24]], pal.skin.sh);
    fold([[24, 43], [25, 44]], pal.skin.sh);
  }
}

function drawBeard(buf: Buf, g: Geo, face: FaceSpec, pal: Pal, faceM: Mask): void {
  const kind = face.beard;
  if (!kind) return;
  const hr = pal.hair;
  if (kind === 'stubble') {
    faceM.each((x, y) => {
      const dx = Math.abs(x + 0.5 - CX);
      if (!(y >= 37 && (dx >= hw(g, y + 0.5) - 4 || y >= 42 || (y >= 38 && y <= 39 && dx < 4)))) return;
      if (buf.tag(x, y) !== T.skin || (x * 2 + y) % 3 !== 0) return;
      buf.put(x, y, mix(buf.get(x, y)!, hr.mid, 0.28), T.feat);
    });
    return;
  }
  const m = new Mask().where((x, y) => {
    const dx = Math.abs(x - CX);
    const edge = hw(g, Math.min(y, g.chin));
    if (kind === 'goatee') return (y >= 37.8 && y <= 39.2 && dx < 4.4 - (y - 37.8) * 0.4) || (y >= 41.6 && y <= g.chin + 1.2 && dx < 2.9 - Math.max(0, y - 44) * 0.35);
    const span = kind === 'full' ? 4 : 2.8;
    const startY = kind === 'full' ? 35.5 : 37;
    if (y < startY) return false;
    if (y <= g.chin) return dx <= edge && (dx >= edge - span || y >= (kind === 'full' ? 41.6 : 42.6) || (y >= 37.6 && y <= 39.4 && dx < 4.8));
    return kind === 'full' && y <= g.chin + 2.2 && dx < g.chinHalf + 2.2 - (y - g.chin);
  });
  // keep the mouth itself clear
  m.cut(new Mask().where((x, y) => y >= 39.5 && y <= 41.5 && Math.abs(x - CX) < (g.fem ? 2.5 : 3)));
  buf.fill(
    m,
    (x, y) => {
      if (!m.has(x, y + 1)) return hr.sh;
      if (m.run(x, y, 1, 0, 1) <= 1 && x + 0.5 > CX) return hr.sh;
      if ((x * 3 + y * 7) % 5 === 0) return hr.hi;
      if (!m.has(x, y - 1)) return hr.hi;
      return (x + 2 * y) % 4 === 0 ? hr.sh : hr.mid;
    },
    T.feat,
  );
}

// ------------------------------------------------------------------ body and clothes

function torsoMask(g: Geo): Mask {
  const half: Pt[] = g.fem
    ? [
        [0, g.neckBase - 2],
        [5.2, g.neckBase - 1],
        [8, g.neckBase],
        [11, g.neckBase + 1.2],
        [14, g.neckBase + 2.4],
        [17, g.neckBase + 3.8],
        [19.5, g.neckBase + 5.4],
        [21.5, g.neckBase + 7.2],
        [23, g.neckBase + 9.4],
        [24, g.neckBase + 12],
        [24.5, g.neckBase + 16],
        [24.9, 81],
        [0, 81],
      ]
    : [
        [0, g.neckBase - 2],
        [6.3, g.neckBase - 1.4],
        [9, g.neckBase - 0.2],
        [12, g.neckBase + 1],
        [15, g.neckBase + 2.2],
        [18, g.neckBase + 3.6],
        [21, g.neckBase + 5.2],
        [23.5, g.neckBase + 6.6],
        [25.5, g.neckBase + 8.2],
        [27, g.neckBase + 10.2],
        [28, g.neckBase + 12.6],
        [28.6, g.neckBase + 15.6],
        [29, g.neckBase + 20.4],
        [29.3, 81],
        [0, 81],
      ];
  return new Mask().sym(half);
}

function drawBody(buf: Buf, look: CharacterLook, face: FaceSpec, g: Geo, pal: Pal): void {
  const torso = torsoMask(g);
  const top = ramp(look.top, look.topShade);
  const accentBase = look.accent ?? (look.style === 'jacket' ? '#e8e2d0' : '#eeeae2');
  const acc = ramp(accentBase);
  const skin = pal.skin;
  const nb = g.neckBase;
  const armX = g.fem ? 18.2 : 20.6;
  const armTop = nb + (g.fem ? 11 : 10.5);
  const isArm = (x: number, y: number) => y >= armTop && Math.abs(x + 0.5 - CX) >= armX;
  const style = look.style;
  const sleevesAcc = style === 'vest' || style === 'apron';
  const bare = style === 'gown';
  const short = style === 'tee' || (style === 'dress' && face.age < 50);
  // generic cel shading for a garment region
  const shadeAt = (m: Mask, r: Ramp) => (x: number, y: number) => {
    const toR = m.run(x, y, 1, 0, 6);
    const toL = m.run(x, y, -1, 0, 3);
    const up = m.run(x, y, 0, -1, 2);
    if (toR <= 1) return r.dk;
    if (toR <= 4 && x + 0.5 > CX) return r.sh;
    if (x + 0.5 - CX > armX - 6 && x + 0.5 - CX < armX && y > armTop) return r.sh;
    if (toL <= 2 && x + 0.5 < CX && y < nb + 22) return r.hi;
    if (up <= 1 && x + 0.5 < CX - 4) return r.hi;
    return r.mid;
  };
  // base garment
  const baseR = sleevesAcc ? acc : top;
  buf.fill(torso, shadeAt(torso, baseR), T.body);
  // arms: sleeves or skin
  const arms = new Mask().where((x, y) => torso.has(Math.floor(x), Math.floor(y)) && isArm(Math.floor(x), Math.floor(y)));
  if (bare || short) {
    const hem = nb + (bare ? 0 : 16);
    const bareArms = new Mask().where((x, y) => arms.has(Math.floor(x), Math.floor(y)) && y > hem);
    buf.fill(bareArms, shadeAt(torso, skin), T.neck);
    if (!bare) for (let x = 0; x < W; x++) if (arms.has(x, Math.floor(hem)) && buf.tag(x, Math.floor(hem)) === T.body) buf.put(x, Math.floor(hem), top.sh, T.body);
  }
  // seam between the arms and the chest
  for (let y = Math.ceil(armTop); y < H; y++) {
    for (const s of [-1, 1]) {
      const x = Math.floor(CX + s * armX) - (s < 0 ? 1 : 0);
      if (!torso.has(x, y)) continue;
      if (buf.tag(x, y) === T.neck) buf.put(x, y, skin.sh, T.neck);
      else buf.put(x, y, s < 0 ? baseR.sh : baseR.dk, T.body);
    }
  }
  const necklineSkin = (m: Mask) => {
    buf.fill(
      m,
      (x, y) => {
        const dx = x + 0.5 - CX;
        if (y < nb + 1.5 && Math.abs(dx) < g.NW + 0.5) return skin.dk;
        if (dx > g.NW * 0.4) return skin.sh;
        return skin.mid;
      },
      T.neck,
    );
  };
  const collarLine = (m: Mask, c: string) => {
    // garment pixels that touch the neckline get a darker edge
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (buf.tag(x, y) !== T.body || m.has(x, y)) continue;
        if (m.has(x, y - 1) || m.has(x - 1, y) || m.has(x + 1, y)) buf.put(x, y, c, T.body);
      }
  };
  const vNeck = (depth: number, width: number) => new Mask().where((x, y) => y >= nb - 3 && y <= nb + depth && Math.abs(x - CX) <= width * (1 - (y - nb) / depth) + 0.2);
  const scoop = (depth: number, width: number) => new Mask().where((x, y) => y >= nb - 3 && Math.abs(x - CX) <= width && y <= nb + depth * Math.sqrt(Math.max(0, 1 - ((x - CX) / width) ** 2)));
  switch (style) {
    case 'tee': {
      const n = scoop(2.4, g.NW + 1.2).keep(torso);
      necklineSkin(n);
      collarLine(n, top.sh);
      break;
    }
    case 'hoodie': {
      const n = scoop(1.6, g.NW + 0.6).keep(torso);
      necklineSkin(n);
      // the hood bunched behind the neck
      const hood = new Mask().where((x, y) => {
        const dx = Math.abs(x - CX);
        return y >= nb - 4 && y <= nb + 3.2 - (dx > g.NW + 4 ? (dx - g.NW - 4) * 0.8 : 0) && dx >= g.NW - 1 && dx <= g.NW + 8;
      });
      buf.fill(hood, (x, y) => (y >= nb + 2 ? top.dk : x + 0.5 < CX ? top.hi : top.sh), T.body);
      collarLine(n, top.dk);
      for (const s of [-1, 1]) {
        const x = Math.round(CX + s * 3 - (s > 0 ? 1 : 0));
        for (let y = Math.round(nb + 2); y < nb + 14; y++) buf.put(x, y, y >= nb + 12 ? '#bdb6a8' : '#ebe6dc', T.acc);
      }
      break;
    }
    case 'shirt':
    case 'uniform': {
      const chain = look.accent && isGold(look.accent);
      const tie = look.accent && !chain && style === 'shirt';
      if (!tie) {
        const n = vNeck(chain ? 10 : 5, g.NW - 0.2).keep(torso);
        necklineSkin(n);
        collarLine(n, top.sh);
      }
      // collar points
      const collar = new Mask().pair([
        [g.NW + 1.4, nb - 2.6],
        [g.NW + 2.6, nb + 0.4],
        [3.6, nb + 4.6],
        [0.6, nb + 1.8],
        [g.NW - 0.6, nb - 1.6],
      ]);
      buf.fill(collar, (x, y) => (collar.run(x, y, 0, 1, 1) <= 1 ? top.sh : x + 0.5 < CX ? top.hi : top.mid), T.body);
      // placket and buttons
      for (let y = Math.round(nb + (tie ? 3 : chain ? 8 : 5)); y < H; y++) {
        buf.put(CX, y, top.sh, T.body);
        if ((y - Math.round(nb)) % 5 === 0) buf.put(CX - 1, y, top.hi, T.acc);
      }
      if (tie && look.accent) {
        const t = ramp(look.accent);
        const tm = new Mask().where((x, y) => {
          const dx = Math.abs(x - CX);
          if (y < nb + 0.4) return false;
          if (y < nb + 3) return dx <= 1.4;
          return dx <= 1.2 + (y - nb - 3) * 0.12;
        });
        buf.fill(tm, (x, y) => (y < nb + 3 ? t.hi : x + 0.5 > CX + 0.6 ? t.sh : t.mid), T.acc);
        buf.put(CX - 1, Math.round(nb + 3), t.dk, T.acc);
        buf.put(CX, Math.round(nb + 3), t.dk, T.acc);
      }
      if (chain && look.accent) {
        curve([CX - g.NW + 1, nb - 1], [CX, nb + 7], [CX + g.NW - 1, nb - 1], (x, y) => buf.tag(x, y) === T.neck && buf.put(x, y, (x + y) % 2 ? look.accent! : shade(look.accent!, -0.25), T.acc));
        buf.put(CX - 1, nb + 4, shade(look.accent, 0.25), T.acc);
      }
      if (style === 'uniform') {
        for (const s of [-1, 1]) for (let i = 0; i < 6; i++) buf.put(Math.round(CX + s * (armX - 4 + i * 0.5)), Math.round(nb + 4.6 + i * 0.4), top.dk, T.body);
        buf.put(CX + 9, nb + 9, P.gold, T.acc);
        buf.put(CX + 10, nb + 9, P.goldLight, T.acc);
        buf.put(CX + 9, nb + 10, P.goldDark, T.acc);
      }
      break;
    }
    case 'suit': {
      const vb = g.fem ? 70 : 72;
      const accentDark = lum(accentBase) < 0.25;
      const shirt = ramp(accentDark ? accentBase : sat(accentBase) > 0.35 ? '#eeeae2' : accentBase);
      const tieCol = sat(accentBase) > 0.35 ? accentBase : accentDark ? shade(accentBase, 0.12) : shade(look.top, -0.25);
      const vm = new Mask().where((x, y) => y >= nb - 3 && y <= vb && Math.abs(x - CX) <= (g.NW + 1.6) * (1 - (y - nb + 2) / (vb - nb + 2)) + 0.3).keep(torso);
      buf.fill(vm, (x, y) => (y < nb + 1.5 ? shirt.sh : x + 0.5 > CX + 1 ? shirt.sh : shirt.mid), T.body);
      // shirt collar points
      const sc = new Mask().pair([
        [g.NW + 0.4, nb - 2.4],
        [g.NW + 1.4, nb + 0.6],
        [2.2, nb + 3.6],
        [0.4, nb + 1],
      ]);
      buf.fill(sc, (x) => (x + 0.5 < CX ? shirt.hi : shirt.mid), T.body);
      // tie
      const tm = new Mask().where((x, y) => {
        const dx = Math.abs(x - CX);
        if (y < nb + 0.6 || y > vb + 1) return false;
        if (y < nb + 3) return dx <= 1.3;
        return dx <= 1 + (y - nb - 3) * 0.1;
      });
      const tr = ramp(tieCol);
      buf.fill(tm, (x, y) => (y < nb + 3 ? tr.hi : x + 0.5 > CX + 0.5 ? tr.sh : tr.mid), T.acc);
      // lapels along the opening
      for (let y = Math.ceil(nb - 1); y <= vb; y++) {
        const half = (g.NW + 1.6) * (1 - (y - nb + 2) / (vb - nb + 2)) + 0.3;
        for (const s of [-1, 1]) {
          const notch = Math.abs(y - (nb + 6)) < 0.5;
          for (let i = 1; i <= 3; i++) {
            const x = s < 0 ? Math.floor(CX - half - i) : Math.ceil(CX + half + i) - 1;
            if (!torso.has(x, y) || isArm(x, y)) continue;
            const c = notch && i === 3 ? top.dk : i === 1 ? top.dk : s < 0 ? top.hi : top.mid;
            buf.put(x, y, c, T.body);
          }
        }
      }
      // pocket square and a button
      const sq = sat(accentBase) > 0.35 ? accentBase : '#f0ece4';
      for (let x = CX + 10; x <= CX + 13; x++) buf.put(x, nb + 12, x === CX + 10 ? shade(sq, 0.2) : sq, T.acc);
      buf.put(CX + 11, nb + 11, sq, T.acc);
      for (let x = CX + 9; x <= CX + 14; x++) buf.put(x, nb + 13, top.dk, T.body);
      buf.put(CX - 1, vb + 3, top.dk, T.acc);
      buf.put(CX, vb + 3, top.dk, T.acc);
      break;
    }
    case 'jacket': {
      const inner = ramp(accentBase);
      const im = new Mask().where((x, y) => y >= nb - 3 && Math.abs(x - CX) <= 4.2 + Math.max(0, y - nb) * 0.13).keep(torso);
      buf.fill(im, (x, y) => (x + 0.5 > CX + 2.5 ? inner.sh : y < nb + 2 ? inner.sh : inner.mid), T.body);
      const n = scoop(2, g.fem ? 3.8 : 4.2).keep(torso);
      necklineSkin(n);
      collarLine(n, inner.sh);
      // jacket edges and the folded collar
      for (let y = Math.ceil(nb - 1); y < H; y++) {
        const half = 4.2 + Math.max(0, y - nb) * 0.13;
        for (const s of [-1, 1]) {
          const x = s < 0 ? Math.floor(CX - half - 1) : Math.ceil(CX + half + 1) - 1;
          if (torso.has(x, y)) buf.put(x, y, s < 0 ? top.hi : top.dk, T.body);
        }
      }
      const collar = new Mask().pair([
        [g.NW - 0.5, nb - 3.4],
        [g.NW + 4.5, nb - 0.8],
        [g.NW + 3.6, nb + 2.2],
        [5.4, nb + 3.4],
        [4.4, nb - 1],
      ]);
      buf.fill(collar, (x, y) => (collar.run(x, y, 0, 1, 1) <= 1 ? top.dk : x + 0.5 < CX ? top.hi : top.mid), T.body);
      break;
    }
    case 'apron': {
      // shirt in the accent colour, the bib in the top colour
      const sc = new Mask().pair([
        [g.NW + 0.8, nb - 2.4],
        [g.NW + 2, nb + 0.4],
        [2.6, nb + 3.4],
        [0.4, nb + 1],
      ]);
      const n = vNeck(4, g.NW - 0.8).keep(torso);
      necklineSkin(n);
      buf.fill(sc, (x) => (x + 0.5 < CX ? acc.hi : acc.mid), T.body);
      const bibTop = nb + 7;
      const bib = new Mask().where((x, y) => y >= bibTop && Math.abs(x - CX) <= (g.fem ? 8.4 : 9.4) + (y - bibTop) * 0.12).keep(torso);
      buf.fill(bib, shadeAt(bib, top), T.body);
      for (const s of [-1, 1]) line(CX + s * (g.fem ? 7.6 : 8.6), bibTop, CX + s * (g.NW + 1.6), nb - 1.6, (x, y) => torso.has(x, y) && (buf.put(x, y, s < 0 ? top.hi : top.sh, T.body), buf.put(x + s, y, top.dk, T.body)));
      for (let x = Math.round(CX - 5); x <= CX + 4; x++) if (bib.has(x, 74)) buf.put(x, 74, top.sh, T.body);
      if (face.age < 50) {
        // name badge
        for (let x = CX - 7; x <= CX - 4; x++) {
          buf.put(x, bibTop + 3, '#f4efe4', T.acc);
          buf.put(x, bibTop + 4, x === CX - 6 || x === CX - 5 ? '#7a6a5a' : '#f4efe4', T.acc);
        }
      }
      break;
    }
    case 'vest': {
      const vb = nb + 16;
      const vm = new Mask().where((x, y) => !(y >= nb - 3 && y <= vb && Math.abs(x - CX) <= 4.6 * (1 - (y - nb) / (vb - nb)) + 0.4)).keep(torso);
      vm.keep(new Mask().where((x, y) => !isArm(Math.floor(x), Math.floor(y))));
      buf.fill(vm, shadeAt(vm, top), T.body);
      const n = scoop(1.2, g.NW - 1).keep(torso);
      necklineSkin(n);
      const sc = new Mask().pair([
        [g.NW + 0.2, nb - 2.4],
        [g.NW + 1, nb + 0.4],
        [2, nb + 2.6],
        [0.4, nb + 0.8],
      ]);
      buf.fill(sc, (x) => (x + 0.5 < CX ? acc.hi : acc.mid), T.body);
      // bow tie
      const bow = '#a3202d';
      buf.stamp(CX - 4, Math.round(nb + 1), ['dbb.bbd', 'dbbkbbd', 'dbb.bbd'].map((r) => r), { b: bow, d: shade(bow, -0.3), k: shade(bow, 0.25) }, T.acc);
      for (let y = Math.round(nb + 7); y <= vb; y += 4) {
        const half = 4.6 * (1 - (y - nb) / (vb - nb)) + 0.4;
        buf.put(Math.ceil(CX + half + 1) - 1, y, P.gold, T.acc);
      }
      break;
    }
    case 'dress': {
      if (face.age >= 50) {
        const n = scoop(2, g.NW + 0.6).keep(torso);
        necklineSkin(n);
        collarLine(n, top.sh);
        // brooch
        buf.put(CX - 8, nb + 6, P.gold, T.acc);
        buf.put(CX - 7, nb + 6, P.goldLight, T.acc);
        buf.put(CX - 8, nb + 7, P.goldDark, T.acc);
        buf.put(CX - 7, nb + 7, P.gold, T.acc);
      } else {
        const n = scoop(6, g.NW + 3.4).keep(torso);
        necklineSkin(n);
        collarLine(n, top.dk);
      }
      break;
    }
    case 'gown': {
      // bare shoulders, sweetheart bodice
      const bodTop = (dx: number) => nb + 11 + Math.abs(Math.abs(dx) - 5.5) * 0.32 - (Math.abs(dx) > 11 ? (Math.abs(dx) - 11) * 0.6 : 0);
      const skinPart = new Mask().where((x, y) => y < bodTop(x - CX)).keep(torso);
      buf.fill(
        skinPart,
        (x, y) => {
          const dx = x + 0.5 - CX;
          if (y < nb + 1.5 && Math.abs(dx) < g.NW + 0.5) return skin.dk;
          if (skinPart.run(x, y, 1, 0, 2) <= 1 && dx > 0) return skin.sh;
          if (dx > armX - 2) return skin.sh;
          return skin.mid;
        },
        T.neck,
      );
      // collarbones
      for (const s of [-1, 1]) line(CX + s * 2.5, nb + 2.5, CX + s * 9, nb + 1.2, (x, y) => buf.tag(x, y) === T.neck && buf.put(x, y, skin.sh, T.neck));
      collarLine(skinPart, top.dk);
      const jewel = look.accent ?? P.gold;
      curve([CX - g.NW + 0.5, nb - 0.5], [CX, nb + 7], [CX + g.NW - 0.5, nb - 0.5], (x, y) => buf.tag(x, y) === T.neck && buf.put(x, y, (x + y) % 2 ? jewel : shade(jewel, 0.25), T.acc));
      buf.put(CX - 1, nb + 4, shade(jewel, 0.3), T.acc);
      buf.put(CX, nb + 4, jewel, T.acc);
      buf.put(CX - 1, nb + 5, jewel, T.acc);
      buf.put(CX, nb + 5, shade(jewel, -0.3), T.acc);
      break;
    }
  }
}

// ------------------------------------------------------------------ hats and extras

const HAT_COLORS = { beanie: '#b8432e', cap: '#2f4f7a' };

function drawHat(buf: Buf, look: CharacterLook, g: Geo): void {
  if (!look.hat) return;
  const r = ramp(HAT_COLORS[look.hat]);
  if (look.hat === 'beanie') {
    const crown = new Mask().ellipse(CX, 22.5, g.R + 2.6, 12.5).keep(new Mask().where((_, y) => y < 23.2));
    buf.fill(
      crown,
      (x, y) => {
        if (y >= 19) return (x + Math.floor(y / 4)) % 2 === 0 ? r.mid : r.sh;
        if (crown.run(x, y, 1, 1, 2) <= 1) return r.dk;
        if (crown.run(x, y, -1, -1, 3) === 3) return r.hi;
        return (x + y) % 4 === 0 ? r.sh : r.mid;
      },
      T.hat,
    );
    for (let x = 0; x < W; x++) if (crown.has(x, 18)) buf.put(x, 18, r.dk, T.hat);
    const pom = new Mask().ellipse(CX, 9.6, 3.8, 3.2);
    buf.fill(pom, (x, y) => (pom.run(x, y, 1, 1, 1) <= 1 ? '#c9bfae' : (x + y) % 2 ? '#f4eee2' : '#e6dccb'), T.hat);
    return;
  }
  // baseball cap: crown, then the brim seen from the front
  const crown = new Mask().ellipse(CX, 23, g.R + 1.9, 11.6).keep(new Mask().where((_, y) => y < 21.6));
  buf.fill(crown, (x, y) => (crown.run(x, y, 1, 1, 2) <= 1 ? r.sh : crown.run(x, y, -1, -1, 3) === 3 ? r.hi : r.mid), T.hat);
  const seam = Math.round(CX - 1);
  for (let y = 12; y < 21; y++) if (crown.has(seam, y)) buf.put(seam, y, r.sh, T.hat);
  buf.put(seam, 11, r.dk, T.hat);
  const brim = new Mask().ellipse(CX + 0.5, 21.8, g.R + 3.4, 2.6).keep(new Mask().where((_, y) => y >= 20.4));
  buf.fill(brim, (x, y) => (y >= 23 ? r.dk : x + 0.5 < CX ? r.hi : r.mid), T.hat);
  // the brim shades the forehead
  for (let x = 0; x < W; x++) for (const y of [24, 25]) if (buf.tag(x, y) === T.skin) buf.put(x, y, y === 24 ? shade(buf.get(x, y)!, -0.2) : shade(buf.get(x, y)!, -0.1), T.skin);
}

function drawGlasses(buf: Buf, face: FaceSpec): void {
  if (!face.glasses) return;
  const f = face.glasses;
  const lidY = face.eyes === 'round' ? 28 : 29;
  const y0 = lidY - 1;
  const y1 = lidY + 4;
  for (const [x0, x1] of [
    [21, 29],
    [34, 42],
  ]) {
    for (let x = x0; x <= x1; x++) {
      buf.put(x, y0, f, T.acc);
      buf.put(x, y1, f, T.acc);
    }
    for (let y = y0; y <= y1; y++) {
      buf.put(x0, y, f, T.acc);
      buf.put(x1, y, f, T.acc);
    }
    // glint
    const c = buf.get(x0 + 1, y0 + 1);
    if (c) buf.put(x0 + 1, y0 + 1, mix(c, '#ffffff', 0.6), T.acc);
    const c2 = buf.get(x0 + 2, y0 + 1);
    if (c2 && buf.tag(x0 + 2, y0 + 1) !== T.feat) buf.put(x0 + 2, y0 + 1, mix(c2, '#ffffff', 0.4), T.acc);
  }
  for (let x = 30; x <= 33; x++) buf.put(x, y0 + 1, f, T.acc);
  for (let x = 17; x <= 20; x++) buf.put(x, y0 + 1, f, T.acc);
  for (let x = 43; x <= 46; x++) buf.put(x, y0 + 1, f, T.acc);
}

function drawEarrings(buf: Buf, look: CharacterLook, face: FaceSpec, g: Geo): void {
  const kind = face.earrings ?? (look.earrings ? 'stud' : null);
  if (!kind) return;
  const gold = P.gold;
  for (const s of [-1, 1]) {
    const x = Math.round(CX + s * (g.R + 0.6)) - (s > 0 ? 1 : 0);
    if (kind === 'stud') {
      buf.put(x, 37, P.goldLight, T.acc);
      buf.put(x, 38, gold, T.acc);
    } else {
      buf.put(x, 37, gold, T.acc);
      buf.put(x - 1, 38, gold, T.acc);
      buf.put(x + 1, 38, P.goldDark, T.acc);
      buf.put(x - 1, 39, P.goldDark, T.acc);
      buf.put(x + 1, 39, P.goldDark, T.acc);
      buf.put(x, 40, P.goldDark, T.acc);
      buf.put(x - 1, 38, P.goldLight, T.acc);
    }
  }
}

// ------------------------------------------------------------------ assembly

function paintHair(buf: Buf, m: Mask, shape: HairShape, pal: Pal, layer: 'back' | 'front', strandSet: Set<number>): void {
  const h = pal.hair;
  buf.fill(
    m,
    (x, y) => {
      const br = m.run(x, y, 1, 1, 3);
      const r = m.run(x, y, 1, 0, 2);
      const tl = m.run(x, y, -1, -1, 4);
      if (layer === 'back') {
        if (br <= 1 || r <= 1) return h.dk;
        return strandSet.has(y * W + x) ? h.dk : h.sh;
      }
      if (shape.curly) {
        const k = (x * 5 + y * 3) % 7;
        if (br <= 1) return h.dk;
        if (k === 0 && tl > 1) return h.hi;
        if (k === 3 || k === 4) return h.sh;
        if (tl === 2 && y < 30) return h.hi;
        return h.mid;
      }
      if (shape.buzz) {
        // short bristles: mostly flat colour with a scatter of darker roots
        if (br <= 1) return h.sh;
        if (tl === 2 && y < 22) return h.hi;
        return (x * 7 + y * 3) % 5 === 0 ? h.sh : h.mid;
      }
      if (br <= 1 || r <= 1) return h.sh;
      if ((tl === 2 || tl === 3) && y < 26) return (x + y) % 5 === 0 ? h.hi : h.sheen;
      if (strandSet.has(y * W + x)) return h.sh;
      if (tl === 1) return h.mid;
      if (y > 30) {
        // long locks: lit on the left of each lock
        const l = m.run(x, y, -1, 0, 6);
        const rr = m.run(x, y, 1, 0, 6);
        if (l <= 2 && rr > 2) return h.hi;
        if (rr <= 2) return h.sh;
      }
      return h.mid;
    },
    T.hair,
  );
}

function strandsFor(shape: HairShape): Set<number> {
  const set = new Set<number>();
  for (const s of shape.strands) {
    for (let i = 0; i + 2 < s.length; i += 2) curve(s[i], s[i + 1], s[i + 2], (x, y) => set.add(y * W + x));
    if (s.length === 2) line(s[0][0], s[0][1], s[1][0], s[1][1], (x, y) => set.add(y * W + x));
  }
  return set;
}

/** Draw a portrait into a pixel buffer (no DOM needed); exported for tests. */
export function portraitPixels(look: CharacterLook, face: FaceSpec, opts: PortraitOpts = {}): (string | null)[] {
  const expr = opts.expr ?? face.rest ?? 'neutral';
  const g = geometry(look, face);
  const pal = palette(look, face);
  const buf = new Buf();
  const shape = hairShape(look.hair, g);
  const strands = strandsFor(shape);
  const fm = faceMask(g);
  // 1 hair behind the head
  paintHair(buf, shape.back, shape, pal, 'back', strands);
  // 2 neck
  const neck = new Mask().where((x, y) => y >= 38 && y <= g.neckBase + 6 && Math.abs(x - CX) <= g.NW);
  buf.fill(
    neck,
    (x, y) => {
      const dx = x + 0.5 - CX;
      // shadow under the jaw
      let jaw = 0;
      for (let k = 1; k <= 4; k++) if (fm.has(x, y - k)) jaw = k;
      if (fm.has(x, y - 1)) return pal.skin.dk;
      if (jaw) return dx > -g.NW * 0.5 ? pal.skin.dk : pal.skin.sh;
      if (dx > g.NW * 0.3) return pal.skin.sh;
      return pal.skin.mid;
    },
    T.neck,
  );
  // 3 body
  drawBody(buf, look, face, g, pal);
  // 4 ears
  const ears = new Mask().ellipse(CX - g.R - 0.2, 32.5, 2.4, 4.2).add(new Mask().ellipse(CX + g.R + 0.2, 32.5, 2.4, 4.2));
  buf.fill(ears, (x, y) => (Math.abs(x + 0.5 - CX) < g.R + 0.6 && y > 30 && y < 36 ? pal.skin.dk : x + 0.5 > CX ? pal.skin.sh : pal.skin.mid), T.ear);
  // 5 face
  buf.fill(
    fm,
    (x, y) => {
      const dx = x + 0.5 - CX;
      const half = Math.max(1, hw(g, y + 0.5));
      const u = dx / half;
      // the shadow side widens toward the jaw; one dithered column softens the edge
      const term = y < 34 ? 0.64 : 0.64 - ((y - 34) / (g.chin - 34)) * 0.46;
      if (u > term + 0.09) return fm.run(x, y, 1, 0, 1) <= 1 && y > 30 ? pal.skin.dk : pal.skin.sh;
      if (u > term - 0.03) return (x + y) % 2 ? pal.skin.sh : pal.skin.mid;
      if (u < -0.3 && u > -0.8 && y >= 32 && y <= 35) return pal.skin.hi;
      if (u < -0.1 && u > -0.6 && y >= 18 && y <= 23) return pal.skin.hi;
      if (u < -0.12 && u > -0.5 && y >= g.chin - 3 && y <= g.chin - 2) return pal.skin.hi;
      return pal.skin.mid;
    },
    T.skin,
  );
  if (look.hair === 10 || shape.buzz) {
    // a shaved head shows the hairline as stubble
    const stub = mix(pal.skin.mid, pal.hair.mid, look.hair === 10 ? 0.22 : 0.4);
    fm.each((x, y) => {
      const dx = Math.abs(x + 0.5 - CX);
      if ((y < 20 || (dx > g.R - 1.8 && y < 29)) && (x + y) % 2 === 0) buf.put(x, y, stub, T.skin);
    });
    if (look.hair === 10) for (const [x, y] of [[26, 15], [27, 15], [25, 16]] as Pt[]) buf.put(x, y, mix(pal.skin.hi, '#ffffff', 0.3), T.skin);
  }
  // 6 features
  drawCheeks(buf, g, face, pal, expr);
  drawBeard(buf, g, face, pal, fm);
  drawNose(buf, face, pal);
  drawMouth(buf, g, face, pal, expr, !!opts.talk);
  drawEyes(buf, g, face, pal, expr, !!opts.blink);
  drawBrows(buf, face, pal, expr);
  // 7 hair in front
  paintHair(buf, shape.front, shape, pal, 'front', strands);
  if (shape.extra) paintHair(buf, shape.extra, shape, pal, 'front', strands);
  if (shape.tie) buf.fill(shape.tie.mask, (x) => (x % 2 ? shape.tie!.color : shade(shape.tie!.color, -0.25)), T.acc);
  // the fringe shades the forehead; its own edge darkens where it meets skin
  for (let y = H - 1; y >= 1; y--) {
    for (let x = 0; x < W; x++) {
      if (buf.tag(x, y) !== T.skin) continue;
      if (buf.tag(x, y - 1) === T.hair) buf.put(x, y, pal.skin.sh, T.skin);
    }
  }
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) if (buf.tag(x, y) === T.hair && shape.front.has(x, y) && (buf.tag(x, y + 1) === T.skin || buf.tag(x, y + 1) === T.feat)) buf.put(x, y, pal.hair.dk, T.hair);
  // 8 hat and accessories
  drawHat(buf, look, g);
  drawGlasses(buf, face);
  drawEarrings(buf, look, face, g);
  // 9 outline: every empty pixel touching the figure takes a dark version of its neighbour
  const out: (string | null)[] = buf.c.slice();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (buf.get(x, y)) continue;
      const n = buf.get(x, y + 1) ?? buf.get(x + 1, y) ?? buf.get(x - 1, y) ?? buf.get(x, y - 1);
      if (n) out[y * W + x] = outlineOf(n);
    }
  }
  if (!opts.bg) return out;
  // backdrop: flat colour with a lighter halo behind the head, dithered at the edge
  const bg = opts.bg;
  const halo = mix(bg, '#fff4dc', 0.12);
  const low = shade(bg, -0.18);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (out[i]) continue;
      const d = ((x + 0.5 - CX) / 30) ** 2 + ((y + 0.5 - 30) / 32) ** 2;
      out[i] = d < 0.82 ? halo : d < 1 ? ((x + y) % 2 ? halo : bg) : y > 64 && (y > 70 || (x + y) % 2) ? low : bg;
    }
  }
  return out;
}

const cache = new Map<string, HTMLCanvasElement>();

/** Canvas of a portrait, cached by everything that affects it. */
export function portraitCanvas(look: CharacterLook, face: FaceSpec, opts: PortraitOpts = {}): HTMLCanvasElement {
  const key = JSON.stringify([look, face, opts.expr ?? face.rest ?? 'neutral', !!opts.blink, !!opts.talk, opts.bg ?? null]);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const px = portraitPixels(look, face, opts);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const rgb = new Map<string, [number, number, number]>();
  for (let i = 0; i < px.length; i++) {
    const c = px[i];
    if (!c) continue;
    let v = rgb.get(c);
    if (!v) {
      v = hexToRgb(c);
      rgb.set(c, v);
    }
    img.data[i * 4] = v[0];
    img.data[i * 4 + 1] = v[1];
    img.data[i * 4 + 2] = v[2];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, canvas);
  if (cache.size > 240) cache.delete(cache.keys().next().value as string);
  return canvas;
}
