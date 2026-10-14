import type { GameCore } from '../core/GameCore';
import { G, formatG, mulRatio, type Money } from '../core/money';
import { MINUTES_PER_DAY, toDate } from '../core/calendar';
import { Rng } from '../core/rng';
import type { PawnTicket, SecondHandLot } from '../core/state';
import { ITEMS, OUTFITS, itemDef, type ItemDef } from '../data/items';
import { categoryFor, type ActionResult } from './InventorySystem';

/** What the shop lends against an appraisal. */
export const PAWN_LTV = 0.6;
/** Fee on the loan for every started ten days, in basis points. */
export const PAWN_FEE_BP = 300;
export const PAWN_PERIOD = 10;
/** Days a pledge is held, and the days after that before the shop keeps it. */
export const PAWN_TERM = 30;
export const PAWN_GRACE = 10;
/** The most the shop lends on one ticket (it is a small Old Town shop). */
export const PAWN_MAX_LOAN = G(80000);
/** It does not take things worth less than this. */
export const PAWN_MIN_APPRAISAL = G(30);
/** A pawn shop is not a car dealer: it buys cars for less. */
export const VEHICLE_BUY_RATE = 0.85;

/** Things the shop buys in to sell second-hand, with the share of the new price it asks. */
export const STREET_POOL: { item: string; factor: number; weight: number }[] = [
  { item: 'watch_basic', factor: 0.55, weight: 3 },
  { item: 'watch_luxury', factor: 0.72, weight: 1 },
  { item: 'jewelry', factor: 0.62, weight: 2 },
  { item: 'cufflinks', factor: 0.6, weight: 2 },
  { item: 'silk_scarf', factor: 0.6, weight: 1 },
  { item: 'guitar_used', factor: 1, weight: 2 },
  { item: 'bicycle', factor: 0.5, weight: 2 },
  { item: 'outfit_suit', factor: 0.45, weight: 2 },
  { item: 'outfit_evening', factor: 0.45, weight: 1 },
  { item: 'outfit_designer', factor: 0.5, weight: 1 },
];
export const STREET_LOTS = 5;

export interface Pledgeable {
  id: string;
  kind: PawnTicket['kind'];
  name: string;
  appraisal: Money;
  loan: Money;
  /** why the shop will not take it (worn, too cheap) */
  refusal: string | null;
}

const round10 = (m: Money) => Math.floor(m / G(10)) * G(10);

/** Monday-based week index of a day. */
export function weekOf(day: number): number {
  return Math.floor((day - toDate(day * MINUTES_PER_DAY).weekday) / 7);
}

/**
 * The Old Town pawn shop. You can leave something against a loan and buy it
 * back within the term (plus a fee for every ten days), renew by paying the
 * fees, or let it go; the shop then puts it on its second-hand shelf. It also
 * buys things outright and sells second-hand goods.
 */
export class PawnSystem {
  constructor(private core: GameCore) {}

  private get s() {
    return this.core.state.oldtown!;
  }

  /** What the shop says something is worth: what it could sell it on for. */
  appraise(id: string): Money {
    const d = itemDef(id);
    if (!d) return 0;
    const resale = d.resale ?? (d.kind === 'valuable' ? 0.4 : d.kind === 'vehicle' ? 0.5 : d.kind === 'gift' ? 0.35 : 0.1);
    return round10(mulRatio(d.price, Math.round(resale * 100), 100));
  }

  loanFor(appraisal: Money): Money {
    return Math.min(PAWN_MAX_LOAN, round10(mulRatio(appraisal, Math.round(PAWN_LTV * 100), 100)));
  }

  private kindOf(d: ItemDef): PawnTicket['kind'] | null {
    if (d.kind === 'vehicle') return 'vehicle';
    if (d.kind === 'outfit') return d.price >= G(500) ? 'outfit' : null;
    if (d.kind === 'valuable') return 'item';
    if (d.kind === 'gift' && d.price >= G(100)) return 'item';
    return null;
  }

