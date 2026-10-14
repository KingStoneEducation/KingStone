import { MapBuilder, type Face, type MapData } from './types';
import { buildCasinoMap } from './casinoMap';

/**
 * Interiors are drawn from small ASCII plans:
 *  '#' wall, 'D' exit door (to the city), ' ' void, other characters map to
 *  floor tiles through the legend.
 */
export function fromAscii(id: string, rows: string[], legend: Record<string, string>, wallStyle: string): MapBuilder {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`map ${id}: row ${i} has width ${r.length}, expected ${w}`);
  });
  const b = new MapBuilder(id, w, h, 'empty', false);
  const isWall = (x: number, y: number) => {
    const c = rows[y]?.[x] ?? ' ';
    return c === '#';
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x] ?? ' ';
      if (c === ' ') b.set(x, y, 'empty', true);
      else if (c === 'D') {
        b.set(x, y, 'mat', false);
      } else if (c !== '#') b.set(x, y, legend[c] ?? legend['.'], false);
    }
  }
  b.applyWalls(isWall, wallStyle);
  // exits
  const doorTiles: { x: number; y: number }[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === 'D') doorTiles.push({ x, y });
  if (doorTiles.length) {
    const x0 = Math.min(...doorTiles.map((d) => d.x));
    const y0 = doorTiles[0].y;
    b.data.doors.push({ x: x0, y: y0, w: doorTiles.length, target: 'city', spawn: `door:${id}`, label: '出口' });
    b.spawn('entry', x0 + Math.floor((doorTiles.length - 1) / 2), y0 - 1, 'up');
  }
  return b;
}

type Builder = () => MapData;

// ------------------------------------------------------------------ homes

const homeBasic: Builder = () => {
  const b = fromAscii(
    'home_basic',
    [
      '################',
      '################',
      '#,,,,,,,#;;;;;;#',
      '#,,,,,,,#;;;;;;#',
      '#,,,,,,,#;;;;;;#',
      '#,,,,,,,##;;####',
      '#......:::::::.#',
      '#......:::::::.#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#######DD#######',
    ],
    { '.': 'wood_light', ',': 'carpet_beige', ';': 'tile_blue', ':': 'tile_kitchen' },
    'cream',
  );
  b.prop('bed_double', 1, 3, { kind: 'bed', label: '床' });
  b.prop('wardrobe', 5, 2, { kind: 'wardrobe', label: '衣柜' });
  b.prop('plant', 7, 2);
  b.prop('bathtub', 12, 2);
  b.prop('toilet', 9, 2);
  b.prop('sink', 14, 2);
  b.prop('window', 2, 1, undefined, { oy: -2 });
  b.prop('clock', 6, 1, undefined, { oy: -6 });
  b.prop('fridge', 13, 6, { kind: 'kitchen', label: '冰箱与厨房' });
  b.prop('stove', 12, 6, { kind: 'kitchen', label: '冰箱与厨房' });
  b.prop('counter', 11, 6);
  b.prop('sink', 10, 6);
  b.prop('table_round', 11, 9);
  b.prop('chair', 10, 9);
  b.prop('chair', 12, 9);
  b.prop('rug', 2, 10, undefined, { noBlock: true, oy: 4 });
  b.prop('sofa', 2, 10);
  b.prop('tv', 2, 7, { kind: 'tv', label: '电视' });
  b.prop('desk', 5, 7, { kind: 'computer', label: '电脑' });
  b.prop('bookshelf', 14, 9, { kind: 'read', label: '书架' }, { noBlock: false });
  b.prop('plant', 14, 10);
  b.prop('painting', 9, 4, undefined, { oy: -2 });
  b.spawn('bed', 3, 4, 'down');
  b.data.ambient = { day: 0.95, night: 0.55, color: 0x0e0a22 };
  return b.finish();
};

