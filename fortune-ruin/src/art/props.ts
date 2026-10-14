import { P } from './palette';
import { box, circle, dither, ellipse, hash2, hline, makeCanvas, px, rect, rgba, ring, roundRect, shade, speckle, strokeRect, vline, type Ctx } from './canvas';
import { drawText, drawTextCentered, measureText } from './font';

/**
 * Props are drawn once into canvases and placed on maps. The anchor is the
 * bottom-left tile of the footprint; the image is centred horizontally on the
 * footprint and its bottom sits on the footprint's bottom edge (+ dy).
 */
export interface PropDef {
  id: string;
  w: number;
  h: number;
  /** blocked footprint in tiles (from the anchor tile, extending right and up) */
  foot: { w: number; h: number };
  /** optional per-tile mask (row-major from the top row), 1 = blocked */
  mask?: number[][];
  draw: (ctx: Ctx, frame: number) => void;
  night?: (ctx: Ctx, frame: number) => void;
  frames?: number;
  /** light source in image pixels */
  light?: { x: number; y: number; r: number; color: string; always?: boolean };
  /** extra vertical offset in px (positive = lower) */
  dy?: number;
  /** drawn on the ground layer (rugs, decals) */
  ground?: boolean;
  /** wall decal (sits on wall tiles, never blocks) */
  wall?: boolean;
  /** depth override: draw above characters */
  overhead?: boolean;
}

const O = P.outline;
const defs: PropDef[] = [];
function def(d: PropDef): void {
  defs.push(d);
}

// ------------------------------------------------------------------ helpers

let drewShadow = false;
/** props whose art already contains a ground shadow (the world adds one to the rest) */
export const OWN_SHADOW = new Set<string>();

function shadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number): void {
  drewShadow = true;
  ellipse(ctx, cx, cy, rx, ry, 'rgba(10,6,20,0.28)');
}

function treeCanopy(ctx: Ctx, cx: number, cy: number, r: number, base: string, seed: number): void {
  const dark = shade(base, -0.25);
  const light = shade(base, 0.18);
  circle(ctx, cx, cy, r, O);
  circle(ctx, cx, cy, r - 1, dark);
  circle(ctx, cx - 2, cy - 2, r - 3, base);
  circle(ctx, cx - 4, cy - 4, Math.max(2, r - 7), light);
  for (let i = 0; i < 14; i++) {
    const a = hash2(i, seed, 1) * Math.PI * 2;
    const d = hash2(seed, i, 2) * (r - 3);
    const x = Math.round(cx + Math.cos(a) * d);
    const y = Math.round(cy + Math.sin(a) * d);
    px(ctx, x, y, hash2(i, i, seed) < 0.5 ? light : dark);
  }
}

function chairTop(ctx: Ctx, x: number, y: number, seat: string, back: string): void {
  rect(ctx, x + 1, y, 8, 5, back);
  rect(ctx, x, y + 5, 10, 5, seat);
  rect(ctx, x + 1, y + 10, 1, 3, shade(back, -0.3));
  rect(ctx, x + 8, y + 10, 1, 3, shade(back, -0.3));
  strokeRect(ctx, x, y, 10, 10, O);
}

// ------------------------------------------------------------------ city props

for (const [id, base, r] of [
  ['tree_round', '#3f7a38', 13],
  ['tree_autumn', '#b8642e', 13],
  ['tree_blossom', '#d98aa8', 12],
] as const) {
  def({
    id,
    w: 32,
    h: 46,
    foot: { w: 1, h: 1 },
    draw: (ctx) => {
      shadow(ctx, 16, 42, 10, 3);
      rect(ctx, 14, 26, 4, 17, '#6a4428');
      vline(ctx, 17, 26, 17, '#4a2e1a');
      strokeRect(ctx, 13, 26, 6, 17, O);
      treeCanopy(ctx, 16, 16, r, base, id.length);
      if (id === 'tree_blossom') for (let i = 0; i < 10; i++) px(ctx, 8 + ((i * 7) % 16), 8 + ((i * 5) % 14), '#f8d0e0');
    },
  });
}
def({
  id: 'tree_pine',
  w: 24,
  h: 42,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 12, 39, 8, 3);
    rect(ctx, 10, 32, 4, 8, '#5a3a24');
    for (let i = 0; i < 4; i++) {
      const y = 4 + i * 7;
      const half = 4 + i * 2;
      for (let j = 0; j < 9; j++) hline(ctx, 12 - Math.round((half * j) / 9), y + j, Math.round((half * j) / 9) * 2 + 1, j % 3 === 0 ? '#2f5e2e' : '#3a7034');
    }
    px(ctx, 12, 3, '#5fa24c');
  },
});
def({
  id: 'bush',
  w: 18,
  h: 14,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 9, 12, 8, 2);
    ellipse(ctx, 9, 7, 8, 6, O);
    ellipse(ctx, 9, 7, 7, 5, '#356a32');
    ellipse(ctx, 7, 5, 5, 3, '#4a8a3f');
    speckle(ctx, 3, 3, 12, 8, '#5fa24c', 0.15, 3);
  },
});
def({
  id: 'flower_pot',
  w: 14,
  h: 16,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 7, 14, 5, 2);
    rect(ctx, 3, 8, 8, 6, '#a0522d');
    rect(ctx, 2, 8, 10, 2, '#b8653a');
    strokeRect(ctx, 2, 8, 10, 6, O);
    ellipse(ctx, 7, 6, 5, 3, '#3f7a38');
    for (const [x, y, c] of [[4, 4, '#e04a5a'], [8, 3, '#f2c94c'], [10, 6, '#e04a5a'], [6, 6, '#f4f1ea']] as [number, number, string][]) px(ctx, x, y, c);
  },
});
def({
  id: 'lamp',
  w: 12,
  h: 42,
  foot: { w: 1, h: 1 },
  light: { x: 6, y: 6, r: 46, color: '#ffd88a' },
  draw: (ctx) => {
    shadow(ctx, 6, 40, 4, 2);
    rect(ctx, 5, 8, 2, 32, '#2a2e38');
    rect(ctx, 3, 38, 6, 3, '#2a2e38');
    rect(ctx, 2, 3, 8, 5, '#2a2e38');
    rect(ctx, 3, 4, 6, 3, '#e8d9a8');
    hline(ctx, 1, 2, 10, '#3a3f4a');
  },
  night: (ctx) => {
    rect(ctx, 3, 4, 6, 4, '#fff1c0');
    ctx.fillStyle = 'rgba(255,220,140,0.35)';
    ctx.fillRect(1, 6, 10, 4);
  },
});
def({
  id: 'bench',
  w: 32,
  h: 18,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 16, 16, 14, 2);
    rect(ctx, 2, 3, 28, 4, P.woodLight);
    hline(ctx, 2, 5, 28, P.wood);
    rect(ctx, 2, 8, 28, 5, P.wood);
    hline(ctx, 2, 8, 28, P.woodPale);
    rect(ctx, 3, 13, 2, 4, '#2a2e38');
    rect(ctx, 27, 13, 2, 4, '#2a2e38');
    strokeRect(ctx, 2, 3, 28, 10, O);
  },
});
def({
  id: 'trash',
  w: 12,
  h: 16,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 6, 14, 5, 2);
    rect(ctx, 2, 4, 8, 10, '#3a5a4a');
    for (let x = 3; x < 10; x += 2) vline(ctx, x, 5, 8, '#2e4a3c');
    rect(ctx, 1, 2, 10, 3, '#4a6e5c');
    strokeRect(ctx, 1, 2, 10, 12, O);
  },
});
def({
  id: 'hydrant',
  w: 10,
  h: 14,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 5, 12, 4, 2);
    rect(ctx, 3, 4, 4, 8, '#c2283a');
    rect(ctx, 2, 3, 6, 2, '#a3202f');
    rect(ctx, 1, 6, 8, 2, '#a3202f');
    px(ctx, 4, 5, '#ff8a8a');
    strokeRect(ctx, 1, 3, 8, 9, O);
  },
});
def({
  id: 'mailbox',
  w: 12,
  h: 18,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 6, 16, 5, 2);
    rect(ctx, 2, 3, 8, 11, '#2a4a9a');
    rect(ctx, 2, 3, 8, 3, '#3a5eb8');
    hline(ctx, 3, 7, 6, '#1a2a5a');
    rect(ctx, 4, 14, 4, 3, '#2a2e38');
    strokeRect(ctx, 2, 3, 8, 11, O);
  },
});
def({
  id: 'bus_stop',
  w: 50,
  h: 38,
  foot: { w: 3, h: 1 },
  light: { x: 25, y: 10, r: 40, color: '#cfe8ff' },
  draw: (ctx) => {
    shadow(ctx, 25, 36, 22, 3);
    rect(ctx, 3, 4, 44, 4, '#3a3f4a');
    rect(ctx, 4, 8, 2, 26, '#5a606a');
    rect(ctx, 44, 8, 2, 26, '#5a606a');
    rect(ctx, 6, 9, 38, 16, rgba(P.glassLight, 0.5));
    dither(ctx, 6, 9, 38, 16, rgba(P.glass, 0.6));
    rect(ctx, 10, 26, 30, 4, P.woodLight);
    rect(ctx, 10, 30, 2, 4, '#2a2e38');
    rect(ctx, 38, 30, 2, 4, '#2a2e38');
    strokeRect(ctx, 3, 4, 44, 4, O);
    rect(ctx, 30, 11, 12, 10, '#e2c661');
    drawText(ctx, 'BUS', 31, 13, '#2a2a2a', '3x5');
  },
  night: (ctx) => {
    rect(ctx, 30, 11, 12, 10, '#fff1a8');
    ctx.fillStyle = 'rgba(200,230,255,0.25)';
    ctx.fillRect(6, 9, 38, 16);
  },
});
def({
  id: 'fountain',
  w: 66,
  h: 52,
  foot: { w: 4, h: 3 },
  frames: 3,
  draw: (ctx, f) => {
    shadow(ctx, 33, 47, 30, 5);
    ellipse(ctx, 33, 34, 31, 14, O);
    ellipse(ctx, 33, 34, 30, 13, '#b9b3a8');
    ellipse(ctx, 33, 33, 26, 10, '#8f897f');
    ellipse(ctx, 33, 33, 24, 9, P.water);
    for (let i = 0; i < 6; i++) hline(ctx, 14 + ((i * 9 + f * 4) % 36), 30 + ((i * 3) % 7), 4, P.waterLight);
    rect(ctx, 30, 14, 6, 18, '#cfc9be');
    ellipse(ctx, 33, 15, 9, 4, '#b9b3a8');
    ellipse(ctx, 33, 14, 7, 3, P.water);
    // jets
    for (let i = 0; i < 4; i++) {
      const jx = 33 + [-6, -2, 2, 6][i];
      const jh = 6 + ((i + f) % 3) * 2;
      vline(ctx, jx, 13 - jh, jh, P.waterFoam);
    }
    px(ctx, 33, 4 - f, P.waterFoam);
    strokeRect(ctx, 30, 14, 6, 18, O);
  },
});

