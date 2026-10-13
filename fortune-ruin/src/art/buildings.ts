import { P } from './palette';
import { circle, dither, ellipse, hash2, hline, makeCanvas, px, rect, rgba, shade, speckle, strokeRect, vline, type Ctx } from './canvas';
import { drawText, measureText } from './font';
import type { BuildingDef, BuildingStyle } from '../world/maps/cityLayout';

interface Spec {
  wall: string;
  material: 'brick' | 'stucco' | 'concrete' | 'glass' | 'wood' | 'stone' | 'metal' | 'marble' | 'darkglass';
  roof: 'flat' | 'pitched';
  roofColor: string;
  /** facade height in tiles (towers add extraHeight) */
  facade: number;
  windows: 'grid' | 'tall' | 'band' | 'arched' | 'curtain' | 'small';
  ground: 'shop' | 'house' | 'grand' | 'office' | 'garage' | 'closed' | 'warehouse';
  awning?: [string, string];
  sign?: { bg: string; fg: string; neon?: string; border?: string };
  trim: string;
  lit: number;
  litColor: string;
}

const SPECS: Record<BuildingStyle, Spec> = {
  casino: { wall: '#e8dcc4', material: 'stone', roof: 'flat', roofColor: '#3a2a3a', facade: 7, windows: 'arched', ground: 'grand', trim: P.gold, sign: { bg: '#2a0c18', fg: P.goldLight, neon: P.neonPink, border: P.gold }, lit: 0.9, litColor: '#ffcf7a' },
  tower: { wall: '#5a7b99', material: 'glass', roof: 'flat', roofColor: '#3a3f4a', facade: 5, windows: 'curtain', ground: 'office', trim: '#c9d6e2', sign: { bg: '#1c2230', fg: '#dfe8f0', neon: P.neonCyan }, lit: 0.32, litColor: '#9fb8d8' },
  finance: { wall: '#2e3646', material: 'darkglass', roof: 'flat', roofColor: '#2a2e38', facade: 5, windows: 'curtain', ground: 'office', trim: '#a9b4c2', sign: { bg: '#141820', fg: '#e8edf2', border: '#a9b4c2' }, lit: 0.38, litColor: '#c9b98a' },
  office: { wall: P.concrete, material: 'concrete', roof: 'flat', roofColor: P.roof, facade: 4, windows: 'band', ground: 'office', trim: '#c4c7cc', sign: { bg: '#24456e', fg: '#ffffff' }, lit: 0.35, litColor: '#fff2cf' },
  shop: { wall: '#ece6da', material: 'stucco', roof: 'flat', roofColor: P.roof, facade: 4, windows: 'grid', ground: 'shop', trim: '#b9b0a2', awning: ['#2f8a4f', '#f4f1ea'], sign: { bg: '#2f8a4f', fg: '#ffffff', neon: P.neonGreen }, lit: 0.5, litColor: P.windowLit },
  cafe: { wall: P.brick, material: 'brick', roof: 'flat', roofColor: P.roofDark, facade: 4, windows: 'grid', ground: 'shop', trim: '#e9dcc4', awning: ['#2f5e45', '#efe4cf'], sign: { bg: '#2a1c14', fg: '#f2d9a8', border: '#c9965f' }, lit: 0.5, litColor: P.windowLitWarm },
  restaurant: { wall: '#e3cfa8', material: 'stucco', roof: 'flat', roofColor: P.roofRedDark, facade: 4, windows: 'arched', ground: 'shop', trim: '#8a5a36', awning: ['#a3242f', '#f4f1ea'], sign: { bg: '#5a1a1a', fg: '#ffe6b8', border: P.gold }, lit: 0.6, litColor: P.windowLitWarm },
  boutique: { wall: '#2a2730', material: 'stone', roof: 'flat', roofColor: '#3a3640', facade: 4, windows: 'tall', ground: 'shop', trim: P.gold, awning: ['#1c1a20', '#e0b13e'], sign: { bg: '#141218', fg: P.goldLight }, lit: 0.55, litColor: '#ffe9b8' },
  bar: { wall: '#4a3226', material: 'wood', roof: 'flat', roofColor: P.roofDark, facade: 4, windows: 'small', ground: 'shop', trim: '#a8703f', sign: { bg: '#1c1410', fg: '#ffb84a', neon: '#ff7a3a', border: '#a8703f' }, lit: 0.7, litColor: '#ff9f4a' },
  bank: { wall: '#d9d2c2', material: 'stone', roof: 'flat', roofColor: '#4a4f5c', facade: 5, windows: 'tall', ground: 'grand', trim: '#f0eadb', sign: { bg: '#d9d2c2', fg: '#3a3428', border: '#8a8170' }, lit: 0.25, litColor: P.windowLit },
  apartment: { wall: '#a35a44', material: 'brick', roof: 'flat', roofColor: P.roof, facade: 5, windows: 'grid', ground: 'house', trim: '#efe6d6', sign: { bg: '#2a3a2a', fg: '#e8e2d0' }, lit: 0.55, litColor: P.windowLit },
  shared: { wall: '#7a8288', material: 'wood', roof: 'flat', roofColor: '#4a4a50', facade: 4, windows: 'small', ground: 'house', trim: '#5a5f64', sign: { bg: '#3a3a40', fg: '#c8c8c8' }, lit: 0.6, litColor: '#ffd98a' },
  house: { wall: '#c9b48e', material: 'wood', roof: 'pitched', roofColor: P.roofRed, facade: 3, windows: 'small', ground: 'house', trim: '#efe6d6', lit: 0.6, litColor: P.windowLit },
  mansion: { wall: '#d6cbb5', material: 'stone', roof: 'pitched', roofColor: '#4a5266', facade: 5, windows: 'tall', ground: 'grand', trim: '#f4efe4', sign: { bg: '#d6cbb5', fg: '#5a5040' }, lit: 0.55, litColor: '#ffe2a8' },
  club: { wall: '#4a2a26', material: 'brick', roof: 'pitched', roofColor: '#2e3a34', facade: 5, windows: 'arched', ground: 'grand', trim: '#c9a25a', awning: ['#1f4a36', '#c9a25a'], sign: { bg: '#1c2a22', fg: P.goldLight, border: '#c9a25a' }, lit: 0.6, litColor: '#ffd28a' },
  finedining: { wall: '#ece4d2', material: 'stone', roof: 'flat', roofColor: '#3a3f4a', facade: 4, windows: 'arched', ground: 'shop', trim: '#1c2a44', awning: ['#1c2a44', '#1c2a44'], sign: { bg: '#1c2a44', fg: '#f4e9cf' }, lit: 0.7, litColor: '#ffd8a0' },
  luxury: { wall: '#efece6', material: 'marble', roof: 'flat', roofColor: '#4a4f5c', facade: 4, windows: 'tall', ground: 'shop', trim: '#141218', awning: ['#141218', '#141218'], sign: { bg: '#141218', fg: P.goldLight }, lit: 0.6, litColor: '#fff0cf' },
  motors: { wall: '#c4c9d0', material: 'metal', roof: 'flat', roofColor: '#4a4f5c', facade: 4, windows: 'band', ground: 'garage', trim: '#2a62a8', sign: { bg: '#2a62a8', fg: '#ffffff', neon: '#4aa8ff' }, lit: 0.5, litColor: '#e8f2ff' },
  hotel: { wall: '#d9cbb0', material: 'stone', roof: 'flat', roofColor: '#4a4f5c', facade: 6, windows: 'grid', ground: 'grand', trim: P.gold, sign: { bg: '#3a1424', fg: P.goldLight, neon: P.neonPurple }, lit: 0.6, litColor: P.windowLit },
  warehouse: { wall: '#6e7a82', material: 'metal', roof: 'flat', roofColor: '#555d64', facade: 4, windows: 'small', ground: 'warehouse', trim: '#4a545c', sign: { bg: '#e0b13e', fg: '#2a2a2a' }, lit: 0.1, litColor: '#ffe2a0' },
  lofts: { wall: '#7a4a3a', material: 'brick', roof: 'flat', roofColor: P.roofDark, facade: 5, windows: 'tall', ground: 'office', trim: '#2a2a2e', sign: { bg: '#2a2a2e', fg: '#e8e2d0' }, lit: 0.55, litColor: P.windowLit },
  river_tower: { wall: '#dfe6ec', material: 'glass', roof: 'flat', roofColor: '#4a5260', facade: 5, windows: 'curtain', ground: 'office', trim: '#7a9ab4', sign: { bg: '#2a4a6a', fg: '#ffffff' }, lit: 0.36, litColor: '#c8b88e' },
  pharmacy: { wall: '#e6ece6', material: 'stucco', roof: 'flat', roofColor: P.roof, facade: 4, windows: 'grid', ground: 'closed', trim: '#4a8a5a', sign: { bg: '#2f7a4a', fg: '#ffffff' }, lit: 0.2, litColor: P.windowLit },
  bakery: { wall: '#e8cfa0', material: 'stucco', roof: 'flat', roofColor: P.roofRedDark, facade: 4, windows: 'grid', ground: 'closed', trim: '#8a5a36', awning: ['#8a5a36', '#e8cfa0'], sign: { bg: '#5a3a24', fg: '#f4e2c0' }, lit: 0.05, litColor: P.windowLit },
};

