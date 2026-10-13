import { formatG, type Money } from '../core/money';
import { Rng, type RngState } from '../core/rng';
import { cardRank, cardSuit, type Card } from './cards';

/**
 * No-limit Texas Hold'em cash game. Pure and serializable: the casino deals,
 * players act in turn, side pots are built from what each player committed,
 * and the house takes a published rake from pots that saw a flop.
 */

// ---------------------------------------------------------------- hand evaluation

export const HAND_NAMES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];

/** Poker rank 2..14 (ace high). */
export function pokerRank(c: Card): number {
  const r = cardRank(c);
  return r === 1 ? 14 : r;
}

const B = 16;
function encode(cat: number, ranks: number[]): number {
  let v = cat;
  for (let i = 0; i < 5; i++) v = v * B + (ranks[i] ?? 0);
  return v;
}

export function handCategory(score: number): number {
  return Math.floor(score / B ** 5);
}

/** High card of the best straight in a set of ranks (5 for the wheel), or 0. */
function straightHigh(has: boolean[]): number {
  for (let hi = 14; hi >= 5; hi--) {
    let ok = true;
    for (let k = 0; k < 5; k++) {
      const r = hi - k;
      if (!has[r === 1 ? 14 : r]) {
        ok = false;
        break;
      }
    }
    if (ok) return hi;
  }
  return 0;
}

/** Best five-card score among 5–7 cards. Higher is better; equal scores tie. */
export function evaluate(cards: readonly Card[]): number {
  const rc = new Array(15).fill(0);
  const suitCount = [0, 0, 0, 0];
  for (const c of cards) {
    rc[pokerRank(c)]++;
    suitCount[cardSuit(c)]++;
  }
  // flush / straight flush
  const fs = suitCount.findIndex((n) => n >= 5);
  if (fs >= 0) {
    const has = new Array(15).fill(false);
    const fr: number[] = [];
    for (const c of cards) {
      if (cardSuit(c) !== fs) continue;
      has[pokerRank(c)] = true;
      fr.push(pokerRank(c));
    }
    const sf = straightHigh(has);
    if (sf) return encode(8, [sf]);
    fr.sort((a, b) => b - a);
    // a flush beats everything below; quads / full house are impossible with 5+ cards of one suit in 7? (not always) – check them first
    const flush = encode(5, fr.slice(0, 5));
    const better = quadsOrBoat(rc);
    return better !== null && better > flush ? better : flush;
  }
  const qb = quadsOrBoat(rc);
  if (qb !== null) return qb;
  const has = rc.map((n) => n > 0);
  const st = straightHigh(has);
  if (st) return encode(4, [st]);
  const trips: number[] = [];
  const pairs: number[] = [];
  const singles: number[] = [];
  for (let r = 14; r >= 2; r--) {
    if (rc[r] === 3) trips.push(r);
    else if (rc[r] === 2) pairs.push(r);
    else if (rc[r] === 1) singles.push(r);
  }
  if (trips.length) {
    const kick = [...trips.slice(1), ...pairs, ...singles].sort((a, b) => b - a).slice(0, 2);
    return encode(3, [trips[0], ...kick]);
  }
  if (pairs.length >= 2) {
    const kick = [...pairs.slice(2), ...singles].sort((a, b) => b - a)[0] ?? 0;
    return encode(2, [pairs[0], pairs[1], kick]);
  }
  if (pairs.length === 1) return encode(1, [pairs[0], ...singles.slice(0, 3)]);
  return encode(0, singles.slice(0, 5));
}

function quadsOrBoat(rc: number[]): number | null {
  let quad = 0;
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 14; r >= 2; r--) {
    if (rc[r] === 4) quad = r;
    else if (rc[r] === 3) trips.push(r);
    else if (rc[r] === 2) pairs.push(r);
  }
  if (quad) {
    let kick = 0;
    for (let r = 14; r >= 2; r--) if (r !== quad && rc[r] > 0) {
      kick = r;
      break;
    }
    return encode(7, [quad, kick]);
  }
  if (trips.length && (trips.length >= 2 || pairs.length)) {
    const pair = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return encode(6, [trips[0], pair]);
  }
  return null;
}

