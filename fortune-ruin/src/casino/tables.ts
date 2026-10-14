import { G } from '../core/money';
import type { GameKind, MemberTier } from '../core/state';
import type { BlackjackRules } from './BlackjackEngine';
import type { BaccaratRules } from './BaccaratEngine';
import type { RouletteRules } from './RouletteEngine';
import type { PokerRules } from './PokerEngine';

export type TableArea = 'main' | 'high' | 'vip';

interface TableBase {
  id: string;
  name: string;
  area: TableArea;
  minTier?: MemberTier;
  /** named NPC dealing at this table while on shift */
  dealerNpc?: string;
  seats: number;
}

export type TableConfig =
  | (TableBase & { game: 'blackjack'; rules: Partial<BlackjackRules> })
  | (TableBase & { game: 'baccarat'; rules: Partial<BaccaratRules> })
  | (TableBase & { game: 'roulette'; rules: Partial<RouletteRules> })
  | (TableBase & { game: 'poker'; rules: Partial<PokerRules> });

export const TABLES: TableConfig[] = [
  {
    id: 'bj1',
    game: 'blackjack',
    name: '21点 · 1号桌',
    area: 'main',
    seats: 5,
    dealerNpc: 'natasha',
    rules: { decks: 6, blackjackPays: [3, 2], dealerHitsSoft17: false, minBet: G(10), maxBet: G(1000), seats: 5 },
  },
  {
    id: 'bj2',
    game: 'blackjack',
    name: '21点 · 2号桌',
    area: 'main',
    seats: 5,
    rules: { decks: 6, blackjackPays: [3, 2], dealerHitsSoft17: false, minBet: G(25), maxBet: G(2500), seats: 5 },
  },
  {
    id: 'bj3',
    game: 'blackjack',
    name: '21点 · 欢乐桌',
    area: 'main',
    seats: 5,
    rules: { decks: 6, blackjackPays: [6, 5], dealerHitsSoft17: true, minBet: G(5), maxBet: G(500), seats: 5 },
  },
  {
    id: 'rl1',
    game: 'roulette',
    name: '欧式轮盘 · 1号',
    area: 'main',
    seats: 6,
    rules: { minTotal: G(5), maxInside: G(200), maxOutside: G(2000), laPartage: false },
  },
  {
    id: 'rl2',
    game: 'roulette',
    name: '欧式轮盘 · 2号',
    area: 'main',
    seats: 6,
    rules: { minTotal: G(25), maxInside: G(500), maxOutside: G(5000), laPartage: false },
  },
  {
    id: 'bac1',
    game: 'baccarat',
    name: '百家乐 · 1号',
    area: 'main',
    seats: 7,
    rules: { decks: 8, commissionBp: 500, tiePays: 8, minBet: G(25), maxBet: G(3000), tieMax: G(500) },
  },
  {
    id: 'bac2',
    game: 'baccarat',
    name: '百家乐 · 2号',
    area: 'main',
    seats: 7,
    rules: { decks: 8, commissionBp: 500, tiePays: 8, minBet: G(50), maxBet: G(5000), tieMax: G(800) },
  },
  {
    id: 'bjh',
    game: 'blackjack',
    name: '高额 21点',
    area: 'high',
    seats: 5,
    minTier: 'platinum',
    rules: { decks: 6, blackjackPays: [3, 2], dealerHitsSoft17: false, surrender: 'late', minBet: G(100), maxBet: G(10000), seats: 5 },
  },
  {
    id: 'rlh',
    game: 'roulette',
    name: '高额轮盘（法式规则）',
    area: 'high',
    seats: 6,
    minTier: 'platinum',
    rules: { minTotal: G(50), maxInside: G(2000), maxOutside: G(20000), laPartage: true },
  },
  {
    id: 'bach',
    game: 'baccarat',
    name: '高额百家乐',
    area: 'high',
    seats: 7,
    minTier: 'platinum',
    rules: { decks: 8, commissionBp: 500, tiePays: 8, minBet: G(200), maxBet: G(30000), tieMax: G(3000) },
  },
  {
    id: 'bacv',
    game: 'baccarat',
    name: 'VIP 私人厅百家乐',
    area: 'vip',
    seats: 7,
    minTier: 'diamond',
    rules: { decks: 8, commissionBp: 500, tiePays: 8, minBet: G(1000), maxBet: G(200000), tieMax: G(20000) },
  },
  {
    id: 'bjv',
    game: 'blackjack',
    name: 'VIP 私人厅 21点',
    area: 'vip',
    seats: 5,
    minTier: 'diamond',
    rules: { decks: 6, blackjackPays: [3, 2], dealerHitsSoft17: false, surrender: 'late', resplitAces: true, minBet: G(500), maxBet: G(50000), seats: 5 },
  },
];

