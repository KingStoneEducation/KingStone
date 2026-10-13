import type { Rng } from '../core/rng';
import { cardSuit, type Card } from './cards';
import { evaluate, pokerRank, type PokerAction, type PokerView } from './PokerEngine';

/**
 * NPC poker players. A decision only ever receives a PokerView, which holds
 * the player's own hole cards and public information (board, pot, bets,
 * stacks) – never anyone else's cards.
 */

export type PokerStyleId = 'tight' | 'loose' | 'aggressive' | 'passive' | 'bluffer' | 'tilter';

export interface PokerPersona {
  label: string;
  /** looseness before the flop, 0..1 */
  vpip: number;
  /** how often strength is bet/raised instead of called, 0..1 */
  aggression: number;
  /** bluffing frequency, 0..1 */
  bluff: number;
  /** willingness to call without the odds, 0..1 */
  calling: number;
  /** how strongly losses push this player off balance, 0..1 */
  tiltProne: number;
}

export const POKER_STYLES: Record<PokerStyleId, PokerPersona> = {
  tight: { label: '紧手', vpip: 0.18, aggression: 0.55, bluff: 0.05, calling: 0.3, tiltProne: 0.2 },
  loose: { label: '松手', vpip: 0.45, aggression: 0.4, bluff: 0.1, calling: 0.6, tiltProne: 0.4 },
  aggressive: { label: '激进', vpip: 0.32, aggression: 0.85, bluff: 0.2, calling: 0.4, tiltProne: 0.35 },
  passive: { label: '被动', vpip: 0.32, aggression: 0.15, bluff: 0.03, calling: 0.72, tiltProne: 0.3 },
  bluffer: { label: '爱诈唬', vpip: 0.36, aggression: 0.7, bluff: 0.38, calling: 0.4, tiltProne: 0.45 },
  tilter: { label: '易上头', vpip: 0.26, aggression: 0.5, bluff: 0.1, calling: 0.45, tiltProne: 0.95 },
};

/** Chen formula: a classic quick estimate of starting-hand strength (≈ -1 .. 20). */
export function chenScore(hole: readonly Card[]): number {
  const [a, b] = hole.map(pokerRank).sort((x, y) => y - x);
  const base = (r: number) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let s = base(a);
  if (a === b) s = Math.max(5, s * 2);
  if (cardSuit(hole[0]) === cardSuit(hole[1])) s += 2;
  const gap = a - b - 1;
  if (a !== b) {
    if (gap === 1) s -= 1;
    else if (gap === 2) s -= 2;
    else if (gap === 3) s -= 4;
    else if (gap >= 4) s -= 5;
    if (gap <= 1 && a < 12) s += 1;
  }
  return Math.ceil(s);
}

/** Monte Carlo equity against `opponents` unknown hands (ties count half). */
export function estimateEquity(hole: readonly Card[], board: readonly Card[], opponents: number, samples: number, rng: Rng): number {
  if (opponents <= 0) return 1;
  const known = new Set<number>([...hole, ...board]);
  const deck: Card[] = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) deck.push(c);
  const need = 5 - board.length;
  let score = 0;
  const draw = need + opponents * 2;
  for (let n = 0; n < samples; n++) {
    // partial Fisher–Yates for just the cards we need
    for (let i = 0; i < draw; i++) {
      const j = i + rng.int(0, deck.length - 1 - i);
      const t = deck[i];
      deck[i] = deck[j];
      deck[j] = t;
    }
    const full = [...board, ...deck.slice(0, need)];
    const mine = evaluate([...hole, ...full]);
    let best = true;
    let tie = 0;
    for (let o = 0; o < opponents; o++) {
      const v = evaluate([deck[need + o * 2], deck[need + o * 2 + 1], ...full]);
      if (v > mine) {
        best = false;
        break;
      }
      if (v === mine) tie++;
    }
    if (best) score += tie ? 1 / (tie + 1) : 1;
  }
  return score / samples;
}

function roundTo(amount: number, unit: number): number {
  return Math.max(unit, Math.round(amount / unit) * unit);
}

function sized(view: PokerView, to: number): PokerAction {
  let t = Math.max(view.minRaiseTo, Math.min(view.maxRaiseTo, to));
  if (t >= view.maxRaiseTo * 0.8) t = view.maxRaiseTo;
  if (t >= view.maxRaiseTo) return { type: 'allin' };
  return { type: 'raise', to: t };
}

