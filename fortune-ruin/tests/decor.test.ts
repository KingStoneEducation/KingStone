import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { GameCore as Core } from '../src/core/GameCore';
import { MINUTES_PER_DAY } from '../src/core/calendar';
import { G } from '../src/core/money';
import { HOMES } from '../src/data/housing';
import { TILE_INDEX } from '../src/art/tiles';
import { PROPS } from '../src/art/props';
import { deserialize, serialize } from '../src/systems/SaveManager';
import { CREW_FEE, FLOOR_CHOICES, WALL_CHOICES, decorArea, decorPrestige, decorate, mainFloor, mainWall } from '../src/world/decor';
import { facings, footprint, placementError, propFor } from '../src/world/furnish';
import { interiorMap } from '../src/world/maps/interiors';
import { reachable } from '../src/world/gates';
import { newCore } from './helpers';

/** The first spot in the room where this piece fits facing this way. */
function spotFor(c: GameCore, item: string, facing: 'down' | 'left' | 'right'): { x: number; y: number } | null {
  const room = c.housing.room();
  for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) if (!c.housing.placeError(item, x, y, facing)) return { x, y };
  return null;
}

/** The player owns the home they live in. */
function owner(seed: number): GameCore {
  const c = newCore(seed);
  c.state.housing.owned.push(c.state.housing.homeId);
  c.state.housing.tenure = 'own';
  c.economy.receive('bank', G(100000), 'gift_received', '测试用资金', 'test');
  return c;
}

const nextDay = (c: GameCore) => {
  c.state.time.minutes += MINUTES_PER_DAY;
  c.housing.settleDecor();
};

describe('turning furniture', () => {
  it('the sofa, the TV, the piano and the treadmill can face left or right (drawn side-on, mirrored for right); a pot plant cannot', () => {
    for (const item of ['furn_sofa', 'furn_tv', 'furn_piano', 'furn_treadmill']) {
      expect(facings(item)).toEqual(['down', 'left', 'right']);
      const down = PROPS[propFor(item, 'down').prop];
      const left = propFor(item, 'left');
      const right = propFor(item, 'right');
      expect(left.prop).toBe(right.prop);
      expect([left.flipX, right.flipX]).toEqual([false, true]);
      // turned a quarter, a long piece takes its length the other way (the treadmill, a tile in front view, is two long from the side)
      const side = PROPS[left.prop];
      if (item === 'furn_treadmill') expect([side.foot.w, side.foot.h]).toEqual([2, 1]);
      else expect([side.foot.w, side.foot.h]).toEqual([down.foot.h, down.foot.w]);
    }
    expect(facings('furn_plants')).toEqual(['down']);
    const c = newCore(1);
    c.inventory.buy('furniture', 'furn_plants', 'card');
    const at = spotFor(c, 'furn_plants', 'down')!;
    expect(c.housing.placeError('furn_plants', at.x, at.y, 'left')).toBe('这件家具不能这样摆');
  });

  it('a turned sofa stands along the wall the way it was put, takes those tiles, and stays turned after a reload', () => {
    const c = newCore(2);
    c.economy.receive('bank', G(20000), 'gift_received', '测试用资金', 'test');
    expect(c.inventory.buy('furniture', 'furn_sofa', 'card').ok).toBe(true);
    const at = spotFor(c, 'furn_sofa', 'right')!;
    expect(at).not.toBeNull();
    expect(c.housing.place('furn_sofa', at.x, at.y, 'right').ok).toBe(true);
    const room = c.housing.room();
    const prop = room.props.find((p) => p.id === 'sofa_side')!;
    expect(prop).toMatchObject({ x: at.x, y: at.y, flipX: true });
    for (const t of footprint('sofa_side', at.x, at.y)) expect(room.blocked[t.y * room.w + t.x]).toBe(1);
    // (the flat's own sofa is still there; the new one is the turned one)
    expect(room.props.filter((p) => p.id === 'sofa').length).toBe(interiorMap(c.housing.current().location).props.filter((p) => p.id === 'sofa').length);
    const loaded = new Core(deserialize(serialize(c, 'slot1')));
    expect(loaded.housing.placed()).toEqual([{ item: 'furn_sofa', x: at.x, y: at.y, facing: 'right' }]);
    expect(loaded.housing.room().props.find((p) => p.id === 'sofa_side')).toMatchObject({ flipX: true });
  });

  it('the turned TV can still be watched, and placing it turned obeys the same rules (no walls, no blocking the way)', () => {
    const c = newCore(3);
    c.economy.receive('bank', G(20000), 'gift_received', '测试用资金', 'test');
    c.inventory.buy('furniture', 'furn_tv', 'card');
    const room = c.housing.room();
    expect(placementError(room, 'tv_side', 0, 3)).not.toBeNull();
    const at = spotFor(c, 'furn_tv', 'left')!;
    c.housing.place('furn_tv', at.x, at.y, 'left');
    const tv = c.housing.room().interactables.find((i) => i.id === `furn_tv@${at.x},${at.y}`)!;
    expect(tv).toMatchObject({ x: at.x, w: 1, h: 2 });
  });
});

