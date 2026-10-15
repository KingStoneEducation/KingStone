import { G, type Money } from '../core/money';
import { TILE_INDEX, WALL_STYLES } from '../art/tiles';
import type { MapData } from './maps/types';

/**
 * Redecorating a home: a new floor where most of it is laid with one floor, and a new finish
 * for its walls. The kitchen, the bathroom and any other floor keep theirs. Paid by the tile,
 * laid by a crew in a day.
 */
export interface FloorChoice {
  id: string;
  name: string;
  /** laid, per tile */
  perTile: Money;
  /** how much it adds to the impression the home makes */
  prestige: number;
}

export const FLOOR_CHOICES: FloorChoice[] = [
  { id: 'carpet_beige', name: '米色地毯', perTile: G(40), prestige: 0 },
  { id: 'carpet_grey', name: '灰色地毯', perTile: G(40), prestige: 0 },
  { id: 'carpet_blue', name: '蓝色地毯', perTile: G(45), prestige: 0 },
  { id: 'carpet_green', name: '墨绿地毯', perTile: G(45), prestige: 0.1 },
  { id: 'tile_white', name: '白色瓷砖', perTile: G(50), prestige: 0 },
  { id: 'wood_light', name: '浅色木地板', perTile: G(55), prestige: 0.1 },
  { id: 'wood_mid', name: '原木地板', perTile: G(55), prestige: 0.1 },
  { id: 'wood_dark', name: '深色木地板', perTile: G(65), prestige: 0.2 },
  { id: 'parquet', name: '人字拼花地板', perTile: G(95), prestige: 0.3 },
  { id: 'parquet_dark', name: '深色拼花地板', perTile: G(110), prestige: 0.35 },
  { id: 'marble', name: '白色大理石', perTile: G(200), prestige: 0.5 },
  { id: 'marble_dark', name: '黑色大理石', perTile: G(220), prestige: 0.55 },
];

export interface WallChoice {
  /** a wall style (see WALL_STYLES) */
  id: string;
  name: string;
  perTile: Money;
  prestige: number;
}

export const WALL_CHOICES: WallChoice[] = [
  { id: 'white', name: '白色乳胶漆', perTile: G(20), prestige: 0 },
  { id: 'cream', name: '米色条纹墙纸', perTile: G(30), prestige: 0.05 },
  { id: 'pastel', name: '薄荷波点墙纸', perTile: G(30), prestige: 0 },
  { id: 'blue', name: '雾蓝色涂料', perTile: G(25), prestige: 0 },
  { id: 'brick', name: '红砖饰面', perTile: G(45), prestige: 0.05 },
  { id: 'concrete', name: '清水混凝土', perTile: G(40), prestige: 0.05 },
  { id: 'wood', name: '木饰面', perTile: G(55), prestige: 0.15 },
  { id: 'green', name: '墨绿条纹墙纸', perTile: G(45), prestige: 0.15 },
  { id: 'darkwood', name: '深色护墙板', perTile: G(70), prestige: 0.25 },
  { id: 'navy', name: '藏青护墙板', perTile: G(70), prestige: 0.25 },
  { id: 'red', name: '酒红锦缎墙布', perTile: G(80), prestige: 0.3 },
  { id: 'marble', name: '大理石墙面', perTile: G(150), prestige: 0.4 },
];

/** What the crew charges to come out, whatever the size of the job. */
export const CREW_FEE = G(600);

/** Tiles that belong to the kitchen, the bathroom or the doormat, which keep their own floor. */
const KEEP = new Set(['tile_kitchen', 'tile_checker', 'tile_blue', 'spa_stone', 'mat', 'empty'].map((n) => TILE_INDEX[n]));
const WALL_PARTS = ['top', 'upper', 'lower'] as const;
/** wall tile index → [style, part] */
const WALL_OF = new Map<number, [string, (typeof WALL_PARTS)[number]]>();
for (const s of WALL_STYLES) for (const part of WALL_PARTS) WALL_OF.set(TILE_INDEX[`wall_${s.id}_${part}`], [s.id, part]);

/** The floor most of the home is laid with (the one a new floor replaces). */
export function mainFloor(map: MapData): number | null {
  const count = new Map<number, number>();
  for (const t of map.ground) if (!KEEP.has(t) && !WALL_OF.has(t)) count.set(t, (count.get(t) ?? 0) + 1);
  let best: number | null = null;
  for (const [t, n] of count) if (best === null || n > (count.get(best) ?? 0)) best = t;
  return best;
}

/** The style most of the walls are in (the one new walls replace). */
export function mainWall(map: MapData): string | null {
  const count = new Map<string, number>();
  for (const layer of [map.ground, map.overlay]) for (const t of layer) if (WALL_OF.has(t)) count.set(WALL_OF.get(t)![0], (count.get(WALL_OF.get(t)![0]) ?? 0) + 1);
  let best: string | null = null;
  for (const [s, n] of count) if (best === null || n > (count.get(best) ?? 0)) best = s;
  return best;
}

export interface Decor {
  floor?: string;
  wall?: string;
}

/** How many tiles a new floor and new walls would cover in this home. */
export function decorArea(map: MapData): { floor: number; wall: number } {
  const f = mainFloor(map);
  const w = mainWall(map);
  let floor = 0;
  let wall = 0;
  for (const t of map.ground) if (t === f) floor++;
  for (const layer of [map.ground, map.overlay]) for (const t of layer) if (WALL_OF.get(t)?.[0] === w) wall++;
  return { floor, wall };
}

/** What a job costs here: the crew, and every tile of floor and wall it changes. */
export function decorCost(map: MapData, change: Decor): Money {
  const a = decorArea(map);
  const floor = change.floor ? (FLOOR_CHOICES.find((x) => x.id === change.floor)?.perTile ?? 0) * a.floor : 0;
  const wall = change.wall ? (WALL_CHOICES.find((x) => x.id === change.wall)?.perTile ?? 0) * a.wall : 0;
  return change.floor || change.wall ? CREW_FEE + floor + wall : 0;
}

/** The home as redecorated: its main floor and its walls swapped for the chosen ones. */
export function decorate(map: MapData, decor: Decor | undefined): MapData {
  if (!decor || (!decor.floor && !decor.wall)) return map;
  const f = decor.floor ? mainFloor(map) : null;
  const w = decor.wall ? mainWall(map) : null;
  const floorTo = decor.floor ? TILE_INDEX[decor.floor] : undefined;
  const swap = (t: number): number => {
    if (f !== null && floorTo !== undefined && t === f) return floorTo;
    const part = WALL_OF.get(t);
    if (w && decor.wall && part && part[0] === w) return TILE_INDEX[`wall_${decor.wall}_${part[1]}`] ?? t;
    return t;
  };
  return { ...map, ground: map.ground.map(swap), overlay: map.overlay.map((t) => (t < 0 ? t : swap(t))) };
}

/** What the finish adds to how the home strikes visitors. */
export function decorPrestige(decor: Decor | undefined): number {
  if (!decor) return 0;
  return (FLOOR_CHOICES.find((x) => x.id === decor.floor)?.prestige ?? 0) + (WALL_CHOICES.find((x) => x.id === decor.wall)?.prestige ?? 0);
}
