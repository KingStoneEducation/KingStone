import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import { createStackedShoe, parseCards, type Card } from '../src/casino/cards';
import {
  bacTotal,
  bankerDraws,
  createBaccaratTable,
  dealCoup,
  finishBacRound,
  placeBacBet,
  ownerReturn,
  ownerStake,
  validateBacBet,
  type BaccaratState,
} from '../src/casino/BaccaratEngine';

function stacked(order: string): BaccaratState {
  const t = createBaccaratTable('b', { minBet: G(10), maxBet: G(1000), tieMax: G(200) }, 1);
  t.shoe = createStackedShoe(parseCards(order));
  return t;
}

describe('baccarat totals', () => {
  it('counts tens and faces as zero and keeps the last digit', () => {
    expect(bacTotal(parseCards('Ks 9d'))).toBe(9);
    expect(bacTotal(parseCards('7s 8d'))).toBe(5);
    expect(bacTotal(parseCards('10s Jd Qc'))).toBe(0);
    expect(bacTotal(parseCards('As 2d 3c'))).toBe(6);
  });
});

describe('banker third-card tableau', () => {
  // Expected tableau: rows = banker total 0..7, columns = player's third card value 0..9, plus "player stood".
  const D = true;
  const S = false;
  const table: Record<number, boolean[]> = {
    0: [D, D, D, D, D, D, D, D, D, D],
    1: [D, D, D, D, D, D, D, D, D, D],
    2: [D, D, D, D, D, D, D, D, D, D],
    3: [D, D, D, D, D, D, D, D, S, D],
    4: [S, S, D, D, D, D, D, D, S, S],
    5: [S, S, S, S, D, D, D, D, S, S],
    6: [S, S, S, S, S, S, D, D, S, S],
    7: [S, S, S, S, S, S, S, S, S, S],
  };
  const cardOfValue = (v: number): Card => parseCards(v === 0 ? 'Ks' : v === 1 ? 'As' : `${v}s`)[0];
  it('matches the standard Punto Banco rules for every case', () => {
    for (let bt = 0; bt <= 7; bt++) {
      for (let pv = 0; pv <= 9; pv++) {
        expect(bankerDraws(bt, cardOfValue(pv)), `banker ${bt} vs player third ${pv}`).toBe(table[bt][pv]);
      }
      expect(bankerDraws(bt, null)).toBe(bt <= 5);
    }
  });
});

describe('coup flow', () => {
  it('naturals end the coup immediately', () => {
    // P: 8s Ks = 8, B: 7d Kd = 7
    const t = stacked('8s 7d Kh Kd 2c 2c');
    placeBacBet(t, 'p', 'player', G(10));
    dealCoup(t);
    expect(t.last?.player.length).toBe(2);
    expect(t.last?.banker.length).toBe(2);
    expect(t.last?.winner).toBe('player');
    expect(t.last?.natural).toBe(true);
    expect(ownerReturn(t, 'p')).toBe(G(20));
  });

  it('player stands on 6 and banker draws on 5 or less', () => {
    // P: 3s 3d = 6 stands; B: 2h 3h = 5 draws 4c -> 9
    const t = stacked('3s 2h 3d 3h 4c');
    placeBacBet(t, 'p', 'banker', G(100));
    dealCoup(t);
    expect(t.last?.player.length).toBe(2);
    expect(t.last?.banker.length).toBe(3);
    expect(t.last?.bankerTotal).toBe(9);
    expect(t.last?.winner).toBe('banker');
    // 5% commission: 100 stake back + 95 winnings
    expect(ownerReturn(t, 'p')).toBe(G(195));
  });

  it('player draws on 0-5 and banker applies the tableau to the third card', () => {
    // P: As 2s = 3 draws 8d -> 1; B: 2h Ah = 3, player third card is 8 => banker stands
    const t = stacked('As 2h 2s Ah 8d');
    dealCoup(t);
    expect(t.last?.player.length).toBe(3);
    expect(t.last?.banker.length).toBe(2);
    expect(t.last?.winner).toBe('banker');
  });

  it('tie pays 8:1 and pushes player/banker bets', () => {
    // P: 4s 3s = 7, B: 5h 2h = 7 -> tie, nobody draws
    const t = stacked('4s 5h 3s 2h');
    placeBacBet(t, 'a', 'tie', G(10));
    placeBacBet(t, 'b', 'player', G(10));
    placeBacBet(t, 'c', 'banker', G(10));
    dealCoup(t);
    expect(t.last?.winner).toBe('tie');
    expect(ownerReturn(t, 'a')).toBe(G(90));
    expect(ownerReturn(t, 'b')).toBe(G(10));
    expect(ownerReturn(t, 'c')).toBe(G(10));
  });

  it('pair side bets pay 11:1 on the first two cards', () => {
    const t = stacked('7s 2h 7d 3h 9c');
    placeBacBet(t, 'p', 'playerPair', G(10));
    placeBacBet(t, 'p', 'bankerPair', G(10));
    dealCoup(t);
    expect(t.last?.playerPair).toBe(true);
    expect(t.last?.bankerPair).toBe(false);
    expect(ownerStake(t, 'p')).toBe(G(20));
    expect(ownerReturn(t, 'p')).toBe(G(120));
  });

  it('validates limits and forbids betting both sides', () => {
    const t = stacked('7s 2h 7d 3h');
    expect(validateBacBet(t, 'p', 'player', G(5))).not.toBeNull();
    expect(validateBacBet(t, 'p', 'player', G(2000))).not.toBeNull();
    expect(validateBacBet(t, 'p', 'tie', G(300))).not.toBeNull();
    placeBacBet(t, 'p', 'player', G(10));
    expect(validateBacBet(t, 'p', 'banker', G(10))).not.toBeNull();
    expect(() => placeBacBet(t, 'p', 'player', G(10.5))).toThrow();
  });
});