describe('redecorating', () => {
  it('only a home you own; a tenant is told so', () => {
    const c = newCore(4);
    expect(c.housing.decorError({ floor: 'parquet' })).toContain('买下的房子');
    expect(c.housing.redecorate({ floor: 'parquet' }).ok).toBe(false);
  });

  it('priced by the tile plus the crew; paid now, done the next day; the kitchen and bathroom keep their tiles', () => {
    const c = owner(5);
    const base = interiorMap(c.housing.current().location);
    const area = decorArea(base);
    expect(area.floor).toBeGreaterThan(10);
    expect(area.wall).toBeGreaterThan(10);
    const parquet = FLOOR_CHOICES.find((x) => x.id === 'parquet')!;
    const navy = WALL_CHOICES.find((x) => x.id === 'navy')!;
    const quote = c.housing.decorQuote({ floor: 'parquet', wall: 'navy' });
    expect(quote).toBe(CREW_FEE + parquet.perTile * area.floor + navy.perTile * area.wall);
    const bank = c.economy.balance('bank') + c.economy.balance('cash');
    const prestige = c.housing.prestige();
    expect(c.housing.redecorate({ floor: 'parquet', wall: 'navy' }).ok).toBe(true);
    expect(bank - (c.economy.balance('bank') + c.economy.balance('cash'))).toBe(quote);
    expect(c.economy.checkConservation().ok).toBe(true);
    // the crew comes tomorrow: nothing has changed yet, and a second job has to wait
    expect(c.housing.bareRoom().ground).toEqual(base.ground);
    expect(c.housing.redecorate({ floor: 'marble' }).ok).toBe(false);
    nextDay(c);
    const after = c.housing.bareRoom();
    const floor = mainFloor(base)!;
    const wall = mainWall(base)!;
    for (let i = 0; i < base.ground.length; i++) {
      if (base.ground[i] === floor) expect(after.ground[i]).toBe(TILE_INDEX.parquet);
      else if (base.ground[i] === TILE_INDEX[`wall_${wall}_lower`]) expect(after.ground[i]).toBe(TILE_INDEX.wall_navy_lower);
      else if (!String(Object.keys(TILE_INDEX).find((k) => TILE_INDEX[k] === base.ground[i])).startsWith('wall_')) expect(after.ground[i]).toBe(base.ground[i]);
    }
    expect(after.blocked).toEqual(base.blocked);
    expect(c.housing.prestige()).toBeCloseTo(Math.min(6, prestige + decorPrestige({ floor: 'parquet', wall: 'navy' })), 5);
    expect(c.state.journal.entries.some((e) => e.text.includes('装修好了'))).toBe(true);
    // asking for what is already there costs nothing and does nothing
    expect(c.housing.decorError({ floor: 'parquet' })).toBe('没有要改的地方');
  });

  it('the finish stays with the home; selling it leaves it to the new owners', () => {
    const c = owner(6);
    c.housing.redecorate({ floor: 'marble' });
    nextDay(c);
    const home = c.state.housing.homeId;
    expect(c.housing.decor(home)).toEqual({ floor: 'marble', wall: undefined });
    const loaded = new Core(deserialize(serialize(c, 'slot1')));
    expect(loaded.housing.decor(home)).toEqual({ floor: 'marble', wall: undefined });
    // living somewhere else now, the redecorated flat is sold
    c.state.housing.homeId = 'home_shared';
    expect(c.housing.sell(home).ok).toBe(true);
    expect(c.housing.decor(home)).toBeUndefined();
  });

  it('any home with any floor and walls: every tile is a real tile, nothing new is in the way', () => {
    for (const h of Object.values(HOMES)) {
      const base = interiorMap(h.location);
      for (const f of FLOOR_CHOICES)
        for (const w of [WALL_CHOICES[0], WALL_CHOICES.at(-1)!]) {
          const m = decorate(base, { floor: f.id, wall: w.id });
          expect(m.blocked).toEqual(base.blocked);
          expect(m.ground.every((t) => t >= 0)).toBe(true);
          const d = m.doors[0];
          expect(reachable(m, d.x, d.y - 1).some((x) => x)).toBe(true);
        }
    }
  });
});