// ------------------------------------------------------------------ materials

function material(ctx: Ctx, s: Spec, x: number, y: number, w: number, h: number, seed: number): void {
  rect(ctx, x, y, w, h, s.wall);
  const dk = shade(s.wall, -0.12);
  const lt = shade(s.wall, 0.08);
  switch (s.material) {
    case 'brick':
      for (let j = 0; j < h; j += 4) {
        hline(ctx, x, y + j, w, shade(s.wall, -0.3));
        const off = (j / 4) % 2 === 0 ? 0 : 4;
        for (let i = off; i < w; i += 8) vline(ctx, x + i, y + j, 4, shade(s.wall, -0.3));
      }
      speckle(ctx, x, y, w, h, lt, 0.06, seed);
      break;
    case 'stucco':
      speckle(ctx, x, y, w, h, dk, 0.06, seed);
      speckle(ctx, x, y, w, h, lt, 0.04, seed + 1);
      break;
    case 'concrete':
      for (let i = 0; i < w; i += 32) vline(ctx, x + i, y, h, dk);
      speckle(ctx, x, y, w, h, dk, 0.05, seed);
      break;
    case 'stone':
      for (let j = 0; j < h; j += 8) {
        hline(ctx, x, y + j, w, dk);
        const off = (j / 8) % 2 === 0 ? 0 : 8;
        for (let i = off; i < w; i += 16) vline(ctx, x + i, y + j, 8, dk);
      }
      speckle(ctx, x, y, w, h, lt, 0.05, seed);
      break;
    case 'wood':
      for (let j = 0; j < h; j += 3) hline(ctx, x, y + j, w, dk);
      speckle(ctx, x, y, w, h, lt, 0.05, seed);
      break;
    case 'metal':
      for (let i = 0; i < w; i += 3) vline(ctx, x + i, y, h, dk);
      speckle(ctx, x, y, w, h, lt, 0.04, seed);
      break;
    case 'marble':
      speckle(ctx, x, y, w, h, shade(s.wall, -0.06), 0.12, seed);
      for (let i = 0; i < w; i += 24) vline(ctx, x + i, y, h, shade(s.wall, -0.1));
      break;
    case 'glass':
    case 'darkglass':
      break;
  }
}