const RANK_NAMES = ['', '', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/** Plain-language description of a hand score, e.g. "两对 Q/4" or "顺子（9 高）". */
export function describeScore(score: number): string {
  const r: number[] = [];
  let v = score;
  for (let i = 0; i < 5; i++) {
    r.unshift(v % B);
    v = Math.floor(v / B);
  }
  const n = (x: number) => RANK_NAMES[x] ?? '';
  switch (handCategory(score)) {
    case 0:
      return `高牌 ${n(r[0])}`;
    case 1:
      return `一对 ${n(r[0])}`;
    case 2:
      return `两对 ${n(r[0])}/${n(r[1])}`;
    case 3:
      return `三条 ${n(r[0])}`;
    case 4:
      return `顺子（${n(r[0])} 高）`;
    case 5:
      return `同花（${n(r[0])} 高）`;
    case 6:
      return `葫芦（${n(r[0])} 带 ${n(r[1])}）`;
    case 7:
      return `四条 ${n(r[0])}`;
    default:
      return r[0] === 14 ? '皇家同花顺' : `同花顺（${n(r[0])} 高）`;
  }
}

/** Category name, a detailed description and the five cards that make the best hand. */
export function describeBest(cards: readonly Card[]): { score: number; name: string; detail: string; best: Card[] } {
  const score = evaluate(cards);
  let best: Card[] = cards.slice(0, 5);
  if (cards.length > 5) {
    const n = cards.length;
    outer: for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        for (let c = b + 1; c < n; c++)
          for (let d = c + 1; d < n; d++)
            for (let e = d + 1; e < n; e++) {
              const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
              if (evaluate(five) === score) {
                best = five;
                break outer;
              }
            }
  }
  return { score, name: HAND_NAMES[handCategory(score)], detail: describeScore(score), best };
}

// ---------------------------------------------------------------- table state

export interface PokerRules {
  seats: number;
  smallBlind: Money;
  bigBlind: Money;
  minBuyIn: Money;
  maxBuyIn: Money;
  /** rake in basis points of each pot that saw a flop */
  rakeBp: number;
  rakeCap: Money;
}

export const DEFAULT_POKER_RULES: PokerRules = {
  seats: 6,
  smallBlind: 100,
  bigBlind: 200,
  minBuyIn: 4000,
  maxBuyIn: 20000,
  rakeBp: 500,
  rakeCap: 1000,
};

export interface PokerSeat {
  occupant: string | null;
  stack: Money;
  hole: Card[];
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  /** chips put in on the current street */
  bet: Money;
  /** chips put in during the whole hand */
  committed: Money;
  acted: boolean;
  canRaise: boolean;
  startStack: Money;
  /** skip the next deal (about to leave) */
  sitOut: boolean;
  lastAction: string | null;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type PokerPhase = 'waiting' | Street | 'settled';

export interface PotResult {
  amount: Money;
  eligible: number[];
  winners: number[];
}

export interface PokerResult {
  pots: PotResult[];
  rake: Money;
  showdown: { seat: number; cards: Card[]; score: number; name: string; best: Card[] }[];
  payouts: number[];
  uncontested: boolean;
}

export interface PokerState {
  id: string;
  rules: PokerRules;
  seats: PokerSeat[];
  button: number;
  phase: PokerPhase;
  board: Card[];
  deck: Card[];
  rng: RngState;
  toAct: number;
  currentBet: Money;
  minRaise: Money;
  hand: number;
  sb: number;
  bb: number;
  result: PokerResult | null;
  history: { hand: number; board: Card[]; pot: Money; winners: { seat: number; who: string | null; amount: Money; name: string }[] }[];
}

export type PokerEvent =
  | { k: 'handStart'; hand: number; button: number }
  | { k: 'blind'; seat: number; amount: Money; kind: 'sb' | 'bb' }
  | { k: 'hole'; seat: number; cards: Card[] }
  | { k: 'turn'; seat: number }
  | { k: 'action'; seat: number; action: PokerActionType; to: Money; add: Money }
  | { k: 'street'; street: Street; cards: Card[] }
  | { k: 'uncalled'; seat: number; amount: Money }
  | { k: 'showdown'; hands: { seat: number; cards: Card[]; name: string }[] }
  | { k: 'rake'; amount: Money }
  | { k: 'win'; seat: number; amount: Money; pot: number; hand: string | null }
  | { k: 'handOver' };

export type PokerActionType = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface PokerAction {
  type: PokerActionType;
  /** total bet for this street when raising ("raise to") */
  to?: Money;
}

export class PokerError extends Error {}

function emptySeat(): PokerSeat {
  return { occupant: null, stack: 0, hole: [], inHand: false, folded: false, allIn: false, bet: 0, committed: 0, acted: false, canRaise: true, startStack: 0, sitOut: false, lastAction: null };
}

export function createPokerTable(id: string, rules: Partial<PokerRules>, seed: number | string): PokerState {
  const r = { ...DEFAULT_POKER_RULES, ...rules };
  return {
    id,
    rules: r,
    seats: Array.from({ length: r.seats }, emptySeat),
    button: 0,
    phase: 'waiting',
    board: [],
    deck: [],
    rng: new Rng(seed).getState(),
    toAct: -1,
    currentBet: 0,
    minRaise: r.bigBlind,
    hand: 0,
    sb: -1,
    bb: -1,
    result: null,
    history: [],
  };
}

export function seatOfPoker(s: PokerState, occupant: string): number {
  return s.seats.findIndex((x) => x.occupant === occupant);
}

export function handInProgress(s: PokerState): boolean {
  return s.phase !== 'waiting' && s.phase !== 'settled';
}

export function sitPoker(s: PokerState, seat: number, occupant: string, buyIn: Money): void {
  const st = s.seats[seat];
  if (!st || st.occupant) throw new PokerError('座位不可用');
  if (buyIn < s.rules.minBuyIn || buyIn > s.rules.maxBuyIn) throw new PokerError('买入金额不在本桌范围内');
  s.seats[seat] = { ...emptySeat(), occupant, stack: buyIn };
}

/** Leave the table; returns the stack. Not allowed while still in a live hand. */
export function leavePoker(s: PokerState, seat: number): Money {
  const st = s.seats[seat];
  if (!st?.occupant) return 0;
  if (handInProgress(s) && st.inHand && !st.folded) throw new PokerError('请先打完这一手');
  const stack = st.stack;
  s.seats[seat] = emptySeat();
  return stack;
}

export function topUp(s: PokerState, seat: number, amount: Money): void {
  const st = s.seats[seat];
  if (!st?.occupant) throw new PokerError('没有入座');
  if (handInProgress(s) && st.inHand) throw new PokerError('这一手结束后才能补码');
  if (amount <= 0 || st.stack + amount > s.rules.maxBuyIn) throw new PokerError('超过最高买入');
  st.stack += amount;
}

function dealable(st: PokerSeat): boolean {
  return !!st.occupant && !st.sitOut && st.stack > 0;
}

export function canStartHand(s: PokerState): boolean {
  return !handInProgress(s) && s.seats.filter(dealable).length >= 2;
}

function nextSeat(s: PokerState, from: number, pred: (st: PokerSeat, i: number) => boolean): number {
  const n = s.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(s.seats[i], i)) return i;
  }
  return -1;
}

