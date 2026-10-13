import { mulRatio, type Money } from '../core/money';
import {
  cardRank,
  createShoe,
  cutCardReached,
  drawCard,
  shuffleShoe,
  type Card,
  type ShoeState,
} from './cards';

/**
 * Blackjack rule engine (American hole-card game with dealer peek).
 *
 * The engine is pure game logic: it owns the shoe and the table layout, it
 * validates every action against the published rules and it reports the
 * stake/payout of each hand. It never touches player accounts — the caller
 * (CasinoManager) escrows stakes before calling and credits payouts after.
 * Outcomes depend only on the order of cards in the shoe.
 */

export interface BlackjackRules {
  decks: number;
  /** Blackjack payout ratio, e.g. [3, 2] or [6, 5]. */
  blackjackPays: [number, number];
  /** H17 when true, S17 when false. */
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  doubleOn: 'any' | '9-11' | '10-11';
  /** Maximum number of hands a seat may hold after splitting. */
  maxHands: number;
  resplitAces: boolean;
  hitSplitAces: boolean;
  insurance: boolean;
  surrender: 'none' | 'late';
  /** Fraction of the shoe dealt before the cut card. */
  penetration: number;
  minBet: Money;
  maxBet: Money;
  seats: number;
}

export const DEFAULT_BJ_RULES: BlackjackRules = {
  decks: 6,
  blackjackPays: [3, 2],
  dealerHitsSoft17: false,
  doubleAfterSplit: true,
  doubleOn: 'any',
  maxHands: 4,
  resplitAces: false,
  hitSplitAces: false,
  insurance: true,
  surrender: 'none',
  penetration: 0.75,
  minBet: 1000,
  maxBet: 100000,
  seats: 5,
};

export type BJAction = 'hit' | 'stand' | 'double' | 'split' | 'surrender';
export type HandResult = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'surrender';

export interface BJHand {
  cards: Card[];
  /** Total stake on this hand (doubles included). */
  bet: Money;
  doubled: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  done: boolean;
  surrendered: boolean;
  result?: HandResult;
  /** Total returned to the owner at settlement, stake included. */
  payout?: Money;
}

export interface BJSeat {
  occupant: string | null;
  pendingBet: Money;
  hands: BJHand[];
  active: number;
  insurance: Money;
  insuranceDecided: boolean;
  insurancePayout?: Money;
}

export type BJPhase = 'betting' | 'insurance' | 'player' | 'settled';

export interface BlackjackState {
  id: string;
  rules: BlackjackRules;
  shoe: ShoeState;
  seats: BJSeat[];
  dealer: { cards: Card[]; holeHidden: boolean };
  phase: BJPhase;
  turnSeat: number;
  round: number;
  discards: number;
  needsShuffle: boolean;
}

export type BJEvent =
  | { k: 'shuffle' }
  | { k: 'burn'; card: Card }
  | { k: 'deal'; seat: number; hand: number; card: Card }
  | { k: 'dealerDeal'; card: Card; hidden: boolean }
  | { k: 'insuranceOffered' }
  | { k: 'peek'; dealerBlackjack: boolean }
  | { k: 'reveal'; card: Card }
  | { k: 'split'; seat: number; hand: number; newHand: number; extra: Money }
  | { k: 'double'; seat: number; hand: number; extra: Money }
  | { k: 'surrender'; seat: number; hand: number }
  | { k: 'bust'; seat: number; hand: number; total: number }
  | { k: 'turn'; seat: number; hand: number }
  | { k: 'dealerTurn' }
  | { k: 'dealerStands'; total: number }
  | { k: 'dealerBust'; total: number }
  | { k: 'settle'; seat: number; hand: number; result: HandResult; bet: Money; payout: Money }
  | { k: 'insuranceSettle'; seat: number; stake: Money; payout: Money }
  | { k: 'roundOver' };

export class BlackjackError extends Error {}

// ---------------------------------------------------------------- hand math

export function cardPoints(c: Card): number {
  const r = cardRank(c);
  return r >= 10 ? 10 : r;
}

