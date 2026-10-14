import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import { Rng } from '../src/core/rng';
import * as BJ from '../src/casino/BlackjackEngine';
import { newCore } from './helpers';

/**
 * Drives blackjack through the casino controller exactly the way the table
 * scene does (patron bets, deal, insurance, turns, settlement) with random
 * player choices, and checks the scene can always continue: whenever the
 * round is not over, someone must be able to act.
 */
describe('blackjack table flow', () => {
  for (const table of ['bj1', 'bj2', 'bj3']) {
    it(`never reaches a state the table cannot continue from (${table})`, () => {
      const core = newCore(table.length * 1000 + table.charCodeAt(2));
      core.setLocation('casino', 50, 60);
      core.economy.buyChips(G(15000), 'bank');
      const c = core.casino;
      expect(c.sit(table).ok).toBe(true);
      const rng = new Rng(77);
      const min = c.bj(table).rules.minBet;
      for (let round = 0; round < 400; round++) {
        const s = c.bj(table);
        c.bjPatronBets(table);
        const r = c.bjSetBet(table, min * rng.int(1, 3));
        expect(r.ok, r.ok ? '' : r.error).toBe(true);
        const d = c.bjDeal(table);
        expect(d.ok, d.ok ? '' : d.error).toBe(true);
        for (let guard = 0; guard < 200; guard++) {
          const phase = s.phase as BJ.BJPhase;
          if (phase === 'settled') break;
          if (phase === 'insurance') {
            const ins = c.bjInsurance(table, rng.chance(0.3));
            expect(ins.ok, ins.ok ? '' : ins.error).toBe(true);
            continue;
          }
          expect(phase).toBe('player');
          const owner = c.bjTurnOwner(table);
          // the freeze: a round in play with nobody to act
          expect(owner, `round ${round}: no one to act (turnSeat ${s.turnSeat})`).not.toBeNull();
          if (owner === 'player') {
            const seat = BJ.seatOf(s, 'player');
            const legal = BJ.legalActions(s, seat);
            expect(legal.length).toBeGreaterThan(0);
            const a = legal[rng.int(0, legal.length - 1)];
            const res = c.bjPlayerAct(table, a);
            if (!res.ok) {
              // not enough chips for a double/split: the scene would offer the others
              expect(res.error).toMatch(/筹码不足/);
              expect(c.bjPlayerAct(table, 'stand').ok).toBe(true);
            }
          } else {
            expect(c.bjPatronAct(table).ok).toBe(true);
          }
        }
        expect(s.phase).toBe('settled');
        c.collect(table);
        if (core.economy.balance('chips') < min * 8) core.economy.buyChips(G(3000), 'bank');
      }
      expect(core.economy.checkConservation().ok).toBe(true);
    });
  }
});