function pay(st: PokerSeat, amount: Money): Money {
  const a = Math.min(amount, st.stack);
  st.stack -= a;
  st.bet += a;
  st.committed += a;
  if (st.stack === 0) st.allIn = true;
  return a;
}

export function startHand(s: PokerState): PokerEvent[] {
  if (!canStartHand(s)) throw new PokerError('至少需要两名玩家');
  const ev: PokerEvent[] = [];
  s.hand += 1;
  s.result = null;
  s.board = [];
  const rng = new Rng(s.rng);
  const deck = Array.from({ length: 52 }, (_, i) => i);
  rng.shuffle(deck);
  s.rng = rng.getState();
  s.deck = deck;
  for (const st of s.seats) {
    const inHand = dealable(st);
    Object.assign(st, { hole: [], inHand, folded: false, allIn: false, bet: 0, committed: 0, acted: false, canRaise: true, startStack: st.stack, lastAction: null });
  }
  s.button = nextSeat(s, s.button, (st) => st.inHand);
  ev.push({ k: 'handStart', hand: s.hand, button: s.button });
  const players = s.seats.filter((x) => x.inHand).length;
  const sb = players === 2 ? s.button : nextSeat(s, s.button, (st) => st.inHand);
  const bb = nextSeat(s, sb, (st) => st.inHand);
  s.sb = sb;
  s.bb = bb;
  ev.push({ k: 'blind', seat: sb, amount: pay(s.seats[sb], s.rules.smallBlind), kind: 'sb' });
  ev.push({ k: 'blind', seat: bb, amount: pay(s.seats[bb], s.rules.bigBlind), kind: 'bb' });
  s.currentBet = s.rules.bigBlind;
  s.minRaise = s.rules.bigBlind;
  // two rounds of hole cards starting left of the button
  for (let round = 0; round < 2; round++) {
    let i = s.button;
    for (let k = 0; k < players; k++) {
      i = nextSeat(s, i, (st) => st.inHand);
      s.seats[i].hole.push(s.deck.shift()!);
    }
  }
  for (let i = 0; i < s.seats.length; i++) if (s.seats[i].inHand) ev.push({ k: 'hole', seat: i, cards: [...s.seats[i].hole] });
  s.phase = 'preflop';
  // first to act: left of the big blind (heads-up: the button/small blind)
  s.toAct = nextSeat(s, bb, (st) => st.inHand && !st.folded && !st.allIn);
  advance(s, ev, true);
  return ev;
}

