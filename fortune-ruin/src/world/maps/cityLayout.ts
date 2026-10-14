/**
 * Pure data describing Greyhaven's layout (tile coordinates, 16 px tiles).
 * Used by the renderer to build the map and by the simulation to estimate
 * travel times between places.
 */
export const CITY_W = 120;
export const CITY_H = 90;

export type BuildingStyle =
  | 'casino'
  | 'tower'
  | 'office'
  | 'finance'
  | 'shop'
  | 'cafe'
  | 'restaurant'
  | 'bar'
  | 'boutique'
  | 'bank'
  | 'apartment'
  | 'shared'
  | 'house'
  | 'mansion'
  | 'club'
  | 'finedining'
  | 'luxury'
  | 'motors'
  | 'hotel'
  | 'warehouse'
  | 'lofts'
  | 'river_tower'
  | 'pharmacy'
  | 'bakery';

export interface BuildingDef {
  id: string;
  name: string;
  sign?: string;
  style: BuildingStyle;
  x: number;
  y: number;
  w: number;
  h: number;
  /** door tile (absolute), on the bottom row of the footprint */
  door?: { x: number; y: number; w?: number };
  /** location entered through the door */
  target?: string;
  /** message when the door is not enterable */
  closedText?: string;
  /** extra visual height in tiles above the footprint (towers) */
  extraHeight?: number;
}

export const BUILDINGS: BuildingDef[] = [
  // ---------------------------------------------------------------- Hillcrest
  { id: 'hillcrest_estate', name: '山丘庄园', sign: 'HILLCREST ESTATE', style: 'mansion', x: 2, y: 2, w: 14, h: 10, door: { x: 8, y: 11, w: 2 }, target: 'home_estate' },
  { id: 'whitmore_manor', name: '惠特莫尔宅邸', sign: 'WHITMORE', style: 'mansion', x: 18, y: 2, w: 13, h: 9, door: { x: 24, y: 10 }, closedText: '惠特莫尔家族的私人宅邸。门口的管家礼貌地拦住了你。' },
  { id: 'meridian_club', name: '子午线会所', sign: 'THE MERIDIAN CLUB', style: 'club', x: 34, y: 2, w: 15, h: 10, door: { x: 41, y: 11 }, target: 'club' },
  { id: 'lumiere', name: 'Lumière 法餐厅', sign: 'LUMIERE', style: 'finedining', x: 2, y: 15, w: 10, h: 8, door: { x: 6, y: 22 }, target: 'fine_dining' },
  { id: 'maison_aurele', name: 'Maison Aurèle', sign: 'MAISON AURELE', style: 'luxury', x: 14, y: 15, w: 9, h: 8, door: { x: 18, y: 22 }, target: 'luxury' },
  { id: 'vance_villa', name: '万斯别墅', sign: 'VANCE', style: 'mansion', x: 38, y: 14, w: 12, h: 9, door: { x: 43, y: 22 }, closedText: '莉莉安·万斯的私人别墅，大门紧闭。' },

  // ---------------------------------------------------------------- Downtown north
  { id: 'skyline_tower', name: '天际大厦', sign: 'SKYLINE', style: 'tower', x: 61, y: 6, w: 10, h: 16, door: { x: 65, y: 21, w: 2 }, target: 'home_penthouse', extraHeight: 6 },
  { id: 'northgate', name: '北门资本', sign: 'NORTHGATE CAPITAL', style: 'finance', x: 73, y: 8, w: 12, h: 14, door: { x: 78, y: 21, w: 2 }, target: 'finance_office', extraHeight: 4 },
  { id: 'casino', name: '灰港大赌场', sign: 'GREYHAVEN GRAND', style: 'casino', x: 87, y: 3, w: 21, h: 16, door: { x: 96, y: 18, w: 3 }, target: 'casino', extraHeight: 2 },

  // ---------------------------------------------------------------- Market Street (north row, doors face the pedestrian street)
  { id: 'quickmart', name: 'QuickMart 便利店', sign: 'QUICKMART 24H', style: 'shop', x: 1, y: 35, w: 8, h: 9, door: { x: 4, y: 43, w: 2 }, target: 'store' },
  { id: 'harbor_bean', name: 'Harbor Bean 咖啡馆', sign: 'HARBOR BEAN', style: 'cafe', x: 10, y: 35, w: 9, h: 9, door: { x: 14, y: 43 }, target: 'cafe' },
  { id: 'marlows', name: "Marlow's 小馆", sign: "MARLOW'S", style: 'restaurant', x: 20, y: 35, w: 10, h: 9, door: { x: 24, y: 43, w: 2 }, target: 'restaurant' },
  { id: 'thread_needle', name: 'Thread & Needle', sign: 'THREAD & NEEDLE', style: 'boutique', x: 31, y: 35, w: 8, h: 9, door: { x: 34, y: 43, w: 2 }, target: 'boutique' },
  { id: 'rusty_anchor', name: 'Rusty Anchor 酒吧', sign: 'RUSTY ANCHOR', style: 'bar', x: 40, y: 35, w: 10, h: 9, door: { x: 44, y: 43 }, target: 'bar' },

  // ---------------------------------------------------------------- Market block south row (doors face Dock Street)
  { id: 'harbor_logistics', name: '灰港物流', sign: 'HARBOR LOGISTICS', style: 'office', x: 1, y: 48, w: 13, h: 8, door: { x: 7, y: 55, w: 2 }, target: 'office' },
  { id: 'motors', name: '灰港汽车行', sign: 'GREYHAVEN MOTORS', style: 'motors', x: 16, y: 48, w: 15, h: 8, door: { x: 23, y: 55, w: 2 }, target: 'motors' },
  { id: 'pharmacy', name: '老城药房', sign: 'PHARMACY', style: 'pharmacy', x: 33, y: 49, w: 7, h: 7 },
  { id: 'bakery', name: '晨光面包房', sign: 'BAKERY', style: 'bakery', x: 42, y: 49, w: 8, h: 7, door: { x: 46, y: 55 }, target: 'own_shop', closedText: '「晨光面包房」门上贴着告示：店铺转让，感谢街坊三十年的照顾。（家里的电脑上可以查看招租信息）' },

  // ---------------------------------------------------------------- Downtown south
  { id: 'bank', name: '灰港储蓄信托银行', sign: 'SAVINGS & TRUST', style: 'bank', x: 61, y: 35, w: 12, h: 10, door: { x: 66, y: 44, w: 2 }, target: 'bank' },
  { id: 'central_lofts', name: '中央阁楼公寓', sign: 'CENTRAL LOFTS', style: 'lofts', x: 75, y: 34, w: 11, h: 13, door: { x: 80, y: 46 }, target: 'home_downtown', extraHeight: 3 },
  { id: 'grand_hotel', name: '灰港大酒店', sign: 'GRAND HOTEL', style: 'hotel', x: 88, y: 34, w: 15, h: 12, extraHeight: 4 },

  // ---------------------------------------------------------------- Old Town
  { id: 'maple_court', name: '枫庭公寓', sign: 'MAPLE COURT', style: 'apartment', x: 2, y: 65, w: 12, h: 10, door: { x: 7, y: 74, w: 2 }, target: 'home_basic' },
  { id: 'dockside_rooms', name: '码头合租屋', sign: 'DOCKSIDE ROOMS', style: 'shared', x: 17, y: 65, w: 11, h: 9, door: { x: 22, y: 73 }, target: 'home_shared' },
  { id: 'row_house_1', name: '老城民居', style: 'house', x: 30, y: 66, w: 6, h: 7 },
  { id: 'row_house_2', name: '老城民居', style: 'house', x: 37, y: 66, w: 6, h: 7 },
  { id: 'row_house_3', name: '老城民居', style: 'house', x: 44, y: 66, w: 6, h: 7 },
  { id: 'warehouse_1', name: '旧仓库', sign: 'PIER 7', style: 'warehouse', x: 2, y: 79, w: 13, h: 7 },
  { id: 'warehouse_2', name: '旧仓库', sign: 'PIER 8', style: 'warehouse', x: 17, y: 79, w: 12, h: 7 },

  // ---------------------------------------------------------------- Riverside
  { id: 'riverside_towers', name: '河畔塔楼', sign: 'RIVERSIDE', style: 'river_tower', x: 92, y: 64, w: 12, h: 15, door: { x: 97, y: 78, w: 2 }, target: 'home_river', extraHeight: 5 },
];

