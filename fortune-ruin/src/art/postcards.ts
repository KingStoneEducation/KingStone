import { circle, ellipse, hline, makeCanvas, mix, px, rect, shade, strokeRect, vline, type Ctx } from './canvas';
import { drawText } from './font';
import { Rng } from '../core/rng';
import type { BoatModel, CardScene, TimeOfDay } from '../systems/MarinaSystem';

/**
 * The postcards of a trip on the water: Greyhaven seen from the river as the
 * boat pulls out, the open water by the lighthouse, and the marina coming
 * back into view. Each is painted from the trip itself: the hour sets the
 * light, the boat sets the deck in the foreground, and the friends who came
 * along leave their things on it.
 */
export const CARD_W = 96;
export const CARD_H = 60;

export interface CardSpec {
  seed: number;
  scene: CardScene;
  tod: TimeOfDay;
  party: boolean;
  model: BoatModel;
  guests: string[];
  /** crossing to the island while the fishing boats are out at sea */
  boatsOut?: boolean;
}

const SKY: Record<TimeOfDay, string[]> = {
  day: ['#4a7cc0', '#6894d0', '#8fb2de', '#bcd4ea', '#dce8f0'],
  dusk: ['#2c2a5c', '#5a3a6c', '#a8506a', '#e07a52', '#f6b25e'],
  night: ['#080c20', '#0e1430', '#141c3e', '#1c264c', '#26305a'],
};
const SEA: Record<TimeOfDay, string[]> = {
  day: ['#3a7aa0', '#2f6a8e', '#255a7c', '#1c4a68'],
  dusk: ['#6a4a6e', '#523c62', '#3e3054', '#2a2446'],
  night: ['#141e3a', '#0f1830', '#0b1226', '#080e1e'],
};
/** buildings against the sky: lit from the front by day, a silhouette at dusk, dark with windows at night */
const WALL: Record<TimeOfDay, [string, string]> = {
  day: ['#8a94a6', '#6e788a'],
  dusk: ['#4a3a5a', '#3a2c4a'],
  night: ['#141a2e', '#0e1222'],
};
const LIT = ['#ffd88a', '#ffbe6a', '#fff2c0'];

/** Horizontal colour bands with a dithered seam between each pair. */
function bands(ctx: Ctx, y0: number, y1: number, colors: string[]): void {
  const n = colors.length;
  const span = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const a = Math.round(y0 + i * span);
    const b = Math.round(y0 + (i + 1) * span);
    rect(ctx, 0, a, CARD_W, b - a, colors[i]);
    if (i + 1 < n) for (let x = 0; x < CARD_W; x += 2) px(ctx, x + ((b + x) % 2), b - 1, colors[i + 1]);
  }
}

function sky(ctx: Ctx, rng: Rng, tod: TimeOfDay, horizon: number, sunX: number): void {
  bands(ctx, 0, horizon, SKY[tod]);
  if (tod === 'night') {
    for (let i = 0; i < 26; i++) px(ctx, rng.int(0, CARD_W - 1), rng.int(0, horizon - 6), rng.chance(0.3) ? '#fff6d8' : '#8a96c0');
    circle(ctx, sunX, 8, 3, '#efe9d4');
    circle(ctx, sunX + 1, 7, 2, '#26305a');
    return;
  }
  const sy = tod === 'dusk' ? horizon - 4 : 9;
  if (tod === 'dusk') circle(ctx, sunX, sy, 6, '#ffd27a');
  circle(ctx, sunX, sy, tod === 'dusk' ? 4 : 4, tod === 'dusk' ? '#fff0b0' : '#fff8dc');
  // clouds
  for (let i = 0; i < 3; i++) {
    const cx = rng.int(4, CARD_W - 12);
    const cy = rng.int(4, Math.max(5, horizon - 14));
    const c = tod === 'dusk' ? '#f2a07a' : '#f4f6fa';
    const s = tod === 'dusk' ? '#c06a62' : '#c8d4e4';
    ellipse(ctx, cx, cy, 7, 2, c);
    ellipse(ctx, cx + 4, cy - 1, 4, 2, c);
    hline(ctx, cx - 6, cy + 2, 12, s);
  }
}

