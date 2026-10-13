import type { GameCore } from '../core/GameCore';
import { G, formatG, mulRatio, type Money } from '../core/money';
import { HOMES, HOME_ORDER, type HomeDef } from '../data/housing';
import { ITEMS } from '../data/items';
import { DAYS_PER_MONTH } from '../core/calendar';

export type HousingResult = { ok: true; message: string } | { ok: false; error: string };

const MIN_CREDIT_TO_RENT: Record<number, number> = { 0: 300, 1: 560, 2: 620, 3: 660, 4: 700, 5: 0 };

/** Phone & basic insurance are part of the fixed monthly costs. */
export const PHONE_BILL = G(60);
export const INSURANCE_BILL = G(85);

export class HousingSystem {
  constructor(private core: GameCore) {}

  private get h() {
    return this.core.state.housing;
  }

  current(): HomeDef {
    return HOMES[this.h.homeId];
  }

  furniture(homeId = this.h.homeId): string[] {
    return this.h.furniture[homeId] ?? [];
  }

  addFurniture(id: string): void {
    const list = this.h.furniture[this.h.homeId] ?? (this.h.furniture[this.h.homeId] = []);
    if (!list.includes(id)) list.push(id);
    this.core.touch();
  }

  /** Sleep comfort bonus from home tier and furniture. */
  comfort(): number {
    let c = this.current().comfort;
    for (const f of this.furniture()) c += ITEMS[f]?.comfort ?? 0;
    return Math.max(-0.2, Math.min(0.6, c));
  }

  /** How impressive the home is to visitors (0..6). */
  prestige(): number {
    let p = this.current().prestige;
    for (const f of this.furniture()) p += ITEMS[f]?.homePrestige ?? 0;
    return Math.min(6, p);
  }

  /** Real-estate value of a home, following the property index. */
  marketValue(homeId: string): Money {
    const def = HOMES[homeId];
    if (!def?.price) return 0;
    const idx = this.core.market.realEstateIndexBp();
    return mulRatio(def.price, idx, 10000);
  }

  ownedValue(): Money {
    return this.h.owned.reduce((a, id) => a + this.marketValue(id), 0);
  }

  monthlyCost(): Money {
    const d = this.current();
    let total = d.utilities + PHONE_BILL + INSURANCE_BILL;
    if (this.h.tenure === 'rent') total += this.h.rent;
    for (const id of this.h.owned) total += HOMES[id].maintenance;
    const v = this.core.inventory.vehicle();
    if (v?.vehicle) total += v.vehicle.upkeep;
    return total;
  }

  /** Issued on the first day of each month; due on the 5th. */
  issueMonthlyBills(): void {
    const d = this.current();
    const eco = this.core.economy;
    if (this.h.pendingRent && this.core.today() >= this.h.pendingRent.effectiveDay) {
      this.h.rent = this.h.pendingRent.amount;
      this.h.pendingRent = null;
    }
    if (this.h.tenure === 'rent') {
      const landlord = d.id === 'home_basic' ? 'margaret' : `landlord:${d.id}`;
      eco.issueBill('rent', landlord, d.id === 'home_basic' ? '房东玛格丽特' : `${d.name}物业`, this.h.rent, 4, `${d.name}本月房租`);
    }
    eco.issueBill('utilities', 'utility', '灰港水电燃气', d.utilities, 6, '水电燃气费');
    eco.issueBill('phone', 'telecom', '港湾电信', PHONE_BILL, 6, '手机月租');
    eco.issueBill('insurance', 'insurer', '灰港保险', INSURANCE_BILL, 6, '基础医疗保险');
    for (const id of this.h.owned) {
      const m = HOMES[id].maintenance;
      if (m > 0) eco.issueBill('maintenance', 'hoa', `${HOMES[id].name}物业`, m, 6, '物业与维护费');
    }
    const v = this.core.inventory.vehicle();
    if (v?.vehicle && v.vehicle.upkeep > 0) eco.issueBill('other', 'auto', '车辆保险与保养', v.vehicle.upkeep, 6, `${v.name}月度费用`);
  }

  rentOverdue(): boolean {
    return this.core.economy.overdueBills().some((b) => b.kind === 'rent');
  }

