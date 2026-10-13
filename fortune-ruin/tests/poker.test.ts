import { describe, expect, it } from 'vitest';
import {
  actPoker,
  computePots,
  createPokerTable,
  describeBest,
  evaluate,
  finishPokerHand,
  handCategory,
  handInProgress,
  legalPokerActions,
  pokerRank,
  sitPoker,
  startHand,
  type PokerEvent,
  type PokerSeat,
  type PokerState,
} from '../src/casino/PokerEngine';
import { parseCard, cardSuit } from '../src/casino/cards';
import { Rng } from '../src/core/rng';

const C = (s: string) => s.split(' ').map((x) => parseCard(x));

/** Independent, slow 5-card evaluator used to cross-check the fast one. */
function naive5(cards: number[]): number[] {
  const ranks = cards.map(pokerRank).sort((a, b) => b - a);
  const suits = cards.map(cardSuit);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(ranks)];
  let straight = 0;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straight = ranks[0];
    if (ranks.join() === '14,5,4,3,2') straight = 5;
  }
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroup = groups.map((g) => g[0]);
  if (straight && flush) return [8, straight];
  if (groups[0][1] === 4) return [7, ...byGroup];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, ...byGroup];
  if (flush) return [5, ...ranks];
  if (straight) return [4, straight];
  if (groups[0][1] === 3) return [3, ...byGroup];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...byGroup];
  if (groups[0][1] === 2) return [1, ...byGroup];
  return [0, ...ranks];
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function bestNaive(cards: number[]): number[] {
  let best: number[] = [-1];
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 7; d++)
          for (let e = d + 1; e < 7; e++) {
            const v = naive5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (cmp(v, best) > 0) best = v;
          }
  return best;
}

