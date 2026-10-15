import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { GAME_START_MINUTES, MINUTES_PER_DAY, hm, toDate } from '../src/core/calendar';
import { G } from '../src/core/money';
import { HIGH_ROLLER, JACKPOT, VIP_CREDIT, VIP_NIGHTS } from '../src/systems/StorySystem';
import { newCore } from './helpers';

function lastMessageFrom(core: GameCore, from: string) {
  return [...core.state.phone.messages].reverse().find((m) => m.from === from && m.actions?.length);
}

function answer(core: GameCore, from: string, suffix: string): string {
  const m = lastMessageFrom(core, from)!;
  const a = m.actions!.find((x) => x.id.endsWith(suffix))!;
  return core.phone.respond(m.id, a.id);
}

/** The storyline's daily checks, day after day, without living through the days in between. */
function storyDays(core: GameCore, n: number): void {
  for (let i = 0; i < n; i++) {
    core.state.time.minutes += MINUTES_PER_DAY;
    core.stories.dailyPass();
  }
}

const tommy = (c: GameCore) => c.state.npcs.tommy;
const ending = (c: GameCore) => c.state.stories.done.find((d) => d.arc === 'tommy_jackpot')?.ending;

/** Tommy has won; the player tells him to go and celebrate, and lets him go to the VIP room on his own. */
function toVip(seed: number, how: 'come' | 'pass' = 'pass'): GameCore {
  const c = newCore(seed);
  const before = tommy(c).money;
  c.stories.begin('tommy_jackpot');
  expect(tommy(c).money).toBe(before + JACKPOT);
  answer(c, 'tommy', 'jackpot.party');
  expect(c.stories.active('tommy_jackpot')!.stage).toBe('courted');
  answer(c, 'tommy', `courted.${how}`);
  expect(c.stories.active('tommy_jackpot')!.stage).toBe('highlife');
  return c;
}

/** Live out the VIP nights with no further say, and whatever comes of them. */
function playOut(c: GameCore): void {
  for (let i = 0; i < 2 * VIP_NIGHTS + 8 && c.stories.active('tommy_jackpot'); i++) {
    storyDays(c, 1);
    const st = c.stories.active('tommy_jackpot');
    if (st?.stage === 'crossroads' && !lastMessageFrom(c, 'tommy')?.resolved) answer(c, 'tommy', 'crossroads.cheer');
    // the markers wait for an answer
    if (st?.stage === 'markers') return;
  }
}