export interface PokerLegal {
  fold: boolean;
  check: boolean;
  /** chips needed to call (0 when checking is possible) */
  call: Money;
  canRaise: boolean;
  minRaiseTo: Money;
  maxRaiseTo: Money;
}

export function legalPokerActions(s: PokerState, seat: number): PokerLegal | null {
  if (!handInProgress(s) || s.toAct !== seat) return null;
  const st = s.seats[seat];
  const toCall = Math.max(0, s.currentBet - st.bet);
  const maxTo = st.bet + st.stack;
  const minTo = s.currentBet === 0 ? Math.min(maxTo, s.rules.bigBlind) : Math.min(maxTo, s.currentBet + s.minRaise);
  return {
    fold: true,
    check: toCall === 0,
    call: Math.min(toCall, st.stack),
    canRaise: st.canRaise && maxTo > s.currentBet,
    minRaiseTo: minTo,
    maxRaiseTo: maxTo,
  };
}

export function actPoker(s: PokerState, seat: number, action: PokerAction): PokerEvent[] {
  const legal = legalPokerActions(s, seat);
  if (!legal) throw new PokerError('现在不是这个座位行动');
  const st = s.seats[seat];
  const ev: PokerEvent[] = [];
  let type = action.type;
  let to = action.to ?? 0;
  if (type === 'allin') {
    to = st.bet + st.stack;
    // without the right to raise, "all in" can only mean calling
    type = to > s.currentBet && legal.canRaise ? 'raise' : 'call';
    if (type === 'call' && legal.check) type = 'check';
  }
  switch (type) {
    case 'fold':
      st.folded = true;
      st.lastAction = '弃牌';
      ev.push({ k: 'action', seat, action: 'fold', to: st.bet, add: 0 });
      break;
    case 'check':
      if (!legal.check) throw new PokerError('前面有下注，不能过牌');
      st.lastAction = '过牌';
      ev.push({ k: 'action', seat, action: 'check', to: st.bet, add: 0 });
      break;
    case 'call': {
      if (legal.check) throw new PokerError('没有需要跟的注');
      const add = pay(st, s.currentBet - st.bet);
      st.lastAction = st.allIn ? '全下跟注' : '跟注';
      ev.push({ k: 'action', seat, action: st.allIn ? 'allin' : 'call', to: st.bet, add });
      break;
    }
    case 'raise': {
      if (!legal.canRaise) throw new PokerError('现在不能再加注');
      const maxTo = st.bet + st.stack;
      if (to > maxTo) throw new PokerError('筹码不够');
      const allIn = to === maxTo;
      if (to <= s.currentBet) throw new PokerError('加注额必须高于当前下注');
      if (!allIn && to < s.currentBet + s.minRaise && !(s.currentBet === 0 && to >= s.rules.bigBlind)) throw new PokerError(`最少加注到 ${formatG(s.currentBet === 0 ? s.rules.bigBlind : s.currentBet + s.minRaise)}`);
      const raiseSize = to - s.currentBet;
      const full = s.currentBet === 0 ? to >= s.rules.bigBlind : raiseSize >= s.minRaise;
      const add = pay(st, to - st.bet);
      if (full) s.minRaise = Math.max(s.minRaise, raiseSize);
      s.currentBet = to;
      for (let i = 0; i < s.seats.length; i++) {
        if (i === seat) continue;
        const o = s.seats[i];
        if (!o.inHand || o.folded || o.allIn) continue;
        o.acted = false;
        if (full) o.canRaise = true;
      }
      st.lastAction = st.allIn ? '全下' : s.currentBet === to && raiseSize === to ? '下注' : '加注';
      ev.push({ k: 'action', seat, action: st.allIn ? 'allin' : 'raise', to, add });
      break;
    }
  }
  st.acted = true;
  st.canRaise = false;
  advance(s, ev, false);
  return ev;
}

