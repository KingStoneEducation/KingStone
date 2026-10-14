import { circle, ellipse, hash2, hline, makeCanvas, mix, px, rect, shade, strokeRect, vline, type Ctx } from './canvas';
import { Rng } from '../core/rng';
import type { Piece } from '../core/state';

/**
 * The auction house's paintings and collectibles, painted from a piece's
 * seed. The same piece always gives the same picture, at any size: the
 * auction window shows it large, the ballroom easels small.
 */
export const ART_W = 48;
export const ART_H = 36;

type Art = Pick<Piece, 'kind' | 'genre' | 'seed' | 'tier'> & { title?: string };

/** Brush texture: a few lighter and darker pixels over an area. */
function brush(ctx: Ctx, w: number, h: number, rng: Rng, amount: number): void {
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (rng.float() > amount) continue;
    const k = rng.float() < 0.5 ? -14 : 12;
    d[i] = Math.max(0, Math.min(255, d[i] + k));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + k));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + k));
  }
  ctx.putImageData(data, 0, 0);
}

/** Horizontal colour bands with a dithered seam between each pair. */
function bands(ctx: Ctx, x: number, y0: number, w: number, y1: number, colors: string[]): void {
  const n = colors.length;
  const span = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const a = Math.round(y0 + i * span);
    const b = Math.round(y0 + (i + 1) * span);
    rect(ctx, x, a, w, b - a, colors[i]);
    if (i + 1 < n) for (let xx = x; xx < x + w; xx += 2) px(ctx, xx + ((b + xx) % 2), b - 1, colors[i + 1]);
  }
}

/** A ridge line: height above `base` at each column. */
function ridge(rng: Rng, w: number, amp: number, rough: number): number[] {
  const p1 = rng.float() * 6.28;
  const p2 = rng.float() * 6.28;
  const f1 = 1 + rng.float() * 2;
  const f2 = 3 + rng.float() * 4;
  const out: number[] = [];
  for (let x = 0; x < w; x++) {
    const t = x / w;
    out.push(Math.round(amp * (0.55 + 0.3 * Math.sin(t * 6.28 * f1 / 2 + p1) + rough * 0.25 * Math.sin(t * 6.28 * f2 + p2))));
  }
  return out;
}

const SKIES: Record<string, string[]> = {
  dawn: ['#3a4a7a', '#7a6aa0', '#d8988a', '#f2cc9a'],
  day: ['#3f6eb0', '#5f8ecc', '#8ab4de', '#c4dcec'],
  dusk: ['#2a2a5a', '#5a3a6a', '#b85a4a', '#eea050'],
  night: ['#0a1026', '#141c3c', '#222c56', '#343c6a'],
};

