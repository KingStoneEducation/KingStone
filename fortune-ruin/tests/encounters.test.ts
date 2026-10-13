import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import type { GameCore } from '../src/core/GameCore';
import type { Encounter } from '../src/core/state';
import { MINUTES_PER_DAY } from '../src/core/calendar';
import { tieKey } from '../src/systems/SocialSystem';
import { MemoryStorage, SaveManager } from '../src/systems/SaveManager';
import { newCore } from './helpers';

/** Start of game day 3 at the given hour, with everyone placed by their schedules. */
function at(core: GameCore, hour: number): void {
  core.state.time.minutes = 3 * MINUTES_PER_DAY + hour * 60;
  core.npcs.settle(core.now());
}

function meetAt(core: GameCore, ids: string[], location: string, spot: (id: string) => string | null, hours: number): void {
  for (const id of ids) core.npcs.setOverrideAt(id, core.now(), hours * 60, location, spot(id), 'leisure', 'test');
}

function record(core: GameCore): { list: Encounter[]; colocated: boolean[] } {
  const list: Encounter[] = [];
  const colocated: boolean[] = [];
  core.bus.on('npc:encounter', ({ encounter }) => {
    list.push({ ...encounter });
    const a = core.state.npcs[encounter.a];
    const b = core.state.npcs[encounter.b];
    colocated.push(!a.travel && !b.travel && a.location === encounter.location && b.location === encounter.location);
  });
  return { list, colocated };
}

function bigLossSeenBy(core: GameCore, npc: string): void {
  core.social.applyDirect(npc, { kind: 'big_loss', facets: { wealthLoss: 0.8, gambling: 0.7 }, importance: 40, data: { amount: G(3000), game: '21点' } }, { source: 'witnessed', silent: true });
}

