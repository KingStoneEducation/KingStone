import type { GameCore } from '../core/GameCore';
import { G, formatG, mulRatio, type Money } from '../core/money';
import { MINUTES_PER_DAY, toDate } from '../core/calendar';
import type { MemberTier, PlayerStats } from '../core/state';
import { ITEMS } from '../data/items';
import { LOCATIONS } from '../data/locations';
import { casinoArea } from '../world/maps/casinoMap';

export type SkyResult = { ok: true; message: string } | { ok: false; error: string };
export type SkyPay = 'bank' | 'comps';

/** How well you sleep in suite 1201 (homes run from -0.1 to 0.28). */
export const SUITE_COMFORT = 0.3;
/** Check-out time, minutes after midnight. */
export const CHECKOUT = 12 * 60;

export const SUITE_RATES: Record<MemberTier, Money> = {
  visitor: G(1800),
  silver: G(1800),
  gold: G(1200),
  platinum: G(800),
  diamond: 0,
};

export interface SpaTreatment {
  id: string;
  name: string;
  minutes: number;
  price: Money;
  desc: string;
  effects: Partial<Record<keyof PlayerStats, number>>;
  /** mood lift afterwards */
  buff: number;
}

export const SPA_MENU: SpaTreatment[] = [
  { id: 'neck', name: '肩颈按摩', minutes: 45, price: G(220), desc: '久坐和熬夜之后最需要的那种。', effects: { stress: -16, energy: 8 }, buff: 4 },
  { id: 'full', name: '全身精油按摩', minutes: 90, price: G(420), desc: '九十分钟，几乎一定会睡着。', effects: { stress: -30, energy: 16, health: 2 }, buff: 7 },
  { id: 'sauna', name: '桑拿与热石', minutes: 60, price: G(160), desc: '出一身汗，酒也醒得快一些。', effects: { stress: -12, health: 3, drunk: -25 }, buff: 3 },
];

/** What dining credit buys in the boutique (credit, not money: priced above the shops). */
export const COMP_STORE: { id: string; comps: Money }[] = [
  { id: 'praline_box', comps: G(90) },
  { id: 'concert_tickets', comps: G(150) },
  { id: 'champagne_bottle', comps: G(180) },
  { id: 'perfume', comps: G(200) },
  { id: 'silk_scarf', comps: G(280) },
  { id: 'cufflinks', comps: G(1100) },
];

/** Places the car can take you besides home, as listed at the concierge. */
export const LIMO_PLACES = ['fine_dining', 'club', 'luxury', 'restaurant', 'bank', 'finance_office', 'office', 'motors'];

/**
 * The members' floor at the top of the casino: who may go up, the suite,
 * the spa, the car, table bookings and the boutique. Every service has a
 * published price per membership tier; nothing here touches the games.
 */
export class SkyFloorSystem {
  constructor(private core: GameCore) {}

  private get sky() {
    return this.core.state.casino.sky;
  }

  private get cs() {
    return this.core.state.casino;
  }

  private tier(): MemberTier {
    return this.cs.membership.tier;
  }

  /** Saturday 21:00 until 01:00: live jazz upstairs, champagne for everyone, silver members let in. */
  isSkyNight(t = this.core.now()): boolean {
    const d = toDate(t);
    return (d.weekday === 5 && d.minuteOfDay >= 21 * 60) || (d.weekday === 6 && d.minuteOfDay < 60);
  }

  suiteGuest(t = this.core.now()): boolean {
    return t >= this.sky.suiteFrom && t < this.sky.suiteUntil;
  }

  /** Why the lift attendant will not take you up, or null. */
  access(): string | null {
    const core = this.core;
    if (this.cs.bannedUntil > core.now()) return '你已被赌场禁止入内';
    if (core.career.job('dealer')) return '员工不能使用会员电梯';
    if (core.casino.tierAtLeast('gold') || this.suiteGuest() || this.cs.invites.sky >= core.today()) return null;
    if (this.isSkyNight() && core.casino.tierAtLeast('silver')) return null;
    return '天穹层只对金卡及以上会员、套房住客和受邀的客人开放（周六晚上的天穹之夜，银卡会员也可以上楼）';
  }