function landscape(ctx: Ctx, w: number, h: number, rng: Rng): void {
  const tod = rng.pick(['dawn', 'day', 'day', 'dusk', 'night']);
  const sky = SKIES[tod];
  const horizon = Math.round(h * (0.48 + rng.float() * 0.12));
  bands(ctx, 0, 0, w, horizon, sky);
  // sun or moon
  const sx = Math.round(w * (0.2 + rng.float() * 0.6));
  const sy = Math.round(horizon * (0.35 + rng.float() * 0.3));
  const r = Math.max(1, Math.round(h * 0.07));
  circle(ctx, sx, sy, r + 1, mix(sky[2], '#ffffff', 0.3));
  circle(ctx, sx, sy, r, tod === 'night' ? '#efe9d4' : tod === 'day' ? '#fff4c8' : '#ffd890');
  // clouds
  for (let i = 0; i < 2 + rng.int(0, 2); i++) {
    const cx = rng.int(0, w);
    const cy = rng.int(1, Math.max(2, Math.round(horizon * 0.6)));
    ellipse(ctx, cx, cy, Math.max(2, Math.round(w * 0.1)), 1, mix(sky[1], '#ffffff', 0.35));
  }
  // far mountains, then hills
  const season = rng.pick(['green', 'green', 'autumn', 'snow']);
  const far = ridge(rng, w, Math.round(h * 0.22), 1);
  const farC = mix(sky[1], '#3a4a6a', 0.55);
  for (let x = 0; x < w; x++) {
    vline(ctx, x, horizon - far[x], far[x], farC);
    if (season === 'snow') px(ctx, x, horizon - far[x], '#f0f2f4');
  }
  const water = rng.float() < 0.5;
  const hillC = season === 'autumn' ? '#8a5a26' : season === 'snow' ? '#c8d0d8' : '#3f6a3a';
  const near = ridge(rng, w, Math.round(h * 0.12), 1.6);
  const groundTop = water ? Math.round(horizon + (h - horizon) * 0.25) : horizon;
  for (let x = 0; x < w; x++) vline(ctx, x, groundTop - near[x], near[x] + 1, hillC);
  if (water) {
    // a lake that holds the sky
    bands(ctx, 0, groundTop + 1, w, h, [shade(sky[3], -0.25), shade(sky[2], -0.3), shade(sky[1], -0.35)]);
    for (let i = 0; i < Math.round(w / 3); i++) hline(ctx, rng.int(0, w), rng.int(groundTop + 2, h - 1), rng.int(1, 3), mix(sky[3], '#ffffff', 0.2));
    for (let y = groundTop + 2; y < h; y += 2) px(ctx, sx + rng.int(-1, 1), y, mix(sky[3], '#fff4c8', 0.5));
  } else {
    bands(ctx, 0, groundTop + 1, w, h, [hillC, shade(hillC, -0.15), shade(hillC, -0.3)]);
  }
  // trees
  const treeC = season === 'autumn' ? '#b8642e' : season === 'snow' ? '#3a5a4a' : '#2a4a2a';
  for (let i = 0; i < 3 + rng.int(0, 3); i++) {
    const tx = rng.int(1, w - 2);
    const ty = groundTop - near[tx] + rng.int(0, 2);
    const tr = Math.max(1, Math.round(h * 0.04));
    vline(ctx, tx, ty, tr + 2, '#3a2a1a');
    circle(ctx, tx, ty - 1, tr, treeC);
  }
}

function seascape(ctx: Ctx, w: number, h: number, rng: Rng): void {
  const tod = rng.pick(['day', 'dusk', 'dawn', 'night']);
  const sky = SKIES[tod];
  const horizon = Math.round(h * (0.42 + rng.float() * 0.12));
  bands(ctx, 0, 0, w, horizon, sky);
  const sx = Math.round(w * (0.25 + rng.float() * 0.5));
  const sy = Math.round(horizon * 0.55);
  const r = Math.max(1, Math.round(h * 0.06));
  circle(ctx, sx, sy, r, tod === 'night' ? '#efe9d4' : '#ffe0a0');
  const sea = tod === 'night' ? ['#16264a', '#0e1a36', '#0a1228'] : ['#2f6a8a', '#24567a', '#1a4060'];
  bands(ctx, 0, horizon, w, h, sea);
  // waves and the sun's path on the water
  for (let i = 0; i < Math.round(w / 2.5); i++) hline(ctx, rng.int(0, w), rng.int(horizon + 1, h - 1), rng.int(1, 3), mix(sea[0], '#ffffff', 0.35));
  for (let y = horizon + 1; y < h; y += 2) hline(ctx, sx - 1 + rng.int(-1, 1), y, 2, mix(sky[3], '#fff4c8', 0.6));
  // a sailing boat
  const bx = Math.round(w * (0.2 + rng.float() * 0.5));
  const by = horizon + Math.max(2, Math.round((h - horizon) * 0.35));
  const s = Math.max(2, Math.round(h * 0.1));
  hline(ctx, bx - s, by, s * 2, '#3a2416');
  hline(ctx, bx - s + 1, by + 1, s * 2 - 2, '#2a1a10');
  vline(ctx, bx, by - s * 2, s * 2, '#5a3a24');
  for (let i = 0; i < s * 2 - 1; i++) hline(ctx, bx + 1, by - s * 2 + 1 + i, Math.round((i / (s * 2)) * s), '#f4ead2');
  // a lighthouse on a rock
  if (rng.float() < 0.6) {
    const left = rng.float() < 0.5;
    const lx = left ? Math.round(w * 0.1) : Math.round(w * 0.86);
    const lh = Math.max(4, Math.round(h * 0.3));
    ellipse(ctx, lx, horizon + 1, Math.max(2, Math.round(w * 0.1)), Math.max(1, Math.round(h * 0.05)), '#3a3a40');
    rect(ctx, lx - 1, horizon - lh, 3, lh, '#f4f1ea');
    for (let y = horizon - lh + 2; y < horizon; y += 4) hline(ctx, lx - 1, y, 3, '#c8283a');
    px(ctx, lx, horizon - lh - 1, '#ffe48a');
  }
  // gulls
  for (let i = 0; i < 3; i++) {
    const gx = rng.int(2, w - 3);
    const gy = rng.int(1, Math.max(2, horizon - 3));
    px(ctx, gx - 1, gy, '#f4f1ea');
    px(ctx, gx, gy + 1, '#f4f1ea');
    px(ctx, gx + 1, gy, '#f4f1ea');
  }
}

