import { PROPS } from '../art/props';
import { reachable } from './gates';
import type { Interaction, MapData, PlacedProp } from './maps/types';

type Pt = { x: number; y: number };

/** A piece of furniture the player has put down somewhere in their home (tile of its anchor, as MapBuilder.prop takes it). */
export interface Placement {
  item: string;
  x: number;
  y: number;
}

/**
 * The furniture that stands on the floor, the prop it is drawn as, and what you can do with it.
 * (The memory-foam mattress goes on the bed, the luxury bed takes the old bed's place and the
 * painting hangs on the wall by itself; see furnish.)
 */
export const FURNISHINGS: Record<string, { prop: string; interact?: Interaction }> = {
  furn_sofa: { prop: 'sofa' },
  furn_tv: { prop: 'tv', interact: { kind: 'tv', label: '大屏电视' } },
  furn_plants: { prop: 'plant' },
  furn_treadmill: { prop: 'treadmill', interact: { kind: 'treadmill', label: '跑步机' } },
  furn_piano: { prop: 'piano', interact: { kind: 'piano', label: '立式钢琴' } },
};

/** The tiles a prop covers when anchored at (x, y): from the anchor, rightwards and upwards. */
export function footprint(prop: string, x: number, y: number): Pt[] {
  const d = PROPS[prop];
  const out: Pt[] = [];
  for (let j = 0; j < Math.max(1, d.foot.h); j++) for (let i = 0; i < Math.max(1, d.foot.w); i++) out.push({ x: x + i, y: y - j });
  return out;
}

/** Tiles of the room that must stay free: the door mats and the tiles in front of them, and where you wake up. */
function keepClear(map: MapData): Set<number> {
  const keep = new Set<number>();
  for (const d of map.doors) {
    for (let i = 0; i < d.w; i++) {
      keep.add(d.y * map.w + d.x + i);
      keep.add((d.y - 1) * map.w + d.x + i);
    }
  }
  for (const s of Object.values(map.spawns)) keep.add(s.y * map.w + s.x);
  // where the people who live or work here stand
  for (const s of map.staff) keep.add(s.y * map.w + s.x);
  for (const s of Object.values(map.spots)) keep.add(s.y * map.w + s.x);
  return keep;
}

/** The tiles you can stand on to use each thing in the room (next to it). */
function useTiles(map: MapData): Pt[][] {
  return map.interactables.map((it) => {
    const out: Pt[] = [];
    for (let x = it.x - 1; x <= it.x + it.w; x++)
      for (let y = it.y - 1; y <= it.y + it.h; y++) {
        const inside = x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h;
        if (!inside && x >= 0 && y >= 0 && x < map.w && y < map.h) out.push({ x, y });
      }
    return out;
  });
}

/**
 * Why this piece cannot stand here, or null if it can: all of it on open floor (not on a wall,
 * another piece of furniture, the door or the bed's side), and with it there the door, the bed
 * and everything else in the room can still be reached on foot.
 */
export function placementError(map: MapData, prop: string, x: number, y: number): string | null {
  const d = PROPS[prop];
  if (!d) return '不认识的家具';
  const tiles = footprint(prop, x, y);
  const keep = keepClear(map);
  for (const t of tiles) {
    if (t.x < 0 || t.y < 0 || t.x >= map.w || t.y >= map.h) return '放不下';
    const i = t.y * map.w + t.x;
    if (map.blocked[i]) return '这里已经有东西了';
    if (keep.has(i)) return '不能挡住门口';
  }
  // try it there: can you still get everywhere?
  const blocked = map.blocked.slice();
  for (const t of tiles) blocked[t.y * map.w + t.x] = 1;
  const trial = { ...map, blocked };
  const door = map.doors[0];
  const start = door ? { x: door.x, y: door.y - 1 } : (Object.values(map.spawns)[0] ?? { x: 1, y: 1 });
  const acc = reachable(trial, start.x, start.y);
  for (const s of Object.values(map.spawns)) if (!blocked[s.y * map.w + s.x] && !acc[s.y * map.w + s.x]) return '会把路堵死';
  for (const near of useTiles(map)) {
    const free = near.filter((p) => !blocked[p.y * map.w + p.x]);
    if (free.length && !free.some((p) => acc[p.y * map.w + p.x])) return '会挡住别的东西';
  }
  return null;
}

/**
 * The home as it is with your furniture in it: a copy of the room with the pieces you have
 * put down (blocking their tiles, usable where they can be used) and, if you own the luxury
 * bed, that bed where the old one stood (when it fits).
 */
export function furnish(map: MapData, owned: string[], placed: Placement[]): MapData {
  const out: MapData = { ...map, blocked: map.blocked.slice(), props: map.props.slice(), interactables: map.interactables.slice() };
  if (owned.includes('furn_bed_luxury')) swapBed(out);
  for (const p of placed) {
    const f = FURNISHINGS[p.item];
    if (!f || !owned.includes(p.item)) continue;
    // a piece whose place has since been taken (or a save from another layout) waits to be put down again
    if (placementError(out, f.prop, p.x, p.y)) continue;
    const prop: PlacedProp = { id: f.prop, x: p.x, y: p.y, interact: f.interact };
    out.props.push(prop);
    for (const t of footprint(f.prop, p.x, p.y)) out.blocked[t.y * out.w + t.x] = 1;
    const d = PROPS[f.prop];
    if (f.interact) out.interactables.push({ id: `${p.item}@${p.x},${p.y}`, x: p.x, y: p.y - Math.max(1, d.foot.h) + 1, w: Math.max(1, d.foot.w), h: Math.max(1, d.foot.h), interact: f.interact });
  }
  return out;
}

/** The pieces that did not make it into the room (see furnish): where they were meant to go is taken. */
export function misplaced(map: MapData, owned: string[], placed: Placement[]): string[] {
  const shown = new Set(furnish(map, owned, placed).props.slice(map.props.length).map((p) => `${p.x},${p.y}`));
  return placed.filter((p) => FURNISHINGS[p.item] && !shown.has(`${p.x},${p.y}`)).map((p) => p.item);
}

/** The luxury bed takes the old bed's place, if it fits there without blocking anything. */
function swapBed(map: MapData): void {
  const i = map.props.findIndex((p) => p.interact?.kind === 'bed' && p.id !== 'bed_luxury');
  if (i < 0) return;
  const old = map.props[i];
  const free = map.blocked.slice();
  for (const t of footprint(old.id, old.x, old.y)) free[t.y * map.w + t.x] = 0;
  const trial: MapData = { ...map, blocked: free, interactables: map.interactables.filter((it) => it.interact.kind !== 'bed') };
  // where the old bed stood, or shifted a tile or two to one side (it is wider)
  const at = [0, -1, -2, 1].map((dx) => ({ x: old.x + dx, y: old.y })).find((a) => !placementError(trial, 'bed_luxury', a.x, a.y));
  if (!at) return;
  map.blocked = free;
  for (const t of footprint('bed_luxury', at.x, at.y)) map.blocked[t.y * map.w + t.x] = 1;
  map.props[i] = { ...old, id: 'bed_luxury', x: at.x, y: at.y };
  const d = PROPS.bed_luxury;
  map.interactables = map.interactables.map((it) => (it.interact.kind === 'bed' ? { ...it, x: at.x, y: at.y - d.foot.h + 1, w: d.foot.w, h: d.foot.h } : it));
}