/**
 * Poker is player-versus-player; the house only deals and takes a published
 * rake. Kept apart from TABLES so the house-banked crowd logic never touches it.
 */
export const POKER_TABLES: TableConfig[] = [
  {
    id: 'pk1',
    game: 'poker',
    name: '德州扑克 · 1/2',
    area: 'main',
    seats: 6,
    rules: { seats: 6, smallBlind: G(1), bigBlind: G(2), minBuyIn: G(40), maxBuyIn: G(200), rakeBp: 500, rakeCap: G(4) },
  },
  {
    id: 'pk2',
    game: 'poker',
    name: '德州扑克 · 5/10',
    area: 'main',
    seats: 6,
    rules: { seats: 6, smallBlind: G(5), bigBlind: G(10), minBuyIn: G(200), maxBuyIn: G(1000), rakeBp: 500, rakeCap: G(10) },
  },
];

export const TABLE_BY_ID: Record<string, TableConfig> = Object.fromEntries([...TABLES, ...POKER_TABLES].map((t) => [t.id, t]));

export const GAME_NAMES: Record<GameKind, string> = { blackjack: '21点', baccarat: '百家乐', roulette: '轮盘', poker: '德州扑克', slots: '老虎机' };

export interface TierInfo {
  id: MemberTier;
  name: string;
  minPoints: number;
  color: string;
  perks: string[];
  /** share of theoretical loss returned as comp credit (non-cash) */
  compRate: number;
  barDiscount: number;
}

/**
 * Tier points come from *theoretical loss* (stake × published house edge),
 * which is how real casinos rate players. Membership never changes odds.
 */
export const TIERS: TierInfo[] = [
  { id: 'visitor', name: '普通访客', minPoints: 0, color: '#9aa3ad', perks: ['基础赌场服务', '可使用大厅所有赌桌'], compRate: 0, barDiscount: 0 },
  { id: 'silver', name: 'Silver 银卡', minPoints: 200, color: '#cfd6de', perks: ['赌场酒吧 9 折', '少量餐饮积分（理论损失的 8%）', '周六天穹之夜可以上楼'], compRate: 0.08, barDiscount: 10 },
  { id: 'gold', name: 'Gold 金卡', minPoints: 1500, color: '#e3b341', perks: ['赌场酒吧饮品免费招待', '客户经理接待与活动邀请', '餐饮积分 15%', '天穹层会员休息室（自助餐免费）', '套房会员价、水疗八折'], compRate: 0.15, barDiscount: 100 },
  { id: 'platinum', name: 'Platinum 白金卡', minPoints: 8000, color: '#b9e0ff', perks: ['高额投注区通行', '专属服务与信用额度申请', '餐饮积分 20%', '每周一晚免费套房、每天一次免费水疗', '礼宾专车免费'], compRate: 0.2, barDiscount: 100 },
  { id: 'diamond', name: 'Diamond 钻石卡', minPoints: 40000, color: '#f3a6ff', perks: ['VIP 私人厅', '专属客户经理维克多', '私人晚宴邀请', '餐饮积分 25%', '套房与水疗全部免费'], compRate: 0.25, barDiscount: 100 },
];

export const TIER_INDEX: Record<MemberTier, number> = { visitor: 0, silver: 1, gold: 2, platinum: 3, diamond: 4 };

export function tierInfo(t: MemberTier): TierInfo {
  return TIERS[TIER_INDEX[t]];
}

/** Published edges used for theoretical loss (basic-strategy blackjack is rated at 1% like real casinos do). */
export function ratedEdge(game: GameKind, detail?: string): number {
  switch (game) {
    case 'blackjack':
      return detail === '6:5' ? 0.02 : 0.01;
    case 'baccarat':
      return detail === 'tie' ? 0.1436 : 0.0115;
    case 'roulette':
      return detail === 'laPartage' ? 0.0135 : 0.027;
    case 'poker':
      // poker players are rated on the rake they generate (≈ 2.5% of chips put into pots)
      return 0.025;
    default:
      return 0.03;
  }
}
