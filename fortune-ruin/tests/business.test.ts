import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/core/GameCore';
import { MINUTES_PER_DAY, toDate } from '../src/core/calendar';
import { G } from '../src/core/money';
import { BIZ_ORDER, BIZ_TYPES, PREMISES, PREMISE_ORDER, RENOVATION_DAYS, type BizType } from '../src/data/business';
import { deserialize, migrate, serialize } from '../src/systems/SaveManager';
import { buildCityMap } from '../src/world/maps/city';
import { BUILDING_BY_ID } from '../src/world/maps/cityLayout';
import { entryRefusal } from '../src/world/access';
import { ownShopMap } from '../src/world/maps/ownShop';
import { reachable } from '../src/world/gates';
import { newCore, skip } from './helpers';

const P = 'bakery_unit';

function opened(type: BizType, seed = 1): GameCore {
  const c = newCore(seed, { start: 'founder' });
  const r = c.business.lease(P, type);
  if (!r.ok) throw new Error(r.error);
  c.business.at(P)!.phase = 'open';
  c.business.at(P)!.openDay = c.today();
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
    expect(c.business.canLease(P, 'bar')).toBe('这个铺面已经是你的了');
  });

  it('opens after the renovation, settles every day, and pays rent and wages monthly', () => {
    const c = newCore(3, { start: 'founder' });
    c.business.lease(P, 'bakery');
    skip(c, RENOVATION_DAYS * MINUTES_PER_DAY + 60, 'sleeping');
    expect(c.business.at(P)!.phase).toBe('open');
    skip(c, 30 * MINUTES_PER_DAY, 'sleeping');
    const b = c.business.at(P)!;
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
      c.business.setPolicy(P, { price, staff: 4 });
      c.business.at(P)!.awareness = 0.8;
      trade(c, 60);
      return avg(c.business.at(P)!.days.map((d) => d.customers));
    };
    expect(cust('low')).toBeGreaterThan(cust('high') * 1.3);
  });

  it('better supplies earn a better reputation', () => {
    const rep = (supplies: 'basic' | 'premium') => {
      const c = opened('bakery', 8);
      c.business.setPolicy(P, { supplies });
      trade(c, 60);
      return c.business.at(P)!.reputation;
    };
    expect(rep('premium')).toBeGreaterThan(rep('basic') + 10);
  });

  it('marketing spreads the word faster', () => {
    const aware = (marketing: number) => {
      const c = opened('cafe', 9);
      c.business.setPolicy(P, { marketing });
      trade(c, 30);
      return c.business.at(P)!.awareness;
    };
    expect(aware(2)).toBeGreaterThan(aware(0) + 0.2);
  });

  it('too few staff caps how many people can be served', () => {
    const c = opened('bar', 10);
    c.business.setPolicy(P, { staff: 1 });
    c.business.at(P)!.awareness = 1;
    trade(c, 30);
    expect(Math.max(...c.business.at(P)!.days.map((d) => d.customers))).toBeLessThanOrEqual(BIZ_TYPES.bar.perStaff);
  });

  it('a well-run café makes money after half a year; a badly run one keeps losing', () => {
    let good = 0;
    let bad = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const g = opened('cafe', seed);
      g.business.setPolicy(P, { price: 'mid', supplies: 'premium', staff: g.business.staffNeeded(g.business.at(P)!), marketing: 1 });
      trade(g, 168);
      if (g.business.monthlyProfit(g.business.at(P)!) > 0) good++;
      const b = opened('cafe', seed);
      b.business.setPolicy(P, { price: 'high', supplies: 'basic', staff: 1, marketing: 0 });
      trade(b, 168);
      if (b.business.monthlyProfit(b.business.at(P)!) < 0) bad++;
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
    c.business.setPolicy(P, { supplies: 'premium', marketing: 1 });
    trade(c, 40);
    const value = c.business.value();
    expect(value).toBeGreaterThan(c.business.at(P)!.deposit);
    const bank = c.economy.balance('bank');
    const offer = c.business.offer(c.business.at(P)!);
    expect(c.business.sell(P).ok).toBe(true);
    expect(c.economy.balance('bank') - bank).toBe(offer);
    expect(c.business.at(P)).toBeUndefined();
    expect(entryRefusal(c, 'own_shop')).not.toBeNull();
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('closing returns the deposit and what the equipment fetches', () => {
    const c = opened('boutique', 13);
    const b = c.business.at(P)!;
    const back = b.deposit + Math.round(b.fitout * 0.12);
    const bank = c.economy.balance('bank');
    expect(c.business.close(P).ok).toBe(true);
    expect(c.economy.balance('bank') - bank).toBe(back);
  });
});

