import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { MINUTES_PER_DAY, toDate } from '../src/core/calendar';
import { G } from '../src/core/money';
import * as PK from '../src/casino/PokerEngine';
import { decidePoker, POKER_STYLES } from '../src/casino/pokerAI';
import { Rng } from '../src/core/rng';
import { LEVELS, TOURNEY, TOURNEY_HOST, levelRules } from '../src/casino/tournament';
import { NPC_POKER } from '../src/systems/CasinoManager';
import { MemoryStorage, SaveManager } from '../src/systems/SaveManager';
import { newCore, skip } from './helpers';

/** The next Sunday from tomorrow on, at a minute of the day. */
function sundayAt(c: GameCore, minuteOfDay: number): number {
  for (let d = c.today() + 1; d < c.today() + 8; d++) if (toDate(d * MINUTES_PER_DAY).weekday === TOURNEY.weekday) return d * MINUTES_PER_DAY + minuteOfDay;
  throw new Error('no sunday');
}

/** Jump to just before registration opens on the next Sunday, and let the minutes tick from there. */
function toSunday(c: GameCore, minuteOfDay = TOURNEY.opens - 1): void {
  c.state.time.minutes = sundayAt(c, minuteOfDay);
  c.npcs.settle(c.now());
}

/** Every chip at the table: the stacks, and what is in the pot while a hand is being played. */
function chips(s: PK.PokerState): number {
  const live = PK.handInProgress(s);
  return s.seats.reduce((a, x) => a + x.stack + (live ? x.committed : 0), 0);
}

/** Let the regulars have money to spare. */
function richRegulars(c: GameCore): void {
  for (const id of Object.keys(NPC_POKER)) c.state.npcs[id].money = Math.max(c.state.npcs[id].money, G(5000));
}