function stillLife(ctx: Ctx, w: number, h: number, rng: Rng): void {
  const bg = rng.pick(['#2a1e16', '#1e2418', '#241a24', '#1a1e2a']);
  rect(ctx, 0, 0, w, h, bg);
  // light from the left
  for (let x = 0; x < Math.round(w * 0.4); x++) for (let y = 0; y < h; y++) if (hash2(x, y, 7) < 0.25 * (1 - x / (w * 0.4))) px(ctx, x, y, shade(bg, 0.12));
  const tableY = Math.round(h * (0.62 + rng.float() * 0.08));
  const cloth = rng.pick(['#7a5a3a', '#e8e0cc', '#5a2a2a', '#3a4a5a']);
  rect(ctx, 0, tableY, w, h - tableY, cloth);
  hline(ctx, 0, tableY, w, shade(cloth, 0.25));
  for (let i = 0; i < 3; i++) vline(ctx, rng.int(0, w), tableY + 1, h - tableY, shade(cloth, -0.12));
  // the vase
  const vx = Math.round(w * (0.3 + rng.float() * 0.25));
  const vw = Math.max(2, Math.round(w * 0.09));
  const vh = Math.max(3, Math.round(h * 0.22));
  const light = cloth === '#e8e0cc';
  const vc = rng.pick(light ? ['#3a6a8a', '#b8643a', '#2a4a3a', '#7a2a3a'] : ['#3a6a8a', '#b8643a', '#e8e0cc', '#2a4a3a']);
  ellipse(ctx, vx, tableY - Math.round(vh / 2), vw, Math.round(vh / 2), vc);
  rect(ctx, vx - Math.max(1, Math.round(vw / 3)), tableY - vh - Math.max(1, Math.round(h * 0.06)), Math.max(2, Math.round((vw * 2) / 3)), Math.max(2, Math.round(h * 0.07)), vc);
  px(ctx, vx - vw + 1, tableY - Math.round(vh / 2), shade(vc, 0.35));
  // flowers above it, or fruit beside it
  if (rng.float() < 0.6) {
    const top = tableY - vh - Math.max(1, Math.round(h * 0.06));
    for (let i = 0; i < 5 + rng.int(0, 4); i++) {
      const fx = vx + rng.int(-vw * 2, vw * 2);
      const fy = top - rng.int(1, Math.max(2, Math.round(h * 0.25)));
      vline(ctx, Math.round((fx + vx) / 2), fy, top - fy, '#3a6a2a');
      circle(ctx, fx, fy, Math.max(1, Math.round(h * 0.035)), rng.pick(['#e8483a', '#f2c94c', '#f4f1ea', '#e87aa0', '#8a5ad0']));
    }
  }
  const fruits = ['#e8902a', '#c8283a', '#f2d04a', '#6a3a8a', '#7ab04a'];
  for (let i = 0; i < 2 + rng.int(0, 3); i++) {
    const fx = Math.round(w * (0.55 + rng.float() * 0.35));
    const fy = tableY - Math.max(1, Math.round(h * 0.04)) + rng.int(0, 2);
    const fc = rng.pick(fruits);
    circle(ctx, fx, fy, Math.max(1, Math.round(h * 0.05)), fc);
    px(ctx, fx - 1, fy - 1, shade(fc, 0.4));
  }
}

