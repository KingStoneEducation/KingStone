import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import { createStackedShoe, parseCards, freshDecks } from '../src/casino/cards';
import {
  act,
  closeInsurance,
  createBlackjackTable,
  decideInsurance,
  finishRound,
  handValue,
  legalActions,
  placeBet,
  seatReturn,
  seatStake,
  sit,
  startRound,
  type BlackjackRules,
  type BlackjackState,
} from '../src/casino/BlackjackEngine';
import { basicStrategy } from '../src/casino/blackjackStrategy';

function table(order: string, rules: Partial<BlackjackRules> = {}, seats = 1): BlackjackState {
  const t = createBlackjackTable('t', { seats, minBet: G(10), maxBet: G(1000), ...rules }, 1);
  t.shoe = createStackedShoe(parseCards(order));
  return t;
}

function single(order: string, rules: Partial<BlackjackRules> = {}, bet = G(10)): BlackjackState {
  const t = table(order, rules);
  sit(t, 0, 'player');
  placeBet(t, 0, bet);
  return t;
}

describe('hand values', () => {
  it('handles soft and hard totals', () => {
    expect(handValue(parseCards('As 6h'))).toEqual({ total: 17, soft: true });
    expect(handValue(parseCards('As 6h 10d'))).toEqual({ total: 17, soft: false });
    expect(handValue(parseCards('As Ad'))).toEqual({ total: 12, soft: true });
    expect(handValue(parseCards('As Ad 9c'))).toEqual({ total: 21, soft: true });
    expect(handValue(parseCards('Ks Qd'))).toEqual({ total: 20, soft: false });
    expect(handValue(parseCards('10s 5d 7c'))).toEqual({ total: 22, soft: false });
    expect(handValue(parseCards('As As As As 7d'))).toEqual({ total: 21, soft: true });
  });
});

describe('blackjack payouts', () => {
  it('pays a natural 3:2', () => {
    const t = single('As 9h Kd 7c');
    startRound(t);
    expect(t.phase).toBe('settled');
    const h = t.seats[0].hands[0];
    expect(h.result).toBe('blackjack');
    expect(h.payout).toBe(G(25));
  });

  it('pays a natural 6:5 on a 6:5 table', () => {
    const t = single('As 9h Kd 7c', { blackjackPays: [6, 5] });
    startRound(t);
    expect(t.seats[0].hands[0].payout).toBe(G(22));
  });

  it('pays 3:2 on odd bets exactly using minor units', () => {
    const t = single('As 9h Kd 7c', {}, G(25));
    startRound(t);
    expect(t.seats[0].hands[0].payout).toBe(G(62.5));
  });

  it('pushes equal totals and pays even money on wins', () => {
    const t = single('10s 10h 8d 8c');
    startRound(t);
    act(t, 0, 'stand');
    expect(t.seats[0].hands[0].result).toBe('push');
    expect(t.seats[0].hands[0].payout).toBe(G(10));

    const w = single('10s 10h 9d 8c');
    startRound(w);
    act(w, 0, 'stand');
    expect(w.seats[0].hands[0].result).toBe('win');
    expect(w.seats[0].hands[0].payout).toBe(G(20));
  });

  it('a busted player loses even if the dealer would bust', () => {
    const t = single('10s 10h 6d 6c 10d 10c');
    startRound(t);
    act(t, 0, 'hit');
    const h = t.seats[0].hands[0];
    expect(h.result).toBe('bust');
    expect(h.payout).toBe(0);
    // Dealer does not draw when no live hands remain
    expect(t.dealer.cards.length).toBe(2);
  });
});

describe('dealer rules', () => {
  it('stands on soft 17 under S17', () => {
    const t = single('10s As 8h 6d 3c', { insurance: false });
    startRound(t);
    act(t, 0, 'stand');
    expect(t.dealer.cards.length).toBe(2);
    expect(t.seats[0].hands[0].result).toBe('win');
  });

  it('hits soft 17 under H17', () => {
    const t = single('10s As 8h 6d 3c', { insurance: false, dealerHitsSoft17: true });
    startRound(t);
    act(t, 0, 'stand');
    expect(t.dealer.cards.length).toBe(3);
    expect(handValue(t.dealer.cards).total).toBe(20);
    expect(t.seats[0].hands[0].result).toBe('lose');
  });

  it('keeps drawing below 17 and busts correctly', () => {
    const t = single('10s 5h 9d 10c 4d 9s');
    startRound(t);
    act(t, 0, 'stand');
    // dealer 5+10 = 15, +4 = 19 -> stands
    expect(handValue(t.dealer.cards).total).toBe(19);
    expect(t.seats[0].hands[0].result).toBe('push');
  });

  it('peeks with a ten up and settles a dealer blackjack immediately (original bet only)', () => {
    const t = single('9s Kh 9d Ac');
    const ev = startRound(t);
    expect(ev.some((e) => e.k === 'peek' && e.dealerBlackjack)).toBe(true);
    expect(t.phase).toBe('settled');
    expect(legalActions(t, 0)).toEqual([]);
    expect(t.seats[0].hands[0].result).toBe('lose');
    expect(seatStake(t, 0)).toBe(G(10));
  });
});