const homeShared: Builder = () => {
  const b = fromAscii(
    'home_shared',
    [
      '############',
      '############',
      '#,,,,,,#...#',
      '#,,,,,,#...#',
      '#,,,,,,#...#',
      '#,,,,,,##.##',
      '#..........#',
      '#..........#',
      '#####DD#####',
    ],
    { '.': 'concrete', ',': 'carpet_grey' },
    'concrete',
  );
  b.prop('bed_single', 1, 3, { kind: 'bed', label: '床（有点硬）' });
  b.prop('desk', 3, 2, { kind: 'computer', label: '旧电脑' });
  b.prop('crate', 6, 2);
  b.prop('crate', 6, 4);
  b.prop('barrel', 1, 5);
  b.prop('fridge', 10, 2, { kind: 'kitchen', label: '公用冰箱' });
  b.prop('stove', 9, 2, { kind: 'kitchen', label: '公用灶台' });
  b.prop('sink', 8, 2);
  b.prop('window', 3, 1, undefined, { oy: -2 });
  b.prop('chair', 9, 7);
  b.prop('wardrobe', 1, 7, { kind: 'wardrobe', label: '衣箱' });
  // by the kitchen doorway, not in it
  b.staff(10, 6, 'left', 3301, '室友', 'roommate');
  b.spawn('bed', 2, 4, 'down');
  b.data.ambient = { day: 0.8, night: 0.45, color: 0x0e0a22 };
  return b.finish();
};

const homeDowntown: Builder = () => {
  const b = fromAscii(
    'home_downtown',
    [
      '####################',
      '####################',
      '#,,,,,,,,#;;;;#::::#',
      '#,,,,,,,,#;;;;#::::#',
      '#,,,,,,,,#;;;;#::::#',
      '#,,,,,,,,##;###::::#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#########DD#########',
    ],
    { '.': 'parquet', ',': 'carpet_beige', ';': 'tile_white', ':': 'tile_checker' },
    'white',
  );
  b.prop('bed_double', 2, 3, { kind: 'bed', label: '床' });
  b.prop('wardrobe', 6, 2, { kind: 'wardrobe', label: '衣帽间' });
  b.prop('lamp_floor', 1, 5);
  b.prop('bathtub', 11, 2);
  b.prop('toilet', 13, 4);
  b.prop('fridge', 18, 2, { kind: 'kitchen', label: '厨房' });
  b.prop('stove', 17, 2, { kind: 'kitchen', label: '厨房' });
  b.prop('counter', 16, 2);
  b.prop('sink', 15, 2);
  b.prop('table_round', 16, 5);
  b.prop('chair', 15, 5);
  b.prop('chair', 17, 5);
  b.prop('window_tall', 2, 1, undefined, { oy: -10 });
  b.prop('window_tall', 5, 1, undefined, { oy: -10 });
  b.prop('rug_blue', 3, 10, undefined, { noBlock: true });
  b.prop('sofa', 3, 10);
  b.prop('coffee_table', 4, 8);
  b.prop('tv', 4, 6, { kind: 'tv', label: '电视' });
  b.prop('desk', 13, 7, { kind: 'computer', label: '电脑' });
  b.prop('bookshelf', 16, 8, { kind: 'read', label: '书架' });
  b.prop('plant', 18, 10);
  b.prop('plant', 1, 10);
  b.prop('art_large', 10, 5, undefined, { oy: -4 });
  b.spawn('bed', 4, 4, 'down');
  b.data.ambient = { day: 1, night: 0.6, color: 0x0e0a22 };
  return b.finish();
};

const homeRiver: Builder = () => {
  const b = fromAscii(
    'home_river',
    [
      '########################',
      '########################',
      '#,,,,,,,,,#;;;;;#::::::#',
      '#,,,,,,,,,#;;;;;#::::::#',
      '#,,,,,,,,,#;;;;;#::::::#',
      '#,,,,,,,,,##;;###::::::#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '###########DD###########',
    ],
    { '.': 'wood_mid', ',': 'carpet_blue', ';': 'marble', ':': 'tile_checker' },
    'blue',
  );
  b.prop('bed_luxury', 2, 4, { kind: 'bed', label: '大床' });
  b.prop('wardrobe', 7, 2, { kind: 'wardrobe', label: '衣帽间' });
  b.prop('lamp_floor', 1, 5);
  b.prop('bathtub', 12, 2);
  b.prop('toilet', 15, 2);
  b.prop('fridge', 22, 2, { kind: 'kitchen', label: '开放式厨房' });
  b.prop('stove', 21, 2, { kind: 'kitchen', label: '开放式厨房' });
  b.prop('counter', 20, 2);
  b.prop('sink', 19, 2);
  b.prop('counter', 18, 2);
  b.prop('dining_table', 18, 5);
  for (const x of [2, 6, 13, 17]) b.prop('window_tall', x, 1, undefined, { oy: -10 });
  b.prop('rug', 4, 11, undefined, { noBlock: true });
  b.prop('sofa', 4, 11);
  b.prop('armchair', 8, 10);
  b.prop('coffee_table', 5, 9);
  b.prop('tv', 5, 7, { kind: 'tv', label: '电视' });
  b.prop('desk', 16, 8, { kind: 'computer', label: '工作台' });
  b.prop('bookshelf', 20, 8, { kind: 'read', label: '书架' });
  b.prop('plant', 22, 11);
  b.prop('plant', 1, 11);
  b.prop('palm', 14, 11);
  b.spawn('bed', 4, 5, 'down');
  b.data.ambient = { day: 1, night: 0.62, color: 0x0e0a22 };
  return b.finish();
};