const CAR_COLORS = ['#c2283a', '#2a4a9a', '#e6e1d6', '#2a2a2e', '#3f8a5a', '#d9a441', '#6a6f78', '#8a2d5a'];
CAR_COLORS.forEach((col, i) => {
  def({
    id: `car_h${i}`,
    w: 44,
    h: 26,
    foot: { w: 3, h: 1 },
    draw: (ctx) => drawCarSide(ctx, col, false),
  });
  def({
    id: `car_v${i}`,
    w: 24,
    h: 40,
    foot: { w: 1, h: 2 },
    draw: (ctx) => drawCarTop(ctx, col),
  });
});

export function drawCarSide(ctx: Ctx, col: string, flip: boolean, lightsOn = false): void {
  const dk = shade(col, -0.28);
  const lt = shade(col, 0.2);
  shadow(ctx, 22, 23, 20, 3);
  rect(ctx, 2, 12, 40, 9, col);
  rect(ctx, 9, 5, 24, 8, col);
  rect(ctx, 11, 6, 9, 6, '#6f93b3');
  rect(ctx, 22, 6, 9, 6, '#6f93b3');
  px(ctx, 12, 7, P.glassShine);
  px(ctx, 23, 7, P.glassShine);
  hline(ctx, 2, 12, 40, lt);
  hline(ctx, 2, 18, 40, dk);
  rect(ctx, 2, 19, 40, 2, dk);
  circle(ctx, 10, 21, 4, '#1a1a1a');
  circle(ctx, 34, 21, 4, '#1a1a1a');
  circle(ctx, 10, 21, 2, '#8a8a8a');
  circle(ctx, 34, 21, 2, '#8a8a8a');
  rect(flip ? ctx : ctx, flip ? 2 : 40, 13, 2, 3, lightsOn ? '#fff4c0' : '#f2e6a0');
  rect(ctx, flip ? 40 : 2, 13, 2, 3, '#c2283a');
  strokeRect(ctx, 2, 12, 40, 9, O);
  strokeRect(ctx, 9, 5, 24, 8, O);
}

export function drawCarTop(ctx: Ctx, col: string): void {
  const dk = shade(col, -0.28);
  shadow(ctx, 12, 37, 10, 3);
  roundRect(ctx, 2, 2, 20, 35, col, 2);
  rect(ctx, 4, 8, 16, 8, '#6f93b3');
  rect(ctx, 4, 26, 16, 6, '#5a7b99');
  px(ctx, 5, 9, P.glassShine);
  rect(ctx, 4, 16, 16, 10, shade(col, 0.1));
  vline(ctx, 2, 4, 31, dk);
  vline(ctx, 21, 4, 31, dk);
  rect(ctx, 4, 2, 4, 2, '#f2e6a0');
  rect(ctx, 16, 2, 4, 2, '#f2e6a0');
  rect(ctx, 4, 35, 4, 2, '#c2283a');
  rect(ctx, 16, 35, 4, 2, '#c2283a');
  strokeRect(ctx, 2, 2, 20, 35, O);
}

