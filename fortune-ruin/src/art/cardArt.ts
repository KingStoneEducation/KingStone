import { makeCanvas, px, rect, shade, type Ctx } from './canvas';
import { cardRank, cardSuit, type Card } from '../casino/cards';

/**
 * Playing cards, drawn at twice the table's pixel density (44 × 60 texels for
 * a 22 × 30 card on the table) so the pips, indices and court portraits can
 * carry real detail. Suits are built from distinct silhouettes — a heart has
 * two round lobes and a notch, a diamond is a narrow pointed rhombus — so they
 * stay apart even in the two-colour deck; the four-colour deck (an option)
 * also tells them apart by ink.
 */
export const CARD_DENSITY = 2;
export const CW = 44;
export const CH = 60;

const PAPER = '#fbf8ef';
const PAPER_SHADE = '#ebe5d6';
const EDGE = '#2a2433';

export const INK = { black: '#1b1824', red: '#c41a30', blue: '#1f56b8', green: '#16773a' } as const;

export function suitInk(suit: number, fourColor: boolean): string {
  if (!fourColor) return suit === 1 || suit === 2 ? INK.red : INK.black;
  return [INK.black, INK.red, INK.blue, INK.green][suit];
}

// ------------------------------------------------------------------ suit silhouettes

/** u, v in [-1, 1], v pointing down. */
type Shape = (u: number, v: number) => boolean;

const disc = (u: number, v: number, cx: number, cy: number, r: number) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r;

function tri(u: number, v: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  const s1 = (bx - ax) * (v - ay) - (by - ay) * (u - ax);
  const s2 = (cx - bx) * (v - by) - (cy - by) * (u - bx);
  const s3 = (ax - cx) * (v - cy) - (ay - cy) * (u - cx);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

/** A spade/club stem that flares into a foot. */
const stem = (u: number, v: number, top: number) => v >= top && v <= 1 && Math.abs(u) <= 0.07 + ((v - top) / (1 - top)) ** 2 * 0.42;

const SHAPES: Shape[] = [
  // spade: an upturned heart on a flared stem
  (u, v) => disc(u, v, -0.47, 0.16, 0.47) || disc(u, v, 0.47, 0.16, 0.47) || tri(u, v, -0.93, 0.08, 0.93, 0.08, 0, -1) || stem(u, v, 0.3),
  // heart: two full lobes over a point
  (u, v) => disc(u, v, -0.47, -0.4, 0.5) || disc(u, v, 0.47, -0.4, 0.5) || tri(u, v, -0.96, -0.26, 0.96, -0.26, 0, 0.98),
  // diamond: tall and narrow, slightly pinched sides
  (u, v) => {
    const a = Math.abs(u) / 0.7;
    const b = Math.abs(v);
    return a ** 0.9 + b ** 0.9 <= 1;
  },
  // club: three leaves on a stem
  (u, v) => disc(u, v, 0, -0.5, 0.42) || disc(u, v, -0.5, 0.1, 0.42) || disc(u, v, 0.5, 0.1, 0.42) || disc(u, v, 0, -0.05, 0.28) || stem(u, v, 0.15),
];

/**
 * Small pips hand-placed where the automatic shapes get mushy (6 × 7 texels).
 * Index and pip glyphs share these.
 */
const PIP6: string[][] = [
  ['..##..', '.####.', '######', '######', '######', '#.##.#', '..##..'],
  ['.#..#.', '######', '######', '######', '.####.', '..##..', '..##..'],
  ['..##..', '..##..', '.####.', '######', '.####.', '..##..', '..##..'],
  ['..##..', '.####.', '..##..', '######', '######', '#.##.#', '..##..'],
];

/** Body pips, 8 × 8, hand-placed. */
const PIP8: string[][] = [
  ['...##...', '..####..', '.######.', '########', '########', '##.##.##', '...##...', '..####..'],
  ['.##..##.', '########', '########', '########', '########', '.######.', '..####..', '...##...'],
  ['...##...', '..####..', '..####..', '.######.', '.######.', '..####..', '..####..', '...##...'],
  ['...##...', '..####..', '..####..', '##.##.##', '########', '##.##.##', '...##...', '..####..'],
];

function blit(ctx: Ctx, g: string[], x: number, y: number, color: string, flip: boolean): void {
  ctx.fillStyle = color;
  for (let j = 0; j < g.length; j++) {
    const row = flip ? g[g.length - 1 - j] : g[j];
    for (let i = 0; i < row.length; i++) {
      const c = flip ? row[row.length - 1 - i] : row[i];
      if (c === '#') ctx.fillRect(x + i, y + j, 1, 1);
    }
  }
}

/** Rasterise a suit at any size (4 × 4 supersampling, filled when at least half covered). */
export function drawSuit(ctx: Ctx, suit: number, x: number, y: number, w: number, h: number, color: string, flip = false): void {
  if (w === 6 && h === 7) {
    blit(ctx, PIP6[suit], x, y, color, flip);
    return;
  }
  if (w === 8 && h === 8) {
    blit(ctx, PIP8[suit], x, y, color, flip);
    return;
  }
  const S = 4;
  const shape = SHAPES[suit];
  ctx.fillStyle = color;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let n = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = ((i + (sx + 0.5) / S) / w) * 2 - 1;
          const v = ((j + (sy + 0.5) / S) / h) * 2 - 1;
          if (shape(u, flip ? -v : v)) n++;
        }
      }
      if (n * 2 >= S * S) ctx.fillRect(x + i, y + j, 1, 1);
    }
  }
}

