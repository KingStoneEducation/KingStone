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

export function isOpen(loc: LocationDef, weekday: number, minuteOfDay: number): boolean {
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