function windowPane(ctx: Ctx, night: Ctx, x: number, y: number, w: number, h: number, s: Spec, seed: number, frame = s.trim): void {
  rect(ctx, x - 1, y - 1, w + 2, h + 2, frame);
  const glass = s.material === 'darkglass' ? '#1e2836' : P.glass;
  rect(ctx, x, y, w, h, glass);
  rect(ctx, x, y + Math.floor(h / 2), w, Math.ceil(h / 2), shade(glass, -0.15));
  // reflection
  for (let i = 0; i < Math.min(w, h); i++) if (i < w - 1) px(ctx, x + 1 + i, y + h - 2 - i, shade(glass, 0.35));
  vline(ctx, x + Math.floor(w / 2), y, h, frame);
  hline(ctx, x - 1, y + h + 1, w + 2, shade(frame, -0.3));
  if (hash2(x, y, seed) < s.lit) {
    rect(night, x, y, w, h, s.litColor);
    rect(night, x, y + h - 2, w, 2, shade(s.litColor, -0.25));
    vline(night, x + Math.floor(w / 2), y, h, shade(s.litColor, -0.4));
    if (hash2(y, x, seed) < 0.3) rect(night, x + 1, y + 2, 2, 3, shade(s.litColor, -0.5));
  }
}

// ------------------------------------------------------------------ roofs

const ROOF_TONES = ['#4b505d', '#565b66', '#3f4652', '#5a5550', '#4a5248', '#45404c', '#5d6470'];

function flatRoof(ctx: Ctx, s: Spec, x: number, y: number, w: number, h: number, seed: number, style: BuildingStyle): void {
  const base = style === 'casino' ? s.roofColor : ROOF_TONES[Math.floor(hash2(seed, 3, 9) * ROOF_TONES.length)];
  rect(ctx, x, y, w, h, base);
  // membrane panels with seams and a little gravel
  const seam = shade(base, -0.14);
  for (let i = 16; i < w; i += 24) vline(ctx, x + i, y + 4, h - 6, seam);
  for (let j = 18; j < h; j += 20) hline(ctx, x + 4, y + j, w - 8, seam);
  speckle(ctx, x, y, w, h, shade(base, 0.12), 0.025, seed + 3);
  speckle(ctx, x, y, w, h, shade(base, -0.2), 0.02, seed + 4);
  // parapet: lit north/west edges, shaded south/east
  rect(ctx, x, y, w, 4, shade(base, 0.32));
  hline(ctx, x, y + 4, w, shade(base, -0.3));
  rect(ctx, x, y, 3, h, shade(base, 0.22));
  rect(ctx, x + w - 3, y, 3, h, shade(base, -0.12));
  rect(ctx, x, y + h - 2, w, 2, shade(base, -0.25));
  if (h < 18) return;
  const area = (w - 12) * (h - 14);
  const items = Math.max(1, Math.min(7, Math.floor(area / 1500)));
  const placed: [number, number, number, number][] = [];
  for (let i = 0; i < items * 3 && placed.length < items; i++) {
    const kind = Math.floor(hash2(i, seed, 21) * 7);
    const iw = [14, 18, 16, 14, 22, 20, 14][kind];
    const ih = [10, 10, 6, 13, 14, 12, 12][kind];
    const ix = x + 6 + Math.floor(hash2(i, seed, 1) * Math.max(1, w - iw - 12));
    const iy = y + 8 + Math.floor(hash2(seed, i, 2) * Math.max(1, h - ih - 14));
    if (placed.some(([a, b, c, d]) => ix < a + c + 3 && a < ix + iw + 3 && iy < b + d + 3 && b < iy + ih + 3)) continue;
    placed.push([ix, iy, iw, ih]);
    // drop shadow
    rect(ctx, ix + 2, iy + ih, iw, 2, rgba('#000000', 0.25));
    switch (kind) {
      case 0: // AC unit
        rect(ctx, ix, iy, iw, ih, '#a3a9b1');
        rect(ctx, ix, iy + ih - 3, iw, 3, '#7a8088');
        circle(ctx, ix + 7, iy + 4, 3, '#5a6068');
        px(ctx, ix + 7, iy + 4, '#3a3f46');
        hline(ctx, ix + 11, iy + 2, 2, '#5a6068');
        hline(ctx, ix + 11, iy + 4, 2, '#5a6068');
        strokeRect(ctx, ix, iy, iw, ih, P.outline);
        break;
      case 1: // skylight
        rect(ctx, ix, iy, iw, ih, '#b9d0e2');
        dither(ctx, ix, iy, iw, ih, P.glass);
        hline(ctx, ix + 1, iy + 1, iw - 2, P.glassShine);
        strokeRect(ctx, ix, iy, iw, ih, '#4a5058');
        vline(ctx, ix + Math.floor(iw / 2), iy, ih, '#4a5058');
        break;
      case 2: // vents
        for (let k = 0; k < 3; k++) {
          rect(ctx, ix + k * 6, iy, 4, 4, '#8a9098');
          rect(ctx, ix + k * 6, iy + 4, 4, 2, '#5a6068');
          px(ctx, ix + k * 6 + 1, iy + 1, '#3a3f46');
        }
        break;
      case 3: // water tank
        ellipse(ctx, ix + 7, iy + 7, 7, 6, '#7a5a3a');
        ellipse(ctx, ix + 7, iy + 6, 6, 4, '#a07c55');
        hline(ctx, ix + 2, iy + 9, 11, '#5e4630');
        vline(ctx, ix + 2, iy + 10, 3, '#3a2a1a');
        vline(ctx, ix + 12, iy + 10, 3, '#3a2a1a');
        break;
      case 4: // solar panels
        for (let r = 0; r < 2; r++)
          for (let c2 = 0; c2 < 3; c2++) {
            rect(ctx, ix + c2 * 7, iy + r * 7, 6, 6, '#2a4a7a');
            hline(ctx, ix + c2 * 7, iy + r * 7 + 2, 6, '#3a5e94');
            px(ctx, ix + c2 * 7 + 1, iy + r * 7 + 1, '#7aa4d8');
          }
        break;
      case 5: // planters (rooftop garden)
        rect(ctx, ix, iy, iw, ih, '#6a4a32');
        rect(ctx, ix + 1, iy + 1, iw - 2, ih - 2, '#3f7a38');
        for (let k = 0; k < 6; k++) px(ctx, ix + 2 + ((k * 7) % (iw - 4)), iy + 2 + ((k * 3) % (ih - 4)), ['#e04a5a', '#f2c94c', '#5fa24c'][k % 3]);
        speckle(ctx, ix + 1, iy + 1, iw - 2, ih - 2, '#5fa24c', 0.25, seed + i);
        break;
      case 6: // stair hut
        rect(ctx, ix, iy, iw, ih, shade(base, 0.2));
        rect(ctx, ix, iy, iw, 3, shade(base, 0.35));
        rect(ctx, ix + 4, iy + 5, 6, 7, '#5a4030');
        strokeRect(ctx, ix, iy, iw, ih, P.outline);
        break;
    }
  }
  if (style === 'tower') {
    const cx = x + Math.floor(w / 2);
    const cy = y + Math.floor(h / 2) + 2;
    const r = Math.min(14, Math.floor(Math.min(w, h) / 3));
    circle(ctx, cx, cy, r, '#3a3f4a');
    circle(ctx, cx, cy, r - 2, '#4e5462');
    drawText(ctx, 'H', cx - 2, cy - 3, '#e2c661');
  }
}

