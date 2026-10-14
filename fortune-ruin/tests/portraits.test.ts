import { describe, expect, it } from 'vitest';
import { EXPRESSIONS, PORTRAIT_H, PORTRAIT_W, portraitPixels } from '../src/art/portraits';
import { FACES, faceFor, playerFace } from '../src/data/faces';
import { NPCS, NPC_BY_ID } from '../src/data/npcs';
import { lookFor } from '../src/world/looks';
import { moodFrom } from '../src/systems/DialogueEngine';
import type { Appearance } from '../src/core/state';
import { MINUTES_PER_DAY } from '../src/core/calendar';
import { newCore } from './helpers';

const filled = (px: (string | null)[], x0: number, y0: number, x1: number, y1: number) => {
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (px[y * PORTRAIT_W + x]) n++;
  return n;
};
const region = (px: (string | null)[], x0: number, y0: number, x1: number, y1: number) => {
  const out: (string | null)[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(px[y * PORTRAIT_W + x]);
  return out.join(',');
};

describe('portraits', () => {
  it('every named character has a face of their own', () => {
    for (const n of NPCS) expect(FACES[n.id], n.id).toBeDefined();
    const keys = new Set(NPCS.map((n) => JSON.stringify(FACES[n.id])));
    expect(keys.size).toBe(NPCS.length);
  });

  it('draws every character in every expression: a head, a neck and shoulders, nothing outside the frame', () => {
    for (const n of NPCS) {
      for (const expr of EXPRESSIONS) {
        const px = portraitPixels(n.look, faceFor(n.id, n.look), { expr });
        expect(px.length).toBe(PORTRAIT_W * PORTRAIT_H);
        // face area around the eyes and mouth is solid
        expect(filled(px, 24, 26, 39, 40), `${n.id}/${expr} face`).toBe(16 * 15);
        // the torso fills the bottom rows across the chest
        expect(filled(px, 12, 70, 51, 79), `${n.id}/${expr} body`).toBe(40 * 10);
        // the corners stay transparent without a backdrop
        expect(px[0]).toBeNull();
        expect(px[PORTRAIT_W - 1]).toBeNull();
      }
    }
  });

  it('expressions, blinking and talking change the face and nothing else', () => {
    const n = NPC_BY_ID.eileen;
    const face = faceFor('eileen', n.look);
    const base = portraitPixels(n.look, face, { expr: 'neutral' });
    const mouth = (px: (string | null)[]) => region(px, 24, 38, 39, 44);
    const eyes = (px: (string | null)[]) => region(px, 20, 24, 43, 34);
    const body = (px: (string | null)[]) => region(px, 0, 50, 63, 79);
    for (const expr of EXPRESSIONS.filter((e) => e !== 'neutral')) {
      const px = portraitPixels(n.look, face, { expr });
      expect(mouth(px) !== mouth(base) || eyes(px) !== eyes(base), expr).toBe(true);
      expect(body(px), expr).toBe(body(base));
    }
    const blink = portraitPixels(n.look, face, { expr: 'neutral', blink: true });
    expect(eyes(blink)).not.toBe(eyes(base));
    expect(mouth(blink)).toBe(mouth(base));
    const talk = portraitPixels(n.look, face, { expr: 'neutral', talk: true });
    expect(mouth(talk)).not.toBe(mouth(base));
    expect(eyes(talk)).toBe(eyes(base));
  });

  it('is deterministic and fills the backdrop when asked', () => {
    const n = NPC_BY_ID.victor;
    const a = portraitPixels(n.look, faceFor('victor', n.look), { bg: '#6a2a3a' });
    const b = portraitPixels(n.look, faceFor('victor', n.look), { bg: '#6a2a3a' });
    expect(a).toEqual(b);
    expect(a.every((c) => !!c)).toBe(true);
  });

  it('player portraits follow every hairstyle, hat and accessory the creator offers', () => {
    const seen = new Set<string>();
    for (let hair = 0; hair < 12; hair++) {
      for (const body of ['m', 'f'] as const) {
        const app: Appearance = { skin: hair % 6, hairStyle: hair, hairColor: hair, pronoun: body === 'f' ? 'she' : 'he', body, eyes: hair % 4, eyeColor: hair % 6 };
        const look = lookFor(app, 'outfit_casual');
        const px = portraitPixels(look, playerFace(app, look));
        seen.add(region(px, 0, 0, 63, 40));
      }
    }
    // 24 different heads
    expect(seen.size).toBe(24);
    const app: Appearance = { skin: 1, hairStyle: 2, hairColor: 1, pronoun: 'he', body: 'm' };
    const plain = portraitPixels(lookFor(app, 'outfit_hoodie'), playerFace(app, lookFor(app, 'outfit_hoodie')));
    for (const extra of [{ hat: 'beanie' }, { hat: 'cap' }, { glasses: true }, { earrings: true }, { beard: true }] as Partial<Appearance>[]) {
      const a2 = { ...app, ...extra };
      const look = lookFor(a2, 'outfit_hoodie');
      const px = portraitPixels(look, playerFace(a2, look));
      expect(region(px, 0, 0, 63, 49), JSON.stringify(extra)).not.toBe(region(plain, 0, 0, 63, 49));
    }
  });
});

describe('faces in conversation', () => {
  it('reads reactions from the change in disposition', () => {
    expect(moodFrom(4, 10, 0.2)).toBe('grin');
    expect(moodFrom(1, 10, 0.2)).toBe('smile');
    expect(moodFrom(-4, 10, 0.8)).toBe('angry');
    expect(moodFrom(-4, 10, 0.2)).toBe('sad');
    expect(moodFrom(-1, 10, 0.2)).toBe('frown');
    expect(moodFrom(0, 10, 0.2)).toBeUndefined();
    expect(moodFrom(0, -30, 0.8)).toBe('angry');
  });

  it('a present they love shows on their face; bad news they heard makes them look worried', () => {
    const core = newCore(7);
    core.state.time.minutes = 3 * MINUTES_PER_DAY + 9 * 60;
    core.npcs.settle(core.now());
    core.state.world.location = core.state.npcs.eileen.location ?? 'cafe';
    core.state.npcs.eileen.location = core.state.world.location;
    core.inventory.add('flowers');
    core.dialogue.start('eileen');
    const v = core.dialogue.choose('give:flowers');
    expect(['smile', 'grin']).toContain(v.mood);
    core.dialogue.end();

    // a big loss she has heard about comes up when she sees you next
    core.state.time.minutes += 2 * MINUTES_PER_DAY;
    core.social.applyDirect('eileen', { kind: 'big_loss', facets: { recklessness: 0.6 }, importance: 40, data: { amount: 2000000, game: '21 点' } }, { source: 'rumor', silent: true });
    core.state.npcs.eileen.location = core.state.world.location;
    const first = core.dialogue.start('eileen');
    expect(first.options.some((o) => o.id === 'resp_honest')).toBe(true);
    expect(first.mood).toBe('worried');
    core.dialogue.end();
  });
});
