import type { GameCore } from '../core/GameCore';
import { G, formatG, percentBp, type Money } from '../core/money';
import { MINUTES_PER_DAY, toDate } from '../core/calendar';
import { Rng } from '../core/rng';
import type { AuctionState, LiveBidder, LiveLot, Lot, OwnedPiece, Piece } from '../core/state';
import {
  ARTISTS,
  BREAKOUT,
  BUYER_PREMIUM_BP,
  CONSIGN_CUTOFF,
  GENRE_NAMES,
  HOUSE_LOTS,
  LOT_MINUTES,
  MARKET,
  MAX_PLAYER_LOTS,
  OBJECTS,
  PADDLE_MIN,
  PLACES,
  PREVIEW,
  REGULARS,
  SALE_DAY,
  SALE_START,
  SELLER_COMMISSION_BP,
  TITLES,
  VALUE_RANGE,
  increment,
  onSteps,
  type Genre,
  type PieceKind,
  type Tier,
} from '../data/auction';
import { NPC_BY_ID } from '../data/npcs';
import type { ActionResult } from './InventorySystem';
import { weekOf } from './PawnSystem';

export function emptyAuction(): AuctionState {
  return { week: -1, lots: [], seq: 0, paddle: null, live: null, collection: [], queued: [], results: [], valuedWeek: -1, bought: 0, sold: 0 };
}

export type AuctionEvent =
  | { type: 'idle' }
  | { type: 'open'; lot: Lot; ask: Money }
  | { type: 'bid'; who: string; name: string; amount: Money }
  | { type: 'call'; calls: number; amount: Money }
  | { type: 'sold'; lot: Lot; buyerName: string; hammer: Money; player: boolean }
  | { type: 'passed'; lot: Lot };

export const HOTEL = 'hotel';
/** The auctioneer bidding for the consignor below the reserve. */
export const HOUSE_BID = 'house';

export function marketKey(p: Pick<Piece, 'kind' | 'tier'>): string {
  return p.kind === 'painting' ? `painting:${p.tier}` : p.kind;
}

/** What the buyer pays on top of the hammer price. */
export function withPremium(hammer: Money): Money {
  return hammer + percentBp(hammer, BUYER_PREMIUM_BP);
}

/** What the seller receives after the house's commission. */
export function afterCommission(hammer: Money): Money {
  return hammer - percentBp(hammer, SELLER_COMMISSION_BP);
}

function round100(g: number): Money {
  return G(Math.max(100, Math.round(g / 100) * 100));
}

/**
 * The Greyhaven Auction House's Sunday sale in the Grand Hotel ballroom: a
 * catalogue each week (five lots of the house's, plus anything the player
 * consigns), a live English auction against the regulars in the room and
 * anonymous bidders with their own private limits, and the player's
 * collection, revalued every Monday.
 */
export class AuctionSystem {
  constructor(private core: GameCore) {}

  private get s(): AuctionState {
    return this.core.state.auction!;
  }

  // ------------------------------------------------------------ calendar

  currentWeek(): number {
    return weekOf(this.core.today());
  }

  /** Absolute minute of a week's day (0 = Monday) and minute of day. */
  private at(week: number, day: number, minute: number): number {
    // weekOf() counts weeks from the Monday on or before day 0
    const d0 = this.core.today();
    const monday = d0 - toDate(d0 * MINUTES_PER_DAY).weekday + (week - this.currentWeek()) * 7;
    return (monday + day) * MINUTES_PER_DAY + minute;
  }

  saleStart(week = this.s.week): number {
    return this.at(week, SALE_DAY, SALE_START);
  }

  lotStart(i: number, week = this.s.week): number {
    return this.saleStart(week) + i * LOT_MINUTES;
  }

  saleEnd(week = this.s.week): number {
    return this.lotStart(this.s.lots.length, week);
  }

  isPreview(): boolean {
    const d = toDate(this.core.now());
    return PREVIEW.some((p) => p.day === d.weekday && d.minuteOfDay >= p.from && d.minuteOfDay < p.to);
  }

