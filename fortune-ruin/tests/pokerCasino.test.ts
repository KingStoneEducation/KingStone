import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import type { GameCore } from '../src/core/GameCore';
import { handInProgress, legalPokerActions, seatOfPoker } from '../src/casino/PokerEngine';
import { MemoryStorage, SaveManager } from '../src/systems/SaveManager';
import { newCore } from './helpers';

const PK1 = 'pk1';

function seatedCore(seed: number, buyIn = G(150)): GameCore {
  const core = newCore(seed);
  core.setLocation('casino', 50, 60);
  core.economy.buyChips(G(600), 'cash');
  const sit = core.casino.sit(PK1);
  expect(sit.ok).toBe(true);
  const b = core.casino.pkBuyIn(PK1, buyIn);
  expect(b.ok, b.ok ? '' : b.error).toBe(true);
  return core;
}

/** A simple, legal player strategy: call small bets, sometimes raise, otherwise fold. */
function playerMove(core: GameCore, k: number): void {
  const s = core.casino.pk(PK1);
  const seat = seatOfPoker(s, 'player');
  const legal = legalPokerActions(s, seat)!;
  if (legal.check) {
    const r = k % 5 === 0 && legal.canRaise ? core.casino.pkPlayerAct(PK1, { type: 'raise', to: legal.minRaiseTo }) : core.casino.pkPlayerAct(PK1, { type: 'check' });
    expect(r.ok).toBe(true);
    return;
  }
  const r = legal.call <= s.seats[seat].stack * 0.15 || k % 7 === 0 ? core.casino.pkPlayerAct(PK1, { type: 'call' }) : core.casino.pkPlayerAct(PK1, { type: 'fold' });
  expect(r.ok).toBe(true);
}

/** Plays one complete hand through the casino controller; returns the player's stack change. */
function playHand(core: GameCore, k: number): number {
  const c = core.casino;
  const d = c.pkDeal(PK1);
  expect(d.ok, d.ok ? '' : d.error).toBe(true);
  const s = c.pk(PK1);
  const seat = seatOfPoker(s, 'player');
  const start = s.seats[seat].startStack;
  for (let guard = 0; guard < 300 && handInProgress(s); guard++) {
    const owner = c.pkTurnOwner(PK1);
    if (owner === 'player') playerMove(core, k + guard);
    else expect(c.pkPatronAct(PK1).ok).toBe(true);
  }
  expect(s.phase).toBe('settled');
  return s.seats[seat].stack - start;
}

