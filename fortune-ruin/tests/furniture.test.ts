import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import { HOMES } from '../src/data/housing';
import { ITEMS } from '../src/data/items';
import { FURNISHINGS, footprint, furnish, placementError } from '../src/world/furnish';
import { interiorMap } from '../src/world/maps/interiors';
import { reachable } from '../src/world/gates';
import type { MapData } from '../src/world/maps/types';
import { newCore } from './helpers';

const HOME_MAPS = Object.values(HOMES).map((h) => h.location);

/** Every tile where this piece could go in this room. */
function spots(map: MapData, prop: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (!placementError(map, prop, x, y)) out.push({ x, y });
  return out;
}

/** From the door, can you still get next to everything in the room? */
function allUsable(map: MapData): boolean {
  const d = map.doors[0];
  const acc = reachable(map, d.x, d.y - 1);
  return map.interactables.every((it) => {
    for (let x = it.x - 1; x <= it.x + it.w; x++)
      for (let y = it.y - 1; y <= it.y + it.h; y++) {
        const inside = x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h;
        if (!inside && x >= 0 && y >= 0 && x < map.w && y < map.h && acc[y * map.w + x]) return true;
      }
    return false;
  });
}

describe('putting furniture down', () => {
  it('not on walls, things or the doorway, and never so that the door, the bed or anything else is cut off', () => {
    const map = interiorMap('home_basic');
    // a wall, the bed, the door mat
    expect(placementError(map, 'plant', 0, 5)).not.toBeNull();
    const bed = map.props.find((p) => p.id === 'bed_double')!;
    expect(placementError(map, 'plant', bed.x, bed.y)).not.toBeNull();
    const door = map.doors[0];
    expect(placementError(map, 'plant', door.x, door.y)).not.toBeNull();
    expect(placementError(map, 'plant', door.x, door.y - 1)).not.toBeNull();
    // every spot that is allowed leaves the whole room usable
    for (const prop of ['plant', 'sofa', 'piano', 'treadmill', 'tv']) {
      const ok = spots(map, prop);
      expect(ok.length, prop).toBeGreaterThan(0);
      for (const s of ok) {
        const blocked = map.blocked.slice();
        for (const t of footprint(prop, s.x, s.y)) blocked[t.y * map.w + t.x] = 1;
        expect(allUsable({ ...map, blocked }), `${prop} at ${s.x},${s.y}`).toBe(true);
      }
    }
  });

  it('every home has room for each piece it has places for (the shared room for at least a plant)', () => {
    for (const id of HOME_MAPS) {
      const map = interiorMap(id);
      expect(allUsable(map), id).toBe(true);
      expect(spots(map, 'plant').length, id).toBeGreaterThan(0);
      if (id !== 'home_shared') for (const f of Object.values(FURNISHINGS)) expect(spots(map, f.prop).length, `${id} ${f.prop}`).toBeGreaterThan(0);
    }
  });

  it('the luxury bed takes the old bed\'s place where it fits, and the room stays usable either way', () => {
    for (const id of HOME_MAPS) {
      const map = interiorMap(id);
      const room = furnish(map, ['furn_bed_luxury'], []);
      expect(allUsable(room), id).toBe(true);
      expect(room.interactables.filter((it) => it.interact.kind === 'bed').length, id).toBe(map.interactables.filter((it) => it.interact.kind === 'bed').length);
      // the original map is not touched
      expect(interiorMap(id).props.some((p) => p.id === 'bed_luxury')).toBe(map.props.some((p) => p.id === 'bed_luxury'));
    }
    expect(furnish(interiorMap('home_basic'), ['furn_bed_luxury'], []).props.some((p) => p.id === 'bed_luxury')).toBe(true);
  });

  it('a bought piece is put down at home, stands in the room, can be used, moved and taken up again', () => {
    const c = newCore();
    c.economy.receive('bank', G(20000), 'other', 'test');
    expect(c.inventory.buy('furniture', 'furn_tv', 'card').ok).toBe(true);
    expect(c.housing.unplaced()).toEqual(['furn_tv']);
    const map = c.housing.room();
    const at = spots(map, 'tv')[0];
    expect(c.housing.place('furn_tv', at.x, at.y).ok).toBe(true);
    expect(c.housing.unplaced()).toEqual([]);
    let room = c.housing.room();
    expect(room.props.some((p) => p.id === 'tv' && p.x === at.x && p.y === at.y)).toBe(true);
    for (const t of footprint('tv', at.x, at.y)) expect(room.blocked[t.y * room.w + t.x]).toBe(1);
    expect(room.interactables.some((it) => it.interact.kind === 'tv' && it.interact.label === '大屏电视')).toBe(true);
    // moving it: its own old place does not count against it
    const next = spots(c.housing.room(), 'tv').find((s) => s.x !== at.x || s.y !== at.y)!;
    expect(c.housing.place('furn_tv', next.x, next.y).ok).toBe(true);
    expect(c.housing.placed()).toEqual([{ item: 'furn_tv', x: next.x, y: next.y }]);
    // somewhere taken is refused, and nothing changes
    expect(c.housing.place('furn_tv', 0, 0).ok).toBe(false);
    expect(c.housing.placed()).toEqual([{ item: 'furn_tv', x: next.x, y: next.y }]);
    c.housing.pickUp('furn_tv');
    room = c.housing.room();
    expect(room.props.some((p) => p.id === 'tv' && p.x === next.x)).toBe(false);
    expect(c.housing.unplaced()).toEqual(['furn_tv']);
    // something you do not have cannot be put down
    expect(c.housing.place('furn_piano', next.x, next.y).ok).toBe(false);
  });

  it('the treadmill works whatever the weather', () => {
    const c = newCore();
    c.weather.force = 'rain';
    expect(c.player.leisure('treadmill').ok).toBe(true);
    expect(c.player.leisure('exercise').ok).toBe(false);
  });
});

