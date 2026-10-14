import { circle, ellipse, hline, makeCanvas, mix, px, rect, shade, strokeRect, vline, type Ctx } from './canvas';
import { ITEMS } from '../data/items';

/**
 * 16 × 16 pixel icons for everything the player can buy, drawn once and
 * cached as data URLs for the interface (shown at 2× or 3×).
 */
export const ICON = 16;

const O = '#2a1f2e';
const WHITE = '#f4f1ea';
const GLASS = '#cfe6f2';
const GLASS_D = '#9cbccc';

type Draw = (ctx: Ctx) => void;

// ------------------------------------------------------------------ shared shapes

function plate(ctx: Ctx): void {
  ellipse(ctx, 8, 12, 7, 2, O);
  ellipse(ctx, 8, 11, 7, 2, '#e8e4dc');
  ellipse(ctx, 8, 11, 5, 1, WHITE);
}

function mug(ctx: Ctx, body: string, drink: string, foam?: string): void {
  rect(ctx, 3, 5, 9, 9, O);
  rect(ctx, 4, 6, 7, 7, body);
  vline(ctx, 4, 6, 7, shade(body, 0.2));
  rect(ctx, 12, 7, 2, 1, O);
  rect(ctx, 13, 8, 1, 3, O);
  rect(ctx, 12, 11, 2, 1, O);
  hline(ctx, 4, 6, 7, foam ?? drink);
  if (foam) {
    px(ctx, 6, 6, shade(foam, -0.15));
    px(ctx, 8, 6, drink);
  }
}

function glassStem(ctx: Ctx, fill: string, level: number, shape: 'wine' | 'flute' | 'martini'): void {
  if (shape === 'martini') {
    for (let i = 0; i < 6; i++) hline(ctx, 2 + i, 3 + i, 12 - i * 2, i === 0 ? O : i < 6 - level ? GLASS : fill);
    px(ctx, 2, 3, O);
    px(ctx, 13, 3, O);
    vline(ctx, 8, 9, 4, O);
    hline(ctx, 5, 13, 6, O);
    return;
  }
  const w = shape === 'flute' ? 2 : 3;
  const top = shape === 'flute' ? 1 : 3;
  const bottom = shape === 'flute' ? 9 : 8;
  rect(ctx, 8 - w - 1, top, w * 2 + 2, bottom - top + 1, O);
  rect(ctx, 8 - w, top, w * 2, bottom - top, GLASS);
  rect(ctx, 8 - w, bottom - level, w * 2, level, fill);
  px(ctx, 8 - w, top + 1, '#ffffff');
  vline(ctx, 8, bottom + 1, 3, O);
  hline(ctx, 5, 13, 6, O);
  hline(ctx, 6, 12, 4, GLASS_D);
}

function tumbler(ctx: Ctx, fill: string, ice: boolean): void {
  rect(ctx, 3, 6, 10, 8, O);
  rect(ctx, 4, 6, 8, 7, GLASS);
  rect(ctx, 4, 9, 8, 4, fill);
  hline(ctx, 4, 9, 8, shade(fill, 0.25));
  if (ice) {
    rect(ctx, 5, 8, 3, 3, '#eef8fc');
    rect(ctx, 8, 9, 3, 2, '#e2f2fa');
  }
  px(ctx, 4, 7, '#ffffff');
}

function bottle(ctx: Ctx, color: string, label: string, foil?: string): void {
  rect(ctx, 6, 1, 4, 4, O);
  rect(ctx, 7, 1, 2, 4, foil ?? color);
  rect(ctx, 4, 5, 8, 10, O);
  rect(ctx, 5, 5, 6, 9, color);
  vline(ctx, 5, 6, 8, shade(color, 0.3));
  rect(ctx, 5, 8, 6, 4, label);
  hline(ctx, 6, 9, 4, shade(label, -0.35));
}

function can(ctx: Ctx, color: string, band: string): void {
  rect(ctx, 4, 3, 8, 12, O);
  rect(ctx, 5, 3, 6, 11, color);
  rect(ctx, 5, 3, 6, 1, '#c8ccd4');
  rect(ctx, 5, 13, 6, 1, '#a8acb4');
  rect(ctx, 5, 7, 6, 3, band);
  vline(ctx, 5, 4, 9, shade(color, 0.25));
}

function giftBox(ctx: Ctx, color: string, ribbon: string): void {
  rect(ctx, 2, 6, 12, 9, O);
  rect(ctx, 3, 7, 10, 7, color);
  rect(ctx, 2, 5, 12, 3, O);
  rect(ctx, 3, 5, 10, 2, shade(color, 0.15));
  vline(ctx, 7, 5, 9, ribbon);
  vline(ctx, 8, 5, 9, ribbon);
  rect(ctx, 5, 2, 3, 3, ribbon);
  rect(ctx, 8, 2, 3, 3, ribbon);
  px(ctx, 6, 3, shade(ribbon, -0.3));
  px(ctx, 9, 3, shade(ribbon, -0.3));
}