describe('the shop interior', () => {
  it('every kind of shop, and the bare unit, can be walked through and every counter reached', () => {
    const variants = [null, ...BIZ_ORDER.map((t) => ({ t, phase: 'open' as const })), { t: 'cafe' as BizType, phase: 'renovating' as const }];
    for (const v of variants) {
      const c = v ? opened(v.t, 20) : newCore(20);
      if (v && v.phase === 'renovating') c.business.at(P)!.phase = 'renovating';
      if (v) trade(c, 3);
      const m = ownShopMap(PREMISES[P], c.business.at(P) ?? null);
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
    c.business.setPolicy(P, { staff: 2 });
    expect(ownShopMap(PREMISES[P], c.business.at(P)!).staff.filter((s) => s.label === '店员').length).toBe(2);
    c.business.setPolicy(P, { staff: 3 });
    expect(ownShopMap(PREMISES[P], c.business.at(P)!).staff.filter((s) => s.label === '店员').length).toBe(3);
  });
});

describe('more than one street, more than one shop', () => {
  const rich = (seed: number) => {
    const c = newCore(seed, { start: 'founder' });
    c.economy.receive('bank', G(400000), 'gift_received', '测试用资金', 'test');
    return c;
  };
  const open = (c: GameCore, premise: string, type: BizType) => {
    const r = c.business.lease(premise, type);
    if (!r.ok) throw new Error(r.error);
    const b = c.business.at(premise)!;
    b.phase = 'open';
    b.openDay = c.today();
    b.awareness = 0.9;
    return b;
  };
  /** Average customers a day on weekdays and at weekends over eight weeks. */
  const crowd = (premise: string, type: BizType, seed = 40) => {
    const c = rich(seed);
    const b = open(c, premise, type);
    c.business.setPolicy(premise, { staff: 6 });
    trade(c, 56);
    const day = (d: { day: number }) => toDate(d.day * MINUTES_PER_DAY).weekday;
    return { weekday: avg(b.days.filter((d) => day(d) < 5).map((d) => d.customers)), weekend: avg(b.days.filter((d) => day(d) >= 5).map((d) => d.customers)) };
  };

  it('each unit is locked until you sign for it, has its own building on the map, and its own way in', () => {
    const map = buildCityMap();
    const c = rich(41);
    for (const id of PREMISE_ORDER) {
      const p = PREMISES[id];
      expect(entryRefusal(c, p.location), id).toContain('招租');
      const bd = BUILDING_BY_ID[p.building];
      expect(bd.target).toBe(p.location);
      expect(map.buildings).toContain(p.building);
      expect(map.spawns[`door:${p.location}`], id).toBeDefined();
      const m = ownShopMap(p, null);
      expect(m.id).toBe(p.location);
      expect(m.doors[0]).toMatchObject({ target: 'city', spawn: `door:${p.location}` });
    }
    open(c, 'union_unit', 'cafe');
    expect(entryRefusal(c, 'own_shop_union')).toBeNull();
    expect(entryRefusal(c, 'own_shop_park')).toContain('招租');
  });

  it('the street matters: the square is busy on weekdays and quiet at weekends, the park the other way round', () => {
    const market = crowd('bakery_unit', 'cafe');
    const union = crowd('union_unit', 'cafe');
    const park = crowd('park_unit', 'cafe');
    expect(union.weekday).toBeGreaterThan(market.weekday * 1.5);
    expect(union.weekend).toBeLessThan(union.weekday);
    expect(park.weekend).toBeGreaterThan(park.weekday * 1.6);
    // fewer people pass the park on a weekday than Market Street (a convenience store suits neither more than the other)
    expect(crowd('park_unit', 'convenience').weekday).toBeLessThan(crowd('bakery_unit', 'convenience').weekday);
    // what suits the street: a boutique sells on the square, not in the park
    expect(crowd('union_unit', 'boutique').weekday).toBeGreaterThan(crowd('park_unit', 'boutique').weekday * 2.5);
    expect(PREMISES.union_unit.rent).toBeGreaterThan(PREMISES.bakery_unit.rent * 2);
    expect(PREMISES.park_unit.rent).toBeLessThan(PREMISES.bakery_unit.rent);
  });

  it('two shops at once: each is settled, billed and run on its own, and selling one leaves the other', () => {
    const c = rich(42);
    const a = open(c, 'bakery_unit', 'bakery');
    const b = open(c, 'park_unit', 'cafe');
    expect(c.business.list().length).toBe(2);
    trade(c, 10);
    expect(a.days.length).toBe(10);
    expect(b.days.length).toBe(10);
    const memos = c.state.economy.ledger.filter((t) => t.memo.includes('日结')).map((t) => t.memo);
    expect(memos.filter((m) => m.startsWith(PREMISES.bakery_unit.address)).length).toBe(a.days.filter((d) => d.net !== 0).length);
    expect(memos.filter((m) => m.startsWith(PREMISES.park_unit.address)).length).toBe(b.days.filter((d) => d.net !== 0).length);
    c.business.monthlyBills();
    const rents = c.state.economy.bills.filter((x) => x.memo.endsWith('房租'));
    expect(rents.map((x) => [x.payeeName, x.amount])).toEqual([
      [PREMISES.bakery_unit.landlord, PREMISES.bakery_unit.rent],
      [PREMISES.park_unit.landlord, PREMISES.park_unit.rent],
    ]);
    // policies are per shop
    c.business.setPolicy('park_unit', { price: 'high' });
    expect(a.price).toBe('mid');
    expect(b.price).toBe('high');
    // a shift is in the shop you are standing in
    c.setLocation('own_shop_park', -1, -1);
    expect(c.business.workShift().ok).toBe(true);
    expect(b.shiftDay).toBe(c.today());
    expect(a.shiftDay).toBe(-1);
    // net worth counts both; closing one keeps the other going
    expect(c.business.value()).toBe(c.business.valueOf(a) + c.business.valueOf(b));
    expect(c.business.close('bakery_unit').ok).toBe(true);
    expect(c.business.list()).toEqual([b]);
    expect(entryRefusal(c, 'own_shop')).toContain('店铺转让');
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('a save from when there was only ever one shop loads with that shop', () => {
    const c = opened('bar', 43);
    // the state as an older version of the game saved it
    const raw = JSON.parse(JSON.stringify(c.state));
    raw.business = raw.businesses[0];
    delete raw.businesses;
    const loaded = new GameCore(migrate(raw));
    expect(new GameCore(deserialize(serialize(loaded, 'slot1'))).business.list().length).toBe(1);
    expect(loaded.business.list().map((x) => [x.premise, x.type])).toEqual([[P, 'bar']]);
    expect((loaded.state as unknown as Record<string, unknown>).business).toBeUndefined();
  });

  it('every unit can be walked through with any kind of shop in it', () => {
    for (const id of PREMISE_ORDER) {
      for (const t of BIZ_ORDER) {
        const c = rich(44);
        const b = open(c, id, t);
        trade(c, 2);
        const m = ownShopMap(PREMISES[id], b);
        const acc = reachable(m, m.spawns.entry.x, m.spawns.entry.y);
        for (const it of m.interactables) {
          const near = [
            [it.x, it.y + it.h],
            [it.x - 1, it.y],
            [it.x + it.w, it.y],
            [it.x, it.y - 1],
          ].some(([x, y]) => x >= 0 && y >= 0 && x < m.w && y < m.h && acc[y * m.w + x]);
          expect(near, `${id} ${t} ${it.interact.label}`).toBe(true);
        }
      }
    }
  });
});