function portrait(ctx: Ctx, w: number, h: number, rng: Rng): void {
  const bg = rng.pick(['#1a1814', '#14181e', '#22180e', '#1e1424']);
  rect(ctx, 0, 0, w, h, bg);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hash2(x, y, 3) < 0.18 * (1 - Math.abs(x - w / 2) / (w / 2))) px(ctx, x, y, shade(bg, 0.14));
  const cx = Math.round(w * (0.45 + rng.float() * 0.1));
  const skin = rng.pick(['#f0c8a0', '#d8a878', '#b07848', '#8a5a3a']);
  const cloth = rng.pick(['#2a3a6a', '#5a1a2a', '#1a1a1e', '#3a5a3a', '#e8e0cc']);
  const hair = rng.pick(['#2a1a10', '#5a3a1a', '#1a1a1e', '#a86a3a', '#c8c0b0']);
  const hr = Math.max(2, Math.round(h * 0.17));
  const hy = Math.round(h * 0.4);
  // shoulders
  ellipse(ctx, cx, h, Math.round(w * 0.32), Math.round(h * 0.3), cloth);
  rect(ctx, cx - Math.max(1, Math.round(hr / 2)), hy + hr - 1, Math.max(2, hr), Math.round(h * 0.12), shade(skin, -0.12));
  // head, lit from the left
  ellipse(ctx, cx, hy, hr, Math.round(hr * 1.2), skin);
  for (let y = -hr; y <= hr; y++) px(ctx, cx + Math.round(hr * 0.7), hy + y, shade(skin, -0.18));
  // hair
  ellipse(ctx, cx, hy - Math.round(hr * 0.7), hr + 1, Math.max(1, Math.round(hr * 0.6)), hair);
  if (rng.float() < 0.5) for (let y = 0; y < hr * 2; y++) px(ctx, cx - hr - 1, hy - hr + y, hair);
  // eyes, mouth
  const ey = hy - Math.round(hr * 0.1);
  px(ctx, cx - Math.max(1, Math.round(hr * 0.4)), ey, '#1a1410');
  px(ctx, cx + Math.max(1, Math.round(hr * 0.4)), ey, '#1a1410');
  hline(ctx, cx - Math.max(0, Math.round(hr * 0.2)), hy + Math.round(hr * 0.55), Math.max(1, Math.round(hr * 0.4)), shade(skin, -0.35));
  // a pearl, or a collar
  if (rng.float() < 0.4) px(ctx, cx - hr, hy + Math.round(hr * 0.4), '#f8f4ec');
  else hline(ctx, cx - Math.round(hr * 0.6), hy + hr + Math.round(h * 0.1), Math.round(hr * 1.2), '#e8e0cc');
}

