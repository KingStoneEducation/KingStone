import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { MINUTES_PER_DAY } from '../src/core/calendar';
import { G } from '../src/core/money';
import type { JobState, StoryState } from '../src/core/state';
import { REVIEW_DAYS } from '../src/systems/StorySystem';
import { ARCHETYPES, liveDay } from './agents';
import { newCore } from './helpers';

function lastMessageFrom(core: GameCore, from: string) {
  return [...core.state.phone.messages].reverse().find((m) => m.from === from && m.actions?.length);
}

function answer(core: GameCore, from: string, suffix: string): string {
  const m = lastMessageFrom(core, from)!;
  const a = m.actions!.find((x) => x.id.endsWith(suffix))!;
  return core.phone.respond(m.id, a.id);
}

/** Answer a message from someone if it is waiting for this answer. */
function answerIfAsked(core: GameCore, from: string, suffix: string): void {
  const m = lastMessageFrom(core, from);
  if (m && !m.resolved && m.actions!.some((a) => a.id.endsWith(suffix))) answer(core, from, suffix);
}

/** The storyline's daily checks, day after day, without living through the days in between. */
function storyDays(core: GameCore, n: number): void {
  for (let i = 0; i < n; i++) {
    core.state.time.minutes += MINUTES_PER_DAY;
    core.stories.dailyPass();
  }
}

const job = (c: GameCore) => c.career.job('office_clerk')!;
const bonuses = (c: GameCore) => c.state.economy.ledger.filter((t) => t.cat === 'bonus' && t.from === 'ext:harbor_logistics').map((t) => t.amount);

/** Through Kiki's rumour, Raymond's ask and the man from head office, to the review itself. */
function toReview(c: GameCore, raymond: 'back' | 'duty' | null, west: 'join' | 'no' | null): StoryState {
  job(c).shifts = 20;
  const st = c.stories.begin('office_review');
  expect(st.stage).toBe('rumor');
  expect(c.state.phone.messages.at(-1)).toMatchObject({ from: 'kiki' });
  storyDays(c, 1);
  expect(st.stage).toBe('raymond');
  if (raymond) answer(c, 'raymond', `raymond.${raymond}`);
  storyDays(c, 2);
  expect(st.stage).toBe('west');
  if (west) answer(c, 'west', `west.${west}`);
  storyDays(c, 2);
  expect(st.stage).toBe('review');
  return st;
}

/** The same storyline with different seeds, until each of these endings has come up. */
function untilBoth(raymond: 'back' | 'duty' | null, west: 'join' | 'no' | null, check: (c: GameCore, st: StoryState, ending: string, before: JobState) => void): Set<string> {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 40 && seen.size < 2; seed++) {
    const c = newCore(seed);
    const st = toReview(c, raymond, west);
    const before = { ...job(c) };
    storyDays(c, REVIEW_DAYS);
    const ending = c.state.stories.done.find((d) => d.arc === 'office_review')!.ending;
    seen.add(ending);
    check(c, st, ending, before);
  }
  return seen;
}

