import type Phaser from 'phaser';
import { circle, ellipse, hash2, makeCanvas, mix, px, rect, rgba, ring, shade, strokeRect, type Ctx } from './canvas';
import { drawTextCentered } from './font';
import { CHIP_COLORS, CHIP_DENOMS, P } from './palette';
import type { Card } from '../casino/cards';
import { CARD_DENSITY, CH, CW, drawCardBack, drawCardFace } from './cardArt';
import { EURO_WHEEL, numberColor } from '../casino/RouletteEngine';
import { AtlasBuilder } from './atlas';
import { DEFAULT_GEOM, cellOf, columnRect, dozenRect, evenRect, EVEN_MONEY, gridRight, numberRect, type RouletteGeom } from '../casino/rouletteLayout';

export const TW = 480;
export const TH = 270;
/** A card's size on the table (stage pixels); its texture has CARD_DENSITY × as many texels. */
export const CARD_W = 22;
export const CARD_H = 30;
/** Scale that shows a card texture at its table size. */
export const CARD_SCALE = 1 / CARD_DENSITY;

export type FeltVariant = 'green' | 'blue' | 'red';

const FELTS: Record<FeltVariant, { felt: string; dark: string; light: string; ink: string }> = {
  green: { felt: '#1f6e46', dark: '#165236', light: '#2a8a59', ink: '#e8d38a' },
  blue: { felt: '#1d4f7c', dark: '#143a5c', light: '#2a6698', ink: '#e8d9a8' },
  red: { felt: '#6b1a2c', dark: '#4f1220', light: '#86243a', ink: '#f2d58c' },
};

// ------------------------------------------------------------------ cards
// Card faces and backs live in cardArt.ts (drawn at CARD_DENSITY × detail).

// ------------------------------------------------------------------ chips

/** One chip seen at a slight angle: 12×7 (top ellipse + edge). */
export function drawChipSlice(ctx: Ctx, denomG: number): void {
  const c = CHIP_COLORS[denomG] ?? CHIP_COLORS[1];
  ellipse(ctx, 6, 3.5, 5.5, 2.5, shade(c.base, -0.35));
  ellipse(ctx, 6, 2.5, 5.5, 2.5, c.base);
  // edge spots
  for (const x of [1, 4, 8, 11]) px(ctx, x, 3, c.edge);
  px(ctx, 6, 1, c.edge);
  px(ctx, 6, 4, c.edge);
  // inlay
  ellipse(ctx, 6, 2.5, 2.5, 1, shade(c.base, 0.25));
}

/** Larger top-down chip for the selector & dolly (16×16). */
export function drawChipTop(ctx: Ctx, denomG: number): void {
  const c = CHIP_COLORS[denomG] ?? CHIP_COLORS[1];
  circle(ctx, 8, 8, 7, shade(c.base, -0.3));
  circle(ctx, 8, 7.5, 7, c.base);
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    rect(ctx, Math.round(8 + Math.cos(t) * 6) - 1, Math.round(7.5 + Math.sin(t) * 6) - 1, 2, 2, c.edge);
  }
  circle(ctx, 8, 7.5, 4, shade(c.base, 0.2));
  const label = denomG >= 1000 ? `${denomG / 1000}K` : String(denomG);
  drawTextCentered(ctx, label, 8, 5, c.text, '3x5');
}

// ------------------------------------------------------------------ backdrop & felts

export function drawBackdrop(ctx: Ctx, variant: FeltVariant): void {
  const base = variant === 'red' ? '#1a0a14' : variant === 'blue' ? '#0c1020' : '#120a18';
  rect(ctx, 0, 0, TW, TH, base);
  // carpet pattern
  for (let y = 0; y < TH; y += 8) {
    for (let x = 0; x < TW; x += 8) {
      const v = hash2(x, y, 3);
      if (v < 0.5) rect(ctx, x + 3, y + 3, 2, 2, rgba('#5a1828', 0.35));
      else if (v < 0.6) rect(ctx, x + 2, y + 2, 1, 1, rgba('#e0b13e', 0.18));
    }
  }
  // bokeh lights from the casino floor
  const bokeh = ['#ff4fa3', '#e0b13e', '#46f0ff', '#ffd88a', '#b46bff'];
  for (let i = 0; i < 46; i++) {
    const x = hash2(i, 1, 11) * TW;
    const y = hash2(i, 2, 11) * 70;
    const r = 3 + hash2(i, 3, 11) * 9;
    const col = bokeh[Math.floor(hash2(i, 4, 11) * bokeh.length)];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, 0.35));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // vignette
  const v = ctx.createRadialGradient(TW / 2, TH / 2, 80, TW / 2, TH / 2, 300);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, TW, TH);
}