const homePenthouse: Builder = () => {
  const b = fromAscii(
    'home_penthouse',
    [
      '############################',
      '############################',
      '#,,,,,,,,,,#;;;;;;#::::::::#',
      '#,,,,,,,,,,#;;;;;;#::::::::#',
      '#,,,,,,,,,,#;;;;;;#::::::::#',
      '#,,,,,,,,,,##;;####::::::::#',
      '#..........................#',
      '#..........................#',
      '#..........................#',
      '#..........................#',
      '#..........................#',
      '#..........................#',
      '#..........................#',
      '#..........................#',
      '#############DD#############',
    ],
    { '.': 'marble', ',': 'carpet_vip0', ';': 'marble2', ':': 'marble_dark' },
    'marble',
  );
  b.prop('bed_luxury', 2, 4, { kind: 'bed', label: '大床' });
  b.prop('wardrobe', 8, 2, { kind: 'wardrobe', label: '步入式衣帽间' });
  b.prop('lamp_floor', 1, 5);
  b.prop('bathtub', 13, 2);
  b.prop('toilet', 16, 2);
  b.prop('fridge', 26, 2, { kind: 'kitchen', label: '主厨厨房' });
  b.prop('stove', 25, 2, { kind: 'kitchen', label: '主厨厨房' });
  b.prop('counter', 24, 2);
  b.prop('sink', 23, 2);
  b.prop('bar_counter_lux', 20, 5);
  b.prop('bar_counter_lux', 21, 5);
  b.prop('bar_counter_lux', 22, 5);
  b.prop('bottle_shelf', 20, 1, undefined, { oy: -2 });
  for (const x of [2, 6, 13, 21, 25]) b.prop('window_tall', x, 1, undefined, { oy: -10 });
  b.prop('piano', 22, 9, { kind: 'piano', label: '钢琴' });
  b.prop('rug', 5, 12, undefined, { noBlock: true });
  b.prop('sofa_red', 5, 12);
  b.prop('armchair', 9, 11);
  b.prop('armchair', 3, 11);
  b.prop('coffee_table', 6, 10);
  b.prop('tv', 6, 7, { kind: 'tv', label: '影音室' });
  b.prop('desk', 14, 8, { kind: 'computer', label: '书房电脑' });
  b.prop('bookshelf', 17, 8, { kind: 'read', label: '书架' });
  b.prop('palm', 1, 13);
  b.prop('palm', 26, 13);
  b.prop('art_large', 11, 5, undefined, { oy: -4 });
  b.spawn('bed', 4, 5, 'down');
  b.data.ambient = { day: 1, night: 0.65, color: 0x0e0a22 };
  return b.finish();
};

