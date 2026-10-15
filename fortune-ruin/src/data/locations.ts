import { hm } from '../core/calendar';

export type Ambience = 'city' | 'casino' | 'cafe' | 'bar' | 'restaurant' | 'store' | 'office' | 'bank' | 'home' | 'club' | 'boutique' | 'quiet';

export interface OpenHours {
  days: number[];
  from: number;
  to: number;
}

export interface LocationDef {
  id: string;
  name: string;
  nameEn: string;
  kind: 'city' | 'interior';
  ambience: Ambience;
  /** absent = always open */
  hours?: OpenHours[];
  /** minimum outfit prestige to be admitted */
  dressCode?: number;
  /** access requirement beyond opening hours */
  access?: 'members' | 'reservation' | 'employees' | 'resident';
  /** typical price level 0..4 */
  priceLevel: number;
  /** interior light level 0..1 (1 = bright daylight) */
  light: number;
  desc: string;
}

const ALL = [0, 1, 2, 3, 4, 5, 6];
const WD = [0, 1, 2, 3, 4];

export const LOCATIONS: Record<string, LocationDef> = {
  city: { id: 'city', name: '灰港', nameEn: 'Greyhaven', kind: 'city', ambience: 'city', priceLevel: 1, light: 1, desc: '一座潮湿、霓虹闪烁的港口城市。' },
  home_shared: { id: 'home_shared', name: '码头合租房', nameEn: 'Dockside Rooms', kind: 'interior', ambience: 'home', access: 'resident', priceLevel: 0, light: 0.55, desc: '' },
  home_basic: { id: 'home_basic', name: '枫庭公寓 3B', nameEn: 'Maple Court 3B', kind: 'interior', ambience: 'home', access: 'resident', priceLevel: 0, light: 0.7, desc: '' },
  home_downtown: { id: 'home_downtown', name: '中央阁楼 12F', nameEn: 'Central Lofts', kind: 'interior', ambience: 'home', access: 'resident', priceLevel: 0, light: 0.8, desc: '' },
  home_river: { id: 'home_river', name: '河畔塔楼 28F', nameEn: 'Riverside Towers', kind: 'interior', ambience: 'home', access: 'resident', priceLevel: 0, light: 0.85, desc: '' },
  home_penthouse: { id: 'home_penthouse', name: '天际顶层公寓', nameEn: 'Skyline Penthouse', kind: 'interior', ambience: 'home', access: 'resident', priceLevel: 0, light: 0.9, desc: '' },
  home_estate: { id: 'home_estate', name: '山丘庄园', nameEn: 'Hillcrest Estate', kind: 'interior', ambience: 'home', access: 'resident', priceLevel: 0, light: 0.9, desc: '' },
  store: { id: 'store', name: 'QuickMart 便利店', nameEn: 'QuickMart', kind: 'interior', ambience: 'store', priceLevel: 0, light: 1, desc: '24 小时营业的便利店。' },
  cafe: {
    id: 'cafe',
    name: 'Harbor Bean 咖啡馆',
    nameEn: 'Harbor Bean',
    kind: 'interior',
    ambience: 'cafe',
    hours: [{ days: ALL, from: hm(6, 30), to: hm(20) }],
    priceLevel: 1,
    light: 0.95,
    desc: '老城区的社区咖啡馆。',
  },
  restaurant: {
    id: 'restaurant',
    name: "Marlow's 小馆",
    nameEn: "Marlow's Bistro",
    kind: 'interior',
    ambience: 'restaurant',
    hours: [{ days: [1, 2, 3, 4, 5, 6], from: hm(11), to: hm(23) }],
    priceLevel: 2,
    light: 0.8,
    desc: '开了五十年的家庭餐馆。',
  },
  bar: {
    id: 'bar',
    name: 'Rusty Anchor 酒吧',
    nameEn: 'The Rusty Anchor',
    kind: 'interior',
    ambience: 'bar',
    hours: [{ days: ALL, from: hm(16), to: hm(27) }],
    priceLevel: 1,
    light: 0.5,
    desc: '老码头工人和年轻人都爱来的酒吧。',
  },
  boutique: {
    id: 'boutique',
    name: 'Thread & Needle 服装店',
    nameEn: 'Thread & Needle',
    kind: 'interior',
    ambience: 'boutique',
    hours: [{ days: [0, 1, 2, 3, 4, 5], from: hm(10), to: hm(20) }, { days: [6], from: hm(12), to: hm(18) }],
    priceLevel: 2,
    light: 1,
    desc: '中档服装店。',
  },
  bank: {
    id: 'bank',
    name: '灰港储蓄信托银行',
    nameEn: 'Greyhaven Savings & Trust',
    kind: 'interior',
    ambience: 'bank',
    hours: [{ days: WD, from: hm(9), to: hm(17) }, { days: [5], from: hm(9), to: hm(13) }],
    priceLevel: 0,
    light: 1,
    desc: '城里最老的银行。',
  },
  office: {
    id: 'office',
    name: '灰港物流办公室',
    nameEn: 'Harbor Logistics',
    kind: 'interior',
    ambience: 'office',
    hours: [{ days: WD, from: hm(7), to: hm(20) }],
    access: 'employees',
    priceLevel: 0,
    light: 1,
    desc: '你工作的地方。',
  },
  finance_office: {
    id: 'finance_office',
    name: '北门资本',
    nameEn: 'Northgate Capital',
    kind: 'interior',
    ambience: 'office',
    hours: [{ days: WD, from: hm(7), to: hm(21) }],
    dressCode: 2,
    priceLevel: 0,
    light: 1,
    desc: '灰港最大的投资公司之一。访客可以在前台咨询。',
  },
  casino: { id: 'casino', name: '灰港大赌场', nameEn: 'Greyhaven Grand Casino', kind: 'interior', ambience: 'casino', priceLevel: 2, light: 0.45, desc: '24 小时不打烊。' },
  club: {
    id: 'club',
    name: '子午线会所',
    nameEn: 'The Meridian Club',
    kind: 'interior',
    ambience: 'club',
    hours: [{ days: ALL, from: hm(12), to: hm(26) }],
    access: 'members',
    dressCode: 3,
    priceLevel: 4,
    light: 0.6,
    desc: '百年历史的私人会员制会所。',
  },
  fine_dining: {
    id: 'fine_dining',
    name: 'Lumière 法餐厅',
    nameEn: 'Lumière',
    kind: 'interior',
    ambience: 'restaurant',
    hours: [{ days: [1, 2, 3, 4, 5, 6], from: hm(18), to: hm(23, 30) }],
    access: 'reservation',
    dressCode: 3,
    priceLevel: 4,
    light: 0.55,
    desc: '需要预约的米其林级法餐厅。',
  },
  luxury: {
    id: 'luxury',
    name: 'Maison Aurèle 精品店',
    nameEn: 'Maison Aurèle',
    kind: 'interior',
    ambience: 'boutique',
    hours: [{ days: ALL, from: hm(11), to: hm(19) }],
    priceLevel: 4,
    light: 1,
    desc: '高级成衣与腕表。',
  },
  own_shop: {
    id: 'own_shop',
    name: '集市街 12 号',
    nameEn: '12 Market Street',
    kind: 'interior',
    // once open, the music follows whatever the shop is (see main.tsx)
    ambience: 'store',
    priceLevel: 1,
    light: 0.9,
    desc: '集市街的临街铺面。',
  },
  own_shop_union: {
    id: 'own_shop_union',
    name: '联合广场 3 号',
    nameEn: '3 Union Square',
    kind: 'interior',
    ambience: 'store',
    priceLevel: 2,
    light: 0.95,
    desc: '联合广场南侧的临街铺面。',
  },
  own_shop_park: {
    id: 'own_shop_park',
    name: '河畔公园 1 号亭',
    nameEn: 'Riverside Park Pavilion',
    kind: 'interior',
    ambience: 'store',
    priceLevel: 1,
    light: 0.95,
    desc: '公园步道边的小楼。',
  },
  hotel: {
    id: 'hotel',
    name: '灰港大酒店',
    nameEn: 'Greyhaven Grand Hotel',
    kind: 'interior',
    ambience: 'club',
    priceLevel: 3,
    light: 0.8,
    desc: '联合广场边的老牌酒店。大堂吧有下午茶，周日下午宴会厅里是灰港拍卖行的拍卖会。',
  },
  // Whitestone Bay, across the bay (reached by ferry)
  isle: { id: 'isle', name: '白石湾', nameEn: 'Whitestone Bay', kind: 'city', ambience: 'city', priceLevel: 1, light: 1, desc: '海湾对面的渔港小镇：渔村、海滩、灯塔，和岬角上的度假酒店。' },
  isle_diner: {
    id: 'isle_diner',
    name: '老船长食堂',
    nameEn: "Captain's Diner",
    kind: 'interior',
    ambience: 'restaurant',
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], from: hm(6), to: hm(20) }],
    priceLevel: 1,
    light: 0.85,
    desc: '渔港边的老食堂，鱼都是码头上买的。只收现金。',
  },
  isle_guesthouse: {
    id: 'isle_guesthouse',
    name: '海鸥民宿',
    nameEn: 'Gull Inn',
    kind: 'interior',
    ambience: 'home',
    priceLevel: 0,
    light: 0.75,
    desc: '老板娘一家开的小民宿，客房就在前台后面，一晚 120 G。',
  },
  isle_resort: {
    id: 'isle_resort',
    name: '白石湾度假酒店',
    nameEn: 'Whitestone Bay Resort',
    kind: 'interior',
    ambience: 'club',
    priceLevel: 4,
    light: 0.9,
    desc: '岬角上的度假酒店：海景房、灯塔套房、海景餐厅，泳池和海滩只对住客开放。',
  },
  pawn: {
    id: 'pawn',
    name: '福来当铺',
    nameEn: 'Fortune Pawn',
    kind: 'interior',
    ambience: 'store',
    hours: [{ days: [0, 1, 2, 3, 4, 5], from: hm(9), to: hm(21) }, { days: [6], from: hm(10), to: hm(18) }],
    priceLevel: 1,
    light: 0.65,
    desc: '老城区开了四十年的当铺，也收也卖。',
  },
  community_kitchen: {
    id: 'community_kitchen',
    name: '海员之家社区食堂',
    nameEn: "Seafarers' Community Kitchen",
    kind: 'interior',
    ambience: 'restaurant',
    hours: [{ days: ALL, from: hm(11), to: hm(14) }, { days: ALL, from: hm(17), to: hm(20) }],
    priceLevel: 0,
    light: 0.9,
    desc: '街坊们办的食堂，每天两顿免费的热饭。',
  },
  motors: {
    id: 'motors',
    name: '灰港汽车行',
    nameEn: 'Greyhaven Motors',
    kind: 'interior',
    ambience: 'store',
    hours: [{ days: [0, 1, 2, 3, 4, 5], from: hm(9), to: hm(19) }],
    priceLevel: 2,
    light: 1,
    desc: '新车、二手车与维修服务。',
  },
};

export function isOpen(loc: { hours?: OpenHours[] }, weekday: number, minuteOfDay: number): boolean {
  if (!loc.hours) return true;
  for (const h of loc.hours) {
    // today's window
    if (h.days.includes(weekday)) {
      if (minuteOfDay >= h.from && minuteOfDay < Math.min(h.to, 1440)) return true;
    }
    // spill-over past midnight from yesterday's window
    const yesterday = (weekday + 6) % 7;
    if (h.to > 1440 && h.days.includes(yesterday) && minuteOfDay < h.to - 1440) return true;
  }
  return false;
}

export function hoursText(loc: LocationDef): string {
  if (!loc.hours) return '24 小时营业';
  const fmt = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return loc.hours.map((h) => `${h.days.length === 7 ? '每天' : h.days.map((d) => '一二三四五六日'[d]).join('')} ${fmt(h.from)}–${h.to > 1440 ? '次日' : ''}${fmt(h.to)}`).join('；');
}
