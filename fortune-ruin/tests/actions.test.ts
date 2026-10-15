import { describe, expect, it } from 'vitest';
import { FX } from '../src/art/fx';
import { MEAL_BASIC } from '../src/systems/InventorySystem';
import { MINUTES_PER_DAY, hm } from '../src/core/calendar';
import { ITEMS } from '../src/data/items';
import { newCore } from './helpers';

/** A stand-in 2D context that records which pixels get painted, and whether any fall outside the box. */
function fakeCtx(w: number, h: number) {
  const px = new Set<number>();
  let outside = 0;
  const ctx = {
    fillStyle: '#000',
    fillRect(x: number, y: number, rw: number, rh: number) {
      for (let j = y; j < y + rh; j++)
        for (let i = x; i < x + rw; i++) {
          if (i < 0 || j < 0 || i >= w || j >= h) outside++;
          else px.add(j * w + i);
        }
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, px, outside: () => outside };
}

describe('the little things in the world', () => {
  it('every effect is drawn inside its own box, and is more than a dot', () => {
    for (const [name, d] of Object.entries(FX)) {
      const f = fakeCtx(d.w, d.h);
      d.draw(f.ctx);
      expect(f.outside(), name).toBe(0);
      expect(f.px.size, name).toBeGreaterThan(Math.min(8, (d.w * d.h) / 3));
    }
  });
});

describe('what the animations are told', () => {
  it('a night slept in steps (so the clock can run on screen) ends exactly as one slept at once', () => {
    const a = newCore(77);
    const b = newCore(77);
    for (const c of [a, b]) {
      c.state.time.minutes = 2 * MINUTES_PER_DAY + hm(23);
      c.state.player.stats.sleep = 30;
    }
    a.sleep(8);
    const steps = b.sleepSteps(8, 12);
    let n = 0;
    for (let r = steps.next(); !r.done; r = steps.next()) n++;
    expect(n).toBe(11);
    // (the two games were created a few milliseconds apart; nothing else may differ)
    const same = (c: typeof a) => JSON.stringify({ ...c.state, meta: { ...c.state.meta, createdReal: 0 } });
    expect(same(b)).toBe(same(a));
  });

  it('a shift worked in steps (the clock running on screen) ends exactly as one worked straight through', () => {
    const a = newCore(9);
    const b = newCore(9);
    for (const c of [a, b]) {
      c.setLocation('office', 5, 5);
      c.advance(60, 'idle');
    }
    const r1 = a.career.workShift('office_clerk');
    const steps = b.career.shiftSteps('office_clerk', undefined, 12);
    let r = steps.next();
    let n = 0;
    while (!r.done) {
      n++;
      r = steps.next();
    }
    expect(n).toBe(11);
    expect(r1.ok).toBe(true);
    expect(r.value).toEqual(r1);
    const same = (c: typeof a) => JSON.stringify({ ...c.state, meta: { ...c.state.meta, createdReal: 0 } });
    expect(same(b)).toBe(same(a));
  });

  it('a lounger, a swim and a day at sea in steps end exactly as they would in one go', () => {
    const run = (g: Generator<number, unknown, void>) => {
      let n = 0;
      for (let r = g.next(); !r.done; r = g.next()) n++;
      return n;
    };
    const same = (c: ReturnType<typeof newCore>) => JSON.stringify({ ...c.state, meta: { ...c.state.meta, createdReal: 0 } });
    const pair = (h: number, m: number) => {
      const a = newCore(31);
      const b = newCore(31);
      for (const c of [a, b]) {
        c.state.world.location = 'isle';
        c.state.time.minutes = MINUTES_PER_DAY + hm(h, m);
        c.state.player.stats.energy = 90;
        c.state.player.stats.sleep = 90;
      }
      return [a, b] as const;
    };
    {
      const [a, b] = pair(11, 0);
      expect(a.isle.rentLounger().ok).toBe(true);
      expect(run(b.isle.loungerSteps(12))).toBe(11);
      expect(same(b)).toBe(same(a));
      expect(a.isle.swim().ok).toBe(true);
      run(b.isle.swimSteps(12));
      expect(same(b)).toBe(same(a));
    }
    {
      const [a, b] = pair(5, 0);
      expect(a.isle.goFishing().ok).toBe(true);
      expect(run(b.isle.fishingSteps(12))).toBe(11);
      expect(same(b)).toBe(same(a));
    }
  });

  it('a day on the docks and a turn at the soup kitchen in steps end exactly as they would in one go', () => {
    const run = (g: Generator<number, unknown, void>) => {
      let n = 0;
      for (let r = g.next(); !r.done; r = g.next()) n++;
      return n;
    };
    const same = (c: ReturnType<typeof newCore>) => JSON.stringify({ ...c.state, meta: { ...c.state.meta, createdReal: 0 } });
    const pair = (loc: string, h: number, m: number) => {
      const a = newCore(32);
      const b = newCore(32);
      for (const c of [a, b]) {
        c.state.world.location = loc;
        c.state.time.minutes = MINUTES_PER_DAY + hm(h, m);
        c.state.player.stats.energy = 90;
        c.state.player.stats.sleep = 90;
      }
      return [a, b] as const;
    };
    {
      const [a, b] = pair('city', 6, 0);
      expect(a.oldtown.doLabor().ok).toBe(true);
      expect(run(b.oldtown.laborSteps(12))).toBe(11);
      expect(same(b)).toBe(same(a));
    }
    {
      const [a, b] = pair('community_kitchen', 11, 30);
      expect(a.oldtown.volunteer().ok).toBe(true);
      expect(run(b.oldtown.volunteerSteps(12))).toBe(11);
      expect(same(b)).toBe(same(a));
    }
    // refused before any time passes
    const c = newCore(32);
    const t0 = c.now();
    expect(c.oldtown.volunteerSteps(12).next().done).toBe(true);
    expect(c.business.workShiftSteps(12).next().done).toBe(true);
    expect(c.now()).toBe(t0);
  });

  it('a shift that cannot start refuses before any time passes', () => {
    const c = newCore(9);
    const t0 = c.now();
    const r = c.career.shiftSteps('office_clerk', undefined, 12).next();
    expect(r.done).toBe(true);
    expect(c.now()).toBe(t0);
  });

  it('cooking, reading and a snack from the fridge say what was used; ordering at a counter says what was bought', () => {
    const c = newCore();
    const used: string[] = [];
    const bought: string[] = [];
    c.bus.on('used', (e) => used.push(e.itemId));
    c.bus.on('purchase', (e) => bought.push(e.itemId));
    // at home: a meal from the groceries, and a book off the shelf
    expect(c.isAtHome()).toBe(true);
    c.inventory.give(ITEMS.groceries_basic, 1);
    expect(c.inventory.use(MEAL_BASIC).ok).toBe(true);
    const book = Object.values(ITEMS).find((d) => d.kind === 'book')!;
    c.inventory.give(book, 1);
    expect(c.inventory.use(book.id).ok).toBe(true);
    expect(used).toEqual([MEAL_BASIC, book.id]);
    // a coffee at the café counter, drunk there and then
    c.state.world.location = 'cafe';
    c.state.time.minutes = MINUTES_PER_DAY + hm(10);
    const r = c.inventory.order('cafe', 'latte', 'cash');
    expect(r.ok).toBe(true);
    expect(bought).toEqual(['latte']);
  });
});
