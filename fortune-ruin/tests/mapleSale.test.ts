import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { MINUTES_PER_DAY } from '../src/core/calendar';
import { G, mulRatio } from '../src/core/money';
import { HOMES } from '../src/data/housing';
import { SITTING_TENANT, mapleGoodwill } from '../src/systems/StorySystem';
import { newCore } from './helpers';

function lastMessageFrom(core: GameCore, from: string) {
  return [...core.state.phone.messages].reverse().find((m) => m.from === from && m.actions?.length);
}

function answer(core: GameCore, from: string, suffix: string): string {
  const m = lastMessageFrom(core, from)!;
  const a = m.actions!.find((x) => x.id.endsWith(suffix))!;
  return core.phone.respond(m.id, a.id);
}

/** The storyline's daily checks, day after day, without living through the days in between. */
function storyDays(core: GameCore, n: number): void {
  for (let i = 0; i < n; i++) {
    core.state.time.minutes += MINUTES_PER_DAY;
    core.stories.dailyPass();
  }
}

const raised = (rent: number, pct: number) => Math.round((rent * (100 + pct)) / 100 / 100) * 100;

describe('Maple Court changes hands', () => {
  it('the tenant can buy 3B from Margaret for less than the market, and stays put; every G is in the ledger', () => {
    const c = newCore(41);
    expect(c.housing.landlord()).toEqual({ id: 'margaret', name: '房东玛格丽特', margaret: true });
    c.economy.receive('bank', G(200000), 'other', 'test');
    const st = c.stories.begin('maple_sale');
    expect(st.stage).toBe('notice');
    expect(lastMessageFrom(c, 'margaret')!.actions!.map((a) => a.id.split('.').pop())).toEqual(['buy', 'family', 'fine']);
    answer(c, 'margaret', 'notice.buy');
    expect(c.stories.active('maple_sale')!.stage).toBe('offer');
    const price = Number(st.data.price);
    const market = c.housing.marketValue('home_basic');
    expect(price).toBeLessThan(market);
    expect(Math.abs(price - market * SITTING_TENANT)).toBeLessThanOrEqual(G(50));
    const bank = c.economy.balance('bank');
    const deposit = c.state.housing.rent;
    const furniture = JSON.stringify(c.state.housing.furniture);
    const journal = c.state.journal.entries.length;
    answer(c, 'margaret', 'offer.cash');
    expect(c.stories.active('maple_sale')).toBeUndefined();
    expect(c.state.stories.done.at(-1)).toMatchObject({ arc: 'maple_sale', ending: 'bought' });
    const h = c.state.housing;
    expect(h).toMatchObject({ homeId: 'home_basic', tenure: 'own', rent: 0, pendingRent: null });
    expect(h.owned).toContain('home_basic');
    // the agreed price and 2% duty go out, the deposit comes back
    expect(c.economy.balance('bank')).toBe(bank - price - mulRatio(price, 2, 100) + deposit);
    expect(c.state.economy.ledger.some((t) => t.cat === 'property_purchase' && t.amount === price && t.to === 'ext:margaret')).toBe(true);
    expect(c.economy.checkConservation().ok).toBe(true);
    // nothing moved: the furniture stands where it stood, and nobody hears of a move
    expect(JSON.stringify(h.furniture)).toBe(furniture);
    expect(c.state.journal.entries.slice(journal).some((e) => e.text.startsWith('买下了枫庭公寓'))).toBe(false);
    expect(c.social.memoriesOf('margaret').some((m) => m.kind === 'bought_flat')).toBe(true);
    // the rest of the building went to the developer, and she does not sell it twice
    expect(h.mapleSoldTo).toBe('港湾置业');
    storyDays(c, 60);
    expect(c.stories.active('maple_sale')).toBeUndefined();
  });

  it('or with a mortgage: a fifth down, the rest borrowed from the bank', () => {
    const c = newCore(42);
    c.state.player.creditScore = 720;
    c.economy.receive('bank', G(15000), 'other', 'test');
    c.stories.begin('maple_sale');
    answer(c, 'margaret', 'notice.buy');
    const price = Number(c.stories.active('maple_sale')!.data.price);
    answer(c, 'margaret', 'offer.loan');
    expect(c.state.stories.done.at(-1)?.ending).toBe('bought');
    const m = c.state.economy.loans.find((l) => l.kind === 'mortgage' && l.status === 'active')!;
    expect(m.principal).toBe(price - mulRatio(price, 20, 100));
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('without the money the offer stays open for ten days; then she sells to the highest bidder', () => {
    const c = newCore(43);
    c.stories.begin('maple_sale');
    answer(c, 'margaret', 'notice.buy');
    expect(answer(c, 'margaret', 'offer.cash')).toContain('没能买下');
    expect(c.stories.active('maple_sale')!.stage).toBe('offer');
    expect(lastMessageFrom(c, 'margaret')!.resolved).toBeFalsy();
    expect(c.stories.talk('margaret')).toContain('想好了吗');
    expect(c.stories.talk('kiki')).toBeNull();
    storyDays(c, 10);
    expect(c.stories.active('maple_sale')!.stage).toBe('pending');
    expect(c.state.housing.tenure).toBe('rent');
  });

  it('if nothing is said she takes the best offer: the developer puts the rent up 30% and sends the bills from then on', () => {
    const c = newCore(44);
    const rent = c.state.housing.rent;
    c.stories.begin('maple_sale');
    storyDays(c, 7);
    expect(c.stories.active('maple_sale')!.stage).toBe('pending');
    storyDays(c, 14);
    expect(c.state.stories.done.at(-1)).toMatchObject({ arc: 'maple_sale', ending: 'company' });
    const h = c.state.housing;
    expect(h.mapleSoldTo).toBe('港湾置业');
    expect(h.pendingRent!.amount).toBe(raised(rent, 30));
    expect(c.housing.landlord()).toEqual({ id: 'landlord:home_basic', name: '港湾置业', margaret: false });
    expect(c.state.phone.messages.some((m) => m.fromName === '港湾置业' && m.body.includes('3B'))).toBe(true);
    // from the month it takes effect, the rent is the new one and it is owed to the new owner
    c.state.time.minutes = h.pendingRent!.effectiveDay * MINUTES_PER_DAY + 9 * 60;
    c.housing.issueMonthlyBills();
    const bill = c.state.economy.bills.filter((b) => b.kind === 'rent').at(-1)!;
    expect(bill).toMatchObject({ payee: 'landlord:home_basic', payeeName: '港湾置业', amount: raised(rent, 30) });
    expect(h.rent).toBe(raised(rent, 30));
  });

  it('asking her to sell to the family who keep the tenants on works far more often for a good tenant than for a late payer', () => {
    const good = (seed: number) => {
      const c = newCore(seed);
      const r = c.social.rel('margaret');
      r.affection = 40;
      r.trust = 40;
      return c;
    };
    const late = (seed: number) => {
      const c = newCore(seed);
      for (let i = 0; i < 4; i++) c.social.applyDirect('margaret', { kind: 'rent_late', facets: { unreliability: 0.6 }, importance: 28 }, { source: 'witnessed', silent: true });
      return c;
    };
    expect(mapleGoodwill(good(1))).toBeGreaterThan(mapleGoodwill(late(1)) + 0.4);
    const kept = [0, 0];
    let family: GameCore | null = null;
    for (let seed = 1; seed <= 30; seed++)
      [good, late].forEach((make, k) => {
        const c = make(seed);
        c.stories.begin('maple_sale');
        answer(c, 'margaret', 'notice.family');
        if (c.stories.active('maple_sale')!.data.buyer === 'family') {
          kept[k]++;
          family ??= c;
        }
      });
    expect(kept[0]).toBeGreaterThan(18);
    expect(kept[1]).toBeLessThan(8);
    // the family keep the rent close to where it was
    const c = family!;
    const rent = c.state.housing.rent;
    storyDays(c, 21);
    expect(c.state.stories.done.at(-1)).toMatchObject({ arc: 'maple_sale', ending: 'family' });
    expect(c.state.housing.pendingRent!.amount).toBe(raised(rent, 5));
    expect(c.housing.landlord().name).toBe('新房东林先生');
  });

  it('a tenant who moves out before the sale is not charged the new rent anywhere else', () => {
    const c = newCore(46);
    c.economy.receive('bank', G(50000), 'other', 'test');
    c.state.player.creditScore = 800;
    c.stories.begin('maple_sale');
    answer(c, 'margaret', 'notice.fine');
    const r = c.housing.rent('home_downtown');
    expect(r.ok, r.ok ? '' : r.error).toBe(true);
    storyDays(c, 21);
    expect(c.state.stories.done.at(-1)).toMatchObject({ arc: 'maple_sale', ending: 'company' });
    expect(c.state.housing.pendingRent).toBeNull();
    expect(c.state.housing.rent).toBe(HOMES.home_downtown.rent);
  });

  it('a rise the landlord has announced does not follow you to the next place you rent', () => {
    const c = newCore(47);
    c.economy.receive('bank', G(50000), 'other', 'test');
    c.state.player.creditScore = 800;
    c.housing.scheduleRentIncrease(8);
    expect(c.state.housing.pendingRent).not.toBeNull();
    expect(c.housing.rent('home_downtown').ok).toBe(true);
    expect(c.state.housing.pendingRent).toBeNull();
  });

  it('begins on its own only for one of Margaret’s tenants, and only once', () => {
    const c = newCore(48);
    storyDays(c, 150);
    const seen = [...c.state.stories.active.map((s) => s.arc), ...c.state.stories.done.map((d) => d.arc)].filter((a) => a === 'maple_sale');
    expect(seen.length).toBe(1);
    const d = newCore(48);
    d.state.housing.homeId = 'home_shared';
    storyDays(d, 150);
    expect([...d.state.stories.active.map((s) => s.arc), ...d.state.stories.done.map((x) => x.arc)]).not.toContain('maple_sale');
  });

  it('old saves still have Margaret as the landlord', async () => {
    const { migrate } = await import('../src/systems/SaveManager');
    const st = JSON.parse(JSON.stringify(newCore(49).state));
    delete st.housing.mapleSoldTo;
    const m = migrate(st);
    expect(m.housing.mapleSoldTo).toBeUndefined();
  });
});