function live(s: PokerState): number[] {
  return s.seats.map((st, i) => (st.inHand && !st.folded ? i : -1)).filter((i) => i >= 0);
}

/** Move the action along, closing streets and finishing the hand when possible. */
function advance(s: PokerState, ev: PokerEvent[], afterDeal: boolean): void {
  for (let guard = 0; guard < 20; guard++) {
    const alive = live(s);
    if (alive.length === 1) {
      returnUncalled(s, ev);
      finishUncontested(s, alive[0], ev);
      return;
    }
    const canAct = alive.filter((i) => !s.seats[i].allIn);
    const pending = canAct.filter((i) => !s.seats[i].acted || s.seats[i].bet < s.currentBet);
    if (pending.length > 0 && !(canAct.length === 1 && s.seats[canAct[0]].bet >= maxOtherBet(s, canAct[0]))) {
      if (afterDeal && pending.includes(s.toAct)) {
        ev.push({ k: 'turn', seat: s.toAct });
        return;
      }
      const from = afterDeal ? s.toAct - 1 : s.toAct;
      s.toAct = nextSeat(s, (from + s.seats.length) % s.seats.length, (st, i) => pending.includes(i));
      ev.push({ k: 'turn', seat: s.toAct });
      return;
    }
    // betting round closed
    returnUncalled(s, ev);
    const stillBetting = alive.filter((i) => !s.seats[i].allIn).length;
    if (s.phase === 'river' || stillBetting <= 1) {
      // run out the board and go to showdown
      while (s.board.length < 5) dealStreet(s, ev);
      showdown(s, ev);
      return;
    }
    dealStreet(s, ev);
    // every street bet is now in the pot – folded players' too (dead money must not look "uncalled" later)
    for (const st of s.seats) st.bet = 0;
    for (const i of alive) {
      const st = s.seats[i];
      st.acted = false;
      st.canRaise = true;
    }
    s.currentBet = 0;
    s.minRaise = s.rules.bigBlind;
    s.toAct = nextSeat(s, s.button, (st) => st.inHand && !st.folded && !st.allIn);
    afterDeal = true;
  }
}

function maxOtherBet(s: PokerState, seat: number): Money {
  let m = 0;
  s.seats.forEach((st, i) => {
    if (i !== seat && st.inHand) m = Math.max(m, st.bet);
  });
  return m;
}

