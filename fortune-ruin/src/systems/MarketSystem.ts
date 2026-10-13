import type { GameCore } from '../core/GameCore';
import { G, formatG, mulRatio, type Money } from '../core/money';
import { Rng } from '../core/rng';
import { DAYS_PER_YEAR } from '../core/calendar';
import type { MarketState } from '../core/state';

export interface AssetDef {
  id: string;
  name: string;
  kind: '指数基金' | '债券' | '股票' | '商品' | '加密资产' | '房地产';
  /** annual drift */
  mu: number;
  /** annual volatility */
  sigma: number;
  start: Money;
  tradable: boolean;
  desc: string;
}

export const ASSETS: AssetDef[] = [
  { id: 'GHX', name: '灰港综合指数基金', kind: '指数基金', mu: 0.065, sigma: 0.16, start: G(100), tradable: true, desc: '追踪灰港市场前 100 家公司，低费率、分散。' },
  { id: 'BOND', name: '政府债券基金', kind: '债券', mu: 0.03, sigma: 0.035, start: G(50), tradable: true, desc: '波动很小，收益也有限。' },
  { id: 'WMAR', name: '惠特莫尔航运', kind: '股票', mu: 0.05, sigma: 0.32, start: G(48), tradable: true, desc: '老牌航运公司，受港口景气影响大。' },
  { id: 'NGC', name: '北门资本', kind: '股票', mu: 0.07, sigma: 0.26, start: G(132), tradable: true, desc: '本地金融集团。' },
  { id: 'LUMN', name: '流明科技', kind: '股票', mu: 0.09, sigma: 0.48, start: G(26), tradable: true, desc: '高速增长的科技公司，股价波动剧烈。' },
  { id: 'GOLD', name: '黄金 ETF', kind: '商品', mu: 0.02, sigma: 0.14, start: G(180), tradable: true, desc: '避险资产。' },
  { id: 'HVB', name: '港湾币', kind: '加密资产', mu: 0, sigma: 0.95, start: G(12), tradable: true, desc: '没有现金流支撑的投机资产，可能暴涨也可能归零。' },
  { id: 'RE', name: '灰港房地产指数', kind: '房地产', mu: 0.035, sigma: 0.07, start: G(100), tradable: false, desc: '决定房产估值。' },
];

export const ASSET_BY_ID: Record<string, AssetDef> = Object.fromEntries(ASSETS.map((a) => [a.id, a]));

export const COMMISSION_BP = 25; // 0.25%
export const MIN_COMMISSION = G(2);

export function initialMarket(seed: number): MarketState {
  const assets: MarketState['assets'] = {};
  for (const a of ASSETS) assets[a.id] = { id: a.id, price: a.start, history: [a.start], lastChange: 0 };
  return { assets, rng: new Rng(seed).getState(), lastUpdateDay: -1, priceIndexBp: 10000 };
}

/**
 * Daily geometric Brownian motion with occasional market-wide shocks.
 * Expected returns are modest and nothing is guaranteed.
 */
export class MarketSystem {
  constructor(private core: GameCore) {}

  private get m() {
    return this.core.state.market;
  }

  price(id: string): Money {
    return this.m.assets[id]?.price ?? 0;
  }

  realEstateIndexBp(): number {
    const re = this.m.assets.RE;
    return Math.round((re.price / ASSET_BY_ID.RE.start) * 10000);
  }

  /** Cumulative price level for goods (inflation), 10000 = base. */
  priceLevelBp(): number {
    return this.m.priceIndexBp;
  }