function abstract(ctx: Ctx, w: number, h: number, rng: Rng): void {
  const style = rng.pick(['field', 'grid', 'shapes']);
  if (style === 'field') {
    // stacked fields of colour with soft edges
    const ground = rng.pick(['#8a2a1a', '#1a2a4a', '#3a2a3a', '#c86a2a']);
    rect(ctx, 0, 0, w, h, ground);
    const colors = [rng.pick(['#e8a03a', '#c83a2a', '#e8d0a0', '#2a4a8a']), rng.pick(['#5a1a1a', '#1a1a2a', '#f4e0b0', '#6a8ab0'])];
    const m = Math.max(1, Math.round(w * 0.08));
    const mid = Math.round(h * (0.45 + rng.float() * 0.15));
    rect(ctx, m, m, w - m * 2, mid - m - 1, colors[0]);
    rect(ctx, m, mid + 1, w - m * 2, h - mid - m - 1, colors[1]);
    for (let x = m; x < w - m; x += 2) {
      px(ctx, x, m - 1, colors[0]);
      px(ctx, x + 1, h - m, colors[1]);
    }
  } else if (style === 'grid') {
    rect(ctx, 0, 0, w, h, '#f0ece2');
    const xs = [0, Math.round(w * (0.25 + rng.float() * 0.15)), Math.round(w * (0.6 + rng.float() * 0.15)), w];
    const ys = [0, Math.round(h * (0.3 + rng.float() * 0.2)), Math.round(h * (0.65 + rng.float() * 0.15)), h];
    const fills = ['#c8283a', '#2a4a9a', '#f2c94c'];
    for (let i = 0; i < 3; i++) {
      const cx = rng.int(0, 2);
      const cy = rng.int(0, 2);
      rect(ctx, xs[cx], ys[cy], xs[cx + 1] - xs[cx], ys[cy + 1] - ys[cy], fills[i]);
    }
    const lw = Math.max(1, Math.round(w / 32));
    for (const x of xs.slice(1, 3)) rect(ctx, x, 0, lw, h, '#141414');
    for (const y of ys.slice(1, 3)) rect(ctx, 0, y, w, lw, '#141414');
  } else {
    const ground = rng.pick(['#e8dcc0', '#1a1a2a', '#dce4e8']);
    rect(ctx, 0, 0, w, h, ground);
    for (let i = 0; i < 4 + rng.int(0, 3); i++) circle(ctx, rng.int(0, w), rng.int(0, h), Math.max(1, rng.int(1, Math.round(h * 0.18))), rng.pick(['#c8283a', '#2a4a9a', '#f2c94c', '#1a1a1e', '#3a8a5a', '#e87a2a']));
    for (let i = 0; i < 3; i++) {
      const x0 = rng.int(0, w);
      const y0 = rng.int(0, h);
      const dx = rng.int(-w, w) / w;
      for (let k = 0; k < w * 0.6; k++) px(ctx, x0 + k * dx, y0 + k * 0.5, '#141414');
    }
  }
}

function city(ctx: Ctx, w: number, h: number, rng: Rng): void {
  const horizon = Math.round(h * 0.72);
  bands(ctx, 0, 0, w, horizon, SKIES.night);
  circle(ctx, Math.round(w * (0.15 + rng.float() * 0.7)), Math.round(h * 0.15), Math.max(1, Math.round(h * 0.05)), '#efe9d4');
  let x = 0;
  const lit: [number, number][] = [];
  while (x < w) {
    const bw = Math.max(2, Math.round(w * (0.06 + rng.float() * 0.1)));
    const bh = Math.round(h * (0.15 + rng.float() * 0.45));
    rect(ctx, x, horizon - bh, bw, bh, rng.pick(['#14182a', '#1a1e34', '#101424']));
    for (let wy = horizon - bh + 1; wy < horizon - 1; wy += 2) for (let wx = x + 1; wx < x + bw - 1; wx += 2) if (rng.float() < 0.35) {
      px(ctx, wx, wy, rng.pick(['#ffd88a', '#ffbe6a', '#fff2c0']));
      lit.push([wx, wy]);
    }
    x += bw + rng.int(0, 1);
  }
  bands(ctx, 0, horizon, w, h, ['#0e1428', '#0a1020']);
  // reflections
  for (const [lx, ly] of lit) {
    const ry = horizon + (horizon - ly) * 0.5;
    if (ry < h && hash2(lx, ly, 5) < 0.5) px(ctx, lx, ry, '#8a7a4a');
  }
}

