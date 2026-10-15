import { P } from './palette';
import { box, circle, dither, ellipse, hash2, hline, makeCanvas, mix, px, rect, rgba, ring, roundRect, shade, speckle, strokeRect, vline, type Ctx } from './canvas';
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
  /** indoors, the night image follows the daylight outside (windows) instead of staying lit */
  daylit?: boolean;
  /** two frames that are not an animation: 0 = open for business, 1 = shut (see PlacedProp.when) */
  shut?: boolean;
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

// the same pieces turned to face left (mirrored, they face right): for putting them along a side wall
def({
  id: 'sofa_side',
  w: 24,
  h: 56,
  foot: { w: 1, h: 3 },
  draw: (ctx) => {
    shadow(ctx, 12, 54, 11, 2);
    // the back along the right, the seat cushions facing left, an arm at each end
    rect(ctx, 14, 6, 8, 44, '#3e5a76');
    rect(ctx, 3, 10, 12, 38, '#5a7a9a');
    vline(ctx, 4, 11, 36, '#7a9aba');
    hline(ctx, 3, 22, 12, '#4a6a8a');
    hline(ctx, 3, 35, 12, '#4a6a8a');
    rect(ctx, 2, 4, 20, 7, '#3e5a76');
    rect(ctx, 2, 46, 20, 7, '#3e5a76');
    hline(ctx, 2, 4, 20, '#5a7a9a');
    hline(ctx, 2, 46, 20, '#5a7a9a');
    strokeRect(ctx, 2, 4, 20, 49, O);
  },
});
def({
  id: 'tv_side',
  w: 18,
  h: 44,
  foot: { w: 1, h: 2 },
  light: { x: 4, y: 16, r: 30, color: '#9fc8ff' },
  frames: 2,
  draw: (ctx, f) => {
    // the low cabinet seen from above, the screen standing on it edge-on, its face lit on the left
    box(ctx, 1, 12, 16, 22, 8, P.woodDark, '#4a2e1a');
    rect(ctx, 9, 0, 5, 30, '#141218');
    vline(ctx, 9, 1, 28, f ? '#3a6aa8' : '#4a8ab8');
    rect(ctx, 8, 28, 7, 3, '#2a2a2e');
  },
  night: (ctx, f) => {
    vline(ctx, 9, 1, 28, f ? '#6a9ad8' : '#8ac8f8');
    vline(ctx, 8, 3, 24, 'rgba(138,200,248,0.5)');
  },
});
def({
  id: 'piano_side',
  w: 24,
  h: 58,
  foot: { w: 1, h: 3 },
  draw: (ctx) => {
    shadow(ctx, 13, 56, 11, 2);
    // the tall case, the keys sticking out on the left, the stool in front of them
    box(ctx, 8, 2, 14, 46, 8, '#1a1a1e', '#141218');
    rect(ctx, 3, 14, 6, 30, '#f4f1ea');
    for (let y = 15; y < 43; y += 3) hline(ctx, 3, y, 4, '#1a1a1e');
    strokeRect(ctx, 3, 14, 6, 30, O);
    rect(ctx, 0, 24, 3, 10, '#3a2416');
  },
});
def({
  id: 'treadmill_side',
  w: 34,
  h: 24,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 17, 22, 15, 2);
    // the belt running left to right, the console at the left end
    rect(ctx, 4, 10, 28, 10, '#2a2a30');
    rect(ctx, 6, 12, 24, 6, '#4a4a52');
    rect(ctx, 1, 0, 7, 14, '#3a3a40');
    rect(ctx, 2, 2, 5, 3, '#3ab86a');
    strokeRect(ctx, 4, 10, 28, 10, O);
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

// ------------------------------------------------------------------ casino upper floor (天穹层)

const NAVY = '#1d2742';
const NAVY_DARK = '#121a30';
const NAVY_LIGHT = '#33416a';
const BRASS = '#c9a24a';
const BRASS_DARK = '#8a6a2a';
const BRASS_LIGHT = '#f0d68a';
const STEEL = '#a9aeb8';
const STEEL_DARK = '#7c818c';
const STEEL_LIGHT = '#d6dae2';

/** Lift doors set into a wall, with the floor indicator above. */
function drawLift(ctx: Ctx, floorLabel: string, up: boolean): void {
  // surround
  rect(ctx, 1, 0, 30, 32, BRASS_DARK);
  rect(ctx, 2, 1, 28, 31, BRASS);
  hline(ctx, 2, 1, 28, BRASS_LIGHT);
  vline(ctx, 2, 1, 31, BRASS_LIGHT);
  // indicator panel
  rect(ctx, 9, 2, 14, 7, '#14101a');
  strokeRect(ctx, 9, 2, 14, 7, BRASS_DARK);
  const tw = measureText(floorLabel, '3x5');
  drawText(ctx, floorLabel, 18 - Math.round(tw / 2), 3, '#ffb347', '3x5');
  // direction arrow
  const ax = 12;
  if (up) {
    px(ctx, ax, 4, '#ffb347');
    hline(ctx, ax - 1, 5, 3, '#ffb347');
    hline(ctx, ax - 2, 6, 5, '#ffb347');
  } else {
    hline(ctx, ax - 2, 4, 5, '#ffb347');
    hline(ctx, ax - 1, 5, 3, '#ffb347');
    px(ctx, ax, 6, '#ffb347');
  }
  // door opening
  rect(ctx, 4, 10, 24, 22, '#2a2430');
  liftDoor(ctx, 5, 11, 11, 21, false);
  liftDoor(ctx, 16, 11, 11, 21, true);
  // call buttons on the frame
  rect(ctx, 28, 17, 3, 7, '#3a3040');
  px(ctx, 29, 19, '#ffd28a');
  px(ctx, 29, 22, '#7a6a5a');
  // threshold
  rect(ctx, 3, 31, 26, 1, STEEL_LIGHT);
  strokeRect(ctx, 1, 0, 30, 32, O);
}

function liftDoor(ctx: Ctx, x: number, y: number, w: number, h: number, right: boolean): void {
  rect(ctx, x, y, w, h, STEEL);
  for (let i = 1; i < w; i += 3) vline(ctx, x + i, y + 1, h - 2, STEEL_LIGHT);
  for (let i = 2; i < w; i += 3) vline(ctx, x + i, y + 1, h - 2, shade(STEEL, -0.06));
  hline(ctx, x, y + h - 3, w, STEEL_DARK);
  // engraved panel
  strokeRect(ctx, x + 2, y + 3, w - 4, h - 8, STEEL_DARK);
  vline(ctx, right ? x : x + w - 1, y, h, '#4a4652');
}

def({ id: 'lift_ground', w: 32, h: 32, foot: { w: 2, h: 0 }, wall: true, light: { x: 16, y: 5, r: 14, color: '#ffb347', always: true }, draw: (ctx) => drawLift(ctx, '1', true) });
def({ id: 'lift_sky', w: 32, h: 32, foot: { w: 2, h: 0 }, wall: true, light: { x: 16, y: 5, r: 14, color: '#ffb347', always: true }, draw: (ctx) => drawLift(ctx, '12', false) });
/** the inside of the car, seen through the open doors (cutscene only) */
def({
  id: 'lift_cab',
  w: 24,
  h: 22,
  foot: { w: 0, h: 0 },
  wall: true,
  draw: (ctx) => {
    rect(ctx, 0, 0, 24, 22, '#5a3a26');
    for (let x = 1; x < 24; x += 4) vline(ctx, x, 0, 22, '#6a4830');
    rect(ctx, 4, 2, 16, 11, '#9ab0c4');
    rect(ctx, 5, 3, 14, 9, '#b9cad8');
    hline(ctx, 5, 3, 14, '#dde8f0');
    hline(ctx, 0, 14, 24, BRASS);
    hline(ctx, 0, 15, 24, BRASS_DARK);
    rect(ctx, 0, 19, 24, 3, '#3a2a20');
    rect(ctx, 9, 0, 6, 1, '#fff2cf');
  },
});
def({ id: 'lift_door_l', w: 12, h: 21, foot: { w: 0, h: 0 }, wall: true, draw: (ctx) => liftDoor(ctx, 0, 0, 12, 21, false) });
def({ id: 'lift_door_r', w: 12, h: 21, foot: { w: 0, h: 0 }, wall: true, draw: (ctx) => liftDoor(ctx, 0, 0, 12, 21, true) });

/** The upper floor's windows: the harbour by day, the lit city by night. */
function skyline(ctx: Ctx, night: boolean): void {
  // frame
  rect(ctx, 0, 0, 32, 30, NAVY_DARK);
  const gx = 2;
  const gy = 2;
  const gw = 28;
  const gh = 24;
  for (let j = 0; j < gh; j++) {
    const t = j / gh;
    const c = night ? mix('#0b1026', '#2a2f5c', t) : mix('#6fa6dc', '#cfe5f4', t);
    hline(ctx, gx, gy + j, gw, c);
  }
  if (night) {
    for (let i = 0; i < 9; i++) px(ctx, gx + Math.floor(hash2(i, 3, 41) * gw), gy + Math.floor(hash2(3, i, 42) * 9), i % 3 === 0 ? '#ffffff' : '#9aa6d0');
    circle(ctx, gx + 22, gy + 4, 2, '#f4ecd0');
    px(ctx, gx + 23, gy + 3, '#0b1026');
  } else {
    ellipse(ctx, gx + 7, gy + 5, 4, 1, '#f4f8fc');
    ellipse(ctx, gx + 19, gy + 8, 3, 1, '#eaf2f8');
  }
  // towers
  const towers = [
    [0, 11, 5],
    [5, 7, 4],
    [9, 13, 6],
    [15, 5, 4],
    [19, 10, 5],
    [24, 8, 4],
  ];
  for (const [tx, ty, tw] of towers) {
    const col = night ? '#141a30' : '#7d8ea4';
    rect(ctx, gx + tx, gy + ty, tw, gh - ty - 4, col);
    vline(ctx, gx + tx, gy + ty, gh - ty - 4, night ? '#1d2440' : '#93a3b8');
    for (let wy = gy + ty + 2; wy < gy + gh - 5; wy += 2) {
      for (let wx = gx + tx + 1; wx < gx + tx + tw - 1; wx += 2) {
        const lit = hash2(wx, wy, night ? 51 : 52) < (night ? 0.45 : 0.25);
        if (lit) px(ctx, wx, wy, night ? (hash2(wx, wy, 53) < 0.5 ? P.windowLit : P.windowLitWarm) : '#a8bcd2');
      }
    }
  }
  // the harbour
  rect(ctx, gx, gy + gh - 4, gw, 4, night ? '#10182e' : '#4f84b0');
  for (let i = 0; i < 5; i++) hline(ctx, gx + 2 + i * 6, gy + gh - 2 - (i % 2), 3, night ? '#3a4a80' : '#8fc0e0');
  if (night) for (let i = 0; i < 4; i++) px(ctx, gx + 3 + i * 7, gy + gh - 3, i % 2 ? P.windowLitWarm : '#ff6a6a');
  // mullions and sill
  vline(ctx, gx + 14, gy, gh, NAVY_DARK);
  hline(ctx, gx, gy + 10, gw, NAVY_DARK);
  strokeRect(ctx, 1, 1, 30, 26, BRASS_DARK);
  rect(ctx, 0, 27, 32, 3, BRASS);
  hline(ctx, 0, 27, 32, BRASS_LIGHT);
}
def({ id: 'sky_window', w: 32, h: 30, foot: { w: 2, h: 0 }, wall: true, daylit: true, draw: (ctx) => skyline(ctx, false), night: (ctx) => skyline(ctx, true) });

def({
  id: 'concierge_desk',
  w: 64,
  h: 30,
  foot: { w: 4, h: 1 },
  light: { x: 9, y: 4, r: 30, color: '#ffe2a8', always: true },
  draw: (ctx) => {
    shadow(ctx, 32, 28, 30, 2);
    box(ctx, 1, 10, 62, 6, 13, '#e6e0d4', '#3a2418');
    speckle(ctx, 2, 11, 60, 4, '#cfc6b6', 0.12, 61);
    hline(ctx, 1, 15, 62, BRASS);
    hline(ctx, 1, 27, 62, BRASS_DARK);
    for (let x = 6; x < 60; x += 8) {
      vline(ctx, x, 18, 8, '#2a180e');
      vline(ctx, x + 1, 18, 8, '#4a3020');
    }
    // lamp
    rect(ctx, 8, 6, 2, 5, BRASS);
    rect(ctx, 5, 2, 8, 4, '#2f6a4a');
    hline(ctx, 5, 2, 8, '#4f9a6a');
    // guest book and pen
    rect(ctx, 24, 9, 9, 3, '#7a1626');
    hline(ctx, 24, 9, 9, '#a8323e');
    vline(ctx, 35, 8, 3, '#141218');
    // orchid
    rect(ctx, 44, 7, 4, 4, '#f4f1ea');
    vline(ctx, 46, 2, 5, '#3f7a38');
    px(ctx, 45, 2, '#e8c8f0');
    px(ctx, 47, 3, '#e8c8f0');
    px(ctx, 46, 1, '#f4e4ff');
    // bell
    ellipse(ctx, 56, 9, 3, 2, BRASS);
    px(ctx, 56, 6, BRASS_LIGHT);
    hline(ctx, 53, 11, 7, BRASS_DARK);
  },
});

function buffetTable(ctx: Ctx, sweet: boolean): void {
  shadow(ctx, 16, 24, 15, 2);
  box(ctx, 0, 8, 32, 6, 11, '#f4f1ea', '#e2ddd0');
  for (let x = 2; x < 32; x += 5) vline(ctx, x, 15, 9, '#cfc8b8');
  hline(ctx, 0, 24, 32, '#bdb5a4');
  if (!sweet) {
    for (const cx of [6, 16, 26]) {
      ellipse(ctx, cx, 10, 4, 2, '#8a8f98');
      ellipse(ctx, cx, 8, 4, 3, STEEL_LIGHT);
      hline(ctx, cx - 3, 7, 6, '#f4f6fa');
      px(ctx, cx, 4, STEEL);
    }
  } else {
    // cake stand, fruit, macarons
    ellipse(ctx, 7, 11, 4, 1, '#d6dae2');
    rect(ctx, 4, 6, 7, 5, '#f2d8c8');
    hline(ctx, 4, 6, 7, '#fff4ec');
    px(ctx, 7, 5, '#c2283a');
    ellipse(ctx, 17, 10, 5, 2, '#c49a6a');
    for (const [fx, fy, c] of [[14, 9, '#e04a5a'], [16, 8, '#f2c94c'], [18, 9, '#5fa24c'], [20, 8, '#b46bff']] as [number, number, string][]) px(ctx, fx, fy, c);
    for (let i = 0; i < 4; i++) {
      px(ctx, 24 + i * 2, 10, ['#f8b8c8', '#b8e0c8', '#f8e0a0', '#c8b8f0'][i]);
      px(ctx, 24 + i * 2, 9, ['#f8b8c8', '#b8e0c8', '#f8e0a0', '#c8b8f0'][i]);
    }
  }
}
def({ id: 'buffet', w: 32, h: 26, foot: { w: 2, h: 1 }, draw: (ctx) => buffetTable(ctx, false) });
def({ id: 'buffet_sweet', w: 32, h: 26, foot: { w: 2, h: 1 }, draw: (ctx) => buffetTable(ctx, true) });

def({
  id: 'champagne_tower',
  w: 20,
  h: 32,
  foot: { w: 1, h: 1 },
  light: { x: 10, y: 12, r: 18, color: '#fff0b8', always: true },
  draw: (ctx) => {
    shadow(ctx, 10, 30, 8, 2);
    ellipse(ctx, 10, 24, 8, 2, BRASS);
    rect(ctx, 9, 25, 2, 5, BRASS_DARK);
    hline(ctx, 6, 29, 8, BRASS_DARK);
    const glass = (x: number, y: number) => {
      rect(ctx, x, y, 3, 2, rgba('#fff2b0', 0.85));
      px(ctx, x + 1, y + 2, rgba('#f4f1ea', 0.9));
      px(ctx, x, y, '#ffffff');
    };
    for (let row = 0; row < 4; row++) {
      const n = 4 - row;
      for (let i = 0; i < n; i++) glass(4 + row * 2 + i * 3, 20 - row * 4);
    }
    px(ctx, 10, 3, '#ffffff');
    px(ctx, 6, 8, '#fff6d0');
    px(ctx, 14, 6, '#fff6d0');
  },
});

def({
  id: 'telescope',
  w: 16,
  h: 28,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 8, 26, 6, 1);
    for (const [x0, x1] of [[8, 3], [8, 13], [8, 8]] as [number, number][]) {
      for (let j = 0; j < 12; j++) px(ctx, Math.round(x0 + ((x1 - x0) * j) / 11), 14 + j, BRASS_DARK);
    }
    // tube pointing at the window
    for (let i = 0; i < 11; i++) {
      rect(ctx, 3 + i, 12 - i, 3, 3, i < 2 ? BRASS_DARK : BRASS);
      px(ctx, 3 + i, 12 - i, BRASS_LIGHT);
    }
    rect(ctx, 12, 1, 4, 4, BRASS_DARK);
    px(ctx, 14, 2, '#9ab8d8');
  },
});