describe('the Sunday tournament', () => {
  it('opens on Sunday at five: the regulars who can afford it put their names down and pay out of their own money', () => {
    const c = newCore(71);
    richRegulars(c);
    const before = Object.fromEntries(Object.keys(NPC_POKER).map((id) => [id, c.state.npcs[id].money]));
    toSunday(c);
    expect(c.tourney.current()).toBeNull();
    skip(c, 2);
    const t = c.tourney.current()!;
    expect(t).toMatchObject({ status: 'open', buyIn: TOURNEY.buyIn, fee: TOURNEY.fee, day: c.today() });
    expect(t.entrants.length).toBeLessThanOrEqual(TOURNEY.seats - 1);
    for (const e of t.entrants) {
      expect(e.npc).toBeDefined();
      expect(c.state.npcs[e.npc!].money).toBe(before[e.npc!] - TOURNEY.buyIn - TOURNEY.fee);
      // they will be there for it, not at a cash table
      expect(c.state.npcs[e.npc!].overrides.some((o) => o.activity === 'tourney')).toBe(true);
    }
    // not on other days
    const d = newCore(71);
    d.state.time.minutes = sundayAt(d, TOURNEY.opens) + MINUTES_PER_DAY;
    skip(d, 3 * 60);
    expect(d.tourney.current()).toBeNull();
  });

  it('the player signs up at the poker room for the buy-in and the fee, once, and can take their name off again', () => {
    const c = newCore(72);
    toSunday(c);
    skip(c, 2);
    expect(c.tourney.register().ok).toBe(false);
    c.setLocation('casino', 50, 60);
    const cash = c.economy.balance('cash') + c.economy.balance('bank');
    const r = c.tourney.register();
    expect(r.ok, r.ok ? '' : r.error).toBe(true);
    expect(c.economy.balance('cash') + c.economy.balance('bank')).toBe(cash - TOURNEY.buyIn - TOURNEY.fee);
    expect(c.state.economy.ledger.at(-1)).toMatchObject({ cat: 'casino_bet', amount: TOURNEY.buyIn + TOURNEY.fee, to: 'ext:casino:pkt' });
    expect(c.tourney.register().ok).toBe(false);
    expect(c.tourney.registered()).toBe(true);
    expect(c.tourney.unregister().ok).toBe(true);
    expect(c.economy.balance('cash') + c.economy.balance('bank')).toBe(cash);
    expect(c.tourney.registered()).toBe(false);
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('at seven walk-ins fill the table, everyone starts even, and the 1/2 cash game is closed', () => {
    const c = newCore(73);
    toSunday(c);
    skip(c, 2);
    c.setLocation('casino', 50, 60);
    c.tourney.register();
    c.state.time.minutes = c.today() * MINUTES_PER_DAY + TOURNEY.starts - 1;
    skip(c, 1);
    const t = c.tourney.running()!;
    expect(t.entrants.length).toBe(TOURNEY.seats);
    expect(t.prizes.reduce((a, b) => a + b, 0)).toBe(TOURNEY.seats * TOURNEY.buyIn);
    const s = t.table!;
    expect(s.seats.every((x) => x.occupant && x.stack === TOURNEY.startStack)).toBe(true);
    expect(s.rules).toMatchObject(levelRules(0));
    expect(new Set(t.entrants.map((e) => e.name)).size).toBe(TOURNEY.seats);
    expect(c.casino.sit(TOURNEY_HOST).ok).toBe(false);
    expect(c.casino.pkDeal(TOURNEY_HOST).ok).toBe(false);
    c.casino.refreshCrowd(true);
    expect(c.state.casino.patrons.some((p) => p.seat?.startsWith(`${TOURNEY_HOST}:`))).toBe(false);
  });

  it('played out with the player away: nothing is made or lost at the table, the blinds go up, and every place is decided', () => {
    const c = newCore(74);
    richRegulars(c);
    toSunday(c);
    skip(c, 2);
    c.setLocation('casino', 50, 60);
    c.tourney.register();
    c.state.time.minutes = c.today() * MINUTES_PER_DAY + TOURNEY.starts - 1;
    skip(c, 1);
    const t = c.tourney.running()!;
    const s = t.table!;
    let hands = 0;
    let lastLevel = 0;
    for (let k = 0; k < 8 * 60 && t.status === 'running'; k++) {
      skip(c, 1);
      if (t.status === 'running') {
        // tournament chips never appear or vanish
        expect(chips(s)).toBe(TOURNEY.seats * TOURNEY.startStack);
        expect(s.hand).toBeGreaterThanOrEqual(hands);
        hands = s.hand;
        expect(t.level).toBeGreaterThanOrEqual(lastLevel);
        lastLevel = t.level;
        expect(s.rules.bigBlind).toBe(LEVELS[t.level][1] * 100);
      }
    }
    expect(t.status).toBe('done');
    expect(t.entrants.map((e) => e.place).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    // the blinds went up on schedule
    expect(lastLevel).toBe(Math.min(LEVELS.length - 1, Math.floor((hands - 1) / TOURNEY.handsPerLevel)));
    // the money: first and second share the buy-ins
    const first = t.entrants.find((e) => e.place === 1)!;
    const second = t.entrants.find((e) => e.place === 2)!;
    expect(first.prize! + second.prize!).toBe(TOURNEY.seats * TOURNEY.buyIn);
    expect(first.prize).toBe(t.prizes[0]);
    for (const e of t.entrants) {
      if (!e.npc) continue;
      // a regular who cashed knows what they won; everyone has gone home
      if (e.prize) expect(c.social.memoriesOf(e.npc, e.npc).some((m) => m.kind === 'npc_big_win' && m.data.amount === e.prize! - TOURNEY.buyIn - TOURNEY.fee)).toBe(true);
      expect(c.state.npcs[e.npc].overrides.some((o) => o.activity === 'tourney')).toBe(false);
    }
    const me = t.entrants.find((e) => e.id === 'player')!;
    const won = c.state.economy.ledger.filter((x) => x.cat === 'casino_payout' && x.from === 'ext:casino:pkt').reduce((a, x) => a + x.amount, 0);
    expect(won).toBe(me.prize ?? 0);
    expect(c.state.casino.tourneyLog!.at(-1)).toMatchObject({ winner: first.name, second: second.name, playerPlace: me.place });
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('a player who is away from the table only ever folds or checks (the blinds are still paid)', () => {
    const c = newCore(75);
    toSunday(c);
    skip(c, 2);
    c.setLocation('casino', 50, 60);
    c.tourney.register();
    c.state.time.minutes = c.today() * MINUTES_PER_DAY + TOURNEY.starts - 1;
    skip(c, 1);
    const t = c.tourney.running()!;
    const s = t.table!;
    let blindsPaid = 0;
    for (let k = 0; k < 40 && c.tourney.alive(); k++) {
      skip(c, TOURNEY.minutesPerHand);
      const last = s.history.at(-1);
      if (!last) continue;
      const me = s.seats.find((x) => x.occupant === 'player');
      // never a raise or a call: what goes in is a blind at most
      if (me) expect(me.startStack - me.stack - (last.winners.find((w) => w.who === 'player')?.amount ?? 0)).toBeLessThanOrEqual(s.rules.bigBlind);
      blindsPaid++;
    }
    expect(blindsPaid).toBeGreaterThan(0);
  });

  it('at the table: the player plays the hands, and cannot get up in the middle of one without folding', () => {
    const c = newCore(76);
    toSunday(c);
    skip(c, 2);
    c.setLocation('casino', 50, 60);
    c.tourney.register();
    c.state.time.minutes = c.today() * MINUTES_PER_DAY + TOURNEY.starts - 1;
    skip(c, 1);
    expect(c.tourney.sit().ok).toBe(true);
    const t = c.tourney.running()!;
    const s = t.table!;
    let acted = 0;
    let triedToLeave = false;
    for (let hand = 0; hand < 400 && t.status === 'running'; hand++) {
      if (!c.tourney.alive()) break;
      const d = c.tourney.deal();
      if (!d.ok) break;
      for (let g = 0; g < 200 && PK.handInProgress(s); g++) {
        const owner = c.tourney.turnOwner();
        if (owner === 'player') {
          if (!triedToLeave) {
            expect(c.tourney.standUp().ok).toBe(false);
            triedToLeave = true;
          }
          const legal = PK.legalPokerActions(s, s.toAct)!;
          expect(c.tourney.playerAct({ type: legal.check ? 'check' : 'call' }).ok).toBe(true);
          acted++;
        } else expect(c.tourney.npcAct().ok).toBe(true);
      }
      expect(chips(s)).toBe(TOURNEY.seats * TOURNEY.startStack);
      c.tourney.manage();
    }
    expect(acted).toBeGreaterThan(0);
    // out, or it is over: either way the player can get up
    expect(c.tourney.standUp().ok).toBe(true);
  });

  it('a player taken away from the table in the middle of a hand is folded, and the game goes on without them', () => {
    const c = newCore(79);
    toSunday(c);
    skip(c, 2);
    c.setLocation('casino', 50, 60);
    c.tourney.register();
    c.state.time.minutes = c.today() * MINUTES_PER_DAY + TOURNEY.starts - 1;
    skip(c, 1);
    expect(c.tourney.sit().ok).toBe(true);
    const s = c.tourney.table()!;
    // deal until it is the player's turn, then walk them out of the casino
    for (let k = 0; k < 50; k++) {
      if (!PK.handInProgress(s)) c.tourney.deal();
      while (PK.handInProgress(s) && c.tourney.turnOwner() !== 'player') c.tourney.npcAct();
      if (c.tourney.turnOwner() === 'player') break;
      c.tourney.manage();
    }
    expect(c.tourney.turnOwner()).toBe('player');
    const hand = s.hand;
    c.setLocation('city', 10, 10);
    skip(c, TOURNEY.minutesPerHand * 4);
    expect(c.tourney.seated()).toBe(false);
    expect(s.hand).toBeGreaterThan(hand);
    expect(s.history.find((h) => h.hand === hand)).toBeDefined();
    expect(chips(s)).toBe(TOURNEY.seats * TOURNEY.startStack);
  });

  it('a tournament in progress survives save and load and plays out the same', () => {
    const c = newCore(77);
    toSunday(c);
    skip(c, 2);
    c.setLocation('casino', 50, 60);
    c.tourney.register();
    c.state.time.minutes = c.today() * MINUTES_PER_DAY + TOURNEY.starts - 1;
    skip(c, 30);
    expect(c.tourney.running()).not.toBeNull();
    const sm = new SaveManager(new MemoryStorage());
    sm.save(c, 'slot1');
    const d = sm.load('slot1');
    skip(c, 5 * 60);
    skip(d, 5 * 60);
    expect(JSON.stringify(d.state.casino.tourney)).toBe(JSON.stringify(c.state.casino.tourney));
    expect(d.state.casino.tourney!.status).toBe('done');
  });

  it('old saves start without a tournament', async () => {
    const { migrate } = await import('../src/systems/SaveManager');
    const st = JSON.parse(JSON.stringify(newCore(78).state));
    delete st.casino.tourney;
    delete st.casino.tourneyLog;
    delete st.casino.tourneySeq;
    const m = migrate(st);
    expect(m.casino.tourney).toBeNull();
    expect(m.casino.tourneyLog).toEqual([]);
  });
});

describe('short-stacked poker', () => {
  it('with ten big blinds or fewer, a player goes all in or gets out of the way before the flop', () => {
    const rng = new Rng(5);
    for (let k = 0; k < 300; k++) {
      const s = PK.createPokerTable('x', levelRules(6), k);
      for (let i = 0; i < 6; i++) PK.sitPoker(s, i, `p${i}`, TOURNEY.startStack);
      // everyone is short: 3,000 chips at 300/600
      PK.startHand(s);
      const view = PK.pokerView(s, s.toAct)!;
      const style = POKER_STYLES[(['tight', 'loose', 'aggressive', 'passive', 'bluffer', 'tilter'] as const)[k % 6]];
      const a = decidePoker(view, style, 0, rng);
      expect(['allin', 'fold', 'check']).toContain(a.type);
    }
  });
});
