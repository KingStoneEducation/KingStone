import { describe, expect, it } from 'vitest';
import { Rng, hashString } from '../src/core/rng';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('differs between seeds and string seeds hash consistently', () => {
    expect(new Rng(1).nextU32()).not.toBe(new Rng(2).nextU32());
    expect(hashString('greyhaven')).toBe(hashString('greyhaven'));
    expect(new Rng('abc').nextU32()).toBe(new Rng('abc').nextU32());
  });

  it('restores from saved state and continues identically', () => {
    const a = new Rng(99);
    for (let i = 0; i < 50; i++) a.nextU32();
    const saved = a.getState();
    const seqA = Array.from({ length: 100 }, () => a.int(0, 1000));
    const b = new Rng(saved);
    const seqB = Array.from({ length: 100 }, () => b.int(0, 1000));
    expect(seqB).toEqual(seqA);
    // JSON round-trip of the state works too
    const c = new Rng(JSON.parse(JSON.stringify(saved)));
    expect(Array.from({ length: 100 }, () => c.int(0, 1000))).toEqual(seqA);
  });

  it('produces integers within range with a roughly uniform distribution', () => {
    const r = new Rng(7);
    const counts = new Array(10).fill(0);
    const n = 200000;
    for (let i = 0; i < n; i++) {
      const v = r.int(0, 9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(9);
      counts[v]++;
    }
    const expected = n / 10;
    const chi2 = counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
    // 9 degrees of freedom: p=0.001 critical value is 27.88
    expect(chi2).toBeLessThan(27.88);
  });

  it('floats are in [0,1)', () => {
    const r = new Rng(3);
    for (let i = 0; i < 10000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('shuffle is a permutation', () => {
    const r = new Rng(5);
    const arr = Array.from({ length: 416 }, (_, i) => i % 52);
    const copy = arr.slice();
    r.shuffle(arr);
    expect(arr.slice().sort((a, b) => a - b)).toEqual(copy.slice().sort((a, b) => a - b));
    expect(arr).not.toEqual(copy);
  });

  it('rejects invalid ranges', () => {
    const r = new Rng(1);
    expect(() => r.int(5, 1)).toThrow();
    expect(() => r.int(0.5, 3)).toThrow();
  });
});