/** Half-moon table: straight dealer edge at `top`, curved player rail below. */
function halfMoon(ctx: Ctx, cx: number, top: number, rx: number, ry: number, variant: FeltVariant): void {
  const f = FELTS[variant];
  const rail = '#3a2016';
  const railHi = '#5e3524';
  // rail
  for (let y = 0; y <= ry + 10; y++) {
    const t = Math.min(1, y / (ry + 10));
    const half = Math.round((rx + 10) * Math.sqrt(Math.max(0, 1 - t * t)));
    rect(ctx, cx - half, top + y, half * 2, 1, rail);
  }
  for (let y = 0; y <= ry + 10; y++) {
    const t = Math.min(1, y / (ry + 10));
    const half = Math.round((rx + 10) * Math.sqrt(Math.max(0, 1 - t * t)));
    px(ctx, cx - half, top + y, railHi);
    px(ctx, cx + half - 1, top + y, railHi);
  }
  // felt with concentric shading
  for (let y = 0; y <= ry; y++) {
    const t = y / ry;
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
    for (let x = -half; x < half; x++) {
      const d = Math.sqrt((x / rx) ** 2 + t * t);
      let c = d < 0.45 ? f.light : d < 0.8 ? f.felt : f.dark;
      if (d >= 0.43 && d < 0.47 && (x + y) % 2 === 0) c = f.felt;
      if (d >= 0.78 && d < 0.82 && (x + y) % 2 === 0) c = f.dark;
      px(ctx, cx + x, top + y, c);
    }
  }
  // stitched inner rail line
  for (let a = 0; a <= 180; a += 1.2) {
    const t = (a * Math.PI) / 180;
    px(ctx, Math.round(cx + Math.cos(t) * (rx - 3)), Math.round(top + Math.sin(t) * (ry - 3)), rgba('#ffffff', 0.12));
  }
  // dealer edge (wood)
  rect(ctx, cx - rx - 10, top - 5, (rx + 10) * 2, 5, '#4a2a18');
  rect(ctx, cx - rx - 10, top - 5, (rx + 10) * 2, 1, '#7a4a2a');
  rect(ctx, cx - rx - 10, top, (rx + 10) * 2, 1, '#22120a');
}

function chipRack(ctx: Ctx, cx: number, y: number): void {
  rect(ctx, cx - 62, y, 124, 13, '#1c1016');
  strokeRect(ctx, cx - 62, y, 124, 13, '#6a4a2a');
  const denoms = [1000, 500, 100, 25, 5, 1, 1, 5, 25, 100, 500, 1000];
  denoms.forEach((d, i) => {
    const c = CHIP_COLORS[d];
    const x = cx - 59 + i * 10;
    rect(ctx, x, y + 2, 8, 9, shade(c.base, -0.2));
    for (let k = 0; k < 9; k += 2) rect(ctx, x, y + 2 + k, 8, 1, c.base);
    rect(ctx, x + 3, y + 2, 2, 9, rgba(c.edge, 0.5));
  });
}

function shoeBox(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x, y, 34, 20, '#1a1218');
  rect(ctx, x + 2, y + 2, 30, 14, '#2a1e26');
  rect(ctx, x + 4, y + 4, 16, 11, '#8c1d2c');
  rect(ctx, x + 5, y + 5, 14, 9, '#a5293a');
  rect(ctx, x + 22, y + 6, 8, 8, '#4a3a44');
  strokeRect(ctx, x, y, 34, 20, '#6a4a2a');
}

