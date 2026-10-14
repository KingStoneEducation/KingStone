import { G, type Money } from '../core/money';

export interface HomeDef {
  id: string;
  name: string;
  /** 0..5 tier index used for social signalling */
  tier: number;
  /** interior map / location id */
  location: string;
  /** building id on the city map whose door leads home */
  building: string;
  rent: Money | null;
  price: Money | null;
  maintenance: Money;
  utilities: Money;
  /** sleep recovery multiplier bonus */
  comfort: number;
  prestige: number;
  area: string;
  furnitureSlots: number;
  desc: string;
  district: string;
}

export const HOMES: Record<string, HomeDef> = {
  home_shared: {
    id: 'home_shared',
    name: '码头合租房',
    tier: 0,
    location: 'home_shared',
    building: 'dockside_rooms',
    rent: G(650),
    price: null,
    maintenance: 0,
    utilities: G(60),
    comfort: -0.1,
    prestige: 0,
    area: '9 平方米单间，共用厨卫',
    furnitureSlots: 1,
    desc: '老城码头边的合租屋，墙薄、室友吵，但便宜。',
    district: '老城区',
  },
  home_basic: {
    id: 'home_basic',
    name: '枫庭公寓 3B',
    tier: 1,
    location: 'home_basic',
    building: 'maple_court',
    rent: G(1450),
    price: G(148000),
    maintenance: G(110),
    utilities: G(140),
    comfort: 0,
    prestige: 1,
    area: '38 平方米一室一厅',
    furnitureSlots: 3,
    desc: '普普通通的单人公寓，房东玛格丽特很较真。',
    district: '老城区',
  },
  home_downtown: {
    id: 'home_downtown',
    name: '中央阁楼 12F',
    tier: 2,
    location: 'home_downtown',
    building: 'central_lofts',
    rent: G(3600),
    price: G(425000),
    maintenance: G(290),
    utilities: G(220),
    comfort: 0.06,
    prestige: 2,
    area: '72 平方米精装两居',
    furnitureSlots: 5,
    desc: '市中心的精装公寓，离赌场和银行都很近。',
    district: '市中心',
  },
  home_river: {
    id: 'home_river',
    name: '河畔塔楼 28F',
    tier: 3,
    location: 'home_river',
    building: 'riverside_towers',
    rent: G(8200),
    price: G(1060000),
    maintenance: G(680),
    utilities: G(350),
    comfort: 0.12,
    prestige: 3,
    area: '128 平方米河景三居',
    furnitureSlots: 7,
    desc: '落地窗外就是灰港河，夜景很美。',
    district: '河畔区',
  },
  home_penthouse: {
    id: 'home_penthouse',
    name: '天际大厦顶层公寓',
    tier: 4,
    location: 'home_penthouse',
    building: 'skyline_tower',
    rent: G(22000),
    price: G(3650000),
    maintenance: G(2400),
    utilities: G(820),
    comfort: 0.2,
    prestige: 4,
    area: '310 平方米复式顶层',
    furnitureSlots: 9,
    desc: '城市最高处，有私人电梯和露台。',
    district: '市中心',
  },
  home_estate: {
    id: 'home_estate',
    name: '山丘庄园',
    tier: 5,
    location: 'home_estate',
    building: 'hillcrest_estate',
    rent: null,
    price: G(9800000),
    maintenance: G(9200),
    utilities: G(1800),
    comfort: 0.28,
    prestige: 5,
    area: '2,400 平方米的庄园与花园',
    furnitureSlots: 12,
    desc: '富人区深处的私人庄园，需要管家打理。',
    district: '山丘富人区',
  },
};

export const HOME_ORDER = ['home_shared', 'home_basic', 'home_downtown', 'home_river', 'home_penthouse', 'home_estate'];