def({
  id: 'massage_bed',
  w: 32,
  h: 20,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 16, 18, 15, 2);
    box(ctx, 1, 3, 30, 7, 5, '#c8b8a0', '#8a7058');
    rect(ctx, 6, 3, 20, 7, '#f4f1ea');
    hline(ctx, 6, 3, 20, '#ffffff');
    for (let x = 8; x < 26; x += 4) vline(ctx, x, 4, 5, '#e2ddd0');
    // rolled towel and face cradle
    rect(ctx, 26, 4, 3, 5, '#e8e0d0');
    ellipse(ctx, 3, 6, 2, 2, '#a8957a');
    for (const x of [3, 28]) rect(ctx, x, 15, 2, 4, '#6a4428');
  },
});

def({
  id: 'spa_desk',
  w: 32,
  h: 28,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 16, 26, 15, 2);
    box(ctx, 0, 10, 32, 5, 12, '#d8ccb4', '#a8845a');
    for (let x = 2; x < 32; x += 3) vline(ctx, x, 16, 10, '#b8946a');
    hline(ctx, 0, 15, 32, '#efe6d2');
    // orchid
    rect(ctx, 3, 7, 5, 4, '#f4f1ea');
    vline(ctx, 5, 2, 5, '#3f7a38');
    px(ctx, 4, 2, '#f0d0f8');
    px(ctx, 6, 3, '#f0d0f8');
    px(ctx, 5, 1, '#ffffff');
    // stacked stones
    ellipse(ctx, 25, 10, 4, 1, '#6a6460');
    ellipse(ctx, 25, 8, 3, 1, '#8a847e');
    ellipse(ctx, 25, 6, 2, 1, '#a8a29a');
    // booking tablet
    rect(ctx, 13, 9, 6, 3, '#2a2e38');
    rect(ctx, 14, 9, 4, 2, '#7ab8a8');
  },
});

def({
  id: 'sauna',
  w: 48,
  h: 44,
  foot: { w: 3, h: 2 },
  light: { x: 24, y: 26, r: 26, color: '#ffb070', always: true },
  draw: (ctx) => {
    shadow(ctx, 24, 42, 23, 2);
    box(ctx, 0, 2, 48, 8, 32, '#c8945a', '#a8743e');
    for (let y = 12; y < 42; y += 3) hline(ctx, 1, y, 46, '#8a5a2e');
    for (let y = 3; y < 10; y += 2) hline(ctx, 1, y, 46, '#d8a46a');
    // glass door, glowing
    rect(ctx, 17, 14, 14, 26, '#5a3418');
    rect(ctx, 19, 16, 10, 22, '#ffb878');
    rect(ctx, 20, 17, 8, 4, '#ffd8a8');
    px(ctx, 27, 28, '#3a2410');
    // sign
    rect(ctx, 6, 14, 9, 6, '#3a2410');
    drawText(ctx, 'SPA', 7, 15, '#f2d8a0', '3x5');
    strokeRect(ctx, 0, 2, 48, 40, O);
  },
});

def({
  id: 'orchid',
  w: 12,
  h: 20,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 6, 18, 4, 1);
    rect(ctx, 3, 12, 6, 6, '#f4f1ea');
    hline(ctx, 3, 12, 6, '#ffffff');
    rect(ctx, 2, 10, 3, 3, '#3f7a38');
    rect(ctx, 7, 10, 3, 3, '#4f8a42');
    vline(ctx, 6, 3, 8, '#5a7a3a');
    for (const [x, y] of [[4, 3], [8, 4], [5, 6], [8, 7], [6, 1]] as [number, number][]) {
      px(ctx, x, y, '#f0d0f8');
      px(ctx, x + 1, y, '#d8a8e8');
    }
  },
});

def({
  id: 'flower_vase',
  w: 18,
  h: 34,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 9, 32, 6, 1);
    rect(ctx, 5, 18, 8, 14, BRASS);
    vline(ctx, 6, 19, 12, BRASS_LIGHT);
    vline(ctx, 12, 19, 12, BRASS_DARK);
    hline(ctx, 4, 18, 10, BRASS_DARK);
    for (let i = 0; i < 12; i++) {
      const x = 2 + Math.floor(hash2(i, 7, 71) * 14);
      const y = 2 + Math.floor(hash2(7, i, 72) * 14);
      rect(ctx, x, y, 2, 2, i % 3 === 0 ? '#3f7a38' : '#f4f1ea');
      if (i % 3 !== 0) px(ctx, x, y, '#ffe8a0');
    }
    vline(ctx, 9, 10, 8, '#3f7a38');
  },
});