function discardTray(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x, y, 26, 18, rgba('#000000', 0.25));
  strokeRect(ctx, x, y, 26, 18, '#6a4a2a');
  rect(ctx, x + 3, y + 3, 20, 12, rgba('#ffffff', 0.05));
}

export const BJ = {
  cx: 240,
  top: 58,
  rx: 222,
  ry: 168,
  shoe: { x: 436, y: 66 },
  discard: { x: 44, y: 66 },
  dealerCards: { x: 240, y: 92 },
  rack: { y: 61 },
};

/** Betting circle centres for seats, seat 0 at first base (the dealer's left = screen right). */
export function bjSeat(i: number, n: number): { x: number; y: number } {
  const a = ((28 + (124 * i) / Math.max(1, n - 1)) * Math.PI) / 180;
  return { x: Math.round(BJ.cx + 172 * Math.cos(a)), y: Math.round(BJ.top + 112 * Math.sin(a)) };
}

export function drawBlackjackTable(ctx: Ctx, variant: FeltVariant, seats: number, payText: string, ruleText: string): void {
  const f = FELTS[variant];
  halfMoon(ctx, BJ.cx, BJ.top, BJ.rx, BJ.ry, variant);
  chipRack(ctx, BJ.cx, BJ.rack.y);
  shoeBox(ctx, BJ.shoe.x - 8, BJ.shoe.y - 6);
  discardTray(ctx, BJ.discard.x - 13, BJ.discard.y - 6);
  // insurance band
  for (let a = 22; a <= 158; a += 0.6) {
    const t = (a * Math.PI) / 180;
    px(ctx, Math.round(BJ.cx + Math.cos(t) * 128), Math.round(BJ.top + Math.sin(t) * 84), rgba(f.ink, 0.65));
    px(ctx, Math.round(BJ.cx + Math.cos(t) * 140), Math.round(BJ.top + Math.sin(t) * 96), rgba(f.ink, 0.65));
  }
  drawTextCentered(ctx, 'INSURANCE PAYS 2 TO 1', BJ.cx, BJ.top + 87, rgba(f.ink, 0.85), '3x5');
  drawTextCentered(ctx, payText, BJ.cx, BJ.top + 52, f.ink, '5x7', 1, rgba('#000000', 0.35));
  drawTextCentered(ctx, ruleText, BJ.cx, BJ.top + 64, rgba(f.ink, 0.85), '3x5');
  // betting circles
  for (let i = 0; i < seats; i++) {
    const s = bjSeat(i, seats);
    ring(ctx, s.x, s.y, 13, rgba('#f4f1ea', 0.75));
    ring(ctx, s.x, s.y, 12, rgba('#f4f1ea', 0.35));
  }
}

// ------------------------------------------------------------------ baccarat

export const BAC = {
  cx: 240,
  top: 58,
  rx: 222,
  ry: 168,
  shoe: { x: 436, y: 66 },
  discard: { x: 44, y: 66 },
  playerBox: { x: 150, y: 72, w: 80, h: 38 },
  bankerBox: { x: 250, y: 72, w: 80, h: 38 },
  zones: {
    playerPair: { x: 84, y: 130, w: 50, h: 28 },
    player: { x: 138, y: 130, w: 90, h: 28 },
    tie: { x: 232, y: 130, w: 16, h: 28 },
    banker: { x: 252, y: 130, w: 90, h: 28 },
    bankerPair: { x: 346, y: 130, w: 50, h: 28 },
  } as Record<'player' | 'banker' | 'tie' | 'playerPair' | 'bankerPair', { x: number; y: number; w: number; h: number }>,
};