  /** Standing in the suite right now. */
  inSuite(): boolean {
    const w = this.core.state.world;
    return w.location === 'casino' && w.x >= 0 && casinoArea(w.x, w.y) === 'suite';
  }

  /** Is the player on the members' floor? */
  upstairs(): boolean {
    const w = this.core.state.world;
    if (w.location !== 'casino' || w.x < 0) return false;
    const a = casinoArea(w.x, w.y);
    return a.startsWith('sky') || a === 'spa' || a === 'boutique' || a === 'suite';
  }

  // ------------------------------------------------------------------ suite

  private week(): number {
    return Math.floor(this.core.today() / 7);
  }

  suiteQuote(): { price: Money; note: string } {
    const t = this.tier();
    if (t === 'diamond') return { price: 0, note: '钻石卡会员每晚免费' };
    if (t === 'platinum' && this.sky.suiteCompWeek !== this.week()) return { price: 0, note: '白金卡会员每周一晚免费' };
    if (t === 'platinum') return { price: SUITE_RATES.platinum, note: '白金卡会员价（本周的免费一晚已经用过）' };
    if (t === 'gold') return { price: SUITE_RATES.gold, note: '金卡会员价' };
    return { price: SUITE_RATES[t], note: '门市价' };
  }

  /** The night a booking made now is for: after midnight it is still last night. */
  private nightDay(): number {
    const d = toDate(this.core.now());
    return d.minuteOfDay < 6 * 60 ? this.core.today() - 1 : this.core.today();
  }

  bookSuite(pay: SkyPay = 'bank'): SkyResult {
    const core = this.core;
    if (this.cs.bannedUntil > core.now()) return { ok: false, error: '你已被赌场禁止入内' };
    if (this.suiteGuest()) return { ok: false, error: '你已经订了今晚的套房' };
    const q = this.suiteQuote();
    if (q.price > 0) {
      const err = this.charge(q.price, pay, 'lodging', '天穹层 1201 套房（一晚）');
      if (err) return { ok: false, error: err };
    }
    if (q.price === 0 && this.tier() === 'platinum') this.sky.suiteCompWeek = this.week();
    this.sky.suiteFrom = core.now();
    this.sky.suiteUntil = (this.nightDay() + 1) * MINUTES_PER_DAY + CHECKOUT;
    this.sky.nights++;
    core.journal.add('casino', `在天穹层的 1201 套房住了一晚${q.price ? `（${pay === 'comps' ? '积分' : ''}${formatG(q.price)}）` : '（会员礼遇）'}。`);
    core.touch();
    return { ok: true, message: `房卡已经激活：1201 套房，走廊尽头的那扇门。退房时间是 ${toDate(this.sky.suiteUntil).month + 1} 月 ${toDate(this.sky.suiteUntil).day} 日中午 12 点。` };
  }

  /** Null when the player may sleep here (in the suite with a valid key). */
  sleepRefusal(): string | null {
    if (!this.inSuite()) return '只能在家里睡觉';
    if (!this.suiteGuest()) return '房卡已经过期了，需要先在礼宾台续订';
    return null;
  }

  // ------------------------------------------------------------------ spa

  spaQuote(id: string): { price: Money; note: string } {
    const s = SPA_MENU.find((x) => x.id === id);
    if (!s) return { price: 0, note: '' };
    const t = this.tier();
    if (t === 'diamond') return { price: 0, note: '钻石卡会员免费' };
    if (t === 'platinum' && this.sky.spaFreeDay !== this.core.today()) return { price: 0, note: '白金卡会员每天一次免费' };
    if (t === 'platinum') return { price: mulRatio(s.price, 70, 100), note: '白金卡七折' };
    if (t === 'gold') return { price: mulRatio(s.price, 80, 100), note: '金卡八折' };
    return { price: s.price, note: '门市价' };
  }