function velvetSofa(ctx: Ctx, w: number, base: string): void {
  const dark = shade(base, -0.3);
  const light = shade(base, 0.25);
  shadow(ctx, w / 2, 24, w / 2 - 2, 2);
  rect(ctx, 2, 2, w - 4, 10, dark);
  rect(ctx, 2, 10, w - 4, 10, base);
  rect(ctx, 0, 6, 6, 16, shade(base, -0.4));
  rect(ctx, w - 6, 6, 6, 16, shade(base, -0.4));
  for (let x = 8; x < w - 6; x += 7) px(ctx, x, 6, BRASS_LIGHT);
  hline(ctx, 2, 10, w - 4, light);
  for (let x = 6 + Math.floor((w - 12) / 3); x < w - 6; x += Math.floor((w - 12) / 3)) vline(ctx, x, 11, 9, dark);
  strokeRect(ctx, 0, 2, w, 20, O);
}
def({ id: 'sofa_navy', w: 48, h: 26, foot: { w: 3, h: 1 }, draw: (ctx) => velvetSofa(ctx, 48, NAVY_LIGHT) });
const COGNAC = '#9a5a32';
def({ id: 'sofa_cognac', w: 48, h: 26, foot: { w: 3, h: 1 }, draw: (ctx) => velvetSofa(ctx, 48, COGNAC) });
def({
  id: 'armchair_cognac',
  w: 20,
  h: 22,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 10, 20, 9, 2);
    rect(ctx, 2, 2, 16, 8, shade(COGNAC, -0.25));
    rect(ctx, 2, 9, 16, 9, COGNAC);
    rect(ctx, 0, 6, 4, 13, shade(COGNAC, -0.4));
    rect(ctx, 16, 6, 4, 13, shade(COGNAC, -0.4));
    for (let x = 5; x < 16; x += 4) px(ctx, x, 5, BRASS_LIGHT);
    hline(ctx, 2, 9, 16, shade(COGNAC, 0.3));
    hline(ctx, 3, 3, 14, shade(COGNAC, 0.05));
    strokeRect(ctx, 0, 2, 20, 17, O);
  },
});
def({
  id: 'armchair_navy',
  w: 20,
  h: 22,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 10, 20, 9, 2);
    rect(ctx, 2, 2, 16, 8, NAVY);
    rect(ctx, 2, 9, 16, 9, NAVY_LIGHT);
    rect(ctx, 0, 6, 4, 13, NAVY_DARK);
    rect(ctx, 16, 6, 4, 13, NAVY_DARK);
    for (let x = 5; x < 16; x += 4) px(ctx, x, 5, BRASS_LIGHT);
    hline(ctx, 2, 9, 16, shade(NAVY_LIGHT, 0.25));
    strokeRect(ctx, 0, 2, 20, 17, O);
  },
});
def({
  id: 'side_table',
  w: 16,
  h: 18,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 8, 16, 6, 1);
    ellipse(ctx, 8, 6, 7, 3, '#e6e0d4');
    ellipse(ctx, 8, 5, 6, 2, '#f4f0e8');
    rect(ctx, 7, 8, 2, 7, BRASS);
    hline(ctx, 4, 15, 8, BRASS_DARK);
    // two cocktail glasses
    for (const gx of [5, 10]) {
      rect(ctx, gx, 2, 2, 2, gx === 5 ? '#ff8fb8' : '#ffd36a');
      px(ctx, gx, 4, '#f4f1ea');
    }
  },
});
def({
  id: 'high_table',
  w: 16,
  h: 26,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 8, 24, 6, 1);
    ellipse(ctx, 8, 7, 7, 3, BRASS_DARK);
    ellipse(ctx, 8, 6, 7, 2, '#ece6da');
    hline(ctx, 3, 5, 10, '#fbf8f0');
    rect(ctx, 7, 9, 2, 14, BRASS);
    vline(ctx, 7, 9, 14, BRASS_LIGHT);
    hline(ctx, 4, 23, 8, BRASS_DARK);
    // candle
    rect(ctx, 7, 2, 2, 3, '#f4f1ea');
    px(ctx, 7, 1, '#ffd36a');
  },
  light: { x: 8, y: 2, r: 12, color: '#ffc870', always: true },
});
def({
  id: 'rug_round',
  w: 48,
  h: 32,
  foot: { w: 3, h: 2 },
  ground: true,
  draw: (ctx) => {
    ellipse(ctx, 24, 16, 23, 15, BRASS_DARK);
    ellipse(ctx, 24, 16, 21, 13, NAVY);
    ellipse(ctx, 24, 16, 17, 10, NAVY_LIGHT);
    ellipse(ctx, 24, 16, 12, 7, NAVY);
    for (let a = 0; a < 16; a++) {
      const x = Math.round(24 + Math.cos((a / 16) * Math.PI * 2) * 19);
      const y = Math.round(16 + Math.sin((a / 16) * Math.PI * 2) * 11.5);
      px(ctx, x, y, BRASS_LIGHT);
    }
    px(ctx, 24, 16, BRASS_LIGHT);
  },
});
def({
  id: 'bathtub_claw',
  w: 34,
  h: 24,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 17, 22, 15, 2);
    ellipse(ctx, 17, 10, 16, 8, '#f4f4f0');
    ellipse(ctx, 17, 9, 13, 5, '#a8d0e8');
    ellipse(ctx, 17, 8, 10, 3, '#c8e8f8');
    rect(ctx, 3, 10, 28, 6, '#e8e8e2');
    hline(ctx, 3, 15, 28, '#cfcfc8');
    for (const x of [5, 27]) rect(ctx, x, 16, 3, 4, BRASS);
    // tap
    rect(ctx, 29, 3, 2, 4, BRASS);
    px(ctx, 28, 3, BRASS_LIGHT);
  },
});
def({
  id: 'suite_door',
  w: 32,
  h: 32,
  foot: { w: 2, h: 0 },
  wall: true,
  draw: (ctx) => {
    rect(ctx, 1, 0, 30, 32, BRASS_DARK);
    rect(ctx, 3, 2, 26, 30, '#3a2014');
    for (const x of [4, 17]) {
      rect(ctx, x, 3, 11, 28, '#5a3220');
      strokeRect(ctx, x + 2, 5, 7, 10, '#3a2014');
      strokeRect(ctx, x + 2, 18, 7, 10, '#3a2014');
      hline(ctx, x + 3, 6, 5, '#7a4830');
    }
    px(ctx, 14, 18, BRASS_LIGHT);
    px(ctx, 17, 18, BRASS_LIGHT);
    // key-card reader
    rect(ctx, 28, 12, 3, 5, '#141218');
    px(ctx, 29, 13, '#59ff8a');
    drawText(ctx, '1201', 9, 0, BRASS_LIGHT, '3x5');
    strokeRect(ctx, 1, 0, 30, 32, O);
  },
});

/** Brass plaques on the walls of the upper floor. */
for (const [id, text] of [
  ['sign_skyline', 'SKYLINE'],
  ['sign_spa', 'SPA'],
  ['sign_boutique', 'BOUTIQUE'],
  ['sign_lounge', 'LOUNGE'],
  ['sign_skybar', 'SKY BAR'],
] as const) {
  const tw = measureText(text, '5x7');
  def({
    id,
    w: tw + 12,
    h: 13,
    foot: { w: 0, h: 0 },
    wall: true,
    light: { x: Math.round((tw + 12) / 2), y: 6, r: 22, color: '#ffe2a0', always: true },
    draw: (ctx) => {
      rect(ctx, 0, 0, tw + 12, 13, NAVY_DARK);
      strokeRect(ctx, 0, 0, tw + 12, 13, BRASS);
      strokeRect(ctx, 1, 1, tw + 10, 11, BRASS_DARK);
      drawText(ctx, text, 6, 3, BRASS_LIGHT, '5x7');
    },
  });
}
/** Overhead sign pointing the way to the members' lift on the ground floor. */
def({
  id: 'sign_lift',
  w: 36,
  h: 30,
  foot: { w: 0, h: 0 },
  overhead: true,
  draw: (ctx) => {
    vline(ctx, 8, 0, 8, BRASS_DARK);
    vline(ctx, 27, 0, 8, BRASS_DARK);
    rect(ctx, 0, 8, 36, 15, NAVY_DARK);
    strokeRect(ctx, 0, 8, 36, 15, BRASS);
    drawText(ctx, 'SKY', 3, 12, BRASS_LIGHT, '5x7');
    // arrow up
    for (let i = 0; i < 4; i++) hline(ctx, 28 - i, 12 + i, 1 + i * 2, BRASS_LIGHT);
    rect(ctx, 27, 16, 3, 4, BRASS_LIGHT);
  },
});


// ------------------------------------------------------------------ the Old Town: night market, pawn shop, community kitchen

const LANTERN = '#d8342a';
const LANTERN_LIT = '#ffa04a';

/** A red paper lantern, 5 × 6 px, lit at night. */
function lantern(ctx: Ctx, x: number, y: number): void {
  vline(ctx, x + 2, y - 2, 2, '#2a2a2e');
  rect(ctx, x + 1, y, 3, 1, '#a8801a');
  rect(ctx, x, y + 1, 5, 4, LANTERN);
  vline(ctx, x + 2, y + 1, 4, shade(LANTERN, -0.2));
  rect(ctx, x + 1, y + 5, 3, 1, '#a8801a');
  px(ctx, x + 2, y + 6, '#e0b13e');
}

/** The lit paper: red-orange with a bright core (the light map adds the halo). */
function lanternGlow(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x, y + 1, 5, 4, '#ff6a3a');
  rect(ctx, x + 1, y + 1, 3, 4, LANTERN_LIT);
  vline(ctx, x + 2, y + 2, 2, '#fff2c0');
}

interface StallLook {
  /** awning stripes */
  a: string;
  b: string;
  /** the front panel of the counter */
  panel: string;
  /** what is on the counter */
  goods: (ctx: Ctx) => void;
  /** pictogram on the hanging board, drawn in a 14 × 7 box at (x, y) */
  sign: (ctx: Ctx, x: number, y: number) => void;
}

/** A night market stall, 3 tiles wide. Frame 0 is open, frame 1 is packed up for the day. */
function stall(look: StallLook): Pick<PropDef, 'w' | 'h' | 'foot' | 'frames' | 'shut' | 'draw' | 'night' | 'light'> {
  const W = 48;
  const H = 46;
  return {
    w: W,
    h: H,
    foot: { w: 3, h: 1 },
    frames: 2,
    shut: true,
    light: { x: 24, y: 24, r: 34, color: '#ffc87a' },
    draw: (ctx, f) => {
      shadow(ctx, 24, 44, 22, 2);
      // poles
      for (const x of [3, 43]) {
        rect(ctx, x, 8, 2, 34, '#3a3a40');
        px(ctx, x, 8, '#5a5a62');
      }
      // the cart
      box(ctx, 1, 27, 46, 5, 12, '#c9a26a', look.panel);
      hline(ctx, 2, 28, 44, shade('#c9a26a', 0.15));
      for (let x = 6; x < 44; x += 10) vline(ctx, x, 33, 5, shade(look.panel, -0.18));
      rect(ctx, 6, 40, 4, 3, '#2a2a2e');
      rect(ctx, 38, 40, 4, 3, '#2a2a2e');
      if (f === 0) {
        // striped awning with a scalloped hem
        rect(ctx, 0, 3, W, 9, look.a);
        for (let x = 0; x < W; x += 8) rect(ctx, x + 4, 3, 4, 9, look.b);
        for (let x = 0; x < W; x += 4) {
          rect(ctx, x, 12, 4, 1, ((x / 4) & 1) === 0 ? look.a : look.b);
          px(ctx, x + 1, 13, ((x / 4) & 1) === 0 ? look.a : look.b);
          px(ctx, x + 2, 13, ((x / 4) & 1) === 0 ? look.a : look.b);
        }
        hline(ctx, 0, 3, W, shade(look.a, 0.25));
        strokeRect(ctx, 0, 2, W, 11, O);
        // hanging board
        vline(ctx, 17, 13, 2, '#2a2a2e');
        vline(ctx, 30, 13, 2, '#2a2a2e');
        rect(ctx, 15, 15, 18, 10, '#f4ead2');
        strokeRect(ctx, 15, 15, 18, 10, '#5a3a24');
        look.sign(ctx, 17, 17);
        lantern(ctx, 6, 14);
        lantern(ctx, 37, 14);
        look.goods(ctx);
      } else {
        // rolled-up awning and a tarp over the counter
        rect(ctx, 0, 8, W, 4, look.a);
        hline(ctx, 0, 8, W, shade(look.a, 0.25));
        hline(ctx, 0, 11, W, shade(look.a, -0.3));
        strokeRect(ctx, 0, 7, W, 6, O);
        rect(ctx, 2, 22, 44, 10, '#4a5a6a');
        hline(ctx, 2, 22, 44, '#6a7a8a');
        for (const x of [12, 34]) vline(ctx, x, 22, 14, '#c9b48e');
        strokeRect(ctx, 2, 22, 44, 10, '#2a323a');
      }
    },
    night: (ctx, f) => {
      if (f !== 0) return;
      lanternGlow(ctx, 6, 14);
      lanternGlow(ctx, 37, 14);
      ctx.fillStyle = 'rgba(255,214,150,0.22)';
      ctx.fillRect(4, 18, 40, 12);
    },
  };
}

