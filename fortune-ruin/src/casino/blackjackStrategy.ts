import { Rng } from '../core/rng';
import { cardPoints, handValue, legalActions, type BJAction, type BlackjackState } from './BlackjackEngine';
import type { Card } from './cards';

/**
 * Multi-deck basic strategy (S17 or H17, double after split) and a set of
 * imperfect human styles used by NPC gamblers. NPCs only use information a
 * real player at the table has: their own cards and the dealer's up card.
 */

type Code = 'H' | 'S' | 'D' | 'Ds' | 'P' | 'Ph' | 'Rh';

// Dealer up card index: 2..10, 11 = Ace
function upIndex(up: Card): number {
  const p = cardPoints(up);
  return p === 1 ? 11 : p;
}

function hardCode(total: number, up: number, h17: boolean): Code {
  if (total >= 17) return 'S';
  if (total >= 13) {
    if (total === 16 && (up === 9 || up === 10 || up === 11)) return 'Rh';
    if (total === 15 && (up === 10 || (h17 && up === 11))) return 'Rh';
    return up <= 6 ? 'S' : 'H';
  }
  if (total === 12) return up >= 4 && up <= 6 ? 'S' : 'H';
  if (total === 11) return up === 11 && !h17 ? 'H' : 'D';
  if (total === 10) return up <= 9 ? 'D' : 'H';
  if (total === 9) return up >= 3 && up <= 6 ? 'D' : 'H';
  return 'H';
}

function softCode(total: number, up: number, h17: boolean): Code {
  if (total >= 20) return 'S';
  if (total === 19) return h17 && up === 6 ? 'Ds' : 'S';
  if (total === 18) {
    if (up <= 6) return h17 || up >= 3 ? 'Ds' : 'S';
    if (up <= 8) return 'S';
    return 'H';
  }
  if (total === 17) return up >= 3 && up <= 6 ? 'D' : 'H';
  if (total === 16 || total === 15) return up >= 4 && up <= 6 ? 'D' : 'H';
  if (total === 14 || total === 13) return up >= 5 && up <= 6 ? 'D' : 'H';
  return 'H';
}

function pairCode(p: number, up: number): Code | null {
  switch (p) {
    case 1:
      return 'P';
    case 10:
      return 'S';
    case 9:
      return up === 7 || up === 10 || up === 11 ? 'S' : 'P';
    case 8:
      return 'P';
    case 7:
      return up <= 7 ? 'P' : 'H';
    case 6:
      return up <= 6 ? 'P' : 'H';
    case 5:
      return null; // play as hard 10
    case 4:
      return up === 5 || up === 6 ? 'P' : 'H';
    case 3:
    case 2:
      return up <= 7 ? 'P' : 'H';
  }
  return null;
}

/** Best basic-strategy action among the legal actions. */
export function basicStrategy(cards: readonly Card[], dealerUp: Card, legal: readonly BJAction[], h17: boolean): BJAction {
  const up = upIndex(dealerUp);
  const can = (a: BJAction) => legal.includes(a);
  if (cards.length === 2 && cardPoints(cards[0]) === cardPoints(cards[1]) && can('split')) {
    const pc = pairCode(cardPoints(cards[0]), up);
    if (pc === 'P') return 'split';
  }
  const v = handValue(cards);
  const code = v.soft ? softCode(v.total, up, h17) : hardCode(v.total, up, h17);
  return resolve(code, can);
}

function resolve(code: Code, can: (a: BJAction) => boolean): BJAction {
  switch (code) {
    case 'S':
      return 'stand';
    case 'H':
      return can('hit') ? 'hit' : 'stand';
    case 'D':
      return can('double') ? 'double' : can('hit') ? 'hit' : 'stand';
    case 'Ds':
      return can('double') ? 'double' : 'stand';
    case 'Rh':
      return can('surrender') ? 'surrender' : can('hit') ? 'hit' : 'stand';
    case 'P':
      return can('split') ? 'split' : can('hit') ? 'hit' : 'stand';
    case 'Ph':
      return can('split') ? 'split' : can('hit') ? 'hit' : 'stand';
  }
}

export type BJStyle = 'basic' | 'cautious' | 'dealer-mimic' | 'reckless';

/**
 * A human-ish decision. `skill` (0..1) is the probability of following basic
 * strategy on a given decision; otherwise the player's style heuristic is used.
 */
export function npcDecision(state: BlackjackState, seat: number, style: BJStyle, skill: number, rng: Rng): BJAction {
  const legal = legalActions(state, seat);
  if (legal.length === 0) return 'stand';
  const s = state.seats[seat];
  const h = s.hands[s.active];
  const up = state.dealer.cards[0];
  const h17 = state.rules.dealerHitsSoft17;
  if (style === 'basic' || rng.chance(skill)) return basicStrategy(h.cards, up, legal, h17);
  const v = handValue(h.cards);
  const upv = upIndex(up);
  const can = (a: BJAction) => legal.includes(a);
  switch (style) {
    case 'cautious':
      // Afraid of busting: stands on any 12+, rarely doubles.
      if (can('split') && (cardPoints(h.cards[0]) === 1 || cardPoints(h.cards[0]) === 8)) return 'split';
      if (v.total === 11 && can('double') && rng.chance(0.5)) return 'double';
      return v.total >= 12 ? 'stand' : can('hit') ? 'hit' : 'stand';
    case 'dealer-mimic':
      if (can('split') && cardPoints(h.cards[0]) === 1) return 'split';
      if ((v.total === 10 || v.total === 11) && can('double') && upv < 10) return 'double';
      return v.total < 17 ? (can('hit') ? 'hit' : 'stand') : 'stand';
    case 'reckless': {
      if (can('split') && rng.chance(0.6)) return 'split';
      if (can('double') && v.total >= 8 && v.total <= 12 && rng.chance(0.6)) return 'double';
      const threshold = rng.int(15, 18);
      return v.total < threshold ? (can('hit') ? 'hit' : 'stand') : 'stand';
    }
  }
  return basicStrategy(h.cards, up, legal, h17);
}

/** Whether an NPC takes insurance (basic strategy never does). */
export function npcTakesInsurance(style: BJStyle, skill: number, rng: Rng): boolean {
  if (style === 'basic') return false;
  const p = style === 'cautious' ? 0.45 : style === 'reckless' ? 0.25 : 0.15;
  return rng.chance(p * (1 - skill));
}