function book(ctx: Ctx, cover: string, mark: (ctx: Ctx) => void): void {
  rect(ctx, 3, 1, 11, 14, O);
  rect(ctx, 4, 2, 9, 12, cover);
  vline(ctx, 4, 2, 12, shade(cover, -0.3));
  rect(ctx, 5, 13, 8, 1, WHITE);
  hline(ctx, 6, 4, 6, shade(cover, 0.35));
  mark(ctx);
}

function car(ctx: Ctx, color: string, low: boolean, long: boolean): void {
  const y = low ? 7 : 5;
  const x0 = long ? 0 : 1;
  const x1 = long ? 15 : 14;
  rect(ctx, x0, y + 3, x1 - x0 + 1, 4, O);
  rect(ctx, x0 + 1, y + 3, x1 - x0 - 1, 3, color);
  rect(ctx, x0 + (low ? 4 : 3), y, x1 - x0 - (low ? 7 : 5), 4, O);
  rect(ctx, x0 + (low ? 5 : 4), y + 1, x1 - x0 - (low ? 9 : 7), 2, GLASS);
  hline(ctx, x0 + 1, y + 3, x1 - x0 - 1, shade(color, 0.3));
  for (const wx of [x0 + 3, x1 - 3]) {
    circle(ctx, wx, 13, 2, O);
    px(ctx, wx, 13, '#8a8a92');
  }
  px(ctx, x1 - 1, y + 4, '#ffe48a');
}

// ------------------------------------------------------------------ the icons

