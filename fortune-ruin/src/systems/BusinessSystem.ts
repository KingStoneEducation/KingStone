import type { GameCore } from '../core/GameCore';
import { runSteps } from '../core/steps';
import { G, formatG, mulRatio, type Money } from '../core/money';
import { DAYS_PER_MONTH, MINUTES_PER_DAY, toDate } from '../core/calendar';
import type { BusinessState } from '../core/state';
import { BIZ_TYPES, MARKETING, PREMISES, PRICE_LEVELS, RENOVATION_DAYS, SUPPLY_LEVELS, premiseAt, type BizType, type PriceLevel, type Supplies } from '../data/business';
import { NPC_BY_ID } from '../data/npcs';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * The player's own shops, one to a premise. Every day a shop is open, customers come
 * according to how many people pass by (the street, the day of the week), how many of
 * them know the place, how well that kind of shop suits the street, its reputation, its
 * prices and how many staff can serve them; takings minus stock are settled into the
 * bank each night. Rent, wages and utilities arrive as bills on the first of the month,
 * marketing is paid weekly. Nothing is scripted to succeed or fail.
 */
export class BusinessSystem {
  constructor(private core: GameCore) {}

  /** Every shop the player runs. */
  list(): BusinessState[] {
    return this.core.state.businesses;
  }

  /** The shop on this premise, if it is the player's. */
  at(premiseId: string): BusinessState | undefined {
    return this.list().find((b) => b.premise === premiseId);
  }

  /** The shop the player is standing in, if any. */
  here(): BusinessState | undefined {
    const p = premiseAt(this.core.state.world.location);
    return p ? this.at(p.id) : undefined;
  }

  def(b: BusinessState) {
    return BIZ_TYPES[b.type];
  }

  /** Everything paid at signing. */
  upfront(premiseId: string, type: BizType): Money {
    const p = PREMISES[premiseId];
    return p.rent * 3 + BIZ_TYPES[type].fitout;
  }

  canLease(premiseId: string, type: BizType): string | null {
    const p = PREMISES[premiseId];
    if (!p || !BIZ_TYPES[type]) return '没有这个铺面';
    if (this.at(premiseId)) return '这个铺面已经是你的了';
    const cost = this.upfront(premiseId, type);
    if (this.core.economy.balance('bank') + this.core.economy.balance('cash') < cost) return `需要 ${formatG(cost)}（两个月押金、首月租金和装修）`;
    return null;
  }

  lease(premiseId: string, type: BizType): ActionResult {
    const err = this.canLease(premiseId, type);
    if (err) return { ok: false, error: err };
    const p = PREMISES[premiseId];
    const d = BIZ_TYPES[type];
    const eco = this.core.economy;
    const pay = (amount: Money, memo: string) => eco.pay(amount, 'business_cost', memo, 'premises', ['bank', 'cash']);
    for (const [amount, memo] of [
      [p.rent * 2, `${p.address}租赁押金（退租时退还）`],
      [p.rent, `${p.address}首月租金`],
      [d.fitout, `${d.name}装修与设备`],
    ] as [Money, string][]) {
      const r = pay(amount, memo);
      if (!r.ok) return { ok: false, error: r.error };
    }
    const today = this.core.today();
    this.list().push({
      premise: premiseId,
      type,
      phase: 'renovating',
      signedDay: today,
      openDay: today + RENOVATION_DAYS,
      price: 'mid',
      supplies: 'basic',
      staff: Math.max(1, Math.ceil(d.base / d.perStaff)),
      marketing: 1,
      awareness: 0.2,
      reputation: 50,
      fitout: d.fitout,
      deposit: p.rent * 2,
      days: [],
      shiftDay: -1,
      competitorUntil: -1,
      totals: { revenue: 0, cogs: 0, fixed: p.rent * 3, invested: d.fitout },
    });
    this.core.journal.add('money', `租下${p.address}，开一家${d.name}。装修 ${RENOVATION_DAYS} 天。`, true);
    this.core.phone.send('premises', p.landlord, `${p.address}的租约已经签好，装修队明天进场，预计 ${RENOVATION_DAYS} 天后可以开业。房租每月 1 日自动扣款。`);
    this.core.touch();
    return { ok: true, message: `签约成功。${RENOVATION_DAYS} 天后开业。` };
  }

  setPolicy(premiseId: string, p: { price?: PriceLevel; supplies?: Supplies; staff?: number; marketing?: number }): void {
    const b = this.at(premiseId);
    if (!b) return;
    if (p.price) b.price = p.price;
    if (p.supplies) b.supplies = p.supplies;
    if (p.staff !== undefined) b.staff = clamp(Math.round(p.staff), 1, 6);
    if (p.marketing !== undefined) b.marketing = clamp(Math.round(p.marketing), 0, MARKETING.length - 1);
    this.core.touch();
  }