def({
  id: 'stall_wok',
  ...stall({
    a: '#c8283a',
    b: '#f4ead2',
    panel: '#8a2a22',
    goods: (ctx) => {
      // a wok over a burner, plates of noodles
      ellipse(ctx, 14, 25, 8, 3, '#1a1a1e');
      ellipse(ctx, 14, 24, 6, 2, '#5a3a24');
      for (let i = 0; i < 5; i++) hline(ctx, 10 + i, 23 + (i % 2), 4, '#e8c06a');
      rect(ctx, 21, 23, 4, 1, '#5a5a62');
      for (const x of [29, 37]) {
        ellipse(ctx, x, 26, 4, 2, '#f4f1ea');
        hline(ctx, x - 2, 25, 4, '#c08a3a');
      }
    },
    sign: (ctx, x, y) => {
      ellipse(ctx, x + 7, y + 4, 6, 2, '#2a2a2e');
      hline(ctx, x + 2, y + 2, 10, '#e0a83a');
      rect(ctx, x + 12, y + 3, 3, 1, '#2a2a2e');
    },
  }),
});
def({
  id: 'stall_grill',
  ...stall({
    a: '#2f5a8a',
    b: '#f4ead2',
    panel: '#2a3a52',
    goods: (ctx) => {
      // a charcoal grill full of skewers
      rect(ctx, 6, 23, 24, 5, '#2a2a2e');
      for (let x = 8; x < 29; x += 3) px(ctx, x, 26, ['#ff7a3a', '#ffb03a', '#c83a2a'][x % 3]);
      for (let x = 8; x < 29; x += 4) {
        vline(ctx, x, 19, 6, '#c9a26a');
        rect(ctx, x - 1, 20, 3, 3, '#8a3a22');
      }
      // a pot of curry fish balls
      rect(ctx, 33, 21, 10, 6, '#8a8f96');
      hline(ctx, 33, 21, 10, '#c4c7cc');
      for (const x of [35, 38, 41]) px(ctx, x, 22, '#e8b84a');
    },
    sign: (ctx, x, y) => {
      for (let i = 0; i < 3; i++) {
        hline(ctx, x + 1, y + 1 + i * 2, 12, '#c9a26a');
        rect(ctx, x + 4 + i, y + i * 2, 3, 2, '#a8402a');
        rect(ctx, x + 9 - i, y + i * 2, 2, 2, '#a8402a');
      }
    },
  }),
});
def({
  id: 'stall_sweets',
  ...stall({
    a: '#e87aa0',
    b: '#fff2f6',
    panel: '#9a3a5a',
    goods: (ctx) => {
      // a big pot of red bean soup, bowls and a tea urn
      rect(ctx, 6, 19, 12, 8, '#c4c7cc');
      ellipse(ctx, 12, 19, 6, 2, '#7a2a2a');
      hline(ctx, 6, 26, 12, '#8a8f96');
      for (const x of [22, 28]) {
        ellipse(ctx, x, 26, 3, 2, '#f4f1ea');
        px(ctx, x, 25, '#8a2a2a');
      }
      rect(ctx, 34, 17, 8, 10, '#a8701a');
      rect(ctx, 35, 18, 6, 8, '#c8902a');
      px(ctx, 42, 22, '#5a5a62');
    },
    sign: (ctx, x, y) => {
      ellipse(ctx, x + 7, y + 4, 5, 2, '#f4f1ea');
      ellipse(ctx, x + 7, y + 3, 4, 1, '#8a2a2a');
      hline(ctx, x + 3, y + 6, 8, '#9a3a5a');
    },
  }),
});
def({
  id: 'stall_books',
  ...stall({
    a: '#4a6a3a',
    b: '#e8dcc0',
    panel: '#3a4a2a',
    goods: (ctx) => {
      // stacks of old books, spines up
      const cols = ['#a8402a', '#2f5a8a', '#e0b13e', '#5a3a24', '#4a6a3a', '#e8dcc0', '#7a2a5a'];
      for (let i = 0; i < 9; i++) {
        const x = 4 + i * 4;
        const h = 4 + ((i * 7) % 4);
        rect(ctx, x, 27 - h, 3, h, cols[i % cols.length]);
        hline(ctx, x, 27 - h, 3, shade(cols[i % cols.length], 0.25));
      }
      rect(ctx, 40, 22, 5, 5, '#e8dcc0');
      hline(ctx, 41, 23, 3, '#5a5a62');
    },
    sign: (ctx, x, y) => {
      rect(ctx, x + 2, y, 5, 7, '#2f5a8a');
      rect(ctx, x + 7, y, 5, 7, '#a8402a');
      vline(ctx, x + 7, y, 7, '#1a1a1e');
    },
  }),
});
def({
  id: 'stall_trinkets',
  ...stall({
    a: '#7a4aa8',
    b: '#f4ead2',
    panel: '#4a2a6a',
    goods: (ctx) => {
      // a cloth of hair clips, records in a crate, a bucket of flowers
      rect(ctx, 4, 24, 16, 3, '#2a1a3a');
      for (let x = 5; x < 20; x += 3) px(ctx, x, 25, ['#f4f1ea', '#e87aa0', '#e0b13e'][x % 3]);
      rect(ctx, 23, 20, 10, 7, '#8a5a36');
      for (let x = 24; x < 33; x += 2) vline(ctx, x, 18, 4, '#1a1a1e');
      circle(ctx, 29, 19, 2, '#1a1a1e');
      rect(ctx, 37, 22, 6, 5, '#5a606a');
      for (const [x, y, c] of [[37, 19, '#e04a5a'], [40, 18, '#f2c94c'], [42, 20, '#f4f1ea'], [39, 21, '#e87aa0']] as [number, number, string][]) {
        vline(ctx, x + 1, y + 1, 3, '#3f7a38');
        px(ctx, x, y, c);
        px(ctx, x + 1, y, c);
      }
    },
    sign: (ctx, x, y) => {
      circle(ctx, x + 4, y + 3, 2, '#e87aa0');
      circle(ctx, x + 10, y + 3, 2, '#e0b13e');
      px(ctx, x + 4, y + 3, '#f4f1ea');
    },
  }),
});

/** A string of lanterns overhead across the market aisle (lit while the market is open). */
def({
  id: 'lanterns',
  w: 64,
  h: 20,
  // placed with noBlock: the footprint only centres the string over four tiles
  foot: { w: 4, h: 1 },
  overhead: true,
  frames: 2,
  shut: true,
  draw: (ctx) => {
    for (let x = 0; x < 64; x++) px(ctx, x, 3 + Math.round(Math.sin((x / 64) * Math.PI) * 4), '#2a2a2e');
    for (const x of [6, 22, 38, 54]) lantern(ctx, x - 2, 5 + Math.round(Math.sin((x / 64) * Math.PI) * 4));
  },
  night: (ctx, f) => {
    if (f !== 0) return;
    for (const x of [6, 22, 38, 54]) lanternGlow(ctx, x - 2, 5 + Math.round(Math.sin((x / 64) * Math.PI) * 4));
  },
});

/** Folding plastic table at the night market. */
def({
  id: 'nm_table',
  w: 32,
  h: 20,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 16, 18, 14, 2);
    box(ctx, 1, 5, 30, 6, 4, '#d8342a', '#a82a22');
    hline(ctx, 2, 6, 28, shade('#d8342a', 0.2));
    for (const x of [3, 27]) rect(ctx, x, 15, 2, 4, '#8a2a22');
    // bowls, chopsticks, a beer bottle
    ellipse(ctx, 9, 7, 3, 1, '#f4f1ea');
    px(ctx, 9, 7, '#c08a3a');
    hline(ctx, 14, 8, 5, '#c9a26a');
    ellipse(ctx, 22, 7, 3, 1, '#f4f1ea');
    rect(ctx, 26, 2, 2, 6, '#3a7a3a');
    px(ctx, 26, 2, '#8ac08a');
  },
});
for (const [id, c] of [
  ['nm_stool', '#2f5a9a'],
  ['nm_stool_red', '#d8342a'],
] as const) {
  def({
    id,
    w: 12,
    h: 12,
    foot: { w: 1, h: 1 },
    draw: (ctx) => {
      shadow(ctx, 6, 10, 5, 1);
      ellipse(ctx, 6, 4, 5, 2, c);
      hline(ctx, 2, 4, 9, shade(c, 0.25));
      for (const x of [2, 9]) vline(ctx, x, 5, 5, shade(c, -0.25));
      hline(ctx, 3, 8, 6, shade(c, -0.25));
    },
  });
}

/** The fortune teller's table: red cloth, a candle, a cup of bamboo sticks, a banner. */
def({
  id: 'fortune_table',
  w: 32,
  h: 34,
  foot: { w: 2, h: 1 },
  light: { x: 9, y: 16, r: 20, color: '#ffb84a' },
  draw: (ctx) => {
    shadow(ctx, 16, 32, 14, 2);
    box(ctx, 1, 17, 24, 4, 11, '#9a1a24', '#7a1420');
    for (let x = 3; x < 25; x += 4) px(ctx, x, 27, '#e0b13e');
    // candle and sticks
    rect(ctx, 6, 13, 3, 5, '#f4ead2');
    px(ctx, 7, 12, '#ffcf6a');
    rect(ctx, 14, 12, 5, 6, '#8a5a36');
    for (let i = 0; i < 4; i++) vline(ctx, 15 + i, 8 + (i % 2), 4, '#c9a26a');
    // banner on a pole with the eight trigrams
    vline(ctx, 28, 2, 30, '#5a3a24');
    rect(ctx, 22, 3, 6, 14, '#f4ead2');
    strokeRect(ctx, 22, 3, 6, 14, '#5a3a24');
    circle(ctx, 25, 10, 2, '#1a1a1e');
    px(ctx, 25, 9, '#f4ead2');
    for (const y of [5, 14]) hline(ctx, 23, y, 4, '#1a1a1e');
  },
  night: (ctx) => {
    ctx.fillStyle = 'rgba(255,200,110,0.4)';
    ctx.fillRect(4, 10, 7, 6);
    px(ctx, 7, 12, '#fff2b0');
  },
});

/** The foreman's notice board at Pier 7: "workers wanted today, paid by the day". */
def({
  id: 'labor_board',
  w: 22,
  h: 30,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 11, 28, 9, 2);
    for (const x of [3, 18]) rect(ctx, x, 14, 2, 14, '#5a3a24');
    rect(ctx, 1, 2, 20, 15, '#8a5a36');
    strokeRect(ctx, 1, 2, 20, 15, O);
    rect(ctx, 3, 4, 16, 11, '#f4ead2');
    rect(ctx, 3, 4, 16, 3, '#c8283a');
    // a crate and lines of text
    rect(ctx, 5, 9, 4, 4, '#c9a26a');
    strokeRect(ctx, 5, 9, 4, 4, '#5a3a24');
    for (const y of [9, 11, 13]) hline(ctx, 11, y, 6, '#5a5a62');
  },
});