/** The light on the water: a glittering path under the sun or the moon. */
function glitter(ctx: Ctx, rng: Rng, tod: TimeOfDay, x: number, y0: number, y1: number): void {
  const c = tod === 'night' ? '#8a90b0' : tod === 'dusk' ? '#ffd27a' : '#e8f4ff';
  for (let y = y0 + 1; y < y1; y += 2) {
    const spread = 1 + Math.round(((y - y0) / Math.max(1, y1 - y0)) * 5);
    hline(ctx, x - spread + rng.int(-1, 1), y, rng.int(1, 3), c);
  }
}

function waves(ctx: Ctx, rng: Rng, tod: TimeOfDay, y0: number, y1: number, n: number): void {
  const c = mix(SEA[tod][0], '#ffffff', tod === 'night' ? 0.15 : 0.35);
  for (let i = 0; i < n; i++) hline(ctx, rng.int(0, CARD_W - 3), rng.int(y0 + 1, y1 - 1), rng.int(1, 3), c);
}

interface Bld {
  x: number;
  w: number;
  h: number;
  kind: 'tower' | 'hotel' | 'skyline' | 'office' | 'casino' | 'low';
}

/** Greyhaven's waterfront: the riverside towers, the Grand Hotel, Skyline Tower, Northgate and the casino. */
const WATERFRONT: Bld[] = [
  { x: 1, w: 7, h: 16, kind: 'tower' },
  { x: 9, w: 6, h: 20, kind: 'tower' },
  { x: 17, w: 15, h: 12, kind: 'hotel' },
  { x: 35, w: 6, h: 30, kind: 'skyline' },
  { x: 43, w: 10, h: 22, kind: 'office' },
  { x: 56, w: 26, h: 17, kind: 'casino' },
  { x: 84, w: 11, h: 9, kind: 'low' },
];

/** The skyline at a scale (1 = across the whole card), standing on the line `base`. */
function waterfront(ctx: Ctx, rng: Rng, tod: TimeOfDay, base: number, scale: number, x0: number): { x: number; y: number; c: string }[] {
  const lights: { x: number; y: number; c: string }[] = [];
  const [wall, side] = WALL[tod];
  // Hillcrest behind, with a few big houses on it
  for (let x = 0; x < CARD_W; x++) {
    const h = Math.round((5 + 3 * Math.sin(x / 9) + 2 * Math.sin(x / 4.3)) * scale);
    if (x * scale + x0 < 40 * scale + x0) vline(ctx, Math.round(x0 + x * scale), base - h, h, shade(side, tod === 'day' ? -0.12 : -0.2));
  }
  for (const b of WATERFRONT) {
    const x = Math.round(x0 + b.x * scale);
    const w = Math.max(2, Math.round(b.w * scale));
    const h = Math.max(2, Math.round(b.h * scale));
    const top = base - h;
    rect(ctx, x, top, w, h, wall);
    vline(ctx, x + w - 1, top, h, side);
    if (b.kind === 'skyline') {
      vline(ctx, x + Math.floor(w / 2), top - Math.round(6 * scale), Math.round(6 * scale), side);
      lights.push({ x: x + Math.floor(w / 2), y: top - Math.round(6 * scale), c: '#ff5a4a' });
    }
    if (b.kind === 'casino') {
      // the crown over the entrance, and the sign
      const cx = x + Math.floor(w / 2);
      const r = Math.max(2, Math.round(4 * scale));
      circle(ctx, cx, top, r, wall);
      rect(ctx, cx - r, top, r * 2, r, wall);
      px(ctx, cx, top - r - 1, '#e0b13e');
      const sy = top + Math.max(2, Math.round(3 * scale));
      hline(ctx, x + 1, sy, w - 2, tod === 'day' ? '#a8801a' : '#e0b13e');
      if (scale >= 0.9) drawText(ctx, 'GRAND', cx - 9, sy + 2, tod === 'day' ? '#a8801a' : '#ffd25a', '3x5');
    }
    if (b.kind === 'hotel' && scale >= 0.9) hline(ctx, x + 1, top + 2, w - 2, tod === 'day' ? '#c9b48e' : '#ffe2a0');
    // windows
    for (let wy = top + (b.kind === 'casino' ? 6 : 2); wy < base - 1; wy += 2) {
      for (let wx = x + 1; wx < x + w - 1; wx += 2) {
        if (tod === 'day') {
          if (rng.chance(0.5)) px(ctx, wx, wy, '#5a6a84');
        } else if (rng.chance(tod === 'night' ? 0.4 : 0.22)) {
          const c = rng.pick(LIT);
          px(ctx, wx, wy, c);
          lights.push({ x: wx, y: wy, c });
        }
      }
    }
    if (b.kind === 'casino' && tod !== 'day') {
      // the neon along its roofline
      for (let i = 0; i < w; i += 2) {
        const c = i % 4 === 0 ? '#ff4fa0' : '#ffd25a';
        px(ctx, x + i, top, c);
        lights.push({ x: x + i, y: top, c });
      }
    }
  }
  // the promenade along the water, its lamps lit after dark
  hline(ctx, 0, base, CARD_W, tod === 'day' ? '#a8a294' : '#2a2a36');
  for (let x = 3; x < CARD_W; x += 8) {
    px(ctx, x, base - 1, tod === 'day' ? '#4a4a52' : '#ffe2a0');
    if (tod !== 'day') lights.push({ x, y: base - 1, c: '#ffe2a0' });
  }
  return lights;
}