describe('poker in the casino', () => {
  it('keeps the stack inside the chip account and books each hand’s net result', () => {
    const core = seatedCore(2024);
    const c = core.casino;
    const s = c.pk(PK1);
    let net = 0;
    let hands = 0;
    for (let k = 0; k < 60; k++) {
      const seat = seatOfPoker(s, 'player');
      if (seat < 0) break;
      if (s.seats[seat].stack < s.rules.bigBlind * 4) {
        const top = c.pkTopUp(PK1, G(60));
        if (!top.ok) break;
      }
      const chipsBefore = core.economy.balance('chips');
      const stackBefore = s.seats[seat].stack;
      // reserved stack is never available for other bets or the cashier
      expect(c.availableChips()).toBe(chipsBefore - stackBefore);
      const delta = playHand(core, k);
      // nothing moves until the hand is booked; the starting stack stays reserved meanwhile
      expect(core.economy.balance('chips')).toBe(chipsBefore);
      expect(c.availableChips()).toBe(chipsBefore - stackBefore);
      const res = c.collect(PK1);
      expect(core.economy.balance('chips') - chipsBefore).toBe(delta);
      if (res) {
        expect(res.net).toBe(delta);
        net += delta;
        hands++;
      } else expect(delta).toBe(0);
      // booking twice is impossible
      expect(c.collect(PK1)).toBeNull();
      expect(core.economy.balance('chips') - chipsBefore).toBe(delta);
      const cons = core.economy.checkConservation();
      expect(cons.ok, `hand ${k}: expected ${cons.expected} actual ${cons.actual}`).toBe(true);
      expect(c.availableChips()).toBe(core.economy.balance('chips') - s.seats[seatOfPoker(s, 'player')].stack);
    }
    expect(hands).toBeGreaterThan(10);
    expect(core.state.casino.stats.byGame.poker.net).toBe(net);
    expect(core.state.casino.stats.byGame.poker.rounds).toBe(hands);
  });

  it('patrons come with their own buy-ins and the table never runs short of opponents', () => {
    const core = seatedCore(77);
    const c = core.casino;
    const s = c.pk(PK1);
    for (let k = 0; k < 40; k++) {
      playHand(core, k);
      c.collect(PK1);
      core.advance(6, 'gambling');
      const patrons = c.patronsAt(PK1);
      // engine seats and the patron list agree
      for (const p of patrons) {
        const i = seatOfPoker(s, p.id);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(p.pokerStyle).toBeTruthy();
        expect(p.bankroll).toBeGreaterThanOrEqual(0);
      }
      for (const st of s.seats) if (st.occupant && st.occupant !== 'player') expect(c.patronById(st.occupant)).toBeTruthy();
      const names = patrons.map((x) => x.name);
      expect(new Set(names).size).toBe(names.length);
      const p = seatOfPoker(s, 'player');
      if (p >= 0 && s.seats[p].stack < s.rules.bigBlind * 5) c.pkTopUp(PK1, G(100));
    }
    c.pkManage(PK1);
    expect(c.patronsAt(PK1).length).toBeGreaterThanOrEqual(2);
  });

  it('only lets the player leave between hands (or after folding)', () => {
    const core = seatedCore(5);
    const c = core.casino;
    const s = c.pk(PK1);
    let tested = false;
    for (let k = 0; k < 30 && !tested; k++) {
      expect(c.pkDeal(PK1).ok).toBe(true);
      // patrons act until it is the player's turn
      for (let g = 0; g < 50 && handInProgress(s) && c.pkTurnOwner(PK1) !== 'player'; g++) c.pkPatronAct(PK1);
      if (!handInProgress(s)) {
        c.collect(PK1);
        continue;
      }
      expect(c.standUp().ok).toBe(false);
      const chips = core.economy.balance('chips');
      const me = s.seats[seatOfPoker(s, 'player')];
      const committed = me.committed;
      expect(c.pkPlayerAct(PK1, { type: 'fold' }).ok).toBe(true);
      expect(c.standUp().ok).toBe(true);
      expect(seatOfPoker(s, 'player')).toBe(-1);
      expect(handInProgress(s)).toBe(false);
      // the chips already put into the pot are lost, the rest is free again
      expect(core.economy.balance('chips')).toBe(chips - committed);
      expect(c.availableChips()).toBe(core.economy.balance('chips'));
      tested = true;
    }
    expect(tested).toBe(true);
    expect(core.economy.checkConservation().ok).toBe(true);
  });

  it('chips at the table cannot be cashed out or bet elsewhere', () => {
    const core = seatedCore(9, G(200));
    const chips = core.economy.balance('chips');
    expect(core.economy.cashOutChips(chips).ok).toBe(false);
    expect(core.economy.cashOutChips(chips - G(200)).ok).toBe(true);
    expect(core.economy.balance('chips')).toBe(G(200));
    expect(core.casino.pkTopUp(PK1, G(10)).ok).toBe(false); // nothing left to add
    expect(core.casino.standUp().ok).toBe(true);
    expect(core.economy.cashOutChips(G(200)).ok).toBe(true);
    expect(core.economy.balance('chips')).toBe(0);
  });

  it('enforces the published buy-in range', () => {
    const core = newCore(3);
    core.setLocation('casino', 50, 60);
    core.economy.buyChips(G(600), 'cash');
    core.casino.sit(PK1);
    expect(core.casino.pkBuyIn(PK1, G(39)).ok).toBe(false);
    expect(core.casino.pkBuyIn(PK1, G(201)).ok).toBe(false);
    expect(core.casino.pkBuyIn(PK1, G(200)).ok).toBe(true);
    expect(core.casino.pkTopUp(PK1, G(1)).ok).toBe(false); // already at the maximum
  });

  it('leaving the casino mid-hand finishes the hand and books it', () => {
    const core = seatedCore(31);
    const c = core.casino;
    const s = c.pk(PK1);
    expect(c.pkDeal(PK1).ok).toBe(true);
    const chips = core.economy.balance('chips');
    const start = s.seats[seatOfPoker(s, 'player')].startStack;
    core.setLocation('city', 10, 10);
    expect(core.state.casino.activeTable).toBeNull();
    expect(handInProgress(s)).toBe(false);
    expect(seatOfPoker(s, 'player')).toBe(-1);
    const change = core.economy.balance('chips') - chips;
    expect(change).toBeLessThanOrEqual(0); // checked or folded: can only lose blinds
    expect(change).toBeGreaterThanOrEqual(-start);
    expect(core.economy.checkConservation().ok).toBe(true);
  });

  it('a hand the player only watched keeps going after they walk away', () => {
    const core = newCore(606);
    core.setLocation('casino', 50, 60);
    const c = core.casino;
    expect(c.sit(PK1).ok).toBe(true);
    expect(c.pkDeal(PK1).ok).toBe(true);
    c.pkPatronAct(PK1);
    const s = c.pk(PK1);
    expect(handInProgress(s)).toBe(true);
    const hand = s.hand;
    expect(c.standUp().ok).toBe(true);
    core.advance(120, 'idle');
    expect(s.hand).toBeGreaterThan(hand);
    expect(s.phase).toBe('waiting');
  });

  it('background tables play real hands among patrons', () => {
    const core = newCore(404);
    core.setLocation('casino', 50, 60);
    const before = core.casino.pk('pk2').hand;
    core.advance(240, 'idle');
    const s = core.casino.pk('pk2');
    expect(s.hand).toBeGreaterThan(before + 5);
    expect(s.phase).toBe('waiting');
    for (const st of s.seats) if (st.occupant) expect(core.casino.patronById(st.occupant)).toBeTruthy();
  });

  it('an autosave in the middle of a hand resumes the same hand after loading', () => {
    const core = seatedCore(1357);
    const c = core.casino;
    let saved = false;
    for (let k = 0; k < 20 && !saved; k++) {
      expect(c.pkDeal(PK1).ok).toBe(true);
      const s = c.pk(PK1);
      for (let g = 0; g < 60 && handInProgress(s) && c.pkTurnOwner(PK1) !== 'player'; g++) c.pkPatronAct(PK1);
      if (handInProgress(s)) {
        saved = true;
        break;
      }
      c.collect(PK1);
    }
    expect(saved).toBe(true);
    const sm = new SaveManager(new MemoryStorage());
    sm.save(core, 'auto', 'midnight');
    const loaded = sm.load('auto');
    expect(loaded.casino.pkTurnOwner(PK1)).toBe('player');
    expect(loaded.casino.availableChips()).toBe(core.casino.availableChips());
    // finish the hand identically in both worlds
    for (const w of [core, loaded]) {
      const s = w.casino.pk(PK1);
      for (let g = 0; g < 200 && handInProgress(s); g++) {
        if (w.casino.pkTurnOwner(PK1) === 'player') {
          const legal = legalPokerActions(s, seatOfPoker(s, 'player'))!;
          w.casino.pkPlayerAct(PK1, { type: legal.check ? 'check' : 'call' });
        } else w.casino.pkPatronAct(PK1);
      }
      w.casino.collect(PK1);
      expect(w.economy.checkConservation().ok).toBe(true);
    }
    expect(loaded.economy.balance('chips')).toBe(core.economy.balance('chips'));
    expect(JSON.stringify(loaded.state.casino.tables[PK1])).toBe(JSON.stringify(core.state.casino.tables[PK1]));
  });

  it('a save between hands restores the seat, stack and patrons exactly', () => {
    const core = seatedCore(8080);
    for (let k = 0; k < 5; k++) {
      playHand(core, k);
      core.casino.collect(PK1);
    }
    const sm = new SaveManager(new MemoryStorage());
    sm.save(core, 'slot1', 'poker');
    const loaded = sm.load('slot1');
    expect(loaded.state.casino.tables[PK1]).toEqual(core.state.casino.tables[PK1]);
    expect(loaded.casino.availableChips()).toBe(core.casino.availableChips());
    // both continue identically
    for (let k = 5; k < 12; k++) {
      playHand(core, k);
      core.casino.collect(PK1);
      playHand(loaded, k);
      loaded.casino.collect(PK1);
    }
    expect(loaded.economy.balance('chips')).toBe(core.economy.balance('chips'));
    expect(JSON.stringify(loaded.state.casino.tables[PK1])).toBe(JSON.stringify(core.state.casino.tables[PK1]));
  });
});
