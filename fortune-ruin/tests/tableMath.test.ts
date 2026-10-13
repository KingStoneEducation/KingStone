import { describe, expect, it } from 'vitest';
import { allLayoutBets, betAnchor, betAt, DEFAULT_GEOM, numberRect, sameBet } from '../src/casino/rouletteLayout';
import { isValidBetShape, EURO_WHEEL } from '../src/casino/RouletteEngine';
import { ballAt, planSpin, pocketAtAngle, pocketLocalAngle, wheelRotationAt } from '../src/casino/rouletteMotion';
import { bigRoad, beadPlate, shoeStats } from '../src/casino/baccaratRoads';
import type { BacHistoryEntry } from '../src/casino/BaccaratEngine';

describe('roulette layout hit-testing', () => {
  it('produces every legal bet position exactly once and all are valid shapes', () => {
    const bets = allLayoutBets();
    expect(bets.length).toBe(37 + 57 + 3 + 2 + 1 + 22 + 12 + 11 + 6 + 6);
    for (const b of bets) expect(isValidBetShape(b.kind, b.numbers)).toBe(true);
  });

  it('anchors map back to the same bet', () => {
    for (const b of allLayoutBets()) {
      const a = betAnchor(b);
      const hit = betAt(a.x, a.y);
      expect(hit, `${b.kind} ${b.numbers.join(',')}`).not.toBeNull();
      expect(sameBet(hit!, b), `${b.kind} ${b.numbers.join(',')} -> ${hit!.kind} ${hit!.numbers.join(',')}`).toBe(true);
    }
  });

  it('every point on the layout yields a valid bet', () => {
    const g = DEFAULT_GEOM;
    for (let x = g.x0 - 2; x < g.x0 + g.zw + 12 * g.cw + g.colw + 2; x += 1) {
      for (let y = g.y0 - 2; y < g.y0 + 3 * g.ch + 2 * g.rowh + 2; y += 1) {
        const b = betAt(x + 0.5, y + 0.5);
        if (b) expect(isValidBetShape(b.kind, b.numbers), `${x},${y} ${b.kind} ${b.numbers}`).toBe(true);
      }
    }
  });

  it('cell centres are straight-up bets on the right numbers', () => {
    for (let n = 0; n <= 36; n++) {
      const r = numberRect(n);
      const b = betAt(r.x + r.w / 2, r.y + r.h / 2)!;
      expect(b.kind).toBe('straight');
      expect(b.numbers).toEqual([n]);
    }
  });
});

describe('roulette wheel motion', () => {
  it('the ball comes to rest in exactly the pocket the engine drew', () => {
    for (let k = 0; k < EURO_WHEEL.length; k++) {
      for (const start of [0, 1.3, -2.2, 5.9]) {
        const plan = planSpin(1000, 6500, start, 0.7, start * 1.7 + 0.4, k);
        const end = 1000 + 6500;
        const b = ballAt(plan, end);
        expect(b.settled).toBe(true);
        expect(b.radius).toBeCloseTo(0, 6);
        const pocket = pocketAtAngle(b.angle, wheelRotationAt(plan, end));
        expect(pocket).toBe(k);
        // and it stays there afterwards as the wheel keeps turning
        const later = 1000 + 9000;
        const b2 = ballAt(plan, later);
        expect(pocketAtAngle(b2.angle, wheelRotationAt(plan, later))).toBe(k);
      }
    }
  });

  it('pocket angles invert correctly', () => {
    for (let k = 0; k < 37; k++) expect(pocketAtAngle(pocketLocalAngle(k) + 2, 2)).toBe(k);
  });
});

const h = (w: 'P' | 'B' | 'T'): BacHistoryEntry => ({ w, pt: 5, bt: 6, nat: false, pp: false, bp: false });

describe('baccarat roads', () => {
  it('bead plate fills columns top to bottom', () => {
    const cells = beadPlate(['B', 'P', 'T', 'B', 'B', 'P', 'P'].map((w) => h(w as 'P')));
    expect(cells[6]).toMatchObject({ col: 1, row: 0, w: 'P' });
    expect(cells[2]).toMatchObject({ col: 0, row: 2, w: 'T' });
  });

  it('big road starts a column on every change and marks ties', () => {
    const cells = bigRoad(['B', 'B', 'T', 'P', 'B', 'B', 'B'].map((w) => h(w as 'P')));
    expect(cells.map((c) => [c.col, c.row, c.w])).toEqual([
      [0, 0, 'B'],
      [0, 1, 'B'],
      [1, 0, 'P'],
      [2, 0, 'B'],
      [2, 1, 'B'],
      [2, 2, 'B'],
    ]);
    expect(cells[1].ties).toBe(1);
  });

  it('long streaks bend right (dragon tail)', () => {
    const cells = bigRoad(Array.from({ length: 9 }, () => h('B')));
    expect(cells.slice(5).map((c) => [c.col, c.row])).toEqual([
      [0, 5],
      [1, 5],
      [2, 5],
      [3, 5],
    ]);
    const next = bigRoad([...Array.from({ length: 9 }, () => h('B')), h('P')]);
    expect(next[next.length - 1]).toMatchObject({ col: 1, row: 0, w: 'P' });
  });

  it('counts results', () => {
    expect(shoeStats(['B', 'P', 'T', 'B'].map((w) => h(w as 'P')))).toMatchObject({ B: 2, P: 1, T: 1 });
  });
});