// ------------------------------------------------------------------ objects on velvet

function velvet(ctx: Ctx, w: number, h: number, rng: Rng): void {
  const c = rng.pick(['#4a1020', '#14203a', '#1e2a1e']);
  rect(ctx, 0, 0, w, h, c);
  for (let i = 0; i < 4; i++) {
    const x = Math.round((w * (i + 0.5)) / 4 + rng.int(-2, 2));
    for (let y = 0; y < h; y++) px(ctx, x + Math.round(Math.sin(y / 4 + i) * 1.2), y, shade(c, 0.12));
  }
  rect(ctx, 0, Math.round(h * 0.8), w, h - Math.round(h * 0.8), shade(c, -0.25));
}

function watchArt(ctx: Ctx, w: number, h: number, pocket: boolean): void {
  const cx = Math.round(w / 2);
  const cy = Math.round(h * (pocket ? 0.56 : 0.48));
  const r = Math.max(3, Math.round(h * 0.26));
  if (pocket) {
    // a chain looping up from the crown
    for (let t = 0; t < 40; t++) {
      const a = (t / 40) * Math.PI;
      px(ctx, cx + Math.round(Math.cos(a) * w * 0.3), cy - r - 2 - Math.round(Math.sin(a) * h * 0.3), t % 2 ? '#c9a24a' : '#8a6a1a');
    }
  } else {
    rect(ctx, cx - Math.round(r * 0.6), 0, Math.round(r * 1.2), h, '#5a3a24');
    for (let y = 2; y < h; y += 3) hline(ctx, cx - Math.round(r * 0.6) + 1, y, Math.round(r * 1.2) - 2, '#4a2a18');
  }
  circle(ctx, cx, cy, r + 1, '#a8801a');
  circle(ctx, cx, cy, r, '#e0b13e');
  circle(ctx, cx, cy, r - 1, '#f4ecd8');
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2;
    px(ctx, cx + Math.round(Math.cos(t) * (r - 2)), cy + Math.round(Math.sin(t) * (r - 2)), '#3a3a40');
  }
  for (let k = 0; k < r - 2; k++) px(ctx, cx, cy - k, '#1a1a1e');
  for (let k = 0; k < r - 3; k++) px(ctx, cx + Math.round(k * 0.7), cy + Math.round(k * 0.3), '#1a1a1e');
  if (pocket) rect(ctx, cx - 1, cy - r - 2, 3, 2, '#e0b13e');
  else rect(ctx, cx + r, cy - 1, 2, 2, '#e0b13e');
}

function whiskyArt(ctx: Ctx, w: number, h: number): void {
  const cx = Math.round(w / 2);
  const bw = Math.max(3, Math.round(w * 0.14));
  const top = Math.round(h * 0.12);
  const shoulder = Math.round(h * 0.38);
  const bottom = Math.round(h * 0.86);
  rect(ctx, cx - Math.round(bw * 1.4), Math.round(h * 0.2), Math.round(bw * 2.8), bottom - Math.round(h * 0.2), '#7a5a36');
  strokeRect(ctx, cx - Math.round(bw * 1.4), Math.round(h * 0.2), Math.round(bw * 2.8), bottom - Math.round(h * 0.2), '#3a2a18');
  rect(ctx, cx - 1, top, 3, shoulder - top, '#3a2416');
  rect(ctx, cx - bw, shoulder, bw * 2, bottom - shoulder, '#a8601a');
  rect(ctx, cx - bw + 1, shoulder + 1, Math.max(1, Math.round(bw / 2)), bottom - shoulder - 2, '#d8902a');
  rect(ctx, cx - bw, Math.round((shoulder + bottom) / 2) - 2, bw * 2, Math.max(3, Math.round(h * 0.16)), '#f4ead2');
  hline(ctx, cx - bw + 1, Math.round((shoulder + bottom) / 2), bw * 2 - 2, '#5a3a24');
  rect(ctx, cx - 1, top - 2, 3, 2, '#c8a050');
}