const homeEstate: Builder = () => {
  const b = fromAscii(
    'home_estate',
    [
      '################################',
      '################################',
      '#,,,,,,,,,,#;;;;;;;;#::::::::::#',
      '#,,,,,,,,,,#;;;;;;;;#::::::::::#',
      '#,,,,,,,,,,#;;;;;;;;#::::::::::#',
      '#,,,,,,,,,,#;;;;;;;;#::::::::::#',
      '#,,,,,,,,,,##;;;;;;##::::::::::#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '#..............................#',
      '###############DD###############',
    ],
    { '.': 'parquet', ',': 'carpet_green', ';': 'wood_dark', ':': 'marble' },
    'darkwood',
  );
  b.prop('bed_luxury', 2, 4, { kind: 'bed', label: '主卧大床' });
  b.prop('wardrobe', 8, 2, { kind: 'wardrobe', label: '衣帽间' });
  b.prop('lamp_floor', 1, 6);
  b.prop('fireplace', 14, 1, undefined, { oy: -2 });
  for (const x of [12, 18]) b.prop('bookshelf', x, 2, { kind: 'read', label: '藏书室' });
  b.prop('armchair', 14, 5);
  b.prop('armchair', 17, 5);
  b.prop('globe', 19, 5);
  b.prop('fridge', 30, 2, { kind: 'kitchen', label: '厨房' });
  b.prop('stove', 29, 2, { kind: 'kitchen', label: '厨房' });
  b.prop('counter', 28, 2);
  b.prop('sink', 27, 2);
  b.prop('dining_table', 23, 5);
  b.prop('dining_table', 26, 5);
  b.prop('chandelier', 24, 3, undefined, { noBlock: true });
  b.prop('piano', 26, 10, { kind: 'piano', label: '三角钢琴' });
  b.prop('rug_green', 6, 13, undefined, { noBlock: true });
  b.prop('sofa_red', 6, 13);
  b.prop('armchair', 10, 12);
  b.prop('coffee_table', 7, 11);
  b.prop('tv', 7, 9, { kind: 'tv', label: '影音室' });
  b.prop('desk', 17, 9, { kind: 'computer', label: '书房' });
  b.prop('art_large', 22, 6, undefined, { oy: -4 });
  b.prop('palm', 1, 14);
  b.prop('palm', 30, 14);
  b.prop('pillar', 13, 13);
  b.prop('pillar', 18, 13);
  b.staff(21, 10, 'down', 3402, '管家', 'butler');
  b.spawn('bed', 4, 5, 'down');
  b.data.ambient = { day: 0.95, night: 0.6, color: 0x0e0a22 };
  return b.finish();
};

// ------------------------------------------------------------------ shops & venues

const store: Builder = () => {
  const b = fromAscii(
    'store',
    [
      '##############',
      '##############',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#####DD#######',
    ],
    { '.': 'tile_white' },
    'white',
  );
  b.prop('fridge_case', 1, 2);
  b.prop('fridge_case', 3, 2);
  b.prop('fridge_case', 5, 2);
  b.prop('shelf', 8, 2);
  b.prop('shelf', 10, 2);
  b.prop('shelf', 2, 5);
  b.prop('shelf', 6, 5);
  b.prop('shelf', 2, 7);
  b.prop('shelf', 6, 7);
  b.prop('magazine_rack', 12, 5, { kind: 'shop', label: '书报架', data: { shop: 'store' } });
  b.prop('register', 9, 8, { kind: 'shop', label: '收银台', data: { shop: 'store' } });
  b.prop('plant', 12, 8);
  b.prop('neon_open', 9, 1, undefined, { oy: -2 });
  b.staff(10, 7, 'down', 2201, '店员', 'clerk');
  b.spot('store_aisle', 4, 6, 'up');
  b.spot('store_aisle2', 8, 6, 'up');
  b.data.ambient = { day: 1, night: 0.95, color: 0x10101a };
  return b.finish();
};

const cafe: Builder = () => {
  const b = fromAscii(
    'cafe',
    [
      '################',
      '################',
      '#..............#',
      '#..............#',
      '#,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,#',
      '#######D########',
    ],
    { '.': 'wood_dark', ',': 'wood_mid' },
    'pastel',
  );
  b.prop('espresso', 2, 3);
  for (let x = 3; x <= 8; x++) b.prop('cafe_counter', x, 3, x === 6 ? { kind: 'order', label: '点单柜台', data: { shop: 'cafe' } } : undefined);
  b.prop('pastry_case', 9, 3, { kind: 'order', label: '点单柜台', data: { shop: 'cafe' } });
  b.prop('chalkboard', 3, 1, undefined, { oy: -2 });
  b.prop('window', 11, 1, undefined, { oy: -2 });
  b.prop('plant', 14, 2);
  b.prop('plant', 1, 9);
  for (const [x, y] of [[3, 6], [7, 6], [11, 6], [3, 9], [10, 9], [13, 8]] as [number, number][]) {
    b.prop('table_round', x, y);
    b.prop('chair_cafe', x - 1, y);
    if (x < 13) b.prop('chair_cafe', x + 1, y);
  }
  b.prop('bookshelf', 13, 3, { kind: 'read', label: '借阅书架' });
  b.spot('cafe_counter', 5, 2, 'down');
  b.spot('cafe_counter2', 7, 2, 'down');
  b.spot('cafe_window', 12, 6, 'left', true);
  b.spot('cafe_table1', 4, 6, 'left', true);
  b.spot('cafe_table2', 6, 6, 'right', true);
  b.spot('cafe_table3', 9, 9, 'right', true);
  b.interactable('cafe_work', 7, 2, 1, 1, { kind: 'work', label: '咖啡师工位', data: { job: 'barista' } });
  b.data.ambient = { day: 1, night: 0.8, color: 0x140c1a };
  return b.finish();
};