/** Lights mirrored in the water as short wavering dashes. */
function reflect(ctx: Ctx, rng: Rng, lights: { x: number; y: number; c: string }[], waterline: number, depth: number): void {
  for (const l of lights) {
    if (!rng.chance(0.55)) continue;
    const ry = waterline + 1 + Math.round((waterline - l.y) * 0.6);
    if (ry >= waterline + depth) continue;
    hline(ctx, l.x + rng.int(-1, 0), ry, rng.int(1, 2), mix(l.c, '#1c264c', 0.45));
  }
}

function lighthouse(ctx: Ctx, tod: TimeOfDay, x: number, horizon: number): void {
  ellipse(ctx, x, horizon + 1, 9, 2, tod === 'day' ? '#4a4a50' : '#1a1a24');
  ellipse(ctx, x - 3, horizon, 5, 2, tod === 'day' ? '#5a5a62' : '#22222e');
  const h = 15;
  for (let y = horizon - h; y < horizon; y++) {
    const w = 3 + Math.floor((y - (horizon - h)) / 6);
    const red = Math.floor((y - (horizon - h)) / 4) % 2 === 1;
    hline(ctx, x - Math.floor(w / 2), y, w, tod === 'night' ? (red ? '#3a1a22' : '#5a5a6a') : red ? '#c8283a' : '#f4f1ea');
  }
  rect(ctx, x - 2, horizon - h - 3, 5, 3, '#2a2a2e');
  px(ctx, x, horizon - h - 2, tod === 'day' ? '#ffe48a' : '#fff6c0');
  if (tod !== 'day') {
    // the beam sweeping out over the water
    for (let k = 1; k < 34; k++) {
      const y = horizon - h - 2 + Math.round(k * 0.12);
      const spread = Math.floor(k / 8);
      for (let d = -spread; d <= spread; d++) px(ctx, x + 2 + k, y + d, k % 2 === 0 ? 'rgba(255,246,192,0.55)' : 'rgba(255,246,192,0.35)');
    }
  }
}

function sailboat(ctx: Ctx, tod: TimeOfDay, x: number, y: number): void {
  const sail = tod === 'night' ? '#4a4a60' : tod === 'dusk' ? '#f2c8a0' : '#f4f1ea';
  vline(ctx, x, y - 7, 7, '#3a2a1a');
  for (let i = 0; i < 6; i++) hline(ctx, x + 1, y - 6 + i, Math.round(i * 0.7) + 1, sail);
  for (let i = 0; i < 4; i++) hline(ctx, x - Math.round(i * 0.6) - 1, y - 4 + i, Math.round(i * 0.6) + 1, sail);
  hline(ctx, x - 3, y, 7, tod === 'night' ? '#141420' : '#3a2416');
}

function gulls(ctx: Ctx, rng: Rng, horizon: number): void {
  for (let i = 0; i < 3; i++) {
    const gx = rng.int(4, CARD_W - 5);
    const gy = rng.int(3, Math.max(4, horizon - 8));
    px(ctx, gx - 1, gy, '#f4f1ea');
    px(ctx, gx, gy + 1, '#f4f1ea');
    px(ctx, gx + 1, gy, '#f4f1ea');
  }
}

