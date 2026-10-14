import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { G } from '../src/core/money';
import { MINUTES_PER_DAY, hm, toDate } from '../src/core/calendar';
import { ITEMS, SHOPS } from '../src/data/items';
import { PAWN_FEE_BP, PAWN_GRACE, PAWN_MAX_LOAN, PAWN_TERM, STREET_LOTS, weekOf } from '../src/systems/PawnSystem';
import { FORTUNE_PRICE, LABOR, nightMarketOpen } from '../src/systems/OldTownSystem';
import { newCore } from './helpers';

/** Move the clock to day + n at hh:mm without simulating the days in between. */
function jump(c: GameCore, days: number, hh = 10): void {
  const day = c.today() + days;
  c.state.time.minutes = day * MINUTES_PER_DAY + hh * 60;
}

/** The next given weekday (0 = Monday) at hh:mm. */
function nextWeekday(c: GameCore, weekday: number, hh: number, mm = 0): void {
  for (let d = c.today() + 1; d < c.today() + 9; d++) {
    if (toDate(d * MINUTES_PER_DAY).weekday === weekday) {
      c.state.time.minutes = d * MINUTES_PER_DAY + hm(hh, mm);
      return;
    }
  }
}

function rested(c: GameCore): void {
  Object.assign(c.state.player.stats, { energy: 90, sleep: 90, health: 90, hunger: 20, drunk: 0, stress: 30 });
}

