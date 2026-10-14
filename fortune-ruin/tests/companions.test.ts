import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { MINUTES_PER_DAY } from '../src/core/calendar';
import { newCore } from './helpers';

function friend(c: GameCore, id: string, v = 40): void {
  const r = c.social.rel(id);
  r.met = true;
  r.knowsName = true;
  r.familiarity = v;
  r.affection = v;
  r.trust = v;
}

/** Morning of day 3. */
function morning(seed = 1): GameCore {
  const c = newCore(seed);
  c.state.time.minutes = 3 * MINUTES_PER_DAY + 10 * 60;
  c.npcs.settle(c.now());
  return c;
}

describe('taking a friend to the casino', () => {
  it('only friends are asked, and everyone answers in character', () => {
    const c = morning();
    expect(c.companions.inviteOption('marco').show).toBe(false);
    for (const id of ['marco', 'daniel', 'eileen', 'sophia']) friend(c, id);
    const eileenTrust = c.social.rel('eileen').trust;
    const no = c.companions.invite('eileen');
    expect(no.yes).toBe(false);
    expect(c.social.rel('eileen').trust).toBeLessThan(eileenTrust);
    expect(c.companions.invite('sophia').yes).toBe(false);
    const daniel = c.companions.invite('daniel');
    expect(daniel.yes).toBe(true);
    expect(c.events.upcoming().find((e) => e.npc === 'daniel')!.data.mode).toBe('watch');
    const marco = c.companions.invite('marco');
    expect(marco.yes).toBe(true);
    const ev = c.events.upcoming().find((e) => e.npc === 'marco' && e.def === 'casino_night')!;
    expect(ev.data.mode).toBe('play');
    expect(Math.floor(ev.at / MINUTES_PER_DAY)).toBe(c.today());
    expect(c.companions.inviteOption('marco').disabled).toBe('已经约好了');
  });

  it('asking Marco while he has promised to stay away breaks the promise, and people hear of it', () => {
    const c = morning(2);
    friend(c, 'marco');
    c.state.npcs.marco.flags.noGambleUntil = c.today() + 20;
    expect(c.companions.invite('marco').yes).toBe(true);
    expect(Number(c.state.npcs.marco.flags.noGambleUntil)).toBeLessThan(c.today());
    expect(c.social.recall('daniel', ['tempted'], 1)).toBeTruthy();
  });

  it('a friend who came to play sits at your table with their own money, and follows you to another', () => {
    const c = morning(3);
    friend(c, 'marco');
    c.state.npcs.marco.money = 400000;
    c.companions.invite('marco');
    const ev = c.events.upcoming().find((e) => e.npc === 'marco')!;
    c.state.time.minutes = ev.at + 5;
    c.npcs.settle(c.now());
    c.setLocation('casino', -1, -1);
    c.events.tickMinute(c.now());
    expect(c.events.pendingPrompt?.title).toBe('赌场之夜');
    c.events.resolvePrompt('together');
    expect(c.casino.sit('bj1').ok).toBe(true);
    const seated = c.state.casino.patrons.find((p) => p.npc === 'marco' && p.state !== 'gone');
    expect(seated?.seat?.startsWith('bj1:')).toBe(true);
    // money at the table is part of his money
    expect(seated!.bankroll + Number(c.state.npcs.marco.flags.heldBack ?? 0)).toBe(c.state.npcs.marco.money);
    c.casino.standUp();
    expect(c.casino.sit('rl2').ok).toBe(true);
    const moved = c.state.casino.patrons.find((p) => p.npc === 'marco' && p.state !== 'gone');
    expect(moved?.seat?.startsWith('rl2:')).toBe(true);
  });

  it('after the evening they tell you how it went, and remember it', () => {
    const c = morning(4);
    friend(c, 'kiki');
    c.state.npcs.kiki.money = 200000;
    c.companions.invite('kiki');
    const ev = c.events.upcoming().find((e) => e.npc === 'kiki')!;
    c.state.time.minutes = ev.at + 1;
    c.npcs.settle(c.now());
    c.setLocation('casino', -1, -1);
    c.events.tickMinute(c.now());
    c.events.resolvePrompt('together');
    // pretend the night went her way
    c.state.npcs.kiki.money += 50000;
    c.state.time.minutes = ev.until + 1;
    c.events.tickMinute(c.now());
    expect(c.social.recall('kiki', ['casino_night'], 1)).toBeTruthy();
    expect(c.state.phone.messages.some((m) => m.from === 'kiki' && m.body.includes('赢了'))).toBe(true);
  });

  it('standing them up is remembered', () => {
    const c = morning(5);
    friend(c, 'tommy');
    c.state.npcs.tommy.money = 100000;
    c.companions.invite('tommy');
    const ev = c.events.upcoming().find((e) => e.npc === 'tommy')!;
    c.state.time.minutes = ev.until + 1;
    c.events.tickMinute(c.now());
    expect(c.social.recall('tommy', ['missed_party'], 1)).toBeTruthy();
  });
});