  dailyUpdate(day: number): void {
    if (this.m.lastUpdateDay === day) return;
    this.m.lastUpdateDay = day;
    if (day % 7 >= 5) return; // markets closed on weekends
    const rng = new Rng(this.m.rng);
    const dt = 1 / (DAYS_PER_YEAR * (5 / 7));
    // a common market factor plus idiosyncratic noise
    const marketZ = rng.normal();
    let shock = 0;
    if (rng.chance(0.012)) shock = rng.chance(0.5) ? -rng.range(0.05, 0.14) : rng.range(0.03, 0.08);
    if (shock !== 0) this.core.events.marketShock(shock);
    for (const a of ASSETS) {
      const st = this.m.assets[a.id];
      const beta = a.id === 'BOND' ? 0.1 : a.id === 'GOLD' ? -0.2 : a.id === 'HVB' ? 0.6 : a.id === 'RE' ? 0.3 : 1;
      const z = beta * marketZ + Math.sqrt(Math.max(0, 1 - beta * beta)) * rng.normal();
      const logRet = (a.mu - (a.sigma * a.sigma) / 2) * dt + a.sigma * Math.sqrt(dt) * z + shock * beta * (a.id === 'BOND' ? 0.1 : 1);
      const next = Math.max(G(0.05), Math.round(st.price * Math.exp(logRet)));
      st.lastChange = next - st.price;
      st.price = next;
      st.history.push(next);
      if (st.history.length > 120) st.history.shift();
    }
    // ~2.4% annual inflation of everyday prices
    this.m.priceIndexBp = Math.round(this.m.priceIndexBp * (1 + 0.024 / (DAYS_PER_YEAR * (5 / 7))));
    this.m.rng = rng.getState();
    this.core.touch();
  }

  holding(id: string) {
    return this.core.state.economy.holdings[id];
  }

  portfolioValue(): Money {
    let total = 0;
    for (const [id, h] of Object.entries(this.core.state.economy.holdings)) total += h.units * this.price(id);
    return total;
  }

  commission(amount: Money): Money {
    return Math.max(MIN_COMMISSION, mulRatio(amount, COMMISSION_BP, 10000));
  }

  buy(id: string, units: number): { ok: true; message: string } | { ok: false; error: string } {
    const a = ASSET_BY_ID[id];
    if (!a || !a.tradable) return { ok: false, error: '该资产不可交易' };
    if (!Number.isInteger(units) || units <= 0) return { ok: false, error: '请输入整数份额' };
    if (toDay(this.core.now()) % 7 >= 5) return { ok: false, error: '周末休市' };
    const cost = this.price(id) * units;
    const fee = this.commission(cost);
    const eco = this.core.economy;
    if (eco.balance('bank') < cost + fee) return { ok: false, error: '银行存款不足（含手续费）' };
    const r = eco.spend('bank', cost, 'investment_buy', `买入 ${a.name} ×${units}`, 'broker');
    if (!r.ok) return r;
    eco.spend('bank', fee, 'fees', '证券交易佣金', 'broker');
    const h = this.core.state.economy.holdings[id] ?? (this.core.state.economy.holdings[id] = { units: 0, costBasis: 0 });
    h.units += units;
    h.costBasis += cost + fee;
    this.core.bus.emit('invest', { id, units, side: 'buy', amount: cost });
    return { ok: true, message: `买入 ${a.name} ${units} 份，成交 ${formatG(cost)}，佣金 ${formatG(fee)}` };
  }

  sell(id: string, units: number): { ok: true; message: string } | { ok: false; error: string } {
    const a = ASSET_BY_ID[id];
    const h = this.core.state.economy.holdings[id];
    if (!a || !h || h.units <= 0) return { ok: false, error: '没有持仓' };
    if (!Number.isInteger(units) || units <= 0 || units > h.units) return { ok: false, error: '份额无效' };
    if (toDay(this.core.now()) % 7 >= 5) return { ok: false, error: '周末休市' };
    const proceeds = this.price(id) * units;
    const fee = this.commission(proceeds);
    const basisPart = Math.round((h.costBasis * units) / h.units);
    h.units -= units;
    h.costBasis -= basisPart;
    if (h.units === 0) delete this.core.state.economy.holdings[id];
    const eco = this.core.economy;
    eco.receive('bank', proceeds, 'investment_sell', `卖出 ${a.name} ×${units}`, 'broker');
    eco.spend('bank', Math.min(fee, eco.balance('bank')), 'fees', '证券交易佣金', 'broker');
    const pnl = proceeds - fee - basisPart;
    this.core.bus.emit('invest', { id, units, side: 'sell', amount: proceeds, pnl });
    if (Math.abs(pnl) >= G(5000)) this.core.journal.add('money', `卖出${a.name}，${pnl >= 0 ? '获利' : '亏损'} ${formatG(Math.abs(pnl))}`, true);
    return { ok: true, message: `卖出 ${a.name} ${units} 份，到账 ${formatG(proceeds - fee)}（盈亏 ${formatG(pnl, { sign: true })}）` };
  }
}

function toDay(t: number): number {
  return Math.floor(t / 1440);
}
