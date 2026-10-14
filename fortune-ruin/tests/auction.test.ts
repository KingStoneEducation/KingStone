import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { G } from '../src/core/money';
import { MINUTES_PER_DAY, hm, toDate } from '../src/core/calendar';
import { HOUSE_LOTS, LOT_MINUTES, PADDLE_MIN, VALUE_RANGE, increment, onSteps } from '../src/data/auction';
import { afterCommission, marketKey, withPremium } from '../src/systems/AuctionSystem';
import { newCore } from './helpers';

/** The coming day of the week (0 = Monday) at hh:mm, without simulating the days in between. */
function nextDay(c: GameCore, weekday: number, hh: number, mm = 0): void {
  for (let d = c.today() + 1; d < c.today() + 9; d++) {
    if (toDate(d * MINUTES_PER_DAY).weekday === weekday) {
      c.state.time.minutes = d * MINUTES_PER_DAY + hm(hh, mm);
      return;
    }
  }
}

/** In the ballroom on Sunday at three, with a paddle. */
function atSale(c: GameCore, money = G(200000)): void {
  nextDay(c, 6, 15);
  c.setLocation('hotel', 14, 5);
  c.economy.receive('bank', money, 'other', 'test');
  expect(c.auction.register().ok).toBe(true);
}

/** Tick until the lot on the block is hammered. */
function hammer(c: GameCore) {
  for (let i = 0; i < 500; i++) {
    const e = c.auction.tick();
    if (e.type === 'sold' || e.type === 'passed') return e;
    if (e.type === 'idle') return e;
  }
  throw new Error('the auctioneer never stopped');
}

describe('the catalogue', () => {
  it('prints five lots of the house each week, the same for the same game', () => {
    const a = newCore(77);
    const b = newCore(77);
    const la = a.auction.catalogue();
    const lb = b.auction.catalogue();
    expect(la.length).toBe(HOUSE_LOTS);
    expect(la.map((l) => [l.piece.title, l.piece.value, l.low, l.high])).toEqual(lb.map((l) => [l.piece.title, l.piece.value, l.low, l.high]));
    expect(la.filter((l) => l.piece.kind === 'painting').length).toBe(3);
    for (const l of la) {
      const [lo, hi] = VALUE_RANGE[marketKey(l.piece)];
      expect(l.piece.value).toBeGreaterThanOrEqual(G(lo) - G(100));
      expect(l.piece.value).toBeLessThanOrEqual(G(hi) + G(100));
      expect(l.low).toBeLessThan(l.piece.value);
      expect(l.high).toBeGreaterThan(l.piece.value);
      expect(l.reserve).toBeLessThan(l.low);
      expect(l.consignor).toBe('house');
    }
    // a new week, a new catalogue
    nextDay(a, 0, 9);
    nextDay(a, 0, 9);
    const next = a.auction.catalogue();
    expect(next.map((l) => l.piece.title).join()).not.toBe(la.map((l) => l.piece.title).join());
  });

  it('bids go up in the house steps', () => {
    expect(increment(G(800))).toBe(G(50));
    expect(increment(G(4800))).toBe(G(200));
    expect(increment(G(36000))).toBe(G(2000));
    expect(increment(G(250000))).toBe(G(20000));
    expect(onSteps(G(36500))).toBe(G(36000));
  });
});