def({
  id: 'cone',
  w: 10,
  h: 12,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    rect(ctx, 1, 10, 8, 2, '#d9531e');
    for (let j = 0; j < 9; j++) hline(ctx, 5 - Math.floor(j / 3), 1 + j, 1 + Math.floor(j / 3) * 2, j === 4 || j === 5 ? '#f4f1ea' : '#e86a2a');
  },
});
def({
  id: 'newsbox',
  w: 12,
  h: 18,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 6, 16, 5, 2);
    rect(ctx, 2, 3, 8, 12, '#c2283a');
    rect(ctx, 3, 5, 6, 4, '#e8e2d0');
    hline(ctx, 4, 6, 4, '#3a3a3a');
    hline(ctx, 4, 8, 3, '#3a3a3a');
    strokeRect(ctx, 2, 3, 8, 12, O);
  },
});
def({
  id: 'planter',
  w: 32,
  h: 18,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 16, 16, 14, 2);
    box(ctx, 1, 6, 30, 3, 7, '#8f897f', '#77716a');
    ellipse(ctx, 16, 6, 13, 4, '#3f7a38');
    speckle(ctx, 4, 3, 24, 6, '#5fa24c', 0.3, 7);
    for (let i = 0; i < 6; i++) px(ctx, 6 + i * 4, 4 + (i % 2), ['#e04a5a', '#f2c94c', '#f4f1ea'][i % 3]);
  },
});
def({
  id: 'statue',
  w: 22,
  h: 40,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 11, 37, 9, 2);
    box(ctx, 3, 26, 16, 3, 10, '#b9b3a8', '#9a948a');
    // a bronze figure holding a coin
    rect(ctx, 8, 8, 6, 18, '#7a6a3a');
    circle(ctx, 11, 6, 3, '#7a6a3a');
    rect(ctx, 13, 10, 5, 2, '#7a6a3a');
    circle(ctx, 18, 9, 2, P.gold);
    vline(ctx, 13, 8, 18, '#5a4a28');
  },
});
def({
  id: 'chess_table',
  w: 30,
  h: 22,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 15, 20, 13, 2);
    box(ctx, 7, 4, 16, 9, 4, '#b9b3a8', '#9a948a');
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if ((i + j) % 2 === 0) rect(ctx, 9 + i * 3, 5 + j * 2, 3, 2, '#3a3a3a');
    px(ctx, 11, 6, '#f4f1ea');
    px(ctx, 18, 9, '#1a1a1a');
    rect(ctx, 1, 10, 5, 6, '#8f897f');
    rect(ctx, 24, 10, 5, 6, '#8f897f');
  },
});
def({
  id: 'hoop',
  w: 20,
  h: 44,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 10, 42, 6, 2);
    rect(ctx, 9, 14, 2, 28, '#5a606a');
    rect(ctx, 3, 3, 14, 11, '#f4f1ea');
    strokeRect(ctx, 3, 3, 14, 11, '#c2283a');
    strokeRect(ctx, 7, 7, 6, 5, '#c2283a');
    hline(ctx, 6, 14, 8, '#e86a2a');
    for (let x = 7; x < 14; x += 2) vline(ctx, x, 15, 3, '#e8e8e8');
  },
});
def({
  id: 'container',
  w: 50,
  h: 30,
  foot: { w: 3, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 25, 28, 24, 2);
    const col = '#2f6a8a';
    box(ctx, 1, 4, 48, 6, 18, shade(col, 0.15), col);
    for (let x = 3; x < 48; x += 4) vline(ctx, x, 11, 16, shade(col, -0.2));
    drawText(ctx, 'GHX', 18, 15, '#e8e2d0', '3x5');
  },
});
def({
  id: 'container_red',
  w: 50,
  h: 30,
  foot: { w: 3, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 25, 28, 24, 2);
    const col = '#a3442f';
    box(ctx, 1, 4, 48, 6, 18, shade(col, 0.15), col);
    for (let x = 3; x < 48; x += 4) vline(ctx, x, 11, 16, shade(col, -0.2));
  },
});
def({
  id: 'crate',
  w: 16,
  h: 16,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 1, 2, 14, 4, 9, P.woodPale, P.woodLight);
    hline(ctx, 2, 10, 12, P.woodDark);
    vline(ctx, 7, 7, 8, P.woodDark);
  },
});
def({
  id: 'barrel',
  w: 14,
  h: 18,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 7, 16, 6, 2);
    rect(ctx, 2, 4, 10, 11, '#7a4a2a');
    ellipse(ctx, 7, 4, 5, 2, '#9a6a3a');
    hline(ctx, 2, 7, 10, '#3a3a3a');
    hline(ctx, 2, 12, 10, '#3a3a3a');
    strokeRect(ctx, 2, 3, 10, 12, O);
  },
});
def({
  id: 'crane',
  w: 64,
  h: 104,
  foot: { w: 2, h: 1 },
  overhead: true,
  draw: (ctx) => {
    const y = '#e0a83a';
    for (const x of [8, 24]) {
      rect(ctx, x, 30, 4, 72, y);
      for (let j = 34; j < 100; j += 8) {
        hline(ctx, x - 4, j, 12, shade(y, -0.25));
      }
    }
    rect(ctx, 4, 24, 58, 6, y);
    for (let x = 6; x < 60; x += 6) px(ctx, x, 26, shade(y, -0.3));
    rect(ctx, 14, 14, 12, 10, '#c2283a');
    rect(ctx, 16, 16, 8, 4, P.glassLight);
    vline(ctx, 52, 30, 30, '#3a3a3a');
    rect(ctx, 48, 60, 9, 5, '#5a5a5a');
    strokeRect(ctx, 4, 24, 58, 6, O);
  },
});
def({
  id: 'boat',
  w: 52,
  h: 26,
  foot: { w: 0, h: 0 },
  frames: 2,
  draw: (ctx, f) => {
    const y0 = f;
    ellipse(ctx, 26, 18 + y0, 24, 6, '#1a3a5a');
    rect(ctx, 4, 10 + y0, 44, 8, '#f4f1ea');
    rect(ctx, 4, 16 + y0, 44, 3, '#2a4a9a');
    rect(ctx, 16, 4 + y0, 18, 7, '#e8e2d0');
    rect(ctx, 18, 6 + y0, 4, 3, P.glass);
    rect(ctx, 26, 6 + y0, 4, 3, P.glass);
    strokeRect(ctx, 4, 10 + y0, 44, 9, O);
  },
});
def({
  id: 'umbrella_table',
  w: 30,
  h: 34,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 15, 32, 12, 2);
    rect(ctx, 14, 12, 2, 18, '#3a3a3a');
    ellipse(ctx, 15, 27, 8, 3, '#e8e2d0');
    for (let i = 0; i < 6; i++) {
      const c = i % 2 === 0 ? '#2f6b4f' : '#f4f1ea';
      for (let j = 0; j < 9; j++) hline(ctx, 15 - (j * (i + 1)) / 3, 2 + j, 1 + (j * (i + 1)) / 1.5, c);
    }
    ellipse(ctx, 15, 8, 14, 5, '#2f6b4f');
    ellipse(ctx, 15, 7, 12, 4, '#3f8a5f');
    for (let i = -12; i <= 12; i += 6) vline(ctx, 15 + i, 4, 6, '#f4f1ea');
    rect(ctx, 3, 24, 6, 5, '#8a5a36');
    rect(ctx, 21, 24, 6, 5, '#8a5a36');
  },
});
def({
  id: 'aframe',
  w: 14,
  h: 18,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 7, 16, 5, 2);
    rect(ctx, 2, 3, 10, 12, '#2a2a2e');
    strokeRect(ctx, 2, 3, 10, 12, P.woodLight);
    hline(ctx, 4, 6, 6, '#f4f1ea');
    hline(ctx, 4, 9, 5, '#f2c94c');
    hline(ctx, 4, 12, 6, '#f4f1ea');
  },
});
def({
  id: 'valet',
  w: 14,
  h: 22,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 7, 20, 5, 2);
    box(ctx, 2, 5, 10, 3, 12, '#3a1424', '#2a0c18');
    hline(ctx, 2, 8, 10, P.gold);
    drawText(ctx, 'V', 5, 11, P.goldLight, '3x5');
  },
});
def({
  id: 'rope',
  w: 32,
  h: 18,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    for (const x of [2, 28]) {
      rect(ctx, x, 4, 2, 12, P.gold);
      rect(ctx, x - 1, 14, 4, 2, P.goldDark);
      circle(ctx, x + 1, 3, 2, P.goldLight);
    }
    for (let i = 0; i < 24; i++) px(ctx, 4 + i, 6 + Math.round(Math.sin((i / 23) * Math.PI) * 3), '#a3202f');
    for (let i = 0; i < 24; i++) px(ctx, 4 + i, 7 + Math.round(Math.sin((i / 23) * Math.PI) * 3), '#7d1622');
  },
});
def({
  id: 'limo',
  w: 70,
  h: 26,
  foot: { w: 4, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 35, 23, 33, 3);
    rect(ctx, 2, 12, 66, 9, '#141218');
    rect(ctx, 12, 5, 46, 8, '#141218');
    for (let x = 14; x < 56; x += 10) rect(ctx, x, 6, 8, 6, '#3a4a5a');
    hline(ctx, 2, 12, 66, '#3a3a44');
    circle(ctx, 12, 21, 4, '#0a0a0a');
    circle(ctx, 58, 21, 4, '#0a0a0a');
    circle(ctx, 12, 21, 2, '#9a9a9a');
    circle(ctx, 58, 21, 2, '#9a9a9a');
    rect(ctx, 66, 13, 2, 3, '#f2e6a0');
    strokeRect(ctx, 2, 12, 66, 9, O);
  },
});
def({
  id: 'gate_pillar',
  w: 16,
  h: 44,
  foot: { w: 1, h: 1 },
  light: { x: 8, y: 4, r: 36, color: '#ffd88a' },
  draw: (ctx) => {
    shadow(ctx, 8, 41, 7, 2);
    box(ctx, 2, 10, 12, 3, 29, '#b9b3a8', '#9a948a');
    rect(ctx, 1, 8, 14, 3, '#cfc9be');
    rect(ctx, 5, 2, 6, 6, '#2a2e38');
    rect(ctx, 6, 3, 4, 4, '#e8d9a8');
  },
  night: (ctx) => rect(ctx, 6, 3, 4, 4, '#fff1c0'),
});
def({
  id: 'guard_booth',
  w: 32,
  h: 38,
  foot: { w: 2, h: 1 },
  light: { x: 16, y: 14, r: 30, color: '#ffe6a8' },
  draw: (ctx) => {
    shadow(ctx, 16, 35, 14, 3);
    rect(ctx, 2, 4, 28, 5, '#3a3f4a');
    rect(ctx, 4, 9, 24, 26, '#d6cbb5');
    rect(ctx, 7, 12, 18, 10, P.glass);
    dither(ctx, 7, 12, 18, 10, P.glassLight);
    strokeRect(ctx, 4, 9, 24, 26, O);
    drawText(ctx, 'GATE', 8, 26, '#5a5040', '3x5');
  },
  night: (ctx) => rect(ctx, 7, 12, 18, 10, '#ffe6a8'),
});
def({
  id: 'atm_street',
  w: 14,
  h: 26,
  foot: { w: 1, h: 1 },
  light: { x: 7, y: 9, r: 18, color: '#9fe0ff' },
  draw: (ctx) => {
    shadow(ctx, 7, 24, 6, 2);
    box(ctx, 1, 2, 12, 3, 20, '#5a606a', '#4a4f58');
    rect(ctx, 3, 6, 8, 6, '#1a3a5a');
    rect(ctx, 4, 7, 6, 4, '#3a8ab8');
    rect(ctx, 4, 14, 6, 3, '#2a2e38');
    drawText(ctx, 'ATM', 2, 19, '#e2c661', '3x5');
  },
  night: (ctx) => rect(ctx, 4, 7, 6, 4, '#9fe0ff'),
});
def({
  id: 'bike_rack',
  w: 32,
  h: 16,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    for (let x = 3; x < 30; x += 7) {
      ring(ctx, x + 2, 9, 3, '#7a8088');
    }
    hline(ctx, 2, 13, 28, '#5a606a');
  },
});
def({
  id: 'court_lines',
  w: 176,
  h: 128,
  foot: { w: 0, h: 0 },
  ground: true,
  draw: (ctx) => {
    rect(ctx, 0, 0, 176, 128, '#3f6f8a');
    speckle(ctx, 0, 0, 176, 128, '#36607a', 0.08, 5);
    ctx.strokeStyle = '#e8e8e8';
    strokeRect(ctx, 4, 4, 168, 120, '#e8e8e8');
    vline(ctx, 88, 4, 120, '#e8e8e8');
    ring(ctx, 88, 64, 14, '#e8e8e8');
    rect(ctx, 4, 44, 30, 40, '#b8643c');
    rect(ctx, 142, 44, 30, 40, '#b8643c');
    strokeRect(ctx, 4, 44, 30, 40, '#e8e8e8');
    strokeRect(ctx, 142, 44, 30, 40, '#e8e8e8');
  },
});
def({
  id: 'pond',
  w: 140,
  h: 100,
  foot: { w: 0, h: 0 },
  ground: true,
  frames: 3,
  draw: (ctx, f) => {
    ellipse(ctx, 70, 50, 68, 46, '#7a6a4a');
    ellipse(ctx, 70, 50, 65, 43, P.water);
    ellipse(ctx, 66, 46, 50, 32, shade(P.water, 0.05));
    for (let i = 0; i < 10; i++) hline(ctx, 20 + ((i * 23 + f * 5) % 100), 20 + ((i * 17) % 60), 5, P.waterLight);
    for (let i = 0; i < 5; i++) {
      const x = 30 + i * 18;
      const y = 60 + ((i * 7) % 20);
      ellipse(ctx, x, y, 4, 2, '#3f8a4a');
      px(ctx, x + 1, y - 1, '#f8d0e0');
    }
  },
});

// ------------------------------------------------------------------ interior: home