  spa(id: string, pay: SkyPay = 'bank'): SkyResult {
    const core = this.core;
    const s = SPA_MENU.find((x) => x.id === id);
    if (!s) return { ok: false, error: '没有这个项目' };
    if (this.access()) return { ok: false, error: '水疗中心只接待能上天穹层的客人' };
    if (id !== 'sauna' && core.state.player.stats.drunk >= 60) return { ok: false, error: '理疗师礼貌地建议你先醒醒酒，或者去桑拿房坐一会儿' };
    const q = this.spaQuote(id);
    if (q.price > 0) {
      const err = this.charge(q.price, pay, 'wellness', `天穹层水疗：${s.name}`);
      if (err) return { ok: false, error: err };
    } else if (this.tier() === 'platinum') this.sky.spaFreeDay = core.today();
    core.advance(s.minutes, 'idle');
    core.player.applyEffects(s.effects);
    core.player.addMoodBuff('spa', s.buff, 360, '做完水疗');
    this.sky.treatments++;
    core.touch();
    return { ok: true, message: `${s.name}（${s.minutes} 分钟）。${q.price ? `花费 ${pay === 'comps' ? '积分 ' : ''}${formatG(q.price)}。` : q.note + '。'}整个人松下来了。` };
  }

  // ------------------------------------------------------------------ the car

  limoQuote(loc: string): { fare: Money; minutes: number } | null {
    const taxi = this.core.services.taxiQuote(loc);
    if (!taxi) return null;
    const free = this.core.casino.tierAtLeast('platinum');
    return { fare: free ? 0 : Math.round((taxi.fare * 1.5) / 100) * 100, minutes: Math.max(3, Math.round(taxi.minutes * 0.8)) };
  }

  /** Pays and spends the time; the caller moves the player to the destination's door. */
  limo(loc: string): SkyResult {
    if (this.access() && !this.upstairs()) return { ok: false, error: '礼宾专车只为天穹层的客人安排' };
    const q = this.limoQuote(loc);
    if (!q) return { ok: false, error: '司机不知道那个地方' };
    if (q.fare > 0) {
      const r = this.core.economy.pay(q.fare, 'transport', '赌场礼宾专车', 'casino', ['bank', 'cash']);
      if (!r.ok) return { ok: false, error: r.error };
    }
    this.core.advance(q.minutes, 'idle');
    this.sky.limoRides++;
    return { ok: true, message: `赌场的车把你送到${LOCATIONS[loc]?.name ?? '目的地'}（${q.minutes} 分钟${q.fare ? `，${formatG(q.fare)}` : '，会员免费'}）` };
  }

  // ------------------------------------------------------------------ bookings

  /** The concierge books Lumière: platinum members pay no booking fee, diamond members get a table even late. */
  bookLumiere(tomorrow: boolean): SkyResult {
    const plat = this.core.casino.tierAtLeast('platinum');
    const r = this.core.services.bookLumiere(tomorrow, { waiveFee: plat, late: this.tier() === 'diamond' });
    return r.ok ? { ok: true, message: r.message } : r;
  }

  // ------------------------------------------------------------------ boutique

  redeem(id: string): SkyResult {
    const item = COMP_STORE.find((x) => x.id === id);
    const def = ITEMS[id];
    if (!item || !def) return { ok: false, error: '没有这件商品' };
    if (this.cs.comps < item.comps) return { ok: false, error: `餐饮积分不够（需要 ${formatG(item.comps)}）` };
    this.cs.comps -= item.comps;
    this.sky.redeemed += item.comps;
    this.core.inventory.add(id);
    return { ok: true, message: `用 ${formatG(item.comps)} 积分换了${def.name}，已放进你的物品栏。` };
  }

  /** At noon, a guest still in the suite after check-out gets a knock on the door. */
  hourly(hour: number): void {
    if (hour !== 12 || !this.inSuite() || this.suiteGuest()) return;
    if (this.core.now() - this.sky.suiteUntil > 60) return;
    this.core.toast('客房服务轻轻敲门：「打扰了，已经到退房时间了。需要续住的话，礼宾台可以帮您办理。」', 'info');
  }

  // ------------------------------------------------------------------ helpers

  private charge(amount: Money, pay: SkyPay, cat: 'lodging' | 'wellness', memo: string): string | null {
    if (pay === 'comps') {
      if (this.cs.comps < amount) return `餐饮积分不够（需要 ${formatG(amount)}）`;
      this.cs.comps -= amount;
      this.sky.redeemed += amount;
      return null;
    }
    const r = this.core.economy.spend('bank', amount, cat, memo, 'casino');
    return r.ok ? null : r.error;
  }
}