/** A bet nobody could match goes back to its owner. */
function returnUncalled(s: PokerState, ev: PokerEvent[]): void {
  let top = -1;
  let topBet = 0;
  let second = 0;
  s.seats.forEach((st, i) => {
    if (!st.inHand) return;
    if (st.bet > topBet) {
      second = topBet;
      topBet = st.bet;
      top = i;
    } else if (st.bet > second) second = st.bet;
  });
  if (top >= 0 && topBet > second) {
    const back = topBet - second;
    const st = s.seats[top];
    st.bet -= back;
    st.committed -= back;
    st.stack += back;
    if (st.stack > 0) st.allIn = false;
    if (s.currentBet > st.bet) s.currentBet = st.bet;
    ev.push({ k: 'uncalled', seat: top, amount: back });
  }
}

function dealStreet(s: PokerState, ev: PokerEvent[]): void {
  s.deck.shift(); // burn
  if (s.board.length === 0) {
    const cards = [s.deck.shift()!, s.deck.shift()!, s.deck.shift()!];
    s.board.push(...cards);
    s.phase = 'flop';
    ev.push({ k: 'street', street: 'flop', cards });
  } else {
    const c = s.deck.shift()!;
    s.board.push(c);
    s.phase = s.board.length === 4 ? 'turn' : 'river';
    ev.push({ k: 'street', street: s.phase as Street, cards: [c] });
  }
}

/** Main and side pots from what each player committed. */
export function computePots(seats: readonly PokerSeat[]): { amount: Money; eligible: number[] }[] {
  const contenders = seats.map((st, i) => (st.inHand && !st.folded && st.committed > 0 ? i : -1)).filter((i) => i >= 0);
  const levels = [...new Set(contenders.map((i) => seats[i].committed))].sort((a, b) => a - b);
  const pots: { amount: Money; eligible: number[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const st of seats) amount += Math.max(0, Math.min(st.committed, level) - prev);
    const eligible = contenders.filter((i) => seats[i].committed >= level);
    const last = pots[pots.length - 1];
    if (last && last.eligible.length === eligible.length && last.eligible.every((v, k) => v === eligible[k])) last.amount += amount;
    else pots.push({ amount, eligible });
    prev = level;
  }
  // chips from folded players above the top live level (cannot normally happen after returning uncalled bets)
  let extra = 0;
  for (const st of seats) extra += Math.max(0, st.committed - prev);
  if (extra > 0 && pots.length) pots[pots.length - 1].amount += extra;
  return pots;
}

function takeRake(s: PokerState, total: Money): Money {
  if (s.board.length < 3) return 0; // no flop, no drop
  const raw = Math.floor((total * s.rules.rakeBp) / 10000);
  return Math.min(s.rules.rakeCap, Math.floor(raw / 100) * 100);
}

function finishUncontested(s: PokerState, winner: number, ev: PokerEvent[]): void {
  let total = 0;
  for (const st of s.seats) total += st.committed;
  const rake = takeRake(s, total);
  const win = total - rake;
  s.seats[winner].stack += win;
  const payouts = s.seats.map((_, i) => (i === winner ? win : 0));
  if (rake > 0) ev.push({ k: 'rake', amount: rake });
  ev.push({ k: 'win', seat: winner, amount: win, pot: 0, hand: null });
  s.result = { pots: [{ amount: total - rake, eligible: [winner], winners: [winner] }], rake, showdown: [], payouts, uncontested: true };
  endHand(s, ev, total);
}