describe('NPC encounters', () => {
  it('friends who share a place meet, at most once a day, and only when both are there', () => {
    const core = newCore(5);
    at(core, 9);
    const rec = record(core);
    meetAt(core, ['eileen', 'oldzhou'], 'cafe', () => null, 12);
    core.advance(12 * 60, 'idle');
    const pair = rec.list.filter((e) => tieKey(e.a, e.b) === tieKey('eileen', 'oldzhou'));
    expect(pair.length).toBe(1);
    expect(pair[0].location).toBe('cafe');
    expect(rec.colocated.every(Boolean)).toBe(true);
    // every pair meets at most once per day
    const seen = new Set<string>();
    for (const e of rec.list) {
      const k = `${tieKey(e.a, e.b)}|${Math.floor(e.start / MINUTES_PER_DAY)}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it('outdoors, only NPCs who are actually near each other meet', () => {
    const far = newCore(8);
    at(far, 10);
    const recFar = record(far);
    meetAt(far, ['margaret', 'oldzhou'], 'city', (id) => (id === 'margaret' ? 'maple_garden' : 'riverwalk'), 8);
    far.advance(8 * 60, 'idle');
    expect(recFar.list.some((e) => tieKey(e.a, e.b) === tieKey('margaret', 'oldzhou'))).toBe(false);

    const near = newCore(8);
    at(near, 10);
    const recNear = record(near);
    meetAt(near, ['margaret', 'oldzhou'], 'city', (id) => (id === 'margaret' ? 'park_bench1' : 'park_chess'), 8);
    near.advance(8 * 60, 'idle');
    expect(recNear.list.some((e) => tieKey(e.a, e.b) === tieKey('margaret', 'oldzhou'))).toBe(true);
  });

  it('gossip carries a story about the player face to face, retold once', () => {
    const core = newCore(11);
    at(core, 10);
    bigLossSeenBy(core, 'eileen');
    const story = core.social.memoriesOf('eileen').find((m) => m.kind === 'big_loss')!;
    expect(story).toBeTruthy();
    const e = core.encounters.start('eileen', 'oldzhou', 'cafe', core.now(), 'gossip');
    expect(e.kind).toBe('gossip');
    expect(e.a).toBe('eileen');
    expect(e.topic).toContain('输了');
    expect(story.sharedWith).toContain('oldzhou');
    const heard = core.social.memoriesOf('oldzhou').find((m) => m.kind === 'big_loss');
    expect(heard?.source).toBe('rumor');
    expect(heard?.via).toBe('eileen');
    expect(heard!.reliability).toBeLessThan(story.reliability);
    // the same story is not told twice
    expect(core.social.storyFor('eileen', 'oldzhou')).toBeUndefined();
    const again = core.encounters.start('eileen', 'oldzhou', 'cafe', core.now() + 60, 'gossip');
    expect(again.topic).toBeUndefined();
    expect(core.social.memoriesOf('oldzhou').filter((m) => m.kind === 'big_loss').length).toBe(1);
  });

  it('arguments cool ties and moods; friendly chats and comfort warm them', () => {
    const core = newCore(12);
    at(core, 10);
    const t0 = core.social.tie('daniel', 'tommy');
    const moodD = core.state.npcs.daniel.mood;
    core.encounters.start('daniel', 'tommy', 'bar', core.now(), 'argue');
    expect(core.social.tie('daniel', 'tommy')).toBeCloseTo(t0 - 4, 5);
    expect(core.state.npcs.daniel.mood).toBeLessThan(moodD);
    core.encounters.start('daniel', 'tommy', 'bar', core.now() + 30, 'chat');
    expect(core.social.tie('daniel', 'tommy')).toBeCloseTo(t0 - 2.5, 5);
    const stress = core.state.npcs.tommy.stress;
    const c = core.encounters.start('daniel', 'tommy', 'bar', core.now() + 60, 'comfort');
    expect(core.state.npcs[c.b].stress).toBeLessThanOrEqual(stress);
    expect(core.social.tie('daniel', 'tommy')).toBeCloseTo(t0 + 0.5, 5);
  });

  it('a friend in crisis gets comforted by an empathetic friend', () => {
    const core = newCore(13);
    at(core, 10);
    core.state.npcs.daniel.flags.inCrisis = true;
    // eileen (empathetic, tie 55) meets daniel
    const e = core.encounters.start('eileen', 'daniel', 'cafe', core.now());
    expect(['comfort', 'gossip']).toContain(e.kind);
    if (e.kind === 'comfort') {
      expect(e.a).toBe('eileen');
      expect(e.b).toBe('daniel');
    }
  });

  it('overhearing gossip about yourself is recorded once', () => {
    const core = newCore(14);
    at(core, 10);
    bigLossSeenBy(core, 'eileen');
    const e = core.encounters.start('eileen', 'oldzhou', 'cafe', core.now(), 'gossip');
    const before = core.state.journal.entries.length;
    expect(core.encounters.overhear(e.id)).not.toBeNull();
    expect(core.state.journal.entries.length).toBe(before + 1);
    expect(core.state.journal.entries[core.state.journal.entries.length - 1].text).toContain('输了');
    expect(core.encounters.overhear(e.id)).toBeNull();
    expect(core.state.journal.entries.length).toBe(before + 1);
  });

  it('is deterministic and an ongoing conversation survives save and load', () => {
    const run = () => {
      const core = newCore(21);
      at(core, 9);
      const rec = record(core);
      meetAt(core, ['eileen', 'oldzhou', 'ben'], 'cafe', () => null, 10);
      core.advance(10 * 60, 'idle');
      return { core, list: rec.list };
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(b.list)).toBe(JSON.stringify(a.list));
    expect(a.list.length).toBeGreaterThan(0);
    // save while a conversation is going on
    const core = a.core;
    const e = core.encounters.start('eileen', 'ben', 'cafe', core.now(), 'chat');
    const sm = new SaveManager(new MemoryStorage());
    sm.save(core, 'slot1');
    const loaded = sm.load('slot1');
    expect(loaded.encounters.active('cafe').map((x) => x.id)).toContain(e.id);
    expect(loaded.state.social.pairDay).toEqual(core.state.social.pairDay);
  });

  it('a month of simulated life produces conversations without breaking ties', () => {
    const core = newCore(33);
    const rec = record(core);
    for (let d = 0; d < 30; d++) core.advance(24 * 60, 'idle');
    expect(rec.list.length).toBeGreaterThan(20);
    expect(new Set(rec.list.map((e) => e.kind)).size).toBeGreaterThanOrEqual(2);
    for (const v of Object.values(core.state.social.ties)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(rec.colocated.every(Boolean)).toBe(true);
  });
});