  /** before the preview, preview, the sale itself, or over for this week */
  phase(): 'before' | 'preview' | 'sale' | 'over' {
    this.catalogue();
    const now = this.core.now();
    if (now >= this.saleStart() && this.s.lots.some((l) => l.status === 'open')) return now < this.saleEnd() ? 'sale' : 'over';
    if (now >= this.saleStart()) return 'over';
    return this.isPreview() ? 'preview' : 'before';
  }

  // ------------------------------------------------------------ the catalogue

  /** This week's lots (the catalogue is printed on Monday). */
  catalogue(): Lot[] {
    const week = this.currentWeek();
    if (this.s.week !== week) {
      if (this.s.week >= 0) this.closeWeek();
      this.generate(week);
    }
    return this.s.lots;
  }

  private generate(week: number): void {
    const s = this.s;
    const rng = new Rng(`auction:${this.core.state.meta.seed}:${week}`);
    s.week = week;
    s.lots = [];
    s.paddle = null;
    s.live = null;
    const tiers: Tier[] = ['emerging', 'established', rng.float() < 0.2 ? 'master' : rng.float() < 0.5 ? 'established' : 'emerging'];
    const genres = Object.keys(GENRE_NAMES) as Genre[];
    for (const tier of tiers) this.addLot(this.makePiece(rng, 'painting', tier, genres[rng.int(0, genres.length - 1)]), 'house', rng);
    const kinds = Object.keys(OBJECTS) as Exclude<PieceKind, 'painting'>[];
    for (let i = 0; i < HOUSE_LOTS - tiers.length; i++) {
      const k = kinds.splice(rng.int(0, kinds.length - 1), 1)[0];
      this.addLot(this.makePiece(rng, k, 'established'), 'house', rng);
    }
    // the player's queued consignments go in at the end
    const taken = s.queued.splice(0, MAX_PLAYER_LOTS);
    for (const id of taken) {
      const p = s.collection.find((x) => x.id === id);
      if (p) {
        p.consigned = week;
        this.addLot(p, 'player', rng);
      }
    }
  }

  private addLot(piece: Piece, consignor: 'house' | 'player', rng: Rng): Lot {
    const v = piece.value;
    const low = onSteps(Math.round(v * (0.72 + rng.float() * 0.18)));
    const high = Math.max(low + increment(low), onSteps(Math.round(v * (1.1 + rng.float() * 0.25))));
    const lot: Lot = { no: this.s.lots.length + 1, piece: { ...piece }, low, high, reserve: onSteps(Math.round(low * 0.8)), consignor, status: 'open' };
    this.s.lots.push(lot);
    return lot;
  }

  private makePiece(rng: Rng, kind: PieceKind, tier: Tier, genre?: Genre): Piece {
    const key = kind === 'painting' ? `painting:${tier}` : kind;
    const [lo, hi] = VALUE_RANGE[key];
    const value = round100(Math.exp(Math.log(lo) + rng.float() * (Math.log(hi) - Math.log(lo))));
    const id = ++this.s.seq;
    const seed = rng.nextU32();
    if (kind === 'painting') {
      const a = ARTISTS[tier][rng.int(0, ARTISTS[tier].length - 1)];
      const t = TITLES[genre!][rng.int(0, TITLES[genre!].length - 1)].replace('{place}', PLACES[rng.int(0, PLACES.length - 1)]).replace('{n}', String(rng.int(3, 48)));
      return { id, kind, genre, tier, title: `《${t}》`, maker: a.name, year: rng.int(a.years[0], a.years[1]), seed, value };
    }
    const o = OBJECTS[kind][rng.int(0, OBJECTS[kind].length - 1)];
    return { id, kind, tier, title: o.title, maker: o.maker, year: rng.int(o.years[0], o.years[1]), seed, value };
  }

  // ------------------------------------------------------------ paddle

  register(): ActionResult {
    this.catalogue();
    if (this.s.paddle) return { ok: false, error: `你已经登记过了，号牌 ${this.s.paddle} 号` };
    if (this.core.economy.balance('bank') < PADDLE_MIN) return { ok: false, error: `登记竞投需要银行存款至少 ${formatG(PADDLE_MIN)}（拍卖行会核实你的付款能力）` };
    this.s.paddle = 100 + ((this.core.state.meta.seed + this.s.week * 37) % 300);
    this.core.touch();
    return { ok: true, message: `登记完成，你的号牌是 ${this.s.paddle} 号。成交后从银行账户付款，另加 ${BUYER_PREMIUM_BP / 100}% 买家佣金。` };
  }