def({
  id: 'bed_single',
  w: 20,
  h: 34,
  foot: { w: 1, h: 2 },
  draw: (ctx) => {
    box(ctx, 1, 2, 18, 26, 5, '#e8e2d0', '#8a5a36');
    rect(ctx, 1, 0, 18, 6, '#8a5a36');
    rect(ctx, 3, 4, 14, 6, '#f4f1ea');
    rect(ctx, 2, 12, 16, 16, '#5a7bbf');
    hline(ctx, 2, 12, 16, '#7a9bdf');
    for (let y = 15; y < 28; y += 4) hline(ctx, 3, y, 14, '#4a6aa8');
    strokeRect(ctx, 1, 0, 18, 33, O);
  },
});
def({
  id: 'bed_double',
  w: 34,
  h: 38,
  foot: { w: 2, h: 2 },
  draw: (ctx) => {
    box(ctx, 1, 4, 32, 26, 6, '#e8e2d0', '#6a4428');
    rect(ctx, 1, 0, 32, 7, '#6a4428');
    rect(ctx, 4, 5, 11, 6, '#f4f1ea');
    rect(ctx, 19, 5, 11, 6, '#f4f1ea');
    rect(ctx, 2, 13, 30, 17, '#9a3a4a');
    hline(ctx, 2, 13, 30, '#c25a6a');
    for (let x = 6; x < 30; x += 6) vline(ctx, x, 15, 14, '#842e3c');
    strokeRect(ctx, 1, 0, 32, 37, O);
  },
});
def({
  id: 'bed_luxury',
  w: 50,
  h: 44,
  foot: { w: 3, h: 2 },
  draw: (ctx) => {
    box(ctx, 1, 8, 48, 26, 8, '#f4f1ea', '#3a2416');
    rect(ctx, 1, 0, 48, 10, '#3a2416');
    rect(ctx, 4, 2, 42, 6, '#c9a25a');
    for (let x = 6; x < 46; x += 4) vline(ctx, x, 2, 6, '#a8843a');
    rect(ctx, 6, 9, 16, 7, '#ffffff');
    rect(ctx, 28, 9, 16, 7, '#ffffff');
    rect(ctx, 2, 18, 46, 16, '#2a2a4a');
    hline(ctx, 2, 18, 46, '#4a4a7a');
    rect(ctx, 2, 30, 46, 4, '#c9a25a');
    strokeRect(ctx, 1, 0, 48, 43, O);
  },
});
def({
  id: 'wardrobe',
  w: 32,
  h: 38,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    box(ctx, 1, 2, 30, 4, 32, P.woodLight, P.wood);
    vline(ctx, 16, 7, 28, P.woodDark);
    px(ctx, 14, 20, P.gold);
    px(ctx, 18, 20, P.gold);
    for (let y = 10; y < 34; y += 8) {
      hline(ctx, 4, y, 10, shade(P.wood, 0.1));
      hline(ctx, 18, y, 10, shade(P.wood, 0.1));
    }
  },
});
def({
  id: 'desk',
  w: 32,
  h: 30,
  foot: { w: 2, h: 1 },
  light: { x: 16, y: 6, r: 22, color: '#8fd0ff' },
  draw: (ctx) => {
    box(ctx, 1, 10, 30, 8, 10, P.woodPale, P.woodLight);
    rect(ctx, 10, 0, 14, 10, '#2a2e38');
    rect(ctx, 11, 1, 12, 7, '#3a7ab8');
    rect(ctx, 16, 10, 2, 2, '#2a2e38');
    rect(ctx, 6, 13, 6, 2, '#e8e8e8');
    rect(ctx, 22, 12, 4, 4, '#c2283a');
  },
  night: (ctx) => rect(ctx, 11, 1, 12, 7, '#8fd0ff'),
});
def({
  id: 'chair',
  w: 12,
  h: 16,
  foot: { w: 1, h: 1 },
  draw: (ctx) => chairTop(ctx, 1, 2, P.woodLight, P.wood),
});
def({
  id: 'sofa',
  w: 48,
  h: 26,
  foot: { w: 3, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 24, 24, 22, 2);
    rect(ctx, 2, 2, 44, 10, '#4a6a8a');
    rect(ctx, 2, 10, 44, 10, '#5a7a9a');
    rect(ctx, 0, 6, 6, 16, '#3e5a76');
    rect(ctx, 42, 6, 6, 16, '#3e5a76');
    vline(ctx, 17, 11, 9, '#4a6a8a');
    vline(ctx, 31, 11, 9, '#4a6a8a');
    hline(ctx, 2, 10, 44, '#7a9aba');
    strokeRect(ctx, 0, 2, 48, 20, O);
  },
});
def({
  id: 'sofa_red',
  w: 48,
  h: 26,
  foot: { w: 3, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 24, 24, 22, 2);
    rect(ctx, 2, 2, 44, 10, '#7a1626');
    rect(ctx, 2, 10, 44, 10, '#9a2232');
    rect(ctx, 0, 6, 6, 16, '#5a0e1c');
    rect(ctx, 42, 6, 6, 16, '#5a0e1c');
    for (let x = 8; x < 44; x += 8) px(ctx, x, 6, P.gold);
    hline(ctx, 2, 10, 44, '#c23a4a');
    strokeRect(ctx, 0, 2, 48, 20, O);
  },
});
def({
  id: 'armchair',
  w: 20,
  h: 22,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 10, 20, 9, 2);
    rect(ctx, 2, 2, 16, 8, '#6a3a26');
    rect(ctx, 2, 9, 16, 9, '#7a4a32');
    rect(ctx, 0, 6, 4, 13, '#5a2e1c');
    rect(ctx, 16, 6, 4, 13, '#5a2e1c');
    for (let x = 5; x < 16; x += 4) px(ctx, x, 5, '#c9a25a');
    strokeRect(ctx, 0, 2, 20, 17, O);
  },
});
def({
  id: 'coffee_table',
  w: 32,
  h: 18,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 16, 16, 14, 2);
    box(ctx, 2, 3, 28, 7, 4, P.woodLight, P.wood);
    rect(ctx, 6, 4, 6, 4, '#e8e2d0');
    circle(ctx, 22, 6, 2, '#f4f1ea');
    rect(ctx, 3, 14, 2, 3, P.woodDark);
    rect(ctx, 27, 14, 2, 3, P.woodDark);
  },
});
def({
  id: 'tv',
  w: 34,
  h: 30,
  foot: { w: 2, h: 1 },
  light: { x: 17, y: 8, r: 34, color: '#9fc8ff' },
  frames: 2,
  draw: (ctx, f) => {
    box(ctx, 1, 18, 32, 4, 8, P.woodDark, '#4a2e1a');
    rect(ctx, 3, 0, 28, 17, '#141218');
    rect(ctx, 4, 1, 26, 14, f ? '#3a6aa8' : '#4a8ab8');
    for (let i = 0; i < 4; i++) hline(ctx, 6, 3 + i * 3, 10 + ((i + f) % 3) * 4, f ? '#7ab8e8' : '#e8c86a');
    rect(ctx, 15, 16, 4, 2, '#2a2a2e');
  },
  night: (ctx, f) => rect(ctx, 4, 1, 26, 14, f ? '#6a9ad8' : '#8ac8f8'),
});
def({
  id: 'fridge',
  w: 18,
  h: 34,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 1, 1, 16, 3, 29, '#f0f0ec', '#dcdcd6');
    hline(ctx, 2, 13, 14, '#a8a8a2');
    vline(ctx, 14, 7, 4, '#8a8a84');
    vline(ctx, 14, 16, 8, '#8a8a84');
    rect(ctx, 4, 6, 3, 3, '#e04a5a');
    rect(ctx, 8, 7, 2, 2, '#f2c94c');
  },
});
def({
  id: 'stove',
  w: 18,
  h: 28,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 1, 4, 16, 9, 14, '#3a3a40', '#e8e8e4');
    for (const [x, y] of [[5, 6], [12, 6], [5, 10], [12, 10]]) ring(ctx, x, y, 2, '#8a8a8a');
    rect(ctx, 3, 15, 12, 8, '#2a2a30');
    hline(ctx, 4, 17, 10, '#5a5a62');
  },
});
def({
  id: 'counter',
  w: 16,
  h: 28,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 0, 4, 16, 9, 14, '#d8ccb4', P.woodLight);
    hline(ctx, 2, 18, 12, P.woodDark);
    px(ctx, 8, 21, P.gold);
  },
});
def({
  id: 'sink',
  w: 16,
  h: 28,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 0, 4, 16, 9, 14, '#d8ccb4', P.woodLight);
    rect(ctx, 3, 6, 10, 5, '#a8b8c8');
    rect(ctx, 4, 7, 8, 3, '#c8d8e8');
    vline(ctx, 8, 2, 4, '#9aa0a8');
  },
});
def({
  id: 'bathtub',
  w: 32,
  h: 24,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    box(ctx, 1, 2, 30, 12, 8, '#f4f4f0', '#dcdcd6');
    rect(ctx, 4, 4, 24, 8, '#a8d0e8');
    hline(ctx, 4, 4, 24, '#c8e8f8');
  },
});
def({
  id: 'toilet',
  w: 14,
  h: 20,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 3, 1, 8, 3, 5, '#f4f4f0', '#dcdcd6');
    ellipse(ctx, 7, 13, 5, 4, '#f4f4f0');
    ellipse(ctx, 7, 13, 3, 2, '#c8d8e8');
    strokeRect(ctx, 3, 1, 8, 8, O);
  },
});
for (const [id, a, b] of [
  ['rug', '#7a3a4a', '#c9a25a'],
  ['rug_blue', '#2a4a6a', '#c9d6e2'],
  ['rug_green', '#2f5a44', '#e0b13e'],
] as const) {
  def({
    id,
    w: 48,
    h: 32,
    foot: { w: 0, h: 0 },
    ground: true,
    draw: (ctx) => {
      rect(ctx, 0, 0, 48, 32, b);
      rect(ctx, 2, 2, 44, 28, a);
      strokeRect(ctx, 5, 5, 38, 22, b);
      for (let j = 0; j < 32; j++) for (let i = 0; i < 48; i++) if (Math.abs(i - 24) / 24 + Math.abs(j - 16) / 16 < 0.35 && (i + j) % 3 === 0) px(ctx, i, j, b);
    },
  });
}
def({
  id: 'plant',
  w: 18,
  h: 30,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 9, 28, 6, 2);
    rect(ctx, 4, 19, 10, 9, '#c8c0b0');
    rect(ctx, 3, 19, 12, 2, '#d8d0c0');
    strokeRect(ctx, 3, 19, 12, 9, O);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.45;
      for (let r = 2; r < 14; r++) px(ctx, Math.round(9 + Math.cos(a) * r), Math.round(19 + Math.sin(a) * r), r > 10 ? '#5fa24c' : '#3f7a38');
    }
  },
});
def({
  id: 'palm',
  w: 26,
  h: 40,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 13, 38, 7, 2);
    rect(ctx, 8, 29, 10, 9, '#3a2a2a');
    rect(ctx, 7, 29, 12, 2, P.gold);
    strokeRect(ctx, 7, 29, 12, 9, O);
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.38;
      for (let r = 2; r < 16; r++) {
        const x = Math.round(13 + Math.cos(a) * r);
        const y = Math.round(29 + Math.sin(a) * r + (r * r) / 40);
        px(ctx, x, y, r > 11 ? '#5fa24c' : '#2f6a2e');
      }
    }
  },
});
def({
  id: 'bookshelf',
  w: 32,
  h: 38,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    box(ctx, 1, 2, 30, 3, 33, P.woodDark, P.wood);
    for (let s = 0; s < 4; s++) {
      const y = 7 + s * 8;
      rect(ctx, 3, y, 26, 7, '#3a2416');
      for (let i = 0; i < 12; i++) {
        const c = ['#a3242f', '#2a4a8a', '#3f7a38', '#c9a25a', '#e8e2d0', '#5a3a6a'][(i * 7 + s) % 6];
        const h = 5 + ((i + s) % 3);
        rect(ctx, 4 + i * 2, y + 7 - h, 2, h, c);
      }
      hline(ctx, 3, y + 7, 26, P.woodLight);
    }
  },
});
def({
  id: 'lamp_floor',
  w: 12,
  h: 32,
  foot: { w: 1, h: 1 },
  light: { x: 6, y: 6, r: 40, color: '#ffd8a0', always: true },
  draw: (ctx) => {
    shadow(ctx, 6, 30, 4, 1);
    rect(ctx, 5, 10, 2, 19, '#3a3a3a');
    rect(ctx, 3, 28, 6, 2, '#3a3a3a');
    rect(ctx, 1, 2, 10, 8, '#e8d9a8');
    hline(ctx, 1, 9, 10, '#c8b988');
    strokeRect(ctx, 1, 2, 10, 8, O);
  },
  night: (ctx) => rect(ctx, 2, 3, 8, 6, '#fff1c0'),
});
for (const [id, w, h] of [
  ['window', 26, 20],
  ['window_tall', 20, 28],
] as const) {
  def({
    id,
    w,
    h,
    foot: { w: 0, h: 0 },
    wall: true,
    draw: (ctx) => {
      rect(ctx, 0, 0, w, h, '#e8e2d0');
      rect(ctx, 2, 2, w - 4, h - 4, '#8fbfe0');
      rect(ctx, 2, 2 + Math.floor((h - 4) / 2), w - 4, Math.ceil((h - 4) / 2), '#a8d0ec');
      vline(ctx, Math.floor(w / 2), 2, h - 4, '#e8e2d0');
      hline(ctx, 2, Math.floor(h / 2), w - 4, '#e8e2d0');
      for (let i = 0; i < 4; i++) px(ctx, 4 + i, h - 5 - i, '#e8f4ff');
      hline(ctx, 0, h - 1, w, '#b8ae9c');
      strokeRect(ctx, 0, 0, w, h, O);
    },
  });
}
def({
  id: 'painting',
  w: 22,
  h: 16,
  foot: { w: 0, h: 0 },
  wall: true,
  draw: (ctx) => {
    rect(ctx, 0, 0, 22, 16, P.gold);
    rect(ctx, 2, 2, 18, 12, '#3a5a7a');
    rect(ctx, 2, 9, 18, 5, '#3f7a38');
    circle(ctx, 15, 6, 2, '#f2c94c');
    strokeRect(ctx, 0, 0, 22, 16, O);
  },
});
def({
  id: 'art_large',
  w: 32,
  h: 22,
  foot: { w: 0, h: 0 },
  wall: true,
  draw: (ctx) => {
    rect(ctx, 0, 0, 32, 22, '#141218');
    rect(ctx, 2, 2, 28, 18, '#e8e2d0');
    rect(ctx, 5, 5, 10, 12, '#c2283a');
    rect(ctx, 17, 8, 10, 9, '#2a4a9a');
    circle(ctx, 22, 6, 3, '#e0b13e');
  },
});
def({
  id: 'clock',
  w: 12,
  h: 12,
  foot: { w: 0, h: 0 },
  wall: true,
  draw: (ctx) => {
    circle(ctx, 6, 6, 5, O);
    circle(ctx, 6, 6, 4, '#f4f1ea');
    vline(ctx, 6, 3, 4, '#2a2a2a');
    hline(ctx, 6, 6, 3, '#2a2a2a');
  },
});
def({
  id: 'piano',
  w: 44,
  h: 36,
  foot: { w: 3, h: 1 },
  draw: (ctx) => {
    box(ctx, 2, 2, 40, 6, 24, '#1a1a1e', '#141218');
    rect(ctx, 6, 14, 32, 6, '#f4f1ea');
    for (let x = 7; x < 38; x += 3) vline(ctx, x, 14, 4, '#1a1a1e');
    rect(ctx, 16, 28, 12, 6, '#3a2416');
  },
});
def({
  id: 'treadmill',
  w: 18,
  h: 30,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    rect(ctx, 3, 8, 12, 20, '#2a2a30');
    rect(ctx, 4, 10, 10, 16, '#4a4a52');
    rect(ctx, 2, 2, 14, 6, '#3a3a40');
    rect(ctx, 5, 3, 8, 3, '#3ab86a');
    strokeRect(ctx, 3, 8, 12, 20, O);
  },
});