  /** Everything the player owns that the shop would look at. */
  pledgeables(): Pledgeable[] {
    const out: Pledgeable[] = [];
    const st = this.core.state;
    const add = (d: ItemDef, refusal: string | null = null) => {
      const kind = this.kindOf(d);
      if (!kind) return;
      const appraisal = this.appraise(d.id);
      out.push({ id: d.id, kind, name: d.name, appraisal, loan: this.loanFor(appraisal), refusal: refusal ?? (appraisal < PAWN_MIN_APPRAISAL ? '不值什么钱，本店不收' : null) });
    };
    const v = this.core.inventory.vehicle();
    if (v) add(v);
    for (const [id, n] of Object.entries(st.inventory.items)) if (n > 0 && ITEMS[id]) add(ITEMS[id]);
    for (const id of st.inventory.outfits) {
      const d = OUTFITS[id];
      if (!d) continue;
      add(d, id === st.player.outfit ? '正穿在身上（先回家换下来）' : null);
    }
    return out.sort((a, b) => b.appraisal - a.appraisal);
  }

  /** Fee owed on a ticket if it were settled on `day`: every started ten days, at least one. */
  fees(t: PawnTicket, day = this.core.today()): Money {
    const periods = Math.max(1, Math.ceil((day - t.start) / PAWN_PERIOD));
    return periods * this.periodFee(t.loan);
  }

  /** The fee for one ten-day period, in whole G. */
  periodFee(loan: Money): Money {
    return Math.max(G(1), Math.round((loan * PAWN_FEE_BP) / 10000 / 100) * 100);
  }

  redeemCost(t: PawnTicket, day = this.core.today()): Money {
    return t.loan + this.fees(t, day);
  }

  /** Last day the pledge can still be redeemed or renewed. */
  lastDay(t: PawnTicket): number {
    return t.due + PAWN_GRACE;
  }

  openTickets(): PawnTicket[] {
    return this.s.tickets.filter((t) => t.status === 'open');
  }

  private ticket(id: number): PawnTicket | undefined {
    return this.s.tickets.find((t) => t.id === id);
  }

  pawn(id: string): ActionResult {
    const p = this.pledgeables().find((x) => x.id === id);
    if (!p) return { ok: false, error: '你没有这件东西，或者本店不收' };
    if (p.refusal) return { ok: false, error: p.refusal };
    const st = this.core.state;
    if (p.kind === 'vehicle') st.player.vehicle = null;
    else if (p.kind === 'outfit') {
      if (st.inventory.outfits.length <= 1) return { ok: false, error: '这是你唯一的一套衣服' };
      st.inventory.outfits = st.inventory.outfits.filter((o) => o !== id);
    } else if (!this.core.inventory.remove(id)) return { ok: false, error: '你没有这件东西' };
    const day = this.core.today();
    const t: PawnTicket = { id: ++this.s.seq, item: id, kind: p.kind, appraisal: p.appraisal, loan: p.loan, start: day, due: day + PAWN_TERM, status: 'open', feesPaid: 0 };
    this.s.tickets.push(t);
    this.core.economy.receive('cash', p.loan, 'loan_disbursement', `福来当铺：当${p.name}（当票 ${t.id} 号）`, 'pawn');
    this.core.social.witness({ kind: 'pawned', facets: { wealthLoss: 0.35, crisis: 0.35 }, importance: 16, data: { item: p.name } });
    this.core.journal.add('money', `把${p.name}当了 ${formatG(p.loan)}，${PAWN_TERM} 天内赎回。`, p.loan >= G(5000));
    this.core.touch();
    return { ok: true, message: `当票 ${t.id} 号：${p.name}，当得 ${formatG(p.loan)} 现金。${PAWN_TERM} 天内凭票赎回，每满 ${PAWN_PERIOD} 天收 ${PAWN_FEE_BP / 100}% 综合费。` };
  }

  private payFrom(method: 'cash' | 'card', amount: Money, cat: 'loan_repayment' | 'interest_paid', memo: string): string | null {
    if (amount <= 0) return null;
    const r = this.core.economy.spend(method === 'cash' ? 'cash' : 'bank', amount, cat, memo, 'pawn');
    return r.ok ? null : r.error;
  }