describe('the pawn shop lends against what you own', () => {
  it('lends 60% of the appraisal in cash and holds the pledge', () => {
    const c = newCore();
    c.inventory.add('watch_luxury');
    const p = c.pawn.pledgeables().find((x) => x.id === 'watch_luxury')!;
    expect(p.appraisal).toBe(G(7440)); // 12,000 × 62% resale
    expect(p.loan).toBe(G(4460)); // 60%, rounded down to 10 G
    const cash = c.economy.balance('cash');
    const net = c.economy.netWorth();
    const r = c.pawn.pawn('watch_luxury');
    expect(r.ok).toBe(true);
    expect(c.inventory.count('watch_luxury')).toBe(0);
    expect(c.economy.balance('cash')).toBe(cash + p.loan);
    // the watch is gone but the ticket is worth what is left after buying it back
    expect(c.economy.netWorth()).toBe(net - p.appraisal + p.appraisal - c.pawn.redeemCost(c.pawn.openTickets()[0]) + p.loan);
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('charges a fee for every started ten days and gives the pledge back on redemption', () => {
    const c = newCore();
    c.inventory.add('jewelry');
    c.pawn.pawn('jewelry');
    const t = c.pawn.openTickets()[0];
    const fee10 = Math.round((t.loan * PAWN_FEE_BP) / 10000 / 100) * 100;
    expect(c.pawn.fees(t)).toBe(fee10); // at least one period, even the same day
    expect(c.pawn.fees(t, t.start + 10)).toBe(fee10);
    expect(c.pawn.fees(t, t.start + 11)).toBe(fee10 * 2);
    expect(c.pawn.fees(t, t.start + PAWN_TERM)).toBe(fee10 * 3);
    jump(c, 15);
    const cost = c.pawn.redeemCost(t);
    expect(cost).toBe(t.loan + fee10 * 2);
    const cash = c.economy.balance('cash');
    expect(c.pawn.redeem(t.id, 'cash').ok).toBe(true);
    expect(c.economy.balance('cash')).toBe(cash - cost);
    expect(c.inventory.count('jewelry')).toBe(1);
    expect(t.status).toBe('redeemed');
    expect(t.feesPaid).toBe(fee10 * 2);
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('renewing pays the fees so far and starts a new term', () => {
    const c = newCore();
    c.inventory.add('jewelry');
    c.pawn.pawn('jewelry');
    const t = c.pawn.openTickets()[0];
    expect(c.pawn.renew(t.id, 'cash').ok).toBe(false); // nothing to renew on the first day
    jump(c, 25);
    const fee = c.pawn.fees(t);
    const cash = c.economy.balance('cash');
    expect(c.pawn.renew(t.id, 'cash').ok).toBe(true);
    expect(c.economy.balance('cash')).toBe(cash - fee);
    expect(t.start).toBe(c.today());
    expect(t.due).toBe(c.today() + PAWN_TERM);
  });

  it('keeps the pledge after the grace period and puts it on the second-hand shelf', () => {
    const c = newCore();
    c.inventory.add('watch_luxury');
    c.pawn.pawn('watch_luxury');
    const t = c.pawn.openTickets()[0];
    jump(c, PAWN_TERM + PAWN_GRACE);
    c.pawn.daily(c.today());
    expect(t.status).toBe('open'); // the last day still counts
    jump(c, 1);
    c.pawn.daily(c.today());
    expect(t.status).toBe('forfeited');
    const lot = c.pawn.stock().find((l) => l.from === 'player' && l.item === 'watch_luxury')!;
    expect(lot).toBeTruthy();
    expect(lot.price).toBeLessThanOrEqual(G(12000) * 0.85);
    expect(lot.price).toBeGreaterThan(t.loan);
    expect(c.state.phone.messages.some((m) => m.from === 'pawn' && m.body.includes('绝当'))).toBe(true);
    // and it can be bought back, at the shelf price
    c.economy.receive('bank', G(20000), 'other', 'test');
    expect(c.pawn.buy(lot.id, 'card').ok).toBe(true);
    expect(c.inventory.count('watch_luxury')).toBe(1);
  });

  it('texts a reminder before the term runs out', () => {
    const c = newCore();
    c.inventory.add('jewelry');
    c.pawn.pawn('jewelry');
    const t = c.pawn.openTickets()[0];
    jump(c, PAWN_TERM - 3);
    c.pawn.daily(c.today());
    expect(c.state.phone.messages.some((m) => m.from === 'pawn' && m.body.includes('提醒'))).toBe(true);
    expect(t.reminded).toBe(c.today());
  });

  it('takes the car, refuses to hand it back while you drive another, and caps the loan', () => {
    const c = newCore();
    c.state.player.vehicle = 'luxury_car';
    const p = c.pawn.pledgeables().find((x) => x.id === 'luxury_car')!;
    expect(p.loan).toBe(PAWN_MAX_LOAN);
    expect(c.pawn.pawn('luxury_car').ok).toBe(true);
    expect(c.state.player.vehicle).toBeNull();
    c.state.player.vehicle = 'bicycle';
    const t = c.pawn.openTickets()[0];
    c.economy.receive('bank', G(100000), 'other', 'test');
    expect(c.pawn.redeem(t.id, 'card').ok).toBe(false);
    c.state.player.vehicle = null;
    expect(c.pawn.redeem(t.id, 'card').ok).toBe(true);
    expect(c.state.player.vehicle).toBe('luxury_car');
  });

  it('will not take the clothes you are wearing, your only outfit, or cheap things', () => {
    const c = newCore();
    c.state.inventory.outfits = ['outfit_casual', 'outfit_suit'];
    c.state.player.outfit = 'outfit_suit';
    expect(c.pawn.pawn('outfit_suit').ok).toBe(false);
    c.state.player.outfit = 'outfit_casual';
    expect(c.pawn.pawn('outfit_suit').ok).toBe(true);
    expect(c.state.inventory.outfits).toEqual(['outfit_casual']);
    // casual clothes are not worth pawning at all
    expect(c.pawn.pledgeables().some((x) => x.id === 'outfit_casual')).toBe(false);
    c.inventory.add('watch_basic');
    expect(c.pawn.pawn('watch_basic').ok).toBe(true); // 120 × 35% = 42 G, just above the minimum
    c.inventory.add('chocolate');
    expect(c.pawn.pledgeables().some((x) => x.id === 'chocolate')).toBe(false);
  });

  it('buys outright at the appraisal (less for cars) and resells what it bought', () => {
    const c = newCore();
    c.inventory.add('jewelry');
    const price = c.pawn.buyPrice('jewelry');
    expect(price).toBe(c.pawn.appraise('jewelry'));
    const cash = c.economy.balance('cash');
    expect(c.pawn.sell('jewelry').ok).toBe(true);
    expect(c.economy.balance('cash')).toBe(cash + price);
    expect(c.pawn.stock().some((l) => l.item === 'jewelry' && l.from === 'player')).toBe(true);
    c.state.player.vehicle = 'used_car';
    expect(c.pawn.buyPrice('used_car')).toBeLessThan(c.pawn.appraise('used_car'));
  });

  it('fills the second-hand shelf once a week, the same way for the same game', () => {
    const a = newCore(31);
    const b = newCore(31);
    const sa = a.pawn.stock().filter((l) => l.from === 'street');
    const sb = b.pawn.stock().filter((l) => l.from === 'street');
    expect(sa.length).toBe(STREET_LOTS);
    expect(new Set(sa.map((l) => l.item)).size).toBe(STREET_LOTS);
    expect(sa.map((l) => [l.item, l.price])).toEqual(sb.map((l) => [l.item, l.price]));
    // the same week, the same shelf
    const w = weekOf(a.today());
    jump(a, 0, 20);
    if (weekOf(a.today()) === w) expect(a.pawn.stock().filter((l) => l.from === 'street').map((l) => l.id)).toEqual(sa.map((l) => l.id));
    // next week, new stock
    jump(a, 7);
    const next = a.pawn.stock().filter((l) => l.from === 'street');
    expect(next.length).toBe(STREET_LOTS);
    expect(next.every((l) => l.week === weekOf(a.today()))).toBe(true);
    for (const l of next) {
      const d = ITEMS[l.item] ?? undefined;
      if (d) expect(l.price).toBeLessThanOrEqual(d.price);
    }
  });

  it('a second-hand bicycle is refused if you already have a vehicle', () => {
    const c = newCore();
    c.state.oldtown!.stock.push({ id: 999, item: 'bicycle', price: G(130), from: 'street', week: weekOf(c.today()) });
    c.state.oldtown!.stockWeek = weekOf(c.today());
    c.state.player.vehicle = 'used_car';
    expect(c.pawn.buy(999, 'cash').ok).toBe(false);
    c.state.player.vehicle = null;
    expect(c.pawn.buy(999, 'cash').ok).toBe(true);
    expect(c.state.player.vehicle).toBe('bicycle');
  });

  it('people who see you walk in remember it', () => {
    const c = newCore();
    c.setLocation('pawn', 5, 5);
    c.state.npcs.oldzhou.location = 'pawn';
    c.inventory.add('jewelry');
    c.pawn.pawn('jewelry');
    expect(c.state.social.memories.some((m) => m.npc === 'oldzhou' && m.kind === 'pawned')).toBe(true);
  });
});

describe('the community kitchen', () => {
  it('serves one free meal a day during the two services', () => {
    const c = newCore();
    c.setLocation('community_kitchen', 5, 5);
    jump(c, 1, 9);
    expect(c.oldtown.freeMeal().ok).toBe(false); // not open yet
    jump(c, 0, 12);
    c.state.player.stats.hunger = 80;
    const cash = c.economy.balance('cash');
    expect(c.oldtown.freeMeal().ok).toBe(true);
    expect(c.state.player.stats.hunger).toBeLessThan(40);
    expect(c.economy.balance('cash')).toBe(cash);
    jump(c, 0, 18);
    expect(c.oldtown.freeMeal().ok).toBe(false); // one a day
  });

  it('people frown at someone rich taking a free meal', () => {
    const c = newCore();
    c.economy.receive('bank', G(500000), 'other', 'test');
    c.setLocation('community_kitchen', 5, 5);
    c.state.npcs.eileen.location = 'community_kitchen';
    jump(c, 1, 12);
    expect(c.oldtown.freeMeal().ok).toBe(true);
    expect(c.state.social.memories.some((m) => m.npc === 'eileen' && m.kind === 'free_meal_rich')).toBe(true);
  });

  it('a volunteer shift takes two hours once a day and is noticed', () => {
    const c = newCore();
    c.setLocation('community_kitchen', 5, 5);
    c.state.npcs.eileen.location = 'community_kitchen';
    jump(c, 1, 11);
    rested(c);
    const t0 = c.now();
    const before = c.social.rel('eileen').affection;
    expect(c.oldtown.volunteer().ok).toBe(true);
    expect(c.now() - t0).toBe(120);
    expect(c.oldtown.volunteer().ok).toBe(false);
    expect(c.state.social.memories.some((m) => m.npc === 'eileen' && m.kind === 'volunteered')).toBe(true);
    expect(c.social.rel('eileen').affection).toBeGreaterThan(before);
  });

  it('donations are real money and the giver goes on the board', () => {
    const c = newCore();
    c.setLocation('community_kitchen', 5, 5);
    expect(c.oldtown.donate(G(5), 'cash').ok).toBe(false);
    const bank = c.economy.balance('bank');
    expect(c.oldtown.donate(G(500), 'card').ok).toBe(true);
    expect(c.economy.balance('bank')).toBe(bank - G(500));
    expect(c.state.economy.ledger.at(-1)!.cat).toBe('donation');
    const board = c.oldtown.donors();
    expect(board.find((d) => d.player)!.amount).toBe(G(500));
    expect(board.map((d) => d.amount)).toEqual(board.map((d) => d.amount).slice().sort((a, b) => b - a));
    expect(c.economy.checkConservation().ok).toBe(true);
  });
});

describe('day labour at Pier 7', () => {
  it('pays eight hours in cash at the end of the shift', () => {
    const c = newCore();
    nextWeekday(c, 1, 6);
    rested(c);
    const o = c.oldtown.laborOffer();
    expect(o.ok).toBe(true);
    expect(o.pay).toBe(LABOR.rate * LABOR.hours);
    const cash = c.economy.balance('cash');
    const t0 = c.now();
    expect(c.oldtown.doLabor().ok).toBe(true);
    expect(c.now() - t0).toBe(LABOR.hours * 60);
    expect(c.economy.balance('cash')).toBe(cash + o.pay);
    expect(c.oldtown.laborOffer().ok).toBe(false); // once a day
  });

  it('pays more on Saturday, and there is no work on Sunday', () => {
    const c = newCore();
    nextWeekday(c, 5, 6);
    rested(c);
    expect(c.oldtown.laborOffer().pay).toBe(LABOR.saturdayRate * LABOR.hours);
    nextWeekday(c, 6, 6);
    expect(c.oldtown.laborOffer().ok).toBe(false);
  });

  it('takes people on only at dawn, and only if they can carry crates', () => {
    const c = newCore();
    nextWeekday(c, 2, 4);
    rested(c);
    expect(c.oldtown.laborOffer().ok).toBe(false);
    nextWeekday(c, 3, 10);
    expect(c.oldtown.laborOffer().ok).toBe(false);
    nextWeekday(c, 4, 7);
    c.state.player.stats.drunk = 40;
    expect(c.oldtown.laborOffer().ok).toBe(false);
    rested(c);
    c.state.player.stats.sleep = 30;
    expect(c.oldtown.laborOffer().ok).toBe(false);
    rested(c);
    expect(c.oldtown.laborOffer().ok).toBe(true);
  });

  it('warns when the shift overlaps the regular job', () => {
    const c = newCore();
    // the starting job is a weekday office shift
    nextWeekday(c, 1, 6);
    rested(c);
    expect(c.oldtown.laborOffer().clash).toBeTruthy();
  });
});

describe('the night market', () => {
  it('opens at six in the evening and stays later on Friday and Saturday', () => {
    const c = newCore();
    nextWeekday(c, 1, 12);
    expect(nightMarketOpen(c.now())).toBe(false);
    nextWeekday(c, 1, 19);
    expect(nightMarketOpen(c.now())).toBe(true);
    nextWeekday(c, 2, 0, 30); // Wednesday 00:30, still Tuesday's market
    expect(nightMarketOpen(c.now())).toBe(true);
    nextWeekday(c, 2, 1, 30);
    expect(nightMarketOpen(c.now())).toBe(false);
    nextWeekday(c, 5, 1, 30); // Saturday 01:30, Friday's market
    expect(nightMarketOpen(c.now())).toBe(true);
  });

  it('every stall sells real things, for cash only', () => {
    for (const id of ['nm_wok', 'nm_grill', 'nm_sweets', 'nm_books', 'nm_trinkets']) {
      const s = SHOPS[id];
      expect(s.accepts).toEqual(['cash']);
      for (const it of s.items) expect(ITEMS[it], `${id}: ${it}`).toBeTruthy();
    }
  });

  it('the used-book stall sells at half price', () => {
    const c = newCore();
    expect(c.inventory.unitPrice('nm_books', 'book_cards')).toBe(G(15));
    const cash = c.economy.balance('cash');
    expect(c.inventory.buy('nm_books', 'book_cards', 'cash').ok).toBe(true);
    expect(c.economy.balance('cash')).toBe(cash - G(15));
    expect(c.inventory.buy('nm_books', 'book_cards', 'card').ok).toBe(false);
  });

  it('the fortune teller reads only what can be seen or heard, once a night, for cash', () => {
    const c = newCore();
    nextWeekday(c, 2, 20);
    c.state.player.stats.sleep = 20;
    const cash = c.economy.balance('cash');
    const r = c.oldtown.fortune();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.message).toContain('好几晚没睡好');
    expect(c.economy.balance('cash')).toBe(cash - FORTUNE_PRICE);
    expect(c.oldtown.fortune().ok).toBe(false);
  });
});

describe('old saves', () => {
  it('get an empty Old Town state', async () => {
    const { migrate } = await import('../src/systems/SaveManager');
    const c = newCore();
    const st = JSON.parse(JSON.stringify(c.state));
    delete st.oldtown;
    const m = migrate(st);
    expect(m.oldtown?.tickets).toEqual([]);
  });
});