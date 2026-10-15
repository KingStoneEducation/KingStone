import { MapBuilder, type MapData } from './types';

/** Table anchors (bottom-left tile of the footprint) shared with the scene for seating. */
export const CASINO_TABLES: Record<string, { x: number; y: number; prop: string; dealer: { x: number; y: number; face: 'down' | 'right' }; ox?: number; oy?: number }> = {
  bj1: { x: 4, y: 17, prop: 'bj_table', dealer: { x: 5, y: 14, face: 'down' } },
  bj2: { x: 10, y: 17, prop: 'bj_table', dealer: { x: 11, y: 14, face: 'down' } },
  bj3: { x: 16, y: 17, prop: 'bj_table', dealer: { x: 17, y: 14, face: 'down' } },
  rl1: { x: 25, y: 18, prop: 'roulette_table', dealer: { x: 24, y: 17, face: 'right' } },
  rl2: { x: 32, y: 18, prop: 'roulette_table', dealer: { x: 31, y: 17, face: 'right' } },
  bac1: { x: 45, y: 18, prop: 'bac_table', dealer: { x: 46, y: 15, face: 'down' } },
  bac2: { x: 52, y: 18, prop: 'bac_table', dealer: { x: 53, y: 15, face: 'down' } },
  bjh: { x: 46, y: 7, prop: 'bj_table', dealer: { x: 47, y: 4, face: 'down' } },
  rlh: { x: 51, y: 8, prop: 'roulette_table', dealer: { x: 50, y: 7, face: 'right' } },
  bach: { x: 57, y: 8, prop: 'bac_table', dealer: { x: 58, y: 5, face: 'down' } },
  bacv: { x: 25, y: 8, prop: 'bac_table', dealer: { x: 26, y: 5, face: 'down' } },
  bjv: { x: 35, y: 8, prop: 'bj_table', dealer: { x: 36, y: 5, face: 'down' } },
  pk1: { x: 12, y: 5, prop: 'poker_table', ox: 8, oy: -2, dealer: { x: 14, y: 2, face: 'down' } },
  pk2: { x: 17, y: 8, prop: 'poker_table', ox: 8, dealer: { x: 19, y: 6, face: 'down' } },
};

export type CasinoArea = 'floor' | 'poker' | 'vip' | 'high' | 'office' | 'sky_lobby' | 'sky_lounge' | 'sky_bar' | 'spa' | 'boutique' | 'suite';

/** Width of the ground floor; the upper floor starts at SKY_X. */
export const MAIN_W = 64;
export const SKY_X = 70;
export const SKY_W = 50;
export const SKY_H = 36;
/** Tiles in front of the two lift doors. */
export const LIFT_GROUND = { x: 42, y: 2 };
export const LIFT_SKY = { x: SKY_X + 24, y: 2 };

export function isSkyFloor(tx: number): boolean {
  return tx >= SKY_X;
}

/** Which room of the casino a floor tile belongs to (matches the partitions drawn below). */
export function casinoArea(tx: number, ty: number): CasinoArea {
  if (tx >= SKY_X) {
    const lx = tx - SKY_X;
    if (ty >= 21) return lx <= 15 ? 'spa' : lx <= 30 ? 'boutique' : 'suite';
    return lx <= 17 ? 'sky_lounge' : lx <= 31 ? 'sky_lobby' : 'sky_bar';
  }
  if (tx >= 12 && tx <= 21 && ty >= 2 && ty <= 9) return 'poker';
  if (tx >= 23 && tx <= 40 && ty >= 2 && ty <= 10) return 'vip';
  if (tx >= 45 && tx <= 62 && ty >= 2 && ty <= 11) return 'high';
  if (tx <= 9 && ty >= 37) return 'office';
  return 'floor';
}