/** The pawnbroker's counter: dark wood with an iron grille and a small window. */
def({
  id: 'pawn_counter',
  w: 48,
  h: 36,
  foot: { w: 3, h: 1 },
  draw: (ctx) => {
    box(ctx, 0, 18, 48, 5, 13, '#4a2a18', '#3a2012');
    hline(ctx, 1, 19, 46, '#6a4228');
    for (let x = 4; x < 46; x += 11) strokeRect(ctx, x, 25, 8, 5, '#2a160c');
    // grille
    hline(ctx, 0, 1, 48, '#2a2a2e');
    for (let x = 1; x < 48; x += 4) {
      if (x > 17 && x < 30) continue;
      vline(ctx, x, 1, 17, '#3a3a40');
      px(ctx, x, 1, '#6a6a72');
    }
    hline(ctx, 0, 9, 48, '#3a3a40');
    // the window opening, a little brass bell, a ledger
    strokeRect(ctx, 17, 4, 14, 14, '#a8801a');
    rect(ctx, 37, 15, 4, 3, '#e0b13e');
    px(ctx, 39, 14, '#a8801a');
    rect(ctx, 21, 16, 7, 2, '#e8dcc0');
    hline(ctx, 21, 16, 7, '#a8402a');
  },
});

/** The pawnbroker's sign: three gold balls hanging from a bracket. */
def({
  id: 'pawn_sign',
  w: 18,
  h: 22,
  foot: { w: 0, h: 0 },
  wall: true,
  draw: (ctx) => {
    hline(ctx, 0, 2, 16, '#2a2a2e');
    vline(ctx, 1, 0, 5, '#2a2a2e');
    for (const x of [4, 9, 14]) vline(ctx, x, 3, 4, '#2a2a2e');
    for (const [x, y] of [[4, 9], [14, 9], [9, 15]] as [number, number][]) {
      circle(ctx, x, y, 3, O);
      circle(ctx, x, y, 2, P.gold);
      px(ctx, x - 1, y - 1, P.goldLight);
    }
    vline(ctx, 9, 7, 5, '#2a2a2e');
  },
});

def({
  id: 'safe',
  w: 16,
  h: 22,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 8, 20, 7, 2);
    box(ctx, 1, 3, 14, 3, 15, '#5a6a5e', '#3e4a42');
    circle(ctx, 8, 12, 3, '#a8a8a8');
    circle(ctx, 8, 12, 2, '#5a5a62');
    px(ctx, 8, 10, '#e8e8e8');
    rect(ctx, 12, 9, 1, 6, '#a8a8a8');
    hline(ctx, 2, 4, 12, '#7a8a7e');
  },
});

/** The community kitchen's serving line: steel counter, three steaming pots. */
def({
  id: 'serving_line',
  w: 48,
  h: 30,
  foot: { w: 3, h: 1 },
  frames: 2,
  draw: (ctx, f) => {
    box(ctx, 0, 12, 48, 6, 11, '#c4c7cc', '#8a8f96');
    hline(ctx, 1, 13, 46, '#e4e6ea');
    for (let i = 0; i < 3; i++) {
      const x = 4 + i * 15;
      rect(ctx, x, 7, 11, 8, '#a8acb2');
      hline(ctx, x, 7, 11, '#d4d8dc');
      ellipse(ctx, x + 5, 8, 4, 1, ['#c08a3a', '#e8dcc0', '#8a3a22'][i]);
      strokeRect(ctx, x, 7, 11, 8, '#5a5f66');
      // steam
      for (let k = 0; k < 2; k++) px(ctx, x + 3 + k * 4, 4 - ((f + k + i) % 2), 'rgba(255,255,255,0.7)');
      px(ctx, x + 5, 2 + ((f + i) % 2), 'rgba(255,255,255,0.5)');
    }
    // ladle and a stack of trays
    vline(ctx, 18, 3, 6, '#5a5f66');
    rect(ctx, 42, 16, 5, 2, '#e8dcc0');
  },
});

/** A long communal table, with benches drawn separately. */
def({
  id: 'long_table',
  w: 64,
  h: 18,
  foot: { w: 4, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 32, 16, 30, 2);
    box(ctx, 0, 4, 64, 6, 5, P.woodLight, P.wood);
    hline(ctx, 1, 5, 62, P.woodPale);
    for (const x of [2, 60]) rect(ctx, x, 14, 2, 3, P.woodDark);
    for (const x of [8, 22, 38, 52]) {
      ellipse(ctx, x, 6, 3, 1, '#f4f1ea');
      px(ctx, x, 6, '#c08a3a');
    }
    rect(ctx, 30, 5, 3, 3, '#e0b13e');
  },
});
def({
  id: 'long_bench',
  w: 64,
  h: 10,
  // placed with noBlock so people can sit on it
  foot: { w: 4, h: 1 },
  draw: (ctx) => {
    rect(ctx, 1, 2, 62, 3, P.wood);
    hline(ctx, 1, 2, 62, P.woodLight);
    for (const x of [3, 59]) rect(ctx, x, 5, 2, 4, P.woodDark);
    strokeRect(ctx, 1, 2, 62, 3, O);
  },
});

def({
  id: 'donation_box',
  w: 16,
  h: 24,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 8, 22, 6, 2);
    rect(ctx, 6, 14, 4, 8, P.woodDark);
    box(ctx, 2, 4, 12, 3, 8, P.woodLight, P.wood);
    rect(ctx, 5, 5, 6, 1, '#1a1a1e');
    rect(ctx, 5, 9, 6, 3, '#f4ead2');
    px(ctx, 7, 10, '#c8283a');
    px(ctx, 8, 10, '#c8283a');
  },
});

/** The board of names in the dining hall: who gives to the kitchen. */
def({
  id: 'donor_board',
  w: 32,
  h: 36,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 16, 34, 13, 2);
    for (const x of [4, 26]) rect(ctx, x, 22, 2, 12, P.woodDark);
    rect(ctx, 0, 1, 32, 23, P.woodDark);
    rect(ctx, 2, 3, 28, 19, '#3a2416');
    rect(ctx, 4, 4, 24, 4, '#c8283a');
    hline(ctx, 4, 8, 24, '#8a1a1a');
    for (let i = 0; i < 4; i++) {
      rect(ctx, 5, 11 + i * 3, 13 - (i % 3) * 3, 1, P.goldLight);
      rect(ctx, 22, 11 + i * 3, 5, 1, P.gold);
    }
    strokeRect(ctx, 0, 1, 32, 23, O);
  },
});


// ------------------------------------------------------------------ the Grand Hotel: lobby and ballroom

/** An easel; the lot on it is drawn over the blank canvas by the world (see WorldScene). */
def({
  id: 'easel',
  w: 32,
  h: 44,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 16, 42, 12, 2);
    // legs
    for (const [x0, x1] of [[6, 2], [26, 30]] as [number, number][]) {
      for (let y = 6; y < 42; y++) px(ctx, Math.round(x0 + ((x1 - x0) * (y - 6)) / 36), y, P.woodDark);
    }
    vline(ctx, 16, 2, 40, P.wood);
    hline(ctx, 3, 27, 26, P.woodDark);
    // the blank canvas (covered by the lot's picture)
    rect(ctx, 2, 3, 28, 22, '#e8e0cc');
    strokeRect(ctx, 2, 3, 28, 22, '#a8801a');
  },
});

def({
  id: 'rostrum',
  w: 32,
  h: 34,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 16, 32, 14, 2);
    box(ctx, 3, 8, 26, 5, 18, '#5a2a18', '#3a1a10');
    rect(ctx, 11, 15, 10, 9, '#a8801a');
    rect(ctx, 12, 16, 8, 7, '#e0b13e');
    px(ctx, 16, 19, '#5a2a18');
    // the gavel and its block
    rect(ctx, 6, 6, 5, 2, '#2a1a10');
    rect(ctx, 20, 4, 8, 3, '#6a3a1a');
    vline(ctx, 23, 7, 3, '#4a2a10');
  },
});

def({
  id: 'banquet_chair',
  w: 14,
  h: 20,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 7, 18, 5, 1);
    // seen from behind: gold frame, red cushion
    for (const x of [2, 11]) vline(ctx, x, 2, 16, '#c9a24a');
    for (const y of [3, 6, 9]) hline(ctx, 2, y, 10, '#e0b13e');
    rect(ctx, 2, 11, 10, 3, '#9a1a2a');
    hline(ctx, 2, 11, 10, '#c8283a');
    for (const x of [3, 10]) vline(ctx, x, 14, 4, '#a8801a');
  },
});

{
  const text = 'GREYHAVEN AUCTIONS';
  const tw = measureText(text, '5x7');
  def({
    id: 'auction_banner',
    w: tw + 16,
    h: 17,
    foot: { w: 0, h: 0 },
    wall: true,
    light: { x: Math.round((tw + 16) / 2), y: 8, r: 30, color: '#ffe2a0', always: true },
    draw: (ctx) => {
      rect(ctx, 0, 0, tw + 16, 17, '#4a0e1a');
      strokeRect(ctx, 0, 0, tw + 16, 17, P.gold);
      strokeRect(ctx, 2, 2, tw + 12, 13, P.goldDark);
      drawText(ctx, text, 8, 5, P.goldLight, '5x7');
    },
  });
}

def({
  id: 'auction_desk',
  w: 32,
  h: 28,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 16, 26, 14, 2);
    box(ctx, 1, 9, 30, 5, 12, '#f4ead2', '#4a0e1a');
    hline(ctx, 2, 22, 28, P.gold);
    // paddles in a holder, a ledger, a pen
    for (let i = 0; i < 4; i++) {
      vline(ctx, 5 + i * 3, 5, 5, P.woodDark);
      rect(ctx, 4 + i * 3, 2, 3, 4, '#f4f1ea');
      px(ctx, 5 + i * 3, 3, '#1a1a1e');
    }
    rect(ctx, 18, 10, 9, 3, '#2a4a3a');
    hline(ctx, 18, 10, 9, '#3a6a4a');
    vline(ctx, 28, 8, 4, '#1a1a1e');
  },
});

/** A poster on a stand in the lobby: this Sunday's sale. */
def({
  id: 'poster_stand',
  w: 20,
  h: 38,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 10, 36, 7, 2);
    vline(ctx, 10, 22, 14, '#a8801a');
    hline(ctx, 6, 35, 9, '#a8801a');
    rect(ctx, 1, 1, 18, 23, '#4a0e1a');
    strokeRect(ctx, 1, 1, 18, 23, P.gold);
    rect(ctx, 4, 4, 12, 9, '#e8e0cc');
    // a little framed picture and lines of text
    rect(ctx, 5, 5, 10, 7, '#3f6eb0');
    rect(ctx, 5, 9, 10, 3, '#3f6a3a');
    for (const y of [15, 17, 19]) hline(ctx, 4, y, 12, P.goldLight);
  },
});


// ------------------------------------------------------------------ the marina