describe("Tommy's jackpot", () => {
  it('talked into putting it into music: a guitar, the studio and his old debts, and three weeks later his first record', () => {
    let done = false;
    for (let seed = 1; seed <= 30 && !done; seed++) {
      const c = newCore(seed);
      c.social.applyDelta('tommy', { affection: 40, trust: 40 });
      c.stories.begin('tommy_jackpot');
      const after = tommy(c).money;
      const debt = tommy(c).debt;
      answer(c, 'tommy', 'jackpot.bank');
      if (c.stories.active('tommy_jackpot')!.stage !== 'album') continue;
      done = true;
      expect(tommy(c).money).toBe(after - G(8000) - debt);
      expect(tommy(c).debt).toBe(0);
      expect(c.social.memoriesOf('tommy').some((m) => m.kind === 'talked_me_down')).toBe(true);
      expect(tommy(c).overrides.some((o) => o.reason === HIGH_ROLLER)).toBe(false);
      storyDays(c, 21);
      expect(ending(c)).toBe('album');
      expect(c.state.player.moodBuffs.some((b) => b.id === 'tommy_ep')).toBe(true);
    }
    expect(done).toBe(true);
  });

  it('the VIP nights are real: he is booked at the VIP table on four evenings, and going with him gets you in as his guest', () => {
    const c = toVip(11, 'come');
    const st = c.stories.active('tommy_jackpot')!;
    const nights = tommy(c).overrides.filter((o) => o.reason === HIGH_ROLLER);
    expect(nights.length).toBe(VIP_NIGHTS);
    for (const o of nights) {
      expect(o).toMatchObject({ location: 'casino', spot: 'vip_bac3', activity: 'gamble' });
      expect(toDate(o.from).hour * 60 + toDate(o.from).minute).toBe(hm(21, 30));
    }
    expect(Number(st.data.credit)).toBe(VIP_CREDIT);
    // Victor's invitation: the VIP room is open to you, though it still wants a suit
    expect(c.state.casino.invites.vip).toBeGreaterThanOrEqual(Math.floor(nights.at(-1)!.until / MINUTES_PER_DAY));
    expect(c.casino.areaAccess('vip')).toContain('正装');
    expect(c.social.memoriesOf('tommy').some((m) => m.kind === 'came_vip')).toBe(true);
    // on one of those evenings he is in the VIP room, not behind the bar
    expect(c.npcs.target('tommy', nights[0].from + 60)).toMatchObject({ loc: 'casino', spot: 'vip_bac3', act: 'gamble' });
  });

  it('nobody knows how it ends: across games it goes every way, and the markers are real debt', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const c = toVip(seed);
      const base = tommy(c).money - JACKPOT;
      const debtBefore = tommy(c).debt;
      playOut(c);
      const st = c.state.stories.active.find((x) => x.arc === 'tommy_jackpot');
      if (st?.stage === 'markers') {
        seen.add('markers');
        expect(Number(st.data.owed)).toBeGreaterThan(0);
        expect(Number(st.data.owed)).toBeLessThanOrEqual(VIP_CREDIT);
        expect(tommy(c).debt).toBeGreaterThanOrEqual(debtBefore + Number(st.data.owed) - G(200));
        expect(tommy(c).money).toBe(0);
        continue;
      }
      const e = ending(c)!;
      seen.add(e);
      expect(['lucky', 'kept_some', 'broke']).toContain(e);
      if (e === 'lucky') expect(tommy(c).money).toBeGreaterThanOrEqual(base + JACKPOT);
      if (e === 'broke') expect(tommy(c).money).toBeLessThan(base + G(6000));
      expect(tommy(c).overrides.some((o) => o.reason === HIGH_ROLLER)).toBe(false);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(seen.has('markers')).toBe(true);
  });

  it('Victor stops his credit only for someone he trusts, and Tommy is told whose idea it was', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 2; seed++) {
      for (const trusted of [false, true]) {
        const c = toVip(seed);
        if (trusted) c.social.applyDelta('victor', { trust: 40 });
        else c.social.applyDelta('victor', { trust: -40 });
        storyDays(c, 4);
        const st = c.stories.active('tommy_jackpot');
        if (st?.stage !== 'crossroads' || st.data.up) break;
        if (trusted) checked++;
        answer(c, 'tommy', 'crossroads.victor');
        if (!trusted) {
          expect(Number(st.data.credit)).toBe(VIP_CREDIT);
          continue;
        }
        expect(Number(st.data.credit)).toBe(Number(st.data.drawn));
        expect(c.social.memoriesOf('tommy').some((m) => m.kind === 'cut_my_credit')).toBe(true);
        const drawn = Number(st.data.drawn);
        playOut(c);
        // nothing more signed for after that
        expect(Number(st.data.drawn)).toBe(drawn);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('a night you sat at the table with him is his real result, not played out again', () => {
    const c = toVip(21);
    const st = c.stories.active('tommy_jackpot')!;
    const night = Number(st.data.first);
    tommy(c).flags.liveGambleDay = night;
    const money = tommy(c).money;
    const rolls = c.state.rng;
    const before = JSON.stringify(rolls);
    c.state.time.minutes = (night + 1) * MINUTES_PER_DAY + hm(11);
    c.stories.dailyPass();
    expect(Number(st.data.played)).toBe(1);
    expect(tommy(c).money).toBe(money);
    expect(JSON.stringify(c.state.rng)).toBe(before);
  });

  it('owing the casino: paying part of it goes through your own accounts; leaving him to it costs him the bar', () => {
    let paid = false;
    let fell = false;
    for (let seed = 1; seed <= 80 && !(paid && fell); seed++) {
      const c = toVip(seed);
      playOut(c);
      const st = c.stories.active('tommy_jackpot');
      if (st?.stage !== 'markers') continue;
      const owed = Number(st.data.owed);
      if (!paid) {
        paid = true;
        const bank = c.economy.balance('bank');
        const debt = tommy(c).debt;
        const help = Number(st.data.help);
        expect(help).toBe(Math.round(Math.min(owed, G(5000)) / G(100)) * G(100));
        answer(c, from(c), 'markers.pay');
        expect(c.economy.balance('bank')).toBe(bank - help);
        expect(tommy(c).debt).toBe(debt - help);
        expect(ending(c)).toBe('rescued');
        expect(c.social.memoriesOf('tommy').some((m) => m.kind === 'paid_markers')).toBe(true);
        expect(c.economy.checkConservation().ok).toBe(true);
      } else {
        fell = true;
        answer(c, from(c), 'markers.nothing');
        expect(ending(c)).toBe('fall');
        expect(Number(tommy(c).flags.suspendedUntil)).toBe(c.today() + 14);
        expect(c.npcs.target('tommy', (c.today() + 2) * MINUTES_PER_DAY + hm(20)).act).not.toBe('work');
      }
    }
    expect(paid && fell).toBe(true);
  });

  it('begins only for someone who knows him, on the morning after his Monday night out, a few weeks in, and only once', () => {
    const starts = (c: GameCore, days: number) => {
      for (let i = 0; i < days; i++) {
        c.state.time.minutes += MINUTES_PER_DAY;
        c.stories.dailyPass();
        const st = c.stories.active('tommy_jackpot');
        if (st) return toDate(c.now()).weekday;
      }
      return null;
    };
    const stranger = newCore(31);
    stranger.state.social.rel.tommy.met = false;
    expect(starts(stranger, 120)).toBeNull();
    const friend = newCore(31);
    friend.state.social.rel.tommy.met = true;
    expect(starts(friend, 300)).toBe(1);
    expect(friend.today() - Math.floor(GAME_START_MINUTES / MINUTES_PER_DAY)).toBeGreaterThanOrEqual(14);
    friend.state.stories.active = friend.state.stories.active.filter((s) => s.arc !== 'tommy_jackpot');
    friend.state.stories.done.push({ arc: 'tommy_jackpot', ending: 'album', day: friend.today() });
    expect(starts(friend, 300)).toBeNull();
  });
});

/** Who brought the news of the markers: Daniel if you know him, Tommy himself if not. */
function from(c: GameCore): string {
  return lastMessageFrom(c, 'daniel')?.actions?.some((a) => a.id.includes('tommy_jackpot:markers')) ? 'daniel' : 'tommy';
}