export function handValue(cards: readonly Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const p = cardPoints(c);
    total += p;
    if (p === 1) aces++;
  }
  if (aces > 0 && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

export function isNatural(hand: Pick<BJHand, 'cards' | 'fromSplit'>): boolean {
  return !hand.fromSplit && hand.cards.length === 2 && handValue(hand.cards).total === 21;
}

export function dealerHasNatural(state: BlackjackState): boolean {
  return state.dealer.cards.length === 2 && handValue(state.dealer.cards).total === 21;
}

export function describeHand(cards: readonly Card[]): string {
  const v = handValue(cards);
  if (cards.length === 2 && v.total === 21) return 'Blackjack';
  if (v.total > 21) return `${v.total} 爆牌`;
  return v.soft ? `软 ${v.total}` : `${v.total}`;
}

// ---------------------------------------------------------------- creation

export function createBlackjackTable(id: string, rules: Partial<BlackjackRules>, seed: number | string): BlackjackState {
  const full: BlackjackRules = { ...DEFAULT_BJ_RULES, ...rules };
  validateRules(full);
  const shoe = createShoe(full.decks, full.penetration, seed);
  const state: BlackjackState = {
    id,
    rules: full,
    shoe,
    seats: Array.from({ length: full.seats }, () => emptySeat()),
    dealer: { cards: [], holeHidden: true },
    phase: 'betting',
    turnSeat: -1,
    round: 0,
    discards: 0,
    needsShuffle: false,
  };
  // Standard practice: burn one card after every shuffle.
  drawCard(state.shoe);
  state.discards = 1;
  return state;
}

function validateRules(r: BlackjackRules): void {
  if (r.decks < 1 || r.decks > 8) throw new BlackjackError('decks must be 1..8');
  if (r.maxHands < 1 || r.maxHands > 4) throw new BlackjackError('maxHands must be 1..4');
  if (r.minBet <= 0 || r.maxBet < r.minBet) throw new BlackjackError('bad table limits');
  if (r.minBet % 100 !== 0 || r.maxBet % 100 !== 0) throw new BlackjackError('limits must be whole G');
  if (r.seats < 1 || r.seats > 7) throw new BlackjackError('seats must be 1..7');
}

function emptySeat(): BJSeat {
  return { occupant: null, pendingBet: 0, hands: [], active: 0, insurance: 0, insuranceDecided: false };
}

// ---------------------------------------------------------------- seating & betting

export function sit(state: BlackjackState, seat: number, occupant: string): void {
  const s = state.seats[seat];
  if (!s) throw new BlackjackError('no such seat');
  if (s.occupant && s.occupant !== occupant) throw new BlackjackError('seat taken');
  s.occupant = occupant;
}

export function leave(state: BlackjackState, seat: number): void {
  const s = state.seats[seat];
  if (!s) return;
  if (s.hands.length > 0 && state.phase !== 'betting') throw new BlackjackError('cannot leave mid-round');
  state.seats[seat] = emptySeat();
}

export function seatOf(state: BlackjackState, occupant: string): number {
  return state.seats.findIndex((s) => s.occupant === occupant);
}

export function validateBet(state: BlackjackState, amount: Money): string | null {
  const r = state.rules;
  if (!Number.isSafeInteger(amount) || amount <= 0) return '下注金额无效';
  if (amount % 100 !== 0) return '下注必须为整数 G';
  if (amount < r.minBet) return `低于本桌最低下注`;
  if (amount > r.maxBet) return `超过本桌最高下注`;
  return null;
}

/** Sets the pending main bet of a seat for the next round. The caller escrows the chips. */
export function placeBet(state: BlackjackState, seat: number, amount: Money): void {
  if (state.phase !== 'betting' && state.phase !== 'settled') throw new BlackjackError('betting is closed');
  const s = state.seats[seat];
  if (!s || !s.occupant) throw new BlackjackError('seat is empty');
  const err = validateBet(state, amount);
  if (err) throw new BlackjackError(err);
  s.pendingBet = amount;
}

export function clearBet(state: BlackjackState, seat: number): Money {
  const s = state.seats[seat];
  if (!s) return 0;
  if (state.phase !== 'betting' && state.phase !== 'settled') throw new BlackjackError('betting is closed');
  const amt = s.pendingBet;
  s.pendingBet = 0;
  return amt;
}

export function canStartRound(state: BlackjackState): boolean {
  return (state.phase === 'betting' || state.phase === 'settled') && state.seats.some((s) => s.occupant && s.pendingBet > 0);
}

function cardsInPlay(state: BlackjackState): Card[] {
  const out: Card[] = [...state.dealer.cards];
  for (const s of state.seats) for (const h of s.hands) out.push(...h.cards);
  return out;
}

function draw(state: BlackjackState): Card {
  return drawCard(state.shoe, cardsInPlay(state));
}

// ---------------------------------------------------------------- round flow

export function startRound(state: BlackjackState): BJEvent[] {
  if (state.phase === 'settled') finishRound(state);
  if (!canStartRound(state)) throw new BlackjackError('no bets placed');
  const ev: BJEvent[] = [];
  if (state.needsShuffle) {
    shuffleShoe(state.shoe);
    state.needsShuffle = false;
    state.discards = 0;
    ev.push({ k: 'shuffle' });
    const burn = drawCard(state.shoe);
    state.discards = 1;
    ev.push({ k: 'burn', card: burn });
  }
  state.round += 1;
  const active: number[] = [];
  state.seats.forEach((s, i) => {
    s.hands = [];
    s.active = 0;
    s.insurance = 0;
    s.insuranceDecided = false;
    s.insurancePayout = undefined;
    if (s.occupant && s.pendingBet > 0) {
      s.hands = [newHand(s.pendingBet)];
      s.pendingBet = 0;
      active.push(i);
    }
  });
  state.dealer = { cards: [], holeHidden: true };

  for (const i of active) dealTo(state, i, 0, ev);
  const up = draw(state);
  state.dealer.cards.push(up);
  ev.push({ k: 'dealerDeal', card: up, hidden: false });
  for (const i of active) dealTo(state, i, 0, ev);
  const hole = draw(state);
  state.dealer.cards.push(hole);
  ev.push({ k: 'dealerDeal', card: hole, hidden: true });

  if (state.rules.insurance && cardPoints(up) === 1) {
    state.phase = 'insurance';
    ev.push({ k: 'insuranceOffered' });
    return ev;
  }
  return afterInsurance(state, ev);
}

function newHand(bet: Money): BJHand {
  return { cards: [], bet, doubled: false, fromSplit: false, splitAces: false, done: false, surrendered: false };
}

function dealTo(state: BlackjackState, seat: number, hand: number, ev: BJEvent[]): Card {
  const c = draw(state);
  state.seats[seat].hands[hand].cards.push(c);
  ev.push({ k: 'deal', seat, hand, card: c });
  return c;
}

/** Insurance costs half of the main bet. Returns the stake the caller must escrow. */
export function insuranceCost(state: BlackjackState, seat: number): Money {
  const s = state.seats[seat];
  if (!s || s.hands.length === 0) return 0;
  return Math.floor(s.hands[0].bet / 2);
}

export function decideInsurance(state: BlackjackState, seat: number, take: boolean): Money {
  if (state.phase !== 'insurance') throw new BlackjackError('insurance is not offered');
  const s = state.seats[seat];
  if (!s || s.hands.length === 0) throw new BlackjackError('seat has no hand');
  if (s.insuranceDecided) throw new BlackjackError('already decided');
  s.insuranceDecided = true;
  s.insurance = take ? insuranceCost(state, seat) : 0;
  return s.insurance;
}

export function insurancePending(state: BlackjackState): number[] {
  if (state.phase !== 'insurance') return [];
  return state.seats.map((s, i) => (s.hands.length > 0 && !s.insuranceDecided ? i : -1)).filter((i) => i >= 0);
}

/** Closes insurance (undecided seats decline) and performs the dealer peek. */
export function closeInsurance(state: BlackjackState): BJEvent[] {
  if (state.phase !== 'insurance') throw new BlackjackError('insurance is not offered');
  for (const s of state.seats) {
    if (s.hands.length > 0 && !s.insuranceDecided) {
      s.insuranceDecided = true;
      s.insurance = 0;
    }
  }
  return afterInsurance(state, []);
}

function afterInsurance(state: BlackjackState, ev: BJEvent[]): BJEvent[] {
  const up = state.dealer.cards[0];
  const peekNeeded = cardPoints(up) === 1 || cardPoints(up) === 10;
  if (peekNeeded) {
    const bj = dealerHasNatural(state);
    ev.push({ k: 'peek', dealerBlackjack: bj });
    if (bj) {
      state.dealer.holeHidden = false;
      ev.push({ k: 'reveal', card: state.dealer.cards[1] });
      for (const s of state.seats) for (const h of s.hands) h.done = true;
      settle(state, ev);
      return ev;
    }
  }
  // Insurance stakes lose when the dealer does not have blackjack.
  state.seats.forEach((s, i) => {
    if (s.insurance > 0) {
      s.insurancePayout = 0;
      ev.push({ k: 'insuranceSettle', seat: i, stake: s.insurance, payout: 0 });
    }
  });
  // Naturals are complete; they are paid at settlement.
  for (const s of state.seats) for (const h of s.hands) if (isNatural(h)) h.done = true;
  state.phase = 'player';
  state.turnSeat = -1;
  advance(state, ev);
  return ev;
}

/** Moves the turn to the next hand that needs a decision, or plays the dealer. */
function advance(state: BlackjackState, ev: BJEvent[]): void {
  const startSeat = Math.max(0, state.turnSeat);
  for (let i = startSeat; i < state.seats.length; i++) {
    const s = state.seats[i];
    if (s.hands.length === 0) continue;
    if (i !== state.turnSeat) s.active = 0;
    while (s.active < s.hands.length) {
      const h = s.hands[s.active];
      if (h.cards.length === 1) {
        // Second card for a split hand is dealt when the hand comes into play.
        dealTo(state, i, s.active, ev);
        const v = handValue(h.cards).total;
        if (h.splitAces && !state.rules.hitSplitAces) {
          const canResplit = state.rules.resplitAces && cardPoints(h.cards[1]) === 1 && s.hands.length < state.rules.maxHands;
          if (!canResplit) h.done = true;
        }
        if (v === 21) h.done = true;
      }
      if (!h.done) {
        state.turnSeat = i;
        ev.push({ k: 'turn', seat: i, hand: s.active });
        return;
      }
      s.active++;
    }
  }
  state.turnSeat = -1;
  playDealer(state, ev);
}

export function currentHand(state: BlackjackState): { seat: number; hand: number } | null {
  if (state.phase !== 'player' || state.turnSeat < 0) return null;
  return { seat: state.turnSeat, hand: state.seats[state.turnSeat].active };
}

export function legalActions(state: BlackjackState, seat: number): BJAction[] {
  if (state.phase !== 'player' || state.turnSeat !== seat) return [];
  const s = state.seats[seat];
  const h = s.hands[s.active];
  if (!h || h.done) return [];
  const r = state.rules;
  const out: BJAction[] = [];
  const v = handValue(h.cards);
  const splitAceLocked = h.splitAces && !r.hitSplitAces;
  if (v.total < 21 && !splitAceLocked) out.push('hit');
  out.push('stand');
  if (h.cards.length === 2 && !h.doubled && !splitAceLocked && (!h.fromSplit || r.doubleAfterSplit)) {
    const ok = r.doubleOn === 'any' || (r.doubleOn === '9-11' ? v.total >= 9 && v.total <= 11 : v.total >= 10 && v.total <= 11);
    if (ok) out.push('double');
  }
  if (h.cards.length === 2 && cardPoints(h.cards[0]) === cardPoints(h.cards[1]) && s.hands.length < r.maxHands) {
    const aces = cardPoints(h.cards[0]) === 1;
    if (!aces || !h.fromSplit || r.resplitAces) out.push('split');
  }
  if (r.surrender === 'late' && h.cards.length === 2 && !h.fromSplit && s.hands.length === 1) out.push('surrender');
  return out;
}

/** Extra stake an action requires (double or split). The caller must escrow it before calling act(). */
export function extraStakeFor(state: BlackjackState, seat: number, action: BJAction): Money {
  if (action !== 'double' && action !== 'split') return 0;
  const s = state.seats[seat];
  const h = s?.hands[s.active];
  return h ? h.bet : 0;
}

export function act(state: BlackjackState, seat: number, action: BJAction): BJEvent[] {
  const legal = legalActions(state, seat);
  if (!legal.includes(action)) throw new BlackjackError(`illegal action ${action}`);
  const s = state.seats[seat];
  const handIdx = s.active;
  const h = s.hands[handIdx];
  const ev: BJEvent[] = [];
  switch (action) {
    case 'hit': {
      dealTo(state, seat, handIdx, ev);
      const v = handValue(h.cards).total;
      if (v > 21) {
        h.done = true;
        ev.push({ k: 'bust', seat, hand: handIdx, total: v });
      } else if (v === 21) {
        h.done = true;
      }
      break;
    }
    case 'stand':
      h.done = true;
      break;
    case 'double': {
      const extra = h.bet;
      h.bet += extra;
      h.doubled = true;
      ev.push({ k: 'double', seat, hand: handIdx, extra });
      dealTo(state, seat, handIdx, ev);
      const v = handValue(h.cards).total;
      if (v > 21) ev.push({ k: 'bust', seat, hand: handIdx, total: v });
      h.done = true;
      break;
    }
    case 'split': {
      const aces = cardPoints(h.cards[0]) === 1;
      const moved = h.cards.pop() as Card;
      const nh: BJHand = { ...newHand(h.bet), cards: [moved], fromSplit: true, splitAces: aces };
      h.fromSplit = true;
      h.splitAces = aces;
      s.hands.splice(handIdx + 1, 0, nh);
      ev.push({ k: 'split', seat, hand: handIdx, newHand: handIdx + 1, extra: nh.bet });
      // The current hand receives its second card immediately.
      dealTo(state, seat, handIdx, ev);
      const v = handValue(h.cards).total;
      if (aces && !state.rules.hitSplitAces) {
        const canResplit = state.rules.resplitAces && cardPoints(h.cards[1]) === 1 && s.hands.length < state.rules.maxHands;
        if (!canResplit) h.done = true;
      }
      if (v === 21) h.done = true;
      break;
    }
    case 'surrender':
      h.surrendered = true;
      h.done = true;
      ev.push({ k: 'surrender', seat, hand: handIdx });
      break;
  }
  if (h.done) {
    s.active = handIdx + 1;
    advance(state, ev);
  }
  return ev;
}

function playDealer(state: BlackjackState, ev: BJEvent[]): void {
  ev.push({ k: 'dealerTurn' });
  state.dealer.holeHidden = false;
  ev.push({ k: 'reveal', card: state.dealer.cards[1] });
  const live = state.seats.some((s) => s.hands.some((h) => !h.surrendered && handValue(h.cards).total <= 21 && !isNatural(h)));
  if (live) {
    for (;;) {
      const v = handValue(state.dealer.cards);
      const hits = v.total < 17 || (v.total === 17 && v.soft && state.rules.dealerHitsSoft17);
      if (!hits) break;
      const c = draw(state);
      state.dealer.cards.push(c);
      ev.push({ k: 'dealerDeal', card: c, hidden: false });
    }
  }
  const dv = handValue(state.dealer.cards).total;
  if (dv > 21) ev.push({ k: 'dealerBust', total: dv });
  else ev.push({ k: 'dealerStands', total: dv });
  settle(state, ev);
}

function settle(state: BlackjackState, ev: BJEvent[]): void {
  const dealerNatural = dealerHasNatural(state);
  const dv = handValue(state.dealer.cards).total;
  const [bjNum, bjDen] = state.rules.blackjackPays;
  state.seats.forEach((s, si) => {
    s.hands.forEach((h, hi) => {
      const pv = handValue(h.cards).total;
      let result: HandResult;
      let payout: Money;
      if (h.surrendered) {
        result = 'surrender';
        payout = Math.floor(h.bet / 2);
      } else if (pv > 21) {
        result = 'bust';
        payout = 0;
      } else if (isNatural(h)) {
        if (dealerNatural) {
          result = 'push';
          payout = h.bet;
        } else {
          result = 'blackjack';
          payout = h.bet + mulRatio(h.bet, bjNum, bjDen);
        }
      } else if (dealerNatural) {
        result = 'lose';
        payout = 0;
      } else if (dv > 21 || pv > dv) {
        result = 'win';
        payout = h.bet * 2;
      } else if (pv === dv) {
        result = 'push';
        payout = h.bet;
      } else {
        result = 'lose';
        payout = 0;
      }
      h.result = result;
      h.payout = payout;
      h.done = true;
      ev.push({ k: 'settle', seat: si, hand: hi, result, bet: h.bet, payout });
    });
    if (s.insurance > 0 && s.insurancePayout === undefined) {
      s.insurancePayout = dealerNatural ? s.insurance * 3 : 0;
      ev.push({ k: 'insuranceSettle', seat: si, stake: s.insurance, payout: s.insurancePayout });
    }
  });
  state.phase = 'settled';
  state.turnSeat = -1;
  ev.push({ k: 'roundOver' });
}

/** Clears the felt after a settled round. Marks the shoe for shuffling if the cut card came out. */
export function finishRound(state: BlackjackState): void {
  if (state.phase !== 'settled') return;
  for (const s of state.seats) {
    for (const h of s.hands) state.discards += h.cards.length;
    s.hands = [];
    s.active = 0;
    s.insurance = 0;
    s.insuranceDecided = false;
    s.insurancePayout = undefined;
  }
  state.discards += state.dealer.cards.length;
  state.dealer = { cards: [], holeHidden: true };
  state.phase = 'betting';
  state.turnSeat = -1;
  if (cutCardReached(state.shoe)) state.needsShuffle = true;
}

/** Sum of stakes currently at risk on a seat (main + doubles/splits + insurance). */
export function seatStake(state: BlackjackState, seat: number): Money {
  const s = state.seats[seat];
  if (!s) return 0;
  return s.hands.reduce((a, h) => a + h.bet, 0) + s.insurance;
}

/** Sum of all amounts returned to a seat this round (only meaningful once settled). */
export function seatReturn(state: BlackjackState, seat: number): Money {
  const s = state.seats[seat];
  if (!s) return 0;
  return s.hands.reduce((a, h) => a + (h.payout ?? 0), 0) + (s.insurancePayout ?? 0);
}

/** Published house edge estimates for common rule sets (informational placards). */
export function approxHouseEdge(rules: BlackjackRules): number {
  // Baseline: 6 decks, S17, DAS, no surrender, 3:2 ≈ 0.40% (with perfect basic strategy).
  let edge = 0.4;
  edge += (rules.decks - 6) * 0.02;
  if (rules.dealerHitsSoft17) edge += 0.22;
  if (!rules.doubleAfterSplit) edge += 0.14;
  if (rules.doubleOn === '10-11') edge += 0.18;
  if (rules.doubleOn === '9-11') edge += 0.09;
  if (rules.surrender === 'late') edge -= 0.07;
  if (rules.blackjackPays[0] === 6 && rules.blackjackPays[1] === 5) edge += 1.39;
  if (rules.resplitAces) edge -= 0.08;
  if (rules.maxHands < 4) edge += 0.02;
  return Math.round(edge * 100) / 100;
}
