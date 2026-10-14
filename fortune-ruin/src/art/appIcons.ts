import { circle, ellipse, hash2, hline, makeCanvas, mix, px, rect, shade, strokeRect, vline, type Ctx } from './canvas';

/**
 * Pictures for the home computer's desktop: 32 × 32 program icons and the
 * wallpaper (the harbour at night), drawn once and cached as data URLs.
 */
export type AppId = 'housing' | 'jobs' | 'invest' | 'bank' | 'life' | 'furniture' | 'payday' | 'business' | 'casino' | 'power';

const O = '#101018';
const W = '#ffffff';

const ICONS: Record<AppId, (c: Ctx) => void> = {
  housing: (c) => {
    // a town house with a sale sign
    for (let i = 0; i < 9; i++) hline(c, 15 - i * 1.5, 4 + i, 3 + i * 3, i === 0 ? O : '#b8432e');
    rect(c, 5, 13, 22, 14, O);
    rect(c, 6, 13, 20, 13, '#e8dcc0');
    rect(c, 13, 18, 6, 8, '#6a4428');
    px(c, 17, 22, '#e0b13e');
    rect(c, 8, 16, 4, 4, '#7ab8e8');
    rect(c, 20, 16, 4, 4, '#7ab8e8');
    rect(c, 22, 2, 3, 5, '#5a5a62');
    rect(c, 24, 22, 7, 6, O);
    rect(c, 25, 23, 5, 4, '#e8483a');
    hline(c, 26, 25, 3, W);
    vline(c, 27, 28, 3, O);
  },
  jobs: (c) => {
    // a briefcase
    rect(c, 11, 6, 10, 5, O);
    rect(c, 13, 7, 6, 3, '#d8d0c0');
    rect(c, 3, 10, 26, 18, O);
    rect(c, 4, 11, 24, 16, '#8a5a36');
    hline(c, 4, 11, 24, '#a8703f');
    hline(c, 4, 18, 24, '#5a3a22');
    rect(c, 14, 16, 4, 4, '#e0b13e');
    px(c, 15, 17, '#fff2b0');
  },
  invest: (c) => {
    // a rising chart on a screen
    rect(c, 2, 4, 28, 22, O);
    rect(c, 3, 5, 26, 20, '#0e1a2e');
    for (let x = 4; x < 28; x += 4) vline(c, x, 6, 18, '#1a2a44');
    for (let y = 8; y < 24; y += 4) hline(c, 4, y, 24, '#1a2a44');
    const ys = [21, 19, 20, 16, 17, 13, 11, 12, 8];
    for (let i = 0; i < ys.length - 1; i++) {
      const x0 = 4 + i * 3;
      for (let k = 0; k <= 3; k++) px(c, x0 + k, Math.round(ys[i] + ((ys[i + 1] - ys[i]) * k) / 3), '#59ff8a');
    }
    rect(c, 13, 27, 6, 2, O);
    hline(c, 9, 29, 14, O);
  },
  bank: (c) => {
    // a bank card
    rect(c, 2, 7, 28, 19, O);
    rect(c, 3, 8, 26, 17, '#2a4a8a');
    hline(c, 3, 8, 26, '#4a6ab8');
    rect(c, 3, 12, 26, 3, '#101018');
    rect(c, 6, 17, 5, 4, '#e0b13e');
    hline(c, 7, 19, 3, '#a8801a');
    for (let i = 0; i < 4; i++) rect(c, 14 + i * 4, 21, 3, 1, '#c8d4ec');
  },
  life: (c) => {
    // a concierge bell
    ellipse(c, 16, 25, 13, 3, O);
    ellipse(c, 16, 24, 12, 2, '#a8801a');
    for (let y = 0; y < 11; y++) {
      const half = Math.round(Math.sqrt(Math.max(0, 121 - (11 - y) ** 2)));
      hline(c, 16 - half, 12 + y, half * 2 + 1, y === 0 ? O : y < 3 ? '#f0d68a' : '#e0b13e');
    }
    rect(c, 15, 8, 3, 4, O);
    rect(c, 13, 7, 7, 2, '#c9a24a');
    px(c, 11, 16, '#fff6d0');
    px(c, 12, 15, '#fff6d0');
  },
  furniture: (c) => {
    // a sofa
    rect(c, 3, 10, 26, 16, O);
    rect(c, 4, 11, 24, 8, '#4a6a8a');
    rect(c, 4, 18, 24, 6, '#5a7a9a');
    hline(c, 4, 18, 24, '#7a9aba');
    rect(c, 2, 15, 5, 11, '#3e5a76');
    rect(c, 25, 15, 5, 11, '#3e5a76');
    vline(c, 16, 19, 5, '#4a6a8a');
    rect(c, 5, 26, 2, 3, O);
    rect(c, 25, 26, 2, 3, O);
  },
  payday: (c) => {
    // a phone with a coin and a warning badge
    rect(c, 8, 2, 16, 28, O);
    rect(c, 9, 4, 14, 22, '#e8483a');
    rect(c, 13, 27, 6, 2, '#5a5a62');
    circle(c, 16, 14, 5, O);
    circle(c, 16, 14, 4, '#e0b13e');
    vline(c, 16, 11, 7, '#a8801a');
    hline(c, 14, 12, 4, '#a8801a');
    hline(c, 14, 16, 4, '#a8801a');
    rect(c, 10, 21, 12, 2, W);
  },
  business: (c) => {
    // a shop front with a striped awning
    rect(c, 3, 12, 26, 17, O);
    rect(c, 4, 13, 24, 15, '#e8dcc0');
    for (let i = 0; i < 6; i++) rect(c, 2 + i * 5, 6, 5, 7, i % 2 ? W : '#2f7a5a');
    hline(c, 2, 13, 28, O);
    rect(c, 6, 16, 9, 12, '#6a4428');
    rect(c, 18, 16, 8, 7, '#7ab8e8');
    hline(c, 18, 19, 8, W);
    px(c, 13, 22, '#e0b13e');
  },
  casino: (c) => {
    // a member card with a diamond
    rect(c, 2, 7, 28, 19, O);
    rect(c, 3, 8, 26, 17, '#141218');
    strokeRect(c, 4, 9, 24, 15, '#a8801a');
    for (let i = 0; i < 6; i++) hline(c, 16 - i, 11 + i, i * 2 + 1, '#f3a6ff');
    for (let i = 0; i < 5; i++) hline(c, 12 + i, 17 + i, 9 - i * 2, '#c86ad8');
    px(c, 14, 13, W);
  },
  power: (c) => {
    circle(c, 16, 16, 12, O);
    circle(c, 16, 16, 11, '#c8283a');
    circle(c, 16, 17, 6, W);
    circle(c, 16, 17, 4, '#c8283a');
    rect(c, 14, 6, 5, 10, '#c8283a');
    rect(c, 15, 7, 3, 9, W);
  },
};