describe('moving house with your furniture', () => {
  it('the furniture comes along; what does not fit goes into storage and comes back when there is room', () => {
    const c = newCore();
    c.economy.receive('bank', G(5_000_000), 'other', 'test');
    c.state.player.creditScore = 800;
    for (const id of ['furn_sofa', 'furn_tv', 'furn_plants']) expect(c.inventory.buy('furniture', id, 'card').ok, id).toBe(true);
    const at = spots(c.housing.room(), 'plant')[0];
    c.housing.place('furn_plants', at.x, at.y);
    // down to the shared room: one place for furniture
    c.housing.evict();
    expect(c.state.housing.homeId).toBe('home_shared');
    expect(c.housing.furniture()).toEqual(['furn_sofa']);
    expect(c.housing.stored().sort()).toEqual(['furn_plants', 'furn_tv']);
    // the old layout went with the old home
    expect(c.housing.placed()).toEqual([]);
    // buying a second of something in storage is refused
    expect(c.inventory.buy('furniture', 'furn_tv', 'card').ok).toBe(false);
    // up to a bigger place: everything is back in the home
    const r = c.housing.buy('home_river', false);
    expect(r.ok, r.ok ? '' : r.error).toBe(true);
    expect(c.housing.furniture().sort()).toEqual(['furn_plants', 'furn_sofa', 'furn_tv']);
    expect(c.housing.stored()).toEqual([]);
    expect(c.housing.unplaced().sort()).toEqual(['furn_plants', 'furn_sofa', 'furn_tv']);
    // into storage and out again by hand
    expect(c.housing.toStorage('furn_tv').ok).toBe(true);
    expect(c.housing.furniture()).not.toContain('furn_tv');
    expect(c.housing.fromStorage('furn_tv').ok).toBe(true);
    expect(c.housing.furniture()).toContain('furn_tv');
  });

  it('old saves get empty placements and storage, and every furniture item is something the shop sells', async () => {
    const { migrate } = await import('../src/systems/SaveManager');
    const c = newCore();
    const st = JSON.parse(JSON.stringify(c.state));
    delete st.housing.placed;
    delete st.housing.storage;
    const m = migrate(st);
    expect(m.housing.placed).toEqual({});
    expect(m.housing.storage).toEqual([]);
    for (const id of Object.keys(FURNISHINGS)) expect(ITEMS[id]?.kind, id).toBe('furniture');
  });
});
