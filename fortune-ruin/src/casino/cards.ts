import { Rng, type RngState } from '../core/rng';

/**
 * A card is encoded as an integer 0..51: suit * 13 + (rank - 1).
 * Ranks: 1 = Ace, 2..10, 11 = Jack, 12 = Queen, 13 = King.
 * Suits: 0 = spades, 1 = hearts, 2 = diamonds, 3 = clubs.
 */
export type Card = number;

export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_NAMES = ['黑桃', '红心', '方块', '梅花'] as const;
export const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export function makeCard(rank: number, suit: number): Card {
  if (rank < 1 || rank > 13 || suit < 0 || suit > 3) throw new Error(`bad card ${rank}/${suit}`);
  return suit * 13 + (rank - 1);
}

export function cardRank(c: Card): number {
  return (c % 13) + 1;
}

export function cardSuit(c: Card): number {
  return Math.floor(c / 13);
}

export function isRed(c: Card): boolean {
  const s = cardSuit(c);
  return s === 1 || s === 2;
}

export function cardLabel(c: Card): string {
  return `${RANK_LABELS[cardRank(c)]}${SUIT_SYMBOLS[cardSuit(c)]}`;
}

/** Parse "A♠", "10h", "Kd", "7C" ... (used heavily in tests). */
export function parseCard(s: string): Card {
  const m = /^(10|[2-9AJQK])([shdc♠♥♦♣])$/i.exec(s.trim());
  if (!m) throw new Error(`cannot parse card "${s}"`);
  const r = m[1].toUpperCase();
  const rank = r === 'A' ? 1 : r === 'J' ? 11 : r === 'Q' ? 12 : r === 'K' ? 13 : Number(r);
  const sc = m[2].toLowerCase();
  const suit = 's♠'.includes(sc) ? 0 : 'h♥'.includes(sc) ? 1 : 'd♦'.includes(sc) ? 2 : 3;
  return makeCard(rank, suit);
}

export function parseCards(s: string): Card[] {
  return s.split(/[\s,]+/).filter(Boolean).map(parseCard);
}

export function freshDecks(decks: number): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) for (let c = 0; c < 52; c++) out.push(c);
  return out;
}

/**
 * A physical shoe. Cards are drawn sequentially from a shuffled array; the
 * cut card marks where the dealer will reshuffle after the current round.
 * The shoe owns its RNG stream so table outcomes never depend on anything
 * outside the table (including the player's bankroll or history).
 */
export interface ShoeState {
  decks: number;
  cards: Card[];
  pos: number;
  cutIndex: number;
  penetration: number;
  shuffles: number;
  rng: RngState;
  /** When true the shoe was stacked by a test and must never be reshuffled automatically. */
  stacked?: boolean;
}

export function createShoe(decks: number, penetration: number, seed: number | string | RngState): ShoeState {
  const rng = new Rng(seed);
  const shoe: ShoeState = {
    decks,
    cards: [],
    pos: 0,
    cutIndex: 0,
    penetration,
    shuffles: 0,
    rng: rng.getState(),
  };
  shuffleShoe(shoe);
  return shoe;
}

/** Test helper: a shoe whose next cards are exactly `order`. */
export function createStackedShoe(order: Card[], decks = 1): ShoeState {
  return {
    decks,
    cards: order.slice(),
    pos: 0,
    cutIndex: order.length,
    penetration: 1,
    shuffles: 0,
    rng: new Rng(1).getState(),
    stacked: true,
  };
}

export function shuffleShoe(shoe: ShoeState): void {
  const rng = new Rng(shoe.rng);
  const cards = freshDecks(shoe.decks);
  rng.shuffle(cards);
  shoe.cards = cards;
  shoe.pos = 0;
  // Cut card placed with a little human variance around the published penetration.
  const jitter = Math.round(rng.range(-0.03, 0.03) * cards.length);
  shoe.cutIndex = Math.min(cards.length - 20, Math.max(20, Math.round(cards.length * shoe.penetration) + jitter));
  shoe.shuffles += 1;
  shoe.stacked = false;
  shoe.rng = rng.getState();
}

export function remainingCards(shoe: ShoeState): number {
  return shoe.cards.length - shoe.pos;
}

export function cutCardReached(shoe: ShoeState): boolean {
  return !shoe.stacked && shoe.pos >= shoe.cutIndex;
}

/**
 * Draw the next card. If the shoe is physically exhausted mid-round (only
 * possible with extreme splitting), the discards are reshuffled excluding the
 * cards currently on the felt, exactly as a dealer would.
 */
export function drawCard(shoe: ShoeState, inPlay: readonly Card[] = []): Card {
  if (shoe.pos >= shoe.cards.length) {
    if (shoe.stacked) throw new Error('stacked shoe exhausted');
    const rng = new Rng(shoe.rng);
    const pool = freshDecks(shoe.decks);
    for (const c of inPlay) {
      const i = pool.indexOf(c);
      if (i >= 0) pool.splice(i, 1);
    }
    rng.shuffle(pool);
    shoe.cards = pool;
    shoe.pos = 0;
    shoe.cutIndex = pool.length;
    shoe.shuffles += 1;
    shoe.rng = rng.getState();
  }
  return shoe.cards[shoe.pos++];
}

/** Hi-Lo running count of all cards dealt so far from this shoe (used only by casino surveillance). */
export function hiLoRunningCount(shoe: ShoeState): number {
  let rc = 0;
  for (let i = 0; i < shoe.pos; i++) {
    const r = cardRank(shoe.cards[i]);
    if (r >= 2 && r <= 6) rc += 1;
    else if (r === 1 || r >= 10) rc -= 1;
  }
  return rc;
}

export function hiLoTrueCount(shoe: ShoeState): number {
  const decksLeft = Math.max(0.5, remainingCards(shoe) / 52);
  return hiLoRunningCount(shoe) / decksLeft;
}