/** The harbour tour boat: two decks, a striped funnel, bobbing at the pier. */
def({
  id: 'tour_boat',
  w: 72,
  h: 38,
  foot: { w: 4, h: 1 },
  frames: 2,
  draw: (ctx, f) => {
    const y = f;
    shadow(ctx, 36, 32 + y, 34, 4);
    // hull
    rect(ctx, 2, 22 + y, 68, 9, '#f4f1ea');
    rect(ctx, 2, 28 + y, 68, 3, '#2a4a8a');
    for (let x = 2; x < 6; x++) px(ctx, x, 30 + y - (x - 2), '#f4f1ea');
    strokeRect(ctx, 2, 22 + y, 68, 9, O);
    // lower deck with windows, upper deck with railings
    rect(ctx, 8, 14 + y, 54, 9, '#e8e2d0');
    for (let x = 11; x < 60; x += 6) rect(ctx, x, 16 + y, 4, 4, '#3a6a9a');
    strokeRect(ctx, 8, 14 + y, 54, 9, O);
    rect(ctx, 14, 8 + y, 34, 6, '#e8e2d0');
    for (let x = 14; x < 48; x += 3) vline(ctx, x, 5 + y, 3, '#5a606a');
    hline(ctx, 14, 5 + y, 34, '#5a606a');
    strokeRect(ctx, 14, 8 + y, 34, 6, O);
    // funnel and flag
    rect(ctx, 52, 4 + y, 6, 10, '#c8283a');
    hline(ctx, 52, 7 + y, 6, '#f4f1ea');
    vline(ctx, 20, 0 + y, 6, '#2a2a2e');
    rect(ctx, 21, 0 + y, 5, 3, '#e0b13e');
    drawText(ctx, 'TOURS', 26, 24 + y, '#2a4a8a', '3x5');
  },
  night: (ctx, f) => {
    for (let x = 11; x < 60; x += 6) rect(ctx, x, 16 + f, 4, 4, '#ffd88a');
  },
});

/** A Seagull 42 sailing yacht, sails furled; the hull stripe and name tell the boats apart. */
function sailYacht(id: string, name: string, stripe: string): void {
  def({
    id,
    w: 64,
    h: 54,
    foot: { w: 4, h: 1 },
    frames: 2,
    draw: (ctx, f) => {
      const y = f;
      shadow(ctx, 32, 48 + y, 30, 4);
      // mast, stays, boom and the furled sail
      vline(ctx, 30, 2 + y, 36, '#c8ccd4');
      vline(ctx, 31, 2 + y, 36, '#8a8f96');
      for (let k = 0; k < 20; k++) px(ctx, 31 + k, 4 + y + Math.round(k * 1.6), '#5a606a');
      for (let k = 0; k < 16; k++) px(ctx, 29 - k, 4 + y + Math.round(k * 2), '#5a606a');
      hline(ctx, 14, 31 + y, 18, '#8a8f96');
      rect(ctx, 15, 28 + y, 15, 3, '#f4f1ea');
      for (let x = 17; x < 30; x += 4) px(ctx, x, 29 + y, '#5a606a');
      // hull with a raked bow on the right
      rect(ctx, 4, 38 + y, 52, 8, '#f8f6f0');
      for (let k = 0; k < 6; k++) vline(ctx, 56 + k, 38 + y, 7 - k, '#f8f6f0');
      rect(ctx, 4, 44 + y, 53, 2, stripe);
      hline(ctx, 4, 38 + y, 56, O);
      hline(ctx, 4, 46 + y, 52, O);
      vline(ctx, 3, 38 + y, 9, O);
      for (let k = 0; k < 6; k++) px(ctx, 56 + k, 45 + y - k, O);
      drawText(ctx, name, 8, 39 + y, stripe, '3x5');
      // cabin, cockpit and the teak deck
      rect(ctx, 20, 33 + y, 22, 5, '#e8e2d0');
      for (const x of [23, 29, 35]) rect(ctx, x, 34 + y, 4, 2, '#3a5a7a');
      strokeRect(ctx, 20, 33 + y, 22, 5, O);
      hline(ctx, 5, 37 + y, 50, '#b88a56');
      rect(ctx, 6, 35 + y, 6, 2, '#a8703f');
      // the rail and the stern ladder
      hline(ctx, 4, 34 + y, 14, '#c8ccd4');
      for (const x of [4, 9, 14]) vline(ctx, x, 34 + y, 3, '#c8ccd4');
      vline(ctx, 2, 40 + y, 6, '#c8ccd4');
    },
    night: (ctx, f) => {
      for (const x of [23, 29, 35]) rect(ctx, x, 34 + f, 4, 2, '#ffd88a');
      px(ctx, 30, 2 + f, '#ff5a4a');
      px(ctx, 60, 39 + f, '#5aff7a');
    },
  });
}
sailYacht('yacht_club', 'ALBATROSS', '#b8283a');
sailYacht('yacht_seagull', 'SEAGULL', '#1c2a4a');

/** A big motor yacht: flybridge, tinted glass. */
function motorYacht(id: string, name: string, hull: string, trim: string, letters: string): void {
  def({
    id,
    w: 96,
    h: 44,
    foot: { w: 6, h: 1 },
    frames: 2,
    draw: (ctx, f) => {
      const y = f;
      shadow(ctx, 48, 38 + y, 46, 4);
      rect(ctx, 2, 26 + y, 84, 10, hull);
      for (let k = 0; k < 10; k++) vline(ctx, 86 + k, 26 + y, Math.max(1, 9 - k), hull);
      rect(ctx, 2, 32 + y, 86, 2, trim);
      hline(ctx, 2, 26 + y, 92, O);
      hline(ctx, 2, 36 + y, 84, O);
      vline(ctx, 1, 26 + y, 11, O);
      for (let k = 0; k < 10; k++) px(ctx, 86 + k, 35 + y - k, O);
      // swim platform at the stern
      rect(ctx, 0, 33 + y, 4, 2, '#b88a56');
      // main deck saloon and the flybridge
      rect(ctx, 14, 16 + y, 62, 10, '#f0ede4');
      rect(ctx, 18, 18 + y, 54, 5, '#1a2230');
      hline(ctx, 18, 18 + y, 54, '#3a4a60');
      strokeRect(ctx, 14, 16 + y, 62, 10, O);
      rect(ctx, 28, 9 + y, 34, 7, '#f0ede4');
      rect(ctx, 32, 10 + y, 24, 4, '#1a2230');
      strokeRect(ctx, 28, 9 + y, 34, 7, O);
      vline(ctx, 50, 2 + y, 7, '#c8ccd4');
      hline(ctx, 46, 4 + y, 9, '#c8ccd4');
      hline(ctx, 4, 25 + y, 10, '#c8ccd4');
      hline(ctx, 76, 25 + y, 10, '#c8ccd4');
      drawText(ctx, name, 6, 27 + y, letters, '3x5');
    },
    night: (ctx, f) => {
      rect(ctx, 18, 18 + f, 54, 5, '#ffd88a');
      rect(ctx, 32, 10 + f, 24, 4, '#ffe2a8');
      hline(ctx, 2, 36 + f, 84, 'rgba(120,180,255,0.6)');
    },
  });
}
motorYacht('yacht_aurora', 'AURORA', '#f8f6f0', '#2a2e38', '#a8801a');
motorYacht('yacht_whitmore', 'WHITMORE', '#1c2a44', '#c9a24a', '#e0b13e');

def({
  id: 'marina_office',
  w: 32,
  h: 40,
  foot: { w: 2, h: 1 },
  light: { x: 16, y: 20, r: 30, color: '#ffe2a0' },
  draw: (ctx) => {
    shadow(ctx, 16, 38, 14, 2);
    rect(ctx, 2, 12, 28, 26, '#f4f1ea');
    for (let yy = 14; yy < 36; yy += 4) hline(ctx, 2, yy, 28, '#dcd6c8');
    // roof
    for (let i = 0; i < 6; i++) hline(ctx, 1 + i, 6 + i, 30 - i * 2, i === 0 ? O : '#2a4a8a');
    rect(ctx, 0, 11, 32, 2, '#1c3a6a');
    // sign, window, door, life ring
    rect(ctx, 3, 14, 26, 7, '#2a4a8a');
    drawText(ctx, 'MARINA', 5, 15, '#ffffff', '3x5');
    rect(ctx, 5, 23, 9, 7, '#3a6a9a');
    strokeRect(ctx, 5, 23, 9, 7, O);
    rect(ctx, 18, 24, 8, 14, P.woodDark);
    px(ctx, 24, 31, P.gold);
    circle(ctx, 9, 34, 3, '#e86a2a');
    circle(ctx, 9, 34, 1, '#f4f1ea');
    strokeRect(ctx, 2, 12, 28, 26, O);
  },
  night: (ctx) => {
    rect(ctx, 5, 23, 9, 7, '#ffd88a');
  },
});

def({
  id: 'bollard',
  w: 10,
  h: 12,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 5, 10, 4, 1);
    rect(ctx, 2, 3, 6, 7, '#2a2e38');
    rect(ctx, 1, 2, 8, 2, '#3a3f4a');
    hline(ctx, 2, 5, 6, '#c9b48e');
  },
});

// ------------------------------------------------------------------ Whitestone Bay

/** A coconut palm, leaning a little seaward. */
def({
  id: 'palm_tree',
  w: 44,
  h: 66,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 24, 63, 12, 3);
    // the trunk curves up and to the left, ringed
    for (let y = 63; y > 18; y--) {
      const t = (63 - y) / 45;
      const x = Math.round(22 - t * t * 7);
      rect(ctx, x - 2, y, 4, 1, (y % 4 === 0) ? '#6a4a2a' : '#8a6a42');
      px(ctx, x - 2, y, '#5a3e22');
    }
    // coconuts
    for (const [x, y] of [[13, 21], [17, 22], [15, 24]] as [number, number][]) circle(ctx, x, y, 2, '#5a3a1a');
    // fronds: arcs out from the crown, darker underneath
    const cx = 15;
    const cy = 18;
    const fronds: [number, number][] = [[-2.8, 18], [-2.2, 20], [-1.6, 15], [-0.9, 19], [-0.3, 17], [0.3, 20], [0.9, 16], [-3.1, 14]];
    for (const [a0, len] of fronds) {
      for (let r = 1; r < len; r++) {
        const a = a0 + (r / len) * 0.5 * (Math.cos(a0) > 0 ? 1 : -1);
        const x = Math.round(cx + Math.cos(a) * r);
        const y = Math.round(cy + Math.sin(a) * r * 0.75 + (r * r) / 26);
        px(ctx, x, y, r < len * 0.5 ? '#2f6a2e' : '#4f8f3a');
        px(ctx, x, y + 1, '#24502a');
        if (r % 3 === 0) px(ctx, x, y + 2, '#3f7a34');
      }
    }
    circle(ctx, cx, cy, 2, '#3f7a34');
  },
});

function beachUmbrella(id: string, a: string, b: string): void {
  def({
    id,
    w: 32,
    h: 36,
    foot: { w: 1, h: 1 },
    draw: (ctx) => {
      shadow(ctx, 18, 34, 12, 3);
      vline(ctx, 16, 10, 25, '#e8e2d0');
      vline(ctx, 17, 10, 25, '#b8b2a0');
      // the canopy in eight stripes
      for (let j = 0; j < 10; j++) {
        const half = 3 + j * 1.3;
        for (let x = Math.round(16 - half); x <= Math.round(16 + half); x++) {
          const stripe = Math.floor(((x - 16) / (half + 0.01)) * 4 + 4);
          px(ctx, x, 2 + j, stripe % 2 === 0 ? a : b);
        }
      }
      hline(ctx, 3, 12, 27, shade(a, -0.3));
      for (let x = 4; x < 30; x += 4) px(ctx, x, 13, shade(a, -0.3));
      px(ctx, 16, 1, '#e8e2d0');
    },
  });
}
beachUmbrella('beach_umbrella', '#d8342a', '#f4f1ea');
beachUmbrella('beach_umbrella_b', '#2a6ab0', '#f4f1ea');
beachUmbrella('resort_parasol', '#f4f1ea', '#e8dcc0');