// ------------------------------------------------------------------ shops / venues

def({
  id: 'cafe_counter',
  w: 16,
  h: 28,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 0, 4, 16, 8, 15, '#3a2416', '#8a5a36');
    hline(ctx, 0, 4, 16, '#5a3a24');
    for (let x = 2; x < 16; x += 4) vline(ctx, x, 13, 14, '#6a4428');
  },
});
def({
  id: 'espresso',
  w: 18,
  h: 30,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 0, 6, 18, 8, 15, '#3a2416', '#8a5a36');
    rect(ctx, 3, 0, 12, 9, '#c8ccd2');
    rect(ctx, 4, 1, 10, 3, '#e8ecf2');
    rect(ctx, 6, 6, 2, 3, '#2a2a2e');
    rect(ctx, 10, 6, 2, 3, '#2a2a2e');
    strokeRect(ctx, 3, 0, 12, 9, O);
  },
});
def({
  id: 'pastry_case',
  w: 32,
  h: 30,
  foot: { w: 2, h: 1 },
  light: { x: 16, y: 10, r: 26, color: '#ffe8b8', always: true },
  draw: (ctx) => {
    box(ctx, 0, 8, 32, 6, 15, '#3a2416', '#8a5a36');
    rect(ctx, 2, 0, 28, 12, rgba('#d8eef8', 0.8));
    for (let i = 0; i < 6; i++) {
      circle(ctx, 6 + i * 4, 8, 2, ['#c9965f', '#e8c48a', '#a0522d', '#f4d0a0'][i % 4]);
      circle(ctx, 6 + i * 4, 4, 2, ['#f8d0e0', '#c9965f', '#e8c48a'][i % 3]);
    }
    strokeRect(ctx, 2, 0, 28, 12, '#8a8a8a');
  },
});
def({
  id: 'table_round',
  w: 18,
  h: 20,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 9, 18, 7, 2);
    ellipse(ctx, 9, 7, 8, 5, O);
    ellipse(ctx, 9, 7, 7, 4, '#e8e2d0');
    ellipse(ctx, 9, 6, 6, 3, '#f4f1ea');
    rect(ctx, 8, 11, 2, 6, '#3a3a3a');
    hline(ctx, 5, 17, 8, '#3a3a3a');
    circle(ctx, 11, 6, 1, '#8a5a36');
  },
});
def({
  id: 'chair_cafe',
  w: 12,
  h: 16,
  foot: { w: 1, h: 1 },
  draw: (ctx) => chairTop(ctx, 1, 2, '#2f5e45', '#3f7a5a'),
});
def({
  id: 'chalkboard',
  w: 30,
  h: 20,
  foot: { w: 0, h: 0 },
  wall: true,
  draw: (ctx) => {
    rect(ctx, 0, 0, 30, 20, P.woodLight);
    rect(ctx, 2, 2, 26, 16, '#2a3a32');
    drawText(ctx, 'MENU', 6, 3, '#f4f1ea', '3x5');
    for (let i = 0; i < 3; i++) {
      hline(ctx, 4, 10 + i * 3, 12, '#c8d0c8');
      hline(ctx, 20, 10 + i * 3, 5, '#f2c94c');
    }
  },
});
def({
  id: 'shelf',
  w: 32,
  h: 32,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    box(ctx, 1, 2, 30, 4, 28, '#e8e8e4', '#cfcfc8');
    for (let s = 0; s < 3; s++) {
      const y = 8 + s * 8;
      hline(ctx, 2, y + 6, 28, '#a8a8a2');
      for (let i = 0; i < 9; i++) {
        const c = ['#e04a5a', '#f2c94c', '#3f8a5a', '#2a62a8', '#f4f1ea', '#e86a2a', '#8a2d5a'][(i * 3 + s * 5) % 7];
        rect(ctx, 3 + i * 3, y + 1 + (i % 2), 2, 5 - (i % 2), c);
      }
    }
  },
});
def({
  id: 'fridge_case',
  w: 32,
  h: 36,
  foot: { w: 2, h: 1 },
  light: { x: 16, y: 16, r: 30, color: '#d8f0ff', always: true },
  draw: (ctx) => {
    box(ctx, 1, 1, 30, 3, 32, '#c8ccd2', '#a8acb2');
    for (const x of [3, 17]) {
      rect(ctx, x, 6, 12, 26, '#bfe0f0');
      for (let s = 0; s < 4; s++)
        for (let i = 0; i < 4; i++) rect(ctx, x + 1 + i * 3, 8 + s * 6, 2, 4, ['#e04a5a', '#3f8a5a', '#f2c94c', '#2a62a8', '#e86a2a'][(i + s + x) % 5]);
      strokeRect(ctx, x, 6, 12, 26, '#8a9098');
    }
  },
  night: (ctx) => {
    ctx.fillStyle = 'rgba(220,240,255,0.35)';
    ctx.fillRect(3, 6, 26, 26);
  },
});
def({
  id: 'register',
  w: 32,
  h: 28,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    box(ctx, 0, 6, 32, 8, 13, '#d8d8d2', '#3a62a8');
    rect(ctx, 18, 0, 10, 8, '#2a2e38');
    rect(ctx, 19, 1, 8, 4, '#3ab86a');
    rect(ctx, 4, 7, 8, 5, '#f2c94c');
    hline(ctx, 0, 17, 32, '#2a4a8a');
  },
});
def({
  id: 'magazine_rack',
  w: 16,
  h: 26,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 1, 2, 14, 3, 20, '#c8c8c2', '#a8a8a2');
    for (let s = 0; s < 3; s++) for (let i = 0; i < 3; i++) rect(ctx, 3 + i * 4, 6 + s * 6, 3, 5, ['#e04a5a', '#2a62a8', '#f2c94c', '#3f8a5a', '#8a2d5a'][(i + s * 2) % 5]);
  },
});
def({
  id: 'dining_table',
  w: 34,
  h: 26,
  foot: { w: 2, h: 1 },
  light: { x: 17, y: 6, r: 22, color: '#ffcf8a', always: true },
  draw: (ctx) => {
    shadow(ctx, 17, 24, 15, 2);
    box(ctx, 1, 4, 32, 10, 8, '#f4f1ea', '#d8d2c4');
    for (let x = 3; x < 32; x += 4) vline(ctx, x, 15, 6, '#c8c0b0');
    circle(ctx, 9, 8, 2, '#e8e8e8');
    circle(ctx, 25, 8, 2, '#e8e8e8');
    rect(ctx, 16, 3, 2, 4, '#f4f1ea');
    px(ctx, 16, 2, '#ffd27a');
  },
  night: (ctx) => {
    px(ctx, 16, 2, '#fff1c0');
    px(ctx, 17, 2, '#ffd27a');
  },
});
def({
  id: 'bar_counter',
  w: 16,
  h: 28,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 0, 4, 16, 8, 15, '#2a1a10', '#5a3a24');
    hline(ctx, 0, 11, 16, '#c9965f');
    for (let x = 1; x < 16; x += 5) vline(ctx, x, 13, 14, '#4a2e1c');
  },
});
def({
  id: 'bar_counter_lux',
  w: 16,
  h: 28,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 0, 4, 16, 8, 15, '#141218', '#2a0c18');
    hline(ctx, 0, 11, 16, P.gold);
    hline(ctx, 0, 25, 16, P.goldDark);
    for (let x = 3; x < 16; x += 6) vline(ctx, x, 14, 10, '#3a1424');
  },
});
def({
  id: 'stool',
  w: 12,
  h: 16,
  foot: { w: 0, h: 0 },
  draw: (ctx) => {
    shadow(ctx, 6, 14, 4, 1);
    ellipse(ctx, 6, 5, 5, 2, '#9a2232');
    ellipse(ctx, 6, 4, 4, 1, '#c23a4a');
    rect(ctx, 5, 7, 2, 7, '#8a8a8a');
    hline(ctx, 3, 11, 6, '#8a8a8a');
  },
});
def({
  id: 'bottle_shelf',
  w: 48,
  h: 26,
  foot: { w: 0, h: 0 },
  wall: true,
  light: { x: 24, y: 13, r: 30, color: '#ffb86a', always: true },
  draw: (ctx) => {
    rect(ctx, 0, 0, 48, 26, '#2a1a10');
    for (let s = 0; s < 2; s++) {
      const y = 3 + s * 12;
      hline(ctx, 1, y + 9, 46, '#c9965f');
      for (let i = 0; i < 14; i++) {
        const c = ['#3f8a5a', '#a0522d', '#e8e2d0', '#5a3a6a', '#c9a25a', '#2a62a8'][(i * 5 + s) % 6];
        rect(ctx, 2 + i * 3 + (s % 2), y + 2, 2, 7, c);
        px(ctx, 2 + i * 3 + (s % 2), y + 1, c);
        px(ctx, 2 + i * 3 + (s % 2), y + 3, shade(c, 0.4));
      }
    }
    strokeRect(ctx, 0, 0, 48, 26, O);
  },
});
def({
  id: 'booth',
  w: 34,
  h: 30,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    rect(ctx, 1, 0, 32, 10, '#6a1a1a');
    hline(ctx, 1, 9, 32, '#8a2a2a');
    box(ctx, 5, 10, 24, 8, 5, P.woodLight, P.wood);
    rect(ctx, 1, 22, 32, 7, '#6a1a1a');
    strokeRect(ctx, 1, 0, 32, 10, O);
  },
});
def({
  id: 'pool_table',
  w: 50,
  h: 34,
  foot: { w: 3, h: 2 },
  draw: (ctx) => {
    shadow(ctx, 25, 31, 22, 3);
    box(ctx, 1, 2, 48, 22, 7, '#5a3a24', '#4a2e1c');
    rect(ctx, 4, 5, 42, 16, P.felt);
    for (const [x, y] of [[4, 5], [24, 5], [45, 5], [4, 20], [24, 20], [45, 20]]) circle(ctx, x, y, 1, '#0a0a0a');
    for (let i = 0; i < 6; i++) circle(ctx, 32 + (i % 3) * 3, 10 + Math.floor(i / 3) * 3, 1, ['#e04a5a', '#f2c94c', '#2a62a8', '#3f8a5a', '#8a2d5a', '#e86a2a'][i]);
    circle(ctx, 14, 13, 1, '#f4f1ea');
  },
});
def({
  id: 'jukebox',
  w: 18,
  h: 30,
  foot: { w: 1, h: 1 },
  frames: 2,
  light: { x: 9, y: 10, r: 26, color: '#ff7ad8', always: true },
  draw: (ctx, f) => {
    rect(ctx, 1, 4, 16, 24, '#5a1a3a');
    ellipse(ctx, 9, 6, 8, 5, '#5a1a3a');
    rect(ctx, 4, 8, 10, 8, f ? '#ff7ad8' : '#7ad8ff');
    for (let x = 4; x < 14; x += 2) vline(ctx, x, 18, 8, '#e0b13e');
    strokeRect(ctx, 1, 4, 16, 24, O);
  },
});
def({
  id: 'dartboard',
  w: 14,
  h: 14,
  foot: { w: 0, h: 0 },
  wall: true,
  draw: (ctx) => {
    circle(ctx, 7, 7, 6, '#1a1a1a');
    circle(ctx, 7, 7, 5, '#e8e2d0');
    circle(ctx, 7, 7, 3, '#c2283a');
    circle(ctx, 7, 7, 1, '#3f8a5a');
  },
});
def({
  id: 'stage',
  w: 64,
  h: 24,
  foot: { w: 0, h: 0 },
  ground: true,
  draw: (ctx) => {
    box(ctx, 0, 0, 64, 18, 6, '#5a3a24', '#3a2416', null);
    for (let x = 0; x < 64; x += 8) vline(ctx, x, 0, 18, '#4a2e1c');
    rect(ctx, 26, 4, 2, 10, '#3a3a3a');
    circle(ctx, 27, 3, 2, '#5a5a5a');
  },
});
def({
  id: 'clothes_rack',
  w: 32,
  h: 30,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    hline(ctx, 2, 4, 28, '#8a8a8a');
    vline(ctx, 2, 4, 24, '#8a8a8a');
    vline(ctx, 29, 4, 24, '#8a8a8a');
    for (let i = 0; i < 6; i++) {
      const c = ['#2b3448', '#c86a3a', '#e6e1d3', '#8a4a6a', '#3f8a5a', '#1c1c24'][i];
      rect(ctx, 4 + i * 4, 5, 4, 16, c);
      vline(ctx, 7 + i * 4, 5, 16, shade(c, -0.25));
    }
    hline(ctx, 0, 28, 32, '#5a5a5a');
  },
});
def({
  id: 'mannequin',
  w: 14,
  h: 32,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 7, 30, 4, 1);
    circle(ctx, 7, 4, 3, '#e8e2d0');
    rect(ctx, 3, 8, 8, 12, '#5a1630');
    rect(ctx, 4, 20, 6, 4, '#3f0e21');
    rect(ctx, 6, 24, 2, 5, '#8a8a8a');
    hline(ctx, 3, 29, 8, '#5a5a5a');
    hline(ctx, 4, 9, 6, P.gold);
  },
});
def({
  id: 'display_case',
  w: 32,
  h: 26,
  foot: { w: 2, h: 1 },
  light: { x: 16, y: 8, r: 22, color: '#fff2d0', always: true },
  draw: (ctx) => {
    box(ctx, 0, 8, 32, 4, 14, '#141218', '#2a2730');
    rect(ctx, 2, 0, 28, 10, rgba('#e8f4ff', 0.75));
    for (let i = 0; i < 5; i++) {
      circle(ctx, 6 + i * 5, 6, 2, P.gold);
      px(ctx, 6 + i * 5, 6, '#f4f1ea');
    }
    strokeRect(ctx, 2, 0, 28, 10, '#a8a8a8');
  },
});
def({
  id: 'mirror',
  w: 16,
  h: 26,
  foot: { w: 0, h: 0 },
  wall: true,
  draw: (ctx) => {
    rect(ctx, 0, 0, 16, 26, P.gold);
    rect(ctx, 2, 2, 12, 22, '#c8dcec');
    for (let i = 0; i < 6; i++) px(ctx, 4 + i, 18 - i * 2, '#f4faff');
  },
});
def({
  id: 'teller',
  w: 16,
  h: 34,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 0, 10, 16, 8, 15, '#d9d2c2', '#8a6a4a');
    rect(ctx, 1, 0, 14, 10, rgba('#d8eef8', 0.6));
    vline(ctx, 0, 0, 10, '#a8a8a8');
    vline(ctx, 15, 0, 10, '#a8a8a8');
    hline(ctx, 0, 0, 16, '#a8a8a8');
  },
});
def({
  id: 'atm',
  w: 16,
  h: 28,
  foot: { w: 1, h: 1 },
  light: { x: 8, y: 9, r: 20, color: '#9fe0ff', always: true },
  draw: (ctx) => {
    box(ctx, 1, 2, 14, 3, 22, '#5a606a', '#4a4f58');
    rect(ctx, 3, 6, 10, 7, '#1a3a5a');
    rect(ctx, 4, 7, 8, 5, '#3a8ab8');
    rect(ctx, 4, 15, 8, 3, '#2a2e38');
    drawText(ctx, 'ATM', 3, 20, '#e2c661', '3x5');
  },
});
def({
  id: 'vault',
  w: 34,
  h: 30,
  foot: { w: 0, h: 0 },
  wall: true,
  draw: (ctx) => {
    rect(ctx, 0, 0, 34, 30, '#5a606a');
    circle(ctx, 17, 15, 12, '#8a9098');
    circle(ctx, 17, 15, 10, '#6a7078');
    for (let a = 0; a < 6; a++) {
      const r = (a * Math.PI) / 3;
      hline(ctx, Math.round(17 + Math.cos(r) * 6) - 1, Math.round(15 + Math.sin(r) * 6), 3, '#c8ccd2');
    }
    circle(ctx, 17, 15, 3, '#c8ccd2');
    strokeRect(ctx, 0, 0, 34, 30, O);
  },
});
def({
  id: 'cubicle',
  w: 34,
  h: 32,
  foot: { w: 2, h: 1 },
  light: { x: 17, y: 12, r: 18, color: '#a8d8ff' },
  draw: (ctx) => {
    rect(ctx, 0, 0, 34, 8, '#6f86a6');
    hline(ctx, 0, 0, 34, '#8fa6c6');
    box(ctx, 1, 14, 32, 6, 9, '#d8d2c4', '#a8a296');
    rect(ctx, 11, 4, 12, 10, '#2a2e38');
    rect(ctx, 12, 5, 10, 7, '#3a7ab8');
    rect(ctx, 4, 16, 6, 3, '#f4f1ea');
    rect(ctx, 26, 15, 3, 4, '#e86a2a');
  },
  night: (ctx) => rect(ctx, 12, 5, 10, 7, '#a8d8ff'),
});
def({
  id: 'office_chair',
  w: 12,
  h: 16,
  foot: { w: 0, h: 0 },
  draw: (ctx) => {
    rect(ctx, 2, 1, 8, 6, '#2a2a30');
    rect(ctx, 1, 7, 10, 4, '#3a3a42');
    vline(ctx, 6, 11, 3, '#5a5a5a');
    hline(ctx, 2, 14, 8, '#5a5a5a');
  },
});
def({
  id: 'water_cooler',
  w: 12,
  h: 28,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    rect(ctx, 2, 12, 8, 14, '#e8e8e4');
    ellipse(ctx, 6, 7, 4, 6, '#9fd0f0');
    rect(ctx, 5, 16, 2, 2, '#3a62a8');
    strokeRect(ctx, 2, 12, 8, 14, O);
  },
});
def({
  id: 'printer',
  w: 18,
  h: 20,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 1, 4, 16, 5, 10, '#d8d8d2', '#b8b8b2');
    rect(ctx, 4, 2, 10, 3, '#f4f1ea');
    rect(ctx, 12, 10, 3, 2, '#3ab86a');
  },
});
def({
  id: 'filing',
  w: 14,
  h: 26,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 1, 2, 12, 3, 20, '#8a9098', '#6a7078');
    for (let y = 8; y < 24; y += 5) {
      hline(ctx, 2, y, 10, '#5a6068');
      hline(ctx, 5, y + 2, 4, '#c8ccd2');
    }
  },
});
def({
  id: 'boss_desk',
  w: 48,
  h: 30,
  foot: { w: 3, h: 1 },
  draw: (ctx) => {
    box(ctx, 1, 10, 46, 8, 10, '#5a3a24', '#3a2416');
    rect(ctx, 26, 2, 14, 9, '#2a2e38');
    rect(ctx, 27, 3, 12, 6, '#3a7ab8');
    rect(ctx, 6, 12, 8, 4, '#f4f1ea');
    circle(ctx, 18, 13, 2, P.gold);
  },
});
def({
  id: 'whiteboard',
  w: 40,
  h: 22,
  foot: { w: 0, h: 0 },
  wall: true,
  draw: (ctx) => {
    rect(ctx, 0, 0, 40, 22, '#a8a8a8');
    rect(ctx, 2, 2, 36, 18, '#f8f8f6');
    ctx.fillStyle = '#c2283a';
    for (let i = 0; i < 20; i++) px(ctx, 6 + i, 14 - Math.round(i * 0.4 + Math.sin(i) * 2), '#c2283a');
    hline(ctx, 6, 6, 14, '#2a62a8');
    hline(ctx, 6, 9, 10, '#2a62a8');
  },
});
def({
  id: 'meeting_table',
  w: 64,
  h: 34,
  foot: { w: 4, h: 2 },
  draw: (ctx) => {
    shadow(ctx, 32, 31, 28, 3);
    box(ctx, 2, 4, 60, 18, 7, '#e8e2d6', '#a8a296');
    for (let i = 0; i < 4; i++) {
      rect(ctx, 8 + i * 14, 0, 8, 4, '#2a2a30');
      rect(ctx, 8 + i * 14, 30, 8, 4, '#2a2a30');
    }
    for (let i = 0; i < 3; i++) rect(ctx, 14 + i * 16, 9, 6, 4, '#f4f1ea');
  },
});
def({
  id: 'glass_wall',
  w: 16,
  h: 32,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    rect(ctx, 1, 0, 14, 30, rgba('#c8e4f4', 0.55));
    vline(ctx, 1, 0, 30, '#8a9aa8');
    vline(ctx, 14, 0, 30, '#8a9aa8');
    for (let i = 0; i < 8; i++) px(ctx, 4 + i, 22 - i * 2, '#f4faff');
    hline(ctx, 0, 30, 16, '#5a6068');
  },
});
def({
  id: 'fireplace',
  w: 40,
  h: 32,
  foot: { w: 0, h: 0 },
  wall: true,
  frames: 3,
  light: { x: 20, y: 24, r: 56, color: '#ff9a4a', always: true },
  draw: (ctx, f) => {
    rect(ctx, 0, 0, 40, 32, '#8a7a6a');
    rect(ctx, 2, 0, 36, 4, '#a89a8a');
    rect(ctx, 8, 12, 24, 20, '#1a1210');
    for (let i = 0; i < 5; i++) {
      const fx = 11 + i * 4;
      const fh = 6 + ((i + f) % 3) * 3;
      rect(ctx, fx, 31 - fh, 3, fh, i % 2 ? '#ff9a3a' : '#ffd25a');
      px(ctx, fx + 1, 30 - fh, '#fff1a8');
    }
    hline(ctx, 10, 30, 20, '#5a3a24');
  },
});
def({
  id: 'globe',
  w: 16,
  h: 24,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    rect(ctx, 7, 14, 2, 8, P.woodDark);
    hline(ctx, 4, 22, 8, P.woodDark);
    circle(ctx, 8, 9, 6, '#3a6a9a');
    rect(ctx, 5, 6, 4, 3, '#5a8a4a');
    rect(ctx, 9, 10, 3, 3, '#5a8a4a');
    ring(ctx, 8, 9, 7, P.gold);
  },
});
def({
  id: 'car_lift',
  w: 52,
  h: 40,
  foot: { w: 3, h: 2 },
  draw: (ctx) => {
    rect(ctx, 2, 30, 48, 4, '#e0b13e');
    for (let x = 2; x < 50; x += 8) rect(ctx, x, 30, 4, 4, '#2a2a2a');
    rect(ctx, 6, 18, 4, 12, '#8a9098');
    rect(ctx, 42, 18, 4, 12, '#8a9098');
    const c = makeCanvas(44, 26);
    drawCarSide(c.ctx, '#3a6aa8', false);
    ctx.drawImage(c.canvas, 4, 0);
  },
});
def({
  id: 'tool_board',
  w: 40,
  h: 22,
  foot: { w: 0, h: 0 },
  wall: true,
  draw: (ctx) => {
    rect(ctx, 0, 0, 40, 22, '#c8a878');
    for (let y = 3; y < 22; y += 4) for (let x = 3; x < 40; x += 4) px(ctx, x, y, '#8a6a48');
    rect(ctx, 5, 4, 2, 12, '#c2283a');
    rect(ctx, 12, 5, 6, 2, '#5a606a');
    rect(ctx, 22, 4, 2, 10, '#2a62a8');
    circle(ctx, 32, 10, 4, '#5a606a');
  },
});