  /** How many people come by on an ordinary weekday and at the weekend, for this kind of shop on this street. */
  footfall(premiseId: string, type: BizType, weekend: boolean): number {
    const p = PREMISES[premiseId];
    const d = BIZ_TYPES[type];
    return p.footfall * (p.suits[type] ?? 1) * (weekend ? p.weekend * d.weekend : 1);
  }

  /** Staff a shop needs on an ordinary (busier of weekday and weekend) day once it is known. */
  staffNeeded(b: BusinessState): number {
    const d = BIZ_TYPES[b.type];
    const busiest = Math.max(this.footfall(b.premise, b.type, false), this.footfall(b.premise, b.type, true));
    return Math.max(1, Math.ceil((d.base * busiest) / d.perStaff));
  }

  /** How good the place is today, before price. */
  quality(b: BusinessState, shift: boolean): number {
    const staffing = Math.min(1, b.staff / this.staffNeeded(b));
    return SUPPLY_LEVELS[b.supplies].quality * (0.7 + 0.3 * staffing) * (shift ? 1.1 : 1);
  }

  /** One day of trade at every open shop, each settled on its own. */
  simulateDay(day: number): void {
    for (const b of [...this.list()]) this.trade(b, day);
  }

  private trade(b: BusinessState, day: number): void {
    if (b.phase !== 'open' || day < b.openDay) return;
    const d = BIZ_TYPES[b.type];
    const p = PREMISES[b.premise];
    const rng = this.core.rng;
    const weekday = toDate(day * MINUTES_PER_DAY).weekday;
    const shift = b.shiftDay === day;
    const price = PRICE_LEVELS[b.price].factor;
    const q = this.quality(b, shift);
    // reputation drifts toward what the place deserves for its price
    const target = clamp(50 + (q / price - 1) * 80, 10, 95);
    b.reputation = clamp(b.reputation + (target - b.reputation) * 0.04, 0, 100);
    // word of mouth and marketing spread awareness
    const reach = 0.006 + MARKETING[b.marketing].reach + (b.reputation / 100) * 0.01;
    b.awareness = clamp(b.awareness + (1 - b.awareness) * reach - (b.marketing === 0 && b.reputation < 40 ? 0.004 : 0), 0.05, 1);
    const footfall = this.footfall(b.premise, b.type, weekday >= 5) * (b.competitorUntil > day ? 0.85 : 1);
    const noise = Math.exp(rng.normal() * 0.18);
    const demand = d.base * footfall * b.awareness * (0.6 + b.reputation / 125) * Math.pow(price, -1.6) * noise;
    const working = Math.max(1, b.staff - ((b.vacancyUntil ?? -1) > day ? 1 : 0));
    const capacity = working * d.perStaff * (shift ? 1.5 : 1);
    const customers = Math.max(0, Math.round(Math.min(demand, capacity)));
    const revenue = Math.round(customers * d.ticket * price);
    const cogs = Math.round(revenue * (d.cogs + SUPPLY_LEVELS[b.supplies].extraCogs));
    const net = revenue - cogs;
    const memo = `${p.address}${d.name}日结：顾客 ${customers} 人，营业额 ${formatG(revenue)}，进货 ${formatG(cogs)}`;
    if (net > 0) this.core.economy.receive('bank', net, 'business_income', memo, 'shop');
    else if (net < 0) this.core.economy.pay(-net, 'business_cost', memo, 'shop', ['bank', 'cash']);
    b.totals.revenue += revenue;
    b.totals.cogs += cogs;
    b.days.push({ day, customers, revenue, cogs, net });
    if (b.days.length > 120) b.days.shift();
    this.events(b, day);
  }