function porcelainArt(ctx: Ctx, w: number, h: number, rng: Rng): void {
  const cx = Math.round(w / 2);
  const body = Math.max(3, Math.round(w * 0.17));
  const cy = Math.round(h * 0.55);
  ellipse(ctx, cx, cy, body, Math.round(h * 0.26), '#f4f4f0');
  rect(ctx, cx - Math.max(1, Math.round(body / 2)), Math.round(h * 0.12), Math.max(2, body), Math.round(h * 0.2), '#f4f4f0');
  hline(ctx, cx - Math.max(1, Math.round(body / 2)) - 1, Math.round(h * 0.12), Math.max(2, body) + 2, '#e8e8e4');
  for (let i = 0; i < 6; i++) {
    const t = rng.float() * Math.PI * 2;
    const r = rng.float() * body * 0.8;
    circle(ctx, cx + Math.round(Math.cos(t) * r), cy + Math.round(Math.sin(t) * r * 1.2), Math.max(1, Math.round(h * 0.03)), '#2a4a9a');
  }
  for (let y = cy - Math.round(h * 0.2); y < cy + Math.round(h * 0.2); y += 3) px(ctx, cx + Math.round(Math.sin(y) * body * 0.6), y, '#3a5aaa');
  hline(ctx, cx - body + 1, cy + Math.round(h * 0.18), body * 2 - 2, '#2a4a9a');
  px(ctx, cx - body + 1, cy - 2, '#ffffff');
}

function bookArt(ctx: Ctx, w: number, h: number): void {
  const x0 = Math.round(w * 0.28);
  const x1 = Math.round(w * 0.72);
  const y0 = Math.round(h * 0.16);
  const y1 = Math.round(h * 0.84);
  rect(ctx, x0 + 2, y0 + 2, x1 - x0, y1 - y0, '#1a0e08');
  rect(ctx, x0, y0, x1 - x0, y1 - y0, '#6a2a1a');
  rect(ctx, x0, y0, 3, y1 - y0, '#4a1a10');
  strokeRect(ctx, x0 + 4, y0 + 2, x1 - x0 - 6, y1 - y0 - 4, '#c9a24a');
  rect(ctx, x0 + 6, Math.round(h * 0.35), x1 - x0 - 10, Math.max(2, Math.round(h * 0.08)), '#c9a24a');
  vline(ctx, Math.round((x0 + x1) / 2), y1, Math.round(h * 0.1), '#c8283a');
}

function jadeArt(ctx: Ctx, w: number, h: number, rng: Rng): void {
  const cx = Math.round(w / 2);
  const cy = Math.round(h * 0.5);
  const white = rng.float() < 0.4;
  const c = white ? '#e8e8d8' : '#3a9a6a';
  rect(ctx, cx - Math.round(w * 0.22), Math.round(h * 0.78), Math.round(w * 0.44), Math.max(2, Math.round(h * 0.08)), '#5a3a24');
  if (white) {
    // a carved mountain
    for (let x = -Math.round(w * 0.2); x <= Math.round(w * 0.2); x++) {
      const top = Math.round(h * 0.22 + Math.abs(Math.sin(x * 0.5)) * h * 0.2 + Math.abs(x) * 0.6);
      vline(ctx, cx + x, top, Math.round(h * 0.78) - top, x % 3 === 0 ? shade(c, -0.12) : c);
    }
  } else {
    ellipse(ctx, cx, cy, Math.round(w * 0.16), Math.round(h * 0.26), c);
    ellipse(ctx, cx, cy, Math.round(w * 0.05), Math.round(h * 0.08), '#14203a');
    for (let i = 0; i < 6; i++) px(ctx, cx + rng.int(-4, 4), cy + rng.int(-6, 6), shade(c, 0.3));
  }
}