  // ------------------------------------------------------------ the live sale

  /** The lot whose slot it is now, opened if needed (null outside the sale). */
  private slotIndex(): number {
    const now = this.core.now();
    const start = this.saleStart();
    if (now < start) return -1;
    return Math.floor((now - start) / LOT_MINUTES);
  }

  /** Settle in the background every lot whose time has passed. */
  sync(): void {
    this.catalogue();
    const now = this.core.now();
    this.s.lots.forEach((lot, i) => {
      if (lot.status !== 'open' || now < this.lotStart(i + 1)) return;
      const live = this.s.live?.lot === i ? this.s.live : null;
      this.resolve(lot, live ?? this.openState(i), false);
    });
  }

  /** The lot on the block (for the player in the room). */
  current(): { lot: Lot; live: LiveLot } | null {
    this.sync();
    const i = this.slotIndex();
    const lot = this.s.lots[i];
    if (!lot || lot.status !== 'open') return null;
    if (!this.s.live || this.s.live.lot !== i) this.s.live = this.openState(i);
    return { lot, live: this.s.live };
  }

  /** Who bids on a lot, and how far each will go. */
  private openState(i: number): LiveLot {
    const lot = this.s.lots[i];
    const rng = this.core.rng;
    const v = lot.piece.value;
    const bidders: LiveBidder[] = [];
    const n = 2 + rng.int(0, 2);
    const used = new Set<number>();
    for (let k = 0; k < n; k++) {
      let paddle = rng.int(10, 399);
      while (used.has(paddle) || paddle === this.s.paddle) paddle = rng.int(10, 399);
      used.add(paddle);
      bidders.push({ id: `p${paddle}`, name: `${paddle} 号`, max: Math.round(v * 0.97 * Math.exp(rng.normal(0, 0.2))) });
    }
    if (rng.chance(0.4)) bidders.push({ id: 'phone', name: '电话委托', max: Math.round(v * Math.exp(rng.normal(0.05, 0.15))) });
    // the regulars in the room
    const t = this.lotStart(i);
    for (const r of REGULARS) {
      const def = NPC_BY_ID[r.npc];
      const rt = this.core.state.npcs[r.npc];
      if (!def || !rt) continue;
      const here = rt.location === HOTEL || this.core.npcs.scheduled(def, t).loc === HOTEL;
      if (!here) continue;
      const key = marketKey(lot.piece);
      const loves = r.loves.includes(key) || (lot.piece.genre ? r.loves.includes(`painting:${lot.piece.genre}`) : false);
      if (!loves && rng.float() > 0.3) continue;
      const cap = Math.round(rt.money * 0.3);
      const max = Math.min(cap, Math.round(v * (loves ? r.zeal : 0.85) * Math.exp(rng.normal(0, 0.12))));
      if (max > 0) bidders.push({ id: r.npc, name: def.name, npc: r.npc, max });
    }
    const ask = onSteps(Math.max(Math.round(lot.reserve * 0.6), Math.round(lot.low * 0.5)));
    // below the reserve the auctioneer takes bids on the consignor's behalf; that bidder can never win
    bidders.push({ id: HOUSE_BID, name: '拍卖师代叫', max: lot.reserve - increment(lot.reserve) });
    return { lot: i, current: 0, ask, leader: null, bidders, calls: 0, log: [] };
  }

  private place(live: LiveLot, who: string, name: string): void {
    live.current = live.ask;
    live.leader = who;
    live.ask = live.current + increment(live.current);
    live.calls = 0;
    live.log.push({ who, name, amount: live.current });
    if (live.log.length > 40) live.log.shift();
  }