export function drawBaccaratTable(ctx: Ctx, variant: FeltVariant, tieText: string): void {
  const f = FELTS[variant];
  halfMoon(ctx, BAC.cx, BAC.top, BAC.rx, BAC.ry, variant);
  shoeBox(ctx, BAC.shoe.x - 8, BAC.shoe.y - 6);
  discardTray(ctx, BAC.discard.x - 13, BAC.discard.y - 6);
  // card boxes
  for (const [b, label] of [
    [BAC.playerBox, 'PLAYER'],
    [BAC.bankerBox, 'BANKER'],
  ] as const) {
    strokeRect(ctx, b.x, b.y, b.w, b.h, rgba(f.ink, 0.6));
    drawTextCentered(ctx, label, b.x + b.w / 2, b.y + b.h + 3, rgba(f.ink, 0.8), '3x5');
  }
  // betting zones
  const z = BAC.zones;
  const zone = (r: { x: number; y: number; w: number; h: number }, fill: string, label: string, sub: string) => {
    rect(ctx, r.x, r.y, r.w, r.h, rgba(fill, 0.35));
    strokeRect(ctx, r.x, r.y, r.w, r.h, rgba(f.ink, 0.85));
    drawTextCentered(ctx, label, r.x + r.w / 2, r.y + 6, f.ink, r.w > 40 ? '5x7' : '3x5');
    if (sub) drawTextCentered(ctx, sub, r.x + r.w / 2, r.y + r.h - 8, rgba(f.ink, 0.75), '3x5');
  };
  zone(z.player, '#2a4f9a', 'PLAYER', '1 TO 1');
  zone(z.banker, '#9a2a3a', 'BANKER', '19 TO 20');
  zone(z.tie, '#2a8a4a', 'T', '');
  zone(z.playerPair, '#2a4f9a', 'P PAIR', '11:1');
  zone(z.bankerPair, '#9a2a3a', 'B PAIR', '11:1');
  drawTextCentered(ctx, tieText, BAC.cx, z.tie.y + z.tie.h + 6, rgba(f.ink, 0.8), '3x5');
  drawTextCentered(ctx, 'BANKER WINS PAY 0.95 - 5% COMMISSION', BAC.cx, BAC.top + 116, rgba(f.ink, 0.7), '3x5');
}

// ------------------------------------------------------------------ roulette

export const RL = {
  wheel: { x: 106, y: 152, r: 84 },
  geom: DEFAULT_GEOM,
};

export function drawRouletteTable(ctx: Ctx, variant: FeltVariant, g: RouletteGeom = DEFAULT_GEOM): void {
  const f = FELTS[variant];
  // rounded table
  rect(ctx, 8, 52, TW - 16, TH - 60, '#3a2016');
  rect(ctx, 12, 56, TW - 24, TH - 68, f.felt);
  for (let y = 56; y < TH - 12; y++) for (let x = 12; x < TW - 12; x++) if (hash2(x, y, 9) < 0.06) px(ctx, x, y, f.dark);
  rect(ctx, 8, 52, TW - 16, 1, '#5e3524');
  // wheel well
  circle(ctx, RL.wheel.x, RL.wheel.y, RL.wheel.r + 8, '#22120a');
  circle(ctx, RL.wheel.x, RL.wheel.y, RL.wheel.r + 5, '#4a2a18');
  // layout
  const line = rgba('#f4f1ea', 0.9);
  const cellFill = (n: number) => (numberColor(n) === 'red' ? '#b0202f' : numberColor(n) === 'black' ? '#1b1a22' : '#1f8a4c');
  // zero
  const z = numberRect(0, g);
  rect(ctx, z.x, z.y, z.w, z.h, cellFill(0));
  strokeRect(ctx, z.x, z.y, z.w + 1, z.h + 1, line);
  drawTextCentered(ctx, '0', z.x + z.w / 2, z.y + z.h / 2 - 3, '#ffffff');
  for (let n = 1; n <= 36; n++) {
    const r = numberRect(n, g);
    rect(ctx, r.x + 1, r.y + 1, r.w - 1, r.h - 1, cellFill(n));
    strokeRect(ctx, r.x, r.y, r.w + 1, r.h + 1, line);
    drawTextCentered(ctx, String(n), r.x + r.w / 2 + 1, r.y + r.h / 2 - 3, '#ffffff');
  }
  for (let i = 0; i < 3; i++) {
    const c = columnRect(i, g);
    strokeRect(ctx, c.x, c.y, c.w + 1, c.h + 1, line);
    drawTextCentered(ctx, '2:1', c.x + c.w / 2 + 1, c.y + c.h / 2 - 2, f.ink, '3x5');
    const d = dozenRect(i, g);
    strokeRect(ctx, d.x, d.y, d.w + 1, d.h + 1, line);
    drawTextCentered(ctx, ['1ST 12', '2ND 12', '3RD 12'][i], d.x + d.w / 2, d.y + d.h / 2 - 3, f.ink, '5x7');
  }
  for (const k of EVEN_MONEY) {
    const r = evenRect(k, g);
    strokeRect(ctx, r.x, r.y, r.w + 1, r.h + 1, line);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    if (k === 'red' || k === 'black') {
      const col = k === 'red' ? '#c8243a' : '#141418';
      for (let j = -5; j <= 5; j++) {
        const half = 8 - Math.abs(j) * 1.4;
        rect(ctx, cx - half, cy + j, half * 2, 1, col);
      }
    } else {
      drawTextCentered(ctx, { low: '1-18', even: 'EVEN', odd: 'ODD', high: '19-36' }[k as 'low'] ?? '', cx, cy - 3, f.ink, '5x7');
    }
  }
  // limits plaque area
  rect(ctx, gridRight(g) - 76, g.y0 - 16, 96, 11, rgba('#000000', 0.25));
  void cellOf;
}