// ------------------------------------------------------------------ rank glyphs (bold, 6 × 9)

const RANK_GLYPHS: Record<string, string[]> = {
  A: ['..##..', '.####.', '##..##', '##..##', '##..##', '######', '######', '##..##', '##..##'],
  '2': ['.####.', '######', '##..##', '....##', '...###', '..###.', '.###..', '######', '######'],
  '3': ['.####.', '######', '....##', '..###.', '..####', '....##', '##..##', '######', '.####.'],
  '4': ['...##.', '..###.', '.####.', '##.##.', '######', '######', '...##.', '...##.', '...##.'],
  '5': ['######', '######', '##....', '#####.', '######', '....##', '##..##', '######', '.####.'],
  '6': ['.####.', '######', '##....', '#####.', '######', '##..##', '##..##', '######', '.####.'],
  '7': ['######', '######', '....##', '...##.', '..##..', '..##..', '.##...', '.##...', '.##...'],
  '8': ['.####.', '##..##', '##..##', '.####.', '######', '##..##', '##..##', '######', '.####.'],
  '9': ['.####.', '######', '##..##', '##..##', '######', '.#####', '....##', '######', '.####.'],
  '10': ['##.####.', '##.#..#.', '##.#..#.', '##.#..#.', '##.#..#.', '##.#..#.', '##.#..#.', '##.#..#.', '##.####.'],
  J: ['..####', '..####', '....##', '....##', '....##', '....##', '##..##', '######', '.####.'],
  Q: ['.####.', '######', '##..##', '##..##', '##..##', '##.###', '######', '.####.', '....##'],
  K: ['##..##', '##..##', '##.##.', '####..', '###...', '####..', '##.##.', '##..##', '##..##'],
};

const RANK_TEXT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// ------------------------------------------------------------------ card body

/** Rounded-corner card blank with a soft lower edge. */
function blank(ctx: Ctx, fill: string): void {
  const inset = [3, 1, 1];
  for (let y = 0; y < CH; y++) {
    const k = y < 3 ? inset[y] : y >= CH - 3 ? inset[CH - 1 - y] : 0;
    rect(ctx, k, y, CW - 2 * k, 1, fill);
  }
  // outline following the rounded corners
  ctx.fillStyle = EDGE;
  ctx.fillRect(3, 0, CW - 6, 1);
  ctx.fillRect(3, CH - 1, CW - 6, 1);
  ctx.fillRect(0, 3, 1, CH - 6);
  ctx.fillRect(CW - 1, 3, 1, CH - 6);
  for (const [x, y] of [[1, 1], [2, 1], [1, 2]]) {
    px(ctx, x, y, EDGE);
    px(ctx, CW - 1 - x, y, EDGE);
    px(ctx, x, CH - 1 - y, EDGE);
    px(ctx, CW - 1 - x, CH - 1 - y, EDGE);
  }
}

function index(ctx: Ctx, rank: number, suit: number, ink: string, flip: boolean): void {
  const label = RANK_TEXT[rank];
  const g = RANK_GLYPHS[label];
  const w = g[0].length;
  const x = label === '10' ? 2 : 3;
  const y = 3;
  const pipX = 3;
  const pipY = 14;
  if (!flip) {
    blit(ctx, g, x, y, ink, false);
    drawSuit(ctx, suit, pipX, pipY, 6, 7, ink, false);
  } else {
    blit(ctx, g, CW - x - w, CH - y - g.length, ink, true);
    drawSuit(ctx, suit, CW - pipX - 6, CH - pipY - 7, 6, 7, ink, true);
  }
}

