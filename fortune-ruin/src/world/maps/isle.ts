import { hash2 } from '../../art/canvas';
import { tileIndex } from '../../art/tiles';
import type { CityMap } from './city';
import { ISLE, ISLE_BUILDINGS, ISLE_H, ISLE_PIER, ISLE_SPOTS, ISLE_W, POOL, RESORT_GATE } from './isleLayout';
import { MapBuilder } from './types';

function grassTile(x: number, y: number): string {
  const r = hash2(x, y, 401);
  if (r < 0.05) return 'grass_flowers';
  if (r < 0.07) return 'grass_flowers2';
  return `grass${Math.floor(hash2(y, x, 403) * 4)}`;
}

/**
 * Whitestone Bay's outdoor map: the bay and the ferry pier, the fishing
 * harbour and its quay, the lighthouse on the western headland, the
 * village, the public beach and, at the east end, the resort with its
 * forecourt, its pool and its private beach behind the hedge.
 */
export function buildIsleMap(): CityMap {
  const b = new MapBuilder(ISLE, ISLE_W, ISLE_H, 'grass0', true);
  b.fill(0, 0, ISLE_W, ISLE_H, grassTile);

  // ---------------------------------------------------------------- the water
  const water = (x: number, y: number) => {
    b.set(x, y, 'water0', true);
    b.data.water.push(b.idx(x, y));
  };
  for (let y = 0; y < 4; y++) for (let x = 0; x < ISLE_W; x++) water(x, y);
  for (let y = 42; y < ISLE_H; y++) for (let x = 0; x < ISLE_W; x++) water(x, y);
  for (let x = 0; x < ISLE_W; x++) b.set(x, 41, 'shore_n', true);

  // ---------------------------------------------------------------- the western headland and its lighthouse
  b.fill(0, 4, 6, 3, 'rock', true);
  b.fill(0, 7, 1, 11, 'rock', true);
  b.fill(1, 7, 5, 6, 'path', false);
  b.prop('lighthouse', 1, 8, { kind: 'isle', label: '白石湾灯塔', data: { act: 'lighthouse' } });
  b.staff(5, 10, 'left', 6101, '灯塔看守', 'keeper');

  // ---------------------------------------------------------------- the harbour
  b.fill(6, 4, 42, 1, 'quay');
  b.fill(6, 5, 42, 2, 'cobble');
  b.fill(4, 7, 44, 2, 'cobble');
  // the ferry pier, out into the bay
  const pier = new Set<number>();
  for (let y = ISLE_PIER.y0; y <= ISLE_PIER.y1; y++) {
    for (let x = ISLE_PIER.x0; x <= ISLE_PIER.x1; x++) {
      b.set(x, y, 'dock', false);
      pier.add(b.idx(x, y));
    }
  }
  b.data.water = b.data.water.filter((i) => !pier.has(i));
  b.prop('ferry', ISLE_PIER.berth.x, ISLE_PIER.berth.y, { kind: 'isle', label: '灰港—白石湾渡轮', data: { act: 'ferry', present: 'ferry_isle' } }, { when: 'ferry_isle' });
  b.prop('ferry_booth', 24, 5, { kind: 'isle', label: '渡轮售票亭', data: { act: 'ferry' } });
  b.staff(30, 4, 'down', 6102, '渡轮船员', 'ferry_crew', 'ferry_isle');
  // the co-op's boats, in at night and out at sea from dawn till the early afternoon
  for (const x of [8, 14, 42]) b.prop('fishing_boat', x, 3, undefined, { when: 'boats_in' });
  b.prop('labor_board', 20, 5, { kind: 'isle', label: '渔船招工 · 跟船出海', data: { act: 'fishing' } });
  b.staff(21, 5, 'down', 6103, '船老大', 'skipper', 'fishing_hire');
  b.prop('nets', 8, 6);
  b.prop('nets', 12, 6);
  for (const [x, y, id] of [[16, 5, 'crate'], [17, 5, 'crate'], [7, 5, 'barrel'], [45, 5, 'barrel'], [46, 5, 'crate']] as [number, number, string][]) b.prop(id, x, y);
  for (const x of [6, 13, 42]) b.prop('bollard', x, 4);
  // the fish market on the quay, when the boats are back
  [34, 38, 42].forEach((x, i) => {
    b.prop('fish_stall', x, 6, { kind: 'shop', label: '白石湾鱼市', data: { shop: 'isle_market', when: 'fish_market', closed: '渔船下午两点半回港，鱼市就在码头上开到傍晚六点。礼拜天船不出海，没有鱼市。' } }, { when: 'fish_market' });
    b.staff(x + 1, 5, 'down', 6110 + i, '鱼贩', 'fishmonger', 'fish_market');
  });
  for (const x of [11, 27, 46]) b.prop('lamp', x, 8);

  // ---------------------------------------------------------------- the village
  b.fill(4, 16, 42, 2, 'cobble');
  for (const bd of ISLE_BUILDINGS) {
    b.block(bd.x, bd.y, bd.w, bd.h);
    b.data.buildings.push(bd.id);
    if (bd.door && bd.target) {
      const w = bd.door.w ?? 1;
      b.block(bd.door.x, bd.door.y, w, 1, false);
      b.data.doors.push({
        x: bd.door.x,
        y: bd.door.y,
        w,
        target: bd.target,
        spawn: 'entry',
        label: bd.name,
        exitSpawn: { x: bd.door.x + Math.floor((w - 1) / 2), y: bd.door.y + 1, face: 'down' },
      });
      b.spawn(`door:${bd.target}`, bd.door.x + Math.floor((w - 1) / 2), bd.door.y + 1, 'down');
    } else if (bd.door && bd.closedText) {
      b.interactable(`closed:${bd.id}`, bd.door.x, bd.door.y, bd.door.w ?? 1, 1, { kind: 'sign', label: bd.name, data: { text: bd.closedText } });
    }
  }
  for (const x of [8, 24, 38]) b.prop('lamp', x, 17);
  b.prop('flower_pot', 25, 16);
  b.prop('flower_pot', 33, 16);
  b.prop('bench', 13, 16);

  // ---------------------------------------------------------------- the slope down to the public beach
  b.fill(20, 18, 2, 8, 'path');
  b.prop('chess_table', 10, 21);
  b.prop('bench', 5, 19);
  b.prop('bench', 25, 19);
  for (const [x, y] of [[2, 22], [15, 23], [27, 22], [39, 23], [8, 24], [33, 19]] as [number, number][]) b.prop('palm_tree', x, y);

  // ---------------------------------------------------------------- the public beach
  b.fill(0, 26, 45, 15, 'sand');
  b.prop('aframe', 3, 27, {
    kind: 'sign',
    label: '海滩告示',
    data: { text: '白石湾公共海滩\n救生员值班 9:00–18:00，值班时间外禁止下水。\n躺椅和遮阳伞出租：两小时 30 G（现金，找救生员亭）。\n酒后请勿下水。\n\n东边的海滩属于白石湾度假酒店，仅供住客使用。' },
  });
  b.prop('beach_bar', 30, 27, { kind: 'order', label: '海滩小屋 SHACK', data: { shop: 'isle_shack', when: 'shack', closed: '小屋的卷帘门拉下来了。营业时间 10:00–23:00。' } }, { when: 'shack' });
  b.staff(31, 26, 'down', 6104, '小屋老板', 'shack', 'shack');
  b.prop('lifeguard_tower', 12, 32);
  b.staff(15, 32, 'down', 6105, '救生员', 'lifeguard', 'lifeguard');
  const umbrellas: [number, string][] = [[6, 'beach_umbrella'], [18, 'beach_umbrella_b'], [24, 'beach_umbrella'], [36, 'beach_umbrella_b']];
  for (const [x, id] of umbrellas) {
    b.prop(id, x, 34);
    b.prop('lounger', x + 1, 35, { kind: 'isle', label: '躺椅和遮阳伞 · 2 小时 30 G', data: { act: 'beach' } });
  }
  b.prop('sandcastle', 10, 39);
  b.prop('beach_towel', 16, 38);
  b.prop('beach_towel', 28, 38);
  b.interactable('isle_swim', 1, 41, 44, 1, { kind: 'isle', label: '下海游泳', data: { act: 'swim' } });

  // ---------------------------------------------------------------- the resort
  // its forecourt, open to all: the lobby, the restaurant and the front desk are inside
  b.fill(46, 16, 26, 4, 'plaza_fancy');
  b.fill(44, 16, 2, 2, 'plaza_fancy');
  b.staff(55, 16, 'down', 6106, '门童', 'doorman');
  for (const x of [47, 68]) b.prop('lamp', x, 19);
  b.prop('planter', 49, 16);
  b.prop('planter', 63, 16);
  for (const [x, y] of [[49, 5], [68, 5], [70, 7]] as [number, number][]) b.prop('palm_tree', x, y);
  // the hedge and the guests' gate
  for (let x = 46; x < ISLE_W; x++) if (x < RESORT_GATE.x || x >= RESORT_GATE.x + RESORT_GATE.w) b.set(x, RESORT_GATE.y, 'hedge', true);
  for (let y = RESORT_GATE.y; y <= 40; y++) b.set(45, y, 'hedge', true);
  b.fill(RESORT_GATE.x, RESORT_GATE.y, RESORT_GATE.w, 1, 'plaza_fancy');
  b.prop('resort_gate', RESORT_GATE.x, RESORT_GATE.y);
  b.interactable('resort_gate', RESORT_GATE.x, RESORT_GATE.y, RESORT_GATE.w, 1, {
    kind: 'gate',
    label: '住客专享 · 泳池与海滩',
    data: { area: 'resort', inside: `${RESORT_GATE.inside.x},${RESORT_GATE.inside.y}`, outside: `${RESORT_GATE.outside.x},${RESORT_GATE.outside.y}` },
  });
  // the pool deck and the infinity pool
  b.fill(46, 21, 26, 7, 'deck');
  b.fill(POOL.x0 - 1, POOL.y0 - 1, POOL.x1 - POOL.x0 + 3, POOL.y1 - POOL.y0 + 3, 'pool_edge');
  b.fill(POOL.x0, POOL.y0, POOL.x1 - POOL.x0 + 1, POOL.y1 - POOL.y0 + 1, 'pool', true);
  b.interactable('isle_pool', POOL.x0, POOL.y0, POOL.x1 - POOL.x0 + 1, POOL.y1 - POOL.y0 + 1, { kind: 'isle', label: '无边泳池', data: { act: 'pool' } });
  for (const [x, y] of [[47, 23], [67, 23], [70, 26]] as [number, number][]) b.prop('palm_tree', x, y);
  // the private beach
  b.fill(46, 28, 26, 13, 'sand');
  for (const x of [50, 54, 58]) b.prop('lounger_teak', x, 28, { kind: 'isle', label: '住客躺椅', data: { act: 'private' } });
  for (const x of [52, 56, 60]) b.prop('resort_parasol', x, 29);
  for (const x of [60, 65]) {
    b.prop('resort_parasol', x - 1, 34);
    b.prop('lounger_teak', x, 35, { kind: 'isle', label: '住客海滩', data: { act: 'private' } });
  }
  b.staff(67, 31, 'left', 6107, '海滩侍应', 'beach_waiter', 'resort_day');

  // ---------------------------------------------------------------- people
  for (const [name, s] of Object.entries(ISLE_SPOTS)) b.spot(name, s.x, s.y, s.face ?? 'down', s.sit);
  b.spawn('entry', 29, 5, 'down');
  b.spawn('ferry', ISLE_PIER.board.x, ISLE_PIER.board.y, 'right');

  const data = b.finish() as CityMap;
  data.lanes = [];
  // where islanders like to walk
  const walk = new Uint8Array(ISLE_W * ISLE_H);
  const pref = new Set(['cobble', 'quay', 'path', 'plaza_fancy', 'dock', 'deck', 'sand'].map(tileIndex));
  for (let i = 0; i < walk.length; i++) if (pref.has(data.ground[i]) && !data.blocked[i]) walk[i] = 1;
  data.walkways = walk;
  data.ambient = { day: 1, night: 0.22, color: 0x0a0a2a };
  return data;
}
