import { G, type Money } from '../core/money';
import type { PokerRules } from './PokerEngine';

/**
 * The Sunday night tournament in the poker room: a six-handed sit & go. Everyone buys in for
 * the same amount and gets the same stack of tournament chips; the blinds go up every few
 * hands; a player who runs out of chips is out; the last two share the buy-ins. The chips are
 * only for the tournament (they are not money and cannot be cashed); the fee is the house's.
 */

/** The table the tournament is dealt at (its own game, played on the felt of the 1/2 table). */
export const TOURNEY_TABLE = 'pkt';
/** The cash table that is closed for the night so the tournament can use it. */
export const TOURNEY_HOST = 'pk1';

export const TOURNEY = {
  buyIn: G(200),
  fee: G(20),
  /** tournament chips at the start, in the engine's units (100 to a chip, like G) */
  startStack: 3000 * 100,
  seats: 6,
  handsPerLevel: 6,
  /** Sunday (0 = Monday) */
  weekday: 6,
  /** minute of the day: registration opens, and the cards are in the air */
  opens: 17 * 60,
  starts: 19 * 60,
  /** a hand at a table of six takes a couple of minutes */
  minutesPerHand: 3,
};

/** Small and big blind per level, in tournament chips. */
export const LEVELS: readonly [number, number][] = [
  [25, 50],
  [50, 100],
  [75, 150],
  [100, 200],
  [150, 300],
  [200, 400],
  [300, 600],
  [400, 800],
  [600, 1200],
  [800, 1600],
  [1000, 2000],
  [1500, 3000],
  [2000, 4000],
  [3000, 6000],
  [4000, 8000],
  [6000, 12000],
];

/** The table's rules at a blind level: no rake (the fee was taken at registration). */
export function levelRules(level: number): PokerRules {
  const [sb, bb] = LEVELS[Math.min(level, LEVELS.length - 1)];
  return { seats: TOURNEY.seats, smallBlind: sb * 100, bigBlind: bb * 100, minBuyIn: TOURNEY.startStack, maxBuyIn: TOURNEY.startStack * TOURNEY.seats, rakeBp: 0, rakeCap: 0 };
}

/** The prize for each paid place (first, second) out of everyone's buy-ins. */
export function tourneyPrizes(entrants: number, buyIn: Money): Money[] {
  const pool = entrants * buyIn;
  const first = Math.round((pool * 0.65) / G(1)) * G(1);
  return [first, pool - first];
}

/** Tournament chips as the table shows them: a plain number, never G. */
export function tchips(units: number): string {
  return Math.round(units / 100).toLocaleString('en-US');
}
