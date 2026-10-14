import { G, type Money } from '../core/money';
import { hm } from '../core/calendar';

/**
 * The Greyhaven Auction House holds its sale in the Grand Hotel's ballroom on
 * Sunday afternoons. Everything here is fiction: the artists, the pieces and
 * their prices belong to the game.
 */

export type PieceKind = 'painting' | 'watch' | 'whisky' | 'porcelain' | 'book' | 'jade';
export type Genre = 'landscape' | 'seascape' | 'still' | 'portrait' | 'abstract' | 'city';
export type Tier = 'emerging' | 'established' | 'master';

export const KIND_NAMES: Record<PieceKind, string> = {
  painting: '油画',
  watch: '古董腕表',
  whisky: '珍稀烈酒',
  porcelain: '瓷器',
  book: '珍本书籍',
  jade: '玉器',
};

export const GENRE_NAMES: Record<Genre, string> = {
  landscape: '风景',
  seascape: '海景',
  still: '静物',
  portrait: '肖像',
  abstract: '抽象',
  city: '城市夜景',
};

export const TIER_NAMES: Record<Tier, string> = {
  emerging: '新锐',
  established: '成名',
  master: '已故名家',
};

/** Where the house's own lots come from: price ranges in G (log-uniform). */
export const VALUE_RANGE: Record<string, [number, number]> = {
  'painting:emerging': [1500, 12000],
  'painting:established': [12000, 90000],
  'painting:master': [90000, 600000],
  watch: [12000, 60000],
  whisky: [3000, 16000],
  porcelain: [15000, 120000],
  book: [2000, 9000],
  jade: [6000, 40000],
};

/** Weekly drift and volatility of each market (log returns). */
export const MARKET: Record<string, { mu: number; sigma: number }> = {
  'painting:emerging': { mu: 0.001, sigma: 0.06 },
  'painting:established': { mu: 0.0015, sigma: 0.03 },
  'painting:master': { mu: 0.001, sigma: 0.015 },
  watch: { mu: 0.001, sigma: 0.02 },
  whisky: { mu: 0.002, sigma: 0.01 },
  porcelain: { mu: 0.001, sigma: 0.03 },
  book: { mu: 0.0005, sigma: 0.02 },
  jade: { mu: 0.001, sigma: 0.03 },
};

/** A new artist is sometimes discovered (or forgotten): a weekly chance of a big move. */
export const BREAKOUT = { chance: 0.01, up: [1.4, 2.2] as [number, number], down: 0.7 };

export const ARTISTS: Record<Tier, { name: string; years: [number, number] }[]> = {
  emerging: [
    { name: '许小满', years: [2019, 2025] },
    { name: 'Mia Tan', years: [2020, 2025] },
    { name: '阿诺', years: [2018, 2025] },
    { name: 'Leo Brandt', years: [2017, 2024] },
    { name: '苏遥', years: [2021, 2025] },
  ],
  established: [
    { name: 'Isabelle Moreau', years: [1988, 2016] },
    { name: '周远', years: [1979, 2012] },
    { name: 'Henrik Saelen', years: [1992, 2020] },
    { name: '叶青', years: [1985, 2010] },
    { name: '宋明川', years: [1990, 2018] },
  ],
  master: [
    { name: '林秋山（1898–1971）', years: [1925, 1968] },
    { name: 'Anton Weiss（1871–1934）', years: [1898, 1930] },
    { name: 'Michel Delacroix-Vane（1840–1903）', years: [1862, 1900] },
  ],
};

export const PLACES = ['灰港', '北湾', '雾岬', '白石滩', '松岭', '旧运河', '枫谷', '盐田'];

export const TITLES: Record<Genre, string[]> = {
  landscape: ['{place}的黄昏', '远山', '秋日的{place}', '{place}晨雾', '山谷里的风', '雪后的{place}'],
  seascape: ['归航', '{place}的帆', '灯塔与雾', '涨潮', '海上的月亮', '暴风雨之前'],
  still: ['静物：柠檬与陶罐', '瓶花', '桌上的苹果', '葡萄与银壶', '午后的花'],
  portrait: ['穿蓝衣的少年', '戴珍珠的女子', '老水手', '自画像', '读信的人', '{place}的渔家女'],
  abstract: ['构成 第 {n} 号', '无题（红）', '韵律', '漂浮的方块', '红与黑', '无题（蓝）'],
  city: ['灰港夜曲', '雨后的码头街', '霓虹', '不眠之城', '末班车'],
};