export const BUILDING_BY_ID: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

/** Location → the building whose door leads there. */
export const LOCATION_BUILDING: Record<string, string> = Object.fromEntries(BUILDINGS.filter((b) => b.target).map((b) => [b.target!, b.id]));

/** Named outdoor spots NPC schedules refer to. */
export const CITY_SPOTS: Record<string, { x: number; y: number; face?: 'down' | 'up' | 'left' | 'right' }> = {
  riverwalk: { x: 105, y: 70, face: 'right' },
  park_bench1: { x: 67, y: 81, face: 'down' },
  park_bench2: { x: 87, y: 69, face: 'down' },
  park_chess: { x: 71, y: 85, face: 'left' },
  court: { x: 66, y: 69, face: 'up' },
  maple_garden: { x: 10, y: 76, face: 'down' },
  hill_garden: { x: 30, y: 21, face: 'down' },
  plaza_busk: { x: 76, y: 50, face: 'down' },
};

export const BUS_STOPS: { id: string; name: string; x: number; y: number }[] = [
  { id: 'bus_hill', name: '山丘门站', x: 21, y: 26 },
  { id: 'bus_casino', name: '赌场广场站', x: 100, y: 26 },
  { id: 'bus_market', name: '集市街站', x: 9, y: 33 },
  { id: 'bus_union', name: '联合广场站', x: 63, y: 56 },
  { id: 'bus_oldtown', name: '老城站', x: 12, y: 63 },
  { id: 'bus_riverside', name: '河畔站', x: 95, y: 63 },
];

/** Where NPCs "go home" to when their schedule says so (district anchors). */
export const DISTRICT_HOME: Record<string, string> = {
  老城区: 'dockside_rooms',
  市中心: 'central_lofts',
  河畔区: 'riverside_towers',
  山丘富人区: 'whitmore_manor',
};

export function doorTile(buildingId: string): { x: number; y: number } {
  const b = BUILDING_BY_ID[buildingId];
  if (!b?.door) return { x: b ? b.x + Math.floor(b.w / 2) : 60, y: b ? b.y + b.h : 45 };
  return { x: b.door.x, y: b.door.y };
}

/** Outdoor anchor of a location (door tile, or the spot itself for city spots). */
export function locationAnchor(loc: string | null, spot: string | null, district = '老城区'): { x: number; y: number } {
  if (loc === 'city' && spot && CITY_SPOTS[spot]) return CITY_SPOTS[spot];
  if (loc && LOCATION_BUILDING[loc]) return doorTile(LOCATION_BUILDING[loc]);
  return doorTile(DISTRICT_HOME[district] ?? 'dockside_rooms');
}

/** Approximate walking minutes between two anchors. */
export function travelMinutes(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  return Math.max(3, Math.min(40, Math.round(3 + d / 3.5)));
}