  private events(b: BusinessState, day: number): void {
    const rng = this.core.rng;
    const d = BIZ_TYPES[b.type];
    const p = PREMISES[b.premise];
    const days = day - b.openDay;
    const where = this.list().length > 1 ? `${p.address}的` : '';
    if (days > 5 && rng.chance(1 / 60)) {
      // health and safety inspection
      const sloppy = b.supplies === 'basic' && b.staff < this.staffNeeded(b);
      if (sloppy && rng.chance(0.6)) {
        this.core.economy.pay(G(2000), 'fees', `${where}${d.name}卫生检查不合格罚款`, 'city_hall', ['bank', 'cash']);
        b.reputation = clamp(b.reputation - 8, 0, 100);
        this.core.phone.send('city_hall', '灰港市场监管所', `${where}${d.name}卫生检查不合格：人手不足、操作不规范。罚款 2,000 G。`);
      } else {
        b.reputation = clamp(b.reputation + 2, 0, 100);
        this.core.journal.add('money', `${where}${d.name}通过了卫生检查。`);
      }
    }
    if (b.reputation >= 70 && days > 14 && rng.chance(1 / 45)) {
      b.awareness = clamp(b.awareness + 0.15, 0, 1);
      const kiki = this.core.social.rel('kiki').met;
      this.core.phone.send(kiki ? 'kiki' : 'shop', kiki ? '琪琪' : '店里', kiki ? `我把你${where ? `在${p.address}` : ''}的${d.name}发到网上啦！点赞好多～你可得请我喝东西。` : `一位美食博主来${where}${d.name}拍了视频，今天有不少人说是看了视频来的。`);
    }
    if (b.staff > 1 && (b.vacancyUntil ?? -1) <= day && rng.chance(1 / 120)) {
      // someone leaves; the replacement starts in a week
      b.vacancyUntil = day + 7;
      this.core.phone.send('shop', '店里', `${where}${d.name}的一位店员辞职了，说是找到了离家更近的工作。新招的人下周才能到岗，这几天会忙不过来。`);
    }
    if (days > 60 && b.competitorUntil < 0 && rng.chance(1 / 120)) {
      b.competitorUntil = day + 60;
      this.core.phone.send('shop', '店里', `${where}${d.name}街对面新开了一家同类的店，最近客人被分走了一些。`);
    }
  }

  /** The first of the month: rent, wages and utilities, shop by shop. */
  monthlyBills(): void {
    const eco = this.core.economy;
    for (const b of this.list()) {
      const d = BIZ_TYPES[b.type];
      const p = PREMISES[b.premise];
      eco.issueBill('other', 'premises', p.landlord, p.rent, 4, `${p.address}房租`);
      if (b.phase === 'open') {
        eco.issueBill('other', 'payroll', `${d.name}员工`, d.wage * b.staff, 4, `${p.address}${d.name}员工工资（${b.staff} 人）`);
        eco.issueBill('other', 'utility', '灰港水电燃气', d.utilities, 6, `${p.address}${d.name}水电与执照`);
        b.totals.fixed += d.wage * b.staff + d.utilities;
      }
      b.totals.fixed += p.rent;
    }
  }

  /** Mondays: the marketing bills. */
  weekly(): void {
    for (const b of this.list()) {
      if (b.marketing === 0) continue;
      const m = MARKETING[b.marketing];
      const d = BIZ_TYPES[b.type];
      const r = this.core.economy.pay(m.cost, 'business_cost', `${PREMISES[b.premise].address}${d.name}推广：${m.name}`, 'media', ['bank', 'cash']);
      if (!r.ok) {
        b.marketing = 0;
        this.core.phone.send('shop', '店里', `账上的钱不够付这周${d.name}的推广费，推广停了。`);
        continue;
      }
      b.totals.fixed += m.cost;
    }
  }

  /** Called at midnight for the day that just ended. */
  endOfDay(day: number): void {
    for (const b of [...this.list()]) {
      if (b.phase === 'renovating' && day + 1 >= b.openDay) {
        b.phase = 'open';
        this.opening(b);
        continue;
      }
      this.trade(b, day);
    }
  }

  private opening(b: BusinessState): void {
    const d = BIZ_TYPES[b.type];
    const second = this.list().length > 1;
    this.core.journal.add('money', `你在${PREMISES[b.premise].address}的${d.name}开业了。`, true);
    for (const id of ['daniel', 'eileen', 'ben']) {
      const r = this.core.social.rel(id);
      if (!r.met || r.affection < 20) continue;
      const lines: Record<string, string> = {
        daniel: second ? '又开了一家？行啊老板，快成连锁了！' : '听说你的店今天开业？行啊老板！改天我带人去捧场。',
        eileen: b.type === 'cafe' ? '你开了家咖啡馆？……那我们以后算是同行了。祝你生意兴隆。' : '恭喜开业！第一个月最难，撑住。',
        ben: second ? '两家店，账要分开记，别让赚钱的那家替亏钱的那家撑太久。' : '开店的头三个月最难熬。记账要勤，进货别贪便宜。有事可以来问我。',
      };
      this.core.phone.send(id, NPC_BY_ID[id].name, lines[id]);
    }
  }