/** High-resolution wheel (drawn at 2× and shown at half scale with smoothing). */
export function drawWheel(ctx: Ctx, size: number): void {
  const c = size / 2;
  const R = c - 2;
  const g = ctx.createRadialGradient(c, c, R * 0.2, c, c, R);
  g.addColorStop(0, '#6a3a1c');
  g.addColorStop(1, '#2a140a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, R, 0, Math.PI * 2);
  ctx.fill();
  // ball track
  ctx.fillStyle = '#c9a26a';
  ctx.beginPath();
  ctx.arc(c, c, R * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a6a3a';
  ctx.beginPath();
  ctx.arc(c, c, R * 0.8, 0, Math.PI * 2);
  ctx.fill();
  // pockets
  const n = EURO_WHEEL.length;
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * step - step / 2;
    const num = EURO_WHEEL[i];
    const col = numberColor(num) === 'red' ? '#b8202f' : numberColor(num) === 'black' ? '#141418' : '#1f8a4c';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, R * 0.78, a0, a0 + step);
    ctx.closePath();
    ctx.fill();
    // frets
    ctx.strokeStyle = '#e8d08a';
    ctx.lineWidth = Math.max(1, size / 220);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a0) * R * 0.56, c + Math.sin(a0) * R * 0.56);
    ctx.lineTo(c + Math.cos(a0) * R * 0.78, c + Math.sin(a0) * R * 0.78);
    ctx.stroke();
    // number
    ctx.save();
    const am = a0 + step / 2;
    ctx.translate(c + Math.cos(am) * R * 0.7, c + Math.sin(am) * R * 0.7);
    ctx.rotate(am + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(size * 0.042)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), 0, 0);
    ctx.restore();
  }
  // pocket floor ring
  ctx.strokeStyle = '#e8d08a';
  ctx.lineWidth = Math.max(1, size / 160);
  ctx.beginPath();
  ctx.arc(c, c, R * 0.56, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, R * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  // cone
  const cg = ctx.createRadialGradient(c - R * 0.1, c - R * 0.1, 2, c, c, R * 0.55);
  cg.addColorStop(0, '#b8844a');
  cg.addColorStop(1, '#5a3418');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(c, c, R * 0.55, 0, Math.PI * 2);
  ctx.fill();
  // turret
  ctx.strokeStyle = '#f2d27a';
  ctx.lineWidth = size / 50;
  ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(a) * R * 0.22, c + Math.sin(a) * R * 0.22);
    ctx.stroke();
  }
  ctx.fillStyle = '#f2d27a';
  ctx.beginPath();
  ctx.arc(c, c, size / 34, 0, Math.PI * 2);
  ctx.fill();
}

// ------------------------------------------------------------------ poker

/**
 * Seat angles (degrees, y down) around the oval, clockwise, i.e. in the order
 * the action moves. The dealer stands at the top (270°). Shared with the
 * casino floor so a patron sits in the same place in both views.
 */
export const POKER_SEAT_ANGLES = [118, 170, 222, 318, 10, 62];