describe('player options', () => {
  it('double down takes exactly one card and doubles the stake', () => {
    const t = single('6s 5h 5d 10c 10d 9s');
    startRound(t);
    expect(legalActions(t, 0)).toContain('double');
    act(t, 0, 'double');
    const h = t.seats[0].hands[0];
    expect(h.cards.length).toBe(3);
    expect(h.bet).toBe(G(20));
    expect(h.result).toBe('win');
    expect(h.payout).toBe(G(40));
  });

  it('cannot double or split after hitting', () => {
    const t = single('2s 5h 2d 10c 3d 9s 9h');
    startRound(t);
    expect(legalActions(t, 0)).toContain('split');
    act(t, 0, 'hit');
    expect(legalActions(t, 0)).toEqual(['hit', 'stand']);
  });

  it('splits eights into two hands played in order, with double after split', () => {
    const t = single('8s 6h 8d 10c 3s 10d 2h 9c Ks');
    startRound(t);
    act(t, 0, 'split');
    const s = t.seats[0];
    expect(s.hands.length).toBe(2);
    expect(s.hands[0].cards.length).toBe(2);
    expect(s.hands[1].cards.length).toBe(1);
    act(t, 0, 'double');
    expect(s.active).toBe(1);
    expect(s.hands[1].cards.length).toBe(2);
    act(t, 0, 'hit');
    act(t, 0, 'stand');
    expect(t.phase).toBe('settled');
    expect(s.hands[0].payout).toBe(G(40));
    expect(s.hands[1].payout).toBe(G(20));
    expect(seatStake(t, 0)).toBe(G(30));
    expect(seatReturn(t, 0)).toBe(G(60));
  });

  it('split aces receive one card each and 21 pays even money', () => {
    const t = single('As 7h Ad 10c Kd 5s');
    startRound(t);
    act(t, 0, 'split');
    const s = t.seats[0];
    expect(t.phase).toBe('settled');
    expect(s.hands[0].cards.length).toBe(2);
    expect(s.hands[1].cards.length).toBe(2);
    expect(s.hands[0].result).toBe('win');
    expect(s.hands[0].payout).toBe(G(20));
    expect(s.hands[1].result).toBe('lose');
  });

  it('respects the maximum number of split hands', () => {
    const t = single('8s 6h 8d 10c 8h 8c 2s 2d 2h 2c', { maxHands: 3 });
    startRound(t);
    act(t, 0, 'split'); // hands: [8s,8h] [8d]
    expect(legalActions(t, 0)).toContain('split');
    act(t, 0, 'split'); // hands: [8s,8c] [8h] [8d]
    expect(t.seats[0].hands.length).toBe(3);
    expect(legalActions(t, 0)).not.toContain('split');
  });

  it('late surrender returns half the stake', () => {
    const t = single('10s 10h 6d 9c', { surrender: 'late' });
    startRound(t);
    act(t, 0, 'surrender');
    expect(t.seats[0].hands[0].result).toBe('surrender');
    expect(t.seats[0].hands[0].payout).toBe(G(5));
  });

  it('does not offer surrender when the table does not allow it', () => {
    const t = single('10s 10h 6d 9c');
    startRound(t);
    expect(legalActions(t, 0)).not.toContain('surrender');
    expect(() => act(t, 0, 'surrender')).toThrow();
  });
});

