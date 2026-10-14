import type { BusinessState } from '../../core/state';
import { BIZ_TYPES, type BizType } from '../../data/business';
import { fromAscii } from './interiors';
import type { MapData } from './types';

const PLAN = [
  '##############',
  '##############',
  '#;;;;;;;;;;;;#',
  '#;;;;;;;;;;;;#',
  '#............#',
  '#............#',
  '#............#',
  '#............#',
  '#............#',
  '#............#',
  '######DD######',
];

const FLOORS: Record<BizType, [string, string, string]> = {
  cafe: ['wood_mid', 'tile_kitchen', 'pastel'],
  bakery: ['tile_beige', 'tile_kitchen', 'cream'],
  bar: ['wood_dark', 'wood_dark', 'darkwood'],
  boutique: ['parquet', 'parquet', 'white'],
  convenience: ['tile_white', 'tile_white', 'white'],
};

const MANAGE = { kind: 'business' as const, label: '店铺管理', data: { action: 'manage' } };
const WORK = { kind: 'business' as const, label: '帮忙看店（4 小时）', data: { action: 'work' } };

/**
 * The player's shop, furnished for whatever it currently is. Rebuilt on every
 * visit: staff behind the counter follow the number employed, and how full
 * the room is follows yesterday's customers.
 */
export function ownShopMap(b: BusinessState | null): MapData {
  const type: BizType = b?.type ?? 'bakery';
  const [floor, back, wall] = b ? FLOORS[type] : ['concrete', 'concrete', 'white'];
  const m = fromAscii('own_shop', PLAN, { '.': floor, ';': back }, wall);
  m.prop('window', 4, 1, undefined, { oy: -2 });
  m.prop('window', 9, 1, undefined, { oy: -2 });
  if (!b || b.phase === 'renovating') {
    // bare walls, crates and cones while the fitters work
    for (const [x, y] of [
      [3, 5],
      [4, 5],
      [9, 7],
      [10, 4],
    ] as [number, number][])
      m.prop('crate', x, y);
    m.prop('cone', 7, 6);
    m.prop('cone', 2, 8);
    m.prop('aframe', 11, 8, b ? MANAGE : undefined);
    m.data.ambient = { day: 1, night: 0.7, color: 0x120c18 };
    return m.finish();
  }
  const d = BIZ_TYPES[type];
  switch (type) {
    case 'cafe':
      m.prop('espresso', 2, 3);
      for (let x = 3; x <= 8; x++) m.prop('cafe_counter', x, 3, x === 5 ? MANAGE : x === 7 ? WORK : undefined);
      m.prop('pastry_case', 9, 3);
      m.prop('chalkboard', 6, 1, undefined, { oy: -2 });
      m.prop('plant', 12, 3);
      for (const [x, y] of [
        [3, 6],
        [7, 6],
        [11, 6],
        [3, 8],
        [10, 8],
      ] as [number, number][]) {
        m.prop('table_round', x, y);
        m.prop('chair_cafe', x - 1, y);
        m.prop('chair_cafe', x + 1, y);
      }
      break;
    case 'bakery':
      for (let x = 2; x <= 6; x++) m.prop('counter', x, 3, x === 4 ? MANAGE : x === 6 ? WORK : undefined);
      m.prop('pastry_case', 7, 3);
      m.prop('pastry_case', 8, 3);
      m.prop('display_case', 9, 3);
      m.prop('stove', 11, 2);
      m.prop('shelf', 2, 6);
      m.prop('shelf', 4, 6);
      m.prop('table_round', 9, 7);
      m.prop('chair_cafe', 8, 7);
      m.prop('chair_cafe', 10, 7);
      m.prop('plant', 12, 8);
      break;
    case 'bar':
      m.prop('bottle_shelf', 3, 1, undefined, { oy: -2 });
      m.prop('bottle_shelf', 7, 1, undefined, { oy: -2 });
      for (let x = 2; x <= 9; x++) m.prop('bar_counter', x, 3, x === 5 ? MANAGE : x === 8 ? WORK : undefined);
      for (const x of [2, 4, 6, 8]) m.prop('stool', x, 4, undefined, { noBlock: true });
      m.prop('jukebox', 12, 3);
      m.prop('booth', 2, 8);
      m.prop('booth', 6, 8);
      m.prop('dartboard', 12, 5, undefined, { oy: -8 });
      break;
    case 'boutique':
      for (const [x, y] of [
        [2, 5],
        [5, 5],
        [2, 8],
      ] as [number, number][])
        m.prop('clothes_rack', x, y);
      m.prop('mannequin', 8, 5);
      m.prop('mannequin', 10, 5);
      m.prop('mirror', 12, 1, undefined, { oy: -6 });
      m.prop('register', 9, 3, MANAGE);
      m.prop('display_case', 6, 3, WORK);
      m.prop('plant', 12, 8);
      break;
    case 'convenience':
      m.prop('fridge_case', 2, 3);
      m.prop('fridge_case', 4, 3);
      m.prop('fridge_case', 6, 3);
      m.prop('register', 10, 3, MANAGE);
      m.prop('counter', 9, 3, WORK);
      for (const [x, y] of [
        [3, 6],
        [6, 6],
        [3, 8],
        [6, 8],
      ] as [number, number][])
        m.prop('shelf', x, y);
      m.prop('magazine_rack', 11, 7);
      break;
  }
  // staff behind the counter
  const staffXs = [4, 8, 10];
  for (let i = 0; i < Math.min(3, b.staff); i++) m.data.staff.push({ x: staffXs[i], y: 2, face: 'down', look: 4100 + i * 37, label: '店员', role: d.staffRole });
  // a fuller room after a busy day
  const last = b.days[b.days.length - 1];
  const busy = last ? Math.min(5, Math.round((last.customers / Math.max(1, d.base)) * 4)) : 0;
  const spots: [number, number][] = [
    [5, 7],
    [9, 6],
    [12, 5],
    [6, 9],
    [11, 9],
  ];
  for (let i = 0; i < busy; i++) {
    const [x, y] = spots[i];
    if (m.data.blocked[y * m.data.w + x]) continue;
    m.data.staff.push({ x, y, face: i % 2 ? 'left' : 'up', look: 4300 + i * 53 + (b.days.length % 7), label: '客人', role: 'patron' });
  }
  m.data.ambient = type === 'bar' ? { day: 0.75, night: 0.6, color: 0x1a0c10 } : { day: 1, night: 0.8, color: 0x140c1a };
  return m.finish();
}