// body pips are 8 × 8; columns and rows give the top-left corner
const PIP = 8;
const COL = { l: 10, c: 18, r: 26 };
const ROW4 = [6, 19, 33, 46];
const ROW3 = [6, 26, 46];
const MID = 26;

function pipLayout(rank: number): [number, number][] {
  const { l, c, r } = COL;
  switch (rank) {
    case 2: return [[c, ROW3[0]], [c, ROW3[2]]];
    case 3: return [[c, ROW3[0]], [c, MID], [c, ROW3[2]]];
    case 4: return [[l, ROW3[0]], [r, ROW3[0]], [l, ROW3[2]], [r, ROW3[2]]];
    case 5: return [...pipLayout(4), [c, MID]];
    case 6: return ROW3.flatMap((y) => [[l, y], [r, y]] as [number, number][]);
    case 7: return [...pipLayout(6), [c, 16]];
    case 8: return [...pipLayout(6), [c, 16], [c, 36]];
    case 9: return [...ROW4.flatMap((y) => [[l, y], [r, y]] as [number, number][]), [c, MID]];
    // the wide "10" index needs the side columns one texel further in
    case 10: return [...ROW4.flatMap((y) => [[l + 1, y], [r - 1, y]] as [number, number][]), [c, 12], [c, 40]];
    default: return [];
  }
}

export function drawCardFace(ctx: Ctx, card: Card, fourColor = false): void {
  const rank = cardRank(card);
  const suit = cardSuit(card);
  const ink = suitInk(suit, fourColor);
  blank(ctx, PAPER);
  rect(ctx, 1, CH - 3, CW - 2, 1, PAPER_SHADE);
  rect(ctx, 3, CH - 2, CW - 6, 1, PAPER_SHADE);
  if (rank >= 11) court(ctx, rank, suit, ink);
  else if (rank === 1) ace(ctx, suit, ink);
  else for (const [x, y] of pipLayout(rank)) drawSuit(ctx, suit, x, y, PIP, PIP, ink, y > MID);
  index(ctx, rank, suit, ink, false);
  index(ctx, rank, suit, ink, true);
}

function ace(ctx: Ctx, suit: number, ink: string): void {
  if (suit === 0) {
    // the ace of spades carries the house mark: a gold ring and a larger spade
    ring2(ctx, 22, 30, 14, 16, '#c9a24a');
    drawSuit(ctx, 0, 11, 17, 22, 26, ink);
    // a thin light line inside the blade
    for (let y = 22; y < 33; y++) px(ctx, 21, y, shade(ink, 0.35));
    return;
  }
  drawSuit(ctx, suit, 13, 20, 18, 20, ink);
  // a highlight on the upper left of the pip
  const hi = shade(ink, 0.45);
  if (suit === 1) {
    px(ctx, 16, 23, hi);
    px(ctx, 16, 24, hi);
    px(ctx, 17, 23, hi);
  } else if (suit === 2) {
    px(ctx, 20, 25, hi);
    px(ctx, 19, 27, hi);
  } else {
    px(ctx, 20, 22, hi);
    px(ctx, 21, 22, hi);
  }
}

/** Ellipse outline, one texel thick. */
function ring2(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string): void {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d <= 1 && d >= 0.8) px(ctx, x, y, color);
    }
  }
}

// ------------------------------------------------------------------ court cards

const SKIN = '#f1cfae';
const SKIN_SH = '#d9a986';
const GOLD = '#e2b53e';
const GOLD_DK = '#a87a1e';
const WHITE = '#fbf8ef';
const LINE = '#2a2030';

interface Pal {
  robe: string;
  robeDk: string;
  trim: string;
  hair: string;
  hairDk: string;
  accent: string;
}

function palette(rank: number, suit: number, ink: string): Pal {
  const robe = ink === INK.black ? '#2c3a6e' : ink;
  const accent = suit === 1 || suit === 2 ? '#2c4f9a' : '#b2283a';
  const hair = rank === 13 ? '#7c6e66' : rank === 12 ? (suit % 2 ? '#c98b2e' : '#4a3226') : '#8a5428';
  return { robe, robeDk: shade(robe, -0.3), trim: GOLD, hair, hairDk: shade(hair, -0.3), accent };
}