const urls = new Map<string, string>();

export function appIconUrl(id: AppId): string {
  let u = urls.get(id);
  if (!u) {
    const { canvas, ctx } = makeCanvas(32, 32);
    ICONS[id](ctx);
    u = canvas.toDataURL();
    urls.set(id, u);
  }
  return u;
}

/** The desktop picture: Greyhaven's harbour at night, 320 × 180, shown pixelated. */
export function wallpaperUrl(): string {
  let u = urls.get('wallpaper');
  if (u) return u;
  const Wd = 320;
  const Hd = 180;
  const { canvas, ctx } = makeCanvas(Wd, Hd);
  // sky in hard bands
  const bands = ['#0a1026', '#0e1630', '#131d3c', '#18244a', '#1f2c58', '#283466', '#343c70', '#463f72'];
  for (let i = 0; i < bands.length; i++) rect(ctx, 0, i * 15, Wd, 15, bands[i]);
  for (let i = 0; i < 70; i++) px(ctx, Math.floor(hash2(i, 1, 401) * Wd), Math.floor(hash2(1, i, 402) * 90), hash2(i, i, 403) < 0.2 ? '#ffffff' : '#8a96c8');
  circle(ctx, 258, 30, 10, '#f4ecd0');
  circle(ctx, 262, 27, 9, bands[1]);
  // far towers, near towers
  const layer = (seed: number, base: number, color: string, lit: number) => {
    let x = 0;
    while (x < Wd) {
      const w = 10 + Math.floor(hash2(x, seed, 404) * 22);
      const h = 18 + Math.floor(hash2(seed, x, 405) * 46);
      rect(ctx, x, base - h, w, h, color);
      for (let wy = base - h + 3; wy < base - 2; wy += 4)
        for (let wx = x + 2; wx < x + w - 2; wx += 3) if (hash2(wx, wy, seed) < lit) rect(ctx, wx, wy, 1, 2, hash2(wy, wx, seed) < 0.6 ? '#ffd88a' : '#ffbe6a');
      x += w + Math.floor(hash2(x, seed, 406) * 4);
    }
  };
  layer(1, 128, '#1a2040', 0.25);
  layer(2, 136, '#10142a', 0.4);
  // the casino tower in the middle, its crown lit
  rect(ctx, 148, 58, 26, 78, '#14102a');
  rect(ctx, 152, 52, 18, 8, '#e0b13e');
  rect(ctx, 156, 46, 10, 6, '#ff4fa3');
  for (let wy = 64; wy < 132; wy += 5) for (let wx = 151; wx < 172; wx += 4) if (hash2(wx, wy, 9) < 0.55) rect(ctx, wx, wy, 2, 2, '#ffd88a');
  // the harbour and the reflections
  rect(ctx, 0, 136, Wd, 44, '#0a1020');
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(hash2(i, 7, 407) * Wd);
    const y = 140 + Math.floor(hash2(7, i, 408) * 38);
    hline(ctx, x, y, 2 + Math.floor(hash2(i, 9, 409) * 6), hash2(i, 3, 410) < 0.5 ? '#2a3a6a' : mix('#ffd88a', '#0a1020', 0.55));
  }
  hline(ctx, 0, 136, Wd, shade('#0a1020', 0.2));
  u = canvas.toDataURL();
  urls.set('wallpaper', u);
  return u;
}