export const PKT = {
  cx: 240,
  cy: 150,
  rx: 206,
  ry: 92,
  board: { x: 240, y: 146, gap: 26 },
  pot: { x: 240, y: 112 },
  muck: { x: 240, y: 74 },
};

export interface PokerSeatGeom {
  angle: number;
  plaque: { x: number; y: number };
  cards: { x: number; y: number };
  bet: { x: number; y: number };
  button: { x: number; y: number };
  /** where the action label and stack text go */
  label: { x: number; y: number };
}

/** Layout for display position `d` (0 = the player's seat, then clockwise). */
export function pokerSeatGeom(d: number): PokerSeatGeom {
  const deg = POKER_SEAT_ANGLES[d % POKER_SEAT_ANGLES.length];
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const at = (f: number, off = 0) => {
    const b = ((deg + off) * Math.PI) / 180;
    return { x: Math.round(PKT.cx + PKT.rx * f * Math.cos(b)), y: Math.round(PKT.cy + PKT.ry * f * Math.sin(b)) };
  };
  const plaque = { x: Math.round(PKT.cx + 226 * c), y: Math.min(220, Math.round(PKT.cy + 108 * s - 16)) };
  const cards = d === 0 ? { x: plaque.x + 44, y: 236 } : at(0.8);
  return { angle: deg, plaque, cards, bet: at(0.55), button: at(0.55, -16), label: { x: plaque.x, y: plaque.y + 39 } };
}

export function drawPokerTable(ctx: Ctx, variant: FeltVariant, stakes: string): void {
  const f = FELTS[variant];
  const { cx, cy, rx, ry } = PKT;
  const inside = (x: number, y: number, ax: number, ay: number) => ((x - cx) / ax) ** 2 + ((y - cy) / ay) ** 2 <= 1;
  for (let y = Math.floor(cy - ry - 12); y <= cy + ry + 12; y++) {
    for (let x = Math.floor(cx - rx - 12); x <= cx + rx + 12; x++) {
      if (!inside(x, y, rx + 12, ry + 12)) continue;
      if (!inside(x, y, rx, ry)) {
        // padded leather rail with a highlight on top
        const top = y < cy;
        const edge = !inside(x, y, rx + 10, ry + 10) || !inside(x, y, rx + 2, ry + 2);
        px(ctx, x, y, edge ? '#1c0e08' : top ? '#4a2416' : '#3a1a10');
        continue;
      }
      const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
      let col = d < 0.5 ? f.light : d < 0.86 ? f.felt : f.dark;
      if (d >= 0.48 && d < 0.52 && (x + y) % 2 === 0) col = f.felt;
      if (d >= 0.84 && d < 0.88 && (x + y) % 2 === 0) col = f.dark;
      px(ctx, x, y, col);
    }
  }
  // rail highlight
  for (let t = 200; t <= 340; t += 0.5) {
    const a = (t * Math.PI) / 180;
    px(ctx, Math.round(cx + Math.cos(a) * (rx + 6)), Math.round(cy + Math.sin(a) * (ry + 6)), '#6a3a24');
  }
  // betting line
  for (let t = 0; t < 360; t += 0.7) {
    const a = (t * Math.PI) / 180;
    px(ctx, Math.round(cx + Math.cos(a) * rx * 0.66), Math.round(cy + Math.sin(a) * ry * 0.66), rgba(f.ink, 0.45));
  }
  // community card boxes
  for (let i = 0; i < 5; i++) {
    const x = PKT.board.x + (i - 2) * PKT.board.gap;
    strokeRect(ctx, x - 12, PKT.board.y - 16, 24, 32, rgba(f.ink, 0.35));
  }
  drawTextCentered(ctx, "TEXAS HOLD'EM", cx, cy + 26, rgba(f.ink, 0.8), '5x7', 1, rgba('#000000', 0.3));
  drawTextCentered(ctx, `NO LIMIT  ${stakes}`, cx, cy + 37, rgba(f.ink, 0.7), '3x5');
  // dealer's tray
  rect(ctx, cx - 30, cy - ry + 4, 60, 9, '#1c1016');
  strokeRect(ctx, cx - 30, cy - ry + 4, 60, 9, '#6a4a2a');
  [1000, 500, 100, 25, 5, 1].forEach((d, i) => {
    const c = CHIP_COLORS[d];
    rect(ctx, cx - 27 + i * 9.5, cy - ry + 6, 7, 5, c.base);
    rect(ctx, cx - 27 + i * 9.5, cy - ry + 6, 7, 1, shade(c.base, 0.25));
  });
}