/** One half of a double-headed court portrait, 22 × 25 texels. */
function courtHalf(rank: number, suit: number, ink: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(22, 25);
  const p = palette(rank, suit, ink);
  const face = (top: number) => {
    rect(ctx, 8, top, 7, 7, SKIN);
    rect(ctx, 14, top, 1, 7, SKIN_SH);
    rect(ctx, 8, top + 6, 7, 1, SKIN_SH);
    px(ctx, 9, top + 2, LINE);
    px(ctx, 12, top + 2, LINE);
    px(ctx, 11, top + 3, SKIN_SH);
    px(ctx, 11, top + 4, SKIN_SH);
  };
  if (rank === 13) {
    // king: crown, full beard, ermine collar, a sword held behind
    rect(ctx, 2, 1, 1, 17, '#c8ccd8');
    rect(ctx, 3, 1, 1, 17, '#9aa0b4');
    px(ctx, 2, 0, '#c8ccd8');
    rect(ctx, 0, 15, 6, 1, GOLD);
    rect(ctx, 2, 16, 2, 2, GOLD_DK);
    rect(ctx, 7, 4, 9, 2, GOLD);
    for (const x of [7, 11, 15]) rect(ctx, x, 1, 1, 3, GOLD);
    for (const x of [9, 13]) rect(ctx, x, 2, 1, 2, GOLD);
    px(ctx, 11, 0, GOLD);
    for (const x of [9, 11, 13]) px(ctx, x, 5, '#c41a30');
    rect(ctx, 7, 5, 9, 1, GOLD_DK);
    rect(ctx, 7, 6, 1, 3, p.hair);
    rect(ctx, 15, 6, 1, 3, p.hair);
    face(6);
    rect(ctx, 9, 10, 5, 1, p.hair);
    rect(ctx, 8, 11, 7, 3, p.hair);
    rect(ctx, 9, 14, 5, 1, p.hairDk);
    px(ctx, 11, 11, '#b8323a');
    rect(ctx, 4, 14, 15, 2, WHITE);
    for (const x of [5, 8, 14, 17]) px(ctx, x, 15, LINE);
    rect(ctx, 3, 16, 17, 9, p.robe);
    rect(ctx, 3, 16, 1, 9, p.robeDk);
    rect(ctx, 19, 16, 1, 9, p.robeDk);
    rect(ctx, 10, 16, 3, 9, p.trim);
    for (let y = 17; y < 25; y += 2) px(ctx, 11, y, p.accent);
    rect(ctx, 4, 18, 2, 2, SKIN);
  } else if (rank === 12) {
    // queen: tiara, long hair, a flower
    rect(ctx, 6, 4, 11, 1, p.hair);
    rect(ctx, 6, 5, 2, 12, p.hair);
    rect(ctx, 15, 5, 2, 12, p.hair);
    rect(ctx, 6, 15, 2, 2, p.hairDk);
    rect(ctx, 15, 15, 2, 2, p.hairDk);
    rect(ctx, 8, 3, 7, 1, GOLD);
    for (const x of [8, 11, 14]) px(ctx, x, 2, GOLD);
    px(ctx, 11, 1, '#c41a30');
    face(5);
    rect(ctx, 10, 9, 3, 1, '#c43a4a');
    rect(ctx, 10, 12, 3, 1, SKIN);
    rect(ctx, 5, 13, 13, 12, p.robe);
    rect(ctx, 5, 13, 1, 12, p.robeDk);
    rect(ctx, 17, 13, 1, 12, p.robeDk);
    rect(ctx, 8, 13, 7, 2, WHITE);
    rect(ctx, 9, 15, 5, 1, p.trim);
    px(ctx, 11, 16, '#c41a30');
    rect(ctx, 10, 17, 3, 8, p.trim);
    // the flower
    rect(ctx, 18, 15, 1, 8, '#2f7a3a');
    rect(ctx, 17, 13, 3, 2, '#d84a6a');
    px(ctx, 18, 12, '#d84a6a');
    px(ctx, 18, 13, GOLD);
    rect(ctx, 16, 19, 2, 2, SKIN);
  } else {
    // jack: plumed cap, short curls, a halberd
    rect(ctx, 19, 1, 1, 24, '#8a6a3a');
    rect(ctx, 18, 1, 3, 3, '#c8ccd8');
    px(ctx, 21, 2, '#9aa0b4');
    rect(ctx, 6, 3, 11, 2, p.accent);
    rect(ctx, 7, 2, 9, 1, p.accent);
    rect(ctx, 6, 5, 11, 1, p.trim);
    rect(ctx, 4, 0, 2, 1, WHITE);
    rect(ctx, 5, 1, 2, 1, WHITE);
    px(ctx, 6, 2, WHITE);
    rect(ctx, 7, 6, 1, 4, p.hair);
    rect(ctx, 15, 6, 1, 4, p.hair);
    face(6);
    rect(ctx, 10, 11, 3, 1, SKIN_SH);
    rect(ctx, 6, 13, 11, 2, WHITE);
    for (const x of [7, 9, 11, 13, 15]) px(ctx, x, 14, '#d8d2c2');
    rect(ctx, 4, 15, 15, 10, p.robe);
    rect(ctx, 4, 15, 1, 10, p.robeDk);
    rect(ctx, 18, 15, 1, 10, p.robeDk);
    rect(ctx, 5, 18, 13, 1, p.trim);
    rect(ctx, 10, 15, 3, 10, p.accent);
    rect(ctx, 17, 18, 2, 2, SKIN);
  }
  return canvas;
}