describe('hand evaluation', () => {
  it('ranks the standard categories in order', () => {
    const hands = [
      'AS KD 9C 7H 4D 3S 2C', // high card
      'AS AD 9C 7H 4D 3S 2C', // pair
      'AS AD 9C 9H 4D 3S 2C', // two pair
      'AS AD AC 9H 4D 3S 2C', // trips
      '6S 5D 4C 3H 2D KS QC', // straight
      'AH KH 9H 7H 2H 3S 4C', // flush
      'AS AD AC 9H 9D 3S 2C', // full house
      'AS AD AC AH 9D 3S 2C', // quads
      '9H 8H 7H 6H 5H AS AC', // straight flush
    ].map((h) => evaluate(C(h)));
    for (let i = 1; i < hands.length; i++) expect(hands[i]).toBeGreaterThan(hands[i - 1]);
    expect(hands.map(handCategory)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('handles the wheel, broadway, kickers and the board playing', () => {
    expect(evaluate(C('AS 2D 3C 4H 5D KS KC'))).toBeLessThan(evaluate(C('2S 3D 4C 5H 6D KS QC')));
    expect(handCategory(evaluate(C('AS 2D 3C 4H 5D 9S 9C')))).toBe(4);
    expect(evaluate(C('AS KD QC JH 10D 2S 3C'))).toBeGreaterThan(evaluate(C('KS QD JC 10H 9D 2S 3C')));
    // same pair, better kicker
    expect(evaluate(C('AS AD KC 7H 4D 3S 2C'))).toBeGreaterThan(evaluate(C('AS AD QC 7H 4D 3S 2C')));
    // two pair: kicker decides
    expect(evaluate(C('KS KD 9C 9H AD 3S 2C'))).toBeGreaterThan(evaluate(C('KS KD 9C 9H QD 3S 2C')));
    // full houses compare trips first
    expect(evaluate(C('9S 9D 9C 2H 2D 3S 4C'))).toBeGreaterThan(evaluate(C('8S 8D 8C AH AD 3S 4C')));
    // board straight plays for both: tie
    const board = '5S 6D 7C 8H 9D';
    expect(evaluate(C(`${board} 2S 2C`))).toBe(evaluate(C(`${board} 3S 3C`)));
    // two trips make a full house with the higher as trips
    expect(handCategory(evaluate(C('9S 9D 9C 4H 4D 4S 2C')))).toBe(6);
    expect(describeBest(C('AH KH 9H 7H 2H 3S 4C')).name).toBe('同花');
    // plain-language details name the deciding ranks
    expect(describeBest(C('AH KH 9H 7H 2H 3S 4C')).detail).toBe('同花（A 高）');
    expect(describeBest(C('QS QD 4C 4H 9D 2S 3C')).detail).toBe('两对 Q/4');
    expect(describeBest(C('AS 2D 3C 4H 5D KS KC')).detail).toBe('顺子（5 高）');
    expect(describeBest(C('9S 9D 9C 4H 4D 4S 2C')).detail).toBe('葫芦（9 带 4）');
    expect(describeBest(C('10H JH QH KH AH 2S 3C')).detail).toBe('皇家同花顺');
    expect(describeBest(C('7S 7D 2C 9H JD QS 3C')).detail).toBe('一对 7');
  });

  it('agrees with an independent brute-force evaluator on 20,000 random hands', () => {
    const rng = new Rng(77);
    for (let n = 0; n < 20000; n++) {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      rng.shuffle(deck);
      const a = deck.slice(0, 7);
      const b = deck.slice(7, 14);
      const fa = evaluate(a);
      const fb = evaluate(b);
      const na = bestNaive(a);
      const nb = bestNaive(b);
      expect(Math.sign(fa - fb)).toBe(Math.sign(cmp(na, nb)));
      expect(handCategory(fa)).toBe(na[0]);
    }
  });
});

function seat(committed: number, folded = false, inHand = true): PokerSeat {
  return { occupant: 'x', stack: 0, hole: [], inHand, folded, allIn: false, bet: 0, committed, acted: true, canRaise: false, startStack: 0, sitOut: false, lastAction: null };
}

describe('pots', () => {
  it('builds main and side pots from all-in levels', () => {
    const pots = computePots([seat(50), seat(100), seat(100), seat(30, true)]);
    expect(pots).toEqual([
      { amount: 50 * 3 + 30, eligible: [0, 1, 2] },
      { amount: 100, eligible: [1, 2] },
    ]);
  });

  it('merges levels with the same contenders', () => {
    const pots = computePots([seat(200), seat(200), seat(80, true)]);
    expect(pots).toEqual([{ amount: 480, eligible: [0, 1] }]);
  });
});

function table(stacks: number[], rules: Partial<PokerState['rules']> = {}): PokerState {
  const s = createPokerTable('t', { seats: stacks.length, minBuyIn: 1, maxBuyIn: 10_000_000, ...rules }, 9);
  stacks.forEach((st, i) => sitPoker(s, i, `p${i}`, st));
  return s;
}

const total = (s: PokerState) => s.seats.reduce((a, x) => a + x.stack, 0);

describe('betting rounds', () => {
  it('posts blinds, deals two cards each and acts left of the big blind', () => {
    const s = table([10000, 10000, 10000, 10000]);
    startHand(s);
    // button moved from 0 to 1, blinds on 2 and 3, first to act is 0
    expect(s.button).toBe(1);
    expect(s.seats[2].committed).toBe(100);
    expect(s.seats[3].committed).toBe(200);
    expect(s.toAct).toBe(0);
    expect(s.seats.every((x) => x.hole.length === 2)).toBe(true);
    const all = s.seats.flatMap((x) => x.hole);
    expect(new Set(all).size).toBe(8);
  });

  it('heads-up: the button posts the small blind and acts first before the flop', () => {
    const s = table([10000, 10000]);
    startHand(s);
    expect(s.sb).toBe(s.button);
    expect(s.toAct).toBe(s.button);
    actPoker(s, s.toAct, { type: 'call' });
    // the big blind still gets the option
    expect(s.phase).toBe('preflop');
    actPoker(s, s.toAct, { type: 'check' });
    expect(s.phase).toBe('flop');
    // after the flop the big blind (non-button) acts first
    expect(s.toAct).not.toBe(s.button);
  });

  it('enforces the minimum raise and the re-opening rule', () => {
    const s = table([10000, 10000, 10000]);
    startHand(s);
    const first = s.toAct;
    expect(() => actPoker(s, first, { type: 'raise', to: 300 })).toThrow(); // min raise to 400
    actPoker(s, first, { type: 'raise', to: 600 }); // raise of 400
    const legal = legalPokerActions(s, s.toAct)!;
    expect(legal.minRaiseTo).toBe(1000);
  });

  it('a short all-in raise does not reopen the betting for players who already acted', () => {
    // seat order after startHand: button 1, sb 2, bb 0 (3 players)
    const s = table([10000, 10000, 700]);
    startHand(s);
    expect(s.button).toBe(1);
    // utg is the button in 3-handed play
    actPoker(s, 1, { type: 'raise', to: 600 }); // button raises to 600 (raise size 400)
    actPoker(s, 2, { type: 'allin' }); // sb shoves 700 total: a raise of only 100
    actPoker(s, 0, { type: 'call' }); // bb calls 700
    // the original raiser may only call or fold now
    const legal = legalPokerActions(s, 1)!;
    expect(legal.canRaise).toBe(false);
    expect(legal.call).toBe(100);
  });

  it('returns an uncalled bet and awards an uncontested pot without rake before the flop', () => {
    const s = table([10000, 10000, 10000]);
    startHand(s);
    const before = total(s) + s.seats.reduce((a, x) => a + x.committed, 0);
    actPoker(s, s.toAct, { type: 'raise', to: 1000 });
    actPoker(s, s.toAct, { type: 'fold' });
    actPoker(s, s.toAct, { type: 'fold' });
    expect(s.phase).toBe('settled');
    expect(s.result!.rake).toBe(0);
    expect(total(s)).toBe(before);
  });

  it('a folded blind is dead money: it stays in the pot on later streets', () => {
    const s = table([10000, 10000, 10000, 10000]);
    startHand(s);
    const sb = s.sb;
    const events: PokerEvent[] = [];
    // everyone calls before the flop except the small blind, who folds; then it is checked down
    for (let guard = 0; guard < 40 && handInProgress(s); guard++) {
      const seat = s.toAct;
      const legal = legalPokerActions(s, seat)!;
      const type = seat === sb && s.phase === 'preflop' ? 'fold' : legal.check ? 'check' : 'call';
      events.push(...actPoker(s, seat, { type }));
    }
    expect(s.phase).toBe('settled');
    expect(events.some((e) => e.k === 'uncalled' && e.seat === sb)).toBe(false);
    expect(s.seats[sb].committed).toBe(100);
    expect(s.seats[sb].stack).toBe(10000 - 100);
    // the winners share everything that went in: three calls of 200 plus the dead small blind
    const paid = s.result!.payouts.reduce((a, b) => a + b, 0);
    expect(paid + s.result!.rake).toBe(700);
  });

  it('runs out the board when everyone is all in and pays side pots correctly', () => {
    const s = table([1000, 3000, 3000]);
    startHand(s);
    for (let guard = 0; guard < 10 && handInProgress(s); guard++) actPoker(s, s.toAct, { type: 'allin' });
    expect(s.phase).toBe('settled');
    expect(s.board.length).toBe(5);
    const r = s.result!;
    expect(r.pots.length).toBe(2);
    expect(r.pots[0].eligible.length).toBe(3);
    expect(r.pots[1].eligible.length).toBe(2);
    // conservation: stacks + rake = 7000 G
    expect(total(s) + r.rake).toBe(7000);
  });

  it('splits a tied pot evenly with the odd chip to the first winner left of the button', () => {
    const s = table([10000, 10000, 10000]);
    // rig the deck: board makes a straight for everyone
    startHand(s);
    s.board = [];
    s.seats.forEach((x) => (x.hole = []));
    s.deck = C('2S 3D 4C 2H 3H 4S 7D 5S 6D 7C 8H 9D 9S 10S').concat([]);
    // re-deal holes manually
    s.seats[0].hole = C('2S 3D');
    s.seats[1].hole = C('4C 2H');
    s.seats[2].hole = C('3H 4S');
    s.deck = C('KD 5S 6D 7C QH 8H JS 9D');
    for (let guard = 0; guard < 20 && handInProgress(s); guard++) {
      const legal = legalPokerActions(s, s.toAct)!;
      actPoker(s, s.toAct, { type: legal.check ? 'check' : 'call' });
    }
    expect(s.board.map(String)).toEqual(C('5S 6D 7C 8H 9D').map(String));
    const pay = s.result!.payouts;
    expect(pay[0]).toBe(pay[1]);
    expect(Math.abs(pay[1] - pay[2])).toBeLessThanOrEqual(1);
    expect(total(s) + s.result!.rake).toBe(30000);
  });
});

describe('chip conservation under random play', () => {
  it('never creates or destroys chips across 3,000 random hands', () => {
    const rng = new Rng(4242);
    const s = table([rng.int(50, 300) * 100, rng.int(50, 300) * 100, rng.int(50, 300) * 100, rng.int(50, 300) * 100, rng.int(50, 300) * 100, rng.int(50, 300) * 100], { rakeBp: 500, rakeCap: 300 });
    let money = total(s);
    let rake = 0;
    for (let h = 0; h < 3000; h++) {
      // rebuy busted players so the game continues
      for (const st of s.seats) {
        if (st.stack < 200) {
          money += 20000 - st.stack;
          st.stack = 20000;
        }
      }
      startHand(s);
      const seen = new Set([...s.seats.flatMap((x) => x.hole)]);
      expect(seen.size).toBe(s.seats.filter((x) => x.inHand).length * 2);
      const foldedAt = new Map<number, number>();
      for (let guard = 0; guard < 200 && handInProgress(s); guard++) {
        const legal = legalPokerActions(s, s.toAct)!;
        const r = rng.float();
        if (r < 0.15) {
          foldedAt.set(s.toAct, s.seats[s.toAct].committed);
          actPoker(s, s.toAct, { type: 'fold' });
        }
        else if (r < 0.6) actPoker(s, s.toAct, { type: legal.check ? 'check' : 'call' });
        else if (legal.canRaise && r < 0.9) {
          const span = Math.max(0, legal.maxRaiseTo - legal.minRaiseTo);
          let to = legal.minRaiseTo + Math.floor((rng.float() * span) / 100) * 100;
          if (to > legal.maxRaiseTo) to = legal.maxRaiseTo;
          actPoker(s, s.toAct, { type: 'raise', to });
        } else actPoker(s, s.toAct, { type: 'allin' });
      }
      expect(s.phase).toBe('settled');
      // whatever a player put in before folding stays in the pot; folders win nothing
      for (const [seat, c] of foldedAt) {
        expect(s.seats[seat].committed).toBe(c);
        expect(s.result!.payouts[seat]).toBe(0);
      }
      // every stack moved by exactly (payout − contribution)
      s.seats.forEach((x, i) => {
        if (x.inHand) expect(x.stack).toBe(x.startStack - x.committed + s.result!.payouts[i]);
      });
      rake += s.result!.rake;
      for (const st of s.seats) expect(st.stack).toBeGreaterThanOrEqual(0);
      expect(total(s) + rake).toBe(money);
      // every pot was paid out exactly
      const paid = s.result!.payouts.reduce((a, b) => a + b, 0);
      const committed = s.seats.reduce((a, x) => a + x.committed, 0);
      expect(paid + s.result!.rake).toBe(committed);
      finishPokerHand(s);
    }
    expect(rake).toBeGreaterThan(0);
  });
});