/** A sun lounger with a folded towel. */
function lounger(id: string, frame: string, towel: string): void {
  def({
    id,
    w: 32,
    h: 18,
    foot: { w: 2, h: 1 },
    draw: (ctx) => {
      shadow(ctx, 16, 16, 14, 2);
      // the slatted bed, its raised back on the left
      rect(ctx, 6, 8, 24, 4, frame);
      for (let x = 7; x < 30; x += 3) vline(ctx, x, 8, 4, shade(frame, -0.18));
      for (let k = 0; k < 6; k++) rect(ctx, 1 + k, 7 - k, 2, 5, frame);
      hline(ctx, 6, 12, 24, shade(frame, -0.35));
      for (const x of [7, 27]) vline(ctx, x, 12, 4, shade(frame, -0.4));
      vline(ctx, 2, 8, 6, shade(frame, -0.4));
      rect(ctx, 18, 6, 9, 3, towel);
      hline(ctx, 18, 6, 9, shade(towel, 0.2));
      hline(ctx, 18, 8, 9, shade(towel, -0.25));
    },
  });
}
lounger('lounger', '#f4f1ea', '#2a8ac0');
lounger('lounger_teak', '#b8864e', '#f4f1ea');

def({
  id: 'lifeguard_tower',
  w: 40,
  h: 56,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 20, 54, 16, 2);
    // stilts and a ladder
    for (const x of [6, 31]) rect(ctx, x, 30, 3, 24, '#c8a878');
    for (let y = 34; y < 54; y += 4) hline(ctx, 15, y, 9, '#a8885a');
    vline(ctx, 15, 32, 22, '#a8885a');
    vline(ctx, 23, 32, 22, '#a8885a');
    // the hut, its window and its name
    rect(ctx, 1, 14, 38, 17, '#f4f1ea');
    rect(ctx, 1, 21, 38, 3, '#d8342a');
    rect(ctx, 7, 16, 26, 4, '#3a5a7a');
    strokeRect(ctx, 1, 14, 38, 17, O);
    for (let i = 0; i < 6; i++) hline(ctx, i, 13 - i, 40 - i * 2, i === 0 ? O : '#d8342a');
    drawText(ctx, 'LIFEGUARD', 3, 25, '#2a2a2e', '3x5');
    // the flag
    vline(ctx, 33, 0, 8, '#5a5a62');
    rect(ctx, 34, 0, 3, 3, '#d8342a');
    rect(ctx, 34, 3, 3, 2, '#f2c94c');
  },
});

/** The beach shack: a thatched kiosk with a counter of drinks. Frame 1 is shuttered for the night. */
def({
  id: 'beach_bar',
  w: 64,
  h: 50,
  foot: { w: 4, h: 1 },
  frames: 2,
  shut: true,
  light: { x: 32, y: 30, r: 40, color: '#ffc87a' },
  draw: (ctx, f) => {
    shadow(ctx, 32, 48, 30, 2);
    for (const x of [4, 58]) rect(ctx, x, 14, 3, 33, '#7a5a34');
    // counter
    box(ctx, 2, 30, 60, 4, 13, '#a8703f', '#8a5a30');
    for (let x = 4; x < 60; x += 6) vline(ctx, x, 35, 12, '#6a4424');
    // thatch roof
    for (let i = 0; i < 12; i++) hline(ctx, 6 - Math.floor(i / 2), 4 + i, 52 + Math.floor(i / 2) * 2, i % 3 === 0 ? '#c8a050' : '#d8b468');
    for (let x = 1; x < 63; x += 3) vline(ctx, x, 14, 3, '#b8903e');
    hline(ctx, 0, 16, 64, '#8a6a2a');
    // sign
    rect(ctx, 20, 17, 24, 7, '#2a6ab0');
    drawText(ctx, 'SHACK', 23, 18, '#f4f1ea', '3x5');
    if (f === 0) {
      // bottles, coconuts, a blender
      for (let x = 9; x < 19; x += 3) rect(ctx, x, 25, 2, 5, ['#3a8a4a', '#c8a050', '#8a3a2a', '#3a6a9a'][(x / 3) % 4 | 0]);
      circle(ctx, 46, 28, 2, '#6a4a2a');
      circle(ctx, 51, 28, 2, '#6a4a2a');
      rect(ctx, 26, 24, 4, 6, '#c8ccd4');
    } else {
      // the shutter down
      rect(ctx, 6, 24, 52, 7, '#8a6a42');
      for (let y = 25; y < 31; y += 2) hline(ctx, 6, y, 52, '#6a4a2a');
    }
  },
  night: (ctx, f) => {
    if (f !== 0) return;
    rect(ctx, 20, 17, 24, 7, '#3a8ae0');
    for (const x of [8, 20, 32, 44, 56]) {
      circle(ctx, x, 15, 1, '#ffe2a0');
    }
  },
});

/** A fish market stall: an awning, ice and the morning's catch. Frame 1 is packed up. */
def({
  id: 'fish_stall',
  w: 48,
  h: 40,
  foot: { w: 3, h: 1 },
  frames: 2,
  shut: true,
  draw: (ctx, f) => {
    shadow(ctx, 24, 38, 22, 2);
    for (const x of [2, 44]) rect(ctx, x, 6, 2, 31, '#5a5a62');
    for (let x = 0; x < 48; x++) rect(ctx, x, 3, 1, 6, Math.floor(x / 6) % 2 === 0 ? '#2a6ab0' : '#f4f1ea');
    hline(ctx, 0, 9, 48, '#1c4a80');
    box(ctx, 4, 22, 40, 4, 11, '#c8ccd4', '#9aa0aa');
    if (f === 0) {
      // ice and fish
      rect(ctx, 6, 20, 36, 4, '#e8f4fa');
      for (let i = 0; i < 6; i++) {
        const x = 8 + i * 6;
        ellipse(ctx, x + 2, 21, 3, 1, i % 3 === 0 ? '#8a9aaa' : i % 3 === 1 ? '#c86a5a' : '#6a7a8a');
        px(ctx, x - 1, 21, '#2a2a2e');
        px(ctx, x + 5, 20, i % 3 === 1 ? '#a85a4a' : '#5a6a7a');
        px(ctx, x + 5, 22, i % 3 === 1 ? '#a85a4a' : '#5a6a7a');
      }
      // a crab and a price board
      ellipse(ctx, 40, 17, 3, 2, '#d8542a');
      rect(ctx, 6, 12, 10, 6, '#2a2a2e');
      for (const y of [14, 16]) hline(ctx, 8, y, 6, '#f4f1ea');
    } else {
      // a tarp over the counter
      rect(ctx, 4, 16, 40, 8, '#3a6a5a');
      for (let x = 6; x < 44; x += 5) vline(ctx, x, 16, 8, '#2f5a4a');
    }
  },
});

/** A small fishing boat: wheelhouse, outrigger, nets. */
def({
  id: 'fishing_boat',
  w: 70,
  h: 46,
  foot: { w: 4, h: 1 },
  frames: 2,
  draw: (ctx, f) => {
    const y = f;
    shadow(ctx, 35, 41 + y, 32, 4);
    // hull, blue with a red waterline
    rect(ctx, 4, 30 + y, 60, 9, '#2a5a8a');
    for (let k = 0; k < 6; k++) vline(ctx, 64 + k, 30 + y, 8 - k, '#2a5a8a');
    rect(ctx, 4, 36 + y, 60, 2, '#a8302a');
    hline(ctx, 4, 30 + y, 66, '#f4f1ea');
    strokeRect(ctx, 4, 30 + y, 60, 9, O);
    drawText(ctx, 'BAY 7', 8, 32 + y, '#f4f1ea', '3x5');
    // wheelhouse
    rect(ctx, 38, 18 + y, 16, 12, '#f4f1ea');
    rect(ctx, 40, 20 + y, 5, 4, '#3a5a7a');
    rect(ctx, 47, 20 + y, 5, 4, '#3a5a7a');
    strokeRect(ctx, 38, 18 + y, 16, 12, O);
    rect(ctx, 37, 16 + y, 18, 2, '#a8302a');
    // mast, boom and a net hanging off it
    vline(ctx, 24, 2 + y, 28, '#6a4a2a');
    for (let k = 0; k < 18; k++) px(ctx, 24 - k, 6 + y + Math.round(k * 0.6), '#5a5a62');
    for (let j = 0; j < 12; j++) for (let i = 0; i < 8; i++) if ((i + j) % 2 === 0) px(ctx, 10 + i + Math.round(j * 0.3), 14 + y + j, '#7a8a6a');
    // a buoy and a crate on deck
    circle(ctx, 60, 28 + y, 2, '#e86a2a');
    rect(ctx, 28, 26 + y, 6, 4, '#c9a26a');
  },
  night: (ctx, f) => {
    rect(ctx, 40, 20 + f, 5, 4, '#ffd88a');
    px(ctx, 24, 2 + f, '#ff5a4a');
  },
});

/** Fishing nets hung up to dry between poles. */
def({
  id: 'nets',
  w: 48,
  h: 30,
  foot: { w: 3, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 24, 28, 22, 2);
    for (const x of [2, 23, 44]) rect(ctx, x, 4, 2, 24, '#6a4a2a');
    for (let x = 3; x < 45; x++) {
      const sag = Math.round(Math.sin(((x - 3) % 21) / 21 * Math.PI) * 4);
      for (let y = 5 + sag; y < 22 + sag; y++) if ((x + y) % 3 === 0 || (x - y) % 3 === 0) px(ctx, x, y, (x + y) % 6 === 0 ? '#5a7a5a' : '#7a9a6a');
    }
    // a float or two
    circle(ctx, 12, 9, 1, '#e86a2a');
    circle(ctx, 34, 10, 1, '#f2c94c');
  },
});

/** The lighthouse on the point: white and red, with its lamp lit after dark. */
def({
  id: 'lighthouse',
  w: 48,
  h: 120,
  foot: { w: 3, h: 2 },
  light: { x: 24, y: 14, r: 90, color: '#fff2c0', always: false },
  draw: (ctx) => {
    shadow(ctx, 26, 116, 20, 4);
    // the keeper's hut at its foot
    rect(ctx, 2, 98, 16, 16, '#e8e2d4');
    for (let i = 0; i < 4; i++) hline(ctx, 1 + i, 97 - i, 18 - i * 2, i === 0 ? O : '#4a5a6a');
    rect(ctx, 7, 105, 5, 9, '#5a3a24');
    strokeRect(ctx, 2, 98, 16, 16, O);
    // the tower, tapering, in bands
    for (let y = 24; y < 114; y++) {
      const t = (y - 24) / 90;
      const half = Math.round(7 + t * 6);
      const band = Math.floor((y - 24) / 15) % 2 === 1;
      hline(ctx, 26 - half, y, half * 2, band ? '#c8283a' : '#f4f1ea');
      px(ctx, 26 - half, y, O);
      px(ctx, 25 + half, y, O);
      px(ctx, 24 + half, y, band ? '#a01c2c' : '#d8d4ca');
    }
    // windows up the tower
    for (const y of [40, 64, 88]) rect(ctx, 25, y, 3, 5, '#3a4a5a');
    // gallery, lamp room, cap
    rect(ctx, 14, 21, 24, 3, '#2a2a2e');
    for (let x = 15; x < 38; x += 3) vline(ctx, x, 17, 4, '#3a3a40');
    rect(ctx, 19, 9, 14, 9, '#fff2c0');
    for (const x of [19, 23, 28, 32]) vline(ctx, x, 9, 9, '#3a3a40');
    for (let i = 0; i < 6; i++) hline(ctx, 18 + i, 8 - i, 16 - i * 2, '#2a2a2e');
    px(ctx, 26, 1, '#e0b13e');
  },
  night: (ctx) => {
    rect(ctx, 19, 9, 14, 9, '#fffbe0');
    for (let k = 0; k < 4; k++) hline(ctx, 33 + k * 2, 12 + Math.floor(k / 2), 6, 'rgba(255,246,200,0.5)');
    for (const y of [40, 64, 88]) rect(ctx, 25, y, 3, 5, '#ffd88a');
    rect(ctx, 7, 105, 5, 9, '#ffd88a');
  },
});