function showdown(s: PokerState, ev: PokerEvent[]): void {
  const alive = live(s);
  const hands = alive.map((i) => {
    const d = describeBest([...s.seats[i].hole, ...s.board]);
    return { seat: i, cards: [...s.seats[i].hole], score: d.score, name: d.detail, best: d.best };
  });
  ev.push({ k: 'showdown', hands: hands.map((h) => ({ seat: h.seat, cards: h.cards, name: h.name })) });
  const pots = computePots(s.seats);
  let total = 0;
  for (const st of s.seats) total += st.committed;
  let rake = takeRake(s, total);
  if (rake > 0) ev.push({ k: 'rake', amount: rake });
  const payouts = s.seats.map(() => 0);
  const results: PotResult[] = [];
  pots.forEach((pot, pi) => {
    let amount = pot.amount;
    const cut = Math.min(rake, amount);
    amount -= cut;
    rake -= cut;
    let best = -1;
    for (const i of pot.eligible) best = Math.max(best, hands.find((h) => h.seat === i)!.score);
    // winners in seat order starting left of the button (odd chips go to them first)
    const order: number[] = [];
    for (let k = 1; k <= s.seats.length; k++) {
      const i = (s.button + k) % s.seats.length;
      if (pot.eligible.includes(i) && hands.find((h) => h.seat === i)!.score === best) order.push(i);
    }
    const share = Math.floor(amount / order.length);
    let rem = amount - share * order.length;
    for (const i of order) {
      const pay = share + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
      payouts[i] += pay;
      s.seats[i].stack += pay;
      ev.push({ k: 'win', seat: i, amount: pay, pot: pi, hand: hands.find((h) => h.seat === i)!.name });
    }
    results.push({ amount, eligible: pot.eligible, winners: order });
  });
  const totalRake = takeRake(s, total);
  s.result = { pots: results, rake: totalRake, showdown: hands, payouts, uncontested: false };
  endHand(s, ev, total);
}

function endHand(s: PokerState, ev: PokerEvent[], pot: Money): void {
  s.phase = 'settled';
  s.toAct = -1;
  for (const st of s.seats) {
    st.bet = 0;
    if (st.stack > 0) st.allIn = false;
  }
  const winners = (s.result?.payouts ?? [])
    .map((amount, seat) => ({ seat, who: s.seats[seat].occupant, amount, name: s.result?.showdown.find((h) => h.seat === seat)?.name ?? '' }))
    .filter((w) => w.amount > 0);
  s.history.push({ hand: s.hand, board: [...s.board], pot, winners });
  if (s.history.length > 40) s.history.shift();
  ev.push({ k: 'handOver' });
}

/** Clear the finished hand so the next one can be dealt. */
export function finishPokerHand(s: PokerState): void {
  if (s.phase !== 'settled') return;
  for (const st of s.seats) {
    st.hole = [];
    st.inHand = false;
    st.folded = false;
    st.committed = 0;
    st.lastAction = null;
  }
  s.board = [];
  s.phase = 'waiting';
}

/** Net result of the finished hand for a seat (stack change). */
export function handDelta(s: PokerState, seat: number): Money {
  const st = s.seats[seat];
  return st.stack - st.startStack;
}

// ---------------------------------------------------------------- public view (for AI)

export interface PokerView {
  seat: number;
  hole: Card[];
  board: Card[];
  street: PokerPhase;
  pot: Money;
  toCall: Money;
  currentBet: Money;
  minRaiseTo: Money;
  maxRaiseTo: Money;
  canRaise: boolean;
  stack: Money;
  bigBlind: Money;
  /** opponents still in the hand */
  opponents: number;
  /** seats to act after this one this street (positional disadvantage) */
  behind: number;
  /** raises seen this street */
  raisesThisStreet: number;
  isButton: boolean;
}

/** Everything a player at the table is allowed to know: own cards plus public information. */
export function pokerView(s: PokerState, seat: number, raisesThisStreet = 0): PokerView | null {
  const legal = legalPokerActions(s, seat);
  if (!legal) return null;
  const st = s.seats[seat];
  let pot = 0;
  for (const x of s.seats) pot += x.committed;
  const alive = live(s);
  // opponents who still have to act on this street
  const behind = alive.filter((i) => i !== seat && !s.seats[i].allIn && !s.seats[i].acted).length;
  return {
    seat,
    hole: [...st.hole],
    board: [...s.board],
    street: s.phase,
    pot,
    toCall: legal.call,
    currentBet: s.currentBet,
    minRaiseTo: legal.minRaiseTo,
    maxRaiseTo: legal.maxRaiseTo,
    canRaise: legal.canRaise,
    stack: st.stack,
    bigBlind: s.rules.bigBlind,
    opponents: alive.length - 1,
    behind,
    raisesThisStreet,
    isButton: seat === s.button,
  };
}