function pitchedRoof(ctx: Ctx, s: Spec, x: number, y: number, w: number, h: number, seed: number): void {
  const c = s.roofColor;
  rect(ctx, x, y, w, h, c);
  for (let j = 0; j < h; j += 4) {
    const t = j / h;
    const row = shade(c, 0.12 - t * 0.3);
    rect(ctx, x, y + j, w, 4, row);
    hline(ctx, x, y + j + 3, w, shade(row, -0.25));
    for (let i = (j / 4) % 2 ? 0 : 4; i < w; i += 8) px(ctx, x + i, y + j + 2, shade(row, -0.2));
  }
  // ridge
  rect(ctx, x, y, w, 2, shade(c, 0.35));
  // chimneys
  const n = Math.max(1, Math.floor(w / 80));
  for (let i = 0; i < n; i++) {
    const cx = x + 10 + Math.floor(hash2(i, seed, 7) * Math.max(1, w - 30));
    rect(ctx, cx, y + 2, 8, 10, P.brick);
    rect(ctx, cx - 1, y + 1, 10, 3, P.brickDark);
    strokeRect(ctx, cx - 1, y + 1, 10, 11, P.outline);
  }
  // dormer windows
  const d = Math.floor(w / 48);
  for (let i = 0; i < d; i++) {
    const dx = x + 16 + i * Math.floor((w - 32) / Math.max(1, d - 1 || 1));
    const dy = y + h - 12;
    rect(ctx, dx - 1, dy - 3, 12, 3, shade(c, -0.3));
    rect(ctx, dx, dy, 10, 9, s.wall);
    rect(ctx, dx + 2, dy + 2, 6, 6, P.glass);
  }
}

// ------------------------------------------------------------------ signage

function sign(ctx: Ctx, night: Ctx, s: Spec, text: string, cx: number, y: number, maxW: number): void {
  if (!s.sign || !text) return;
  let scale = 1;
  let tw = measureText(text, '5x7', 1);
  if (tw + 10 > maxW) {
    // fall back to the small font for long names
    tw = measureText(text, '3x5', 1);
    const w = tw + 8;
    const x = Math.round(cx - w / 2);
    rect(ctx, x, y, w, 9, s.sign.bg);
    if (s.sign.border) strokeRect(ctx, x, y, w, 9, s.sign.border);
    drawText(ctx, text, x + 4, y + 2, s.sign.fg, '3x5');
    if (s.sign.neon) drawText(night, text, x + 4, y + 2, s.sign.neon, '3x5');
    else drawText(night, text, x + 4, y + 2, shade(s.sign.fg, 0.2), '3x5');
    return;
  }
  if (tw * 2 + 14 <= maxW && text.length <= 8) scale = 2;
  tw = measureText(text, '5x7', scale);
  const h = 7 * scale + 6;
  const w = tw + 10;
  const x = Math.round(cx - w / 2);
  rect(ctx, x, y, w, h, s.sign.bg);
  if (s.sign.border) strokeRect(ctx, x, y, w, h, s.sign.border);
  hline(ctx, x + 1, y + h, w - 2, rgba('#000000', 0.35));
  drawText(ctx, text, x + 5, y + 3, s.sign.fg, '5x7', scale);
  const glow = s.sign.neon ?? shade(s.sign.fg, 0.15);
  // neon glow in the night layer
  night.save();
  night.shadowColor = glow;
  night.shadowBlur = 6;
  drawText(night, text, x + 5, y + 3, glow, '5x7', scale);
  night.restore();
  drawText(night, text, x + 5, y + 3, shade(glow, 0.5), '5x7', scale);
}

