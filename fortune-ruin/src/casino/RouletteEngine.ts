import type { Money } from '../core/money';
import { Rng, type RngState } from '../core/rng';

/**
 * European single-zero roulette. Each of the 37 pockets is equally likely;
 * the winning number is drawn first and the wheel animation is then computed
 * to land exactly on that pocket, so what you see is what is settled.
 */

/** Pocket order clockwise on a European wheel, starting at zero. */
export const EURO_WHEEL: readonly number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28,
  12, 35, 3, 26,
];

export const RED_NUMBERS: ReadonlySet<number> = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteColor = 'red' | 'black' | 'green';

export function numberColor(n: number): RouletteColor {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export type RouletteBetKind =
  | 'straight'
  | 'split'
  | 'street'
  | 'trio'
  | 'corner'
  | 'basket'
  | 'line'
  | 'dozen'
  | 'column'
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'low'
  | 'high';

/** Payout odds "to 1" for each bet kind. */
export const ROULETTE_PAYOUTS: Record<RouletteBetKind, number> = {
  straight: 35,
  split: 17,
  street: 11,
  trio: 11,
  corner: 8,
  basket: 8,
  line: 5,
  dozen: 2,
  column: 2,
  red: 1,
  black: 1,
  odd: 1,
  even: 1,
  low: 1,
  high: 1,
};

export const BET_KIND_NAMES: Record<RouletteBetKind, string> = {
  straight: '单号',
  split: '分注',
  street: '街注',
  trio: '三数',
  corner: '角注',
  basket: '前四',
  line: '线注',
  dozen: '打注',
  column: '列注',
  red: '红',
  black: '黑',
  odd: '单',
  even: '双',
  low: '小 1-18',
  high: '大 19-36',
};

export const OUTSIDE_KINDS: ReadonlySet<RouletteBetKind> = new Set(['dozen', 'column', 'red', 'black', 'odd', 'even', 'low', 'high']);

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function outsideNumbers(kind: RouletteBetKind, index = 0): number[] {
  switch (kind) {
    case 'dozen':
      return range(index * 12 + 1, index * 12 + 12);
    case 'column':
      return range(0, 11).map((k) => k * 3 + 1 + index);
    case 'red':
      return range(1, 36).filter((n) => RED_NUMBERS.has(n));
    case 'black':
      return range(1, 36).filter((n) => !RED_NUMBERS.has(n));
    case 'odd':
      return range(1, 36).filter((n) => n % 2 === 1);
    case 'even':
      return range(1, 36).filter((n) => n % 2 === 0);
    case 'low':
      return range(1, 18);
    case 'high':
      return range(19, 36);
    default:
      throw new Error(`not an outside bet: ${kind}`);
  }
}

const street = (n: number) => Math.ceil(n / 3);

/** Checks that `numbers` form a legal bet of `kind` on the standard layout. */
export function isValidBetShape(kind: RouletteBetKind, numbers: readonly number[]): boolean {
  const ns = [...numbers].sort((a, b) => a - b);
  if (ns.some((n) => !Number.isInteger(n) || n < 0 || n > 36)) return false;
  if (new Set(ns).size !== ns.length) return false;
  const eq = (a: number[]) => a.length === ns.length && a.every((v, i) => v === ns[i]);
  switch (kind) {
    case 'straight':
      return ns.length === 1;
    case 'split': {
      if (ns.length !== 2) return false;
      const [a, b] = ns;
      if (a === 0) return b >= 1 && b <= 3;
      if (b - a === 3) return true;
      return b - a === 1 && street(a) === street(b);
    }
    case 'street':
      return ns.length === 3 && ns[0] % 3 === 1 && ns[1] === ns[0] + 1 && ns[2] === ns[0] + 2;
    case 'trio':
      return eq([0, 1, 2]) || eq([0, 2, 3]);
    case 'corner': {
      if (ns.length !== 4 || ns[0] === 0) return false;
      const n = ns[0];
      return n % 3 !== 0 && eq([n, n + 1, n + 3, n + 4]);
    }
    case 'basket':
      return eq([0, 1, 2, 3]);
    case 'line': {
      if (ns.length !== 6 || ns[0] % 3 !== 1 || ns[0] > 31) return false;
      return eq(range(ns[0], ns[0] + 5));
    }
    case 'dozen':
      return [0, 1, 2].some((i) => eq(outsideNumbers('dozen', i)));
    case 'column':
      return [0, 1, 2].some((i) => eq(outsideNumbers('column', i)));
    default:
      return eq(outsideNumbers(kind));
  }
}

export interface RouletteRules {
  /** Minimum total wager per player per spin. */
  minTotal: Money;
  /** Maximum on a single inside position. */
  maxInside: Money;
  /** Maximum on a single outside position. */
  maxOutside: Money;
  /** La partage: even-money bets lose only half when zero hits. */
  laPartage: boolean;
}

export const DEFAULT_ROULETTE_RULES: RouletteRules = {
  minTotal: 500,
  maxInside: 20000,
  maxOutside: 200000,
  laPartage: false,
};

export interface RouletteBet {
  owner: string;
  kind: RouletteBetKind;
  numbers: number[];
  amount: Money;
}

export interface RouletteSettlement extends RouletteBet {
  payout: Money;
  won: boolean;
}

export interface RouletteState {
  id: string;
  rules: RouletteRules;
  rng: RngState;
  phase: 'betting' | 'settled';
  bets: RouletteBet[];
  result: number | null;
  settlements: RouletteSettlement[];
  history: number[];
  round: number;
}

export class RouletteError extends Error {}

export function createRouletteTable(id: string, rules: Partial<RouletteRules>, seed: number | string): RouletteState {
  return {
    id,
    rules: { ...DEFAULT_ROULETTE_RULES, ...rules },
    rng: new Rng(seed).getState(),
    phase: 'betting',
    bets: [],
    result: null,
    settlements: [],
    history: [],
    round: 0,
  };
}

function sameSpot(a: RouletteBet, kind: RouletteBetKind, numbers: readonly number[]): boolean {
  if (a.kind !== kind || a.numbers.length !== numbers.length) return false;
  const x = [...a.numbers].sort((p, q) => p - q);
  const y = [...numbers].sort((p, q) => p - q);
  return x.every((v, i) => v === y[i]);
}

export function validateRouletteBet(state: RouletteState, owner: string, kind: RouletteBetKind, numbers: readonly number[], amount: Money): string | null {
  if (!Number.isSafeInteger(amount) || amount <= 0) return '下注金额无效';
  if (amount % 100 !== 0) return '下注必须为整数 G';
  if (!isValidBetShape(kind, numbers)) return '无效的下注位置';
  const existing = state.bets.find((b) => b.owner === owner && sameSpot(b, kind, numbers));
  const total = (existing?.amount ?? 0) + amount;
  const max = OUTSIDE_KINDS.has(kind) ? state.rules.maxOutside : state.rules.maxInside;
  if (total > max) return '超过该位置最高下注';
  return null;
}

export function placeRouletteBet(state: RouletteState, owner: string, kind: RouletteBetKind, numbers: readonly number[], amount: Money): void {
  if (state.phase === 'settled') clearRouletteRound(state);
  const err = validateRouletteBet(state, owner, kind, numbers, amount);
  if (err) throw new RouletteError(err);
  const existing = state.bets.find((b) => b.owner === owner && sameSpot(b, kind, numbers));
  if (existing) existing.amount += amount;
  else state.bets.push({ owner, kind, numbers: [...numbers].sort((a, b) => a - b), amount });
}

export function clearRouletteBets(state: RouletteState, owner: string): Money {
  if (state.phase === 'settled') clearRouletteRound(state);
  let refund = 0;
  state.bets = state.bets.filter((b) => {
    if (b.owner !== owner) return true;
    refund += b.amount;
    return false;
  });
  return refund;
}

/** Removes the most recently placed bet of an owner (undo). */
export function undoRouletteBet(state: RouletteState, owner: string): RouletteBet | null {
  for (let i = state.bets.length - 1; i >= 0; i--) {
    if (state.bets[i].owner === owner) return state.bets.splice(i, 1)[0];
  }
  return null;
}

export function ownerTotal(state: RouletteState, owner: string): Money {
  return state.bets.filter((b) => b.owner === owner).reduce((a, b) => a + b.amount, 0);
}

/** Owners whose total wager is below the table minimum (they cannot take part in the spin). */
export function ownersBelowMinimum(state: RouletteState): string[] {
  const totals = new Map<string, number>();
  for (const b of state.bets) totals.set(b.owner, (totals.get(b.owner) ?? 0) + b.amount);
  return [...totals.entries()].filter(([, t]) => t < state.rules.minTotal).map(([o]) => o);
}

export function settleRouletteBet(bet: RouletteBet, result: number, rules: RouletteRules): RouletteSettlement {
  const hit = bet.numbers.includes(result);
  if (hit) return { ...bet, payout: bet.amount * (ROULETTE_PAYOUTS[bet.kind] + 1), won: true };
  const evenMoney = ROULETTE_PAYOUTS[bet.kind] === 1;
  if (result === 0 && evenMoney && rules.laPartage) return { ...bet, payout: Math.floor(bet.amount / 2), won: false };
  return { ...bet, payout: 0, won: false };
}

export interface SpinOutcome {
  result: number;
  pocketIndex: number;
  settlements: RouletteSettlement[];
}

/**
 * Draws the winning pocket and settles every bet. Bets whose owner is below
 * the table minimum must be removed by the caller before spinning.
 */
export function spinWheel(state: RouletteState): SpinOutcome {
  if (state.phase !== 'betting') throw new RouletteError('wheel already spun');
  if (ownersBelowMinimum(state).length > 0) throw new RouletteError('有玩家未达到最低下注');
  const rng = new Rng(state.rng);
  const pocketIndex = rng.int(0, EURO_WHEEL.length - 1);
  state.rng = rng.getState();
  const result = EURO_WHEEL[pocketIndex];
  state.result = result;
  state.round += 1;
  state.settlements = state.bets.map((b) => settleRouletteBet(b, result, state.rules));
  state.history.push(result);
  if (state.history.length > 100) state.history.splice(0, state.history.length - 100);
  state.phase = 'settled';
  return { result, pocketIndex, settlements: state.settlements };
}

export function clearRouletteRound(state: RouletteState): void {
  if (state.phase !== 'settled') return;
  state.bets = [];
  state.settlements = [];
  state.phase = 'betting';
}

export function ownerReturn(state: RouletteState, owner: string): Money {
  return state.settlements.filter((s) => s.owner === owner).reduce((a, s) => a + s.payout, 0);
}

/** House edge of every bet on a single-zero wheel: 1/37 ≈ 2.70% (1.35% on even-money with la partage). */
export function rouletteEdge(kind: RouletteBetKind, rules: RouletteRules): number {
  if (rules.laPartage && ROULETTE_PAYOUTS[kind] === 1) return 1 / 74;
  return 1 / 37;
}