// ------------------------------------------------------------------ casino

def({
  id: 'bj_table',
  w: 52,
  h: 40,
  foot: { w: 3, h: 2 },
  light: { x: 26, y: 14, r: 46, color: '#ffe2a8', always: true },
  draw: (ctx) => {
    shadow(ctx, 26, 37, 24, 3);
    // padded rail
    ellipse(ctx, 26, 12, 25, 22, '#3a1a10');
    ellipse(ctx, 26, 12, 23, 20, '#5a2e1a');
    rect(ctx, 0, 0, 52, 12, 'rgba(0,0,0,0)');
    ctx.clearRect(0, 0, 52, 11);
    ellipse(ctx, 26, 12, 21, 18, P.felt);
    ctx.clearRect(0, 0, 52, 11);
    rect(ctx, 3, 9, 46, 3, '#3a1a10');
    rect(ctx, 5, 11, 42, 2, P.feltDark);
    // betting circles
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.15 + (i / 4) * 0.7);
      const x = Math.round(26 + Math.cos(a) * 15);
      const y = Math.round(12 + Math.sin(a) * 12);
      ring(ctx, x, y, 2, '#e8e2d0');
    }
    drawTextCentered(ctx, '3:2', 26, 16, '#e0b13e', '3x5');
    // chip tray
    rect(ctx, 18, 7, 16, 4, '#2a1a10');
    for (let i = 0; i < 7; i++) rect(ctx, 19 + i * 2, 8, 2, 2, ['#c2283a', '#2c8a4e', '#24222b', '#6c3aa8', '#e9e6df'][i % 5]);
    // base
    rect(ctx, 20, 33, 12, 4, '#2a1a10');
  },
});
def({
  id: 'roulette_table',
  w: 68,
  h: 40,
  foot: { w: 4, h: 2 },
  light: { x: 34, y: 14, r: 52, color: '#ffe2a8', always: true },
  frames: 4,
  draw: (ctx, f) => {
    shadow(ctx, 34, 37, 32, 3);
    box(ctx, 2, 6, 64, 20, 6, P.felt, '#3a1a10');
    strokeRect(ctx, 2, 6, 64, 20, '#5a2e1a');
    // wheel bowl
    circle(ctx, 14, 16, 11, '#5a2e1a');
    circle(ctx, 14, 16, 9, '#2a1a10');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + f * 0.4;
      px(ctx, Math.round(14 + Math.cos(a) * 7), Math.round(16 + Math.sin(a) * 7), i % 2 ? '#c2283a' : '#141218');
    }
    circle(ctx, 14, 16, 4, P.gold);
    px(ctx, 14, 16, '#fff2cf');
    // layout grid
    rect(ctx, 28, 9, 34, 14, '#1f6e46');
    for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) rect(ctx, 30 + i * 2 + Math.floor(i / 4), 10 + j * 4, 2, 3, (i + j) % 2 ? '#c2283a' : '#141218');
    rect(ctx, 28, 10, 2, 11, '#2c8a4e');
    hline(ctx, 28, 23, 34, '#e8e2d0');
    rect(ctx, 28, 33, 12, 4, '#2a1a10');
  },
});
def({
  id: 'bac_table',
  w: 68,
  h: 42,
  foot: { w: 4, h: 2 },
  light: { x: 34, y: 16, r: 52, color: '#ffe2a8', always: true },
  draw: (ctx) => {
    shadow(ctx, 34, 39, 32, 3);
    ellipse(ctx, 34, 18, 33, 16, '#3a1a10');
    ellipse(ctx, 34, 18, 31, 14, '#5a2e1a');
    ellipse(ctx, 34, 18, 28, 12, '#7a1a2a');
    ellipse(ctx, 34, 19, 22, 8, '#8a2232');
    ring(ctx, 34, 19, 16, P.gold);
    drawTextCentered(ctx, 'BANKER', 34, 13, P.goldLight, '3x5');
    drawTextCentered(ctx, 'PLAYER', 34, 21, '#e8e2d0', '3x5');
    rect(ctx, 26, 4, 16, 4, '#2a1a10');
    rect(ctx, 28, 34, 12, 5, '#2a1a10');
  },
});
def({
  id: 'poker_table',
  w: 68,
  h: 42,
  foot: { w: 4, h: 2 },
  light: { x: 34, y: 16, r: 46, color: '#ffe2a8', always: true },
  draw: (ctx) => {
    shadow(ctx, 34, 39, 32, 3);
    ellipse(ctx, 34, 18, 33, 16, '#2a1a10');
    ellipse(ctx, 34, 18, 30, 13, '#1f4e6e');
    ellipse(ctx, 34, 18, 26, 10, '#2a5e80');
    for (let i = 0; i < 5; i++) rect(ctx, 24 + i * 4, 16, 3, 4, '#f4f1ea');
    rect(ctx, 28, 34, 12, 5, '#2a1a10');
  },
});
for (let v = 0; v < 3; v++) {
  def({
    id: `slot${v}`,
    w: 18,
    h: 34,
    foot: { w: 1, h: 1 },
    frames: 3,
    light: { x: 9, y: 10, r: 22, color: ['#ff7ad8', '#7ad8ff', '#ffe45c'][v], always: true },
    draw: (ctx, f) => {
      const body = ['#5a1a3a', '#1a3a5a', '#5a4a1a'][v];
      box(ctx, 1, 2, 16, 3, 28, shade(body, 0.2), body);
      rect(ctx, 3, 6, 12, 8, '#141218');
      for (let i = 0; i < 3; i++) {
        rect(ctx, 4 + i * 4, 7, 3, 6, '#f4f1ea');
        const sym = (i + f + v) % 3;
        px(ctx, 5 + i * 4, 9, sym === 0 ? '#c2283a' : sym === 1 ? '#e0b13e' : '#3f8a5a');
        px(ctx, 5 + i * 4, 10, sym === 0 ? '#c2283a' : sym === 1 ? '#e0b13e' : '#3f8a5a');
      }
      for (let i = 0; i < 6; i++) px(ctx, 3 + i * 2, 4, (i + f) % 2 ? '#fff2cf' : shade(body, 0.4));
      rect(ctx, 4, 18, 10, 3, '#2a2a30');
      rect(ctx, 13, 22, 2, 6, '#a8a8a8');
      circle(ctx, 14, 21, 1, '#c2283a');
    },
    night: (ctx, f) => {
      for (let i = 0; i < 6; i++) if ((i + f) % 2) px(ctx, 3 + i * 2, 4, '#fff2cf');
    },
  });
}
def({
  id: 'cage',
  w: 16,
  h: 36,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    box(ctx, 0, 14, 16, 6, 15, '#2a0c18', '#3a1424');
    hline(ctx, 0, 19, 16, P.gold);
    for (let x = 1; x < 16; x += 3) vline(ctx, x, 0, 14, P.goldDark);
    hline(ctx, 0, 0, 16, P.gold);
    hline(ctx, 0, 6, 16, P.goldDark);
  },
});
def({
  id: 'chandelier',
  w: 52,
  h: 28,
  foot: { w: 0, h: 0 },
  overhead: true,
  light: { x: 26, y: 14, r: 70, color: '#ffe6b0', always: true },
  draw: (ctx) => {
    vline(ctx, 26, 0, 6, P.goldDark);
    ellipse(ctx, 26, 12, 22, 6, rgba(P.gold, 0.9));
    ellipse(ctx, 26, 11, 18, 4, rgba('#fff2cf', 0.85));
    for (let i = 0; i < 9; i++) {
      const x = 6 + i * 5;
      vline(ctx, x, 14, 5 + (i % 3) * 2, rgba('#f4faff', 0.9));
      px(ctx, x, 19 + (i % 3) * 2, '#ffffff');
    }
  },
  night: (ctx) => {
    ellipse(ctx, 26, 11, 18, 4, 'rgba(255,240,200,0.9)');
  },
});
def({
  id: 'pillar',
  w: 18,
  h: 46,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 9, 44, 8, 2);
    rect(ctx, 3, 4, 12, 38, '#e8dcc4');
    vline(ctx, 12, 4, 38, '#c8bca4');
    vline(ctx, 5, 4, 38, '#f4ecd8');
    rect(ctx, 1, 0, 16, 5, P.gold);
    rect(ctx, 1, 40, 16, 5, P.gold);
    hline(ctx, 1, 4, 16, P.goldDark);
    strokeRect(ctx, 1, 0, 16, 45, O);
  },
});
def({
  id: 'detector',
  w: 48,
  h: 40,
  foot: { w: 3, h: 1 },
  mask: [[1, 0, 1]],
  light: { x: 24, y: 6, r: 24, color: '#9fe0ff', always: true },
  draw: (ctx) => {
    shadow(ctx, 24, 37, 22, 2);
    for (const x of [12, 32]) {
      rect(ctx, x, 6, 4, 30, '#8a9098');
      vline(ctx, x + 3, 6, 30, '#5a6068');
    }
    rect(ctx, 12, 2, 24, 5, '#8a9098');
    rect(ctx, 20, 3, 8, 3, '#3ab86a');
    rect(ctx, 0, 24, 10, 12, '#3a3f4a');
    rect(ctx, 1, 25, 8, 4, '#5a606a');
    strokeRect(ctx, 12, 2, 24, 34, O);
  },
});