function awning(ctx: Ctx, colors: [string, string], x: number, y: number, w: number): void {
  for (let i = 0; i < w; i += 6) rect(ctx, x + i, y, Math.min(6, w - i), 7, (i / 6) % 2 === 0 ? colors[0] : colors[1]);
  hline(ctx, x, y, w, shade(colors[0], 0.25));
  for (let i = 0; i < w; i += 6) {
    rect(ctx, x + i + 1, y + 7, 4, 1, (i / 6) % 2 === 0 ? colors[0] : colors[1]);
  }
  hline(ctx, x, y + 8, w, rgba('#000000', 0.25));
}

// ------------------------------------------------------------------ main

export interface BuildingArt {
  day: HTMLCanvasElement;
  night: HTMLCanvasElement;
  /** pixel offset of the image's top-left relative to the footprint's top-left */
  offsetY: number;
}

export function drawBuilding(b: BuildingDef): BuildingArt {
  const s = SPECS[b.style];
  const W = b.w * 16;
  const extra = (b.extraHeight ?? 0) * 16;
  const H = b.h * 16 + extra;
  const { canvas, ctx } = makeCanvas(W, H);
  const n = makeCanvas(W, H);
  const night = n.ctx;
  const seed = b.x * 31 + b.y * 17;
  const totalTiles = b.h + (b.extraHeight ?? 0);
  const ratio = b.style === 'tower' || b.style === 'river_tower' || b.style === 'finance' ? 0.68 : b.style === 'casino' ? 0.56 : b.style === 'hotel' || b.style === 'lofts' ? 0.6 : 0.52;
  const facadeTiles = Math.max(s.facade, Math.round(totalTiles * ratio));
  const facadeH = Math.min(H - 16, facadeTiles * 16);
  const roofH = H - facadeH;
  const fy = roofH; // facade top

  // roof
  if (s.roof === 'pitched') pitchedRoof(ctx, s, 0, 0, W, roofH, seed);
  else flatRoof(ctx, s, 0, 0, W, roofH, seed, b.style);

  // facade body
  material(ctx, s, 0, fy, W, facadeH, seed);
  if (s.material === 'glass' || s.material === 'darkglass') {
    const g = s.material === 'darkglass' ? '#253041' : s.wall;
    rect(ctx, 0, fy, W, facadeH, g);
  }
  // cornice under the roof
  rect(ctx, 0, fy, W, 3, s.trim);
  hline(ctx, 0, fy + 3, W, shade(s.trim, -0.35));

  const groundH = 32;
  const upperTop = fy + 6;
  const upperBottom = fy + facadeH - groundH - 4;

  // upper floor windows
  if (b.style === 'casino') {
    casinoFacade(ctx, night, W, fy, upperBottom);
  } else if (upperBottom - upperTop >= 14) {
    const floorH = s.windows === 'curtain' ? 12 : 24;
    if (s.windows === 'curtain') {
      for (let yy = upperTop; yy + 9 <= upperBottom; yy += floorH) {
        for (let xx = 4; xx + 8 <= W - 4; xx += 10) {
          const wx = xx;
          const lit = hash2(wx, yy, seed) < s.lit;
          rect(ctx, wx, yy, 8, 9, s.material === 'darkglass' ? '#2c3a50' : shade(P.glass, 0.1));
          px(ctx, wx + 1, yy + 1, P.glassShine);
          hline(ctx, wx, yy + 9, 8, s.trim);
          if (lit) {
            rect(night, wx + 1, yy + 1, 6, 7, s.litColor);
            hline(night, wx + 1, yy + 7, 6, shade(s.litColor, -0.35));
          }
        }
        hline(ctx, 0, yy + 10, W, s.trim);
      }
    } else if (s.windows === 'band') {
      for (let yy = upperTop + 2; yy + 10 <= upperBottom; yy += floorH) {
        rect(ctx, 3, yy, W - 6, 10, s.trim);
        for (let xx = 4; xx + 10 <= W - 4; xx += 12) windowPane(ctx, night, xx, yy + 1, 10, 8, s, seed, s.trim);
      }
    } else {
      const ww = s.windows === 'tall' ? 8 : s.windows === 'small' ? 7 : 10;
      const wh = s.windows === 'tall' ? 16 : s.windows === 'small' ? 9 : 12;
      const gap = s.windows === 'tall' ? 14 : 16;
      const cols = Math.max(1, Math.floor((W - 8) / gap));
      const startX = Math.round((W - cols * gap) / 2 + (gap - ww) / 2);
      for (let yy = upperTop + 3; yy + wh <= upperBottom; yy += floorH) {
        for (let c = 0; c < cols; c++) {
          const xx = startX + c * gap;
          if (s.windows === 'arched') {
            rect(ctx, xx, yy - 2, ww, 2, s.trim);
            px(ctx, xx, yy - 2, s.wall);
            px(ctx, xx + ww - 1, yy - 2, s.wall);
          }
          windowPane(ctx, night, xx, yy, ww, wh, s, seed);
          if (b.style === 'apartment' || b.style === 'river_tower' || b.style === 'lofts') {
            // balconies / flower boxes
            rect(ctx, xx - 2, yy + wh + 1, ww + 4, 2, b.style === 'apartment' ? '#3f7a38' : '#5a606e');
            if (b.style === 'apartment' && hash2(xx, yy, 5) < 0.5) {
              px(ctx, xx, yy + wh, '#e04a5a');
              px(ctx, xx + 4, yy + wh, '#f2c94c');
            }
          }
        }
      }
    }
  }

  // ground floor
  const gy = fy + facadeH - groundH;
  const doorX = b.door ? (b.door.x - b.x) * 16 : Math.floor(W / 2) - 8;
  const doorW = (b.door?.w ?? 1) * 16;
  rect(ctx, 0, gy - 2, W, 2, shade(s.trim, -0.2));
  switch (s.ground) {
    case 'shop':
    case 'closed': {
      // storefront glass either side of the door
      const paneY = gy + 6;
      for (let xx = 4; xx < W - 4; xx += 26) {
        if (xx + 22 > doorX - 2 && xx < doorX + doorW + 2) continue;
        const pw = Math.min(22, W - 4 - xx);
        if (pw < 8) continue;
        rect(ctx, xx - 1, paneY - 1, pw + 2, 20, s.trim);
        rect(ctx, xx, paneY, pw, 18, s.ground === 'closed' ? '#3a3f46' : P.glassDark);
        dither(ctx, xx, paneY, pw, 18, s.ground === 'closed' ? '#30353c' : P.glass, 1);
        hline(ctx, xx, paneY, pw, P.glassShine);
        if (s.ground === 'closed') {
          // shutters / lease sign
          for (let k = 2; k < 18; k += 3) hline(ctx, xx, paneY + k, pw, '#6a7078');
        } else {
          rect(night, xx, paneY, pw, 18, rgba(s.litColor, 0.6));
          // shop interior hints
          rect(ctx, xx + 2, paneY + 10, pw - 4, 2, shade(s.trim, -0.2));
          for (let k = 0; k < pw - 4; k += 4) px(ctx, xx + 3 + k, paneY + 9, ['#e04a5a', '#f2c94c', '#59a4ff', '#f4f1ea'][(k / 4) % 4]);
        }
      }
      if (b.style === 'bakery') {
        rect(ctx, doorX + doorW + 6, gy + 10, 22, 9, '#f4f1ea');
        drawText(ctx, 'LEASE', doorX + doorW + 8, gy + 12, '#a3242f', '3x5');
      }
      break;
    }
    case 'grand': {
      // columns
      const n = Math.max(2, Math.floor(W / 28));
      for (let i = 0; i <= n; i++) {
        const cx = Math.round((i * (W - 8)) / n) + 2;
        if (cx + 6 > doorX - 1 && cx < doorX + doorW + 1) continue;
        rect(ctx, cx, gy - 4, 6, groundH + 4, shade(s.wall, 0.1));
        vline(ctx, cx + 5, gy - 4, groundH + 4, shade(s.wall, -0.2));
        rect(ctx, cx - 1, gy - 5, 8, 2, s.trim);
        rect(ctx, cx - 1, gy + groundH - 2, 8, 2, shade(s.wall, -0.15));
      }
      // tall ground windows between columns
      for (let xx = 10; xx < W - 14; xx += 28) {
        if (xx + 12 > doorX - 2 && xx < doorX + doorW + 2) continue;
        windowPane(ctx, night, xx, gy + 4, 10, 20, s, seed + 9);
      }
      break;
    }
    case 'office': {
      for (let xx = 4; xx < W - 8; xx += 14) {
        if (xx + 12 > doorX - 2 && xx < doorX + doorW + 2) continue;
        windowPane(ctx, night, xx, gy + 6, 10, 18, s, seed + 4);
      }
      break;
    }
    case 'house': {
      for (let xx = 6; xx < W - 10; xx += 20) {
        if (xx + 12 > doorX - 2 && xx < doorX + doorW + 2) continue;
        windowPane(ctx, night, xx, gy + 8, 10, 12, s, seed + 4);
        rect(ctx, xx - 2, gy + 21, 14, 2, s.trim);
      }
      break;
    }
    case 'garage': {
      // showroom glass + service bay door
      rect(ctx, 4, gy + 4, Math.max(0, doorX - 8), 24, P.glassDark);
      dither(ctx, 4, gy + 4, Math.max(0, doorX - 8), 24, P.glass);
      rect(night, 4, gy + 4, Math.max(0, doorX - 8), 24, rgba('#bcd2ee', 0.55));
      // a car on display
      const cx = 8;
      rect(ctx, cx, gy + 18, 26, 7, '#c2283a');
      rect(ctx, cx + 5, gy + 13, 14, 6, '#c2283a');
      rect(ctx, cx + 7, gy + 14, 10, 4, P.glassLight);
      circle(ctx, cx + 6, gy + 25, 2, '#1a1a1a');
      circle(ctx, cx + 20, gy + 25, 2, '#1a1a1a');
      const bayX = doorX + doorW + 6;
      const bayW = W - bayX - 4;
      if (bayW > 20) {
        rect(ctx, bayX, gy + 2, bayW, 28, '#5a606a');
        for (let k = 0; k < 28; k += 3) hline(ctx, bayX, gy + 2 + k, bayW, '#4a4f58');
        strokeRect(ctx, bayX - 1, gy + 1, bayW + 2, 30, '#2a2e34');
        rect(ctx, bayX + 4, gy + 22, bayW - 8, 6, '#2a2e34');
      }
      break;
    }
    case 'warehouse': {
      const dw = Math.floor(W * 0.45);
      const dx = Math.floor((W - dw) / 2);
      rect(ctx, dx, gy + 2, dw, 30, '#4a545c');
      for (let k = 0; k < dw; k += 4) vline(ctx, dx + k, gy + 2, 30, '#3e474e');
      strokeRect(ctx, dx - 1, gy + 1, dw + 2, 31, '#2a3036');
      break;
    }
  }

  // door
  if (b.door || s.ground !== 'warehouse') {
    const dy = gy + 6;
    const dh = groundH - 6;
    if (b.style === 'casino') {
      // revolving gold doors
      rect(ctx, doorX - 2, dy - 4, doorW + 4, dh + 4, P.gold);
      rect(ctx, doorX, dy - 2, doorW, dh + 2, '#3a2a14');
      for (let k = 0; k < doorW; k += 8) {
        rect(ctx, doorX + k + 1, dy, 6, dh, '#ffcf7a');
        dither(ctx, doorX + k + 1, dy, 6, dh, '#e0a84a');
        vline(ctx, doorX + k + 7, dy, dh, P.goldDark);
        rect(night, doorX + k + 1, dy, 6, dh, '#ffe2a0');
      }
    } else if (b.door) {
      const glassDoor = ['shop', 'cafe', 'office', 'finance', 'tower', 'boutique', 'luxury', 'motors', 'river_tower', 'lofts', 'bank', 'finedining'].includes(b.style);
      rect(ctx, doorX + 1, dy - 2, doorW - 2, dh + 2, shade(s.trim, -0.4));
      if (glassDoor) {
        rect(ctx, doorX + 3, dy, doorW - 6, dh, P.glassDark);
        dither(ctx, doorX + 3, dy, doorW - 6, dh, P.glass);
        if (doorW >= 32) vline(ctx, doorX + Math.floor(doorW / 2), dy, dh, shade(s.trim, -0.4));
        rect(night, doorX + 3, dy, doorW - 6, dh, rgba(s.litColor, 0.6));
      } else {
        rect(ctx, doorX + 3, dy, doorW - 6, dh, b.style === 'bar' ? '#3a2416' : P.woodDark);
        for (let k = 3; k < dh; k += 6) hline(ctx, doorX + 4, dy + k, doorW - 8, shade(P.woodDark, 0.12));
        px(ctx, doorX + doorW - 6, dy + Math.floor(dh / 2), P.gold);
      }
      // step
      rect(ctx, doorX, gy + groundH - 2, doorW, 2, shade(s.trim, -0.1));
    }
  }

  // awning
  if (s.awning) {
    const aw = Math.min(W - 6, Math.max(doorW + 24, W - 10));
    awning(ctx, s.awning, Math.round((W - aw) / 2), gy - 2, aw);
  }

  // sign (above the ground floor, or on the roof edge for tall buildings)
  const label = b.style === 'casino' || b.style === 'mansion' ? '' : (b.sign ?? '');
  if (b.style === 'mansion' && b.door) portico(ctx, s, doorX, doorW, gy, groundH);
  if (label) {
    const signY = b.style === 'casino' ? fy + 8 : Math.max(fy + 5, gy - (s.awning ? 18 : 14));
    sign(ctx, night, s, label, W / 2, signY, W - 6);
  }

  // style flourishes
  if (b.style === 'casino') casinoEntrance(ctx, night, W, gy);
  if (b.style === 'bar') {
    // anchor emblem
    const ax = W - 16;
    const ay = gy - 22;
    circle(ctx, ax, ay, 5, '#1c1410');
    vline(ctx, ax, ay - 3, 7, '#c9965f');
    hline(ctx, ax - 3, ay + 2, 7, '#c9965f');
    drawText(night, '*', ax - 2, ay - 3, '#ff9f4a');
  }
  if (b.style === 'pharmacy') {
    const cx = W - 14;
    const cy = gy - 16;
    rect(ctx, cx - 1, cy - 4, 3, 9, '#3fbf6a');
    rect(ctx, cx - 4, cy - 1, 9, 3, '#3fbf6a');
  }

  // outline the whole silhouette
  strokeRect(ctx, 0, 0, W, H, P.outline);
  hline(ctx, 0, fy, W, P.outline);
  return { day: canvas, night: n.canvas, offsetY: -extra };
}

