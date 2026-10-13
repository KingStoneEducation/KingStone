import { startNewGame, type NewGameOptions } from '../src/core/newGame';
import type { GameCore } from '../src/core/GameCore';

export function newCore(seed = 12345, overrides: Partial<NewGameOptions> = {}): GameCore {
  return startNewGame({
    name: '测试者',
    appearance: { skin: 1, hairStyle: 0, hairColor: 0, pronoun: 'they' },
    personality: 'rational',
    background: 'local',
    seed,
    ...overrides,
  });
}

/** Plays one blackjack round at a table with basic-ish choices (stand on 17+). */
export function playBlackjackRound(core: GameCore, tableId: string, bet: number): void {
  const c = core.casino;
  c.bjPatronBets(tableId);
  const r = c.bjSetBet(tableId, bet);
  if (!r.ok) throw new Error(r.error);
  const d = c.bjDeal(tableId);
  if (!d.ok) throw new Error(d.error);
  const s = c.bj(tableId);
  if (s.phase === 'insurance') c.bjInsurance(tableId, false);
  let guard = 0;
  while (s.phase === 'player' && guard++ < 100) {
    const owner = c.bjTurnOwner(tableId);
    if (owner === 'player') {
      const seat = s.turnSeat;
      const h = s.seats[seat].hands[s.seats[seat].active];
      let total = 0;
      let aces = 0;
      for (const card of h.cards) {
        const rank = (card % 13) + 1;
        total += rank >= 10 ? 10 : rank;
        if (rank === 1) aces++;
      }
      if (aces && total + 10 <= 21) total += 10;
      c.bjPlayerAct(tableId, total >= 17 ? 'stand' : 'hit');
    } else {
      c.bjPatronAct(tableId);
    }
  }
  c.collect(tableId);
}

/** Advance the clock by at least `minutes`, continuing through collapses. */
export function skip(core: GameCore, minutes: number, activity: 'idle' | 'sleeping' = 'idle'): void {
  const target = core.now() + minutes;
  let guard = 0;
  while (core.now() < target && guard++ < 100000) core.advance(Math.min(60, target - core.now()), activity);
}