// ------------------------------------------------------------------ registration

export const tableAtlas = new AtlasBuilder('tbl');
let done = false;

/** Atlas frame of a card face (two- or four-colour deck) or the back. */
export function cardFrame(card: Card | null, fourColor = false): string {
  return card === null ? 'card:back' : `${fourColor ? 'card4' : 'card'}:${card}`;
}

export function chipFrame(denomG: number): string {
  return `chip:${denomG}`;
}

/** Builds the card, chip and felt textures used by all table scenes (once). */
export function registerTableTextures(scene: Phaser.Scene): void {
  if (done && scene.textures.exists('tbl0')) return;
  for (let c = 0; c < 52; c++) {
    tableAtlas.draw(cardFrame(c), CW, CH, (ctx) => drawCardFace(ctx, c));
    tableAtlas.draw(cardFrame(c, true), CW, CH, (ctx) => drawCardFace(ctx, c, true));
  }
  tableAtlas.draw(cardFrame(null), CW, CH, (ctx) => drawCardBack(ctx));
  for (const d of CHIP_DENOMS) {
    tableAtlas.draw(chipFrame(d), 12, 7, (ctx) => drawChipSlice(ctx, d));
    tableAtlas.draw(`chiptop:${d}`, 16, 16, (ctx) => drawChipTop(ctx, d));
  }
  tableAtlas.draw('dolly', 10, 14, (ctx) => {
    rect(ctx, 3, 4, 4, 9, '#e8e2d0');
    circle(ctx, 5, 4, 4, '#f4f1ea');
    circle(ctx, 5, 4, 2, '#c8a24a');
  });
  tableAtlas.draw('ball', 6, 6, (ctx) => {
    circle(ctx, 3, 3, 2.5, '#f4f1ea');
    px(ctx, 2, 2, '#ffffff');
    px(ctx, 4, 4, '#b8b8c0');
  });
  for (const [id, fill, ink, text] of [
    ['btn:D', '#f4f1ea', '#1b1824', 'D'],
    ['btn:SB', '#3b6fc4', '#f4f1ea', 'SB'],
    ['btn:BB', '#c8a24a', '#1b1824', 'BB'],
  ] as const) {
    tableAtlas.draw(id, 11, 11, (ctx) => {
      circle(ctx, 5.5, 6, 5, shade(fill, -0.35));
      circle(ctx, 5.5, 5.5, 5, fill);
      drawTextCentered(ctx, text, 5.5, 3, ink, '3x5');
    });
  }
  tableAtlas.draw('marker', 12, 7, (ctx) => {
    for (let i = 0; i < 6; i++) rect(ctx, i, i, 12 - i * 2, 1, '#ffe45c');
  });
  tableAtlas.register(scene);
  for (const v of ['green', 'blue', 'red'] as FeltVariant[]) {
    const bd = makeCanvas(TW, TH);
    drawBackdrop(bd.ctx, v);
    if (scene.textures.exists(`backdrop:${v}`)) scene.textures.remove(`backdrop:${v}`);
    scene.textures.addCanvas(`backdrop:${v}`, bd.canvas);
  }
  const wheel = makeCanvas(360, 360);
  drawWheel(wheel.ctx, 360);
  if (scene.textures.exists('wheel')) scene.textures.remove('wheel');
  scene.textures.addCanvas('wheel', wheel.canvas)!.setFilter(0); // LINEAR for smooth rotation
  done = true;
  void mix;
  void P;
}

/** Felt for a specific table configuration (cached per key). */
export function feltTexture(scene: Phaser.Scene, key: string, draw: (ctx: Ctx) => void): string {
  const k = `felt:${key}`;
  if (!scene.textures.exists(k)) {
    const c = makeCanvas(TW, TH);
    draw(c.ctx);
    scene.textures.addCanvas(k, c.canvas);
  }
  return k;
}