const NEON_TEXTS: [string, string, string][] = [
  ['neon_blackjack', 'BLACKJACK', P.neonCyan],
  ['neon_roulette', 'ROULETTE', P.neonPink],
  ['neon_baccarat', 'BACCARAT', P.neonYellow],
  ['neon_cashier', 'CASHIER', P.neonGreen],
  ['neon_bar', 'LUCKY 7 BAR', P.neonPurple],
  ['neon_vip', 'VIP SALON', P.goldLight],
  ['neon_high', 'HIGH LIMIT', P.neonPink],
  ['neon_poker', 'POKER', P.neonCyan],
  ['neon_slots', 'SLOTS', P.neonYellow],
  ['neon_exit', 'EXIT', P.neonGreen],
  ['neon_open', 'OPEN', P.neonPink],
  ['neon_beer', 'COLD BEER', '#ffb84a'],
];
for (const [id, text, color] of NEON_TEXTS) {
  const tw = measureText(text, '5x7');
  def({
    id,
    w: tw + 10,
    h: 15,
    foot: { w: 0, h: 0 },
    wall: true,
    light: { x: Math.round((tw + 10) / 2), y: 7, r: 30, color, always: true },
    draw: (ctx) => {
      rect(ctx, 0, 0, tw + 10, 15, '#14101c');
      strokeRect(ctx, 0, 0, tw + 10, 15, '#3a3448');
      drawText(ctx, text, 5, 4, shade(color, -0.1), '5x7');
    },
    night: (ctx) => {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      drawText(ctx, text, 5, 4, color, '5x7');
      ctx.restore();
      drawText(ctx, text, 5, 4, shade(color, 0.55), '5x7');
    },
  });
}
def({
  id: 'poker_sign',
  w: 46,
  h: 22,
  foot: { w: 0, h: 0 },
  wall: true,
  draw: (ctx) => {
    rect(ctx, 0, 0, 46, 22, '#f4f1ea');
    strokeRect(ctx, 0, 0, 46, 22, '#a3242f');
    drawText(ctx, 'POKER', 9, 3, '#a3242f', '5x7');
    drawText(ctx, 'ROOM', 13, 12, '#2a2a2a', '3x5');
  },
});
def({
  id: 'velvet_post',
  w: 8,
  h: 18,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    rect(ctx, 3, 4, 2, 12, P.gold);
    rect(ctx, 2, 15, 4, 2, P.goldDark);
    circle(ctx, 4, 3, 2, P.goldLight);
  },
});