const restaurant: Builder = () => {
  const b = fromAscii(
    'restaurant',
    [
      '##################',
      '##################',
      '#;;;;;;;;;;;;;;;;#',
      '#;;;;;;;;;;;;;;;;#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '#................#',
      '########DD########',
    ],
    { '.': 'tile_checker', ';': 'tile_kitchen' },
    'cream',
  );
  for (let x = 2; x <= 9; x++) b.prop('counter', x, 3);
  b.prop('stove', 11, 3);
  b.prop('stove', 12, 3);
  b.prop('fridge', 14, 3);
  b.prop('sink', 15, 3);
  b.prop('bottle_shelf', 2, 1, undefined, { oy: -2 });
  b.prop('painting', 13, 1, undefined, { oy: -2 });
  for (const [x, y] of [[2, 6], [7, 6], [13, 6], [2, 9], [6, 9], [12, 9]] as [number, number][]) {
    b.prop('dining_table', x, y, { kind: 'order', label: '点菜', data: { shop: 'restaurant' } });
    b.prop('chair', x - 1, y);
    b.prop('chair', x + 2, y);
  }
  b.prop('booth', 15, 10, { kind: 'order', label: '点菜', data: { shop: 'restaurant' } });
  b.prop('plant', 1, 10);
  b.prop('plant', 16, 4);
  b.spot('rest_host', 10, 10, 'up');
  b.spot('rest_pass', 6, 4, 'up');
  b.spot('rest_table1', 3, 5, 'down', true);
  b.spot('rest_table2', 7, 5, 'down', true);
  b.spot('rest_table3', 13, 5, 'down', true);
  b.interactable('rest_work', 6, 4, 1, 1, { kind: 'work', label: '传菜口（上班）', data: { job: 'waiter' } });
  b.staff(4, 2, 'down', 2302, '厨师', 'cook');
  b.data.ambient = { day: 0.95, night: 0.7, color: 0x140c1a };
  return b.finish();
};

const bar: Builder = () => {
  const b = fromAscii(
    'bar',
    [
      '##################',
      '##################',
      '#................#',
      '#................#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#########D########',
    ],
    { '.': 'wood_dark', ',': 'wood_mid' },
    'brick',
  );
  b.prop('bottle_shelf', 2, 1, undefined, { oy: -2 });
  b.prop('bottle_shelf', 6, 1, undefined, { oy: -2 });
  b.prop('neon_beer', 11, 1, undefined, { oy: -2 });
  for (let x = 2; x <= 9; x++) b.prop('bar_counter', x, 4, x === 5 ? { kind: 'order', label: '吧台', data: { shop: 'bar' } } : undefined);
  for (const x of [2, 4, 6, 8]) b.prop('stool', x, 5, undefined, { noBlock: true });
  b.prop('pool_table', 12, 7);
  b.prop('jukebox', 16, 3);
  b.prop('dartboard', 16, 5, undefined, { oy: -8 });
  b.prop('booth', 2, 9);
  b.prop('booth', 5, 9);
  b.prop('booth', 8, 9);
  b.prop('stage', 11, 10, undefined, { noBlock: true });
  b.prop('barrel', 1, 3);
  b.spot('bar_counter', 5, 3, 'down');
  b.spot('bar_back', 7, 3, 'down');
  b.spot('bar_stool2', 4, 5, 'up', true);
  b.spot('bar_stool3', 8, 5, 'up', true);
  b.spot('bar_table1', 3, 8, 'down', true);
  b.spot('bar_table2', 6, 8, 'down', true);
  b.interactable('bar_work', 7, 3, 1, 1, { kind: 'work', label: '吧台后（上班）', data: { job: 'bartender' } });
  b.data.ambient = { day: 0.6, night: 0.5, color: 0x1a0c10 };
  return b.finish();
};

