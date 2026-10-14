import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { MINUTES_PER_DAY } from '../src/core/calendar';
import { BIZ_ORDER, BIZ_TYPES, PREMISES, RENOVATION_DAYS, type BizType } from '../src/data/business';
import { entryRefusal } from '../src/world/access';
import { ownShopMap } from '../src/world/maps/ownShop';
import { reachable } from '../src/world/gates';
import { newCore, skip } from './helpers';

const P = 'bakery_unit';

function opened(type: BizType, seed = 1): GameCore {
  const c = newCore(seed, { start: 'founder' });
  const r = c.business.lease(P, type);
  if (!r.ok) throw new Error(r.error);
  c.state.business!.phase = 'open';
  c.state.business!.openDay = c.today();
  return c;
}

/** Trade for n days straight from today. */
function trade(c: GameCore, n: number): void {
  const start = c.today();
  for (let i = 0; i < n; i++) c.business.simulateDay(start + i);
}

const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);

describe('leasing the empty shop on Market Street', () => {
  it('is locked until you sign, and needs the money up front', () => {
    const poor = newCore(1);
    expect(entryRefusal(poor, 'own_shop')).toContain('店铺转让');
    expect(poor.business.canLease(P, 'bakery')).toContain('需要');
    const c = newCore(2, { start: 'founder' });
    const before = c.economy.balance('bank') + c.economy.balance('cash');
    const worth = c.economy.netWorth();
    expect(c.business.lease(P, 'cafe').ok).toBe(true);
    expect(before - (c.economy.balance('bank') + c.economy.balance('cash'))).toBe(c.business.upfront(P, 'cafe'));
    // the deposit and the equipment keep some value; rent and most of the fit-out are spent
    const lost = worth - c.economy.netWorth();
    expect(lost).toBeGreaterThan(PREMISES[P].rent);
    expect(lost).toBeLessThan(BIZ_TYPES.cafe.fitout + PREMISES[P].rent);
    expect(entryRefusal(c, 'own_shop')).toBeNull();
    expect(c.business.canLease(P, 'bar')).toBe('你已经有一家店了');
  });

  it('opens after the renovation, settles every day, and pays rent and wages monthly', () => {
    const c = newCore(3, { start: 'founder' });
    c.business.lease(P, 'bakery');
    skip(c, RENOVATION_DAYS * MINUTES_PER_DAY + 60, 'sleeping');
    expect(c.state.business!.phase).toBe('open');
    skip(c, 30 * MINUTES_PER_DAY, 'sleeping');
    const b = c.state.business!;
    expect(b.days.length).toBeGreaterThanOrEqual(28);
    const settlements = c.state.economy.ledger.filter((t) => t.memo.includes('日结'));
    expect(settlements.length).toBe(b.days.filter((d) => d.net !== 0).length);
    const bills = c.state.economy.bills.map((x) => x.memo).join('|');
    expect(bills).toContain('房租');
    expect(bills).toContain('员工工资');
    expect(c.economy.checkConservation().ok).toBe(true);
  });
});

describe('how the shop does follows how it is run', () => {
  it('lower prices bring more customers, higher prices fewer', () => {
    const cust = (price: 'low' | 'high') => {
      const c = opened('cafe', 7);
      c.business.setPolicy({ price, staff: 4 });
      c.state.business!.awareness = 0.8;
      trade(c, 60);
      return avg(c.state.business!.days.map((d) => d.customers));
    };
    expect(cust('low')).toBeGreaterThan(cust('high') * 1.3);
  });

  it('better supplies earn a better reputation', () => {
    const rep = (supplies: 'basic' | 'premium') => {
      const c = opened('bakery', 8);
      c.business.setPolicy({ supplies });
      trade(c, 60);
      return c.state.business!.reputation;
    };
    expect(rep('premium')).toBeGreaterThan(rep('basic') + 10);
  });

  it('marketing spreads the word faster', () => {
    const aware = (marketing: number) => {
      const c = opened('cafe', 9);
      c.business.setPolicy({ marketing });
      trade(c, 30);
      return c.state.business!.awareness;
    };
    expect(aware(2)).toBeGreaterThan(aware(0) + 0.2);
  });

  it('too few staff caps how many people can be served', () => {
    const c = opened('bar', 10);
    c.business.setPolicy({ staff: 1 });
    c.state.business!.awareness = 1;
    trade(c, 30);
    expect(Math.max(...c.state.business!.days.map((d) => d.customers))).toBeLessThanOrEqual(BIZ_TYPES.bar.perStaff);
  });

  it('a well-run café makes money after half a year; a badly run one keeps losing', () => {
    let good = 0;
    let bad = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const g = opened('cafe', seed);
      g.business.setPolicy({ price: 'mid', supplies: 'premium', staff: g.business.staffNeeded(), marketing: 1 });
      trade(g, 168);
      if (g.business.monthlyProfit() > 0) good++;
      const b = opened('cafe', seed);
      b.business.setPolicy({ price: 'high', supplies: 'basic', staff: 1, marketing: 0 });
      trade(b, 168);
      if (b.business.monthlyProfit() < 0) bad++;
    }
    expect(good).toBeGreaterThanOrEqual(4);
    expect(bad).toBeGreaterThanOrEqual(4);
  });
});