// ------------------------------------------------------------------ registry & build

export const PROPS: Record<string, PropDef> = Object.fromEntries(defs.map((d) => [d.id, d]));

export function propFrameName(id: string, frame: number, night = false): string {
  return `prop:${id}:${frame}${night ? ':n' : ''}`;
}

export function buildPropImages(add: (name: string, c: HTMLCanvasElement) => void): void {
  for (const d of defs) {
    const frames = d.frames ?? 1;
    for (let f = 0; f < frames; f++) {
      const { canvas, ctx } = makeCanvas(d.w, d.h);
      drewShadow = false;
      d.draw(ctx, f);
      if (drewShadow) OWN_SHADOW.add(d.id);
      add(propFrameName(d.id, f), canvas);
      if (d.night) {
        const n = makeCanvas(d.w, d.h);
        d.night(n.ctx, f);
        add(propFrameName(d.id, f, true), n.canvas);
      }
    }
  }
}

export function carImage(color: string, dir: 'left' | 'right' | 'up' | 'down', lights = false): HTMLCanvasElement {
  if (dir === 'left' || dir === 'right') {
    const { canvas, ctx } = makeCanvas(44, 26);
    drawCarSide(ctx, color, dir === 'left', lights);
    if (dir === 'left') {
      const f = makeCanvas(44, 26);
      f.ctx.translate(44, 0);
      f.ctx.scale(-1, 1);
      f.ctx.drawImage(canvas, 0, 0);
      return f.canvas;
    }
    return canvas;
  }
  const { canvas, ctx } = makeCanvas(24, 40);
  drawCarTop(ctx, color);
  if (dir === 'down') {
    const f = makeCanvas(24, 40);
    f.ctx.translate(0, 40);
    f.ctx.scale(1, -1);
    f.ctx.drawImage(canvas, 0, 0);
    return f.canvas;
  }
  return canvas;
}

export { CAR_COLORS };