const ICONS: Record<string, Draw> = {
  // convenience store
  instant_noodles: (c) => {
    rect(c, 3, 4, 10, 11, O);
    rect(c, 4, 5, 8, 9, '#e8483a');
    rect(c, 4, 8, 8, 3, WHITE);
    hline(c, 5, 9, 6, '#e8b04a');
    rect(c, 3, 3, 10, 2, '#d8d4cc');
    hline(c, 3, 3, 10, O);
  },
  rice_ball: (c) => {
    for (let i = 0; i < 6; i++) hline(c, 8 - i - 1, 4 + i, i * 2 + 2, i === 0 ? O : WHITE);
    rect(c, 2, 10, 12, 4, WHITE);
    hline(c, 2, 14, 12, O);
    rect(c, 5, 10, 6, 4, '#1e2a22');
    px(c, 8, 6, '#e8e4dc');
  },
  sandwich: (c) => {
    for (let i = 0; i < 8; i++) hline(c, 2 + i, 4 + i, 12 - i, i === 0 ? O : '#e8c890');
    hline(c, 4, 9, 9, '#5fa24c');
    hline(c, 5, 10, 8, '#e04a5a');
    hline(c, 2, 12, 12, O);
    hline(c, 3, 11, 10, '#d8b070');
  },
  chocolate: (c) => {
    rect(c, 2, 4, 12, 9, O);
    rect(c, 3, 5, 10, 7, '#6a3a22');
    for (let x = 5; x < 13; x += 3) vline(c, x, 5, 7, '#4a2614');
    hline(c, 3, 8, 10, '#4a2614');
    rect(c, 3, 9, 5, 3, '#c8283a');
    px(c, 4, 5, '#8a5a3a');
  },
  croissant: (c) => {
    plate(c);
    for (let i = 0; i < 5; i++) ellipse(c, 4 + i * 2, 8 - (i === 2 ? 1 : 0), 2, 2, i % 2 ? '#e0a050' : '#c8803a');
    hline(c, 3, 10, 10, '#a8602a');
  },
  bagel: (c) => {
    plate(c);
    ellipse(c, 8, 8, 6, 3, '#b8743a');
    ellipse(c, 8, 7, 6, 2, '#d8a060');
    hline(c, 3, 8, 10, '#5fa24c');
    ellipse(c, 8, 7, 1, 1, '#a86030');
  },
  cheesecake: (c) => {
    plate(c);
    rect(c, 4, 5, 8, 6, O);
    rect(c, 5, 6, 6, 4, '#f4e2a8');
    hline(c, 5, 9, 6, '#c8944a');
    rect(c, 5, 5, 6, 1, '#d83a4a');
    px(c, 8, 4, '#c8283a');
  },
  homemade_cookies: (c) => {
    rect(c, 1, 7, 14, 7, O);
    rect(c, 2, 8, 12, 5, '#c8a878');
    for (const x of [4, 8, 12]) {
      circle(c, x, 7, 2, '#d8a050');
      px(c, x - 1, 6, '#5a3020');
      px(c, x + 1, 8, '#5a3020');
    }
    hline(c, 2, 11, 12, '#e8483a');
  },
  lunch_set: (c) => {
    rect(c, 1, 4, 14, 10, O);
    rect(c, 2, 5, 12, 8, '#8a4a2a');
    rect(c, 3, 6, 5, 6, WHITE);
    rect(c, 9, 6, 4, 3, '#5fa24c');
    rect(c, 9, 10, 4, 2, '#e8b04a');
    rect(c, 4, 7, 3, 3, '#e8e0d0');
  },
  pasta: (c) => {
    plate(c);
    ellipse(c, 8, 8, 5, 3, '#e8c870');
    for (let i = 0; i < 4; i++) hline(c, 4 + i, 6 + i, 8 - i, i % 2 ? '#f0d890' : '#d8b058');
    circle(c, 7, 8, 1, '#c8283a');
    px(c, 10, 7, '#5fa24c');
  },
  steak_dinner: (c) => {
    plate(c);
    ellipse(c, 7, 8, 4, 3, '#6a2a1a');
    ellipse(c, 7, 7, 3, 2, '#8a3a24');
    hline(c, 5, 7, 4, '#4a1a10');
    rect(c, 11, 7, 2, 2, '#e8b04a');
    px(c, 12, 9, '#5fa24c');
  },
  dessert: (c) => {
    plate(c);
    rect(c, 3, 6, 4, 4, '#6a3a22');
    circle(c, 10, 8, 2, '#f8b8c8');
    circle(c, 12, 6, 1, '#b8e0c8');
    px(c, 4, 5, '#e8483a');
  },
  bar_snacks: (c) => {
    ellipse(c, 8, 11, 7, 3, O);
    ellipse(c, 8, 10, 6, 2, '#3a2a20');
    for (const [x, y] of [[5, 8], [8, 7], [11, 8], [6, 9], [10, 9], [8, 9]] as [number, number][]) rect(c, x, y, 2, 1, '#e0b060');
  },
  club_sandwich: (c) => {
    for (let k = 0; k < 2; k++) {
      const ox = k * 6;
      rect(c, 1 + ox, 5, 6, 8, O);
      rect(c, 2 + ox, 6, 4, 6, '#e8c890');
      hline(c, 2 + ox, 8, 4, '#5fa24c');
      hline(c, 2 + ox, 10, 4, '#e8b0a0');
      vline(c, 4 + ox, 2, 4, '#c8a050');
    }
  },
  tasting_menu: (c) => {
    plate(c);
    ellipse(c, 8, 9, 3, 1, '#8a3a24');
    for (const [x, y, col] of [[6, 7, '#5fa24c'], [9, 7, '#e8b04a'], [8, 6, '#c8283a']] as [number, number, string][]) px(c, x, y, col);
    for (let i = 0; i < 4; i++) px(c, 4 + i * 3, 11, '#d8c088');
    vline(c, 14, 3, 9, '#b8b8c0');
    vline(c, 1, 3, 9, '#b8b8c0');
  },
  sky_canapes: (c) => {
    rect(c, 1, 9, 14, 4, O);
    rect(c, 2, 10, 12, 2, '#3a3448');
    for (const [x, col] of [[3, '#e8c890'], [7, '#d8e8f0'], [11, '#f0b0a0']] as [number, string][]) {
      rect(c, x, 7, 3, 3, col);
      px(c, x + 1, 6, '#5fa24c');
    }
  },
  sky_hot: (c) => {
    rect(c, 2, 4, 12, 10, O);
    ellipse(c, 8, 8, 5, 3, '#b8bcc4');
    ellipse(c, 8, 7, 5, 2, '#e2e6ec');
    px(c, 8, 4, '#8a8f98');
    vline(c, 5, 1, 2, '#d0d0d0');
    vline(c, 10, 0, 2, '#d0d0d0');
    rect(c, 3, 11, 10, 2, '#8a8f98');
  },
  sky_dessert: (c) => {
    plate(c);
    for (let i = 0; i < 4; i++) rect(c, 3 + i * 3, 7, 2, 2, ['#f8b8c8', '#b8e0c8', '#f8e0a0', '#c8b8f0'][i]);
    rect(c, 6, 4, 4, 2, '#f2d8c8');
    px(c, 8, 3, '#c2283a');
  },
  // drinks
  water: (c) => {
    rect(c, 6, 1, 4, 2, '#3a7ab8');
    rect(c, 5, 3, 6, 12, O);
    rect(c, 6, 4, 4, 10, '#bfe0f0');
    rect(c, 6, 7, 4, 3, '#5a9ad8');
    px(c, 6, 4, '#ffffff');
  },
  canned_coffee: (c) => can(c, '#5a3a22', '#e8d8b8'),
  energy_drink: (c) => can(c, '#2a2a34', '#59ff8a'),
  beer_can: (c) => can(c, '#c8a830', '#2a4a8a'),
  espresso: (c) => {
    ellipse(c, 8, 12, 6, 2, O);
    ellipse(c, 8, 12, 5, 1, WHITE);
    rect(c, 5, 7, 6, 5, O);
    rect(c, 6, 7, 4, 4, WHITE);
    hline(c, 6, 7, 4, '#4a2a18');
    rect(c, 11, 8, 1, 2, O);
    vline(c, 7, 3, 3, '#d0ccc4');
    vline(c, 9, 2, 3, '#d0ccc4');
  },
  latte: (c) => {
    // a glass of layered coffee and milk with a little heart on the foam
    rect(c, 3, 4, 9, 11, O);
    rect(c, 4, 5, 7, 9, '#f2e6d0');
    rect(c, 4, 9, 7, 5, '#b07a4a');
    hline(c, 4, 9, 7, '#c89060');
    rect(c, 4, 5, 7, 2, '#fbf4e6');
    px(c, 6, 5, '#b07a4a');
    px(c, 8, 5, '#b07a4a');
    px(c, 7, 6, '#b07a4a');
    rect(c, 12, 7, 2, 1, O);
    rect(c, 13, 8, 1, 3, O);
    rect(c, 12, 11, 2, 1, O);
  },
  house_wine: (c) => glassStem(c, '#8a1a2a', 3, 'wine'),
  draft_beer: (c) => {
    mug(c, '#e8b030', '#e8b030', '#ffffff');
    rect(c, 4, 5, 7, 2, '#ffffff');
    px(c, 6, 9, '#f8d870');
    px(c, 8, 11, '#f8d870');
  },
  cocktail: (c) => {
    glassStem(c, '#ff8fb8', 4, 'martini');
    circle(c, 12, 3, 1, '#59c05a');
  },
  whiskey: (c) => tumbler(c, '#c8782a', true),
  soda: (c) => {
    tumbler(c, '#e8f4e8', true);
    vline(c, 10, 2, 6, '#e8483a');
  },
  casino_cocktail: (c) => {
    glassStem(c, '#ff4fa3', 4, 'martini');
    px(c, 12, 2, '#ffe45c');
    px(c, 13, 3, '#ffe45c');
  },
  champagne: (c) => {
    glassStem(c, '#f2d870', 6, 'flute');
    px(c, 7, 4, '#ffffff');
    px(c, 9, 6, '#ffffff');
  },
  mineral_water: (c) => {
    rect(c, 6, 1, 4, 2, '#3a3a40');
    rect(c, 5, 3, 6, 12, O);
    rect(c, 6, 4, 4, 10, '#7ab88a');
    rect(c, 6, 7, 4, 3, '#e8e4dc');
    px(c, 6, 4, '#bfe8c8');
  },
  wine_pairing: (c) => {
    glassStem(c, '#8a1a2a', 3, 'wine');
    px(c, 3, 2, '#e8d070');
  },
  club_scotch: (c) => tumbler(c, '#a8601e', false),
  sky_tea: (c) => {
    ellipse(c, 8, 13, 7, 2, O);
    ellipse(c, 8, 13, 6, 1, '#e8e4dc');
    rect(c, 3, 6, 9, 6, O);
    rect(c, 4, 7, 7, 4, '#f4f1ea');
    hline(c, 4, 7, 7, '#a8602a');
    hline(c, 4, 10, 7, '#c9a24a');
    rect(c, 12, 7, 2, 3, O);
    vline(c, 6, 2, 3, '#d0ccc4');
    vline(c, 9, 3, 3, '#d0ccc4');
  },
  sky_cocktail: (c) => {
    glassStem(c, '#e8f0c8', 4, 'martini');
    for (const x of [4, 7, 10]) px(c, x, 4, '#f0c840');
  },
  sky_whisky: (c) => {
    tumbler(c, '#8a4a14', true);
    hline(c, 3, 5, 10, '#c9a24a');
  },
  // groceries and odds and ends
  groceries_basic: (c) => {
    rect(c, 2, 5, 12, 10, O);
    rect(c, 3, 6, 10, 8, '#c8a878');
    rect(c, 4, 2, 3, 4, '#e8c060');
    rect(c, 8, 1, 2, 5, '#5fa24c');
    rect(c, 10, 3, 3, 3, '#e8483a');
    hline(c, 3, 9, 10, '#a8885a');
  },
  groceries_fresh: (c) => {
    rect(c, 2, 5, 12, 10, O);
    rect(c, 3, 6, 10, 8, '#d8c8a0');
    for (const [x, y, col] of [[4, 2, '#5fa24c'], [6, 1, '#3f7a38'], [9, 2, '#e8483a'], [11, 3, '#f0a030']] as [number, number, string][]) rect(c, x, y, 2, 4, col);
    hline(c, 3, 9, 10, '#b8a880');
  },
  painkillers: (c) => {
    rect(c, 2, 4, 12, 9, O);
    rect(c, 3, 5, 10, 7, WHITE);
    rect(c, 7, 6, 2, 5, '#e8483a');
    rect(c, 5, 8, 6, 1, '#e8483a');
  },
  strategy_card: (c) => {
    rect(c, 3, 1, 10, 14, O);
    rect(c, 4, 2, 8, 12, '#1f6e46');
    for (let y = 3; y < 13; y += 2) for (let x = 5; x < 11; x += 2) px(c, x, y, (x + y) % 4 === 0 ? '#e8483a' : (x + y) % 3 === 0 ? '#e8e4dc' : '#ffe45c');
  },
  // gifts
  wine_bottle: (c) => bottle(c, '#4a1420', '#e8e0d0', '#8a1a2a'),
  flowers: (c) => {
    for (const [x, y, col] of [[5, 3, '#e8486a'], [9, 2, '#f2c94c'], [11, 5, '#b46bff'], [7, 5, '#ff8fb8'], [4, 6, '#f4f1ea']] as [number, number, string][]) {
      circle(c, x, y, 2, col);
      px(c, x, y, shade(col, -0.25));
    }
    for (let i = 0; i < 5; i++) px(c, 7 + (i % 2), 8 + i, '#3f7a38');
    for (let i = 0; i < 4; i++) hline(c, 5 + i, 9 + i, 6 - i * 2 > 0 ? 6 - i * 2 : 1, '#d8c8a8');
    rect(c, 6, 13, 4, 2, '#d8c8a8');
  },
  coffee_beans: (c) => {
    rect(c, 3, 3, 10, 12, O);
    rect(c, 4, 4, 8, 10, '#8a6a4a');
    rect(c, 4, 7, 8, 4, '#e8dcc0');
    ellipse(c, 8, 9, 2, 1, '#4a2a18');
    vline(c, 8, 8, 3, '#e8dcc0');
    rect(c, 6, 2, 4, 2, '#5a3a22');
  },
  perfume: (c) => {
    rect(c, 7, 1, 2, 3, '#c9a24a');
    rect(c, 6, 3, 4, 1, O);
    rect(c, 3, 4, 10, 10, O);
    rect(c, 4, 5, 8, 8, '#e8b8d8');
    rect(c, 5, 6, 6, 6, '#f8d8ec');
    px(c, 5, 6, '#ffffff');
    hline(c, 6, 10, 4, '#c9a24a');
  },
  cufflinks: (c) => {
    for (const x of [4, 11]) {
      circle(c, x, 7, 3, O);
      circle(c, x, 7, 2, '#c8ccd4');
      px(c, x - 1, 6, '#ffffff');
      px(c, x, 7, '#3a5a9a');
      vline(c, x, 10, 3, '#8a8f98');
    }
  },
  concert_tickets: (c) => {
    rect(c, 1, 5, 13, 7, O);
    rect(c, 2, 6, 11, 5, '#e8c860');
    rect(c, 3, 3, 13, 7, O);
    rect(c, 4, 4, 11, 5, '#f4e8c0');
    vline(c, 6, 4, 5, '#c8a050');
    for (let i = 0; i < 3; i++) px(c, 9 + i, 6 - (i % 2), '#2a1f2e');
    vline(c, 11, 5, 2, '#2a1f2e');
  },
  champagne_bottle: (c) => bottle(c, '#1e3a2a', '#e8d8a0', '#e0b13e'),
  praline_box: (c) => giftBox(c, '#5a2a1a', '#e0b13e'),
  silk_scarf: (c) => {
    for (let i = 0; i < 10; i++) hline(c, 2 + (i % 2), 3 + i, 12, i % 3 === 0 ? '#2a4a8a' : i % 3 === 1 ? '#3a6ab8' : '#e8d8b0');
    strokeRect(c, 1, 2, 14, 12, O);
    px(c, 14, 13, '#e0b13e');
    px(c, 13, 14, '#e0b13e');
  },
  // the Grand Hotel's lounge
  afternoon_tea: (c) => {
    // a three-tier stand
    vline(c, 8, 1, 13, O);
    for (const [y, w] of [[4, 6], [8, 9], [12, 12]] as [number, number][]) {
      hline(c, 8 - Math.floor(w / 2), y, w, O);
      hline(c, 8 - Math.floor(w / 2) + 1, y - 1, w - 2, WHITE);
    }
    px(c, 6, 2, '#e87aa0');
    px(c, 9, 2, '#f2c94c');
    px(c, 5, 6, '#c8904a');
    px(c, 10, 6, '#e8483a');
    px(c, 4, 10, '#5fa24c');
    px(c, 12, 10, '#e8c870');
    px(c, 8, 0, '#e0b13e');
  },
  darjeeling: (c) => {
    ellipse(c, 7, 10, 5, 4, O);
    ellipse(c, 7, 10, 4, 3, WHITE);
    hline(c, 4, 9, 7, '#c8a050');
    rect(c, 6, 4, 3, 2, O);
    rect(c, 12, 8, 3, 1, O);
    px(c, 14, 7, O);
    rect(c, 1, 8, 2, 3, O);
    hline(c, 3, 14, 9, '#c8ccd4');
  },
  pour_over: (c) => {
    for (let i = 0; i < 4; i++) hline(c, 3 + i, 2 + i, 10 - i * 2, i === 0 ? O : '#e8e4dc');
    rect(c, 6, 6, 4, 1, '#8a5a36');
    rect(c, 4, 8, 8, 6, O);
    rect(c, 5, 9, 6, 4, GLASS);
    rect(c, 5, 11, 6, 2, '#6a3a1a');
    px(c, 8, 7, '#6a3a1a');
  },
  opera_cake: (c) => {
    plate(c);
    rect(c, 4, 5, 8, 6, O);
    for (let i = 0; i < 5; i++) hline(c, 5, 6 + i, 6, i % 2 ? '#c8904a' : '#3a2416');
    hline(c, 5, 5, 6, '#2a1a10');
    px(c, 7, 5, '#e0b13e');
    px(c, 9, 5, '#e0b13e');
  },
  // the night market
  nm_noodles: (c) => {
    plate(c);
    ellipse(c, 8, 8, 5, 3, '#7a4a22');
    for (let i = 0; i < 4; i++) hline(c, 4 + i, 6 + i, 8 - i, i % 2 ? '#e8c078' : '#c8904a');
    px(c, 6, 7, '#4a8a3a');
    px(c, 10, 8, '#4a8a3a');
    rect(c, 9, 6, 2, 1, '#8a3a22');
  },
  nm_omelette: (c) => {
    plate(c);
    ellipse(c, 8, 8, 6, 3, '#e8b84a');
    ellipse(c, 8, 8, 4, 2, '#f0d070');
    for (const [x, y] of [[5, 8], [9, 7], [11, 9]] as [number, number][]) px(c, x, y, '#8a7a6a');
    px(c, 7, 9, '#c8283a');
    px(c, 10, 6, '#4a8a3a');
  },
  nm_skewers: (c) => {
    for (let i = 0; i < 3; i++) {
      const x = 4 + i * 3;
      vline(c, x + 1, 2, 13, O);
      vline(c, x + 1, 3, 11, '#c9a26a');
      for (let k = 0; k < 3; k++) {
        rect(c, x, 4 + k * 3, 3, 2, O);
        px(c, x + 1, 4 + k * 3, k === 1 ? '#5a8a3a' : '#a8402a');
        px(c, x + 1, 5 + k * 3, k === 1 ? '#3a6a2a' : '#7a2a1a');
      }
    }
  },
  nm_fishballs: (c) => {
    vline(c, 8, 1, 14, O);
    vline(c, 8, 2, 12, '#c9a26a');
    for (let k = 0; k < 4; k++) {
      circle(c, 8, 4 + k * 3, 2, O);
      circle(c, 8, 4 + k * 3, 1, '#e8b84a');
      px(c, 7, 3 + k * 3, '#f8e0a0');
    }
  },
  nm_sweet_soup: (c) => {
    ellipse(c, 8, 12, 6, 2, O);
    rect(c, 2, 7, 12, 5, O);
    rect(c, 3, 7, 10, 4, '#f4f1ea');
    ellipse(c, 8, 7, 6, 2, O);
    ellipse(c, 8, 7, 5, 1, '#8a2a2a');
    px(c, 6, 7, '#c8483a');
    px(c, 10, 7, '#5a1a1a');
    rect(c, 11, 2, 1, 5, '#c8ccd4');
  },
  nm_milk_tea: (c) => {
    rect(c, 4, 3, 8, 12, O);
    rect(c, 5, 4, 6, 10, '#c8925a');
    rect(c, 5, 4, 6, 2, '#e8c8a0');
    vline(c, 5, 6, 8, '#d8a870');
    rect(c, 12, 6, 2, 1, O);
    rect(c, 13, 7, 1, 3, O);
    rect(c, 12, 10, 2, 1, O);
  },
  nm_beer: (c) => bottle(c, '#3a7a3a', '#e8d8a0', '#c8ccd4'),
  hair_clip: (c) => {
    rect(c, 2, 7, 12, 3, O);
    rect(c, 3, 8, 10, 1, '#c8ccd4');
    for (const x of [4, 7, 10]) {
      circle(c, x + 1, 6, 2, O);
      circle(c, x + 1, 6, 1, '#f4f1ea');
      px(c, x, 5, '#ffffff');
    }
    px(c, 13, 9, '#a8acb4');
  },
  vinyl_record: (c) => {
    rect(c, 1, 2, 12, 12, O);
    rect(c, 2, 3, 10, 10, '#c8483a');
    hline(c, 3, 5, 6, '#f4e8c0');
    hline(c, 3, 7, 4, '#f4e8c0');
    circle(c, 10, 9, 5, O);
    circle(c, 10, 9, 4, '#1a1a1e');
    circle(c, 10, 9, 2, '#e0b13e');
    px(c, 10, 9, O);
    px(c, 8, 7, '#4a4a52');
  },
  guitar_used: (c) => {
    vline(c, 11, 1, 6, O);
    vline(c, 12, 1, 6, O);
    rect(c, 11, 1, 2, 2, '#5a3a24');
    vline(c, 11, 3, 4, '#c9a26a');
    circle(c, 7, 11, 4, O);
    circle(c, 7, 11, 3, '#c8803a');
    circle(c, 9, 8, 3, O);
    circle(c, 9, 8, 2, '#c8803a');
    circle(c, 7, 11, 1, '#3a2416');
    hline(c, 5, 13, 4, '#7a4a22');
    px(c, 10, 7, '#e8a85a');
  },
  // the community kitchen
  kitchen_meal: (c) => {
    rect(c, 1, 9, 14, 5, O);
    rect(c, 2, 9, 12, 4, '#c4c7cc');
    hline(c, 2, 9, 12, '#e4e6ea');
    ellipse(c, 5, 9, 3, 2, '#f4f1ea');
    ellipse(c, 11, 9, 3, 2, '#a8502a');
    px(c, 10, 8, '#e8a85a');
    px(c, 12, 9, '#5a8a3a');
    rect(c, 6, 3, 5, 5, O);
    rect(c, 7, 4, 3, 3, '#e8c870');
    hline(c, 7, 4, 3, '#f0d890');
  },
  basketball: (c) => {
    circle(c, 8, 8, 6, O);
    circle(c, 8, 8, 5, '#e07a2a');
    vline(c, 8, 3, 11, O);
    hline(c, 3, 8, 11, O);
    px(c, 5, 5, '#f0a050');
  },
  // books
  book_finance: (c) => book(c, '#2a6a4a', (k) => {
    rect(k, 7, 7, 4, 4, '#e0b13e');
    px(k, 8, 8, '#2a6a4a');
  }),
  book_career: (c) => book(c, '#2a4a8a', (k) => {
    for (let i = 0; i < 4; i++) vline(k, 6 + i * 2, 10 - i, 1 + i, '#e8e4dc');
  }),
  book_social: (c) => book(c, '#a8324a', (k) => {
    rect(k, 6, 7, 5, 3, WHITE);
    px(k, 7, 10, WHITE);
  }),
  book_cards: (c) => book(c, '#1a1a24', (k) => {
    px(k, 8, 7, '#e8483a');
    px(k, 7, 8, '#e8483a');
    px(k, 9, 8, '#e8483a');
    px(k, 8, 9, '#e8483a');
    px(k, 7, 7, '#e8483a');
    px(k, 9, 7, '#e8483a');
  }),
  // valuables
  watch_basic: (c) => {
    rect(c, 6, 1, 4, 14, '#3a3a40');
    circle(c, 8, 8, 4, O);
    circle(c, 8, 8, 3, '#e8e4dc');
    vline(c, 8, 6, 2, O);
    hline(c, 8, 8, 2, O);
  },
  watch_luxury: (c) => {
    rect(c, 6, 1, 4, 14, '#c9a24a');
    for (let y = 2; y < 15; y += 2) hline(c, 6, y, 4, '#a8802a');
    circle(c, 8, 8, 4, O);
    circle(c, 8, 8, 3, '#1e2846');
    px(c, 8, 6, '#f0d68a');
    px(c, 9, 8, '#f0d68a');
    ring(c);
  },
  jewelry: (c) => {
    // a gold necklace in an open velvet box
    rect(c, 1, 2, 14, 13, O);
    rect(c, 2, 3, 12, 4, '#5a1426');
    rect(c, 2, 7, 12, 7, '#8a1e36');
    hline(c, 2, 7, 12, '#c9a24a');
    for (let i = 0; i < 9; i++) px(c, 4 + i, 8 + Math.round(Math.sin((i / 8) * Math.PI) * 3), '#f0c84a');
    circle(c, 8, 12, 1, '#e8486a');
    px(c, 8, 11, '#ffffff');
  },
  // vehicles
  bicycle: (c) => {
    for (const x of [4, 12]) {
      circle(c, x, 11, 3, O);
      circle(c, x, 11, 2, '#f0f0f0');
      px(c, x, 11, O);
    }
    hline(c, 4, 11, 4, '#3a7ab8');
    for (let i = 0; i < 5; i++) px(c, 6 + i, 10 - i * 0.6, '#3a7ab8');
    vline(c, 11, 5, 6, '#3a7ab8');
    hline(c, 10, 5, 3, O);
    hline(c, 5, 6, 3, O);
  },
  used_car: (c) => car(c, '#8a9a7a', false, false),
  sedan: (c) => car(c, '#3a5a8a', false, true),
  sports_car: (c) => car(c, '#c8283a', true, true),
  luxury_car: (c) => car(c, '#1a1a24', false, true),
  // furniture (delivered at home)
  furn_bed_good: (c) => {
    rect(c, 1, 6, 14, 8, O);
    rect(c, 2, 7, 12, 6, '#e8e4dc');
    rect(c, 2, 9, 12, 4, '#5a7ab8');
    rect(c, 3, 7, 4, 2, WHITE);
    rect(c, 1, 3, 2, 11, '#8a5a36');
  },
  furn_bed_luxury: (c) => {
    rect(c, 1, 5, 14, 9, O);
    rect(c, 2, 6, 12, 7, WHITE);
    rect(c, 2, 9, 12, 4, '#2a2a4a');
    hline(c, 2, 12, 12, '#c9a24a');
    rect(c, 1, 2, 14, 3, '#3a2416');
    hline(c, 2, 3, 12, '#c9a24a');
  },
  furn_sofa: (c) => {
    rect(c, 1, 5, 14, 9, O);
    rect(c, 2, 6, 12, 4, '#4a6a8a');
    rect(c, 2, 10, 12, 3, '#5a7a9a');
    rect(c, 1, 8, 2, 5, '#3e5a76');
    rect(c, 13, 8, 2, 5, '#3e5a76');
  },
  furn_tv: (c) => {
    rect(c, 1, 2, 14, 10, O);
    rect(c, 2, 3, 12, 8, '#3a7ab8');
    rect(c, 2, 3, 12, 3, '#6a9ad8');
    rect(c, 6, 12, 4, 2, O);
    hline(c, 4, 14, 8, O);
  },
  furn_plants: (c) => {
    rect(c, 4, 10, 8, 5, O);
    rect(c, 5, 11, 6, 3, '#b8643a');
    for (const [x, y] of [[5, 4], [8, 2], [11, 5], [6, 7], [10, 8]] as [number, number][]) {
      ellipse(c, x, y, 2, 2, '#3f7a38');
      px(c, x - 1, y - 1, '#5fa24c');
    }
    vline(c, 8, 6, 5, '#2f5e2e');
  },
  furn_art: (c) => {
    rect(c, 1, 2, 14, 12, '#c9a24a');
    rect(c, 2, 3, 12, 10, '#e8e2d0');
    rect(c, 3, 5, 5, 6, '#c2283a');
    rect(c, 8, 6, 5, 5, '#2a4a9a');
    circle(c, 10, 5, 1, '#e0b13e');
    strokeRect(c, 1, 2, 14, 12, O);
  },
  furn_treadmill: (c) => {
    rect(c, 1, 10, 14, 4, O);
    rect(c, 2, 11, 12, 2, '#4a4a52');
    vline(c, 12, 3, 8, O);
    rect(c, 9, 2, 5, 3, O);
    rect(c, 10, 3, 3, 1, '#3ab86a');
  },
  furn_piano: (c) => {
    rect(c, 1, 2, 14, 12, O);
    rect(c, 2, 3, 12, 6, '#1a1a1e');
    rect(c, 2, 9, 12, 3, WHITE);
    for (let x = 3; x < 14; x += 2) vline(c, x, 9, 2, '#1a1a1e');
  },
};

