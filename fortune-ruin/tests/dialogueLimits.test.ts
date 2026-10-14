import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { MINUTES_PER_DAY } from '../src/core/calendar';
import { newCore, skip } from './helpers';

/** Day 3 at the given hour, everyone where their schedule says. */
function at(core: GameCore, hour: number): void {
  core.state.time.minutes = 3 * MINUTES_PER_DAY + hour * 60;
  core.npcs.settle(core.now());
}

describe('talking to NPCs', () => {
  it('the NPC stays for the whole conversation, even when chatting makes time pass', () => {
    const core = newCore(41);
    at(core, 9);
    // Eileen is at the café now; pin her there briefly so that her schedule would take her away mid-talk
    core.npcs.setOverrideAt('eileen', core.now(), 20, 'cafe', null, 'leisure', 'test');
    core.npcs.settle(core.now());
    expect(core.state.npcs.eileen.location).toBe('cafe');
    core.dialogue.start('eileen');
    for (let i = 0; i < 4; i++) core.dialogue.choose('chat'); // 10 minutes each
    core.dialogue.choose('hangout'); // 45 minutes (needs familiarity; harmless if hidden)
    core.advance(30, 'talking');
    expect(core.state.npcs.eileen.location).toBe('cafe');
    expect(core.state.npcs.eileen.travel).toBeNull();
    core.dialogue.end();
    // a short grace period, then life goes on
    core.advance(10, 'idle');
    expect(core.state.npcs.eileen.location).toBe('cafe');
    skip(core, 3 * 60);
    expect(core.state.npcs.eileen.flags.talkHold).toBe(false);
  });

  it('someone stopped in the street pauses their walk instead of finishing it during the talk', () => {
    const core = newCore(42);
    at(core, 10);
    core.npcs.setOverrideAt('tommy', core.now(), 120, 'bar', null, 'drink', 'test');
    core.advance(1, 'idle');
    const rt = core.state.npcs.tommy;
    expect(rt.travel).not.toBeNull();
    const left = rt.travel!.arrive - core.now();
    core.dialogue.start('tommy');
    core.advance(40, 'talking');
    expect(rt.travel).not.toBeNull();
    expect(rt.travel!.arrive - core.now()).toBe(left);
    core.dialogue.end();
  });

  it('only someone who dislikes the player sometimes refuses to talk', () => {
    const tries = (affection: number) => {
      let refused = 0;
      for (let seed = 0; seed < 60; seed++) {
        const core = newCore(900 + seed);
        const r = core.social.rel('marco');
        r.met = true;
        r.affection = affection;
        if (core.dialogue.refusal('marco')) refused++;
      }
      return refused;
    };
    expect(tries(30)).toBe(0);
    expect(tries(-10)).toBe(0);
    const hostile = tries(-70);
    expect(hostile).toBeGreaterThan(5);
    expect(hostile).toBeLessThan(40); // a chance, not a wall
  });

  it('cannot farm affection: repeated small talk wears off and has a ceiling', () => {
    const core = newCore(43);
    at(core, 9);
    const r = core.social.rel('eileen');
    r.met = true;
    r.familiarity = 40;
    const before = r.affection;
    // spam "how are you?" twenty times in one sitting
    core.dialogue.start('eileen');
    for (let i = 0; i < 20; i++) core.dialogue.choose('ask');
    core.dialogue.end();
    const gainSpam = r.affection - before;
    expect(gainSpam).toBeLessThan(6);
    // a month of daily chatting leaves her fond of the player, not devoted
    for (let d = 0; d < 30; d++) {
      core.dialogue.start('eileen');
      for (let i = 0; i < 6; i++) core.dialogue.choose('chat');
      core.dialogue.choose('ask');
      core.dialogue.choose('hangout');
      core.dialogue.end();
      skip(core, MINUTES_PER_DAY - 120);
    }
    expect(r.affection).toBeLessThan(80);
  });

  it('a second gift on the same day is politely declined and the item kept', () => {
    const core = newCore(44);
    at(core, 9);
    core.inventory.add('flowers', 2);
    core.dialogue.start('eileen');
    core.dialogue.choose('give:flowers');
    const after1 = core.social.rel('eileen').affection;
    const v = core.dialogue.choose('give:flowers');
    core.dialogue.end();
    expect(core.inventory.count('flowers')).toBe(1);
    expect(core.social.rel('eileen').affection).toBe(after1);
    expect(v.lines.join('')).toMatch(/不用|留着/);
  });
});