/** The Greyhaven–Whitestone ferry: two decks of windows, a green stripe, a funnel. */
def({
  id: 'ferry',
  w: 128,
  h: 56,
  foot: { w: 8, h: 1 },
  frames: 2,
  draw: (ctx, f) => {
    const y = f;
    shadow(ctx, 64, 50 + y, 60, 4);
    // hull
    rect(ctx, 4, 34 + y, 116, 13, '#f4f1ea');
    for (let k = 0; k < 8; k++) vline(ctx, 120 + k, 34 + y, 12 - k, '#f4f1ea');
    rect(ctx, 4, 42 + y, 117, 3, '#2a7a5a');
    rect(ctx, 4, 45 + y, 116, 2, '#1c2a3a');
    hline(ctx, 4, 34 + y, 124, O);
    hline(ctx, 4, 47 + y, 116, O);
    vline(ctx, 3, 34 + y, 14, O);
    for (let k = 0; k < 8; k++) px(ctx, 120 + k, 46 + y - k, O);
    drawText(ctx, 'WHITESTONE FERRY', 18, 36 + y, '#2a7a5a', '3x5');
    // main deck saloon with a row of windows
    rect(ctx, 10, 22 + y, 100, 12, '#e8e4da');
    for (let x = 13; x < 107; x += 7) rect(ctx, x, 25 + y, 5, 5, '#3a6a8a');
    strokeRect(ctx, 10, 22 + y, 100, 12, O);
    // upper deck: rail, the bridge forward, the first-class lounge aft
    rect(ctx, 22, 13 + y, 70, 9, '#f4f1ea');
    for (let x = 25; x < 60; x += 6) rect(ctx, x, 15 + y, 4, 4, '#3a5a7a');
    rect(ctx, 76, 15 + y, 14, 4, '#1a2a3a');
    strokeRect(ctx, 22, 13 + y, 70, 9, O);
    hline(ctx, 8, 21 + y, 14, '#c8ccd4');
    for (const x of [8, 13, 18]) vline(ctx, x, 18 + y, 4, '#c8ccd4');
    hline(ctx, 22, 11 + y, 70, '#c8ccd4');
    for (let x = 22; x < 92; x += 6) vline(ctx, x, 11 + y, 2, '#c8ccd4');
    // funnel
    rect(ctx, 64, 2 + y, 9, 11, '#2a7a5a');
    rect(ctx, 64, 5 + y, 9, 2, '#f4f1ea');
    strokeRect(ctx, 64, 2 + y, 9, 11, O);
    // a life ring on the saloon
    circle(ctx, 110, 28 + y, 2, '#e86a2a');
  },
  night: (ctx, f) => {
    for (let x = 13; x < 107; x += 7) rect(ctx, x, 25 + f, 5, 5, '#ffd88a');
    for (let x = 25; x < 60; x += 6) rect(ctx, x, 15 + f, 4, 4, '#ffe2a8');
    px(ctx, 125, 38 + f, '#5aff7a');
    px(ctx, 6, 36 + f, '#ff5a4a');
  },
});

/** The ferry's ticket booth with its timetable. */
def({
  id: 'ferry_booth',
  w: 32,
  h: 40,
  foot: { w: 2, h: 1 },
  light: { x: 16, y: 22, r: 28, color: '#ffe2a0' },
  draw: (ctx) => {
    shadow(ctx, 16, 38, 14, 2);
    rect(ctx, 2, 12, 28, 26, '#2a7a5a');
    for (let i = 0; i < 5; i++) hline(ctx, 1 + i, 7 + i, 30 - i * 2, i === 0 ? O : '#f4f1ea');
    rect(ctx, 0, 11, 32, 2, '#1c5a42');
    rect(ctx, 5, 15, 22, 9, '#3a6a8a');
    rect(ctx, 5, 21, 22, 3, '#2a2a2e');
    rect(ctx, 4, 24, 24, 2, '#a8703f');
    // the timetable
    rect(ctx, 6, 28, 20, 8, '#f4f1ea');
    for (const y of [30, 32, 34]) hline(ctx, 8, y, 16, '#5a5a62');
    strokeRect(ctx, 2, 12, 28, 26, O);
    // the name board on the roof
    rect(ctx, 5, 0, 22, 7, '#f4f1ea');
    strokeRect(ctx, 5, 0, 22, 7, O);
    drawText(ctx, 'FERRY', 7, 1, '#1c5a42', '3x5');
  },
  night: (ctx) => {
    rect(ctx, 5, 15, 22, 6, '#ffd88a');
    rect(ctx, 6, 1, 20, 5, '#fff4d8');
    drawText(ctx, 'FERRY', 7, 1, '#1c5a42', '3x5');
  },
});

/** The white garden gate in the resort's hedge, with its little brass plate. */
def({
  id: 'resort_gate',
  w: 32,
  h: 30,
  foot: { w: 2, h: 1 },
  draw: (ctx) => {
    shadow(ctx, 16, 28, 15, 2);
    for (const x of [0, 28]) {
      rect(ctx, x, 4, 4, 24, '#f4f1ea');
      strokeRect(ctx, x, 4, 4, 24, O);
      rect(ctx, x - 1, 2, 6, 3, '#e8e2d4');
    }
    for (const y of [10, 22]) hline(ctx, 4, y, 24, '#e8e2d4');
    for (let x = 6; x < 28; x += 4) {
      vline(ctx, x, 8, 18, '#f4f1ea');
      px(ctx, x, 7, '#e8e2d4');
    }
    rect(ctx, 11, 14, 10, 5, '#c9a24a');
    strokeRect(ctx, 11, 14, 10, 5, '#8a6a2a');
    hline(ctx, 13, 16, 6, '#8a6a2a');
  },
});

/** The diner's tank of live seafood: fish, a lobster, crabs in the bubbles. */
def({
  id: 'fish_tank',
  w: 32,
  h: 30,
  foot: { w: 2, h: 1 },
  frames: 2,
  light: { x: 16, y: 12, r: 22, color: '#8ad8f0', always: true },
  draw: (ctx, f) => {
    shadow(ctx, 16, 28, 14, 2);
    box(ctx, 1, 20, 30, 3, 7, '#5a3a24', '#3a2416');
    rect(ctx, 2, 4, 28, 16, '#2a6a8a');
    rect(ctx, 2, 4, 28, 3, '#4a8aaa');
    for (let x = 3; x < 29; x += 2) px(ctx, x, 18 - ((x + f) % 3), '#c8b07a');
    // the catch
    ellipse(ctx, 9 + f, 10, 3, 1, '#c8d4dc');
    px(ctx, 6 + f, 10, '#1a1a1e');
    ellipse(ctx, 20 - f, 13, 3, 1, '#e8a04a');
    ellipse(ctx, 24, 17, 3, 2, '#c8302a');
    px(ctx, 21, 16, '#c8302a');
    px(ctx, 27, 16, '#c8302a');
    // bubbles
    for (const [x, y] of [[13, 15 - f * 3], [14, 11 - f * 2], [13, 7]] as [number, number][]) px(ctx, x, y, '#dff4fc');
    strokeRect(ctx, 1, 3, 30, 18, O);
    hline(ctx, 2, 4, 28, '#a8d8e8');
  },
});

/** A sandcastle someone built this morning. */
def({
  id: 'sandcastle',
  w: 20,
  h: 16,
  foot: { w: 1, h: 1 },
  draw: (ctx) => {
    ellipse(ctx, 10, 13, 9, 2, '#c8b07a');
    rect(ctx, 4, 7, 12, 6, '#d8c38e');
    for (const x of [4, 8, 12]) rect(ctx, x, 5, 3, 2, '#d8c38e');
    rect(ctx, 8, 2, 4, 5, '#e2d09e');
    px(ctx, 9, 9, '#8a7448');
    vline(ctx, 10, 0, 2, '#5a5a62');
    px(ctx, 11, 0, '#d8342a');
  },
});

/** A beach towel spread on the sand. */
def({
  id: 'beach_towel',
  w: 16,
  h: 28,
  foot: { w: 1, h: 2 },
  ground: true,
  draw: (ctx) => {
    rect(ctx, 2, 2, 12, 24, '#e86a8a');
    for (let y = 4; y < 26; y += 4) hline(ctx, 2, y, 12, '#f4f1ea');
    strokeRect(ctx, 2, 2, 12, 24, '#b84a6a');
  },
});

// ------------------------------------------------------------------ registry & build

export const PROPS: Record<string, PropDef> = Object.fromEntries(defs.map((d) => [d.id, d]));

export function propFrameName(id: string, frame: number, night = false): string {
  return `prop:${id}:${frame}${night ? ':n' : ''}`;
}

const urls = new Map<string, string>();

/** A prop drawn on its own, as a data URL (the UI shows boats and the like with it). */
export function propImageUrl(id: string, frame = 0): string {
  const key = `${id}:${frame}`;
  let u = urls.get(key);
  if (!u) {
    const d = PROPS[id];
    const { canvas, ctx } = makeCanvas(d.w, d.h);
    d.draw(ctx, frame);
    u = canvas.toDataURL();
    urls.set(key, u);
  }
  return u;
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

/** Greyhaven's city bus from the side, facing right: green below, cream round the windows. */
function drawBusSide(ctx: Ctx): void {
  shadow(ctx, 32, 27, 30, 3);
  rect(ctx, 2, 4, 60, 20, '#2a7a5a');
  rect(ctx, 2, 4, 60, 9, '#e8e2d4');
  for (let x = 6; x <= 42; x += 9) {
    rect(ctx, x, 6, 7, 6, '#6f93b3');
    px(ctx, x + 1, 7, P.glassShine);
  }
  // the door by the front, and the windscreen
  rect(ctx, 51, 6, 6, 16, '#4a6a8a');
  vline(ctx, 54, 6, 16, '#3a5a7a');
  rect(ctx, 58, 6, 3, 7, '#6f93b3');
  hline(ctx, 2, 18, 60, '#1e5a42');
  // the route number over the windscreen
  rect(ctx, 56, 4, 6, 2, '#1a1a1e');
  hline(ctx, 57, 4, 4, '#f2c94c');
  circle(ctx, 13, 24, 4, '#1a1a1a');
  circle(ctx, 47, 24, 4, '#1a1a1a');
  circle(ctx, 13, 24, 2, '#8a8a8a');
  circle(ctx, 47, 24, 2, '#8a8a8a');
  rect(ctx, 60, 15, 2, 3, '#f2e6a0');
  rect(ctx, 2, 15, 2, 3, '#c2283a');
  strokeRect(ctx, 2, 4, 60, 20, O);
}

/** The bus, side on (it only stops on the east–west streets). */
export function busImage(dir: 'left' | 'right'): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(64, 30);
  drawBusSide(ctx);
  if (dir === 'right') return canvas;
  const f = makeCanvas(64, 30);
  f.ctx.translate(64, 0);
  f.ctx.scale(-1, 1);
  f.ctx.drawImage(canvas, 0, 0);
  return f.canvas;
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