function court(ctx: Ctx, rank: number, suit: number, ink: string): void {
  const x0 = 11;
  const y0 = 5;
  // panel: thin double frame in the suit's ink, warm paper inside
  rect(ctx, x0, y0, 22, 50, '#f6eedb');
  const frame = (x: number, y: number, w: number, h: number, c: string) => {
    rect(ctx, x, y, w, 1, c);
    rect(ctx, x, y + h - 1, w, 1, c);
    rect(ctx, x, y, 1, h, c);
    rect(ctx, x + w - 1, y, 1, h, c);
  };
  const half = courtHalf(rank, suit, ink);
  ctx.drawImage(half, x0, y0);
  ctx.save();
  ctx.translate(x0 + 22, y0 + 50);
  ctx.scale(-1, -1);
  ctx.drawImage(half, 0, 0);
  ctx.restore();
  // diagonal divider, the way printed court cards split their two heads
  for (let i = 0; i < 22; i++) px(ctx, x0 + i, y0 + 25 + Math.round((i - 10.5) * -0.18), shade(ink, 0.25));
  frame(x0, y0, 22, 50, ink);
}

// ------------------------------------------------------------------ back

/** Card back: white margin, a fine lattice and the house's crescent-moon seal. */
export function drawCardBack(ctx: Ctx, color = '#8c1d2c'): void {
  blank(ctx, PAPER);
  const light = shade(color, 0.28);
  const dark = shade(color, -0.28);
  rect(ctx, 3, 3, CW - 6, CH - 6, color);
  for (let y = 5; y < CH - 5; y++) {
    for (let x = 5; x < CW - 5; x++) {
      const a = (x + y) % 6 === 0;
      const b = (x - y + 60) % 6 === 0;
      if (a || b) px(ctx, x, y, light);
      else if ((x + y) % 6 === 3 && (x - y + 60) % 6 === 3) px(ctx, x, y, dark);
    }
  }
  // inner rule
  rect(ctx, 4, 4, CW - 8, 1, light);
  rect(ctx, 4, CH - 5, CW - 8, 1, light);
  rect(ctx, 4, 4, 1, CH - 8, light);
  rect(ctx, CW - 5, 4, 1, CH - 8, light);
  // seal
  const cx = 22;
  const cy = 30;
  for (let y = cy - 11; y <= cy + 11; y++) {
    for (let x = cx - 9; x <= cx + 9; x++) {
      const d = ((x + 0.5 - cx) / 9) ** 2 + ((y + 0.5 - cy) / 11) ** 2;
      if (d <= 1) px(ctx, x, y, d >= 0.78 ? '#d8b04a' : dark);
    }
  }
  // crescent moon and a star
  for (let y = cy - 6; y <= cy + 6; y++) {
    for (let x = cx - 6; x <= cx + 6; x++) {
      const inMoon = (x + 0.5 - (cx - 1)) ** 2 + (y + 0.5 - cy) ** 2 <= 30;
      const bite = (x + 0.5 - (cx + 2)) ** 2 + (y + 0.5 - (cy - 1.5)) ** 2 <= 24;
      if (inMoon && !bite) px(ctx, x, y, '#ecc75a');
    }
  }
  px(ctx, cx + 3, cy + 2, '#ecc75a');
  px(ctx, cx + 4, cy + 1, '#ecc75a');
  px(ctx, cx + 4, cy + 3, '#ecc75a');
  px(ctx, cx + 5, cy + 2, '#ecc75a');
  px(ctx, cx + 4, cy + 2, '#fff2c0');
}