  redeem(ticketId: number, method: 'cash' | 'card'): ActionResult {
    const t = this.ticket(ticketId);
    if (!t || t.status !== 'open') return { ok: false, error: '没有这张当票' };
    const d = itemDef(t.item)!;
    if (t.kind === 'vehicle' && this.core.state.player.vehicle) return { ok: false, error: '你现在已经有一辆车了，先把它处理掉再来赎' };
    const fee = this.fees(t);
    const total = t.loan + fee;
    const bal = this.core.economy.balance(method === 'cash' ? 'cash' : 'bank');
    if (bal < total) return { ok: false, error: `需要 ${formatG(total)}（本金 ${formatG(t.loan)} + 综合费 ${formatG(fee)}）` };
    const err = this.payFrom(method, t.loan, 'loan_repayment', `福来当铺：赎回${d.name}（本金）`) ?? this.payFrom(method, fee, 'interest_paid', `福来当铺：当票 ${t.id} 号综合费`);
    if (err) return { ok: false, error: err };
    t.status = 'redeemed';
    t.feesPaid += fee;
    if (t.kind === 'vehicle') this.core.state.player.vehicle = t.item;
    else if (t.kind === 'outfit') {
      if (!this.core.state.inventory.outfits.includes(t.item)) this.core.state.inventory.outfits.push(t.item);
    } else this.core.inventory.add(t.item);
    this.core.journal.add('money', `赎回了${d.name}，付了 ${formatG(total)}。`);
    this.core.touch();
    return { ok: true, message: `赎回了${d.name}（${formatG(t.loan)} + 综合费 ${formatG(fee)}）` };
  }

  /** Pay the fees so far and start a new term. */
  renew(ticketId: number, method: 'cash' | 'card'): ActionResult {
    const t = this.ticket(ticketId);
    if (!t || t.status !== 'open') return { ok: false, error: '没有这张当票' };
    const day = this.core.today();
    if (day === t.start) return { ok: false, error: '今天刚当的，不用续' };
    const fee = this.fees(t);
    const err = this.payFrom(method, fee, 'interest_paid', `福来当铺：当票 ${t.id} 号续当`);
    if (err) return { ok: false, error: err };
    t.feesPaid += fee;
    t.start = day;
    t.due = day + PAWN_TERM;
    t.reminded = undefined;
    this.core.touch();
    return { ok: true, message: `付了 ${formatG(fee)} 综合费，当期延到 ${PAWN_TERM} 天后。` };
  }

  /** What the shop pays to buy something outright. */
  buyPrice(id: string): Money {
    const d = itemDef(id);
    if (!d) return 0;
    const a = this.appraise(id);
    return d.kind === 'vehicle' ? round10(mulRatio(a, Math.round(VEHICLE_BUY_RATE * 100), 100)) : a;
  }

  sell(id: string): ActionResult {
    const p = this.pledgeables().find((x) => x.id === id);
    if (!p) return { ok: false, error: '你没有这件东西，或者本店不收' };
    if (p.refusal) return { ok: false, error: p.refusal };
    const st = this.core.state;
    const price = this.buyPrice(id);
    if (p.kind === 'vehicle') st.player.vehicle = null;
    else if (p.kind === 'outfit') {
      if (st.inventory.outfits.length <= 1) return { ok: false, error: '这是你唯一的一套衣服' };
      st.inventory.outfits = st.inventory.outfits.filter((o) => o !== id);
    } else if (!this.core.inventory.remove(id)) return { ok: false, error: '你没有这件东西' };
    this.core.economy.receive('cash', price, 'item_sale', `福来当铺：卖断${p.name}`, 'pawn');
    this.addPlayerLot(id, 'sold');
    this.core.journal.add('money', `把${p.name}卖给了当铺，得到 ${formatG(price)}。`);
    this.core.touch();
    return { ok: true, message: `卖断${p.name}，得到 ${formatG(price)} 现金` };
  }

