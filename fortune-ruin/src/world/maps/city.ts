import { hash2 } from '../../art/canvas';
import { tileIndex } from '../../art/tiles';
import { BUILDINGS, BUS_STOPS, CITY_H, CITY_SPOTS, CITY_W } from './cityLayout';
import { MapBuilder, type MapData } from './types';

export interface Lane {
  dir: 'left' | 'right' | 'up' | 'down';
  /** fixed coordinate (tile) of the lane centre line */
  fixed: number;
  from: number;
  to: number;
}

export interface CityMap extends MapData {
  lanes: Lane[];
}

const HAVE = { y0: 28, x0: 0, x1: 106 };
const DOCK = { y0: 58, x0: 0, x1: 103 };
const CENTRAL = { x0: 54, y0: 0, y1: 89 };

function grassTile(x: number, y: number): string {
  const r = hash2(x, y, 99);
  if (r < 0.04) return 'grass_flowers';
  if (r < 0.06) return 'grass_flowers2';
  return `grass${Math.floor(hash2(y, x, 7) * 4)}`;
}

export function buildCityMap(): CityMap {
  const b = new MapBuilder('city', CITY_W, CITY_H, 'grass0', true);
  b.fill(0, 0, CITY_W, CITY_H, grassTile);

  // ---------------------------------------------------------------- districts' base ground
  // downtown north and south blocks are paved
  b.fill(60, 0, 47, 26, (x, y) => ((x + y) % 7 === 0 ? 'plaza2' : 'plaza'));
  b.fill(60, 34, 44, 22, (x, y) => ((x * 3 + y) % 11 === 0 ? 'plaza2' : 'plaza'));
  // market block
  b.fill(0, 34, 52, 22, 'sidewalk');
  b.fill(0, 44, 52, 4, (x, y) => ((x + y) % 2 === 0 ? 'plaza' : 'plaza2'));
  // casino plaza
  b.fill(86, 19, 22, 7, 'plaza_fancy');
  // hillcrest paths
  b.fill(1, 12, 50, 2, 'plaza2');
  b.fill(1, 23, 50, 2, 'plaza2');
  b.fill(24, 12, 4, 14, 'plaza2');
  b.fill(23, 10, 3, 2, 'plaza2');
  // old town front paths and docks
  b.fill(0, 64, 52, 1, 'sidewalk');
  b.fill(0, 74, 52, 4, (x) => (x % 9 === 0 ? 'plaza2' : 'plaza'));
  b.fill(0, 78, 52, 1, 'concrete');
  b.fill(29, 79, 23, 7, 'concrete');
  b.fill(0, 86, 52, 2, 'dock');
  // river promenade
  b.fill(104, 26, 3, 64, 'plaza');
  b.fill(107, 26, 1, 64, 'rail', true);

  // ---------------------------------------------------------------- water
  const water = (x: number, y: number) => {
    b.set(x, y, 'water0', true);
    b.data.water.push(b.idx(x, y));
  };
  for (let y = 0; y < CITY_H; y++) for (let x = 108; x < CITY_W; x++) water(x, y);
  for (let y = 88; y < CITY_H; y++) for (let x = 0; x < 52; x++) water(x, y);

  // ---------------------------------------------------------------- roads
  const hRoad = (y0: number, x0: number, x1: number) => {
    for (let x = x0; x <= x1; x++) {
      b.set(x, y0 - 2, 'sidewalk');
      b.set(x, y0 - 1, 'curb_s');
      b.set(x, y0, 'road');
      b.set(x, y0 + 1, 'road_line_h');
      b.set(x, y0 + 2, 'road2');
      b.set(x, y0 + 3, 'road');
      b.set(x, y0 + 4, 'curb_n');
      b.set(x, y0 + 5, 'sidewalk2');
    }
  };
  const vRoad = (x0: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      b.set(x0 - 2, y, 'sidewalk');
      b.set(x0 - 1, y, 'curb_e');
      b.set(x0, y, 'road');
      b.set(x0 + 1, y, 'road_line_v');
      b.set(x0 + 2, y, 'road2');
      b.set(x0 + 3, y, 'road');
      b.set(x0 + 4, y, 'curb_w');
      b.set(x0 + 5, y, 'sidewalk2');
    }
  };
  hRoad(HAVE.y0, HAVE.x0, HAVE.x1);
  hRoad(DOCK.y0, DOCK.x0, DOCK.x1);
  vRoad(CENTRAL.x0, CENTRAL.y0, CENTRAL.y1);
  // intersections (plain asphalt)
  for (const y0 of [HAVE.y0, DOCK.y0]) {
    b.fill(CENTRAL.x0, y0, 4, 4, 'road');
    b.fill(CENTRAL.x0 - 2, y0 - 2, 2, 2, 'sidewalk');
    b.fill(CENTRAL.x0 + 4, y0 - 2, 2, 2, 'sidewalk');
    b.fill(CENTRAL.x0 - 2, y0 + 4, 2, 2, 'sidewalk');
    b.fill(CENTRAL.x0 + 4, y0 + 4, 2, 2, 'sidewalk');
    // crosswalks
    b.fill(CENTRAL.x0 - 4, y0, 2, 4, 'crosswalk_h');
    b.fill(CENTRAL.x0 + 6, y0, 2, 4, 'crosswalk_h');
    b.fill(CENTRAL.x0, y0 - 4, 4, 2, 'crosswalk_v');
    b.fill(CENTRAL.x0, y0 + 6, 4, 2, 'crosswalk_v');
  }
  // the avenue ends at the promenade
  b.fill(HAVE.x1 + 1, HAVE.y0 - 2, 1, 6, 'plaza');

  // ---------------------------------------------------------------- hillcrest wall and gate
  for (let x = 0; x <= 51; x++) if (x < 24 || x > 27) b.set(x, 25, 'hedge', true);
  for (let y = 0; y <= 25; y++) b.set(51, y, 'hedge', true);
  b.prop('gate_pillar', 23, 25);
  b.prop('gate_pillar', 28, 25);
  b.prop('guard_booth', 29, 24, { kind: 'sign', label: '保安亭', data: { text: '保安朝你点了点头：「山丘区是私人住宅区，请勿打扰住户。会所和餐厅在里面。」' } });
  b.staff(31, 24, 'left', 4101, '门卫', 'guard');

  // ---------------------------------------------------------------- buildings & doors
  for (const bd of BUILDINGS) {
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
  // red carpet into the casino
  for (let y = 19; y <= 25; y++) {
    b.set(96, y, 'runner_l');
    b.set(97, y, 'runner_c');
    b.set(98, y, 'runner_r');
  }
  b.prop('rope', 93, 21);
  b.prop('rope', 100, 21);
  b.prop('valet', 99, 24, { kind: 'sign', label: '代客泊车', data: { text: '泊车员：「欢迎光临灰港大赌场。今晚需要帮您停车吗？」' } });
  b.prop('fountain', 88, 24);
  b.prop('fountain', 102, 24);
  b.prop('limo', 89, 25, undefined, { noBlock: true, oy: 6 });
  b.block(89, 25, 4, 1);
  b.staff(95, 19, 'down', 4102, '门童', 'doorman');
  b.staff(99, 19, 'down', 4103, '门童', 'doorman');

  // ---------------------------------------------------------------- props: street furniture
  const lampRow = (y: number, x0: number, x1: number, step: number, skip: (x: number) => boolean) => {
    for (let x = x0; x <= x1; x += step) if (!skip(x) && !b.isBlocked(x, y)) b.prop('lamp', x, y);
  };
  const nearCross = (x: number) => (x >= CENTRAL.x0 - 5 && x <= CENTRAL.x0 + 8) || (x >= 95 && x <= 99);
  lampRow(27, 3, 104, 8, nearCross);
  lampRow(32, 7, 104, 8, nearCross);
  lampRow(57, 3, 101, 8, (x) => nearCross(x) || (x >= 6 && x <= 8) || (x >= 22 && x <= 24));
  lampRow(62, 7, 101, 8, nearCross);
  for (let y = 4; y <= 86; y += 9) {
    if (y >= 22 && y <= 36) continue;
    if (y >= 52 && y <= 66) continue;
    if (!b.isBlocked(52, y)) b.prop('lamp', 52, y);
    if (!b.isBlocked(59, y)) b.prop('lamp', 59, y);
  }
  for (let y = 30; y <= 88; y += 7) b.prop('lamp', 106, y);

  // market street
  for (const x of [2, 9, 20, 30, 39, 49]) b.prop('lamp', x, 47);
  b.prop('planter', 6, 46);
  b.prop('planter', 27, 46);
  b.prop('planter', 36, 46);
  b.prop('bench', 46, 46);
  for (const x of [11, 15]) b.prop('umbrella_table', x, 45);
  b.prop('aframe', 13, 44);
  b.prop('aframe', 26, 44);
  b.prop('aframe', 46, 44);
  b.prop('trash', 18, 46);
  b.prop('trash', 41, 46);
  b.prop('newsbox', 3, 44);
  b.prop('bike_rack', 29, 44, undefined);
  b.prop('flower_pot', 8, 44);
  b.prop('flower_pot', 19, 44);
  b.prop('flower_pot', 30, 44);
  b.prop('flower_pot', 39, 44);
  // alleys between south-row buildings
  b.fill(14, 48, 2, 8, 'plaza');
  b.fill(31, 48, 2, 8, 'plaza');
  b.fill(40, 48, 2, 8, 'plaza');
  b.fill(50, 48, 2, 8, 'plaza');
  b.prop('barrel', 32, 50);
  b.prop('crate', 41, 49);
  b.prop('trash', 15, 52);

  // downtown north details
  for (const [x, y] of [[62, 3], [68, 3], [75, 3], [82, 3], [72, 12], [72, 18], [86, 10], [86, 16]] as [number, number][]) b.prop(b.isBlocked(x, y) ? 'flower_pot' : 'planter', x, y);
  b.prop('tree_round', 63, 24, undefined);
  b.prop('tree_round', 70, 24);
  b.prop('tree_round', 76, 24);
  b.prop('tree_round', 83, 24);
  b.prop('bench', 72, 24);
  b.prop('trash', 80, 23);
  b.prop('newsbox', 68, 23);

  // downtown south / union square
  b.prop('fountain', 78, 53);
  b.prop('statue', 70, 51);
  b.prop('bench', 64, 50);
  b.prop('bench', 86, 50);
  b.prop('bench', 92, 53);
  for (const [x, y] of [[62, 48], [90, 48], [98, 48], [62, 54], [98, 54], [86, 54]] as [number, number][]) b.prop('tree_round', x, y);
  b.prop('atm_street', 70, 45, { kind: 'atm', label: '街边 ATM', data: { where: 'street' } });
  b.prop('trash', 73, 46);
  b.prop('hydrant', 74, 45);
  b.prop('mailbox', 86, 46);
  b.prop('planter', 66, 48);
  b.prop('planter', 93, 48);

  // hillcrest gardens
  b.prop('fountain', 29, 20);
  for (const [x, y] of [[1, 14], [12, 14], [13, 22], [24, 2], [32, 14], [36, 14], [50, 14], [1, 22], [33, 22], [50, 22], [17, 11], [31, 11], [33, 2], [49, 11], [1, 11]] as [number, number][]) {
    if (!b.isBlocked(x, y)) b.prop(hash2(x, y, 1) < 0.5 ? 'tree_round' : 'tree_pine', x, y);
  }
  b.fill(2, 13, 4, 1, 'garden', true);
  b.fill(10, 13, 4, 1, 'garden', true);
  b.fill(36, 13, 4, 1, 'garden', true);
  b.fill(44, 13, 4, 1, 'garden', true);
  for (const x of [5, 14, 21, 33, 40, 47]) {
    b.prop('lamp', x, 24);
  }
  b.prop('bench', 33, 21);
  b.prop('bench', 25, 18);

  // old town
  b.fill(2, 75, 3, 1, 'garden', true);
  b.fill(12, 75, 2, 1, 'garden', true);
  b.prop('bench', 9, 77);
  b.prop('mailbox', 15, 74);
  b.prop('trash', 16, 75);
  for (const [x, y] of [[15, 66], [29, 64], [36, 64], [43, 64], [50, 64], [1, 64]] as [number, number][]) b.prop('tree_round', x, y + 0);
  for (const x of [32, 37, 48]) b.fill(x, 73, 2, 1, 'garden', true);
  b.prop('aframe', 41, 73, { kind: 'sign', label: '食堂告示', data: { text: '海员之家社区食堂：每天 11:00–14:00、17:00–20:00 两餐，免费，每人一份。欢迎来帮忙打饭，也欢迎捐款。' } });
  for (const x of [5, 19, 33, 47]) b.prop('lamp', x, 77);
  // the old pier: day labour at Pier 7 in the morning
  b.prop('labor_board', 10, 86, { kind: 'labor', label: '7 号码头 · 今日招工' });
  b.staff(11, 86, 'down', 4201, '工头', 'foreman');
  b.prop('crate', 3, 86);
  b.prop('crate', 4, 86);
  b.prop('barrel', 6, 86);
  b.prop('crate', 20, 86);
  b.prop('barrel', 22, 86);
  // the night market by the water: five stalls, folding tables, a fortune teller
  const stalls: [string, string, 'order' | 'shop', string][] = [
    ['stall_wok', 'nm_wok', 'order', '阿珍炒档'],
    ['stall_grill', 'nm_grill', 'order', '老马烤串'],
    ['stall_sweets', 'nm_sweets', 'order', '陈记糖水'],
    ['stall_books', 'nm_books', 'shop', '旧书摊'],
    ['stall_trinkets', 'nm_trinkets', 'shop', '杂货小摊'],
  ];
  stalls.forEach(([prop, shop, kind, label], i) => {
    const x = 29 + i * 4;
    b.prop(prop, x, 80, { kind, label: `夜市 · ${label}`, data: { shop, when: 'night_market' } }, { when: 'night_market' });
    b.staff(x + 1, 79, 'down', 4210 + i, '摊主', 'vendor', 'night_market');
  });
  for (const x of [29, 33, 37, 41, 45]) b.prop('lanterns', x, 82, undefined, { noBlock: true, when: 'night_market' });
  for (const [x, y] of [[30, 83], [38, 83], [34, 85]] as [number, number][]) {
    b.prop('nm_table', x, y);
    b.prop('nm_stool', x - 1, y);
    b.prop('nm_stool_red', x + 2, y);
  }
  b.prop('fortune_table', 46, 84, { kind: 'fortune', label: '夜市 · 看相' }, { when: 'night_market' });
  b.staff(46, 83, 'down', 4220, '看相先生', 'fortune', 'night_market');
  b.prop('crane', 50, 86);
  b.prop('container', 47, 86);
  b.prop('boat', 8, 89, undefined, { noBlock: true });
  b.prop('boat', 36, 89, undefined, { noBlock: true });

  // riverside park
  b.fill(60, 76, 44, 2, 'path');
  b.fill(74, 64, 2, 26, 'path');
  b.fill(60, 64, 44, 1, 'sidewalk');
  b.fill(61, 65, 11, 8, 'court');
  b.prop('court_lines', 61, 72, undefined, { noBlock: true });
  b.prop('hoop', 61, 69);
  b.prop('hoop', 71, 69);
  b.prop('pond', 77, 86, undefined, { noBlock: true });
  b.block(78, 80, 8, 5);
  b.prop('chess_table', 68, 85);
  b.prop('chess_table', 64, 85);
  b.prop('bench', 66, 82);
  b.prop('bench', 86, 70);
  b.prop('bench', 96, 81);
  b.prop('bench', 70, 79);
  for (let i = 0; i < 26; i++) {
    const x = 60 + Math.floor(hash2(i, 3, 5) * 32);
    const y = 65 + Math.floor(hash2(3, i, 6) * 24);
    if (b.isBlocked(x, y) || (x >= 60 && x <= 72 && y <= 73) || (y >= 75 && y <= 78) || (x >= 73 && x <= 76)) continue;
    if (x >= 77 && x <= 86 && y >= 79 && y <= 86) continue;
    b.prop(['tree_round', 'tree_blossom', 'tree_autumn', 'tree_pine', 'bush'][i % 5], x, y);
  }
  for (const [x, y] of [[66, 76], [82, 76], [96, 76], [73, 70], [73, 84]] as [number, number][]) b.prop('lamp', x, y);
  b.prop('trash', 76, 75);
  b.prop('flower_pot', 91, 75);

  // parked cars along the south curb of Dock Street (parking bays)
  b.prop('car_h1', 26, 62, undefined, { oy: -5 });
  b.prop('car_h4', 34, 62, undefined, { oy: -5 });
  b.prop('car_h6', 80, 62, undefined, { oy: -5 });

  // bus stops
  for (const s of BUS_STOPS) {
    b.prop('bus_stop', s.x - 1, s.y, { kind: 'bus', label: `公交站 · ${s.name}`, data: { stop: s.id } }, { noBlock: true });
    b.block(s.x - 1, s.y, 1, 1);
    b.block(s.x + 1, s.y, 1, 1);
  }

  // NPC spots and spawns
  for (const [name, s] of Object.entries(CITY_SPOTS)) b.spot(name, s.x, s.y, s.face ?? 'down', s.sit);
  b.spawn('start', 7, 75, 'down');

  // benches can be sat on; the basketball court is open for a game
  for (const p of b.data.props) {
    if (p.id !== 'bench' || p.interact) continue;
    b.interactable(`bench@${p.x},${p.y}`, p.x, p.y, 2, 1, { kind: 'bench', label: '长椅' });
  }
  b.interactable('court', 62, 66, 9, 6, { kind: 'exercise', label: '河滨公园篮球场' });

  const data = b.finish() as CityMap;
  data.lanes = [
    { dir: 'left', fixed: HAVE.y0 + 0.5, from: HAVE.x1 + 1, to: -3 },
    { dir: 'right', fixed: HAVE.y0 + 2.5, from: -3, to: HAVE.x1 + 1 },
    { dir: 'left', fixed: DOCK.y0 + 0.5, from: DOCK.x1 + 3, to: -3 },
    { dir: 'right', fixed: DOCK.y0 + 2.5, from: -3, to: DOCK.x1 + 3 },
    { dir: 'down', fixed: CENTRAL.x0 + 0.5, from: -3, to: CENTRAL.y1 + 3 },
    { dir: 'up', fixed: CENTRAL.x0 + 2.5, from: CENTRAL.y1 + 3, to: -3 },
  ];
  // pedestrian walkways
  const walk = new Uint8Array(CITY_W * CITY_H);
  const pref = new Set(['sidewalk', 'sidewalk2', 'curb_s', 'curb_n', 'curb_e', 'curb_w', 'plaza', 'plaza2', 'plaza_fancy', 'path', 'crosswalk_h', 'crosswalk_v', 'runner_l', 'runner_c', 'runner_r', 'concrete', 'dock'].map(tileIndex));
  for (let i = 0; i < walk.length; i++) if (pref.has(data.ground[i]) && !data.blocked[i]) walk[i] = 1;
  data.walkways = walk;
  data.ambient = { day: 1, night: 0.22, color: 0x0a0a2a };
  return data;
}