/**
 * Exact enumeration of an 8-deck shoe (without replacement over the six cards
 * that can be used in a coup). This independently verifies that the drawing
 * rules reproduce the well known probabilities.
 */
function exactBaccarat(decks: number): { player: number; banker: number; tie: number } {
  const counts = new Array(10).fill(4 * decks);
  counts[0] = 16 * decks;
  let total = 52 * decks;
  const res = { player: 0, banker: 0, tie: 0 };
  const take = (v: number) => {
    const p = counts[v] / total;
    counts[v]--;
    total--;
    return p;
  };
  const put = (v: number) => {
    counts[v]++;
    total++;
  };
  for (let p1 = 0; p1 < 10; p1++) {
    const w1 = take(p1);
    for (let b1 = 0; b1 < 10; b1++) {
      const w2 = w1 * take(b1);
      for (let p2 = 0; p2 < 10; p2++) {
        const w3 = w2 * take(p2);
        for (let b2 = 0; b2 < 10; b2++) {
          const w4 = w3 * take(b2);
          const pt = (p1 + p2) % 10;
          const bt = (b1 + b2) % 10;
          const record = (ptot: number, btot: number, w: number) => {
            if (ptot > btot) res.player += w;
            else if (btot > ptot) res.banker += w;
            else res.tie += w;
          };
          if (pt >= 8 || bt >= 8) {
            record(pt, bt, w4);
          } else if (pt <= 5) {
            for (let p3 = 0; p3 < 10; p3++) {
              if (counts[p3] === 0) continue;
              const w5 = w4 * take(p3);
              const pt3 = (pt + p3) % 10;
              const third = parseCards(p3 === 0 ? 'Ks' : p3 === 1 ? 'As' : `${p3}s`)[0];
              if (bankerDraws(bt, third)) {
                for (let b3 = 0; b3 < 10; b3++) {
                  if (counts[b3] === 0) continue;
                  const w6 = w5 * take(b3);
                  record(pt3, (bt + b3) % 10, w6);
                  put(b3);
                }
              } else {
                record(pt3, bt, w5);
              }
              put(p3);
            }
          } else if (bankerDraws(bt, null)) {
            for (let b3 = 0; b3 < 10; b3++) {
              if (counts[b3] === 0) continue;
              const w6 = w4 * take(b3);
              record(pt, (bt + b3) % 10, w6);
              put(b3);
            }
          } else {
            record(pt, bt, w4);
          }
          put(b2);
        }
        put(p2);
      }
      put(b1);
    }
    put(p1);
  }
  return res;
}

describe('baccarat mathematics', () => {
  const exact = exactBaccarat(8);

  it('reproduces the published 8-deck probabilities', () => {
    expect(exact.banker).toBeCloseTo(0.458597, 5);
    expect(exact.player).toBeCloseTo(0.446247, 5);
    expect(exact.tie).toBeCloseTo(0.095156, 5);
    expect(exact.banker + exact.player + exact.tie).toBeCloseTo(1, 10);
  });

  it('yields the published house edges', () => {
    const bankerEdge = -(exact.banker * 0.95 - exact.player);
    const playerEdge = -(exact.player - exact.banker);
    const tieEdge = -(exact.tie * 8 - (1 - exact.tie));
    expect(bankerEdge * 100).toBeCloseTo(1.06, 2);
    expect(playerEdge * 100).toBeCloseTo(1.235, 2);
    expect(tieEdge * 100).toBeCloseTo(14.36, 2);
  });

  it('the dealing engine matches the exact distribution over many coups', () => {
    const t = createBaccaratTable('sim', { minBet: G(10) }, 'bac-sim');
    const n = 150000;
    const c = { player: 0, banker: 0, tie: 0 };
    for (let i = 0; i < n; i++) {
      dealCoup(t);
      c[t.last!.winner]++;
      finishBacRound(t);
    }
    // 4 standard errors tolerance
    for (const k of ['player', 'banker', 'tie'] as const) {
      const p = exact[k];
      const se = Math.sqrt((p * (1 - p)) / n);
      expect(Math.abs(c[k] / n - p)).toBeLessThan(4 * se);
    }
  });
});