  /** One beat of the auctioneer: someone bids, or the standing bid is called; three calls and the hammer falls. */
  tick(): AuctionEvent {
    const fresh = !this.s.live;
    const c = this.current();
    if (!c) return { type: 'idle' };
    const { lot, live } = c;
    if (fresh) return { type: 'open', lot, ask: live.ask };
    const rng = this.core.rng;
    const eager = live.bidders.filter((b) => b.id !== live.leader && b.max >= live.ask);
    const keen = eager.filter((b) => rng.chance(Math.min(0.95, 0.3 + 0.25 * live.calls + 0.45 * Math.min(1, (b.max - live.ask) / Math.max(1, b.max)))));
    if (keen.length) {
      const b = keen[rng.int(0, keen.length - 1)];
      this.place(live, b.id, b.name);
      return { type: 'bid', who: b.id, name: b.name, amount: live.current };
    }
    live.calls++;
    if (live.calls < 3) return { type: 'call', calls: live.calls, amount: live.leader ? live.current : live.ask };
    return this.resolve(lot, live, true);
  }

  /** What the player can bid now, or why not. */
  bidCheck(): { ok: boolean; amount: Money; total: Money; reason?: string } {
    // read only: the lot on the block is opened by the auctioneer (tick), never by asking
    const live = this.s.live;
    const lot = live ? this.s.lots[live.lot] : null;
    if (!live || !lot || lot.status !== 'open') return { ok: false, amount: 0, total: 0, reason: '现在没有拍品在拍' };
    const amount = live.ask;
    const total = withPremium(amount);
    if (lot.consignor === 'player') return { ok: false, amount, total, reason: '这是你委托的拍品，不能自己竞投' };
    if (!this.s.paddle) return { ok: false, amount, total, reason: '先在拍卖台登记领号牌' };
    if (live.leader === 'player') return { ok: false, amount, total, reason: '你是目前的最高出价' };
    if (this.core.economy.balance('bank') < total) return { ok: false, amount, total, reason: `银行存款不够付 ${formatG(total)}（含佣金）` };
    return { ok: true, amount, total };
  }

  bid(): ActionResult {
    const chk = this.bidCheck();
    if (!chk.ok) return { ok: false, error: chk.reason ?? '' };
    const live = this.s.live!;
    this.place(live, 'player', `${this.s.paddle} 号（你）`);
    this.core.touch();
    return { ok: true, message: `你举起了号牌：${formatG(chk.amount)}` };
  }

  /**
   * Bring a lot to the hammer. In the room (live) the standing bid is final;
   * in the background the remaining bidders keep going against it, the
   * player's standing bid holding only if nobody tops it.
   */
  private resolve(lot: Lot, live: LiveLot, inRoom: boolean): AuctionEvent {
    let winner = live.leader;
    let price = live.current;
    if (!inRoom) {
      // the bidding goes on until one is left: the price ends a step above the
      // runner-up's limit (never above the winner's); the absent player stands at their last bid
      const caps = live.bidders.map((b) => ({ id: b.id, cap: b.max }));
      if (live.leader === 'player') caps.push({ id: 'player', cap: live.current });
      const able = caps.filter((c) => (c.id === live.leader ? c.cap >= live.current : c.cap >= live.ask)).sort((a, b) => b.cap - a.cap);
      const [top, second] = able;
      if (top) {
        winner = top.id;
        if (!second) price = top.id === live.leader ? live.current : live.ask;
        else price = Math.min(top.cap, Math.max(live.ask, onSteps(second.cap) + increment(onSteps(second.cap))));
      }
    }
    const sold = !!winner && winner !== HOUSE_BID && price >= lot.reserve && price > 0;
    this.s.live = null;
    if (sold && winner) {
      const name = this.settle(lot, winner, price, live, inRoom);
      if (lot.status === 'sold') {
        this.afterLot(inRoom, live.lot);
        return { type: 'sold', lot, buyerName: name, hammer: price, player: winner === 'player' };
      }
    }
    lot.status = 'passed';
    if (lot.consignor === 'player') this.returnUnsold(lot, inRoom);
    this.record(lot);
    this.afterLot(inRoom, live.lot);
    return { type: 'passed', lot };
  }

  /** In the room, the clock moves on to the next lot's slot. */
  private afterLot(inRoom: boolean, i: number): void {
    if (!inRoom) return;
    const next = this.lotStart(i + 1);
    const now = this.core.now();
    if (next > now) this.core.advance(next - now, 'idle');
  }

