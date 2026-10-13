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

export function buildCasinoMap(): MapData {
  const W = 64;
  const H = 44;
  const b = new MapBuilder('casino', W, H, 'carpet_casino0', false);
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
  b.applyWalls((x, y) => wall.has(y * W + x), 'red');
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
  b.prop('poker_sign', 13, 10, undefined, { oy: -2 });

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
  b.spot('roulette_watch', 27, 20, 'up');
  b.interactable('dealer_work', 18, 14, 1, 1, { kind: 'work', label: '荷官打卡', data: { job: 'dealer' } });
  b.data.ambient = { day: 0.42, night: 0.42, color: 0x12081c };
  return b.finish();
}