// ------------------------------------------------------------------ public

export function drawPiece(ctx: Ctx, p: Art, w: number, h: number): void {
  const rng = new Rng(p.seed);
  switch (p.kind) {
    case 'painting':
      switch (p.genre) {
        case 'seascape':
          seascape(ctx, w, h, rng);
          break;
        case 'still':
          stillLife(ctx, w, h, rng);
          break;
        case 'portrait':
          portrait(ctx, w, h, rng);
          break;
        case 'abstract':
          abstract(ctx, w, h, rng);
          break;
        case 'city':
          city(ctx, w, h, rng);
          break;
        default:
          landscape(ctx, w, h, rng);
      }
      // the brushwork of an old master is finer than a new artist's
      brush(ctx, w, h, rng, p.tier === 'master' ? 0.06 : 0.1);
      break;
    case 'watch':
      velvet(ctx, w, h, rng);
      watchArt(ctx, w, h, !!p.title?.includes('怀表'));
      break;
    case 'whisky':
      velvet(ctx, w, h, rng);
      whiskyArt(ctx, w, h);
      break;
    case 'porcelain':
      velvet(ctx, w, h, rng);
      porcelainArt(ctx, w, h, rng);
      break;
    case 'book':
      velvet(ctx, w, h, rng);
      bookArt(ctx, w, h);
      break;
    case 'jade':
      velvet(ctx, w, h, rng);
      jadeArt(ctx, w, h, rng);
      break;
  }
}

/** Gold frame for paintings, a slim dark case for objects. */
function frame(ctx: Ctx, w: number, h: number, painting: boolean): void {
  if (painting) {
    strokeRect(ctx, 0, 0, w, h, '#6a4a10');
    strokeRect(ctx, 1, 1, w - 2, h - 2, '#e0b13e');
    strokeRect(ctx, 2, 2, w - 4, h - 4, '#a8801a');
    for (const [x, y] of [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]] as [number, number][]) px(ctx, x, y, '#fff2b0');
  } else {
    strokeRect(ctx, 0, 0, w, h, '#14121a');
    strokeRect(ctx, 1, 1, w - 2, h - 2, '#3a3640');
  }
}

const cache = new Map<string, string>();

/** The piece in its frame, as a data URL, `scale` pixels per art pixel. */
export function pieceUrl(p: Art & { id?: number }, small = false): string {
  const key = `${p.seed}:${p.kind}:${p.genre ?? ''}:${p.title ?? ''}:${small ? 's' : 'l'}`;
  let u = cache.get(key);
  if (!u) {
    u = pieceCanvas(p, small).toDataURL();
    cache.set(key, u);
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  }
  return u;
}

/** Framed canvas: full size (48 × 36 inside a 3 px frame) or small (24 × 18 for the easels). */
export function pieceCanvas(p: Art, small = false): HTMLCanvasElement {
  const w = small ? 24 : ART_W;
  const h = small ? 18 : ART_H;
  const f = small ? 2 : 3;
  const { canvas, ctx } = makeCanvas(w + f * 2, h + f * 2);
  const inner = makeCanvas(w, h);
  drawPiece(inner.ctx, p, w, h);
  ctx.drawImage(inner.canvas, f, f);
  if (small) {
    strokeRect(ctx, 0, 0, w + 4, h + 4, p.kind === 'painting' ? '#a8801a' : '#14121a');
    strokeRect(ctx, 1, 1, w + 2, h + 2, p.kind === 'painting' ? '#e0b13e' : '#3a3640');
  } else frame(ctx, w + f * 2, h + f * 2, p.kind === 'painting');
  return canvas;
}