const boutique: Builder = () => {
  const b = fromAscii(
    'boutique',
    [
      '##############',
      '##############',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#####DD#######',
    ],
    { '.': 'wood_light' },
    'cream',
  );
  b.prop('clothes_rack', 1, 3, { kind: 'shop', label: '服装', data: { shop: 'boutique' } });
  b.prop('clothes_rack', 4, 3, { kind: 'shop', label: '服装', data: { shop: 'boutique' } });
  b.prop('clothes_rack', 1, 6, { kind: 'shop', label: '服装', data: { shop: 'boutique' } });
  b.prop('mannequin', 8, 3);
  b.prop('mannequin', 10, 3);
  b.prop('mirror', 12, 1, undefined, { oy: -6 });
  b.prop('register', 9, 7, { kind: 'shop', label: '收银台', data: { shop: 'boutique' } });
  b.prop('display_case', 4, 7, { kind: 'shop', label: '饰品柜', data: { shop: 'boutique' } });
  b.prop('plant', 12, 7);
  b.prop('rug', 5, 6, undefined, { noBlock: true });
  b.interactable('boutique_mirror', 12, 2, 1, 1, { kind: 'mirror', label: '试衣镜' });
  b.spot('boutique_counter', 10, 6, 'down');
  b.spot('boutique_rack', 4, 4, 'up');
  b.data.ambient = { day: 1, night: 0.9, color: 0x14101a };
  return b.finish();
};

const bank: Builder = () => {
  const b = fromAscii(
    'bank',
    [
      '##################',
      '##################',
      '#................#',
      '#................#',
      '#................#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '########DD########',
    ],
    { '.': 'carpet_blue', ',': 'marble' },
    'marble',
  );
  for (let x = 2; x <= 8; x++) b.prop('teller', x, 4, x % 3 === 2 ? { kind: 'teller', label: '柜台业务', data: {} } : undefined);
  b.prop('vault', 13, 1, undefined, { oy: -6 });
  b.prop('boss_desk', 12, 6, { kind: 'teller', label: '信贷业务', data: { loans: true } });
  b.prop('chair', 13, 7);
  b.prop('atm', 16, 7, { kind: 'atm', label: 'ATM', data: { where: 'branch' } });
  b.prop('velvet_post', 3, 7);
  b.prop('velvet_post', 6, 7);
  b.prop('velvet_post', 9, 7);
  b.prop('plant', 1, 10);
  b.prop('plant', 16, 10);
  b.prop('palm', 10, 10);
  b.prop('clock', 9, 1, undefined, { oy: -6 });
  for (const x of [2, 5]) b.staff(x, 3, 'down', 2401 + x, '柜员', 'teller');
  b.spot('bank_loan_desk', 13, 5, 'down');
  b.data.ambient = { day: 1, night: 0.9, color: 0x10101a };
  return b.finish();
};

const office: Builder = () => {
  const b = fromAscii(
    'office',
    [
      '####################',
      '####################',
      '#..........#,,,,,,,#',
      '#..........#,,,,,,,#',
      '#..........#,,,,,,,#',
      '#..........##,,#####',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '########DD##########',
    ],
    { '.': 'carpet_blue', ',': 'carpet_grey' },
    'blue',
  );
  b.prop('cubicle', 1, 3, { kind: 'work', label: '你的工位', data: { job: 'office_clerk' } });
  b.prop('cubicle', 4, 3);
  b.prop('cubicle', 7, 3);
  b.prop('cubicle', 1, 7);
  b.prop('cubicle', 4, 7);
  b.prop('cubicle', 7, 7);
  b.prop('boss_desk', 14, 3);
  b.prop('filing', 18, 2);
  b.prop('plant', 12, 2);
  b.prop('whiteboard', 2, 1, undefined, { oy: -4 });
  b.prop('water_cooler', 10, 9);
  b.prop('printer', 13, 9);
  b.prop('plant', 18, 10);
  b.prop('filing', 16, 9);
  b.spot('desk_player', 2, 4, 'up');
  b.spot('office_desk2', 5, 4, 'up', true);
  b.spot('office_boss', 15, 4, 'up');
  b.staff(8, 4, 'up', 2501, '同事', 'coworker');
  b.staff(5, 8, 'up', 2502, '同事', 'coworker');
  b.data.ambient = { day: 1, night: 0.85, color: 0x10101a };
  return b.finish();
};