  /** What the shop asks for something it got from the player. */
  private playerLotPrice(id: string): Money {
    const d = itemDef(id)!;
    return round10(Math.min(mulRatio(d.price, 85, 100), mulRatio(this.appraise(id), 160, 100)));
  }

  private addPlayerLot(id: string, _why: 'sold' | 'forfeited'): void {
    this.s.stock.push({ id: ++this.s.seq, item: id, price: this.playerLotPrice(id), from: 'player', week: weekOf(this.core.today()) });
  }

  /** The shelf this week: what the shop bought in from the street, and anything the player let go. */
  stock(): SecondHandLot[] {
    const week = weekOf(this.core.today());
    if (this.s.stockWeek !== week) {
      this.s.stock = this.s.stock.filter((l) => l.from === 'player');
      const rng = new Rng(`pawn:${this.core.state.meta.seed}:${week}`);
      const pool = STREET_POOL.slice();
      for (let i = 0; i < STREET_LOTS && pool.length; i++) {
        const total = pool.reduce((a, p) => a + p.weight, 0);
        let r = rng.float() * total;
        let k = 0;
        while (k < pool.length - 1 && r >= pool[k].weight) r -= pool[k++].weight;
        const pick = pool.splice(k, 1)[0];
        const d = itemDef(pick.item)!;
        this.s.stock.push({ id: ++this.s.seq, item: pick.item, price: round10(mulRatio(d.price, Math.round(pick.factor * 100), 100)), from: 'street', week });
      }
      this.s.stockWeek = week;
    }
    return this.s.stock;
  }

  buy(lotId: number, method: 'cash' | 'card'): ActionResult {
    const lot = this.stock().find((l) => l.id === lotId);
    if (!lot) return { ok: false, error: '这件已经卖掉了' };
    const d = itemDef(lot.item)!;
    if (d.kind === 'outfit' && this.core.inventory.ownsOutfit(d.id)) return { ok: false, error: '你已经有这套衣服了' };
    if (d.kind === 'vehicle' && this.core.state.player.vehicle) return { ok: false, error: '你已经有车了' };
    const r = this.core.economy.spend(method === 'cash' ? 'cash' : 'bank', lot.price, categoryFor(d), `福来当铺二手：${d.name}`, 'pawn');
    if (!r.ok) return { ok: false, error: r.error };
    this.s.stock = this.s.stock.filter((l) => l.id !== lotId);
    this.core.inventory.give(d, 1);
    this.core.touch();
    return { ok: true, message: `买下了二手的${d.name}（${formatG(lot.price)}）` };
  }

  /** What the open tickets are worth to the player: the pledges minus what it costs to get them back. */
  equity(): Money {
    let v = 0;
    for (const t of this.openTickets()) v += Math.max(0, t.appraisal - this.redeemCost(t));
    return v;
  }

  /** Each morning: reminders before a term runs out, and pledges past the grace period are kept. */
  daily(day: number): void {
    for (const t of this.openTickets()) {
      const d = itemDef(t.item);
      const name = d?.name ?? t.item;
      if (day > this.lastDay(t)) {
        t.status = 'forfeited';
        this.addPlayerLot(t.item, 'forfeited');
        this.core.phone.send('pawn', '福来当铺', `当票 ${t.id} 号（${name}）已过赎回期，按约定成为绝当品。`);
        this.core.journal.add('money', `${name}过了赎回期，成了当铺的绝当品。`, t.appraisal >= G(2000));
      } else if (t.reminded !== day && (day === t.due - 3 || day === this.lastDay(t) - 2)) {
        t.reminded = day;
        const left = this.lastDay(t) - day;
        this.core.phone.send('pawn', '福来当铺', `提醒：当票 ${t.id} 号（${name}）${day < t.due ? `${t.due - day} 天后到期` : `已到期`}，最晚 ${left} 天内赎回或续当，赎回需 ${formatG(this.redeemCost(t, day))}。`);
      }
    }
  }
}