import type { GameCore } from '../core/GameCore';
import { G, formatG, type Money } from '../core/money';
import { prestigeWealth } from './SocialSystem';
import { NPCS } from '../data/npcs';
import { TIER_INDEX } from '../casino/tables';

export interface WealthClass {
  id: string;
  name: string;
  min: Money;
  desc: string;
}

/** Initial balancing proposal (net worth in G), calibrated against in-game prices. */
export const WEALTH_CLASSES: WealthClass[] = [
  { id: 'debtor', name: '负债者', min: -Infinity, desc: '财务危机' },
  { id: 'low', name: '低收入阶层', min: 0, desc: '生活拮据' },
  { id: 'working', name: '普通工薪阶层', min: G(10000), desc: '基本稳定' },
  { id: 'middle', name: '中产阶层', min: G(50000), desc: '有一定消费能力' },
  { id: 'affluent', name: '富裕阶层', min: G(200000), desc: '高端消费能力' },
  { id: 'millionaire', name: '百万富豪', min: G(1000000), desc: '社会上层' },
  { id: 'uhnw', name: '超高净值阶层', min: G(5000000), desc: '强大经济影响力' },
];

export function wealthClassOf(netWorth: Money): WealthClass {
  let c = WEALTH_CLASSES[0];
  for (const w of WEALTH_CLASSES) if (netWorth >= w.min) c = w;
  return c;
}

/**
 * Real, liquid and perceived wealth are tracked separately. Strangers only
 * see appearance signals; individual NPCs hold their own estimates.
 */
export class WealthSystem {
  constructor(private core: GameCore) {}

  real(): Money {
    return this.core.economy.netWorth();
  }

  liquid(): Money {
    return this.core.economy.liquid() + this.core.market.portfolioValue();
  }

  /** What a stranger on the street would guess from how you look (outfit, watch, car). */
  perceivedByStrangers(): Money {
    return prestigeWealth(this.core.inventory.appearancePrestige(true));
  }

  /** Public impression combining appearance, casino status and known address. */
  perceived(): Money {
    let w = this.perceivedByStrangers();
    const tier = TIER_INDEX[this.core.state.casino.membership.tier];
    if (tier >= 2) w = Math.max(w, prestigeWealth(1.8 + tier * 0.7));
    const homeTier = this.core.housing.current().tier;
    w = Math.round(w * 0.65 + prestigeWealth(homeTier + 0.4) * 0.35);
    return w;
  }

  /** Average of what the people who know you believe. */
  circleImpression(): { avg: Money | null; n: number } {
    let sum = 0;
    let n = 0;
    for (const d of NPCS) {
      const b = this.core.state.social.beliefs[d.id];
      if (b?.wealth && this.core.state.social.rel[d.id]?.met) {
        sum += b.wealth.estimate;
        n++;
      }
    }
    return { avg: n ? Math.round(sum / n) : null, n };
  }

  wealthClass(): WealthClass {
    return wealthClassOf(this.real());
  }

  dailySnapshot(day: number): void {
    const eco = this.core.economy;
    const st = this.core.state.stats;
    const today = this.core.state.economy.today;
    const net = this.real();
    st.days.push({
      day,
      netWorth: net,
      liquid: this.liquid(),
      cash: eco.balance('cash'),
      bank: eco.balance('bank'),
      chips: eco.balance('chips'),
      debt: eco.totalDebt(),
      assets: eco.totalAssets(),
      income: today.income,
      expenses: today.expenses,
      casinoNet: today.casinoNet,
      perceived: this.perceived(),
      mood: Math.round(this.core.state.player.stats.mood),
      stress: Math.round(this.core.state.player.stats.stress),
    });
    if (st.days.length > 400) st.days.shift();
    if (net > st.peakNetWorth) st.peakNetWorth = net;
    if (net < st.lowestNetWorth) st.lowestNetWorth = net;
    const cls = wealthClassOf(net);
    const key = `class:${cls.id}`;
    if (st.milestones[key] === undefined) {
      st.milestones[key] = day;
      if (cls.id !== 'working') this.core.journal.add('milestone', `净资产 ${formatG(net)}：你进入了「${cls.name}」（${cls.desc}）。`, true);
    }
  }
}