/**
 * @param tilt 0..1 current frustration (from recent losses); shifts play looser and wilder
 */
export function decidePoker(view: PokerView, persona: PokerPersona, tilt: number, rng: Rng): PokerAction {
  const t = Math.max(0, Math.min(1, tilt)) * persona.tiltProne;
  const p: PokerPersona = {
    ...persona,
    vpip: Math.min(0.8, persona.vpip + t * 0.25),
    aggression: Math.min(0.95, persona.aggression + t * 0.3),
    bluff: Math.min(0.6, persona.bluff + t * 0.25),
    calling: Math.min(0.9, persona.calling + t * 0.2),
  };
  const unit = Math.max(100, Math.round(view.bigBlind / 2 / 100) * 100);
  const canCheck = view.toCall === 0;
  const fold: PokerAction = canCheck ? { type: 'check' } : { type: 'fold' };
  const call: PokerAction = canCheck ? { type: 'check' } : { type: 'call' };

  if (view.street === 'preflop') {
    const chen = chenScore(view.hole);
    const threshold = 12 - p.vpip * 20 - (view.isButton ? 1.5 : 0) - (view.behind <= 1 ? 1 : 0);
    const premium = chen >= Math.max(11, threshold + 5);
    const facing = view.toCall / Math.max(1, view.bigBlind);
    if (premium) {
      if (view.canRaise && rng.chance(0.55 + p.aggression * 0.4)) {
        const target = view.currentBet <= view.bigBlind ? view.bigBlind * (2.5 + rng.float()) + view.toCall : view.currentBet * (2.6 + rng.float() * 0.6);
        return sized(view, roundTo(target, unit));
      }
      return call;
    }
    if (chen >= threshold) {
      if (canCheck) {
        if (view.canRaise && rng.chance(p.aggression * 0.45)) return sized(view, roundTo(view.bigBlind * 3, unit));
        return call;
      }
      // the price matters: big raises are only called with better hands
      if (facing <= 4 || chen >= threshold + 2 + facing / 6 || rng.chance(p.calling * 0.35)) {
        if (view.canRaise && rng.chance(p.aggression * 0.25) && facing <= 3) return sized(view, roundTo(view.currentBet * 3, unit));
        return call;
      }
      return fold;
    }
    // weak hands: occasional steal or loose call
    if (canCheck) return call;
    if (view.canRaise && view.isButton && facing <= 1.01 && rng.chance(p.bluff * 0.8)) return sized(view, roundTo(view.bigBlind * 2.5, unit));
    if (facing <= 1.01 && rng.chance(p.calling * 0.25)) return call;
    return fold;
  }

  const samples = 140;
  const equity = estimateEquity(view.hole, view.board, view.opponents, samples, rng);
  const pot = view.pot;
  if (canCheck) {
    const valueLine = 0.6 - p.aggression * 0.12;
    if (equity > valueLine && view.canRaise && rng.chance(0.45 + p.aggression * 0.5)) {
      const frac = 0.45 + rng.float() * 0.45 + (equity > 0.85 ? 0.2 : 0);
      return sized(view, roundTo(pot * frac, unit));
    }
    const bluffChance = p.bluff * (view.opponents <= 1 ? 1 : view.opponents === 2 ? 0.55 : 0.25) * (view.street === 'river' ? 0.8 : 1);
    if (view.canRaise && rng.chance(bluffChance)) return sized(view, roundTo(pot * (0.4 + rng.float() * 0.35), unit));
    return { type: 'check' };
  }
  const potOdds = view.toCall / (pot + view.toCall);
  const margin = (1 - p.calling) * 0.1;
  if (equity > potOdds + margin) {
    if (view.canRaise && equity > 0.7 && rng.chance(p.aggression * 0.75)) {
      return sized(view, roundTo(view.currentBet * (2.3 + rng.float()) + pot * 0.2, unit));
    }
    return call;
  }
  // semi-bluff / bluff-raise, or a sticky call
  if (view.canRaise && view.street !== 'river' && equity > 0.25 && rng.chance(p.bluff * 0.3)) return sized(view, roundTo(view.currentBet * 2.5 + pot * 0.3, unit));
  if (equity > potOdds * 0.7 && rng.chance(p.calling * 0.3)) return call;
  return fold;
}