  /** Daily escalation for unpaid rent. */
  processRent(): void {
    const overdue = this.core.economy.overdueBills().filter((b) => b.kind === 'rent');
    if (overdue.length === 0) {
      this.h.overdueDays = 0;
      this.h.evictionNoticeDay = null;
      return;
    }
    const days = this.core.today() - Math.min(...overdue.map((b) => b.dueDay));
    this.h.overdueDays = days;
    this.core.bus.emit('rent:overdue', { days, total: overdue.reduce((a, b) => a + b.amount + b.lateFees, 0) });
    if (days >= 21 && this.h.evictionNoticeDay === null) {
      this.h.evictionNoticeDay = this.core.today();
      this.core.journal.add('life', '收到了房东的正式驱逐通知：七天内不付清欠租就必须搬走。', true);
    }
    if (this.h.evictionNoticeDay !== null && this.core.today() - this.h.evictionNoticeDay >= 7) this.evict();
  }

  /** Eviction moves the player into the cheapest shared room; the arrears stay as debt. */
  evict(): void {
    const from = this.current();
    this.h.homeId = 'home_shared';
    this.h.tenure = 'rent';
    this.h.rent = HOMES.home_shared.rent!;
    this.h.leaseStartDay = this.core.today();
    this.h.evictionNoticeDay = null;
    this.h.overdueDays = 0;
    this.core.player.adjustCredit(-60, '被驱逐');
    this.core.player.adjustReputation('trust', -12);
    this.core.journal.add('life', `因长期拖欠房租，你被迫搬离${from.name}，住进了码头合租房。欠款仍然需要偿还。`, true);
    this.core.bus.emit('evicted', { from: from.id });
    this.core.social.broadcastEvent('evicted', { from: from.id });
    if (this.core.state.world.location === from.location) this.core.requestTeleport('city', null);
  }

  /** Requirements for renting a home. */
  rentCheck(homeId: string): string | null {
    const d = HOMES[homeId];
    if (!d || d.rent === null) return '这套房子不出租';
    if (homeId === this.h.homeId) return '你已经住在这里了';
    if (this.core.economy.overdueBills().some((b) => b.kind === 'rent')) return '你还有拖欠的房租，没有房东愿意租给你';
    if (this.core.state.player.creditScore < MIN_CREDIT_TO_RENT[d.tier]) return `信用分不足（需要 ${MIN_CREDIT_TO_RENT[d.tier]}）`;
    const income = this.core.career.monthlyIncomeEstimate();
    const liquid = this.core.economy.liquid();
    if (d.tier >= 2 && income * 10 < d.rent * 25 && liquid < d.rent * 12) return `收入不足：房东要求月收入至少为房租的 2.5 倍（或有一年房租的存款）`;
    return null;
  }

  /** Move into a rental: pay deposit + first month. */
  rent(homeId: string): HousingResult {
    const err = this.rentCheck(homeId);
    if (err) return { ok: false, error: err };
    const d = HOMES[homeId];
    const upfront = d.rent! * 2;
    const r = this.core.economy.spend('bank', upfront, 'rent', `${d.name}押金 + 首月房租`, `landlord:${homeId}`);
    if (!r.ok) return { ok: false, error: `需要 ${formatG(upfront)}（押一付一），${r.error}` };
    this.leaveCurrentRental();
    this.h.homeId = homeId;
    this.h.tenure = 'rent';
    this.h.rent = d.rent!;
    this.h.leaseStartDay = this.core.today();
    this.afterMove(d, '租下了');
    return { ok: true, message: `你租下了${d.name}。` };
  }

  private leaveCurrentRental(): void {
    if (this.h.tenure !== 'rent') return;
    const cur = this.current();
    // deposit refunded when nothing is owed
    if (!this.rentOverdue() && cur.rent) {
      const deposit = this.h.rent;
      this.core.economy.receive('bank', deposit, 'housing', `${cur.name}押金退还`, `landlord:${cur.id}`);
    }
  }

  buyCheck(homeId: string, mortgage: boolean): string | null {
    const d = HOMES[homeId];
    if (!d || d.price === null) return '这处房产不出售';
    if (this.h.owned.includes(homeId)) return '你已经拥有这处房产';
    const price = this.marketValue(homeId);
    const closing = mulRatio(price, 2, 100);
    if (!mortgage) return this.core.economy.balance('bank') >= price + closing ? null : `银行存款不足（需要 ${formatG(price + closing)}，含 2% 交易费）`;
    const down = mulRatio(price, 20, 100);
    if (this.core.economy.balance('bank') < down + closing) return `首付不足（需要 ${formatG(down + closing)}：20% 首付 + 2% 交易费）`;
    if (this.core.state.player.creditScore < 650) return '信用分低于 650，银行拒绝了房贷申请';
    const loan = price - down;
    const payment = Math.ceil((loan * (650 / 10000 / 12)) / (1 - Math.pow(1 + 650 / 10000 / 12, -240)));
    const income = this.core.career.monthlyIncomeEstimate();
    if (payment + this.core.economy.monthlyObligations() > income * 0.45) return `月供约 ${formatG(payment)}，超过了收入的可承受范围`;
    return null;
  }

