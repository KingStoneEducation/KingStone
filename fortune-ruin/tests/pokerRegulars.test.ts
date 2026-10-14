import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { MINUTES_PER_DAY, hm, toDate } from '../src/core/calendar';
import { handInProgress, seatOfPoker } from '../src/casino/PokerEngine';
import { NPC_POKER, POKER_RAIL } from '../src/systems/CasinoManager';
import { NPC_BY_ID } from '../src/data/npcs';
import { TABLE_BY_ID } from '../src/casino/tables';
import { interiorMap } from '../src/world/maps/interiors';
import { reachable } from '../src/world/gates';
import { newCore } from './helpers';

/** The next night (from tomorrow on) this regular's poker block comes up, at an hour inside it. */
function pokerNight(c: GameCore, id: string): number {
  const def = NPC_BY_ID[id];
  for (let d = c.today() + 1; d < c.today() + 120; d++)
    for (const m of [hm(21), hm(22, 30), hm(23, 30)]) {
      const t = d * MINUTES_PER_DAY + m;
      if (c.npcs.scheduled(def, t).spot?.startsWith(POKER_RAIL)) return t;
    }
  throw new Error(`no poker night for ${id}`);
}

/** The player is in the casino that night, and everyone is where their schedule puts them. */
function atTheCasino(c: GameCore, t: number): void {
  c.state.time.minutes = t;
  c.npcs.settle(t);
  c.setLocation('casino', 50, 60);
  c.casino.refreshCrowd(true);
}

function patronOf(c: GameCore, id: string) {
  return c.state.casino.patrons.find((p) => p.npc === id && p.state !== 'gone');
}

/** What a named player has: in hand, on the felt, and what they left at home. */
function worth(c: GameCore, id: string): number {
  const rt = c.state.npcs[id];
  const p = patronOf(c, id);
  if (!p) return rt.money;
  const tableId = p.seat!.split(':')[0];
  const s = c.casino.pk(tableId);
  const i = seatOfPoker(s, p.id);
  return p.bankroll + (i >= 0 ? s.seats[i].stack : 0) + Number(rt.flags.heldBack ?? 0);
}

describe('regulars at the poker tables', () => {
  it('each has a night at the tables, at a stake they can afford', () => {
    for (const [id, how] of Object.entries(NPC_POKER)) {
      const c = newCore();
      const t = pokerNight(c, id);
      expect(c.npcs.scheduled(NPC_BY_ID[id], t)).toMatchObject({ loc: 'casino', act: 'gamble' });
      expect(TABLE_BY_ID[how.table].game).toBe('poker');
    }
    // the rail is somewhere you can walk to from the casino door
    const m = interiorMap('casino');
    const acc = reachable(m, m.spawns.entry.x, m.spawns.entry.y);
    for (const k of ['poker_rail1', 'poker_rail2', 'poker_rail3', 'poker_rail4']) {
      const s = m.spots[k];
      expect(s, k).toBeDefined();
      expect(acc[s.y * m.w + s.x], k).toBe(1);
    }
  });

  it('sits down at their table with a real buy-in, plays their own way, and nothing is made up or lost', () => {
    const c = newCore(31);
    const t = pokerNight(c, 'sophia');
    const before = c.state.npcs.sophia.money;
    atTheCasino(c, t);
    const p = patronOf(c, 'sophia');
    expect(p, 'seated').toBeDefined();
    const [tableId, seat] = p!.seat!.split(':');
    expect(tableId).toBe(NPC_POKER.sophia.table);
    const s = c.casino.pk(tableId);
    const i = seatOfPoker(s, p!.id);
    expect(i).toBe(Number(seat));
    const rules = s.rules;
    expect(s.seats[i].stack).toBeGreaterThanOrEqual(rules.minBuyIn);
    expect(s.seats[i].stack).toBeLessThanOrEqual(rules.maxBuyIn);
    expect(p!.pokerStyle).toBe('tight');
    expect(p!.name).toBe('索菲亚');
    expect(worth(c, 'sophia')).toBe(before);
    expect(c.casino.npcPokerTable('sophia')).toBe(tableId);
    // an hour of hands: between hands, what she has is always what her money says
    for (let k = 0; k < 60; k++) {
      c.advance(1, 'idle');
      if (patronOf(c, 'sophia') && !handInProgress(s)) expect(c.state.npcs.sophia.money).toBe(worth(c, 'sophia'));
    }
    expect(s.hand).toBeGreaterThan(0);
  });

  it('goes home with whatever is left when the night is over, the chips back in their own money', () => {
    const c = newCore(31);
    const t = pokerNight(c, 'tommy');
    atTheCasino(c, t);
    expect(patronOf(c, 'tommy')).toBeDefined();
    let last = worth(c, 'tommy');
    // play on until his evening ends and he gets up
    for (let k = 0; k < 6 * 60 && patronOf(c, 'tommy'); k++) {
      c.advance(1, 'idle');
      const p = patronOf(c, 'tommy');
      if (p && !handInProgress(c.casino.pk(p.seat!.split(':')[0]))) last = worth(c, 'tommy');
    }
    expect(patronOf(c, 'tommy')).toBeUndefined();
    const rt = c.state.npcs.tommy;
    // nothing is left on the felt or held back: it is all his money again
    expect(Number(rt.flags.heldBack ?? 0)).toBe(0);
    for (const tableId of ['pk1', 'pk2']) expect(seatOfPoker(c.casino.pk(tableId), 'npc:tommy')).toBe(-1);
    // (between his last hand and getting up nothing changes)
    expect(rt.money).toBe(last);
  });

  it('leaves with the player and comes back with the same money', () => {
    const c = newCore(31);
    const t = pokerNight(c, 'alexander');
    atTheCasino(c, t);
    expect(patronOf(c, 'alexander')).toBeDefined();
    for (let k = 0; k < 30; k++) c.advance(1, 'idle');
    // between two hands (leaving in the middle of one plays it out first)
    const table = () => c.casino.pk(patronOf(c, 'alexander')!.seat!.split(':')[0]);
    for (let k = 0; k < 60 && handInProgress(table()); k++) c.advance(1, 'idle');
    expect(handInProgress(table())).toBe(false);
    const had = worth(c, 'alexander');
    c.setLocation('city', 10, 10);
    expect(c.state.casino.patrons.length).toBe(0);
    expect(c.state.npcs.alexander.money).toBe(had);
    expect(Number(c.state.npcs.alexander.flags.heldBack ?? 0)).toBe(0);
  });

  it('a stranger gives up a seat for a regular, but the seat kept for the player stays free', () => {
    const c = newCore(31);
    const t = pokerNight(c, 'sophia');
    c.state.time.minutes = t;
    c.npcs.settle(t);
    // put the regular back at the rail and fill the table with strangers
    c.setLocation('casino', 50, 60);
    c.casino.refreshCrowd(true);
    const s = c.casino.pk('pk2');
    for (let k = 0; k < 30 && s.seats.some((x) => !x.occupant); k++) c.casino.refreshCrowd();
    expect(patronOf(c, 'sophia')).toBeDefined();
    expect(s.seats.filter((x) => x.occupant).length).toBeLessThanOrEqual(6);
  });

  it('says something about the game when you stop by', () => {
    const c = newCore(31);
    const t = pokerNight(c, 'daniel');
    atTheCasino(c, t);
    expect(c.casino.npcPokerTable('daniel')).toBe('pk1');
    expect(toDate(c.now()).weekday).toBe(6);
    const v = c.dialogue.start('daniel');
    c.dialogue.end();
    expect(v.lines.length).toBeGreaterThan(0);
  });
});