/** The house's objects: name, maker line, year range. */
export const OBJECTS: Record<Exclude<PieceKind, 'painting'>, { title: string; maker: string; years: [number, number] }[]> = {
  watch: [
    { title: 'Aurelius 计时码表', maker: 'Aurelius 表厂', years: [1958, 1972] },
    { title: 'Aurelius 月相表', maker: 'Aurelius 表厂', years: [1970, 1985] },
    { title: '海军怀表', maker: '灰港航运局', years: [1910, 1935] },
  ],
  whisky: [
    { title: '格伦霍尔 40 年单一麦芽', maker: '格伦霍尔酒厂', years: [1978, 1984] },
    { title: '年份波本（原箱）', maker: '老磨坊酒厂', years: [1974, 1990] },
    { title: '已停产酒厂的最后一桶', maker: '北岸酒厂', years: [1982, 1983] },
  ],
  porcelain: [
    { title: '青花缠枝莲纹瓶', maker: '佚名窑口', years: [1740, 1790] },
    { title: '粉彩花鸟盘', maker: '佚名窑口', years: [1800, 1860] },
    { title: '白釉梅瓶', maker: '佚名窑口', years: [1600, 1680] },
  ],
  book: [
    { title: '《灰港港志》初版', maker: '灰港书局', years: [1898, 1906] },
    { title: '《航海手记》手稿本', maker: '佚名船长', years: [1860, 1880] },
    { title: '《白鲸》早期译本', maker: '海港出版社', years: [1925, 1940] },
  ],
  jade: [
    { title: '白玉山子摆件', maker: '佚名', years: [1780, 1880] },
    { title: '翡翠观音挂件', maker: '佚名', years: [1900, 1950] },
    { title: '青玉笔洗', maker: '佚名', years: [1700, 1800] },
  ],
};

export const BUYER_PREMIUM_BP = 1500;
export const SELLER_COMMISSION_BP = 1000;
/** Bank balance needed to get a paddle. */
export const PADDLE_MIN = G(5000);
/** At most this many lots a week (the house's five and two from the player). */
export const HOUSE_LOTS = 5;
export const MAX_PLAYER_LOTS = 2;
/** The sale: Sunday 15:00, twelve minutes a lot. */
export const SALE_DAY = 6;
export const SALE_START = hm(15);
export const LOT_MINUTES = 12;
/** Preview of the lots in the ballroom: Saturday 10–18, Sunday 10–15. */
export const PREVIEW = [
  { day: 5, from: hm(10), to: hm(18) },
  { day: 6, from: hm(10), to: hm(15) },
];
/** Pieces consigned before the preview opens go into that week's sale. */
export const CONSIGN_CUTOFF = { day: 5, at: hm(10) };

/** Bid steps of the house, by the current bid. */
export function increment(m: Money): Money {
  const g = m / 100;
  if (g < 1000) return G(50);
  if (g < 2000) return G(100);
  if (g < 5000) return G(200);
  if (g < 10000) return G(500);
  if (g < 20000) return G(1000);
  if (g < 50000) return G(2000);
  if (g < 100000) return G(5000);
  if (g < 200000) return G(10000);
  return G(20000);
}

/** Round an amount down onto the bid steps. */
export function onSteps(m: Money): Money {
  const s = increment(m);
  return Math.max(s, Math.floor(m / s) * s);
}

/** Named regulars who bid when they are in the room, and what they like. */
export const REGULARS: { npc: string; loves: string[]; /** how far over the value they may go */ zeal: number }[] = [
  { npc: 'lillian', loves: ['painting:portrait', 'painting:still', 'jade', 'porcelain'], zeal: 1.25 },
  { npc: 'alexander', loves: ['painting:seascape', 'watch', 'whisky', 'book'], zeal: 1.2 },
  { npc: 'sophia', loves: ['painting:abstract', 'painting:city', 'watch'], zeal: 0.95 },
];