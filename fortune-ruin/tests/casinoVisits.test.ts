import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import { newCore, playBlackjackRound } from './helpers';

describe('coming back to the casino', () => {
  it('leaves no phantom players behind: every seat and bet belongs to someone who is actually there', () => {
    const core = newCore(7001);
    for (let visit = 0; visit < 4; visit++) {
      core.setLocation('casino', 50, 60);
      core.advance(180, 'idle'); // the floor plays on: patrons come, sit, bet and leave
      const known = new Set(core.state.casino.patrons.filter((p) => p.state !== 'gone').map((p) => p.id));
      for (const [id, t] of Object.entries(core.state.casino.tables)) {
        if (t.game === 'blackjack') for (const s of t.s.seats) if (s.occupant) expect(known.has(s.occupant), `${id} seat held by ${s.occupant}`).toBe(true);
        if (t.game === 'baccarat' || t.game === 'roulette') for (const b of t.s.bets) expect(known.has(b.owner) || b.owner === 'player').toBe(true);
      }
      core.setLocation('city', 10, 10);
      core.advance(600, 'idle');
    }
  });

  it('the player can always sit down and play again on a later visit', () => {
    const core = newCore(7001);
    for (let visit = 0; visit < 4; visit++) {
      core.setLocation('casino', 50, 60);
      core.economy.buyChips(G(300), 'bank');
      core.advance(120, 'idle');
      const sit = core.casino.sit('bj2');
      expect(sit.ok, sit.ok ? '' : sit.error).toBe(true);
      const min = core.casino.bj('bj2').rules.minBet;
      for (let r = 0; r < 5; r++) playBlackjackRound(core, 'bj2', min);
      expect(core.casino.standUp().ok).toBe(true);
      core.economy.cashOutChips(core.economy.balance('chips'));
      core.setLocation('city', 10, 10);
      core.advance(600, 'idle');
    }
    expect(core.economy.checkConservation().ok).toBe(true);
  });
});