function bulbs(ctx: Ctx, night: Ctx, x: number, y: number, w: number, h: number, step = 5): void {
  const put = (bx: number, by: number) => {
    px(ctx, bx, by, '#fff4d6');
    night.fillStyle = 'rgba(255,236,170,0.55)';
    night.fillRect(bx - 1, by - 1, 3, 3);
    px(night, bx, by, '#fffbe8');
  };
  for (let i = x; i <= x + w; i += step) {
    put(i, y);
    put(i, y + h);
  }
  for (let j = y + step; j < y + h; j += step) {
    put(x, j);
    put(x + w, j);
  }
}

function casinoFacade(ctx: Ctx, night: Ctx, W: number, fy: number, bottom: number): void {
  const top = fy + 4;
  const h = bottom - top;
  // gold horizontal bands
  hline(ctx, 0, top + 1, W, P.goldDark);
  // side towers with vertical neon tubes
  for (const tx of [0, W - 22]) {
    rect(ctx, tx, top, 22, h + 8, '#efe4cc');
    vline(ctx, tx + (tx === 0 ? 21 : 0), top, h + 8, shade('#efe4cc', -0.25));
    rect(ctx, tx + 4, top + 6, 3, h - 6, '#4a1626');
    rect(ctx, tx + 15, top + 6, 3, h - 6, '#4a1626');
    night.save();
    night.shadowBlur = 8;
    night.shadowColor = tx === 0 ? P.neonPink : P.neonCyan;
    rect(night, tx + 5, top + 6, 1, h - 6, tx === 0 ? P.neonPink : P.neonCyan);
    rect(night, tx + 16, top + 6, 1, h - 6, tx === 0 ? P.neonCyan : P.neonPink);
    night.restore();
    rect(ctx, tx + 2, top - 2, 18, 4, P.gold);
    hline(ctx, tx + 2, top + 1, 18, P.goldDark);
  }
  // central marquee panel
  const mx = 30;
  const mw = W - 60;
  const my = top + 6;
  const mh = Math.min(46, Math.floor(h * 0.48));
  rect(ctx, mx, my, mw, mh, '#2a0a16');
  rect(ctx, mx + 2, my + 2, mw - 4, mh - 4, '#3a0e1e');
  strokeRect(ctx, mx, my, mw, mh, P.gold);
  strokeRect(ctx, mx + 3, my + 3, mw - 6, mh - 6, P.goldDark);
  bulbs(ctx, night, mx + 1, my + 1, mw - 2, mh - 2, 5);
  const t1 = 'GREYHAVEN';
  const t1w = measureText(t1, '5x7', 2);
  const tx1 = Math.round(W / 2 - t1w / 2);
  drawText(ctx, t1, tx1 + 1, my + 9, '#1a0610', '5x7', 2);
  drawText(ctx, t1, tx1, my + 8, P.goldLight, '5x7', 2);
  night.save();
  night.shadowColor = P.neonYellow;
  night.shadowBlur = 10;
  drawText(night, t1, tx1, my + 8, '#ffe9a0', '5x7', 2);
  night.restore();
  const t2 = 'GRAND CASINO';
  const t2w = measureText(t2, '5x7', 1);
  const tx2 = Math.round(W / 2 - t2w / 2);
  drawText(ctx, t2, tx2, my + 27, '#ff8cc6', '5x7', 1);
  night.save();
  night.shadowColor = P.neonPink;
  night.shadowBlur = 8;
  drawText(night, t2, tx2, my + 27, P.neonPink, '5x7', 1);
  night.restore();
  // suits either side of the subtitle
  const suitY = my + 30;
  for (const [sx, c] of [[tx2 - 12, P.neonCyan], [tx2 + t2w + 6, P.neonCyan]] as [number, string][]) {
    circle(ctx, sx + 3, suitY, 3, '#c2283a');
    circle(night, sx + 3, suitY, 3, c);
  }
  // row of arched windows below the marquee
  const wy = my + mh + 6;
  if (bottom - wy >= 16) {
    for (let x = 32; x + 10 <= W - 32; x += 16) {
      rect(ctx, x - 1, wy - 3, 12, 3, P.gold);
      rect(ctx, x - 1, wy, 12, 15, P.goldDark);
      rect(ctx, x, wy, 10, 14, '#3a2a40');
      dither(ctx, x, wy, 10, 14, '#5a3a5a');
      rect(night, x, wy, 10, 14, '#ffcf7a');
      vline(night, x + 5, wy, 14, '#c8902a');
    }
  }
}

