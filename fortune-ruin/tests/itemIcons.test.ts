import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/data/items';
import { ICON, drawItemIcon, hasOwnIcon } from '../src/art/itemIcons';
import { COMP_STORE } from '../src/systems/SkyFloorSystem';

/** A stand-in 2D context that records which pixels get painted, and in how many colours. */
function fakeCtx() {
  const px = new Map<number, string>();
  let fill = '#000';
  let outside = 0;
  const ctx = {
    set fillStyle(v: string) {
      fill = v;
    },
    get fillStyle() {
      return fill;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      for (let j = y; j < y + h; j++)
        for (let i = x; i < x + w; i++) {
          if (i < 0 || j < 0 || i >= ICON || j >= ICON) outside++;
          else px.set(j * ICON + i, fill);
        }
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, px, outside: () => outside };
}

describe('item pictures', () => {
  it('every item has a drawing of its own (outfits show the character wearing them instead)', () => {
    for (const [id, d] of Object.entries(ITEMS)) {
      if (d.kind === 'outfit') continue;
      expect(hasOwnIcon(id), id).toBe(true);
    }
  });

  it('each picture fills a reasonable part of its 16 × 16 square, in several colours, without spilling out', () => {
    const ids = [...Object.keys(ITEMS).filter((id) => ITEMS[id].kind !== 'outfit'), ...COMP_STORE.map((c) => c.id)];
    const seen = new Set<string>();
    for (const id of ids) {
      const f = fakeCtx();
      drawItemIcon(f.ctx, id);
      expect(f.px.size, `${id} painted pixels`).toBeGreaterThan(40);
      expect(new Set(f.px.values()).size, `${id} colours`).toBeGreaterThanOrEqual(3);
      expect(f.outside(), `${id} outside the square`).toBe(0);
      seen.add([...f.px.entries()].sort((a, b) => a[0] - b[0]).join(';'));
    }
    // no two items share the same picture
    expect(seen.size).toBe(new Set(ids).size);
  });
});