/** The things friends (or fellow passengers) leave on deck, from x0 along to about x1. */
function guestThings(ctx: Ctx, guests: string[], y: number, x0 = 6, x1 = 40): void {
  let x = x0;
  for (const g of guests) {
    if (g === 'tommy') {
      // a guitar against the rail
      ellipse(ctx, x + 3, y - 3, 3, 3, '#a8703f');
      circle(ctx, x + 3, y - 3, 1, '#3a2416');
      vline(ctx, x + 3, y - 12, 7, '#5a3a24');
      x += 10;
    } else if (g === 'ben') {
      // a box of his pastries
      rect(ctx, x, y - 4, 8, 4, '#f4ead2');
      strokeRect(ctx, x, y - 4, 8, 4, '#c8a878');
      px(ctx, x + 2, y - 5, '#d89a4a');
      px(ctx, x + 5, y - 5, '#e8c070');
      x += 11;
    } else if (g === 'kiki') {
      // her camera
      rect(ctx, x, y - 4, 6, 4, '#2a2a30');
      circle(ctx, x + 3, y - 2, 1, '#6a8ab0');
      px(ctx, x + 1, y - 5, '#2a2a30');
      x += 9;
    } else if (g === 'lillian' || g === 'isabella') {
      // a sun hat
      ellipse(ctx, x + 4, y - 1, 5, 1, '#e8d8b0');
      rect(ctx, x + 2, y - 3, 5, 2, '#e8d8b0');
      hline(ctx, x + 2, y - 2, 5, '#b8283a');
      x += 12;
    }
    if (x > x1) break;
  }
}

/** The foreground: whose deck the photo was taken from. */
function deck(ctx: Ctx, tod: TimeOfDay, model: BoatModel, party: boolean, guests: string[]): void {
  const dark = tod === 'night';
  const y = CARD_H - 9;
  if (model === 'ferry') {
    // the ferry's green rail and a bench of passengers' bags
    rect(ctx, 0, y + 2, CARD_W, 7, dark ? '#24302c' : '#e8e4da');
    hline(ctx, 0, y + 2, CARD_W, dark ? '#2a7a5a' : '#2a7a5a');
    hline(ctx, 0, y - 5, CARD_W, dark ? '#3a6a5a' : '#3a8a6a');
    for (let x = 6; x < CARD_W; x += 14) vline(ctx, x, y - 5, 7, dark ? '#2a5a4a' : '#2a7a5a');
    rect(ctx, 10, y - 2, 7, 4, dark ? '#3a3a42' : '#8a5a36');
    rect(ctx, 70, y - 3, 6, 5, dark ? '#2a3a4a' : '#3a6a8a');
    ellipse(ctx, 84, y, 4, 2, dark ? '#3a3a2a' : '#c8b07a');
    // whoever you know on the same boat: Tommy's guitar, Kiki's camera...
    guestThings(ctx, guests, y + 1, 22, 56);
    return;
  }
  if (model === 'tour') {
    // the tour boat's white rail, a life ring hung on it
    rect(ctx, 0, y + 3, CARD_W, 6, dark ? '#3a3e4a' : '#e8e4da');
    hline(ctx, 0, y + 3, CARD_W, dark ? '#5a5e6a' : '#ffffff');
    hline(ctx, 0, y - 4, CARD_W, dark ? '#6a6e7a' : '#d8dce4');
    for (let x = 4; x < CARD_W; x += 12) vline(ctx, x, y - 4, 7, dark ? '#5a5e6a' : '#c8ccd4');
    circle(ctx, 70, y + 1, 4, dark ? '#7a3a1a' : '#e86a2a');
    circle(ctx, 70, y + 1, 2, dark ? '#3a3e4a' : '#e8e4da');
    px(ctx, 66, y + 1, dark ? '#9a9a9a' : '#f4f1ea');
    px(ctx, 74, y + 1, dark ? '#9a9a9a' : '#f4f1ea');
    return;
  }
  // teak boards
  const teak = dark ? '#3a2a1e' : tod === 'dusk' ? '#a86a44' : '#c08e5a';
  rect(ctx, 0, y, CARD_W, 9, teak);
  for (let x = 0; x < CARD_W; x += 6) vline(ctx, x, y, 9, shade(teak, -0.25));
  hline(ctx, 0, y, CARD_W, shade(teak, 0.15));
  // the rail
  hline(ctx, 0, y - 6, CARD_W, dark ? '#5a5e6a' : '#c8ccd4');
  for (let x = 2; x < CARD_W; x += 16) vline(ctx, x, y - 6, 6, dark ? '#4a4e5a' : '#a8acb4');
  if (model === 'motor') {
    // the aft sofa
    rect(ctx, 56, y - 5, 38, 5, dark ? '#6a6a72' : '#f4f1ea');
    hline(ctx, 56, y - 5, 38, dark ? '#8a8a92' : '#ffffff');
    rect(ctx, 56, y - 9, 38, 4, dark ? '#5a5a62' : '#e8e4da');
  } else {
    // a coil of rope
    ellipse(ctx, 84, y + 4, 5, 2, '#d8c8a0');
    ellipse(ctx, 84, y + 4, 3, 1, '#b8a880');
  }
  if (party) {
    // champagne on ice, and glasses
    rect(ctx, 40, y - 6, 12, 2, dark ? '#4a4a52' : '#e8e2d0');
    vline(ctx, 45, y - 4, 4, dark ? '#4a4a52' : '#c8c2b0');
    rect(ctx, 41, y - 11, 4, 5, '#c8ccd4');
    vline(ctx, 42, y - 15, 4, '#1e3a2a');
    px(ctx, 42, y - 16, '#e0b13e');
    for (const gx of [47, 50]) {
      vline(ctx, gx, y - 10, 3, '#f2e6a0');
      px(ctx, gx, y - 7, '#c8ccd4');
    }
    guestThings(ctx, guests, y);
  } else if (model !== 'motor') {
    // a towel and sunglasses
    rect(ctx, 12, y + 1, 18, 5, dark ? '#2a4a6a' : '#4a8ac0');
    for (let x = 13; x < 30; x += 3) vline(ctx, x, y + 1, 5, dark ? '#3a5a7a' : '#f4f1ea');
    hline(ctx, 34, y + 3, 6, '#1a1a1e');
  }
}