export function buildCasinoMap(): MapData {
  const W = MAIN_W;
  const H = 44;
  const b = new MapBuilder('casino', SKY_X + SKY_W, H, 'carpet_casino0', false);
  b.fill(0, 0, W, H, (x, y) => `carpet_casino${(x % 2) + (y % 2) * 2}`);
  const wall = new Set<number>();
  const w = (x: number, y: number) => wall.add(y * W + x);
  const hw = (x0: number, x1: number, y: number) => {
    for (let x = x0; x <= x1; x++) w(x, y);
  };
  const vw = (x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) w(x, y);
  };
  // outer walls
  hw(0, W - 1, 0);
  hw(0, W - 1, 1);
  hw(0, W - 1, H - 1);
  vw(0, 0, H - 1);
  vw(W - 1, 0, H - 1);
  // cashier / poker / VIP / high-limit partitions
  vw(11, 2, 10);
  hw(12, 21, 10);
  vw(22, 2, 11);
  hw(22, 41, 11);
  vw(41, 2, 11);
  vw(44, 2, 12);
  hw(44, 62, 12);
  // manager office
  hw(0, 10, 36);
  vw(10, 36, H - 1);
  // openings
  const open = (x: number, y: number) => wall.delete(y * W + x);
  open(31, H - 1);
  open(32, H - 1);
  open(16, 10);
  open(17, 10);
  open(31, 11);
  open(32, 11);
  open(52, 12);
  open(53, 12);
  open(10, 39);

  // floors per zone
  b.fill(1, 2, 10, 5, 'marble_dark');
  b.fill(12, 2, 10, 8, 'carpet_green');
  b.fill(23, 2, 18, 9, (x, y) => `carpet_vip${(x % 2) + (y % 2) * 2}`);
  b.fill(45, 2, 18, 10, (x, y) => `carpet_vip${(x % 2) + (y % 2) * 2}`);
  b.fill(1, 37, 9, 6, 'carpet_grey');
  b.fill(26, 37, 12, 6, 'marble');
  b.fill(42, 26, 21, 4, 'wood_dark');
  b.applyWalls((x, y) => x < W && wall.has(y * W + x), 'red');
  // the doors are floor
  b.set(31, H - 1, 'mat', false);
  b.set(32, H - 1, 'mat', false);
  b.data.doors.push({ x: 31, y: H - 1, w: 2, target: 'city', spawn: 'door:casino', label: '出口' });
  b.spawn('entry', 31, H - 2, 'up');
  // the poker room is open to everyone
  b.set(16, 10, 'carpet_green', false);
  b.set(17, 10, 'carpet_green', false);
  // gates (blocked; interacting asks for access)
  for (const [x, y] of [[31, 11], [32, 11], [52, 12], [53, 12], [10, 39]] as [number, number][]) {
    b.set(x, y, x === 10 ? 'carpet_grey' : y === 11 ? 'carpet_vip0' : y === 12 ? 'carpet_vip0' : 'carpet_green', true);
  }
  b.interactable('gate_vip', 31, 11, 2, 1, { kind: 'gate', label: 'VIP 私人厅入口', data: { area: 'vip', inside: '31,10', outside: '31,12' } });
  b.interactable('gate_high', 52, 12, 2, 1, { kind: 'gate', label: '高额投注区入口', data: { area: 'high', inside: '52,11', outside: '52,13' } });
  b.interactable('gate_office', 10, 39, 1, 1, { kind: 'gate', label: '经理办公室', data: { area: 'office', inside: '9,39', outside: '11,39' } });
  b.prop('velvet_post', 15, 11);
  b.prop('velvet_post', 18, 11);
  b.prop('velvet_post', 30, 12);
  b.prop('velvet_post', 33, 12);
  b.prop('velvet_post', 51, 13);
  b.prop('velvet_post', 54, 13);
  b.prop('poker_sign', 13, 10, { kind: 'tourney', label: '扑克室告示：周日锦标赛' }, { oy: -2 });

  // the members' lift, at the end of the corridor between the VIP salon and the high-limit room
  b.fill(42, 2, 2, 11, 'marble_dark');
  b.prop('lift_ground', LIFT_GROUND.x, 1, undefined);
  b.interactable('lift_ground', LIFT_GROUND.x, 1, 2, 1, { kind: 'elevator', label: '会员电梯 · 天穹层', data: { to: `${LIFT_SKY.x},${LIFT_SKY.y}`, floor: 'sky' } });
  b.staff(43, 4, 'left', 1601, '电梯礼宾', 'lift');
  b.prop('sign_lift', 42, 9, undefined, { noBlock: true, ox: 8 });
  b.prop('palm', 41, 12);

  // cashier cage
  for (let x = 2; x <= 9; x++) b.prop('cage', x, 7, { kind: 'cashier', label: '筹码兑换台' });
  b.prop('neon_cashier', 3, 1, undefined, { oy: -1 });
  b.staff(4, 5, 'down', 1101, '兑换员', 'cashier');
  b.staff(7, 5, 'down', 1102, '兑换员', 'cashier');
  b.prop('atm', 10, 9, { kind: 'atm', label: '赌场 ATM（手续费 6 G）', data: { where: 'casino' } });
  b.prop('vault', 6, 1, undefined, { oy: -6 });

  // poker room: two no-limit hold'em tables
  for (const id of ['pk1', 'pk2'] as const) {
    const t = CASINO_TABLES[id];
    b.prop(t.prop, t.x, t.y, { kind: 'table', label: id === 'pk1' ? '德州扑克 · 1/2' : '德州扑克 · 5/10', data: { table: id } }, { ox: t.ox, oy: t.oy });
  }
  // the first table overhangs its footprint by half a tile
  b.block(16, 4, 1, 2);
  b.prop('neon_poker', 15, 1, undefined, { oy: -1 });

  // VIP salon
  b.prop(CASINO_TABLES.bacv.prop, CASINO_TABLES.bacv.x, CASINO_TABLES.bacv.y, { kind: 'table', label: 'VIP 百家乐', data: { table: 'bacv' } });
  b.prop(CASINO_TABLES.bjv.prop, CASINO_TABLES.bjv.x, CASINO_TABLES.bjv.y, { kind: 'table', label: 'VIP 21点', data: { table: 'bjv' } });
  for (let x = 37; x <= 40; x++) b.prop('bar_counter_lux', x, 3, x === 38 ? { kind: 'order', label: 'VIP 吧台', data: { shop: 'casino_bar' } } : undefined);
  b.prop('bottle_shelf', 36, 1, undefined, { oy: -2 });
  b.prop('sofa_red', 23, 10);
  b.prop('palm', 23, 3);
  b.prop('palm', 40, 10);
  b.prop('chandelier', 29, 4, undefined, { noBlock: true });
  b.prop('neon_vip', 25, 1, undefined, { oy: -1 });
  b.spot('vip_bac1', 26, 9, 'up', true);
  b.spot('vip_bac2', 28, 9, 'up', true);
  b.spot('vip_host', 34, 12, 'down');

  // high-limit room
  for (const id of ['bjh', 'rlh', 'bach'] as const) {
    const t = CASINO_TABLES[id];
    b.prop(t.prop, t.x, t.y, { kind: 'table', label: id === 'bjh' ? '高额 21点' : id === 'rlh' ? '高额轮盘' : '高额百家乐', data: { table: id } });
  }
  b.prop('neon_high', 46, 12, undefined, { oy: -1 });
  b.prop('chandelier', 52, 3, undefined, { noBlock: true });
  b.prop('palm', 45, 11);
  b.prop('palm', 61, 11);

  // main floor tables
  for (const id of ['bj1', 'bj2', 'bj3', 'rl1', 'rl2', 'bac1', 'bac2'] as const) {
    const t = CASINO_TABLES[id];
    const label = id.startsWith('bj') ? `21点 · ${id === 'bj3' ? '欢乐桌' : `${id.slice(2)}号桌`}` : id.startsWith('rl') ? `欧式轮盘 · ${id.slice(2)}号` : `百家乐 · ${id.slice(3)}号`;
    b.prop(t.prop, t.x, t.y, { kind: 'table', label, data: { table: id } });
  }
  b.prop('neon_blackjack', 18, 10, undefined, { oy: -1 });
  b.prop('neon_roulette', 26, 11, undefined, { oy: -1 });
  b.prop('neon_baccarat', 55, 12, undefined, { oy: -1 });
  for (const [x, y] of [[21, 14], [42, 14], [21, 24], [42, 24]] as [number, number][]) b.prop('pillar', x, y);
  b.prop('chandelier', 9, 13, undefined, { noBlock: true });
  b.prop('chandelier', 30, 13, undefined, { noBlock: true });
  b.prop('chandelier', 50, 13, undefined, { noBlock: true });
  b.prop('chandelier', 30, 25, undefined, { noBlock: true });

  // slots
  for (const y of [27, 31]) for (let x = 2; x <= 16; x++) if (x !== 9) b.prop(`slot${x % 3}`, x, y, { kind: 'slots', label: '老虎机' });
  b.prop('neon_slots', 4, 36, undefined, { oy: -1 });

  // central slot island with a progressive jackpot display
  for (let x = 25; x <= 37; x++) if (x !== 31) b.prop(`slot${(x + 1) % 3}`, x, 24, { kind: 'slots', label: '老虎机' });
  b.prop('neon_slots', 29, 22, undefined, { noBlock: true, oy: -10 });
  b.prop('plant', 31, 24);
  b.prop('palm', 24, 24);
  b.prop('palm', 38, 24);

  // Lucky 7 bar & lounge
  for (let x = 44; x <= 53; x++) b.prop('bar_counter_lux', x, 28, x === 48 ? { kind: 'order', label: '幸运七酒吧', data: { shop: 'casino_bar' } } : undefined);
  for (const x of [45, 47, 49, 51, 53]) b.prop('stool', x, 29, undefined, { noBlock: true });
  b.staff(48, 27, 'down', 1201, '调酒师', 'bartender');
  b.prop('sofa_red', 45, 35);
  b.prop('sofa_red', 51, 35);
  b.prop('sofa_red', 57, 35);
  b.prop('coffee_table', 46, 33);
  b.prop('coffee_table', 52, 33);
  b.prop('coffee_table', 58, 33);
  b.prop('palm', 43, 38);
  b.prop('palm', 61, 38);
  b.prop('palm', 61, 30);
  b.prop('chandelier', 52, 31, undefined, { noBlock: true });
  b.prop('neon_bar', 55, 26, undefined, { noBlock: true, oy: -14 });
  b.prop('stage', 54, 41, undefined, { noBlock: true });
  b.block(54, 40, 4, 2);
  b.prop('piano', 55, 40);
  b.staff(58, 40, 'down', 1501, '驻场歌手', 'singer');

  // entrance & security
  b.prop('detector', 30, 40);
  b.prop('velvet_post', 27, 39);
  b.prop('velvet_post', 36, 39);
  b.prop('palm', 26, 42);
  b.prop('palm', 37, 42);
  b.staff(28, 40, 'right', 1301, '安保', 'guard');
  b.spot('security_post', 34, 40, 'left');
  b.spot('casino_lobby_watch', 29, 37, 'up');
  b.interactable('security', 31, 40, 1, 1, { kind: 'sign', label: '安检门', data: { text: '金属探测门发出轻微的嗡鸣。' } });

  // manager's office
  b.prop('boss_desk', 2, 40);
  b.prop('chair', 3, 41);
  b.prop('filing', 8, 38);
  b.prop('plant', 1, 42);
  b.prop('painting', 4, 36, undefined, { oy: -2 });
  b.spot('manager_office', 3, 39, 'down');

  // staff & named-NPC spots on the floor
  for (const [id, t] of Object.entries(CASINO_TABLES)) {
    if (id === 'bj1') continue;
    b.staff(t.dealer.x, t.dealer.y, t.dealer.face, 1400 + id.length * 7 + t.x, '荷官', 'dealer');
  }
  b.spot('dealer_bj1', CASINO_TABLES.bj1.dealer.x, CASINO_TABLES.bj1.dealer.y, 'down');
  b.block(CASINO_TABLES.bj1.dealer.x, CASINO_TABLES.bj1.dealer.y);
  b.spot('dealer_staff', CASINO_TABLES.bj3.dealer.x, CASINO_TABLES.bj3.dealer.y + 0, 'down');
  b.spot('bj_patron', 11, 19, 'up');
  // the poker room's rail: regulars wait here for a seat
  b.spot('poker_rail1', 20, 3, 'down');
  b.spot('poker_rail2', 13, 8, 'up');
  b.spot('poker_rail3', 21, 9, 'up');
  b.spot('poker_rail4', 16, 3, 'down');
  b.spot('roulette_watch', 27, 20, 'up');
  b.interactable('dealer_work', 18, 14, 1, 1, { kind: 'work', label: '荷官打卡', data: { job: 'dealer' } });
  b.data.ambient = { day: 0.42, night: 0.42, color: 0x12081c };
  buildSkyFloor(b, H);
  b.data.regions = [
    { id: 'ground', name: '灰港大赌场', x: 0, y: 0, w: W, h: H, entry: { x: 31, y: H - 2 } },
    { id: 'sky', name: '天穹层', x: SKY_X, y: 0, w: SKY_W, h: SKY_H, entry: LIFT_SKY, ambient: { day: 0.62, night: 0.4, color: 0x0c1430 } },
  ];
  return b.finish();
}