describe('working there, selling up, closing down', () => {
  it('a shift is only possible in the shop, once a day', () => {
    const c = opened('cafe', 11);
    expect(c.business.workShift().ok).toBe(false);
    c.setLocation('own_shop', -1, -1);
    expect(c.business.workShift().ok).toBe(true);
    expect(c.business.workShift().ok).toBe(false);
  });

  it('the business counts in net worth, and selling it turns that into money', () => {
    const c = opened('convenience', 12);
    c.business.setPolicy({ supplies: 'premium', marketing: 1 });
    trade(c, 40);
    const value = c.business.value();
    expect(value).toBeGreaterThan(c.state.business!.deposit);
    const bank = c.economy.balance('bank');
    const offer = c.business.offer();
    expect(c.business.sell().ok).toBe(true);
    expect(c.economy.balance('bank') - bank).toBe(offer);
    expect(c.state.business).toBeNull();
    expect(entryRefusal(c, 'own_shop')).not.toBeNull();
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('closing returns the deposit and what the equipment fetches', () => {
    const c = opened('boutique', 13);
    const b = c.state.business!;
    const back = b.deposit + Math.round(b.fitout * 0.12);
    const bank = c.economy.balance('bank');
    expect(c.business.close().ok).toBe(true);
    expect(c.economy.balance('bank') - bank).toBe(back);
  });
});

describe('the shop interior', () => {
  it('every kind of shop, and the bare unit, can be walked through and every counter reached', () => {
    const variants = [null, ...BIZ_ORDER.map((t) => ({ t, phase: 'open' as const })), { t: 'cafe' as BizType, phase: 'renovating' as const }];
    for (const v of variants) {
      const c = v ? opened(v.t, 20) : newCore(20);
      if (v && v.phase === 'renovating') c.state.business!.phase = 'renovating';
      if (v) trade(c, 3);
      const m = ownShopMap(c.state.business ?? null);
      const start = m.spawns.entry;
      const acc = reachable(m, start.x, start.y);
      for (const it of m.interactables) {
        const near = [
          [it.x, it.y + it.h],
          [it.x - 1, it.y],
          [it.x + it.w, it.y],
          [it.x, it.y - 1],
          [it.x, it.y],
        ].some(([x, y]) => x >= 0 && y >= 0 && x < m.w && y < m.h && acc[y * m.w + x]);
        expect(near, `${v?.t ?? 'empty'} ${it.interact.label}`).toBe(true);
      }
      const door = m.doors[0];
      expect(acc[(door.y - 1) * m.w + door.x]).toBeTruthy();
      if (v?.phase === 'open') expect(m.interactables.some((i) => i.interact.kind === 'business')).toBe(true);
    }
  });

  it('staff behind the counter follow how many you employ', () => {
    const c = opened('cafe', 21);
    c.business.setPolicy({ staff: 2 });
    expect(ownShopMap(c.state.business!).staff.filter((s) => s.label === '店员').length).toBe(2);
    c.business.setPolicy({ staff: 3 });
    expect(ownShopMap(c.state.business!).staff.filter((s) => s.label === '店员').length).toBe(3);
  });
});