/** Looking back at the city as the boat pulls out, the wake behind. */
function skylineCard(ctx: Ctx, rng: Rng, c: CardSpec): void {
  const H = 38;
  sky(ctx, rng, c.tod, H, rng.int(10, 30));
  const lights = waterfront(ctx, rng, c.tod, H, 1, 0);
  bands(ctx, H + 1, CARD_H, SEA[c.tod]);
  reflect(ctx, rng, lights, H, CARD_H - H);
  waves(ctx, rng, c.tod, H + 2, CARD_H, 24);
  // the wake opening out behind the stern
  const wake = c.tod === 'night' ? '#6a7090' : '#f4f8fc';
  for (let k = 0; k < 18; k++) {
    px(ctx, 48 - k * 2, CARD_H - 10 - Math.round(k * 0.5), wake);
    px(ctx, 48 + k * 2, CARD_H - 10 - Math.round(k * 0.5), wake);
  }
  if (c.tod !== 'night') gulls(ctx, rng, H);
  deck(ctx, c.tod, c.model, false, []);
}

/** Out by the lighthouse. */
function openSeaCard(ctx: Ctx, rng: Rng, c: CardSpec): void {
  const H = 27;
  const sunX = rng.int(30, 66);
  sky(ctx, rng, c.tod, H, sunX);
  // the far shore
  const left = rng.chance(0.5);
  for (let x = 0; x < 40; x++) {
    const h = Math.round(2 + 2 * Math.sin(x / 5));
    vline(ctx, left ? x : CARD_W - 1 - x, H - h, h, c.tod === 'day' ? '#6a7a8a' : '#2a2a3e');
  }
  bands(ctx, H + 1, CARD_H, SEA[c.tod]);
  glitter(ctx, rng, c.tod, sunX, H, CARD_H - 10);
  waves(ctx, rng, c.tod, H + 1, CARD_H, 30);
  lighthouse(ctx, c.tod, left ? 18 : CARD_W - 20, H + 1);
  if (c.tod !== 'night') sailboat(ctx, c.tod, left ? 72 : 26, H + 6);
  if (c.tod === 'day') gulls(ctx, rng, H);
  deck(ctx, c.tod, c.model, c.party, c.guests);
}