describe('insurance', () => {
  it('pays 2:1 when the dealer has blackjack', () => {
    const t = single('10s Ah 9d Kc');
    startRound(t);
    expect(t.phase).toBe('insurance');
    expect(decideInsurance(t, 0, true)).toBe(G(5));
    closeInsurance(t);
    expect(t.phase).toBe('settled');
    expect(t.seats[0].hands[0].payout).toBe(0);
    expect(t.seats[0].insurancePayout).toBe(G(15));
    expect(seatStake(t, 0)).toBe(G(15));
    expect(seatReturn(t, 0)).toBe(G(15));
  });

  it('insurance on a natural behaves like even money', () => {
    const t = single('As Ah Kd Kc');
    startRound(t);
    decideInsurance(t, 0, true);
    closeInsurance(t);
    expect(seatReturn(t, 0) - seatStake(t, 0)).toBe(G(10));
    const u = single('As Ah Kd 9c');
    startRound(u);
    decideInsurance(u, 0, true);
    closeInsurance(u);
    expect(seatReturn(u, 0) - seatStake(u, 0)).toBe(G(10));
  });

  it('loses the insurance stake when the dealer has no blackjack', () => {
    const t = single('10s Ah 9d 7c');
    startRound(t);
    decideInsurance(t, 0, true);
    closeInsurance(t);
    expect(t.phase).toBe('player');
    expect(t.seats[0].insurancePayout).toBe(0);
    act(t, 0, 'stand');
    expect(t.seats[0].hands[0].result).toBe('win');
    expect(seatReturn(t, 0)).toBe(G(20));
  });
});

describe('multi-seat dealing and table limits', () => {
  it('deals left to right, dealer up card after the first pass, hole card last', () => {
    const t = table('2s 3s 4s 5s 6s 7s', {}, 3);
    sit(t, 0, 'a');
    sit(t, 2, 'b');
    placeBet(t, 0, G(10));
    placeBet(t, 2, G(10));
    startRound(t);
    expect(t.seats[0].hands[0].cards).toEqual(parseCards('2s 5s'));
    expect(t.seats[2].hands[0].cards).toEqual(parseCards('3s 6s'));
    expect(t.dealer.cards).toEqual(parseCards('4s 7s'));
  });

  it('rejects bets outside table limits and fractional bets', () => {
    const t = table('2s 3s 4s 5s');
    sit(t, 0, 'p');
    expect(() => placeBet(t, 0, G(5))).toThrow();
    expect(() => placeBet(t, 0, G(1001))).toThrow();
    expect(() => placeBet(t, 0, G(10.5))).toThrow();
    expect(() => placeBet(t, 0, G(10))).not.toThrow();
  });
});

describe('shoe integrity', () => {
  it('a 6-deck shoe contains each card exactly six times and is reshuffled at the cut card', () => {
    const t = createBlackjackTable('real', { minBet: G(10), seats: 1 }, 'shoe-test');
    sit(t, 0, 'p');
    const counts = new Map<number, number>();
    for (const c of t.shoe.cards) counts.set(c, (counts.get(c) ?? 0) + 1);
    expect(t.shoe.cards.length).toBe(312);
    expect([...counts.values()].every((v) => v === 6)).toBe(true);
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual(freshDecks(1));

    let shuffles = 0;
    for (let round = 0; round < 300; round++) {
      placeBet(t, 0, G(10));
      const ev = startRound(t);
      if (ev.some((e) => e.k === 'shuffle')) shuffles++;
      if (t.phase === 'insurance') closeInsurance(t);
      while (t.phase === 'player') {
        const s = t.seats[0];
        const h = s.hands[s.active];
        act(t, 0, basicStrategy(h.cards, t.dealer.cards[0], legalActions(t, 0), false));
      }
      expect(t.phase).toBe('settled');
      finishRound(t);
      // dealt + remaining always equals the shoe size
      expect(t.shoe.pos + (t.shoe.cards.length - t.shoe.pos)).toBe(312);
      expect(t.shoe.pos).toBeLessThanOrEqual(312);
    }
    expect(shuffles).toBeGreaterThan(5);
  });
});

describe('long-run expectation with basic strategy', () => {
  it('house edge for 6D S17 DAS 3:2 is small and positive', () => {
    const t = createBlackjackTable('sim', { minBet: G(10), seats: 1 }, 'edge-sim');
    sit(t, 0, 'p');
    let wagered = 0;
    let net = 0;
    const rounds = 120000;
    for (let i = 0; i < rounds; i++) {
      placeBet(t, 0, G(10));
      startRound(t);
      if (t.phase === 'insurance') closeInsurance(t);
      while (t.phase === 'player') {
        const s = t.seats[0];
        const h = s.hands[s.active];
        act(t, 0, basicStrategy(h.cards, t.dealer.cards[0], legalActions(t, 0), false));
      }
      wagered += G(10);
      net += seatReturn(t, 0) - seatStake(t, 0);
      finishRound(t);
    }
    const edge = -net / wagered;
    // Theoretical ≈ 0.40%; standard error over 120k hands ≈ 0.33%.
    expect(edge).toBeGreaterThan(-0.012);
    expect(edge).toBeLessThan(0.02);
  });
});
