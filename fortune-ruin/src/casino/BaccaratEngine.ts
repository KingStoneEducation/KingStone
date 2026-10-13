import { mulRatio, type Money } from '../core/money';
import { cardRank, createShoe, cutCardReached, drawCard, shuffleShoe, type Card, type ShoeState } from './cards';

/**
 * Punto Banco baccarat with the standard (fixed) third-card tableau.
 * Banker wins pay 1:1 less commission, Tie pays 8:1 and pushes Player/Banker
 * bets. Pair side bets pay 11:1 on the first two cards.
 */

export interface BaccaratRules {
  decks: number;
  /** Commission on winning banker bets in basis points (500 = 5%). */
  commissionBp: number;
  tiePays: number;
  pairPays: number;
  pairs: boolean;
  minBet: Money;
  maxBet: Money;
  tieMax: Money;
  penetration: number;
}

export const DEFAULT_BAC_RULES: BaccaratRules = {
  decks: 8,
  commissionBp: 500,
  tiePays: 8,
  pairPays: 11,
  pairs: true,
  minBet: 2500,
  maxBet: 300000,
  tieMax: 50000,
  penetration: 0.9,
};

export type BacSide = 'player' | 'banker' | 'tie' | 'playerPair' | 'bankerPair';
export type BacWinner = 'player' | 'banker' | 'tie';

export interface BacBet {
  owner: string;
  side: BacSide;
  amount: Money;
}

export interface BacResult {
  player: Card[];
  banker: Card[];
  playerTotal: number;
  bankerTotal: number;
  winner: BacWinner;
  natural: boolean;
  playerPair: boolean;
  bankerPair: boolean;
}

export interface BacSettlement extends BacBet {
  payout: Money;
  outcome: 'win' | 'lose' | 'push';
}

export interface BacHistoryEntry {
  w: 'P' | 'B' | 'T';
  pt: number;
  bt: number;
  nat: boolean;
  pp: boolean;
  bp: boolean;
}

export interface BaccaratState {
  id: string;
  rules: BaccaratRules;
  shoe: ShoeState;
  phase: 'betting' | 'settled';
  bets: BacBet[];
  last: BacResult | null;
  settlements: BacSettlement[];
  history: BacHistoryEntry[];
  round: number;
  needsShuffle: boolean;
  discards: number;
}

export type BacEvent =
  | { k: 'shuffle' }
  | { k: 'burn'; reveal: Card; count: number }
  | { k: 'deal'; to: 'player' | 'banker'; card: Card; index: number }
  | { k: 'natural'; side: 'player' | 'banker' | 'both' }
  | { k: 'draw'; to: 'player' | 'banker'; reason: string }
  | { k: 'result'; result: BacResult }
  | { k: 'settle'; settlement: BacSettlement };

export class BaccaratError extends Error {}

export function bacValue(c: Card): number {
  const r = cardRank(c);
  return r >= 10 ? 0 : r;
}

export function bacTotal(cards: readonly Card[]): number {
  let t = 0;
  for (const c of cards) t += bacValue(c);
  return t % 10;
}

/** Banker's third-card rule given the banker total and the player's third card (null when the player stood). */
export function bankerDraws(bankerTotal: number, playerThird: Card | null): boolean {
  if (playerThird === null) return bankerTotal <= 5;
  const p = bacValue(playerThird);
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return p !== 8;
    case 4:
      return p >= 2 && p <= 7;
    case 5:
      return p >= 4 && p <= 7;
    case 6:
      return p === 6 || p === 7;
    default:
      return false;
  }
}

export function createBaccaratTable(id: string, rules: Partial<BaccaratRules>, seed: number | string): BaccaratState {
  const full = { ...DEFAULT_BAC_RULES, ...rules };
  if (full.minBet % 100 !== 0 || full.maxBet % 100 !== 0) throw new BaccaratError('limits must be whole G');
  const state: BaccaratState = {
    id,
    rules: full,
    shoe: createShoe(full.decks, full.penetration, seed),
    phase: 'betting',
    bets: [],
    last: null,
    settlements: [],
    history: [],
    round: 0,
    needsShuffle: false,
    discards: 0,
  };
  burn(state, []);
  return state;
}

function burn(state: BaccaratState, ev: BacEvent[]): void {
  const reveal = drawCard(state.shoe);
  const r = cardRank(reveal);
  const count = r >= 10 ? 10 : r;
  for (let i = 0; i < count; i++) drawCard(state.shoe);
  state.discards += count + 1;
  ev.push({ k: 'burn', reveal, count });
}

export function validateBacBet(state: BaccaratState, owner: string, side: BacSide, amount: Money): string | null {
  const r = state.rules;
  if (!Number.isSafeInteger(amount) || amount <= 0) return '下注金额无效';
  if (amount % 100 !== 0) return '下注必须为整数 G';
  if ((side === 'playerPair' || side === 'bankerPair') && !r.pairs) return '本桌不设对子投注';
  const existing = state.bets.filter((b) => b.owner === owner && b.side === side).reduce((a, b) => a + b.amount, 0);
  const total = existing + amount;
  const isMain = side === 'player' || side === 'banker';
  const minForSide = isMain ? r.minBet : Math.max(100, Math.floor(r.minBet / 5 / 100) * 100);
  if (total < minForSide) return `该区域最低下注不足`;
  const max = isMain ? r.maxBet : r.tieMax;
  if (total > max) return '超过该区域最高下注';
  if (isMain) {
    const other = side === 'player' ? 'banker' : 'player';
    if (state.bets.some((b) => b.owner === owner && b.side === other)) return '不能同时押庄和闲';
  }
  return null;
}