/** The marina coming back into view: the pontoon, the office, the boats in their berths, the hotel behind. */
function homecomingCard(ctx: Ctx, rng: Rng, c: CardSpec): void {
  const H = 34;
  sky(ctx, rng, c.tod, H, rng.int(60, 86));
  const lights = waterfront(ctx, rng, c.tod, H, 0.7, 14);
  bands(ctx, H + 1, CARD_H, SEA[c.tod]);
  const dark = c.tod === 'night';
  // the pontoon
  const py = H + 8;
  rect(ctx, 8, py, 88, 3, dark ? '#3a2a1e' : '#bf9160');
  hline(ctx, 8, py + 3, 88, dark ? '#e8e4dc' : '#f4f1ea');
  hline(ctx, 8, py + 4, 88, '#2a3a4a');
  // the office with its blue roof
  rect(ctx, 74, py - 9, 12, 9, dark ? '#5a5a62' : '#f4f1ea');
  rect(ctx, 73, py - 11, 14, 2, '#2a4a8a');
  rect(ctx, 76, py - 6, 4, 3, dark ? '#ffd88a' : '#3a6a9a');
  if (dark) lights.push({ x: 77, y: py - 5, c: '#ffd88a' });
  // the boats: the Whitmores' dark hull, the club's sloop with its mast
  rect(ctx, 14, py - 4, 22, 4, '#1c2a44');
  rect(ctx, 18, py - 7, 12, 3, dark ? '#4a4a52' : '#f0ede4');
  hline(ctx, 14, py - 2, 22, '#c9a24a');
  rect(ctx, 44, py - 3, 16, 3, '#f8f6f0');
  vline(ctx, 51, py - 18, 15, dark ? '#6a6e7a' : '#c8ccd4');
  hline(ctx, 44, py - 1, 16, '#b8283a');
  // lamps on the pontoon
  for (const x of [40, 66, 92]) {
    vline(ctx, x, py - 6, 6, '#2a2a30');
    px(ctx, x, py - 7, dark ? '#fff2c0' : '#e8e2d0');
    if (dark) lights.push({ x, y: py - 7, c: '#ffe2a0' });
  }
  reflect(ctx, rng, lights, py + 4, CARD_H - py - 4);
  waves(ctx, rng, c.tod, py + 5, CARD_H, 18);
  // our bow wave
  const foam = dark ? '#6a7090' : '#f4f8fc';
  for (let k = 0; k < 12; k++) {
    px(ctx, 46 - k * 3, CARD_H - 2 - k, foam);
    px(ctx, 50 + k * 3, CARD_H - 2 - k, foam);
  }
  if (c.tod !== 'night') gulls(ctx, rng, H - 10);
}