  /** Money changes hands. Returns the buyer's display name. */
  private settle(lot: Lot, winner: string, hammer: Money, live: LiveLot, inRoom: boolean): string {
    const core = this.core;
    const total = withPremium(hammer);
    let name = live.bidders.find((b) => b.id === winner)?.name ?? '场内买家';
    if (winner === 'player') {
      const r = core.economy.spend('bank', total, 'collectibles', `灰港拍卖行：第 ${lot.no} 号拍品 ${lot.piece.title}（落槌 ${formatG(hammer)} + 佣金）`, 'auction');
      if (!r.ok) return name; // cannot happen: bids are checked against the balance, and time stands still in the room
      const owned: OwnedPiece = { ...lot.piece, paid: total, boughtDay: core.today() };
      this.s.collection.push(owned);
      this.s.bought++;
      name = `${this.s.paddle} 号（你）`;
      core.social.witness({ kind: 'flashy_purchase', facets: { wealthDisplay: Math.min(1.2, 0.3 + total / G(100000)) }, importance: Math.min(40, 12 + Math.round(total / G(5000))), data: { item: lot.piece.title, amount: total } });
      // the regular who wanted it most remembers who took it
      const rival = [...live.log].reverse().find((l) => l.who !== 'player' && NPC_BY_ID[l.who]);
      if (rival) core.social.applyDirect(rival.who, { kind: 'outbid_me', facets: { wealthDisplay: 0.4, rudeness: 0.1 }, importance: 18, data: { item: lot.piece.title, amount: hammer } }, { source: 'witnessed', silent: true });
      core.journal.add('money', `在灰港拍卖行拍下了${lot.piece.title}，落槌 ${formatG(hammer)}，含佣金共付 ${formatG(total)}。`, total >= G(20000));
    } else if (NPC_BY_ID[winner]) {
      const rt = core.state.npcs[winner];
      rt.money = Math.max(0, rt.money - total);
    }
    lot.status = 'sold';
    lot.hammer = hammer;
    lot.buyer = winner;
    lot.buyerName = name;
    if (lot.consignor === 'player') {
      const net = afterCommission(hammer);
      this.s.collection = this.s.collection.filter((p) => p.id !== lot.piece.id);
      core.economy.receive('bank', net, 'item_sale', `灰港拍卖行：${lot.piece.title}成交 ${formatG(hammer)}，扣除 ${SELLER_COMMISSION_BP / 100}% 佣金`, 'auction');
      this.s.sold++;
      core.journal.add('money', `你委托的${lot.piece.title}以 ${formatG(hammer)} 成交，到账 ${formatG(net)}。`, net >= G(20000));
      if (!inRoom) core.phone.send('auction', '灰港拍卖行', `您委托的${lot.piece.title}已以 ${formatG(hammer)} 成交，扣除佣金后 ${formatG(net)} 已转入您的银行账户。`);
    }
    this.record(lot);
    return name;
  }

  private returnUnsold(lot: Lot, inRoom: boolean): void {
    const p = this.s.collection.find((x) => x.id === lot.piece.id);
    if (p) p.consigned = undefined;
    if (!inRoom) this.core.phone.send('auction', '灰港拍卖行', `很遗憾，您委托的${lot.piece.title}未达保留价，已流拍。拍品已退回您的收藏，可以下周重新委托。`);
  }

  private record(lot: Lot): void {
    let r = this.s.results.find((x) => x.week === this.s.week);
    if (!r) {
      r = { week: this.s.week, lots: [] };
      this.s.results.push(r);
      if (this.s.results.length > 8) this.s.results.shift();
    }
    r.lots = r.lots.filter((l) => l.no !== lot.no);
    r.lots.push({ no: lot.no, title: lot.piece.title, status: lot.status === 'sold' ? 'sold' : 'passed', hammer: lot.hammer, buyerName: lot.buyerName, consignor: lot.consignor });
    r.lots.sort((a, b) => a.no - b.no);
  }