  /** Work the counter for four hours: the place runs better and serves more people that day. */
  workShift(): ActionResult {
    return runSteps(this.workShiftSteps());
  }

  /** The same, in steps (the four hours behind the counter run on the clock). */
  *workShiftSteps(steps = 1): Generator<number, ActionResult, void> {
    const b = this.here();
    if (!b) return { ok: false, error: '要在店里才行' };
    if (b.phase !== 'open') return { ok: false, error: '店还没开业' };
    if (b.shiftDay === this.core.today()) return { ok: false, error: '今天已经在店里帮过忙了' };
    if (this.core.state.player.stats.energy < 25) return { ok: false, error: '你太累了' };
    b.shiftDay = this.core.today();
    yield* this.core.advanceSteps(240, 'working', steps);
    this.core.player.change('energy', -12);
    this.core.player.addSkill('work', 0.4, 60);
    return { ok: true, message: '你在柜台后面忙了四个小时。客人走的时候都说了谢谢。' };
  }

  // ------------------------------------------------------------ worth

  /** Average daily profit over the last weeks, before fixed costs. */
  private grossPerDay(b: BusinessState, days = 28): number {
    if (!b.days.length) return 0;
    const recent = b.days.slice(-days);
    return recent.reduce((a, x) => a + x.net, 0) / recent.length;
  }

  /** Fixed costs per month at the current settings. */
  fixedPerMonth(b: BusinessState): Money {
    const d = BIZ_TYPES[b.type];
    return PREMISES[b.premise].rent + d.wage * b.staff + d.utilities + Math.round((MARKETING[b.marketing].cost * DAYS_PER_MONTH) / 7);
  }

  /** Profit per month at the recent pace, after fixed costs. */
  monthlyProfit(b: BusinessState): Money {
    return Math.round(this.grossPerDay(b) * DAYS_PER_MONTH) - this.fixedPerMonth(b);
  }

  /** What a shop is worth: second-hand equipment, a year of profit as goodwill, and the deposit. */
  valueOf(b: BusinessState): Money {
    const months = Math.max(0, (this.core.today() - b.openDay) / DAYS_PER_MONTH);
    const equipment = mulRatio(b.fitout, Math.round(30 * Math.max(0.3, 1 - 0.02 * months)), 100);
    const goodwill = b.phase === 'open' && b.days.length >= 14 ? Math.max(0, this.monthlyProfit(b) * 12) : 0;
    return equipment + goodwill + b.deposit;
  }

  /** All the shops together (for net worth). */
  value(): Money {
    return this.list().reduce((a, b) => a + this.valueOf(b), 0);
  }

  /** A buyer's offer for the whole business. */
  offer(b: BusinessState): Money {
    return mulRatio(this.valueOf(b), 88, 100);
  }

  sell(premiseId: string): ActionResult {
    const b = this.at(premiseId);
    if (!b) return { ok: false, error: '你没有生意可以出售' };
    if (b.phase !== 'open' || b.days.length < 14) return { ok: false, error: '开业不满两周，还没有人愿意接手' };
    const price = this.offer(b);
    const d = BIZ_TYPES[b.type];
    const p = PREMISES[b.premise];
    this.core.economy.receive('bank', price, 'business_income', `转让${p.address}的${d.name}（含押金）`, 'buyer');
    this.core.journal.add('money', `把${p.address}的${d.name}转让了，收到 ${formatG(price)}。`, true);
    this.remove(b);
    return { ok: true, message: `成交：${formatG(price)}` };
  }

  close(premiseId: string): ActionResult {
    const b = this.at(premiseId);
    if (!b) return { ok: false, error: '你没有生意' };
    const d = BIZ_TYPES[b.type];
    const p = PREMISES[b.premise];
    const salvage = mulRatio(b.fitout, 12, 100);
    this.core.economy.receive('bank', salvage + b.deposit, 'business_income', `${p.address}关店：设备变卖 ${formatG(salvage)}，退还押金 ${formatG(b.deposit)}`, 'premises');
    this.core.journal.add('money', `${p.address}的${d.name}关门了。`, true);
    this.remove(b);
    return { ok: true, message: `店关了。设备卖了 ${formatG(salvage)}，押金退回 ${formatG(b.deposit)}。` };
  }

  private remove(b: BusinessState): void {
    this.core.state.businesses = this.list().filter((x) => x !== b);
    this.core.touch();
  }

  /** Total profit since signing (takings − stock − fixed costs − fit-out). */
  lifetimeProfit(b: BusinessState): Money {
    return b.totals.revenue - b.totals.cogs - b.totals.fixed - b.totals.invested;
  }
}