const financeOffice: Builder = () => {
  const b = fromAscii(
    'finance_office',
    [
      '####################',
      '####################',
      '#,,,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,,,#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#..................#',
      '#########DD#########',
    ],
    { '.': 'marble_dark', ',': 'carpet_grey' },
    'white',
  );
  for (let y = 2; y <= 5; y++) b.prop('glass_wall', 10, y);
  b.prop('meeting_table', 12, 4);
  b.prop('cubicle', 1, 3, { kind: 'work', label: '分析师工位', data: { job: 'analyst' } });
  b.prop('cubicle', 4, 3);
  b.prop('cubicle', 7, 3);
  b.prop('whiteboard', 13, 1, undefined, { oy: -4 });
  b.prop('art_large', 4, 1, undefined, { oy: -4 });
  b.prop('register', 9, 8, { kind: 'sign', label: '前台', data: { text: '前台接待：「欢迎来到北门资本。如需投资咨询，可以通过手机银行 App 自助交易；招聘信息请关注招聘 App。」' } });
  b.prop('palm', 1, 9);
  b.prop('palm', 18, 9);
  b.prop('sofa', 14, 9);
  b.staff(10, 7, 'down', 2601, '前台', 'reception');
  b.spot('fin_sophia', 13, 6, 'up');
  b.spot('desk_analyst', 2, 4, 'up');
  b.data.ambient = { day: 1, night: 0.85, color: 0x10101a };
  return b.finish();
};

const club: Builder = () => {
  const b = fromAscii(
    'club',
    [
      '####################',
      '####################',
      '#,,,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,,,#',
      '#########DD#########',
    ],
    { ',': 'carpet_green' },
    'darkwood',
  );
  b.prop('fireplace', 8, 1, undefined, { oy: -2 });
  b.prop('bookshelf', 2, 2);
  b.prop('bookshelf', 4, 2);
  b.prop('bookshelf', 14, 2);
  b.prop('armchair', 7, 4);
  b.prop('armchair', 11, 4);
  b.prop('coffee_table', 8, 5);
  b.prop('armchair', 3, 7);
  b.prop('armchair', 6, 7);
  b.prop('globe', 17, 4);
  b.prop('pool_table', 13, 8);
  for (let x = 1; x <= 4; x++) b.prop('bar_counter', x, 10, x === 2 ? { kind: 'order', label: '会所吧台', data: { shop: 'club_bar' } } : undefined);
  b.prop('bottle_shelf', 1, 8, undefined, { oy: 0, noBlock: true });
  b.prop('chandelier', 8, 6, undefined, { noBlock: true });
  b.prop('painting', 16, 1, undefined, { oy: -2 });
  b.staff(2, 9, 'down', 2701, '侍者', 'waiter');
  b.spot('club_lounge1', 8, 4, 'down', true);
  b.spot('club_lounge2', 12, 4, 'down', true);
  b.spot('club_lounge3', 4, 7, 'down', true);
  b.spot('club_bar', 3, 11, 'up');
  b.data.ambient = { day: 0.7, night: 0.55, color: 0x140c10 };
  return b.finish();
};