/**
 * The members' floor at the top of the building: lounge, lobby with the
 * concierge, sky bar, spa, the comp boutique and suite 1201. Drawn to the
 * right of the ground floor in the same map and reached only by lift.
 */
function buildSkyFloor(b: MapBuilder, mapH: number): void {
  const X = SKY_X;
  const walls = new Set<string>();
  const w = (lx: number, y: number) => walls.add(`${X + lx},${y}`);
  const hw = (x0: number, x1: number, y: number) => {
    for (let x = x0; x <= x1; x++) w(x, y);
  };
  const vw = (x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) w(x, y);
  };
  const gap = (lx: number, y: number) => walls.delete(`${X + lx},${y}`);
  // outer walls
  hw(0, SKY_W - 1, 0);
  hw(0, SKY_W - 1, 1);
  hw(0, SKY_W - 1, SKY_H - 1);
  vw(0, 0, SKY_H - 1);
  vw(SKY_W - 1, 0, SKY_H - 1);
  // short partitions between the lounge, the lobby and the bar
  vw(18, 2, 7);
  vw(31, 2, 7);
  // the corridor wall in front of the spa, the boutique and the suite
  hw(1, SKY_W - 2, 19);
  hw(1, SKY_W - 2, 20);
  vw(16, 21, SKY_H - 2);
  vw(31, 21, SKY_H - 2);
  for (const lx of [7, 8, 23, 24]) {
    gap(lx, 19);
    gap(lx, 20);
  }
  // floors
  b.fill(X + 1, 2, 17, 17, (x, y) => `carpet_sky${(x % 2) + (y % 2) * 2}`);
  b.fill(X + 18, 8, 14, 11, 'marble');
  b.fill(X + 19, 2, 12, 6, 'marble');
  b.fill(X + 32, 2, 17, 17, 'parquet_dark');
  b.fill(X + 1, 19, 15, 16, 'spa_stone');
  b.fill(X + 17, 19, 14, 16, 'marble_dark');
  b.fill(X + 32, 21, 17, 14, 'wood_mid');
  // between the floors and below the upper one: solid
  for (let y = 0; y < mapH; y++) for (let x = MAIN_W; x < X + SKY_W; x++) if (x < X || y >= SKY_H) walls.add(`${x},${y}`);
  b.applyWalls((x, y) => walls.has(`${x},${y}`), 'navy');
  const P = (id: string, lx: number, y: number, interact?: Parameters<MapBuilder['prop']>[3], opts?: Parameters<MapBuilder['prop']>[4]) => b.prop(id, X + lx, y, interact, opts);

  // ---- lobby: the lift, the concierge
  P('lift_sky', 24, 1);
  b.interactable('lift_sky', LIFT_SKY.x, 1, 2, 1, { kind: 'elevator', label: '电梯 · 下行至大厅', data: { to: `${LIFT_GROUND.x},${LIFT_GROUND.y}`, floor: 'ground' } });
  b.spawn('sky_lift', LIFT_SKY.x, LIFT_SKY.y, 'down');
  b.staff(X + 22, 3, 'down', 1602, '电梯礼宾', 'lift');
  P('sign_skyline', 28, 1, undefined, { oy: -8 });
  P('art_large', 20, 1, undefined, { oy: -6 });
  P('flower_vase', 20, 4);
  P('flower_vase', 29, 4);
  P('concierge_desk', 22, 10, { kind: 'concierge', label: '礼宾台', data: { tab: 'suite' } });
  b.staff(X + 23, 9, 'down', 1603, '礼宾', 'concierge');
  b.staff(X + 25, 9, 'down', 1604, '礼宾', 'concierge');
  P('chandelier', 24, 6, undefined, { noBlock: true });
  P('rug_round', 23, 16);
  P('palm', 18, 17);
  P('palm', 31, 17);

  // ---- members' lounge
  for (const lx of [2, 6, 10, 14]) P('sky_window', lx, 1, lx === 6 ? { kind: 'view', label: '落地窗' } : undefined);
  for (const [lx, sweet] of [[2, false], [4, false], [6, true]] as [number, boolean][]) P(sweet ? 'buffet_sweet' : 'buffet', lx, 16, lx === 4 ? { kind: 'order', label: '会员自助餐台', data: { shop: 'sky_lounge' } } : undefined);
  b.staff(X + 5, 15, 'down', 1605, '侍应', 'waiter');
  for (const cx of [2, 8]) {
    P('sofa_cognac', cx, 9);
    P('rug_round', cx, 12);
    P('side_table', cx + 1, 11);
    P('armchair_cognac', cx - 1, 11);
    P('armchair_cognac', cx + 3, 11);
  }
  P('piano', 13, 6, { kind: 'piano', label: '三角钢琴' });
  b.staff(X + 14, 5, 'down', 1606, '钢琴师', 'pianist', 'sky_night');
  b.staff(X + 16, 6, 'down', 1607, '爵士歌手', 'jazz_singer', 'sky_night');
  P('armchair_cognac', 13, 10);
  P('armchair_cognac', 15, 10);
  P('champagne_tower', 10, 5);
  P('lamp_floor', 1, 3);
  P('lamp_floor', 17, 3);
  P('plant', 1, 17);
  P('plant', 17, 13);
  P('chandelier', 8, 7, undefined, { noBlock: true });

  // ---- sky bar
  P('sky_window', 33, 1);
  P('sky_window', 46, 1, { kind: 'view', label: '落地窗' });
  P('bottle_shelf', 39, 1, undefined, { oy: -4 });
  P('sign_skybar', 43, 1, undefined, { oy: -8 });
  for (let lx = 35; lx <= 43; lx++) P('bar_counter_lux', lx, 6, lx === 39 ? { kind: 'order', label: '天穹酒廊吧台', data: { shop: 'sky_bar' } } : undefined);
  for (const lx of [35, 37, 41, 43]) P('stool', lx, 7, undefined, { noBlock: true });
  b.staff(X + 37, 5, 'down', 1608, '调酒师', 'bartender');
  b.staff(X + 41, 5, 'down', 1609, '调酒师', 'bartender');
  for (const [lx, y] of [[35, 11], [39, 11], [43, 11], [37, 15], [41, 15]] as [number, number][]) P('high_table', lx, y);
  P('telescope', 47, 3, { kind: 'view', label: '望远镜' });
  P('sofa_navy', 45, 9);
  P('side_table', 46, 11);
  P('palm', 48, 17);
  P('plant', 32, 13);
  P('chandelier', 40, 9, undefined, { noBlock: true });

  // ---- spa
  P('sign_spa', 4, 20, undefined, { oy: -10 });
  P('spa_desk', 4, 23, { kind: 'concierge', label: '水疗中心前台', data: { tab: 'spa' } });
  b.staff(X + 5, 22, 'down', 1610, '水疗接待', 'spa');
  for (const [lx, y] of [[2, 27], [2, 31], [6, 31]] as [number, number][]) P('massage_bed', lx, y);
  b.staff(X + 4, 27, 'left', 1611, '理疗师', 'spa');
  P('sauna', 11, 27, { kind: 'concierge', label: '桑拿房', data: { tab: 'spa' } });
  for (const [lx, y] of [[1, 22], [14, 22], [14, 33], [10, 33]] as [number, number][]) P('orchid', lx, y);

  // ---- comp boutique
  P('sign_boutique', 20, 20, undefined, { oy: -10 });
  P('art_large', 27, 20, undefined, { oy: -6 });
  for (const [lx, y] of [[18, 23], [27, 23], [18, 28], [27, 28]] as [number, number][]) P('display_case', lx, y);
  P('display_case', 22, 26, { kind: 'concierge', label: '会员精品店', data: { tab: 'store' } });
  P('display_case', 24, 26);
  b.staff(X + 23, 25, 'down', 1612, '店员', 'reception');
  for (const lx of [19, 21, 26, 28]) P('mannequin', lx, 32);
  P('palm', 17, 33);
  P('palm', 30, 33);

  // ---- suite 1201 (key card)
  P('suite_door', 40, 20);
  b.interactable('gate_suite', X + 40, 19, 2, 2, { kind: 'gate', label: '1201 套房', data: { area: 'suite', inside: `${X + 40},21`, outside: `${X + 40},18` } });
  P('art_large', 44, 20, undefined, { oy: -6 });
  P('bed_luxury', 44, 24, { kind: 'bed', label: '套房大床', data: { suite: true } });
  P('lamp_floor', 43, 22);
  P('lamp_floor', 47, 22);
  P('wardrobe', 33, 22, { kind: 'wardrobe', label: '衣帽间' });
  P('tv', 36, 22, { kind: 'tv', label: '电视' });
  P('rug_round', 35, 28);
  P('sofa_navy', 35, 26);
  P('coffee_table', 36, 29);
  P('bathtub_claw', 46, 33);
  P('orchid', 48, 31);
  P('flower_vase', 33, 33);

  // where named people stand or sit up here
  b.spot('sky_host', X + 26, 13, 'down');
  b.spot('sky_lounge1', X + 3, 10, 'down', true);
  b.spot('sky_lounge2', X + 9, 10, 'down', true);
  b.spot('sky_piano', X + 12, 9, 'up');
  b.spot('sky_bar1', X + 37, 7, 'up', true);
  b.spot('sky_bar2', X + 41, 7, 'up', true);
  b.spot('sky_window', X + 46, 3, 'up');
}