/** Adds chips to a betting area. The caller escrows the amount first. */
export function placeBacBet(state: BaccaratState, owner: string, side: BacSide, amount: Money): void {
  if (state.phase === 'settled') finishBacRound(state);
  const err = validateBacBet(state, owner, side, amount);
  if (err) throw new BaccaratError(err);
  const existing = state.bets.find((b) => b.owner === owner && b.side === side);
  if (existing) existing.amount += amount;
  else state.bets.push({ owner, side, amount });
}

/** Removes all bets of an owner before the deal; returns the refunded total. */
export function clearBacBets(state: BaccaratState, owner: string): Money {
  if (state.phase === 'settled') finishBacRound(state);
  let refund = 0;
  state.bets = state.bets.filter((b) => {
    if (b.owner !== owner) return true;
    refund += b.amount;
    return false;
  });
  return refund;
}

export function finishBacRound(state: BaccaratState): void {
  if (state.phase !== 'settled') return;
  if (state.last) state.discards += state.last.player.length + state.last.banker.length;
  state.bets = [];
  state.settlements = [];
  state.phase = 'betting';
  if (cutCardReached(state.shoe)) state.needsShuffle = true;
}

/** Deals one coup and settles every bet on the layout. */
export function dealCoup(state: BaccaratState): BacEvent[] {
  if (state.phase !== 'betting') throw new BaccaratError('not accepting a deal now');
  const ev: BacEvent[] = [];
  if (state.needsShuffle) {
    shuffleShoe(state.shoe);
    state.needsShuffle = false;
    state.discards = 0;
    state.history = [];
    ev.push({ k: 'shuffle' });
    burn(state, ev);
  }
  state.round += 1;
  const player: Card[] = [];
  const banker: Card[] = [];
  const inPlay = () => [...player, ...banker];
  const deal = (to: 'player' | 'banker') => {
    const c = drawCard(state.shoe, inPlay());
    const arr = to === 'player' ? player : banker;
    arr.push(c);
    ev.push({ k: 'deal', to, card: c, index: arr.length - 1 });
    return c;
  };
  deal('player');
  deal('banker');
  deal('player');
  deal('banker');
  let pt = bacTotal(player);
  let bt = bacTotal(banker);
  const natural = pt >= 8 || bt >= 8;
  if (natural) {
    ev.push({ k: 'natural', side: pt >= 8 && bt >= 8 ? 'both' : pt >= 8 ? 'player' : 'banker' });
  } else {
    let playerThird: Card | null = null;
    if (pt <= 5) {
      ev.push({ k: 'draw', to: 'player', reason: `闲家 ${pt} 点，补牌` });
      playerThird = deal('player');
      pt = bacTotal(player);
    }
    if (bankerDraws(bt, playerThird)) {
      ev.push({ k: 'draw', to: 'banker', reason: `庄家 ${bt} 点，按规则补牌` });
      deal('banker');
      bt = bacTotal(banker);
    }
  }
  const winner: BacWinner = pt > bt ? 'player' : bt > pt ? 'banker' : 'tie';
  const result: BacResult = {
    player,
    banker,
    playerTotal: pt,
    bankerTotal: bt,
    winner,
    natural,
    playerPair: cardRank(player[0]) === cardRank(player[1]),
    bankerPair: cardRank(banker[0]) === cardRank(banker[1]),
  };
  state.last = result;
  ev.push({ k: 'result', result });
  state.settlements = state.bets.map((b) => {
    const s = settleBacBet(b, result, state.rules);
    ev.push({ k: 'settle', settlement: s });
    return s;
  });
  state.history.push({
    w: winner === 'player' ? 'P' : winner === 'banker' ? 'B' : 'T',
    pt,
    bt,
    nat: natural,
    pp: result.playerPair,
    bp: result.bankerPair,
  });
  if (state.history.length > 160) state.history.splice(0, state.history.length - 160);
  state.phase = 'settled';
  return ev;
}

export function settleBacBet(b: BacBet, r: BacResult, rules: BaccaratRules): BacSettlement {
  let payout = 0;
  let outcome: BacSettlement['outcome'] = 'lose';
  switch (b.side) {
    case 'player':
      if (r.winner === 'player') {
        payout = b.amount * 2;
        outcome = 'win';
      } else if (r.winner === 'tie') {
        payout = b.amount;
        outcome = 'push';
      }
      break;
    case 'banker':
      if (r.winner === 'banker') {
        payout = b.amount + mulRatio(b.amount, 10000 - rules.commissionBp, 10000);
        outcome = 'win';
      } else if (r.winner === 'tie') {
        payout = b.amount;
        outcome = 'push';
      }
      break;
    case 'tie':
      if (r.winner === 'tie') {
        payout = b.amount * (rules.tiePays + 1);
        outcome = 'win';
      }
      break;
    case 'playerPair':
      if (r.playerPair) {
        payout = b.amount * (rules.pairPays + 1);
        outcome = 'win';
      }
      break;
    case 'bankerPair':
      if (r.bankerPair) {
        payout = b.amount * (rules.pairPays + 1);
        outcome = 'win';
      }
      break;
  }
  return { ...b, payout, outcome };
}

export function ownerStake(state: BaccaratState, owner: string): Money {
  return state.bets.filter((b) => b.owner === owner).reduce((a, b) => a + b.amount, 0);
}

export function ownerReturn(state: BaccaratState, owner: string): Money {
  return state.settlements.filter((s) => s.owner === owner).reduce((a, s) => a + s.payout, 0);
}

/** Published house edge figures for an 8-deck shoe with 5% commission and 8:1 ties. */
export const BACCARAT_EDGES = { banker: 1.06, player: 1.24, tie: 14.36, pair: 10.36 };