  buy(homeId: string, mortgage: boolean): HousingResult {
    const err = this.buyCheck(homeId, mortgage);
    if (err) return { ok: false, error: err };
    const d = HOMES[homeId];
    const price = this.marketValue(homeId);
    const closing = mulRatio(price, 2, 100);
    const eco = this.core.economy;
    if (mortgage) {
      const down = mulRatio(price, 20, 100);
      eco.openLoan({ lender: 'bank', lenderName: '灰港储蓄信托（房贷）', principal: price - down, aprBp: 650, termMonths: 240, kind: 'mortgage' });
    }
    const r = eco.spend('bank', price, 'property_purchase', `购买${d.name}`, 'seller');
    if (!r.ok) return { ok: false, error: r.error };
    eco.spend('bank', closing, 'fees', `${d.name}交易税费`, 'registry');
    this.leaveCurrentRental();
    this.h.owned.push(homeId);
    this.h.homeId = homeId;
    this.h.tenure = 'own';
    this.h.rent = 0;
    this.afterMove(d, '买下了');
    this.core.journal.add('milestone', `买下了自己的房子：${d.name}（${formatG(price)}）`, true);
    return { ok: true, message: `恭喜！你成为了${d.name}的业主。` };
  }

  /** Move into a property you already own. */
  moveIntoOwned(homeId: string): HousingResult {
    if (!this.h.owned.includes(homeId)) return { ok: false, error: '你不拥有这处房产' };
    if (homeId === this.h.homeId) return { ok: false, error: '你已经住在这里了' };
    this.leaveCurrentRental();
    this.h.homeId = homeId;
    this.h.tenure = 'own';
    this.h.rent = 0;
    this.afterMove(HOMES[homeId], '搬回了');
    return { ok: true, message: `搬进了${HOMES[homeId].name}` };
  }

  sell(homeId: string): HousingResult {
    if (!this.h.owned.includes(homeId)) return { ok: false, error: '你不拥有这处房产' };
    if (homeId === this.h.homeId) return { ok: false, error: '不能出售正在居住的房子，请先搬走' };
    const value = this.marketValue(homeId);
    const fee = mulRatio(value, 5, 100);
    const eco = this.core.economy;
    eco.receive('bank', value, 'property_sale', `出售${HOMES[homeId].name}`, 'buyer');
    eco.spend('bank', fee, 'fees', '房产中介费 5%', 'agent');
    this.h.owned = this.h.owned.filter((h) => h !== homeId);
    // the mortgage is cleared from the proceeds
    const mortgage = this.core.state.economy.loans.find((l) => l.kind === 'mortgage' && l.status === 'active');
    if (mortgage && this.h.owned.length === 0) eco.prepayLoan(mortgage.id, mortgage.balance);
    this.core.journal.add('money', `卖掉了${HOMES[homeId].name}，成交价 ${formatG(value)}`, true);
    return { ok: true, message: `已出售，${formatG(value - fee)} 净额到账（扣除 5% 中介费）` };
  }

  private afterMove(d: HomeDef, verb: string): void {
    this.core.journal.add('life', `${verb}${d.name}（${d.district}，${d.area}）`, true);
    this.core.bus.emit('moved', { homeId: d.id });
    this.core.social.broadcastEvent('moved', { home: d.id, tier: d.tier });
    this.core.touch();
  }

  nextTierUp(): HomeDef | null {
    const i = HOME_ORDER.indexOf(this.h.homeId);
    return i >= 0 && i < HOME_ORDER.length - 1 ? HOMES[HOME_ORDER[i + 1]] : null;
  }

  /** Landlord rent increase notice: applies from the next month. */
  scheduleRentIncrease(pct: number): Money {
    const newRent = Math.round((this.h.rent * (100 + pct)) / 100 / 100) * 100;
    this.h.pendingRent = { amount: newRent, effectiveDay: this.core.today() + DAYS_PER_MONTH };
    return newRent;
  }
}
