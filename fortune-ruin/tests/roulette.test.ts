import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import {
  EURO_WHEEL,
  RED_NUMBERS,
  ROULETTE_PAYOUTS,
  createRouletteTable,
  isValidBetShape,
  numberColor,
  outsideNumbers,
  ownersBelowMinimum,
  placeRouletteBet,
  settleRouletteBet,
  spinWheel,
  validateRouletteBet,
  clearRouletteRound,
  type RouletteBet,
  type RouletteBetKind,
} from '../src/casino/RouletteEngine';

const rules = { minTotal: G(5), maxInside: G(200), maxOutside: G(2000), laPartage: false };

describe('wheel layout', () => {
  it('has 37 unique pockets 0..36 in the European order', () => {
    expect(EURO_WHEEL.length).toBe(37);
    expect(new Set(EURO_WHEEL).size).toBe(37);
    expect([...EURO_WHEEL].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i));
    expect(EURO_WHEEL.slice(0, 5)).toEqual([0, 32, 15, 19, 4]);
  });

  it('has 18 red, 18 black and one green, alternating around the wheel', () => {
    expect(RED_NUMBERS.size).toBe(18);
    expect(numberColor(0)).toBe('green');
    for (let i = 1; i < EURO_WHEEL.length - 1; i++) {
      expect(numberColor(EURO_WHEEL[i])).not.toBe(numberColor(EURO_WHEEL[i + 1]));
    }
  });
});

describe('bet shapes', () => {
  it('accepts valid inside bets', () => {
    expect(isValidBetShape('straight', [17])).toBe(true);
    expect(isValidBetShape('split', [17, 20])).toBe(true);
    expect(isValidBetShape('split', [17, 18])).toBe(true);
    expect(isValidBetShape('split', [0, 2])).toBe(true);
    expect(isValidBetShape('street', [16, 17, 18])).toBe(true);
    expect(isValidBetShape('corner', [17, 18, 20, 21])).toBe(true);
    expect(isValidBetShape('line', [1, 2, 3, 4, 5, 6])).toBe(true);
    expect(isValidBetShape('trio', [0, 1, 2])).toBe(true);
    expect(isValidBetShape('basket', [0, 1, 2, 3])).toBe(true);
  });

  it('rejects impossible inside bets', () => {
    expect(isValidBetShape('split', [3, 4])).toBe(false);
    expect(isValidBetShape('split', [1, 5])).toBe(false);
    expect(isValidBetShape('split', [0, 4])).toBe(false);
    expect(isValidBetShape('street', [2, 3, 4])).toBe(false);
    expect(isValidBetShape('corner', [3, 4, 6, 7])).toBe(false);
    expect(isValidBetShape('line', [2, 3, 4, 5, 6, 7])).toBe(false);
    expect(isValidBetShape('line', [34, 35, 36, 37, 38, 39])).toBe(false);
    expect(isValidBetShape('straight', [37])).toBe(false);
    expect(isValidBetShape('red', [1, 2, 3])).toBe(false);
  });

  it('outside bets cover the right numbers', () => {
    expect(outsideNumbers('dozen', 1)).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
    expect(outsideNumbers('column', 0)).toEqual([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]);
    expect(outsideNumbers('column', 2)).toContain(36);
    expect(outsideNumbers('red').length).toBe(18);
    expect(outsideNumbers('low')).not.toContain(0);
    expect(outsideNumbers('even')).not.toContain(0);
  });
});

/** Every bet position on the layout, used for exhaustive payout checks. */
function allBetShapes(): { kind: RouletteBetKind; numbers: number[] }[] {
  const out: { kind: RouletteBetKind; numbers: number[] }[] = [];
  for (let n = 0; n <= 36; n++) out.push({ kind: 'straight', numbers: [n] });
  for (let a = 0; a <= 36; a++) for (let b = a + 1; b <= 36; b++) if (isValidBetShape('split', [a, b])) out.push({ kind: 'split', numbers: [a, b] });
  for (let k = 0; k < 12; k++) out.push({ kind: 'street', numbers: [3 * k + 1, 3 * k + 2, 3 * k + 3] });
  for (let n = 1; n <= 32; n++) if (n % 3 !== 0) out.push({ kind: 'corner', numbers: [n, n + 1, n + 3, n + 4] });
  for (let k = 0; k < 11; k++) out.push({ kind: 'line', numbers: Array.from({ length: 6 }, (_, i) => 3 * k + 1 + i) });
  out.push({ kind: 'trio', numbers: [0, 1, 2] }, { kind: 'trio', numbers: [0, 2, 3] }, { kind: 'basket', numbers: [0, 1, 2, 3] });
  for (let i = 0; i < 3; i++) out.push({ kind: 'dozen', numbers: outsideNumbers('dozen', i) }, { kind: 'column', numbers: outsideNumbers('column', i) });
  for (const k of ['red', 'black', 'odd', 'even', 'low', 'high'] as const) out.push({ kind: k, numbers: outsideNumbers(k) });
  return out;
}

