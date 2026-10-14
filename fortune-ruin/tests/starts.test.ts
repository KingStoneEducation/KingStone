import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import type { StartPreset } from '../src/core/newGame';
import { newCore, skip } from './helpers';

const start = (preset: StartPreset, seed = 77) => newCore(seed, { start: preset });

describe('starting presets', () => {
  it('the ordinary start is unchanged', () => {
    const c = start('ordinary');
    expect(c.economy.balance('cash')).toBe(G(1000));
    expect(c.economy.balance('bank')).toBe(G(19000));
    expect(c.career.activeJobs().map((j) => j.jobId)).toEqual(['office_clerk']);
    expect(c.state.housing.homeId).toBe('home_basic');
  });

  it('every start opens with the books balanced and a net worth that matches its story', () => {
    const expected: Record<StartPreset, [number, number]> = {
      ordinary: [G(19000), G(21000)],
      lottery: [G(815000), G(825000)],
      founder: [G(2400000), G(2700000)],
      heir: [G(6500000), G(7000000)],
    };
    for (const p of Object.keys(expected) as StartPreset[]) {
      const c = start(p);
      expect(c.economy.checkConservation().ok, p).toBe(true);
      const nw = c.economy.netWorth();
      expect(nw, p).toBeGreaterThanOrEqual(expected[p][0]);
      expect(nw, p).toBeLessThanOrEqual(expected[p][1]);
      expect(c.state.stats.peakNetWorth, p).toBe(nw);
    }
  });

  it('the rich starts live in a home they own, with no boss to answer to', () => {
    for (const [p, home] of [['founder', 'home_river'], ['heir', 'home_penthouse']] as const) {
      const c = start(p);
      expect(c.state.housing.tenure).toBe('own');
      expect(c.state.housing.owned).toEqual([home]);
      expect(c.state.world.location).toBe(home);
      expect(c.isAtHome()).toBe(true);
      expect(c.career.activeJobs()).toHaveLength(0);
      expect(c.state.phone.messages.some((m) => m.from === 'raymond')).toBe(false);
    }
    const heir = start('heir');
    expect(heir.state.player.vehicle).toBe('sports_car');
    expect(heir.state.casino.membership.tier).toBe('gold');
    expect(heir.social.rel('victor').met).toBe(true);
    const founder = start('founder');
    expect(founder.state.economy.holdings.GHX.units).toBe(3000);
  });

  it('a lottery win changes the bank balance and the gossip, not the job or the flat', () => {
    const c = start('lottery');
    expect(c.economy.balance('bank')).toBe(G(819000));
    expect(c.career.activeJobs().map((j) => j.jobId)).toEqual(['office_clerk']);
    expect(c.state.housing.homeId).toBe('home_basic');
    expect(c.state.social.beliefs.daniel.wealth?.estimate ?? 0).toBeGreaterThan(G(500000));
  });

  it('living like an heir comes with monthly bills: the penthouse, the car, the utilities', () => {
    const c = start('heir', 91);
    for (let d = 0; d < 62; d++) {
      skip(c, 16 * 60, 'idle');
      skip(c, 8 * 60, 'sleeping');
    }
    expect(c.economy.checkConservation().ok).toBe(true);
    const bills = c.state.economy.bills;
    const upkeep = bills.filter((b) => b.kind === 'maintenance');
    const car = bills.filter((b) => b.memo.includes('跑车'));
    expect(upkeep.length).toBeGreaterThanOrEqual(2);
    expect(upkeep[0].amount).toBe(G(2400));
    expect(car.length).toBeGreaterThanOrEqual(2);
    expect(bills.some((b) => b.kind === 'rent')).toBe(false);
    const paid = bills.filter((b) => b.paidDay !== null).reduce((a, b) => a + b.amount, 0);
    // one full month already paid: penthouse 2,400 + car 1,100 + utilities, phone, insurance
    expect(paid).toBeGreaterThan(G(4000));
  });
});
