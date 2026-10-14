import type { BuildingDef } from './cityLayout';

/**
 * Whitestone Bay (白石湾), the island town across the bay from Greyhaven: pure
 * layout data in tile coordinates, like cityLayout.ts. The bay is to the
 * north, with the ferry pier and the fishing harbour; the lighthouse stands
 * on the western headland; the village fills the middle; the public beach
 * runs along the south shore; the resort takes the east end, its pool and
 * private beach behind a hedge with a gate for guests.
 */
export const ISLE_W = 72;
export const ISLE_H = 48;

/** The island's outdoor map and the rooms on it. */
export const ISLE = 'isle';

export function onIsle(loc: string | null | undefined): boolean {
  return !!loc && (loc === ISLE || loc.startsWith('isle_'));
}

export const ISLE_BUILDINGS: BuildingDef[] = [
  { id: 'isle_coop', name: '白石湾渔业合作社', sign: 'FISHERS CO-OP', style: 'coop', x: 7, y: 9, w: 8, h: 7, door: { x: 10, y: 15 }, closedText: '合作社的仓库，门上挂着锁。墙上贴着告示：「跟船出海的，凌晨四点半到码头找船老大。」' },
  { id: 'isle_diner_bld', name: '老船长食堂', sign: 'CAPTAIN\'S', style: 'diner', x: 16, y: 10, w: 8, h: 6, door: { x: 19, y: 15 }, target: 'isle_diner' },
  { id: 'isle_guesthouse_bld', name: '海鸥民宿', sign: 'GULL INN', style: 'guesthouse', x: 26, y: 9, w: 7, h: 7, door: { x: 29, y: 15 }, target: 'isle_guesthouse' },
  { id: 'isle_house_1', name: '渔民的房子', style: 'fisher', x: 34, y: 10, w: 5, h: 6, door: { x: 36, y: 15 }, closedText: '门口晾着渔网和咸鱼。屋里有人在看电视。' },
  { id: 'isle_house_2', name: '渔民的房子', style: 'fisher', x: 39, y: 10, w: 5, h: 6, door: { x: 41, y: 15 }, closedText: '门关着，窗台上摆着一排贝壳。' },
  { id: 'isle_resort_bld', name: '白石湾度假酒店', sign: 'WHITESTONE RESORT', style: 'resort', x: 50, y: 8, w: 16, h: 8, door: { x: 57, y: 15, w: 2 }, target: 'isle_resort', extraHeight: 2 },
];

/** Where people stand or sit on the island. */
export const ISLE_SPOTS: Record<string, { x: number; y: number; face?: 'down' | 'up' | 'left' | 'right'; sit?: boolean }> = {
  isle_pier: { x: 27, y: 5, face: 'up' },
  isle_quay: { x: 18, y: 6, face: 'up' },
  isle_market: { x: 37, y: 7, face: 'up' },
  isle_chess: { x: 9, y: 21, face: 'right', sit: true },
  isle_chess2: { x: 12, y: 21, face: 'left', sit: true },
  isle_beach1: { x: 16, y: 38, face: 'down', sit: true },
  isle_beach2: { x: 28, y: 38, face: 'down', sit: true },
  isle_shack: { x: 31, y: 28, face: 'up' },
  isle_busk: { x: 35, y: 29, face: 'down' },
  isle_pool1: { x: 51, y: 28, face: 'up', sit: true },
  isle_pool2: { x: 55, y: 28, face: 'up', sit: true },
  isle_private: { x: 61, y: 35, face: 'down', sit: true },
  isle_lighthouse: { x: 4, y: 11, face: 'up' },
  isle_forecourt: { x: 54, y: 18, face: 'up' },
};

/** Districts for the banner as you walk about. */
export const ISLE_DISTRICTS: { name: string; x0: number; y0: number; x1: number; y1: number }[] = [
  { name: '灯塔岬', x0: 0, y0: 0, x1: 5, y1: 17 },
  { name: '白石湾度假酒店', x0: 46, y0: 0, x1: 71, y1: 47 },
  { name: '白石湾渔港', x0: 6, y0: 0, x1: 45, y1: 7 },
  { name: '渔村', x0: 6, y0: 8, x1: 45, y1: 25 },
  { name: '白石湾海滩', x0: 0, y0: 18, x1: 45, y1: 47 },
];

/** The ferry pier: the boat moors along its east side; you board from the pier's end; people wait for her on the boards. */
export const ISLE_PIER = { x0: 28, x1: 31, y0: 0, y1: 3, berth: { x: 32, y: 3 }, board: { x: 31, y: 3 }, wait: [{ x: 29, y: 1 }, { x: 28, y: 2 }, { x: 30, y: 2 }, { x: 29, y: 3 }, { x: 28, y: 0 }, { x: 30, y: 0 }] };

/** The hedge with the resort's gate: the pool and the private beach are for guests. */
export const RESORT_GATE = { x: 57, y: 20, w: 2, inside: { x: 57, y: 21 }, outside: { x: 57, y: 19 } };
export const POOL = { x0: 51, x1: 62, y0: 22, y1: 26 };

/** Where someone on the island is, in island tiles: their spot outdoors, or outside the door of the room they are in. */
export function isleAnchor(loc: string | null, spot: string | null): { x: number; y: number } {
  if (loc === ISLE && spot && ISLE_SPOTS[spot]) return ISLE_SPOTS[spot];
  const b = ISLE_BUILDINGS.find((x) => x.target === loc);
  return b?.door ? { x: b.door.x + Math.floor(((b.door.w ?? 1) - 1) / 2), y: b.door.y + 1 } : ISLE_PIER.board;
}