describe('settlement', () => {
  it('pays the published odds', () => {
    const bet = (kind: RouletteBetKind, numbers: number[]): RouletteBet => ({ owner: 'p', kind, numbers, amount: G(10) });
    expect(settleRouletteBet(bet('straight', [17]), 17, rules).payout).toBe(G(360));
    expect(settleRouletteBet(bet('split', [17, 20]), 20, rules).payout).toBe(G(180));
    expect(settleRouletteBet(bet('street', [16, 17, 18]), 18, rules).payout).toBe(G(120));
    expect(settleRouletteBet(bet('corner', [17, 18, 20, 21]), 21, rules).payout).toBe(G(90));
    expect(settleRouletteBet(bet('line', [1, 2, 3, 4, 5, 6]), 4, rules).payout).toBe(G(60));
    expect(settleRouletteBet(bet('dozen', outsideNumbers('dozen', 0)), 12, rules).payout).toBe(G(30));
    expect(settleRouletteBet(bet('column', outsideNumbers('column', 1)), 14, rules).payout).toBe(G(30));
    expect(settleRouletteBet(bet('red', outsideNumbers('red')), 3, rules).payout).toBe(G(20));
    expect(settleRouletteBet(bet('red', outsideNumbers('red')), 2, rules).payout).toBe(0);
    expect(settleRouletteBet(bet('even', outsideNumbers('even')), 0, rules).payout).toBe(0);
    expect(settleRouletteBet(bet('high', outsideNumbers('high')), 19, rules).payout).toBe(G(20));
  });

  it('every position returns exactly 36/37 of the stake on average', () => {
    for (const shape of allBetShapes()) {
      const b: RouletteBet = { owner: 'p', kind: shape.kind, numbers: shape.numbers, amount: G(37) };
      let total = 0;
      for (let r = 0; r <= 36; r++) total += settleRouletteBet(b, r, rules).payout;
      expect(total / 37, `${shape.kind} ${shape.numbers.join(',')}`).toBe(G(36));
      expect(ROULETTE_PAYOUTS[shape.kind] + 1).toBe(36 / shape.numbers.length);
    }
  });

  it('la partage returns half of even-money bets on zero', () => {
    const lp = { ...rules, laPartage: true };
    const b: RouletteBet = { owner: 'p', kind: 'black', numbers: outsideNumbers('black'), amount: G(10) };
    expect(settleRouletteBet(b, 0, lp).payout).toBe(G(5));
    const s: RouletteBet = { owner: 'p', kind: 'dozen', numbers: outsideNumbers('dozen', 0), amount: G(10) };
    expect(settleRouletteBet(s, 0, lp).payout).toBe(0);
  });
});

describe('table', () => {
  it('enforces limits and minimum totals', () => {
    const t = createRouletteTable('r', rules, 1);
    expect(validateRouletteBet(t, 'p', 'straight', [5], G(201))).not.toBeNull();
    expect(validateRouletteBet(t, 'p', 'red', outsideNumbers('red'), G(2000))).toBeNull();
    expect(validateRouletteBet(t, 'p', 'split', [3, 4], G(10))).not.toBeNull();
    placeRouletteBet(t, 'p', 'straight', [5], G(150));
    expect(() => placeRouletteBet(t, 'p', 'straight', [5], G(60))).toThrow();
    placeRouletteBet(t, 'q', 'straight', [7], G(1));
    expect(ownersBelowMinimum(t)).toEqual(['q']);
    expect(() => spinWheel(t)).toThrow();
  });

  it('spins reproducibly and pays the matching pocket', () => {
    const a = createRouletteTable('r', rules, 'seed-x');
    const b = createRouletteTable('r', rules, 'seed-x');
    for (let i = 0; i < 50; i++) {
      placeRouletteBet(a, 'p', 'red', outsideNumbers('red'), G(10));
      placeRouletteBet(b, 'p', 'red', outsideNumbers('red'), G(10));
      const ra = spinWheel(a);
      const rb = spinWheel(b);
      expect(ra.result).toBe(rb.result);
      expect(EURO_WHEEL[ra.pocketIndex]).toBe(ra.result);
      expect(ra.settlements[0].payout).toBe(RED_NUMBERS.has(ra.result) ? G(20) : 0);
      clearRouletteRound(a);
      clearRouletteRound(b);
    }
  });

  it('pockets are uniformly distributed', () => {
    const t = createRouletteTable('r', rules, 'uniform');
    const counts = new Array(37).fill(0);
    const n = 185000;
    for (let i = 0; i < n; i++) {
      counts[spinWheel(t).result]++;
      clearRouletteRound(t);
    }
    const e = n / 37;
    const chi2 = counts.reduce((acc, c) => acc + (c - e) ** 2 / e, 0);
    // 36 degrees of freedom, p = 0.001 critical value ≈ 67.99
    expect(chi2).toBeLessThan(67.99);
  });
});
