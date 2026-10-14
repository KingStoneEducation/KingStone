import { circle, ellipse, hline, makeCanvas, px, rect, strokeRect, vline, type Ctx } from './canvas';

/**
 * The little things that appear for a moment when you do something in the
 * world: the bank card going into the ATM and the notes coming out, a stack
 * of chips across the cage, a paper bag from a shop, steam off the stove, a
 * book in your hands, a basketball, the notes off a piano, a sparkle, and
 * the Z's over a sleeper.
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
