import { outsideNumbers, type RouletteBetKind } from './RouletteEngine';

/**
 * Geometry of a standard single-zero betting layout (horizontal, zero on the
 * left, "2 to 1" column boxes on the right, dozens and even-money boxes
 * below). Hit-testing turns a click into a legal bet; anchors give the chip
 * position for a bet. Both are pure so they can be verified in tests.
 */
export interface RouletteGeom {
  x0: number;
  y0: number;
  /** zero cell width */
  zw: number;
  /** number cell size */
  cw: number;
  ch: number;
  /** column ("2 to 1") cell width */
  colw: number;
  /** dozen / even-money row height */
  rowh: number;
  /** click tolerance around lines, px */
  edge: number;
}

export const DEFAULT_GEOM: RouletteGeom = { x0: 206, y0: 74, zw: 16, cw: 19, ch: 26, colw: 20, rowh: 20, edge: 4 };

export interface LayoutBet {
  kind: RouletteBetKind;
  numbers: number[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Column index (0..11) and row (0 = top row 3,6,9…) of a number 1..36. */
export function cellOf(n: number): { col: number; row: number } {
  return { col: Math.floor((n - 1) / 3), row: 2 - ((n - 1) % 3) };
}

export function numberAt(col: number, row: number): number {
  return col * 3 + (3 - row);
}

export function numberRect(n: number, g: RouletteGeom = DEFAULT_GEOM): Rect {
  if (n === 0) return { x: g.x0, y: g.y0, w: g.zw, h: g.ch * 3 };
  const { col, row } = cellOf(n);
  return { x: g.x0 + g.zw + col * g.cw, y: g.y0 + row * g.ch, w: g.cw, h: g.ch };
}

export function gridRight(g: RouletteGeom = DEFAULT_GEOM): number {
  return g.x0 + g.zw + 12 * g.cw;
}

/** "2 to 1" box for column index (0 = 1,4,7… bottom row; 2 = 3,6,9… top row). */
export function columnRect(index: number, g: RouletteGeom = DEFAULT_GEOM): Rect {
  const row = 2 - index;
  return { x: gridRight(g), y: g.y0 + row * g.ch, w: g.colw, h: g.ch };
}

export function dozenRect(index: number, g: RouletteGeom = DEFAULT_GEOM): Rect {
  return { x: g.x0 + g.zw + index * 4 * g.cw, y: g.y0 + 3 * g.ch, w: 4 * g.cw, h: g.rowh };
}

export const EVEN_MONEY: RouletteBetKind[] = ['low', 'even', 'red', 'black', 'odd', 'high'];

export function evenRect(kind: RouletteBetKind, g: RouletteGeom = DEFAULT_GEOM): Rect {
  const i = EVEN_MONEY.indexOf(kind);
  return { x: g.x0 + g.zw + i * 2 * g.cw, y: g.y0 + 3 * g.ch + g.rowh, w: 2 * g.cw, h: g.rowh };
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

const sorted = (ns: number[]) => [...ns].sort((a, b) => a - b);

/** Translate a point on the layout into a bet, or null when it is off the layout. */
export function betAt(x: number, y: number, g: RouletteGeom = DEFAULT_GEOM): LayoutBet | null {
  const gx0 = g.x0 + g.zw;
  const gx1 = gridRight(g);
  const gy0 = g.y0;
  const gy1 = g.y0 + 3 * g.ch;
  const e = g.edge;

  // street / six-line: on the outer line below the bottom row
  if (x >= gx0 - e && x < gx1 && Math.abs(y - gy1) <= e) {
    const fx = x - gx0;
    const col = Math.max(0, Math.min(11, Math.floor(fx / g.cw)));
    const local = fx - col * g.cw;
    if (fx < e && col === 0) return { kind: 'basket', numbers: [0, 1, 2, 3] };
    if (local < e && col > 0) return { kind: 'line', numbers: range(3 * (col - 1) + 1, 3 * (col - 1) + 6) };
    if (local > g.cw - e && col < 11) return { kind: 'line', numbers: range(3 * col + 1, 3 * col + 6) };
    return { kind: 'street', numbers: [3 * col + 1, 3 * col + 2, 3 * col + 3] };
  }

  // the number grid (including its left border shared with zero)
  if (x >= gx0 - e && x < gx1 && y >= gy0 && y < gy1) {
    const fx = x - gx0;
    const fy = y - gy0;
    const col = Math.max(0, Math.min(11, Math.floor(fx / g.cw)));
    const row = Math.max(0, Math.min(2, Math.floor(fy / g.ch)));
    const lx = fx - col * g.cw;
    const ly = fy - row * g.ch;
    const n = numberAt(col, row);
    const nearLeft = lx < e;
    const nearRight = lx > g.cw - e;
    const nearTop = ly < e && row > 0;
    const nearBottom = ly > g.ch - e && row < 2;
    // borders with zero
    if (col === 0 && nearLeft) {
      if (nearTop) return { kind: 'trio', numbers: sorted([0, n, n + 1]) };
      if (nearBottom) return { kind: 'trio', numbers: sorted([0, n, n - 1]) };
      return { kind: 'split', numbers: [0, n] };
    }
    const hNeighbour = nearLeft && col > 0 ? n - 3 : nearRight && col < 11 ? n + 3 : null;
    const vNeighbour = nearTop ? n + 1 : nearBottom ? n - 1 : null;
    if (hNeighbour !== null && vNeighbour !== null) {
      const dv = vNeighbour - n;
      return { kind: 'corner', numbers: sorted([n, hNeighbour, vNeighbour, hNeighbour + dv]) };
    }
    if (hNeighbour !== null) return { kind: 'split', numbers: sorted([n, hNeighbour]) };
    if (vNeighbour !== null) return { kind: 'split', numbers: sorted([n, vNeighbour]) };
    return { kind: 'straight', numbers: [n] };
  }

  if (inside(numberRect(0, g), x, y)) return { kind: 'straight', numbers: [0] };
  for (let i = 0; i < 3; i++) {
    if (inside(columnRect(i, g), x, y)) return { kind: 'column', numbers: outsideNumbers('column', i) };
    if (inside(dozenRect(i, g), x, y)) return { kind: 'dozen', numbers: outsideNumbers('dozen', i) };
  }
  for (const k of EVEN_MONEY) if (inside(evenRect(k, g), x, y)) return { kind: k, numbers: outsideNumbers(k) };
  return null;
}

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** Where chips for a bet are drawn (always a point that `betAt` maps back to the same bet). */
export function betAnchor(bet: LayoutBet, g: RouletteGeom = DEFAULT_GEOM): { x: number; y: number } {
  const ns = sorted(bet.numbers);
  const gx0 = g.x0 + g.zw;
  const gy1 = g.y0 + 3 * g.ch;
  const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  switch (bet.kind) {
    case 'straight':
      return center(numberRect(ns[0], g));
    case 'split': {
      if (ns[0] === 0) {
        const r = numberRect(ns[1], g);
        return { x: gx0, y: r.y + r.h / 2 };
      }
      const a = numberRect(ns[0], g);
      const b = numberRect(ns[1], g);
      if (ns[1] - ns[0] === 3) return { x: a.x + a.w, y: a.y + a.h / 2 };
      // vertical neighbours: shared horizontal edge
      return { x: a.x + a.w / 2, y: Math.max(a.y, b.y) };
    }
    case 'corner': {
      const a = numberRect(ns[0], g);
      return { x: a.x + a.w, y: a.y };
    }
    case 'street': {
      const r = numberRect(ns[0], g);
      return { x: r.x + r.w / 2, y: gy1 };
    }
    case 'line': {
      const r = numberRect(ns[0], g);
      return { x: r.x + r.w, y: gy1 };
    }
    case 'trio': {
      const mid = ns[1] === 1 ? numberRect(1, g) : numberRect(3, g);
      return { x: gx0, y: ns[1] === 1 ? mid.y : mid.y + mid.h };
    }
    case 'basket':
      return { x: gx0, y: gy1 };
    case 'column':
      return center(columnRect(outsideIndex(bet), g));
    case 'dozen':
      return center(dozenRect(outsideIndex(bet), g));
    default:
      return center(evenRect(bet.kind, g));
  }
}

function outsideIndex(bet: LayoutBet): number {
  const ns = sorted(bet.numbers);
  if (bet.kind === 'dozen') return Math.floor((ns[0] - 1) / 12);
  return (ns[0] - 1) % 3;
}

/** Every distinct bet the layout can produce (used by tests and tooltips). */
export function allLayoutBets(): LayoutBet[] {
  const out: LayoutBet[] = [];
  for (let n = 0; n <= 36; n++) out.push({ kind: 'straight', numbers: [n] });
  for (let n = 1; n <= 36; n++) {
    if (n <= 33) out.push({ kind: 'split', numbers: [n, n + 3] });
    if (n % 3 !== 0) out.push({ kind: 'split', numbers: [n, n + 1] });
    if (n % 3 !== 0 && n <= 32) out.push({ kind: 'corner', numbers: [n, n + 1, n + 3, n + 4] });
  }
  for (const n of [1, 2, 3]) out.push({ kind: 'split', numbers: [0, n] });
  out.push({ kind: 'trio', numbers: [0, 1, 2] }, { kind: 'trio', numbers: [0, 2, 3] }, { kind: 'basket', numbers: [0, 1, 2, 3] });
  for (let c = 0; c < 12; c++) out.push({ kind: 'street', numbers: [3 * c + 1, 3 * c + 2, 3 * c + 3] });
  for (let c = 0; c < 11; c++) out.push({ kind: 'line', numbers: range(3 * c + 1, 3 * c + 6) });
  for (let i = 0; i < 3; i++) {
    out.push({ kind: 'dozen', numbers: outsideNumbers('dozen', i) });
    out.push({ kind: 'column', numbers: outsideNumbers('column', i) });
  }
  for (const k of EVEN_MONEY) out.push({ kind: k, numbers: outsideNumbers(k) });
  return out;
}

export function sameBet(a: LayoutBet, b: LayoutBet): boolean {
  if (a.kind !== b.kind || a.numbers.length !== b.numbers.length) return false;
  const x = sorted(a.numbers);
  const y = sorted(b.numbers);
  return x.every((v, i) => v === y[i]);
}
