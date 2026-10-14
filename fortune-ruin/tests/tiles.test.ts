import { describe, expect, it } from 'vitest';
import { buildCityMap } from '../src/world/maps/city';
import { allInteriorIds, interiorMap } from '../src/world/maps/interiors';
import { TILE_INDEX, displayTile } from '../src/art/tiles';
import { isWallTile } from '../src/world/shading';
import type { MapData } from '../src/world/maps/types';

const MAPS: MapData[] = [buildCityMap(), ...allInteriorIds().map((id) => interiorMap(id))];
const NAME = Object.fromEntries(Object.entries(TILE_INDEX).map(([n, i]) => [i, n]));

describe('floor variants', () => {
  it('every tile shown on every map exists, and only floors get variants', () => {
    let varied = 0;
    for (const m of MAPS) {
      for (let i = 0; i < m.ground.length; i++) {
        const base = m.ground[i];
        const shown = displayTile(base, i % m.w, Math.floor(i / m.w));
        expect(NAME[shown], `${m.id} tile ${i}`).toBeDefined();
        if (shown !== base) {
          varied++;
          // a variant is always drawn from the same base tile
          expect(NAME[shown].split('~')[0]).toBe(NAME[base]);
          expect(isWallTile(base)).toBe(false);
        }
      }
    }
    expect(varied).toBeGreaterThan(500);
  });

  it('is the same every time a map is drawn', () => {
    const m = MAPS[0];
    const a = m.ground.map((t, i) => displayTile(t, i % m.w, Math.floor(i / m.w)));
    const b = m.ground.map((t, i) => displayTile(t, i % m.w, Math.floor(i / m.w)));
    expect(a).toEqual(b);
  });

  it('lays marble in whole 2 × 2 slabs', () => {
    const marble = TILE_INDEX.marble;
    for (let sy = 0; sy < 6; sy += 2) {
      for (let sx = 0; sx < 6; sx += 2) {
        const parts = [
          [sx, sy],
          [sx + 1, sy],
          [sx, sy + 1],
          [sx + 1, sy + 1],
        ].map(([x, y]) => NAME[displayTile(marble, x, y)]);
        const design = parts.map((n) => n.slice(-2, -1));
        expect(new Set(design).size).toBe(1);
        expect(parts.map((n) => n.slice(-1))).toEqual(['0', '1', '2', '3']);
      }
    }
  });
});