const fineDining: Builder = () => {
  const b = fromAscii(
    'fine_dining',
    [
      '##################',
      '##################',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '#,,,,,,,,,,,,,,,,#',
      '########DD########',
    ],
    { ',': 'carpet_vip1' },
    'purple',
  );
  for (const [x, y] of [[2, 4], [7, 4], [12, 4], [2, 7], [12, 7]] as [number, number][]) {
    b.prop('dining_table', x, y, { kind: 'order', label: '用餐', data: { shop: 'fine_dining' } });
    b.prop('chair', x - 1, y);
    b.prop('chair', x + 2, y);
  }
  b.prop('piano', 4, 8, { kind: 'piano', label: '钢琴' });
  b.prop('chandelier', 4, 3, undefined, { noBlock: true });
  b.prop('chandelier', 11, 3, undefined, { noBlock: true });
  b.prop('art_large', 7, 1, undefined, { oy: -4 });
  b.prop('palm', 16, 2);
  b.prop('palm', 1, 2);
  b.staff(15, 8, 'left', 2801, '侍者', 'maitre');
  b.spot('fd_table1', 3, 3, 'down', true);
  b.spot('fd_table2', 8, 3, 'down', true);
  b.spot('fd_table3', 13, 3, 'down', true);
  b.data.ambient = { day: 0.55, night: 0.5, color: 0x120a1a };
  return b.finish();
};

const luxury: Builder = () => {
  const b = fromAscii(
    'luxury',
    [
      '##############',
      '##############',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#####DD#######',
    ],
    { '.': 'marble' },
    'marble',
  );
  b.prop('display_case', 2, 4, { kind: 'shop', label: '腕表与珠宝', data: { shop: 'luxury' } });
  b.prop('display_case', 6, 4, { kind: 'shop', label: '腕表与珠宝', data: { shop: 'luxury' } });
  b.prop('mannequin', 10, 3);
  b.prop('mannequin', 12, 3);
  b.prop('clothes_rack', 10, 6, { kind: 'shop', label: '高级成衣', data: { shop: 'luxury' } });
  b.prop('mirror', 1, 1, undefined, { oy: -6 });
  b.prop('palm', 1, 7);
  b.prop('chandelier', 5, 3, undefined, { noBlock: true });
  b.staff(4, 6, 'down', 2901, '店员', 'clerk');
  b.spot('lux_display', 4, 5, 'up');
  b.spot('lux_browse', 9, 5, 'up');
  b.data.ambient = { day: 1, night: 0.9, color: 0x14101a };
  return b.finish();
};

const motors: Builder = () => {
  const b = fromAscii(
    'motors',
    [
      '######################',
      '######################',
      '#.........#;;;;;;;;;;#',
      '#.........#;;;;;;;;;;#',
      '#.........#;;;;;;;;;;#',
      '#.........#;;;;;;;;;;#',
      '#.........##;;;;;;;;;#',
      '#....................#',
      '#....................#',
      '#....................#',
      '#######DD#############',
    ],
    { '.': 'tile_white', ';': 'concrete' },
    'white',
  );
  b.prop('car_h0', 1, 4, { kind: 'shop', label: '展厅车辆', data: { shop: 'motors' } });
  b.prop('car_h2', 5, 4, { kind: 'shop', label: '展厅车辆', data: { shop: 'motors' } });
  b.prop('car_h5', 2, 8, { kind: 'shop', label: '展厅车辆', data: { shop: 'motors' } });
  b.prop('boss_desk', 15, 9, { kind: 'shop', label: '销售台', data: { shop: 'motors' } });
  b.prop('car_lift', 13, 5);
  b.prop('tool_board', 17, 1, undefined, { oy: -4 });
  b.prop('barrel', 20, 2);
  b.prop('crate', 20, 4);
  b.prop('plant', 9, 2);
  b.spot('motors_floor', 8, 8, 'down');
  b.spot('motors_bay', 16, 6, 'left');
  b.data.ambient = { day: 1, night: 0.85, color: 0x10101a };
  return b.finish();
};

const BUILDERS: Record<string, Builder> = {
  home_basic: homeBasic,
  home_shared: homeShared,
  home_downtown: homeDowntown,
  home_river: homeRiver,
  home_penthouse: homePenthouse,
  home_estate: homeEstate,
  store,
  cafe,
  restaurant,
  bar,
  boutique,
  bank,
  office,
  finance_office: financeOffice,
  club,
  fine_dining: fineDining,
  luxury,
  motors,
  casino: buildCasinoMap,
};

const cache = new Map<string, MapData>();

export function interiorMap(id: string): MapData {
  let m = cache.get(id);
  if (!m) {
    const fn = BUILDERS[id];
    if (!fn) throw new Error(`no interior map for ${id}`);
    m = fn();
    cache.set(id, m);
  }
  return m;
}

export function allInteriorIds(): string[] {
  return Object.keys(BUILDERS);
}

export type { Face };