  /** Whatever was not sold in the room is sold before the next catalogue. */
  private closeWeek(): void {
    const now = this.core.now();
    this.s.lots.forEach((lot, i) => {
      if (lot.status !== 'open') return;
      const live = this.s.live?.lot === i ? this.s.live : null;
      // a sale that never happened (the clock jumped past it) still takes place
      if (now >= this.lotStart(i)) this.resolve(lot, live ?? this.openState(i), false);
    });
    // consignments of a sale that did not take place go back in the queue
    for (const lot of this.s.lots) {
      if (lot.status === 'open' && lot.consignor === 'player') {
        const p = this.s.collection.find((x) => x.id === lot.piece.id);
        if (p) {
          p.consigned = undefined;
          this.s.queued.push(p.id);
        }
      }
    }
    this.s.live = null;
  }

  // ------------------------------------------------------------ the collection

  /** What the collection is worth (the house's appraisals). */
  value(): Money {
    return this.s.collection.reduce((a, p) => a + p.value, 0);
  }

  private beforeCutoff(): boolean {
    return this.core.now() < this.at(this.s.week, CONSIGN_CUTOFF.day, CONSIGN_CUTOFF.at);
  }

  consign(pieceId: number): ActionResult {
    this.catalogue();
    const p = this.s.collection.find((x) => x.id === pieceId);
    if (!p) return { ok: false, error: '你没有这件藏品' };
    if (p.consigned !== undefined || this.s.queued.includes(pieceId)) return { ok: false, error: '这件已经委托给拍卖行了' };
    const mine = this.s.lots.filter((l) => l.consignor === 'player' && l.status === 'open').length;
    if (this.beforeCutoff() && mine < MAX_PLAYER_LOTS) {
      p.consigned = this.s.week;
      this.addLot(p, 'player', this.core.rng);
      this.core.touch();
      return { ok: true, message: `${p.title}已列入本周日的拍卖图录（估价按 ${formatG(p.value)} 的参考市值）。成交后扣除 ${SELLER_COMMISSION_BP / 100}% 佣金。` };
    }
    p.consigned = this.s.week + 1;
    this.s.queued.push(pieceId);
    this.core.touch();
    return { ok: true, message: `本周的图录已经截稿，${p.title}将列入下周日的拍卖。` };
  }

  /** Take a consignment back before the preview opens. */
  withdraw(pieceId: number): ActionResult {
    this.catalogue();
    const p = this.s.collection.find((x) => x.id === pieceId);
    if (!p || p.consigned === undefined) return { ok: false, error: '这件没有在委托' };
    if (this.s.queued.includes(pieceId)) {
      this.s.queued = this.s.queued.filter((x) => x !== pieceId);
      p.consigned = undefined;
      return { ok: true, message: `撤回了${p.title}的委托` };
    }
    if (!this.beforeCutoff()) return { ok: false, error: '预展已经开始，不能撤拍了' };
    this.s.lots = this.s.lots.filter((l) => !(l.consignor === 'player' && l.piece.id === pieceId));
    this.s.lots.forEach((l, i) => (l.no = i + 1));
    p.consigned = undefined;
    this.core.touch();
    return { ok: true, message: `撤回了${p.title}的委托` };
  }

  /** Every Monday the house revalues its market, and with it the player's pieces. */
  weekly(): void {
    const week = this.currentWeek();
    if (this.s.valuedWeek === week) return;
    this.s.valuedWeek = week;
    const rng = this.core.rng;
    for (const p of this.s.collection) {
      const m = MARKET[marketKey(p)];
      let f = Math.exp(m.mu + m.sigma * rng.normal());
      if (p.kind === 'painting' && p.tier === 'emerging' && rng.chance(BREAKOUT.chance)) {
        const up = rng.chance(0.5);
        f *= up ? BREAKOUT.up[0] + rng.float() * (BREAKOUT.up[1] - BREAKOUT.up[0]) : BREAKOUT.down;
        this.core.phone.send('auction', '灰港拍卖行', up ? `市场消息：${p.maker}的作品最近受到藏家追捧，您收藏的${p.title}参考市值大幅上调。` : `市场消息：${p.maker}的作品近期乏人问津，您收藏的${p.title}参考市值下调。`);
      }
      p.value = Math.max(G(100), Math.round((p.value * f) / G(10)) * G(10));
    }
  }

  /** On Sunday at five the sale is over: anything left is settled. */
  hourly(hour: number): void {
    if (hour === 17 && toDate(this.core.now()).weekday === SALE_DAY) this.sync();
  }
}