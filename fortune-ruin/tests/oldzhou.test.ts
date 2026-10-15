import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { MINUTES_PER_DAY } from '../src/core/calendar';
import { casinoSince } from '../src/systems/StorySystem';
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

/** Old Zhou has asked; the player says yes to the week. */
function promised(seed: number): GameCore {
  const c = newCore(seed);
  const st = c.stories.begin('oldzhou_story');
  expect(st.stage).toBe('tea');
  answer(c, 'oldzhou', 'tea.listen');
  expect(st.stage).toBe('story');
  expect(lastMessageFrom(c, 'oldzhou')!.body).toContain('三十二年前');
  answer(c, 'oldzhou', 'story.week');
  expect(st.stage).toBe('week');
  return c;
}

describe('Old Zhou’s story', () => {
  it('a week kept away from the casino: he is glad of it, and it shows', () => {
    const c = promised(81);
    const trust = c.social.rel('oldzhou').trust;
    expect(c.stories.talk('oldzhou')).toContain('天');
    storyDays(c, 7);
    expect(c.state.stories.done.at(-1)).toMatchObject({ arc: 'oldzhou_story', ending: 'kept' });
    expect(c.social.memoriesOf('oldzhou').some((m) => m.kind === 'kept_promise')).toBe(true);
    expect(c.social.rel('oldzhou').trust).toBeGreaterThan(trust);
    expect(c.state.player.moodBuffs.some((b) => b.id === 'oldzhou_tea')).toBe(true);
  });

  it('going back on it: walking into the casino during the week breaks the promise, and he remembers', () => {
    const c = promised(82);
    const trust = c.social.rel('oldzhou').trust;
    c.state.time.minutes += 120;
    c.setLocation('casino', 50, 60);
    expect(casinoSince(c, c.now() - 60)).toBe(true);
    c.setLocation('city', 10, 10);
    storyDays(c, 1);
    expect(c.state.stories.done.at(-1)).toMatchObject({ arc: 'oldzhou_story', ending: 'broken' });
    expect(c.social.memoriesOf('oldzhou').some((m) => m.kind === 'broke_promise')).toBe(true);
    expect(c.social.rel('oldzhou').trust).toBeLessThan(trust);
  });

  it('signing the casino’s own self-exclusion is the strongest answer; not signing it comes back to the week', () => {
    const c = newCore(83);
    c.stories.begin('oldzhou_story');
    answer(c, 'oldzhou', 'tea.listen');
    answer(c, 'oldzhou', 'story.limit');
    expect(c.stories.active('oldzhou_story')!.stage).toBe('limit');
    // what the host's self-exclusion form does
    c.state.casino.bannedUntil = c.now() + 28 * MINUTES_PER_DAY;
    storyDays(c, 1);
    expect(c.state.stories.done.at(-1)).toMatchObject({ arc: 'oldzhou_story', ending: 'excluded' });
    const d = newCore(84);
    d.stories.begin('oldzhou_story');
    answer(d, 'oldzhou', 'tea.listen');
    answer(d, 'oldzhou', 'story.limit');
    storyDays(d, 3);
    expect(d.stories.active('oldzhou_story')!.stage).toBe('week');
  });

  it('saying no, or not going at all, ends it quietly', () => {
    const c = newCore(85);
    c.stories.begin('oldzhou_story');
    answer(c, 'oldzhou', 'tea.listen');
    answer(c, 'oldzhou', 'story.no');
    expect(c.state.stories.done.at(-1)).toMatchObject({ arc: 'oldzhou_story', ending: 'refused' });
    const d = newCore(86);
    d.stories.begin('oldzhou_story');
    storyDays(d, 5);
    expect(d.state.stories.done.at(-1)).toMatchObject({ arc: 'oldzhou_story', ending: 'dismissed' });
  });

  it('begins on its own only for someone who has been spending their evenings at the casino', () => {
    const c = newCore(87);
    storyDays(c, 60);
    expect(c.state.stories.done.concat(c.state.stories.active.map((s) => ({ arc: s.arc, ending: '', day: 0 }))).some((d) => d.arc === 'oldzhou_story')).toBe(false);
    // a week of long nights at the tables
    const d = newCore(87);
    const now = d.now();
    for (let k = 0; k < 6; k++) d.state.casino.stats.sessions.push({ start: now - (k + 1) * MINUTES_PER_DAY, end: now - (k + 1) * MINUTES_PER_DAY + 3 * 60, net: -50000, rounds: 60 });
    let started = false;
    for (let k = 0; k < 30 && !started; k++) {
      d.stories.dailyPass();
      started = !!d.stories.active('oldzhou_story');
    }
    expect(started).toBe(true);
  });
});
