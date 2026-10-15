import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import { newCore } from './helpers';
import { ARCHETYPES, liveFor, type LifeReport } from './agents';

/**
 * Long-run balance: four simulated lifestyles over four game months with the
 * same world seed. The bounds are deliberately broad — they catch a broken
 * economy (free money, runaway costs, a casino that pays), not small tuning.
 */
describe('long-term balance (4 game months)', () => {
  const DAYS = 112;
  const run = (name: keyof typeof ARCHETYPES): LifeReport => liveFor(newCore(7001), ARCHETYPES[name], DAYS);
  const results = {} as Record<keyof typeof ARCHETYPES, LifeReport>;

  it('a steady office job pays the bills and leaves savings', () => {
    const r = (results.diligent = run('diligent'));
    expect(r.conserved).toBe(true);
    expect(r.job).toBe('active');
    expect(r.end - r.start).toBeGreaterThan(G(6000));
    expect(r.end - r.start).toBeLessThan(G(14000));
    expect(r.min).toBeGreaterThan(r.start - G(500));
    expect(r.evicted).toBe(false);
  }, 60000);

  // (the simulated gambler hits until 17 and never doubles or splits: a house edge of about 6%)
  it('weekend blackjack eats most of what a working player would save, but the job and the flat survive it', () => {
    const r = (results.weekend = run('weekend'));
    expect(r.conserved).toBe(true);
    expect(r.casinoNet).toBeLessThan(0);
    expect(r.end).toBeLessThan((results.diligent ?? run('diligent')).end - G(3000));
    expect(r.end).toBeGreaterThan(r.start - G(5000));
    expect(r.job).toBe('active');
    expect(r.evicted).toBe(false);
  }, 60000);

  it('nightly heavy gambling drains a working player', () => {
    const r = (results.heavy = run('heavy'));
    expect(r.conserved).toBe(true);
    expect(r.casinoNet).toBeLessThan(0);
    expect(r.end).toBeLessThan((results.weekend ?? run('weekend')).end);
    expect(r.end).toBeLessThan(r.start - G(10000));
  }, 60000);

  it('without work, savings run down month by month', () => {
    const r = run('idle');
    expect(r.conserved).toBe(true);
    expect(r.job).toBe('fired');
    expect(r.end).toBeLessThan(r.start - G(6000));
    for (let i = 1; i < r.monthly.length; i++) expect(r.monthly[i]).toBeLessThan(r.monthly[i - 1]);
  }, 60000);
});
