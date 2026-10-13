import { describe, expect, it } from 'vitest';
import { G, formatG, mulRatio, percentBp, breakIntoChips, isMoney } from '../src/core/money';

describe('money helpers', () => {
  it('converts G to integer minor units', () => {
    expect(G(1)).toBe(100);
    expect(G(19000)).toBe(1900000);
    expect(G(0.1) + G(0.2)).toBe(G(0.3));
    expect(isMoney(G(12.34))).toBe(true);
  });

  it('formats amounts', () => {
    expect(formatG(G(1234))).toBe('1,234 G');
    expect(formatG(G(1234.5))).toBe('1,234.50 G');
    expect(formatG(-G(20))).toBe('-20 G');
    expect(formatG(G(5), { sign: true })).toBe('+5 G');
    expect(formatG(G(2500000), { compact: true })).toBe('2.5M G');
  });

  it('applies ratios with integer arithmetic', () => {
    expect(mulRatio(G(25), 3, 2)).toBe(G(37.5));
    expect(mulRatio(G(25), 6, 5)).toBe(G(30));
    expect(percentBp(G(100), 500)).toBe(G(5));
    expect(() => mulRatio(1.5, 1, 2)).toThrow();
  });

  it('breaks amounts into chips', () => {
    expect(breakIntoChips(G(137), [G(100), G(25), G(5), G(1)])).toEqual([G(100), G(25), G(5), G(5), G(1), G(1)]);
  });
});