/** Whitestone Bay from the ferry: green hills, the fishing village at the water, the resort on the point, the lighthouse. */
function toIsleCard(ctx: Ctx, rng: Rng, c: CardSpec): void {
  const H = 34;
  const dark = c.tod === 'night';
  sky(ctx, rng, c.tod, H, rng.int(14, 40));
  // the island's hills
  const hill = c.tod === 'day' ? '#4a7a4a' : c.tod === 'dusk' ? '#3a3a4a' : '#141c26';
  for (let x = 6; x < 86; x++) {
    const h = Math.round(9 + 5 * Math.sin((x - 6) / 13) + 2 * Math.sin(x / 4.1));
    vline(ctx, x, H - h, h, hill);
  }
  // the village: coloured houses along the water
  const cols = ['#d8c8a8', '#8a9aa4', '#c86a5a', '#e8e4da', '#3a6a8a'];
  const lights: { x: number; y: number; c: string }[] = [];
  for (let i = 0; i < 9; i++) {
    const x = 10 + i * 5;
    const h = 3 + (i % 3);
    rect(ctx, x, H - h, 4, h, dark ? '#20242e' : cols[i % cols.length]);
    hline(ctx, x, H - h - 1, 4, dark ? '#181a22' : '#7a3a2a');
    if (dark && rng.chance(0.6)) {
      px(ctx, x + 1, H - 2, '#ffd88a');
      lights.push({ x: x + 1, y: H - 2, c: '#ffd88a' });
    } else if (!dark) px(ctx, x + 1, H - 2, '#3a4a5a');
  }
  // the resort's white terraces on the point
  for (let k = 0; k < 3; k++) {
    rect(ctx, 64 + k * 3, H - 10 + k * 3, 14 - k * 2, 3, dark ? '#3a3e48' : '#f6f3ec');
    for (let x = 65 + k * 3; x < 76 - k; x += 2) {
      if (dark) {
        px(ctx, x, H - 9 + k * 3, '#ffe8b8');
        lights.push({ x, y: H - 9 + k * 3, c: '#ffe8b8' });
      } else px(ctx, x, H - 9 + k * 3, '#7a9ab4');
    }
  }
  // the lighthouse on the rocks
  lighthouse(ctx, c.tod, 88, H + 1);
  bands(ctx, H + 1, CARD_H, SEA[c.tod]);
  reflect(ctx, rng, lights, H, CARD_H - H);
  waves(ctx, rng, c.tod, H + 2, CARD_H, 26);
  if (!dark && c.boatsOut) {
    // the fishing boats far out, hauling their nets
    for (const x of [16, 82]) {
      rect(ctx, x, H + 1, 4, 1, '#2a5a8a');
      vline(ctx, x + 1, H - 2, 3, '#5a3a24');
      px(ctx, x + 4, H, '#c8c2b0');
    }
  } else if (!dark) {
    // the fishing boats in the harbour
    for (const x of [30, 52]) {
      rect(ctx, x, H + 4, 6, 2, '#2a5a8a');
      vline(ctx, x + 2, H, 4, '#5a3a24');
    }
  }
  if (c.tod !== 'night') gulls(ctx, rng, H);
  deck(ctx, c.tod, 'ferry', false, c.guests);
}

/** Greyhaven from the ferry coming back: the whole waterfront, smaller than from the marina. */
function toCityCard(ctx: Ctx, rng: Rng, c: CardSpec): void {
  const H = 36;
  sky(ctx, rng, c.tod, H, rng.int(56, 84));
  const lights = waterfront(ctx, rng, c.tod, H, 0.85, 7);
  bands(ctx, H + 1, CARD_H, SEA[c.tod]);
  reflect(ctx, rng, lights, H, CARD_H - H);
  waves(ctx, rng, c.tod, H + 2, CARD_H, 26);
  if (c.tod !== 'night') gulls(ctx, rng, H);
  deck(ctx, c.tod, 'ferry', false, c.guests);
}

export function drawCard(ctx: Ctx, c: CardSpec): void {
  const rng = new Rng(c.seed);
  if (c.scene === 'skyline') skylineCard(ctx, rng, c);
  else if (c.scene === 'open_sea') openSeaCard(ctx, rng, c);
  else if (c.scene === 'to_isle') toIsleCard(ctx, rng, c);
  else if (c.scene === 'to_city') toCityCard(ctx, rng, c);
  else homecomingCard(ctx, rng, c);
}

const cache = new Map<string, string>();

/** A postcard with a white border, as a data URL. */
export function cardUrl(c: CardSpec): string {
  const key = `${c.seed}:${c.scene}:${c.tod}:${c.party ? 1 : 0}:${c.model}:${c.guests.join(',')}:${c.boatsOut ? 1 : 0}`;
  let u = cache.get(key);
  if (!u) {
    const { canvas, ctx } = makeCanvas(CARD_W + 6, CARD_H + 6);
    rect(ctx, 0, 0, CARD_W + 6, CARD_H + 6, '#f4f1ea');
    strokeRect(ctx, 0, 0, CARD_W + 6, CARD_H + 6, '#c8c2b0');
    const inner = makeCanvas(CARD_W, CARD_H);
    drawCard(inner.ctx, c);
    ctx.drawImage(inner.canvas, 3, 3);
    u = canvas.toDataURL();
    cache.set(key, u);
    if (cache.size > 60) cache.delete(cache.keys().next().value as string);
  }
  return u;
}