function ring(ctx: Ctx): void {
  // the bezel of a good watch
  for (const [x, y] of [[6, 5], [10, 5], [5, 8], [11, 8], [6, 11], [10, 11]] as [number, number][]) px(ctx, x, y, '#f0d68a');
}

/** A generic icon by kind for anything without its own drawing. */
function fallback(kind: string): Draw {
  switch (kind) {
    case 'food':
      return (c) => {
        plate(c);
        ellipse(c, 8, 8, 4, 2, '#d8a060');
      };
    case 'drink':
      return (c) => tumbler(c, '#c8a060', false);
    case 'gift':
      return (c) => giftBox(c, '#3a6ab8', '#e8483a');
    case 'book':
      return (c) => book(c, '#6a4a8a', () => undefined);
    case 'outfit':
      return (c) => {
        rect(c, 2, 4, 12, 10, O);
        rect(c, 3, 5, 10, 8, '#4f7fbf');
        rect(c, 6, 4, 4, 2, WHITE);
      };
    default:
      return (c) => giftBox(c, '#8a8a92', '#d8d4cc');
  }
}

const urls = new Map<string, string>();

/** Draw an item's icon into a 16 × 16 context. */
export function drawItemIcon(ctx: Ctx, id: string): void {
  (ICONS[id] ?? fallback(ITEMS[id]?.kind ?? 'misc'))(ctx);
}

/** The icon as a canvas (16 × 16). */
export function itemIconCanvas(id: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(ICON, ICON);
  drawItemIcon(ctx, id);
  return canvas;
}

/** The icon as a data URL (cached), for <img> in the interface. */
export function itemIconUrl(id: string): string {
  let u = urls.get(id);
  if (!u) {
    u = itemIconCanvas(id).toDataURL();
    urls.set(id, u);
  }
  return u;
}

/** For tests: which items have a drawing of their own. */
export function hasOwnIcon(id: string): boolean {
  return id in ICONS;
}

/** A tint for the slot behind an icon, by kind. */
export function iconSlotColor(kind: string): string {
  const base: Record<string, string> = {
    food: '#e8d8b8',
    drink: '#d8e4ec',
    gift: '#f0dce4',
    valuable: '#ece0c0',
    vehicle: '#dcdcdc',
    book: '#e4dcec',
    furniture: '#e4dcd0',
    grocery: '#e0e8d0',
    outfit: '#dce4ec',
  };
  return mix(base[kind] ?? '#e4e0d8', '#f4ecd8', 0.3);
}