describe('the live sale', () => {
  it('needs a paddle, and a paddle needs money in the bank', () => {
    const c = newCore();
    c.economy.transfer('bank', 'cash', c.economy.balance('bank') - PADDLE_MIN + G(1), 'withdrawal', 'test');
    expect(c.auction.register().ok).toBe(false);
    c.economy.receive('bank', G(10), 'other', 'test');
    expect(c.auction.register().ok).toBe(true);
    expect(c.state.auction!.paddle).toBeGreaterThan(0);
  });

  it('runs lot by lot: the hammer falls at or above the reserve, and the clock moves to the next lot', () => {
    const c = newCore(5);
    atSale(c);
    const start = c.auction.saleStart();
    const e = hammer(c);
    const lot = c.state.auction!.lots[0];
    if (e.type === 'sold') {
      expect(e.hammer).toBeGreaterThanOrEqual(lot.reserve);
      expect(lot.status).toBe('sold');
    } else expect(lot.status).toBe('passed');
    expect(c.now()).toBe(start + LOT_MINUTES);
    // the next tick announces lot 2
    const open = c.auction.tick();
    expect(open.type).toBe('open');
    if (open.type === 'open') expect(open.lot.no).toBe(2);
  });

  it('the player wins at their own bid, pays the premium from the bank, and owns the piece', () => {
    const c = newCore(6);
    atSale(c);
    c.auction.tick(); // lot 1 on the block
    const st = c.state.auction!;
    st.live!.bidders = []; // nobody else wants it
    const lot = st.lots[0];
    st.live!.ask = Math.max(st.live!.ask, lot.reserve);
    const ask = st.live!.ask;
    const bank = c.economy.balance('bank');
    const before = c.economy.netWorth();
    expect(c.auction.bid().ok).toBe(true);
    expect(c.auction.bid().ok).toBe(false); // already the leader
    const e = hammer(c);
    expect(e.type).toBe('sold');
    expect(lot.buyer).toBe('player');
    expect(c.economy.balance('bank')).toBe(bank - withPremium(ask));
    const owned = st.collection.find((p) => p.id === lot.piece.id)!;
    expect(owned.paid).toBe(withPremium(ask));
    // net worth counts the piece at the house's appraisal, not what was paid
    expect(c.economy.netWorth()).toBe(before - withPremium(ask) + owned.value);
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('will not let the player bid more than the bank can pay', () => {
    const c = newCore(8);
    atSale(c, 0);
    c.auction.tick();
    const st = c.state.auction!;
    c.economy.transfer('bank', 'cash', c.economy.balance('bank') - withPremium(st.live!.ask) + G(1), 'withdrawal', 'test');
    const chk = c.auction.bidCheck();
    expect(chk.ok).toBe(false);
    expect(c.auction.bid().ok).toBe(false);
  });

  it('a regular in the room who was outbid remembers it; the others saw a big purchase', () => {
    const c = newCore(9);
    atSale(c);
    c.state.npcs.lillian.location = 'hotel';
    c.state.npcs.alexander.location = 'hotel';
    c.auction.tick();
    const st = c.state.auction!;
    const lot = st.lots[0];
    st.live!.ask = Math.max(st.live!.ask, lot.reserve);
    // Lillian bids, the player tops her, and she has nothing left
    st.live!.bidders = [{ id: 'lillian', name: '莉莉安', npc: 'lillian', max: st.live!.ask }];
    let guard = 0;
    while (st.live && st.live.leader !== 'lillian' && guard++ < 50) c.auction.tick();
    expect(st.live!.leader).toBe('lillian');
    expect(c.auction.bid().ok).toBe(true);
    hammer(c);
    expect(lot.buyer).toBe('player');
    expect(c.state.social.memories.some((m) => m.npc === 'lillian' && m.kind === 'outbid_me')).toBe(true);
    expect(c.state.social.memories.some((m) => m.npc === 'alexander' && m.kind === 'flashy_purchase')).toBe(true);
  });

  it('whatever is not sold in the room is sold at five without the player, at no more than the winner would pay', () => {
    const c = newCore(10);
    nextDay(c, 6, 14);
    const lots = c.auction.catalogue();
    c.state.time.minutes += 3 * 60; // past 17:00
    c.auction.hourly(17);
    for (const l of lots) {
      expect(l.status).not.toBe('open');
      if (l.status === 'sold') {
        expect(l.hammer!).toBeGreaterThanOrEqual(l.reserve);
        expect(l.buyer).not.toBe('player');
      }
    }
    const res = c.state.auction!.results.at(-1)!;
    expect(res.lots.length).toBe(lots.length);
  });

  it('over many sales the hammer price lands near the house appraisal', () => {
    let ratio = 0;
    let n = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const c = newCore(seed);
      nextDay(c, 6, 18);
      const lots = c.auction.catalogue();
      c.auction.sync();
      for (const l of lots) if (l.status === 'sold') {
        ratio += l.hammer! / l.piece.value;
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
    expect(ratio / n).toBeGreaterThan(0.8);
    expect(ratio / n).toBeLessThan(1.2);
  });
});

describe('the collection', () => {
  /** Give the player a piece as if they had bought it. */
  function own(c: GameCore, value = G(20000)) {
    const st = c.state.auction!;
    const piece = { id: 9001, kind: 'painting' as const, genre: 'landscape' as const, tier: 'established' as const, title: '《测试》', maker: '测试', year: 2001, seed: 42, value };
    st.collection.push({ ...piece, paid: withPremium(value), boughtDay: c.today() });
    return st.collection.at(-1)!;
  }

  it('consigned before Saturday morning it is in this Sunday\'s catalogue; later it waits for next week', () => {
    const c = newCore(11);
    nextDay(c, 1, 10);
    const p = own(c);
    const before = c.auction.catalogue().length;
    expect(c.auction.consign(p.id).ok).toBe(true);
    expect(c.auction.catalogue().length).toBe(before + 1);
    expect(c.auction.catalogue().at(-1)!.consignor).toBe('player');
    expect(c.auction.consign(p.id).ok).toBe(false);
    // withdraw before the preview, then consign again after it opens
    expect(c.auction.withdraw(p.id).ok).toBe(true);
    expect(c.auction.catalogue().length).toBe(before);
    nextDay(c, 5, 12);
    expect(c.auction.consign(p.id).ok).toBe(true);
    expect(c.auction.catalogue().some((l) => l.piece.id === p.id)).toBe(false);
    expect(c.state.auction!.queued).toContain(p.id);
    // next Monday it is in the new catalogue
    nextDay(c, 0, 9);
    expect(c.auction.catalogue().some((l) => l.piece.id === p.id && l.consignor === 'player')).toBe(true);
  });

  it('a consigned piece that sells pays the hammer less the commission; the player cannot bid on it', () => {
    const c = newCore(12);
    nextDay(c, 2, 10);
    const p = own(c);
    c.auction.consign(p.id);
    const idx = c.auction.catalogue().findIndex((l) => l.piece.id === p.id);
    atSale(c);
    // jump to the slot of the player's lot
    c.state.time.minutes = c.auction.lotStart(idx);
    c.auction.tick();
    const st = c.state.auction!;
    expect(st.live!.lot).toBe(idx);
    expect(c.auction.bidCheck().ok).toBe(false);
    const lot = st.lots[idx];
    // one buyer in the room; the auctioneer bids for the consignor up to the reserve
    st.live!.bidders = [...st.live!.bidders.filter((b) => b.id === 'house'), { id: 'p77', name: '77 号', max: lot.high }];
    const bank = c.economy.balance('bank');
    const e = hammer(c);
    expect(e.type).toBe('sold');
    expect(lot.buyer).toBe('p77');
    expect(lot.hammer!).toBeGreaterThanOrEqual(lot.reserve);
    expect(c.economy.balance('bank')).toBe(bank + afterCommission(lot.hammer!));
    expect(st.collection.some((x) => x.id === p.id)).toBe(false);
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('a consigned piece that does not reach the reserve comes back', () => {
    const c = newCore(13);
    nextDay(c, 2, 10);
    const p = own(c);
    c.auction.consign(p.id);
    const idx = c.auction.catalogue().findIndex((l) => l.piece.id === p.id);
    atSale(c);
    c.state.time.minutes = c.auction.lotStart(idx);
    c.auction.tick();
    c.state.auction!.live!.bidders = [];
    const e = hammer(c);
    expect(e.type).toBe('passed');
    const back = c.state.auction!.collection.find((x) => x.id === p.id)!;
    expect(back).toBeTruthy();
    expect(back.consigned).toBeUndefined();
  });

  it('is revalued every Monday, new artists far more wildly than old masters', () => {
    const spread = (tier: 'emerging' | 'master') => {
      const c = newCore(14);
      const st = c.state.auction!;
      for (let i = 0; i < 40; i++) st.collection.push({ id: 100 + i, kind: 'painting', genre: 'landscape', tier, title: 't', maker: 'm', year: 2000, seed: i, value: G(10000), paid: G(10000), boughtDay: 0 });
      for (let w = 0; w < 52; w++) {
        st.valuedWeek = -1;
        c.auction.weekly();
      }
      const logs = st.collection.map((p) => Math.log(p.value / G(10000)));
      const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
      return Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / logs.length);
    };
    expect(spread('emerging')).toBeGreaterThan(spread('master') * 2);
  });

  it('old saves get an empty auction house', async () => {
    const { migrate } = await import('../src/systems/SaveManager');
    const c = newCore();
    const st = JSON.parse(JSON.stringify(c.state));
    delete st.auction;
    expect(migrate(st).auction?.collection).toEqual([]);
  });
});