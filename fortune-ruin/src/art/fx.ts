import { circle, ellipse, hline, makeCanvas, px, rect, shade, strokeRect, vline, type Ctx } from './canvas';

/**
 * The little things that appear for a moment when you do something in the
 * world: the bank card going into the ATM and the notes coming out, a stack
 * of chips across the cage, a paper bag from a shop, steam off the stove, a
 * book in your hands, a basketball, the notes off a piano, a sparkle, the
 * Z's over a sleeper, and the rain: its streaks (straight down, slanting in
 * a breeze, driven by a storm) and the little crown where a drop lands.
 */
export const FX: Record<string, { w: number; h: number; draw: (ctx: Ctx) => void }> = {
  card: {
    w: 8,
    h: 5,
    draw: (c) => {
      rect(c, 0, 0, 8, 5, '#2a5a9a');
      hline(c, 0, 1, 8, '#16161e');
      rect(c, 1, 3, 2, 1, '#e0b13e');
      hline(c, 4, 3, 3, '#8fb2de');
    },
  },
  cash: {
    w: 9,
    h: 5,
    draw: (c) => {
      rect(c, 0, 0, 9, 5, '#6ab07a');
      strokeRect(c, 0, 0, 9, 5, '#2a6a3a');
      circle(c, 4, 2, 1, '#d8f0c8');
    },
  },
  chips: {
    w: 7,
    h: 8,
    draw: (c) => {
      for (const [y, top, side] of [
        [5, '#3a3a42', '#1e1e24'],
        [3, '#2a5a9a', '#1a3a6a'],
        [1, '#c2283a', '#82182a'],
      ] as [number, string, string][]) {
        hline(c, 0, y + 1, 7, side);
        ellipse(c, 3, y, 3, 1, top);
        px(c, 3, y, '#f4f1ea');
      }
    },
  },
  bag: {
    w: 8,
    h: 9,
    draw: (c) => {
      rect(c, 1, 3, 6, 6, '#c8a070');
      hline(c, 1, 3, 6, '#a8804a');
      vline(c, 6, 4, 5, '#a8804a');
      vline(c, 2, 0, 3, '#5a3a24');
      vline(c, 5, 0, 3, '#5a3a24');
      hline(c, 2, 0, 4, '#5a3a24');
    },
  },
  steam: {
    w: 6,
    h: 6,
    draw: (c) => {
      circle(c, 3, 3, 2, 'rgba(244,241,234,0.8)');
      px(c, 2, 2, '#ffffff');
    },
  },
  plate: {
    w: 11,
    h: 6,
    draw: (c) => {
      ellipse(c, 5, 3, 5, 2, '#f4f1ea');
      ellipse(c, 5, 3, 3, 1, '#e8c070');
      px(c, 4, 2, '#7aa84a');
      px(c, 6, 3, '#c8483a');
    },
  },
  book: {
    w: 10,
    h: 6,
    draw: (c) => {
      rect(c, 0, 1, 10, 5, '#8a3a2a');
      rect(c, 1, 0, 4, 5, '#f4f1ea');
      rect(c, 5, 0, 4, 5, '#e8e2d4');
      vline(c, 5, 0, 5, '#c8c2b0');
      for (const y of [1, 3]) {
        hline(c, 2, y, 2, '#8a8a92');
        hline(c, 6, y, 2, '#8a8a92');
      }
    },
  },
  ball: {
    w: 7,
    h: 7,
    draw: (c) => {
      circle(c, 3, 3, 3, '#e07a2a');
      vline(c, 3, 0, 7, '#5a2a10');
      hline(c, 0, 3, 7, '#5a2a10');
    },
  },
  note: {
    w: 5,
    h: 7,
    draw: (c) => {
      vline(c, 3, 0, 5, '#241b30');
      hline(c, 3, 0, 2, '#241b30');
      px(c, 4, 1, '#241b30');
      rect(c, 1, 4, 3, 2, '#241b30');
    },
  },
  spark: {
    w: 5,
    h: 5,
    draw: (c) => {
      hline(c, 0, 2, 5, '#ffe9a8');
      vline(c, 2, 0, 5, '#ffe9a8');
      px(c, 2, 2, '#ffffff');
    },
  },
  ripple: {
    w: 18,
    h: 5,
    draw: (c) => {
      hline(c, 3, 0, 12, 'rgba(244,241,234,0.85)');
      hline(c, 1, 1, 3, 'rgba(244,241,234,0.85)');
      hline(c, 14, 1, 3, 'rgba(244,241,234,0.85)');
      hline(c, 0, 2, 2, 'rgba(244,241,234,0.7)');
      hline(c, 16, 2, 2, 'rgba(244,241,234,0.7)');
      hline(c, 1, 3, 3, 'rgba(244,241,234,0.55)');
      hline(c, 14, 3, 3, 'rgba(244,241,234,0.55)');
      hline(c, 3, 4, 12, 'rgba(244,241,234,0.45)');
    },
  },
  crate: {
    w: 10,
    h: 9,
    draw: (c) => {
      rect(c, 0, 0, 10, 9, '#5a3a20');
      rect(c, 1, 1, 8, 7, '#a8784a');
      hline(c, 1, 4, 8, '#8a5a32');
      vline(c, 3, 1, 7, '#8a5a32');
      vline(c, 6, 1, 7, '#8a5a32');
      hline(c, 1, 1, 8, '#c8986a');
    },
  },
  rain: {
    w: 1,
    h: 7,
    draw: (c) => {
      vline(c, 0, 0, 2, 'rgba(200,214,240,0.35)');
      vline(c, 0, 2, 5, 'rgba(214,226,250,0.7)');
    },
  },
  rain_slant: {
    w: 2,
    h: 8,
    draw: (c) => {
      vline(c, 1, 0, 3, 'rgba(200,214,240,0.4)');
      vline(c, 0, 3, 5, 'rgba(214,226,250,0.72)');
    },
  },
  rain_storm: {
    w: 4,
    h: 9,
    draw: (c) => {
      for (let i = 0; i < 4; i++) vline(c, 3 - i, i * 2, i === 3 ? 3 : 2, i === 0 ? 'rgba(200,214,240,0.4)' : 'rgba(220,230,252,0.78)');
    },
  },
  splash: {
    w: 5,
    h: 3,
    draw: (c) => {
      px(c, 1, 0, 'rgba(220,230,252,0.8)');
      px(c, 3, 0, 'rgba(220,230,252,0.8)');
      px(c, 0, 1, 'rgba(220,230,252,0.6)');
      px(c, 4, 1, 'rgba(220,230,252,0.6)');
      hline(c, 1, 2, 3, 'rgba(200,214,240,0.55)');
    },
  },
  zz: {
    w: 5,
    h: 5,
    draw: (c) => {
      hline(c, 0, 0, 5, '#bcd4ea');
      px(c, 3, 1, '#bcd4ea');
      px(c, 2, 2, '#bcd4ea');
      px(c, 1, 3, '#bcd4ea');
      hline(c, 0, 4, 5, '#bcd4ea');
    },
  },
};