describe('the merger review at Harbor Logistics', () => {
  it('backing Raymond and then turning up every day: the real shifts make the record, and the verdict pays what it says', () => {
    const c = newCore(61);
    job(c).shifts = 20;
    const st = c.stories.begin('office_review');
    for (let d = 0; d < REVIEW_DAYS + 6 && c.stories.active('office_review'); d++) {
      liveDay(c, ARCHETYPES.diligent);
      answerIfAsked(c, 'raymond', 'raymond.back');
      answerIfAsked(c, 'west', 'west.no');
    }
    expect(c.stories.active('office_review')).toBeUndefined();
    expect(st.data).toMatchObject({ final: 'raymond', clean: true });
    expect(Number(st.data.chance)).toBeGreaterThanOrEqual(70);
    const ending = c.state.stories.done.find((d) => d.arc === 'office_review')!.ending;
    if (ending === 'raymond') {
      expect(bonuses(c)).toEqual([G(1500)]);
      expect(job(c).fastTrack).toBe('raymond');
    } else {
      expect(bonuses(c)).toEqual([]);
      expect(job(c).fastTrack).toBeUndefined();
    }
    expect(c.social.memoriesOf('raymond').some((m) => m.kind === 'stood_by_me')).toBe(true);
    expect(c.economy.checkConservation().ok).toBe(true);
  });

  it('telling head office about him behind his back: he finds out either way, and only the man from head office pays', () => {
    const seen = untilBoth('back', 'join', (c, st, ending, before) => {
      expect(st.data.final).toBe('double');
      expect(Number(st.data.chance)).toBe(30);
      expect(c.social.memoriesOf('raymond').some((m) => m.kind === 'sided_against_me')).toBe(true);
      if (ending === 'raymond') {
        expect(bonuses(c)).toEqual([]);
        expect(job(c).performance).toBe(Math.max(0, before.performance - 8));
      } else {
        expect(bonuses(c)).toEqual([G(2000)]);
        expect(job(c).fastTrack).toBe('west');
      }
    });
    expect(seen).toEqual(new Set(['raymond', 'west']));
  });

  it('keeping out of it: nobody pays anything, whoever wins', () => {
    const seen = untilBoth('duty', 'no', (c, st) => {
      expect(st.data.final).toBe('neutral');
      expect(bonuses(c)).toEqual([]);
      expect(job(c).fastTrack).toBeUndefined();
      expect(c.social.memoriesOf('raymond').some((m) => m.kind === 'sided_against_me' || m.kind === 'stood_by_me')).toBe(false);
    });
    expect(seen.size).toBe(2);
  });

  it('backing him but coming in late counts against him, and he pays less for it', () => {
    let won = false;
    for (let seed = 1; seed <= 30 && !won; seed++) {
      const clean = newCore(seed);
      const a = toReview(clean, 'back', 'no');
      storyDays(clean, REVIEW_DAYS);
      const sloppy = newCore(seed);
      const b = toReview(sloppy, 'back', 'no');
      job(sloppy).lates += 2;
      storyDays(sloppy, REVIEW_DAYS);
      expect(Number(b.data.chance)).toBeLessThan(Number(a.data.chance));
      expect(b.data.clean).toBe(false);
      if (sloppy.state.stories.done.find((d) => d.arc === 'office_review')!.ending === 'raymond') {
        won = true;
        expect(bonuses(sloppy)).toEqual([G(500)]);
        expect(job(sloppy).fastTrack).toBeUndefined();
      }
    }
    expect(won).toBe(true);
  });

  it('the fast track Raymond promised really means fewer shifts before the next promotion, once', () => {
    const c = newCore(62);
    const j = job(c);
    const check = (x: JobState) => (c.career as unknown as { checkPromotion(j: JobState): string | null }).checkPromotion(x);
    j.shifts = 15;
    j.performance = 70;
    expect(check(j)).toBeNull();
    j.fastTrack = 'raymond';
    expect(check(j)).toBe('高级文员');
    expect(c.career.promote('office_clerk').ok).toBe(true);
    expect(j.fastTrack).toBeUndefined();
  });

  it('leaving the job ends it; the people in it talk about it while it lasts', () => {
    const c = newCore(63);
    const st = toReview(c, 'back', 'join');
    expect(c.stories.talk('raymond')).toContain('几天');
    expect(c.stories.talk('kiki')).toContain('韦斯特');
    expect(c.stories.talk('margaret')).toBeNull();
    // in person, once a day
    const first = c.dialogue.start('raymond').lines;
    c.dialogue.end();
    expect(first.some((l) => l.includes('总部'))).toBe(true);
    const again = c.dialogue.start('raymond').lines;
    c.dialogue.end();
    expect(again.some((l) => l === c.stories.talk('raymond'))).toBe(false);
    expect(c.career.quit('office_clerk').ok).toBe(true);
    storyDays(c, 1);
    expect(c.stories.active('office_review')).toBeUndefined();
    expect(c.state.stories.done.at(-1)).toMatchObject({ arc: 'office_review', ending: 'left' });
    expect(st.data.final).toBeUndefined();
  });

  it('begins on its own for someone who has been at the office a while, and only once', () => {
    const c = newCore(64);
    job(c).shifts = 20;
    storyDays(c, 200);
    const seen = [...c.state.stories.active.map((s) => s.arc), ...c.state.stories.done.map((d) => d.arc)].filter((a) => a === 'office_review');
    expect(seen.length).toBe(1);
    const d = newCore(64);
    expect(d.career.quit('office_clerk').ok).toBe(true);
    storyDays(d, 200);
    expect(d.state.stories.done.map((x) => x.arc)).not.toContain('office_review');
  });
});
