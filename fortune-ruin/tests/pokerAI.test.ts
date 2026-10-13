import { describe, expect, it } from 'vitest';
import { actPoker, createPokerTable, finishPokerHand, handInProgress, pokerView, sitPoker, startHand, type PokerState } from '../src/casino/PokerEngine';
import { chenScore, decidePoker, estimateEquity, POKER_STYLES, type PokerStyleId } from '../src/casino/pokerAI';
import { parseCards } from '../src/casino/cards';
import { Rng } from '../src/core/rng';

function aiTable(styles: PokerStyleId[], seed = 3): PokerState {
  const s = createPokerTable('ai', { seats: styles.length, smallBlind: 100, bigBlind: 200, minBuyIn: 1, maxBuyIn: 1e9 }, seed);
  styles.forEach((_, i) => sitPoker(s, i, `p${i}`, 40000));
  return s;
}

describe('poker AI', () => {
  it('estimates equity sensibly', () => {
    const rng = new Rng(1);
    const aa = estimateEquity(parseCards('AS AH'), [], 1, 3000, rng);
    const sevenTwo = estimateEquity(parseCards('7S 2H'), [], 1, 3000, rng);
    expect(aa).toBeGreaterThan(0.8);
    expect(aa).toBeLessThan(0.9);
    expect(sevenTwo).toBeGreaterThan(0.29);
    expect(sevenTwo).toBeLessThan(0.4);
    // made nut flush on the river is nearly unbeatable
    expect(estimateEquity(parseCards('AS KS'), parseCards('2S 7S 9S JD 3C'), 2, 1500, rng)).toBeGreaterThan(0.9);
    expect(chenScore(parseCards('AS AH'))).toBe(20);
    expect(chenScore(parseCards('7S 2H'))).toBeLessThan(2);
  });

  it('only sees its own cards: changing opponents’ hidden cards does not change its view or decision', () => {
    const s = aiTable(['tight', 'loose', 'aggressive', 'passive']);
    startHand(s);
    const seat = s.toAct;
    const v1 = pokerView(s, seat)!;
    const others = s.seats.map((x, i) => (i === seat ? null : [...x.hole]));
    // swap every other player's hole cards with cards from the deck
    s.seats.forEach((x, i) => {
      if (i !== seat) x.hole = [s.deck.pop()!, s.deck.pop()!];
    });
    const v2 = pokerView(s, seat)!;
    expect(v2).toEqual(v1);
    const d1 = decidePoker(v1, POKER_STYLES.aggressive, 0, new Rng(5));
    const d2 = decidePoker(v2, POKER_STYLES.aggressive, 0, new Rng(5));
    expect(d2).toEqual(d1);
    expect(JSON.stringify(v1)).not.toContain(JSON.stringify(others.find((o) => o)));
  });

  it('always chooses legal actions over many hands', () => {
    const styles: PokerStyleId[] = ['tight', 'loose', 'aggressive', 'passive', 'bluffer', 'tilter'];
    const s = aiTable(styles, 11);
    const rng = new Rng(9);
    for (let h = 0; h < 250; h++) {
      for (const st of s.seats) if (st.stack < 400) st.stack = 40000;
      startHand(s);
      for (let guard = 0; guard < 120 && handInProgress(s); guard++) {
        const seat = s.toAct;
        const view = pokerView(s, seat)!;
        const action = decidePoker(view, POKER_STYLES[styles[seat]], h % 7 === 0 ? 0.8 : 0, rng);
        expect(() => actPoker(s, seat, action)).not.toThrow();
      }
      expect(s.phase).toBe('settled');
      finishPokerHand(s);
    }
  });

  it('styles play measurably differently (VPIP and aggression)', () => {
    const styles: PokerStyleId[] = ['tight', 'loose', 'aggressive', 'passive', 'tight', 'loose'];
    const s = aiTable(styles, 21);
    const rng = new Rng(13);
    const vpip = new Map<PokerStyleId, { hands: number; played: number; raises: number; calls: number }>();
    for (const st of styles) vpip.set(st, { hands: 0, played: 0, raises: 0, calls: 0 });
    for (let h = 0; h < 500; h++) {
      for (const st of s.seats) if (st.stack < 400) st.stack = 40000;
      startHand(s);
      const voluntary = new Set<number>();
      for (let guard = 0; guard < 120 && handInProgress(s); guard++) {
        const seat = s.toAct;
        const view = pokerView(s, seat)!;
        const a = decidePoker(view, POKER_STYLES[styles[seat]], 0, rng);
        const rec = vpip.get(styles[seat])!;
        if (a.type === 'raise' || a.type === 'allin') rec.raises++;
        if (a.type === 'call') rec.calls++;
        if (view.street === 'preflop' && (a.type === 'call' || a.type === 'raise' || a.type === 'allin')) voluntary.add(seat);
        actPoker(s, seat, a);
      }
      styles.forEach((st, i) => {
        const rec = vpip.get(st)!;
        rec.hands++;
        if (voluntary.has(i)) rec.played++;
      });
      finishPokerHand(s);
    }
    const rate = (st: PokerStyleId) => vpip.get(st)!.played / vpip.get(st)!.hands;
    const af = (st: PokerStyleId) => vpip.get(st)!.raises / Math.max(1, vpip.get(st)!.calls);
    expect(rate('tight')).toBeLessThan(rate('loose'));
    expect(af('aggressive')).toBeGreaterThan(af('passive'));
  });
});