function casinoEntrance(ctx: Ctx, night: Ctx, W: number, gy: number): void {
  // entrance canopy with bulbs
  rect(ctx, 24, gy - 10, W - 48, 7, '#2a0a16');
  hline(ctx, 24, gy - 10, W - 48, P.gold);
  hline(ctx, 24, gy - 4, W - 48, P.goldDark);
  for (let x = 26; x < W - 24; x += 4) {
    px(ctx, x, gy - 7, '#fff4d6');
    night.fillStyle = 'rgba(255,236,170,0.6)';
    night.fillRect(x - 1, gy - 8, 3, 3);
  }
  night.save();
  night.shadowColor = P.neonCyan;
  night.shadowBlur = 6;
  hline(night, 24, gy - 3, W - 48, P.neonCyan);
  night.restore();
}

function portico(ctx: Ctx, s: Spec, doorX: number, doorW: number, gy: number, groundH: number): void {
  const px0 = doorX - 10;
  const pw = doorW + 20;
  // pediment
  for (let i = 0; i < 9; i++) hline(ctx, px0 + i * 2, gy - 12 + i, pw - i * 4, i === 0 ? shade(s.trim, -0.2) : s.trim);
  hline(ctx, px0 - 2, gy - 3, pw + 4, shade(s.trim, -0.35));
  // columns
  for (const cx of [px0, px0 + 5, px0 + pw - 9, px0 + pw - 4]) {
    rect(ctx, cx, gy - 2, 4, groundH, '#f4efe4');
    vline(ctx, cx + 3, gy - 2, groundH, '#c8bfae');
  }
  // steps
  rect(ctx, px0 - 2, gy + groundH - 3, pw + 4, 3, '#cfc6b4');
  hline(ctx, px0 - 2, gy + groundH - 3, pw + 4, '#e6dfd0');
}
