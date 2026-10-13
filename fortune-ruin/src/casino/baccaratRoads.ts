import type { BacHistoryEntry } from './BaccaratEngine';

/**
 * Baccarat scoreboards ("roads") computed from the shoe's history. They are
 * purely descriptive: past coups have no influence on future ones.
 */

export interface BeadCell {
  col: number;
  row: number;
  w: 'P' | 'B' | 'T';
  total: number;
  pp: boolean;
  bp: boolean;
}

/** Bead plate: column-major, 6 rows. */
export function beadPlate(history: readonly BacHistoryEntry[], rows = 6): BeadCell[] {
  return history.map((h, i) => ({
    col: Math.floor(i / rows),
    row: i % rows,
    w: h.w,
    total: h.w === 'B' ? h.bt : h.pt,
    pp: h.pp,
    bp: h.bp,
  }));
}

export interface BigRoadCell {
  col: number;
  row: number;
  w: 'P' | 'B';
  ties: number;
  natural: boolean;
}

/**
 * Big road: a new column whenever the winner changes; ties are marked on the
 * last cell. Streaks longer than the board bend right ("dragon tail").
 */
export function bigRoad(history: readonly BacHistoryEntry[], rows = 6): BigRoadCell[] {
  const cells: BigRoadCell[] = [];
  const occupied = new Set<string>();
  let leadingTies = 0;
  let col = -1;
  let row = 0;
  let streakCol = -1;
  let last: 'P' | 'B' | null = null;
  for (const h of history) {
    if (h.w === 'T') {
      if (cells.length) cells[cells.length - 1].ties += 1;
      else leadingTies += 1;
      continue;
    }
    if (h.w !== last) {
      streakCol += 1;
      // a new streak starts at the top of the first free column
      while (occupied.has(`${streakCol},0`)) streakCol += 1;
      col = streakCol;
      row = 0;
    } else {
      const down = row + 1;
      if (down < rows && !occupied.has(`${col},${down}`)) row = down;
      else col += 1; // dragon tail
    }
    occupied.add(`${col},${row}`);
    cells.push({ col, row, w: h.w, ties: leadingTies, natural: h.nat });
    leadingTies = 0;
    last = h.w;
  }
  return cells;
}

export function shoeStats(history: readonly BacHistoryEntry[]): { P: number; B: number; T: number; pp: number; bp: number } {
  const s = { P: 0, B: 0, T: 0, pp: 0, bp: 0 };
  for (const h of history) {
    s[h.w] += 1;
    if (h.pp) s.pp += 1;
    if (h.bp) s.bp += 1;
  }
  return s;
}
