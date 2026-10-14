import { G, type Money } from '../core/money';
import type { Ambience } from './locations';

export type BizType = 'cafe' | 'bakery' | 'bar' | 'boutique' | 'convenience';
export type PriceLevel = 'low' | 'mid' | 'high';
export type Supplies = 'basic' | 'premium';

export interface BizTypeDef {
  id: BizType;
  name: string;
  desc: string;
  /** renovation and equipment, paid once */
  fitout: Money;
  /** what a customer spends at the middle price */
  ticket: Money;
  /** customers a day once everyone nearby knows the place and its reputation is average */
  base: number;
  /** customers one employee can look after in a day */
  perStaff: number;
  /** share of takings spent on stock with ordinary supplies */
  cogs: number;
  /** monthly wage per employee */
  wage: Money;
  /** monthly power, water and licences */
  utilities: Money;
  /** opening hours, [from, to) in hours (to may pass midnight) */
  hours: [number, number];
  /** how much busier Saturdays and Sundays are */
  weekend: number;
  ambience: Ambience;
  /** uniform for the staff figures */
  staffRole: string;
}

export const BIZ_TYPES: Record<BizType, BizTypeDef> = {
  cafe: {
    id: 'cafe',
    name: '咖啡馆',
    desc: '早上的通勤客和下午坐一整天的人。客单价低，靠回头客。',
    fitout: G(60000),
    ticket: G(8.5),
    base: 90,
    perStaff: 70,
    cogs: 0.33,
    wage: G(3400),
    utilities: G(900),
    hours: [7, 19],
    weekend: 1.25,
    ambience: 'cafe',
    staffRole: 'clerk',
  },
  bakery: {
    id: 'bakery',
    name: '面包房',
    desc: '街坊们怀念的老面包房。凌晨就要开工，利润薄但稳定。',
    fitout: G(45000),
    ticket: G(6.5),
    base: 110,
    perStaff: 80,
    cogs: 0.38,
    wage: G(3000),
    utilities: G(1100),
    hours: [6, 18],
    weekend: 1.2,
    ambience: 'cafe',
    staffRole: 'cook',
  },
  bar: {
    id: 'bar',
    name: '小酒馆',
    desc: '晚上营业，周末翻倍。固定成本高，生意好的时候很赚钱。',
    fitout: G(90000),
    ticket: G(22),
    base: 34,
    perStaff: 30,
    cogs: 0.3,
    wage: G(3400),
    utilities: G(1000),
    hours: [17, 26],
    weekend: 1.45,
    ambience: 'bar',
    staffRole: 'bartender',
  },
  boutique: {
    id: 'boutique',
    name: '买手服装店',
    desc: '一天只来几位客人，每一单都不小。看眼光，也看运气。',
    fitout: G(120000),
    ticket: G(150),
    base: 6,
    perStaff: 10,
    cogs: 0.5,
    wage: G(3600),
    utilities: G(700),
    hours: [10, 20],
    weekend: 1.4,
    ambience: 'boutique',
    staffRole: 'reception',
  },
  convenience: {
    id: 'convenience',
    name: '便利店',
    desc: '人来人往，进货成本占了大头。很难亏大钱，也很难赚大钱。',
    fitout: G(70000),
    ticket: G(11),
    base: 170,
    perStaff: 110,
    cogs: 0.72,
    wage: G(2900),
    utilities: G(1300),
    hours: [7, 23],
    weekend: 1.05,
    ambience: 'store',
    staffRole: 'clerk',
  },
};

export const BIZ_ORDER: BizType[] = ['cafe', 'bakery', 'bar', 'boutique', 'convenience'];

/** Shop units the player can lease. */
export interface PremiseDef {
  id: string;
  /** the city building it is in */
  building: string;
  address: string;
  /** monthly rent */
  rent: Money;
  /** passers-by compared with the busiest streets (1 = an ordinary shopping street) */
  footfall: number;
  desc: string;
}

export const PREMISES: Record<string, PremiseDef> = {
  bakery_unit: {
    id: 'bakery_unit',
    building: 'bakery',
    address: '集市街 12 号（原晨光面包房）',
    rent: G(3200),
    footfall: 1,
    desc: '老城区集市街的临街铺面，旁边是药房和公交站。原来的面包房开了三十年，上个月关门。',
  },
};

export const PRICE_LEVELS: Record<PriceLevel, { name: string; factor: number }> = {
  low: { name: '实惠', factor: 0.85 },
  mid: { name: '适中', factor: 1 },
  high: { name: '高端', factor: 1.2 },
};

/** better supplies cost a fixed share more of the takings */
export const SUPPLY_LEVELS: Record<Supplies, { name: string; extraCogs: number; quality: number }> = {
  basic: { name: '普通货源', extraCogs: 0, quality: 1 },
  premium: { name: '精选货源', extraCogs: 0.08, quality: 1.3 },
};

/** weekly marketing: cost and how fast word spreads */
export const MARKETING: { name: string; cost: Money; reach: number }[] = [
  { name: '不做推广', cost: 0, reach: 0 },
  { name: '传单与小红书', cost: G(300), reach: 0.012 },
  { name: '本地媒体广告', cost: G(1200), reach: 0.03 },
];

/** days from signing to opening */
export const RENOVATION_DAYS = 7;