export function fxCanvas(name: string): HTMLCanvasElement {
  const d = FX[name];
  const { canvas, ctx } = makeCanvas(d.w, d.h);
  d.draw(ctx);
  return canvas;
}

/** The colours of the umbrellas people put up in the rain (the player's is the first). */
export const UMBRELLA_COLORS = ['#2f4f86', '#c8483a', '#e8b44c', '#3a7a5a', '#6a4a86', '#2a2a32', '#d8d0c0', '#d86a8a'];
export const UMBRELLA_W = 23;
export const UMBRELLA_H = 12;

/** An open umbrella held over the head: the canopy, and the top of the shaft down to the hair (the hand is behind the head). */
export function drawUmbrella(c: Ctx, color: string): void {
  const hi = shade(color, 0.25);
  const lo = shade(color, -0.22);
  const rim = shade(color, -0.45);
  // the dome, row by row: [from, to]
  const rows: [number, number][] = [[11, 11], [8, 14], [5, 17], [3, 19], [2, 20], [1, 21], [0, 22], [0, 22]];
  rows.forEach(([a, b], y) => {
    for (let x = a; x <= b; x++) {
      const left = x < 11;
      const col = y === 0 ? rim : y >= 7 ? lo : y <= 3 ? (left ? hi : color) : left ? color : lo;
      px(c, x, y, col);
    }
    px(c, a, y, rim);
    px(c, b, y, rim);
  });
  // the ribs: down the middle, and out to the points of the hem
  for (let y = 1; y <= 7; y++) {
    px(c, 11, y, rim);
    px(c, Math.round(11 - (y * 6) / 8), y, rim);
    px(c, Math.round(11 + (y * 6) / 8), y, rim);
  }
  // the hem: a point at each rib's tip
  for (const x of [0, 1, 4, 5, 6, 11, 16, 17, 18, 21, 22]) px(c, x, 8, rim);
  vline(c, 11, 9, 3, '#3a3a42');
}

export function umbrellaCanvas(i: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(UMBRELLA_W, UMBRELLA_H);
  drawUmbrella(ctx, UMBRELLA_COLORS[i % UMBRELLA_COLORS.length]);
  return canvas;
}
