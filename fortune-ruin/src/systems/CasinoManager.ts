import type { GameCore } from '../core/GameCore';
import { G, formatG, type Money } from '../core/money';
import { Rng } from '../core/rng';
import type { GameKind, MemberTier, Patron, TableEngineState } from '../core/state';
import { MINUTES_PER_DAY, toDate } from '../core/calendar';
import * as BJ from '../casino/BlackjackEngine';
import * as BAC from '../casino/BaccaratEngine';
import * as RL from '../casino/RouletteEngine';
import * as PK from '../casino/PokerEngine';
import { decidePoker, POKER_STYLES, type PokerStyleId } from '../casino/pokerAI';
import { TOURNEY_HOST, TOURNEY_TABLE } from '../casino/tournament';
import { hiLoTrueCount } from '../casino/cards';
import { npcDecision, npcTakesInsurance } from '../casino/blackjackStrategy';
import { POKER_TABLES, TABLES, TABLE_BY_ID, TIERS, TIER_INDEX, ratedEdge, tierInfo, type TableArea, type TableConfig, type TierInfo } from '../casino/tables';
import { generatePatron, patronBaccaratSide, patronBetSize, patronReaction, patronRouletteBets, patronWantsToLeave, uniqueName } from '../casino/patrons';
import { NPC_BY_ID } from '../data/npcs';

export const PLAYER = 'player';

export interface RoundResult {
  stake: Money;
  ret: Money;
  net: Money;
}

export type CasinoResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): CasinoResult<T> => ({ ok: true, value });
const fail = (error: string): CasinoResult<never> => ({ ok: false, error });

/** Default favourite table for named NPC gamblers. */
const NPC_TABLES: Record<string, string> = { marco: 'bj2', kiki: 'rl1', lillian: 'bacv', alexander: 'bacv' };

/**
 * Named NPCs who come to play poker: their table, how they play, and when they get up (a share
 * of what they brought: below stopLoss they are done, at winGoal times it they cash out).
 * They play on the nights their schedule takes them to the poker room's rail.
 */
export const NPC_POKER: Record<string, { table: string; style: PokerStyleId; stopLoss: number; winGoal: number }> = {
  sophia: { table: 'pk2', style: 'tight', stopLoss: 0.5, winGoal: 1.8 },
  alexander: { table: 'pk2', style: 'aggressive', stopLoss: 0.2, winGoal: 3 },
  tommy: { table: 'pk1', style: 'loose', stopLoss: 0.1, winGoal: 2.5 },
  daniel: { table: 'pk1', style: 'tilter', stopLoss: 0.05, winGoal: 2 },
};
/** Where poker players wait to be seated. */
export const POKER_RAIL = 'poker_rail';

export class CasinoManager {
  constructor(private core: GameCore) {}

  /** All casino randomness outside the shoes uses the serialized world stream. */
  private get crowdRng(): Rng {
    return this.core.rng;
  }

  get cs() {
    return this.core.state.casino;
  }

  // ------------------------------------------------------------ membership

  tier(): MemberTier {
    return this.cs.membership.tier;
  }

  tierInfo(): TierInfo {
    return tierInfo(this.cs.membership.tier);
  }

  nextTier(): TierInfo | null {
    const i = TIER_INDEX[this.cs.membership.tier];
    return TIERS[i + 1] ?? null;
  }

  tierAtLeast(t: MemberTier): boolean {
    return TIER_INDEX[this.cs.membership.tier] >= TIER_INDEX[t];
  }

  /** Price at the casino bar after membership benefits (Gold+ drinks are comped). */
  barPrice(price: Money): Money {
    const info = this.tierInfo();
    if (info.barDiscount >= 100) return 0;
    return Math.round((price * (100 - info.barDiscount)) / 100 / 50) * 50;
  }

  /** Rate play by theoretical loss: points, comps and lifetime handle. */
  private rate(stake: Money, edge: number): void {
    if (stake <= 0) return;
    const m = this.cs.membership;
    const theo = Math.round(stake * edge);
    m.lifetimeHandle += stake;
    m.lifetimeTheo += theo;
    const pts = theo / 50; // 1 point per 0.5 G of theoretical loss
    m.points += pts;
    m.lifetimePoints += pts;
    this.cs.comps += Math.round(theo * this.tierInfo().compRate);
    this.checkTier();
  }

  private checkTier(): void {
    const m = this.cs.membership;
    let best: TierInfo = TIERS[0];
    for (const t of TIERS) if (m.points >= t.minPoints) best = t;
    if (TIER_INDEX[best.id] > TIER_INDEX[m.tier]) {
      m.tier = best.id;
      this.core.journal.add('casino', `赌场会员升级为 ${best.name}。`, true);
      this.core.phone.send('victor', '灰港大赌场', `恭喜您升级为 ${best.name} 会员！新权益：${best.perks.join('；')}。请注意：会员礼遇不影响任何游戏的赔率。`);
      this.core.bus.emit('casino:tier', { tier: best.id });
      this.core.social.applyDirect('victor', { kind: 'vip_upgrade', facets: { wealthDisplay: 0.4 }, importance: 20, data: { tier: best.id } }, { silent: true });
    }
  }

  /** Monthly tier review: points decay when the player stops visiting; status can drop. */
  monthlyReview(): void {
    const m = this.cs.membership;
    const daysSince = this.core.today() - m.lastVisitDay;
    m.points *= daysSince > 28 ? 0.6 : 0.85;
    let best: TierInfo = TIERS[0];
    for (const t of TIERS) if (m.points >= t.minPoints * 0.7) best = t; // 30% grace before downgrade
    if (TIER_INDEX[best.id] < TIER_INDEX[m.tier]) {
      m.tier = best.id;
      this.core.phone.send('casino', '灰港大赌场', `根据近期的游戏记录，您的会员等级调整为 ${best.name}。`);
      this.core.journal.add('casino', `赌场会员降级为 ${best.name}。`);
    }
  }

  // ------------------------------------------------------------ access

  employeeBan(): string | null {
    if (this.core.career.job('dealer')) return '赌场员工不得在本赌场下注（行业规定）';
    return null;
  }

  areaAccess(area: TableArea): string | null {
    if (area === 'main') return null;
    const now = this.core.today();
    if (area === 'high') {
      if (this.tierAtLeast('platinum') || this.cs.invites.highLimit >= now) return null;
      if (this.core.economy.balance('chips') >= G(20000)) return null;
      return '高额投注区仅对白金卡以上会员或持有 20,000 G 以上筹码的客人开放';
    }
    if (this.tierAtLeast('diamond') || this.cs.invites.vip >= now) {
      if (this.core.inventory.currentOutfit().prestige! < 3) return 'VIP 私人厅着装要求：正装（西装或礼服）';
      return null;
    }
    return 'VIP 私人厅仅限钻石卡会员或受邀贵宾';
  }

  tableAccess(tableId: string): string | null {
    const cfg = TABLE_BY_ID[tableId];
    if (!cfg) return '没有这张桌子';
    const ban = this.employeeBan();
    if (ban) return ban;
    if (this.cs.bannedUntil > this.core.now()) return '你已被赌场禁止入内';
    if (cfg.game === 'blackjack' && this.cs.barredBlackjack) return '赌场已经礼貌地通知你：你不再被允许玩 21 点';
    return this.areaAccess(cfg.area);
  }

  // ------------------------------------------------------------ tables

  config(id: string): TableConfig {
    return TABLE_BY_ID[id];
  }

  table(id: string): TableEngineState {
    let t = this.cs.tables[id];
    if (!t) {
      const cfg = TABLE_BY_ID[id];
      if (!cfg) throw new Error(`unknown table ${id}`);
      const seed = this.core.rng.nextU32();
      if (cfg.game === 'blackjack') t = { game: 'blackjack', s: BJ.createBlackjackTable(id, cfg.rules, seed) };
      else if (cfg.game === 'baccarat') t = { game: 'baccarat', s: BAC.createBaccaratTable(id, cfg.rules, seed) };
      else if (cfg.game === 'poker') t = { game: 'poker', s: PK.createPokerTable(id, cfg.rules, seed) };
      else t = { game: 'roulette', s: RL.createRouletteTable(id, cfg.rules, seed) };
      this.cs.tables[id] = t;
    }
    return t;
  }

  bj(id: string): BJ.BlackjackState {
    const t = this.table(id);
    if (t.game !== 'blackjack') throw new Error('not a blackjack table');
    return t.s;
  }

  bac(id: string): BAC.BaccaratState {
    const t = this.table(id);
    if (t.game !== 'baccarat') throw new Error('not a baccarat table');
    return t.s;
  }

  pk(id: string): PK.PokerState {
    const t = this.table(id);
    if (t.game !== 'poker') throw new Error('not a poker table');
    return t.s;
  }

  rl(id: string): RL.RouletteState {
    const t = this.table(id);
    if (t.game !== 'roulette') throw new Error('not a roulette table');
    return t.s;
  }

  // ------------------------------------------------------------ sessions & crowd

  inCasino(): boolean {
    return this.core.state.world.location === 'casino';
  }

  enterCasino(): void {
    const m = this.cs.membership;
    const today = this.core.today();
    if (m.lastVisitDay !== today) m.visits += 1;
    m.lastVisitDay = today;
    if (!this.cs.session) {
      const chips = this.core.economy.balance('chips');
      this.cs.session = { start: this.core.now(), startChips: chips, buyIn: 0, net: 0, rounds: 0, peak: 0 };
    }
    this.cs.patrons = [];
    for (const cfg of POKER_TABLES) this.pkClearPatrons(cfg.id);
    this.clearGhosts();
    this.refreshCrowd(true);
    this.core.touch();
  }

  leaveCasino(): void {
    // finish any poker hand still running, credit anything still owed and release named NPCs
    for (const cfg of POKER_TABLES) {
      if (!this.cs.tables[cfg.id]) continue;
      this.pkRunOut(cfg.id);
      this.collect(cfg.id);
      const s = this.pk(cfg.id);
      PK.finishPokerHand(s);
      const me = PK.seatOfPoker(s, PLAYER);
      if (me >= 0) PK.leavePoker(s, me);
      this.pkClearPatrons(cfg.id);
    }
    for (const id of Object.keys(this.cs.tables)) this.collect(id);
    this.syncNpcPatrons(true);
    this.cs.patrons = [];
    this.cs.activeTable = null;
    this.clearGhosts();
    const s = this.cs.session;
    if (s) {
      const end = this.core.now();
      this.cs.stats.sessions.push({ start: s.start, end, net: s.net, rounds: s.rounds });
      if (this.cs.stats.sessions.length > 120) this.cs.stats.sessions.shift();
      if (s.rounds > 0) {
        const hours = (end - s.start) / 60;
        this.core.journal.add('casino', `在赌场待了 ${hours.toFixed(1)} 小时，玩了 ${s.rounds} 局，净${s.net >= 0 ? '赢' : '输'} ${formatG(Math.abs(s.net))}。`, Math.abs(s.net) >= G(2000));
      }
      this.cs.session = null;
      this.core.bus.emit('casino:left', { net: s.net, rounds: s.rounds, hours: (end - s.start) / 60 });
    }
    this.core.touch();
  }

  /**
   * The crowd goes home with the player, but the tables keep their state:
   * finish any round left on a felt and free every seat or bet that belongs
   * to someone who is no longer here (otherwise phantom players would hold
   * seats forever and the table would look permanently full).
   */
  private clearGhosts(): void {
    const here = new Set(this.cs.patrons.filter((p) => p.state !== 'gone').map((p) => p.id));
    here.add(PLAYER);
    for (const [id, t] of Object.entries(this.cs.tables)) {
      if (t.game === 'blackjack') {
        const s = t.s;
        for (let guard = 0; guard < 120 && (s.phase === 'insurance' || s.phase === 'player'); guard++) {
          if (s.phase === 'insurance') {
            for (let i = 0; i < s.seats.length; i++) if (s.seats[i].hands.length && !s.seats[i].insuranceDecided) BJ.decideInsurance(s, i, false);
            BJ.closeInsurance(s);
          } else if (s.turnSeat >= 0) BJ.act(s, s.turnSeat, 'stand');
          else break;
        }
        if (s.phase === 'settled') {
          this.collect(id);
          BJ.finishRound(s);
        }
        s.seats.forEach((seat, i) => {
          if (seat.occupant && !here.has(seat.occupant) && s.phase === 'betting') {
            seat.pendingBet = 0;
            BJ.leave(s, i);
          }
        });
      } else if ((t.game === 'baccarat' || t.game === 'roulette') && t.s.phase === 'betting') {
        const s = t.s as { bets: { owner: string }[] };
        s.bets = s.bets.filter((b) => here.has(b.owner));
      }
    }
  }

  /** Occupancy target 0..1 by hour and weekday. */
  occupancy(): number {
    const d = toDate(this.core.now());
    const h = d.hour;
    let o = h < 4 ? 0.55 : h < 8 ? 0.12 : h < 12 ? 0.2 : h < 17 ? 0.32 : h < 20 ? 0.5 : 0.78;
    const weekendNight = (d.weekday === 4 || d.weekday === 5) && (h >= 19 || h < 4);
    if (weekendNight) o = Math.min(0.97, o * 1.3);
    if (d.weekday === 5 && h >= 21 && this.core.events.isActive('weekend_highroller')) o = Math.min(1, o + 0.1);
    return o;
  }

  patronsAt(tableId: string): Patron[] {
    return this.cs.patrons.filter((p) => p.seat?.startsWith(`${tableId}:`) && p.state !== 'gone');
  }

  /** Seats taken by patrons or the player at a table. */
  private takenSeats(tableId: string): Set<number> {
    const set = new Set<number>();
    for (const p of this.patronsAt(tableId)) set.add(Number(p.seat!.split(':')[1]));
    if (this.cs.activeTable === tableId) set.add(this.playerSeatIndex(tableId));
    return set;
  }

  playerSeatIndex(tableId: string): number {
    const cfg = TABLE_BY_ID[tableId];
    if (cfg.game === 'blackjack') return BJ.seatOf(this.bj(tableId), PLAYER);
    if (cfg.game === 'poker') return PK.seatOfPoker(this.pk(tableId), PLAYER);
    return Number(this.core.state.player.flags[`seat:${tableId}`] ?? -1);
  }

  /** Spawns / retires anonymous patrons to match the time of day, and seats named NPC gamblers. */
  refreshCrowd(initial = false): void {
    this.syncNpcPatrons(false);
    for (const cfg of TABLES) {
      if (cfg.id === this.cs.activeTable) continue;
      this.refreshTableCrowd(cfg.id, initial);
    }
    // the table the player sits at is only managed between its hands (or when the floor is rebuilt)
    for (const cfg of POKER_TABLES) if (initial || cfg.id !== this.cs.activeTable) this.pkManage(cfg.id, initial);
    this.cs.patrons = this.cs.patrons.filter((p) => p.state !== 'gone');
    this.core.touch();
  }

  /** Crowd changes for a single table; only called between rounds. */
  refreshTableCrowd(tableId: string, initial = false): void {
    const cfg = TABLE_BY_ID[tableId];
    if (this.roundInProgress(tableId)) return;
    const now = this.core.now();
    const rng = this.crowdRng;
    for (const p of this.patronsAt(tableId)) {
      if (p.npc) continue;
      if (patronWantsToLeave(p, now, this.tableMin(cfg))) this.retirePatron(p);
    }
    const occ = this.occupancy();
    const areaFactor = cfg.area === 'main' ? 1 : cfg.area === 'high' ? 0.45 : 0.3;
    const playerHere = tableId === this.cs.activeTable ? 1 : 0;
    const target = Math.round(cfg.seats * occ * areaFactor * (cfg.game === 'blackjack' ? 0.8 : 1)) - playerHere;
    let seated = this.patronsAt(tableId).length;
    let guard = 0;
    while (seated < target && guard++ < 10) {
      if (!initial && !rng.chance(0.5)) break;
      const seat = this.freeSeat(tableId);
      if (seat < 0) break;
      const p = generatePatron(`p${++this.cs.patronSeq}`, rng, cfg.area, cfg.game, now);
      if (p.bankroll < this.tableMin(cfg) * 4) p.bankroll = this.tableMin(cfg) * rng.int(5, 30);
      p.startBankroll = p.bankroll;
      p.seat = `${tableId}:${seat}`;
      p.state = 'playing';
      this.cs.patrons.push(p);
      if (cfg.game === 'blackjack') BJ.sit(this.bj(tableId), seat, p.id);
      seated++;
      this.core.bus.emit('patron:arrived', { id: p.id, tableId });
    }
    this.cs.patrons = this.cs.patrons.filter((p) => p.state !== 'gone');
  }

  private retirePatron(p: Patron): void {
    const tableId = p.seat?.split(':')[0];
    const game = tableId ? TABLE_BY_ID[tableId]?.game : undefined;
    if (tableId && game === 'blackjack') {
      const st = this.bj(tableId);
      if (st.phase === 'settled') {
        this.collect(tableId);
        BJ.finishRound(st);
      }
      const idx = BJ.seatOf(st, p.id);
      if (idx >= 0 && st.phase === 'betting') {
        st.seats[idx].pendingBet = 0;
        BJ.leave(st, idx);
      }
    } else if (tableId && game === 'baccarat') {
      const st = this.bac(tableId);
      if (st.phase === 'betting') BAC.clearBacBets(st, p.id);
    } else if (tableId && game === 'roulette') {
      const st = this.rl(tableId);
      if (st.phase === 'betting') RL.clearRouletteBets(st, p.id);
    } else if (tableId && game === 'poker') {
      const st = this.pk(tableId);
      const i = PK.seatOfPoker(st, p.id);
      if (i >= 0 && !PK.handInProgress(st)) p.bankroll += PK.leavePoker(st, i);
      // a named player's chips go back into their own money
      const rt = p.npc ? this.core.state.npcs[p.npc] : undefined;
      if (rt) {
        rt.money = p.bankroll + Math.max(0, Number(rt.flags.heldBack ?? 0));
        rt.flags.heldBack = 0;
      }
    }
    p.state = 'gone';
    p.seat = null;
    this.core.bus.emit('patron:left', { id: p.id, net: p.bankroll - p.startBankroll });
  }

  private freeSeat(tableId: string): number {
    const cfg = TABLE_BY_ID[tableId];
    const taken = this.takenSeats(tableId);
    if (cfg.game === 'blackjack') {
      const st = this.bj(tableId);
      st.seats.forEach((s, i) => {
        if (s.occupant) taken.add(i);
      });
    }
    const order = Array.from({ length: cfg.seats }, (_, i) => i);
    this.crowdRng.shuffle(order);
    return order.find((i) => !taken.has(i)) ?? -1;
  }

  tableMin(cfg: TableConfig): Money {
    if (cfg.game === 'roulette') return cfg.rules.minTotal ?? G(5);
    if (cfg.game === 'poker') return cfg.rules.minBuyIn ?? G(40);
    return cfg.rules.minBet ?? G(10);
  }

  /** Named NPCs scheduled to gamble (or out with the player tonight) become patrons with their own money. */
  private syncNpcPatrons(releaseAll: boolean): void {
    const tables: [string, string][] = Object.entries(NPC_TABLES);
    // poker nights: whoever is on the poker room's rail (or still at a poker table) plays at their own table
    for (const [id, pk] of Object.entries(NPC_POKER)) {
      const rt = this.core.state.npcs[id];
      const at = this.cs.patrons.find((p) => p.npc === id && p.state !== 'gone')?.seat?.split(':')[0];
      if (!rt || !(rt.spot?.startsWith(POKER_RAIL) || (at && TABLE_BY_ID[at]?.game === 'poker'))) continue;
      // on tournament night the 1/2 table is the tournament's: its regulars play at the other one
      const table = pk.table === TOURNEY_HOST && this.core.tourney.running() ? 'pk2' : pk.table;
      const i = tables.findIndex(([n]) => n === id);
      if (i >= 0) tables[i] = [id, table];
      else tables.push([id, table]);
    }
    for (const id of this.core.companions.playing()) {
      const at = this.core.companions.tableFor(id);
      const i = tables.findIndex(([n]) => n === id);
      if (i >= 0) tables[i] = [id, at];
      else tables.push([id, at]);
    }
    for (const [npcId, wanted] of tables) {
      let tableId = wanted;
      const rt = this.core.state.npcs[npcId];
      if (!rt) continue;
      let existing = this.cs.patrons.find((p) => p.npc === npcId && p.state !== 'gone');
      // a companion follows you to another table between rounds
      if (existing && existing.seat && !existing.seat.startsWith(`${tableId}:`) && !releaseAll) {
        const from = existing.seat.split(':')[0];
        if (!this.roundInProgress(from) && from !== this.cs.activeTable) {
          rt.money = existing.bankroll + Math.max(0, Number(rt.flags.heldBack ?? 0));
          rt.flags.heldBack = 0;
          this.retirePatron(existing);
          existing = undefined;
        }
      }
      const poker = TABLE_BY_ID[tableId].game === 'poker';
      // someone playing in the tournament is at its table, not a cash one
      const shouldPlay = !releaseAll && rt.location === 'casino' && rt.activity === 'gamble' && !this.core.tourney.playing(npcId) && rt.money > (poker ? this.tableMin(TABLE_BY_ID[tableId]) : G(30));
      if (existing && (!shouldPlay || this.holding(existing) < this.tableMin(TABLE_BY_ID[tableId]))) {
        if ((this.roundInProgress(tableId) || tableId === this.cs.activeTable) && !releaseAll) continue;
        const broke = this.holding(existing) < this.tableMin(TABLE_BY_ID[tableId]);
        if (poker) {
          // the stack comes off the felt, and everything goes back into their own money (see retirePatron)
          this.retirePatron(existing);
        } else {
          rt.money = existing.bankroll + Math.max(0, Number(rt.flags.heldBack ?? 0));
          rt.flags.heldBack = 0;
          this.retirePatron(existing);
        }
        if (broke) rt.flags.bustedTonight = this.core.today();
        continue;
      }
      if (!existing && shouldPlay && rt.flags.bustedTonight !== this.core.today() && poker) {
        this.seatPokerNpc(npcId, tableId);
        continue;
      }
      if (!existing && shouldPlay && rt.flags.bustedTonight !== this.core.today()) {
        let seat = this.freeSeat(tableId);
        if (seat < 0 && tableId === this.cs.activeTable && !this.roundInProgress(tableId)) {
          // a stranger makes room for your friend
          const p = this.patronsAt(tableId).find((x) => !x.npc);
          if (p) {
            seat = Number(p.seat!.split(':')[1]);
            this.retirePatron(p);
          }
        }
        if (seat < 0 && this.core.companions.playing().includes(npcId)) {
          tableId = this.core.companions.homeTable(npcId);
          seat = this.freeSeat(tableId);
        }
        if (seat < 0) continue;
        const def = NPC_BY_ID[npcId];
        // NPCs bring only part of their money to the table
        const bring = Math.min(rt.money, Math.max(this.tableMin(TABLE_BY_ID[tableId]) * 10, Math.round((rt.money * (0.25 + def.traits.gamblingView * 0.25)) / 100) * 100));
        rt.flags.heldBack = rt.money - bring;
        const p = generatePatron(`npc:${npcId}`, this.crowdRng, TABLE_BY_ID[tableId].area, TABLE_BY_ID[tableId].game, this.core.now());
        p.name = def.name;
        p.npc = npcId;
        p.bankroll = bring;
        p.startBankroll = bring;
        p.style = npcId === 'marco' ? 'reckless' : npcId === 'alexander' ? 'basic' : 'dealer-mimic';
        p.skill = npcId === 'alexander' ? 0.9 : npcId === 'marco' ? 0.35 : 0.5;
        p.superstition = npcId === 'marco' || npcId === 'lillian' ? 0.9 : 0.3;
        p.risk = npcId === 'marco' ? 0.12 : 0.05;
        p.stopLoss = npcId === 'marco' ? 0.02 : 0.4;
        p.winGoal = npcId === 'marco' ? 9 : 2;
        p.leaveAt = this.core.now() + 600;
        p.seat = `${tableId}:${seat}`;
        p.state = 'playing';
        this.cs.patrons.push(p);
        if (TABLE_BY_ID[tableId].game === 'blackjack') BJ.sit(this.bj(tableId), seat, p.id);
      } else if (existing) {
        rt.money = this.holding(existing) + Number(rt.flags.heldBack ?? 0);
      }
    }
  }

  /** Everything a patron has: in hand, and in front of them at a poker table. */
  private holding(p: Patron): Money {
    const tableId = p.seat?.split(':')[0];
    if (!tableId || TABLE_BY_ID[tableId]?.game !== 'poker' || !this.cs.tables[tableId]) return p.bankroll;
    const s = this.pk(tableId);
    const i = PK.seatOfPoker(s, p.id);
    return p.bankroll + (i >= 0 ? s.seats[i].stack : 0);
  }

  /** The seat at a poker table a named NPC is playing in, if any (for what they say at the table). */
  npcPokerTable(npcId: string): string | null {
    const p = this.cs.patrons.find((x) => x.npc === npcId && x.state !== 'gone');
    const tableId = p?.seat?.split(':')[0];
    return tableId && TABLE_BY_ID[tableId]?.game === 'poker' ? tableId : null;
  }

  /** A named NPC sits down at a poker table between hands and buys in with part of what they brought. */
  private seatPokerNpc(npcId: string, tableId: string): void {
    const s = this.pk(tableId);
    if (PK.handInProgress(s)) return;
    const rt = this.core.state.npcs[npcId];
    const def = NPC_BY_ID[npcId];
    const how = NPC_POKER[npcId];
    const rules = s.rules;
    let seat = this.pkFreeSeat(s);
    // a stranger gives up a seat to a regular (but not the one kept for the player)
    const keep = PK.seatOfPoker(s, PLAYER) >= 0 || this.cs.activeTable === tableId ? 1 : 0;
    if (seat < 0 || s.seats.filter((x) => !x.occupant).length <= keep) {
      const p = this.patronsAt(tableId).find((x) => !x.npc);
      if (!p) return;
      this.retirePatron(p);
      seat = this.pkFreeSeat(s);
    }
    if (seat < 0) return;
    // they bring part of their money (the careful ones less), and put some of it on the table
    const share = Math.max(0.12, 0.25 + def.traits.gamblingView * 0.25);
    const bring = Math.min(rt.money, Math.max(rules.minBuyIn * 3, Math.round((rt.money * share) / G(10)) * G(10)));
    if (bring < rules.minBuyIn) return;
    const buyIn = Math.max(rules.minBuyIn, Math.min(rules.maxBuyIn, Math.round((bring * 0.5) / G(10)) * G(10)));
    rt.flags.heldBack = rt.money - bring;
    const p = generatePatron(`npc:${npcId}`, this.crowdRng, 'main', 'poker', this.core.now());
    p.name = def.name;
    p.npc = npcId;
    p.startBankroll = bring;
    p.bankroll = bring - buyIn;
    p.pokerStyle = how.style;
    p.stopLoss = how.stopLoss;
    p.winGoal = how.winGoal;
    p.leaveAt = this.core.now() + 600;
    p.seat = `${tableId}:${seat}`;
    p.state = 'playing';
    PK.sitPoker(s, seat, p.id, buyIn);
    this.cs.patrons.push(p);
    this.core.bus.emit('patron:arrived', { id: p.id, tableId });
  }

  patronById(id: string): Patron | undefined {
    return this.cs.patrons.find((p) => p.id === id);
  }

  roundInProgress(tableId: string): boolean {
    const t = this.cs.tables[tableId];
    if (!t) return false;
    if (t.game === 'blackjack') return t.s.phase === 'insurance' || t.s.phase === 'player';
    if (t.game === 'poker') {
      const i = PK.seatOfPoker(t.s, PLAYER);
      return i >= 0 && PK.handInProgress(t.s) && t.s.seats[i].inHand;
    }
    return false;
  }

  // ------------------------------------------------------------ seating the player

  sit(tableId: string): CasinoResult<number> {
    const err = this.tableAccess(tableId);
    if (err) return fail(err);
    if (tableId === TOURNEY_HOST && this.core.tourney.running()) return fail('今晚这张桌在办周日锦标赛，现金局请去 5/10 桌');
    const cfg = TABLE_BY_ID[tableId];
    if (this.cs.activeTable && this.cs.activeTable !== tableId) this.standUp();
    if (cfg.game === 'poker') {
      // the buy-in is chosen at the table; keep a seat free for the player
      this.cs.activeTable = tableId;
      this.pkManage(tableId);
      this.core.bus.emit('casino:sit', { tableId });
      this.core.touch();
      return ok(this.playerSeatIndex(tableId));
    }
    let seat = this.playerSeatIndex(tableId);
    if (seat < 0) {
      const taken = this.takenSeats(tableId);
      if (cfg.game === 'blackjack') this.bj(tableId).seats.forEach((s, i) => s.occupant && taken.add(i));
      const preferred = [Math.floor(cfg.seats / 2), 1, cfg.seats - 2, 0, cfg.seats - 1, 2, 3, 4, 5, 6];
      seat = preferred.find((i) => i >= 0 && i < cfg.seats && !taken.has(i)) ?? -1;
      if (seat < 0) {
        // ask a patron to make room (it is the player's game after all)
        const p = this.patronsAt(tableId).find((x) => !x.npc);
        if (!p || this.roundInProgress(tableId)) return fail('这张桌子满座了');
        seat = Number(p.seat!.split(':')[1]);
        this.retirePatron(p);
      }
      if (cfg.game === 'blackjack') BJ.sit(this.bj(tableId), seat, PLAYER);
      else this.core.state.player.flags[`seat:${tableId}`] = seat;
    }
    this.cs.activeTable = tableId;
    // friends who came with you join this table now
    if (this.core.companions.playing().length) this.syncNpcPatrons(false);
    this.core.bus.emit('casino:sit', { tableId });
    this.core.touch();
    return ok(seat);
  }

  standUp(): CasinoResult<undefined> {
    const tableId = this.cs.activeTable;
    if (!tableId) return ok(undefined);
    if (TABLE_BY_ID[tableId].game === 'poker' && this.roundInProgress(tableId)) {
      // after folding the player may get up; the others finish the hand without them
      const s = this.pk(tableId);
      const me = s.seats[PK.seatOfPoker(s, PLAYER)];
      if (!me.folded) return fail('请先打完这一手（或者弃牌）');
      this.pkRunOut(tableId);
    }
    if (this.roundInProgress(tableId)) return fail('请先打完这一手');
    this.collect(tableId);
    const cfg = TABLE_BY_ID[tableId];
    if (cfg.game === 'blackjack') {
      const st = this.bj(tableId);
      BJ.finishRound(st);
      const i = BJ.seatOf(st, PLAYER);
      if (i >= 0) BJ.leave(st, i);
    } else if (cfg.game === 'baccarat') {
      BAC.clearBacBets(this.bac(tableId), PLAYER);
      delete this.core.state.player.flags[`seat:${tableId}`];
    } else if (cfg.game === 'poker') {
      const st = this.pk(tableId);
      if (st.phase === 'settled') PK.finishPokerHand(st);
      const i = PK.seatOfPoker(st, PLAYER);
      // chips at the poker table are part of the chip balance all along; nothing to transfer
      if (i >= 0) PK.leavePoker(st, i);
    } else {
      RL.clearRouletteBets(this.rl(tableId), PLAYER);
      delete this.core.state.player.flags[`seat:${tableId}`];
    }
    this.cs.activeTable = null;
    this.core.touch();
    return ok(undefined);
  }

  /** Chips not committed to bets that are still on the layout. */
  availableChips(): Money {
    const chips = this.core.economy.balance('chips');
    const t = this.cs.activeTable;
    if (!t) return chips;
    return chips - this.pendingStake(t);
  }

  pendingStake(tableId: string): Money {
    const tbl = this.cs.tables[tableId];
    if (!tbl) return 0;
    if (tbl.game === 'blackjack') {
      const i = BJ.seatOf(tbl.s, PLAYER);
      return i >= 0 ? tbl.s.seats[i].pendingBet : 0;
    }
    if (tbl.game === 'baccarat') return tbl.s.phase === 'betting' ? BAC.ownerStake(tbl.s, PLAYER) : 0;
    if (tbl.game === 'poker') {
      // the whole stack in front of the player is reserved at the table
      const i = PK.seatOfPoker(tbl.s, PLAYER);
      if (i < 0) return 0;
      const st = tbl.s.seats[i];
      if (!st.inHand) return st.stack;
      if (PK.handInProgress(tbl.s)) return st.stack + st.committed;
      // settled: until the result is booked the chip account still holds the starting stack
      return (this.cs.paidRounds[tableId] ?? 0) >= tbl.s.hand ? st.stack : st.startStack;
    }
    return tbl.s.phase === 'betting' ? RL.ownerTotal(tbl.s, PLAYER) : 0;
  }

  // ------------------------------------------------------------ settlement bookkeeping

  private debitPlayer(stake: Money, tableId: string, memo: string): CasinoResult<undefined> {
    if (stake <= 0) return ok(undefined);
    const r = this.core.economy.spend('chips', stake, 'casino_bet', memo, `casino:${tableId}`);
    return r.ok ? ok(undefined) : fail(r.error);
  }

  private creditPlayer(amount: Money, tableId: string, memo: string): void {
    if (amount > 0) this.core.economy.receive('chips', amount, 'casino_payout', memo, `casino:${tableId}`);
  }

  /** Records a completed round for the player (stats, rating, emotions, witnesses). */
  private recordPlayerRound(game: GameKind, tableId: string, stake: Money, ret: Money, edgeDetail?: string): RoundResult {
    const net = ret - stake;
    const st = this.cs.stats;
    st.byGame[game].rounds += 1;
    st.byGame[game].wagered += stake;
    st.byGame[game].net += net;
    if (net > st.biggestWin) st.biggestWin = net;
    if (net < st.biggestLoss) st.biggestLoss = net;
    if (net > 0) {
      st.winStreak += 1;
      st.lossStreak = 0;
    } else if (net < 0) {
      st.lossStreak += 1;
      st.winStreak = 0;
    }
    const s = this.cs.session;
    if (s) {
      s.rounds += 1;
      s.net += net;
      s.peak = Math.max(s.peak, s.net);
    }
    this.rate(stake, ratedEdge(game, edgeDetail));
    this.core.player.adjustReputation('casino', Math.min(0.5, stake / G(20000)));
    this.emotions(net, stake);
    this.core.social.casinoPlay(game, tableId, stake, net);
    this.core.bus.emit('casino:round', { game, tableId, stake, ret, net });
    this.core.touch();
    return { stake, ret, net };
  }

  /** The player's evening in the Sunday tournament, booked like a round of poker: what it cost, what came back. */
  recordTournament(stake: Money, ret: Money): RoundResult {
    return this.recordPlayerRound('poker', TOURNEY_TABLE, stake, ret);
  }

  /** Winning and losing changes how the player feels — never how the cards fall. */
  private emotions(net: Money, stake: Money): void {
    if (stake <= 0) return;
    const pl = this.core.player;
    const liquid = Math.max(G(200), this.core.economy.liquid());
    const m = Math.min(3, Math.abs(net) / Math.max(G(50), liquid * 0.04));
    if (net > 0) {
      pl.change('mood', Math.min(9, 1.5 + m * 3));
      pl.change('confidence', Math.min(7, 1 + m * 2.5));
      pl.change('stress', -Math.min(5, m * 2));
      pl.change('impulsivity', Math.min(3, m * 1.5));
    } else if (net < 0) {
      const streak = this.cs.stats.lossStreak;
      pl.change('mood', -Math.min(9, 1.5 + m * 3));
      pl.change('stress', Math.min(9, 1.5 + m * 3));
      pl.change('confidence', -Math.min(5, 0.8 + m * 1.6));
      pl.change('impulsivity', Math.min(6, (streak >= 3 ? 2 : 0.6) * (1 + m)));
    }
  }

  private patronSettle(p: Patron, stake: Money, ret: Money): void {
    p.bankroll += ret;
    this.patronFeel(p, ret - stake, stake);
  }

  /** Streaks, mood and a visible reaction after a round. */
  private patronFeel(p: Patron, net: Money, stake: Money): void {
    if (net > 0) {
      p.wins += 1;
      p.streak = p.streak >= 0 ? p.streak + 1 : 1;
      p.mood = Math.min(100, p.mood + 6);
    } else if (net < 0) {
      p.losses += 1;
      p.streak = p.streak <= 0 ? p.streak - 1 : -1;
      p.mood = Math.max(-100, p.mood - 6);
    }
    const emote = patronReaction(p, net, stake);
    if (emote) this.core.bus.emit('patron:emote', { id: p.id, emote, net });
    if (p.npc) {
      const rt = this.core.state.npcs[p.npc];
      if (rt) {
        rt.money = this.holding(p) + Number(rt.flags.heldBack ?? 0);
        // the casino session after midnight still belongs to the evening's schedule
        rt.flags.liveGambleDay = Math.floor((this.core.now() - 6 * 60) / MINUTES_PER_DAY);
      }
      if (net >= G(500)) this.core.social.npcEvent(p.npc, 'npc_big_win', { amount: net });
    }
  }

  /** Credit any settled-but-unpaid round (after animations, on stand-up and on load). */
  collect(tableId: string): RoundResult | null {
    const t = this.cs.tables[tableId];
    if (!t) return null;
    const paid = this.cs.paidRounds[tableId] ?? 0;
    if (t.game === 'blackjack') {
      const s = t.s;
      if (s.phase !== 'settled' || paid >= s.round) return null;
      this.cs.paidRounds[tableId] = s.round;
      let result: RoundResult | null = null;
      s.seats.forEach((seat, i) => {
        if (!seat.occupant || seat.hands.length === 0) return;
        const stake = BJ.seatStake(s, i);
        const ret = BJ.seatReturn(s, i);
        if (seat.occupant === PLAYER) {
          this.creditPlayer(ret, tableId, `21点 第${s.round}局派彩`);
          result = this.recordPlayerRound('blackjack', tableId, stake, ret, s.rules.blackjackPays[0] === 6 ? '6:5' : undefined);
        } else {
          const p = this.patronById(seat.occupant);
          if (p) this.patronSettle(p, stake, ret);
        }
      });
      return result;
    }
    if (t.game === 'baccarat') {
      const s = t.s;
      if (s.phase !== 'settled' || paid >= s.round) return null;
      this.cs.paidRounds[tableId] = s.round;
      const owners = new Set(s.settlements.map((x) => x.owner));
      let result: RoundResult | null = null;
      for (const o of owners) {
        const mine = s.settlements.filter((x) => x.owner === o);
        const stake = mine.reduce((a, x) => a + x.amount, 0);
        const ret = mine.reduce((a, x) => a + x.payout, 0);
        if (o === PLAYER) {
          this.creditPlayer(ret, tableId, `百家乐 第${s.round}局派彩`);
          const tieHeavy = mine.filter((x) => x.side === 'tie').reduce((a, x) => a + x.amount, 0) > stake / 2;
          result = this.recordPlayerRound('baccarat', tableId, stake, ret, tieHeavy ? 'tie' : undefined);
        } else {
          const p = this.patronById(o);
          if (p) this.patronSettle(p, stake, ret);
        }
      }
      return result;
    }
    if (t.game === 'poker') {
      // stacks stay at the table; only each hand's net result moves through the chip account
      const s = t.s;
      if (s.phase !== 'settled' || paid >= s.hand) return null;
      this.cs.paidRounds[tableId] = s.hand;
      let result: RoundResult | null = null;
      s.seats.forEach((seat, i) => {
        if (!seat.occupant || !seat.inHand) return;
        const delta = PK.handDelta(s, i);
        const stake = seat.committed;
        if (seat.occupant === PLAYER) {
          if (delta > 0) this.creditPlayer(delta, tableId, `德州扑克 第${s.hand}手 赢得底池`);
          else if (delta < 0) {
            const d = this.debitPlayer(-delta, tableId, `德州扑克 第${s.hand}手 输掉的筹码`);
            if (!d.ok) console.warn('poker settlement failed', d.error);
          }
          if (stake > 0) result = this.recordPlayerRound('poker', tableId, stake, stake + delta);
        } else {
          const p = this.patronById(seat.occupant);
          if (p && stake > 0) this.patronFeel(p, delta, stake);
        }
      });
      return result;
    }
    const s = t.s;
    if (s.phase !== 'settled' || paid >= s.round) return null;
    this.cs.paidRounds[tableId] = s.round;
    const owners = new Set(s.settlements.map((x) => x.owner));
    let result: RoundResult | null = null;
    for (const o of owners) {
      const mine = s.settlements.filter((x) => x.owner === o);
      const stake = mine.reduce((a, x) => a + x.amount, 0);
      const ret = mine.reduce((a, x) => a + x.payout, 0);
      if (o === PLAYER) {
        this.creditPlayer(ret, tableId, `轮盘 第${s.round}局派彩（${s.result}）`);
        result = this.recordPlayerRound('roulette', tableId, stake, ret, s.rules.laPartage ? 'laPartage' : undefined);
      } else {
        const p = this.patronById(o);
        if (p) this.patronSettle(p, stake, ret);
      }
    }
    return result;
  }

  // ------------------------------------------------------------ blackjack controller

  bjSetBet(tableId: string, amount: Money): CasinoResult<undefined> {
    const s = this.bj(tableId);
    const seat = BJ.seatOf(s, PLAYER);
    if (seat < 0) return fail('你还没有入座');
    if (s.phase === 'settled') {
      this.collect(tableId);
      BJ.finishRound(s);
    }
    if (amount === 0) {
      BJ.clearBet(s, seat);
      return ok(undefined);
    }
    const err = BJ.validateBet(s, amount);
    if (err) return fail(err);
    if (amount > this.core.economy.balance('chips')) return fail('筹码不足');
    try {
      BJ.placeBet(s, seat, amount);
    } catch (e) {
      return fail((e as Error).message);
    }
    return ok(undefined);
  }

  /** Patrons decide their bets for the coming round; those who want to leave stand up. */
  bjPatronBets(tableId: string): void {
    const s = this.bj(tableId);
    if (s.phase === 'settled') {
      this.collect(tableId);
      BJ.finishRound(s);
    }
    const rng = this.crowdRng;
    for (const p of this.patronsAt(tableId)) {
      const idx = BJ.seatOf(s, p.id);
      if (idx < 0) continue;
      if (patronWantsToLeave(p, this.core.now(), s.rules.minBet) && !p.npc) {
        this.retirePatron(p);
        continue;
      }
      const bet = patronBetSize(p, s.rules.minBet, s.rules.maxBet, rng);
      if (bet <= 0) continue;
      BJ.placeBet(s, idx, bet);
    }
    this.cs.patrons = this.cs.patrons.filter((p) => p.state !== 'gone');
  }

  bjDeal(tableId: string): CasinoResult<BJ.BJEvent[]> {
    const s = this.bj(tableId);
    if (s.phase === 'settled') {
      this.collect(tableId);
      BJ.finishRound(s);
    }
    if (!BJ.canStartRound(s)) return fail('还没有人下注');
    const seat = BJ.seatOf(s, PLAYER);
    const playerBet = seat >= 0 ? s.seats[seat].pendingBet : 0;
    if (playerBet > 0) {
      const tc = hiLoTrueCount(s.shoe);
      const d = this.debitPlayer(playerBet, tableId, `21点 第${s.round + 1}局下注`);
      if (!d.ok) return d;
      this.trackCounting(tc, playerBet, s.rules.minBet);
    }
    // patrons pay their stakes from their bankroll
    for (const p of this.patronsAt(tableId)) {
      const idx = BJ.seatOf(s, p.id);
      if (idx >= 0) p.bankroll -= s.seats[idx].pendingBet;
    }
    const ev = BJ.startRound(s);
    if (s.phase === 'insurance') {
      for (const p of this.patronsAt(tableId)) {
        const idx = BJ.seatOf(s, p.id);
        if (idx < 0 || s.seats[idx].hands.length === 0) continue;
        const take = npcTakesInsurance(p.style, p.skill, this.crowdRng) && p.bankroll >= BJ.insuranceCost(s, idx);
        const cost = BJ.decideInsurance(s, idx, take);
        p.bankroll -= cost;
      }
    }
    this.core.touch();
    return ok(ev);
  }

  bjInsurance(tableId: string, take: boolean): CasinoResult<BJ.BJEvent[]> {
    const s = this.bj(tableId);
    const seat = BJ.seatOf(s, PLAYER);
    if (s.phase !== 'insurance') return fail('现在不能买保险');
    if (seat >= 0 && s.seats[seat].hands.length > 0 && !s.seats[seat].insuranceDecided) {
      const cost = BJ.insuranceCost(s, seat);
      if (take) {
        if (this.core.economy.balance('chips') < cost) return fail('筹码不足以购买保险');
        const d = this.debitPlayer(cost, tableId, `21点 第${s.round}局保险`);
        if (!d.ok) return d;
      }
      BJ.decideInsurance(s, seat, take);
    }
    const ev = BJ.closeInsurance(s);
    this.core.touch();
    return ok(ev);
  }

  /** Whose turn: 'player', a patron id, or null when no decision is pending. */
  bjTurnOwner(tableId: string): string | null {
    const s = this.bj(tableId);
    if (s.phase !== 'player' || s.turnSeat < 0) return null;
    return s.seats[s.turnSeat].occupant;
  }

  bjPatronAct(tableId: string): CasinoResult<BJ.BJEvent[]> {
    const s = this.bj(tableId);
    const owner = this.bjTurnOwner(tableId);
    if (!owner || owner === PLAYER) return fail('不是 NPC 的回合');
    const p = this.patronById(owner);
    const seat = s.turnSeat;
    let action = p ? npcDecision(s, seat, p.style, p.skill, this.crowdRng) : 'stand';
    if (action === 'double' || action === 'split') {
      const extra = BJ.extraStakeFor(s, seat, action);
      if (!p || p.bankroll < extra) action = 'hit';
      if (!BJ.legalActions(s, seat).includes(action)) action = 'stand';
      if (p && (action === 'double' || action === 'split')) p.bankroll -= extra;
    }
    const ev = BJ.act(s, seat, action);
    this.core.touch();
    return ok(ev);
  }

  bjPlayerAct(tableId: string, action: BJ.BJAction): CasinoResult<BJ.BJEvent[]> {
    const s = this.bj(tableId);
    const seat = BJ.seatOf(s, PLAYER);
    if (seat < 0 || this.bjTurnOwner(tableId) !== PLAYER) return fail('现在不是你的回合');
    if (!BJ.legalActions(s, seat).includes(action)) return fail('按桌规不能这样操作');
    const extra = BJ.extraStakeFor(s, seat, action);
    if (extra > 0) {
      if (this.core.economy.balance('chips') < extra) return fail('筹码不足');
      const d = this.debitPlayer(extra, tableId, `21点 第${s.round}局${action === 'double' ? '加倍' : '分牌'}`);
      if (!d.ok) return d;
    }
    const ev = BJ.act(s, seat, action);
    this.core.touch();
    return ok(ev);
  }

  /** Card-counting surveillance: bet size correlated with the true count draws attention. */
  private trackCounting(tc: number, bet: Money, minBet: Money): void {
    const samples = this.cs.countSamples;
    samples.push({ tc: Math.round(tc * 10) / 10, bet });
    if (samples.length > 40) samples.shift();
    if (samples.length < 20 || samples.length % 5 !== 0) return;
    const n = samples.length;
    const mx = samples.reduce((a, s) => a + s.tc, 0) / n;
    const my = samples.reduce((a, s) => a + s.bet, 0) / n;
    let cov = 0;
    let vx = 0;
    let vy = 0;
    for (const s of samples) {
      cov += (s.tc - mx) * (s.bet - my);
      vx += (s.tc - mx) ** 2;
      vy += (s.bet - my) ** 2;
    }
    const corr = vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : 0;
    const maxBet = Math.max(...samples.map((s) => s.bet));
    const minSeen = Math.max(minBet, Math.min(...samples.map((s) => s.bet)));
    const spread = maxBet / minSeen;
    if (corr > 0.5 && spread >= 4) {
      this.cs.heat += 12 * corr;
      if (this.cs.heat >= 70 && !this.cs.barredBlackjack) {
        this.cs.barredBlackjack = true;
        this.cs.countSamples = [];
        this.core.journal.add('casino', '赌场安保主管杰克礼貌而坚决地告诉你：你以后不能再玩 21 点了。他们怀疑你在算牌。', true);
        this.core.bus.emit('casino:backoff', {});
      } else if (this.cs.heat >= 35) {
        this.core.bus.emit('casino:watched', { heat: this.cs.heat });
      }
    } else {
      this.cs.heat = Math.max(0, this.cs.heat - 3);
    }
  }

  // ------------------------------------------------------------ baccarat controller

  bacPlayerBet(tableId: string, side: BAC.BacSide, amount: Money): CasinoResult<undefined> {
    const s = this.bac(tableId);
    if (s.phase === 'settled') {
      this.collect(tableId);
      BAC.finishBacRound(s);
    }
    if (amount > this.availableChips()) return fail('筹码不足');
    const err = BAC.validateBacBet(s, PLAYER, side, amount);
    if (err) return fail(err);
    BAC.placeBacBet(s, PLAYER, side, amount);
    this.core.touch();
    return ok(undefined);
  }

  bacClear(tableId: string): void {
    const s = this.bac(tableId);
    BAC.clearBacBets(s, PLAYER);
    this.core.touch();
  }

  bacPatronBets(tableId: string): void {
    const s = this.bac(tableId);
    if (s.phase === 'settled') {
      this.collect(tableId);
      BAC.finishBacRound(s);
    }
    for (const p of this.patronsAt(tableId)) {
      if (patronWantsToLeave(p, this.core.now(), s.rules.minBet) && !p.npc) {
        this.retirePatron(p);
        continue;
      }
      if (s.bets.some((b) => b.owner === p.id)) continue;
      const side = patronBaccaratSide(p, s.history, this.crowdRng);
      const amount = patronBetSize(p, side === 'tie' ? G(5) : s.rules.minBet, side === 'tie' ? s.rules.tieMax : s.rules.maxBet, this.crowdRng);
      if (amount > 0 && !BAC.validateBacBet(s, p.id, side, amount)) BAC.placeBacBet(s, p.id, side, amount);
    }
    this.cs.patrons = this.cs.patrons.filter((p) => p.state !== 'gone');
  }

  bacDeal(tableId: string): CasinoResult<BAC.BacEvent[]> {
    const s = this.bac(tableId);
    if (s.phase === 'settled') {
      this.collect(tableId);
      BAC.finishBacRound(s);
    }
    const mine = BAC.ownerStake(s, PLAYER);
    if (mine > 0) {
      const d = this.debitPlayer(mine, tableId, `百家乐 第${s.round + 1}局下注`);
      if (!d.ok) return d;
    }
    for (const p of this.patronsAt(tableId)) p.bankroll -= BAC.ownerStake(s, p.id);
    const ev = BAC.dealCoup(s);
    this.core.touch();
    return ok(ev);
  }

  // ------------------------------------------------------------ roulette controller

  rlPlayerBet(tableId: string, kind: RL.RouletteBetKind, numbers: number[], amount: Money): CasinoResult<undefined> {
    const s = this.rl(tableId);
    if (s.phase === 'settled') {
      this.collect(tableId);
      RL.clearRouletteRound(s);
    }
    if (amount > this.availableChips()) return fail('筹码不足');
    const err = RL.validateRouletteBet(s, PLAYER, kind, numbers, amount);
    if (err) return fail(err);
    RL.placeRouletteBet(s, PLAYER, kind, numbers, amount);
    this.core.touch();
    return ok(undefined);
  }

  rlUndo(tableId: string): void {
    RL.undoRouletteBet(this.rl(tableId), PLAYER);
    this.core.touch();
  }

  rlClear(tableId: string): void {
    RL.clearRouletteBets(this.rl(tableId), PLAYER);
    this.core.touch();
  }

  rlPatronBets(tableId: string): void {
    const s = this.rl(tableId);
    if (s.phase === 'settled') {
      this.collect(tableId);
      RL.clearRouletteRound(s);
    }
    for (const p of this.patronsAt(tableId)) {
      if (patronWantsToLeave(p, this.core.now(), s.rules.minTotal) && !p.npc) {
        this.retirePatron(p);
        continue;
      }
      if (s.bets.some((b) => b.owner === p.id)) continue;
      const total = patronBetSize(p, s.rules.minTotal, s.rules.maxOutside, this.crowdRng);
      if (total <= 0) continue;
      const choices = patronRouletteBets(p, this.crowdRng);
      let placed = 0;
      for (const c of choices) {
        let amt = Math.max(G(1), Math.round((total * c.share) / 100) * 100);
        const max = RL.OUTSIDE_KINDS.has(c.kind) ? s.rules.maxOutside : s.rules.maxInside;
        amt = Math.min(amt, max);
        if (placed + amt > p.bankroll) break;
        if (!RL.validateRouletteBet(s, p.id, c.kind, c.numbers, amt)) {
          RL.placeRouletteBet(s, p.id, c.kind, c.numbers, amt);
          placed += amt;
        }
      }
      if (placed > 0 && placed < s.rules.minTotal) RL.clearRouletteBets(s, p.id);
    }
    this.cs.patrons = this.cs.patrons.filter((p) => p.state !== 'gone');
  }

  rlSpin(tableId: string): CasinoResult<RL.SpinOutcome> {
    const s = this.rl(tableId);
    if (s.phase === 'settled') {
      this.collect(tableId);
      RL.clearRouletteRound(s);
    }
    const below = RL.ownersBelowMinimum(s);
    if (below.includes(PLAYER)) return fail(`本桌每局最低总下注 ${formatG(s.rules.minTotal)}`);
    for (const o of below) RL.clearRouletteBets(s, o);
    const mine = RL.ownerTotal(s, PLAYER);
    if (mine > 0) {
      const d = this.debitPlayer(mine, tableId, `轮盘 第${s.round + 1}局下注`);
      if (!d.ok) return d;
    }
    for (const p of this.patronsAt(tableId)) p.bankroll -= RL.ownerTotal(s, p.id);
    const out = RL.spinWheel(s);
    this.core.touch();
    return ok(out);
  }


  // ------------------------------------------------------------ poker controller

  /** Seats the player can take (empty engine seats). */
  private pkFreeSeat(s: PK.PokerState): number {
    const free = s.seats.map((st, i) => (st.occupant ? -1 : i)).filter((i) => i >= 0);
    if (free.length === 0) return -1;
    return free[this.crowdRng.int(0, free.length - 1)];
  }

  private pkPickStyle(rng: Rng): PokerStyleId {
    const weights: [PokerStyleId, number][] = [
      ['tight', 0.22],
      ['loose', 0.22],
      ['aggressive', 0.14],
      ['passive', 0.2],
      ['bluffer', 0.1],
      ['tilter', 0.12],
    ];
    let r = rng.float();
    for (const [id, w] of weights) {
      if (r < w) return id;
      r -= w;
    }
    return 'tight';
  }

  private pkPersona(p: Patron | undefined) {
    return POKER_STYLES[(p?.pokerStyle as PokerStyleId) ?? 'tight'] ?? POKER_STYLES.tight;
  }

  /** How much a patron brings to the table for a (re-)buy. */
  private pkPatronBuyIn(p: Patron, rules: PK.PokerRules, current: Money): Money {
    const want = Math.round((p.startBankroll * this.crowdRng.range(0.25, 0.6)) / G(10)) * G(10);
    const target = Math.max(rules.minBuyIn, Math.min(rules.maxBuyIn, want));
    return Math.max(0, Math.min(p.bankroll, target - current));
  }

  /** Empties a poker table of patrons (when the floor crowd is rebuilt). */
  private pkClearPatrons(tableId: string): void {
    if (!this.cs.tables[tableId]) return;
    const s = this.pk(tableId);
    if (PK.handInProgress(s)) this.pkRunOut(tableId);
    this.collect(tableId);
    PK.finishPokerHand(s);
    s.seats.forEach((st, i) => {
      if (!st.occupant || st.occupant === PLAYER) return;
      const p = this.patronById(st.occupant);
      const stack = PK.leavePoker(s, i);
      if (p) {
        p.bankroll += stack;
        p.state = 'gone';
        p.seat = null;
        const rt = p.npc ? this.core.state.npcs[p.npc] : undefined;
        if (rt) {
          rt.money = p.bankroll + Math.max(0, Number(rt.flags.heldBack ?? 0));
          rt.flags.heldBack = 0;
        }
      }
    });
  }

  /** Plays the rest of a hand instantly. A player who is away checks when possible, otherwise folds. */
  pkRunOut(tableId: string): PK.PokerEvent[] {
    const s = this.pk(tableId);
    const ev: PK.PokerEvent[] = [];
    for (let guard = 0; guard < 400 && PK.handInProgress(s); guard++) {
      const seat = s.toAct;
      const owner = s.seats[seat]?.occupant;
      const r = owner && owner !== PLAYER ? this.pkPatronAct(tableId) : null;
      if (r?.ok) ev.push(...r.value);
      else {
        const legal = PK.legalPokerActions(s, seat);
        ev.push(...PK.actPoker(s, seat, { type: legal?.check ? 'check' : 'fold' }));
      }
    }
    this.core.touch();
    return ev;
  }

  /**
   * Between hands: book the finished hand, then patrons leave (time, goals,
   * busted), re-buy when short, and new players take empty seats.
   */
  pkManage(tableId: string, initial = false): void {
    const s = this.pk(tableId);
    if (PK.handInProgress(s)) return;
    // tournament night: the 1/2 table's cash game is closed
    if (tableId === TOURNEY_HOST && this.core.tourney.running()) {
      if (this.patronsAt(tableId).length) this.pkClearPatrons(tableId);
      return;
    }
    if (s.phase === 'settled') {
      this.collect(tableId);
      PK.finishPokerHand(s);
    }
    const cfg = TABLE_BY_ID[tableId];
    const rules = s.rules;
    const now = this.core.now();
    const rng = this.crowdRng;
    // seats whose patron no longer exists (crowd rebuilt) are freed
    s.seats.forEach((st, i) => {
      if (st.occupant && st.occupant !== PLAYER && !this.patronById(st.occupant)) PK.leavePoker(s, i);
    });
    for (const p of this.patronsAt(tableId)) {
      const i = PK.seatOfPoker(s, p.id);
      if (i < 0) {
        p.state = 'gone';
        p.seat = null;
        continue;
      }
      const st = s.seats[i];
      const total = p.bankroll + st.stack;
      let leave = now >= p.leaveAt || total >= p.startBankroll * p.winGoal || total <= p.startBankroll * p.stopLoss;
      if (!leave && st.stack < rules.bigBlind * 25) {
        const add = this.pkPatronBuyIn(p, rules, st.stack);
        const rebuy = add > 0 && st.stack + add >= Math.min(rules.minBuyIn, rules.bigBlind * 25) && rng.chance(0.45 + this.pkPersona(p).tiltProne * 0.45);
        if (rebuy) {
          p.bankroll -= add;
          PK.topUp(s, i, add);
        } else if (st.stack < rules.bigBlind) leave = true;
      }
      if (leave) {
        // a named player who gets up (cashing out, or done for) goes home for the night
        if (p.npc) {
          const rt = this.core.state.npcs[p.npc];
          if (rt) rt.flags.bustedTonight = this.core.today();
        }
        this.retirePatron(p);
      }
    }
    const playerSeated = PK.seatOfPoker(s, PLAYER) >= 0;
    const playerHere = this.cs.activeTable === tableId;
    // one seat is always kept for the player while they are at the table
    const maxPatrons = cfg.seats - (playerSeated || playerHere ? 1 : 0);
    let n = this.patronsAt(tableId).length;
    if (n > maxPatrons) {
      const p = this.patronsAt(tableId).find((x) => !x.npc);
      if (p) {
        this.retirePatron(p);
        n--;
      }
    }
    const want = Math.min(maxPatrons, Math.max(3, Math.round(cfg.seats * Math.min(1, this.occupancy() + 0.25))));
    for (let guard = 0; n < want && guard < 8; guard++) {
      if (n >= 2 && !initial && !rng.chance(0.4)) break;
      const seat = this.pkFreeSeat(s);
      if (seat < 0) break;
      const p = generatePatron(`p${++this.cs.patronSeq}`, rng, cfg.area, 'poker', now);
      uniqueName(p, new Set(this.patronsAt(tableId).map((x) => x.name)), rng);
      if (p.bankroll < rules.minBuyIn * 2) p.bankroll = rules.minBuyIn * rng.int(2, 6);
      p.startBankroll = p.bankroll;
      p.pokerStyle = this.pkPickStyle(rng);
      p.leaveAt = now + rng.int(90, 420);
      const buyIn = this.pkPatronBuyIn(p, rules, 0);
      if (buyIn < rules.minBuyIn) continue;
      p.bankroll -= buyIn;
      PK.sitPoker(s, seat, p.id, buyIn);
      p.seat = `${tableId}:${seat}`;
      p.state = 'playing';
      this.cs.patrons.push(p);
      n++;
      this.core.bus.emit('patron:arrived', { id: p.id, tableId });
    }
    this.cs.patrons = this.cs.patrons.filter((p) => p.state !== 'gone');
    this.core.touch();
  }

  /** The player takes a seat with `amount` of their chips in front of them. */
  pkBuyIn(tableId: string, amount: Money): CasinoResult<number> {
    const err = this.tableAccess(tableId);
    if (err) return fail(err);
    if (this.cs.activeTable !== tableId) return fail('请先走到这张桌子前');
    const s = this.pk(tableId);
    if (PK.seatOfPoker(s, PLAYER) >= 0) return fail('你已经入座了');
    const r = s.rules;
    if (amount < r.minBuyIn || amount > r.maxBuyIn) return fail(`本桌买入 ${formatG(r.minBuyIn)} – ${formatG(r.maxBuyIn)}`);
    if (amount > this.availableChips()) return fail('筹码不足，请先到兑换台换筹码');
    let seat = this.pkFreeSeat(s);
    if (seat < 0) {
      // someone makes room, but only between hands
      const p = PK.handInProgress(s) ? undefined : this.patronsAt(tableId).find((x) => !x.npc);
      if (p) this.retirePatron(p);
      seat = this.pkFreeSeat(s);
      if (seat < 0) return fail('满座了，请等这一手结束');
    }
    PK.sitPoker(s, seat, PLAYER, amount);
    this.core.journal.add('casino', `在${TABLE_BY_ID[tableId].name}买入 ${formatG(amount)}。`);
    this.core.touch();
    return ok(seat);
  }

  /** Add chips to the player's stack between hands (up to the maximum buy-in). */
  pkTopUp(tableId: string, amount: Money): CasinoResult<undefined> {
    const s = this.pk(tableId);
    const seat = PK.seatOfPoker(s, PLAYER);
    if (seat < 0) return fail('你还没有入座');
    if (PK.handInProgress(s) && s.seats[seat].inHand) return fail('这一手结束后才能补码');
    // the finished hand must be booked before the stack changes
    if (s.phase === 'settled') this.collect(tableId);
    if (amount <= 0) return fail('请输入补码金额');
    if (amount > this.availableChips()) return fail('筹码不足，请先到兑换台换筹码');
    try {
      PK.topUp(s, seat, amount);
    } catch (e) {
      return fail((e as Error).message);
    }
    this.core.touch();
    return ok(undefined);
  }

  /** Deal the next hand (patrons come and go first). */
  pkDeal(tableId: string): CasinoResult<PK.PokerEvent[]> {
    const s = this.pk(tableId);
    if (PK.handInProgress(s)) return fail('这一手还没有结束');
    if (tableId === TOURNEY_HOST && this.core.tourney.running()) return fail('今晚这张桌要办锦标赛，现金局已经收了');
    this.pkManage(tableId);
    if (!PK.canStartHand(s)) return fail('等待更多玩家入座');
    const ev = PK.startHand(s);
    this.core.touch();
    return ok(ev);
  }

  /** Whose turn: 'player', a patron id, or null. */
  pkTurnOwner(tableId: string): string | null {
    const s = this.pk(tableId);
    if (!PK.handInProgress(s) || s.toAct < 0) return null;
    return s.seats[s.toAct].occupant;
  }

  /** A patron acts using only what they can see (own cards + public information). */
  pkPatronAct(tableId: string): CasinoResult<PK.PokerEvent[]> {
    const s = this.pk(tableId);
    const owner = this.pkTurnOwner(tableId);
    if (!owner || owner === PLAYER) return fail('不是 NPC 的回合');
    const seat = s.toAct;
    const view = PK.pokerView(s, seat);
    if (!view) return fail('现在不能行动');
    const p = this.patronById(owner);
    const tilt = p ? Math.max(0, Math.min(1, -p.mood / 60)) : 0;
    const action = decidePoker(view, this.pkPersona(p), tilt, this.crowdRng);
    let ev: PK.PokerEvent[];
    try {
      ev = PK.actPoker(s, seat, action);
    } catch {
      ev = PK.actPoker(s, seat, { type: view.toCall === 0 ? 'check' : 'fold' });
    }
    this.core.touch();
    return ok(ev);
  }

  pkPlayerAct(tableId: string, action: PK.PokerAction): CasinoResult<PK.PokerEvent[]> {
    const s = this.pk(tableId);
    const seat = PK.seatOfPoker(s, PLAYER);
    if (seat < 0 || this.pkTurnOwner(tableId) !== PLAYER) return fail('现在不是你的回合');
    try {
      const ev = PK.actPoker(s, seat, action);
      this.core.touch();
      return ok(ev);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** A complete hand among patrons at a table the player is not watching. */
  private playBackgroundPoker(tableId: string): void {
    if (tableId === TOURNEY_HOST && this.core.tourney.running()) return;
    const s = this.pk(tableId);
    // a hand the player was only watching when they walked away is finished first
    if (PK.handInProgress(s)) this.pkRunOut(tableId);
    this.pkManage(tableId);
    if (!PK.canStartHand(s)) return;
    PK.startHand(s);
    this.pkRunOut(tableId);
    this.collect(tableId);
    const last = s.history[s.history.length - 1];
    const top = last?.winners.slice().sort((a, b) => b.amount - a.amount)[0];
    if (top && last.pot >= s.rules.bigBlind * 20) {
      const who = s.seats[top.seat].occupant;
      const name = (who && this.patronById(who)?.name) ?? '牌手';
      this.core.bus.emit('casino:bgResult', { tableId, text: `${name} 赢下 ${formatG(top.amount, { compact: true })}${top.name ? `（${top.name}）` : ''}` });
    }
    PK.finishPokerHand(s);
  }

  // ------------------------------------------------------------ background tables

  /** While the player is in the casino, other tables keep playing real rounds. */
  tickBackground(minutes: number): void {
    if (!this.inCasino() || minutes <= 0) return;
    // deterministic cadence: other tables play on even minutes
    if (this.core.now() % 2 !== 0) return;
    for (const cfg of TABLES) {
      if (cfg.id === this.cs.activeTable) continue;
      if (this.patronsAt(cfg.id).length === 0) continue;
      if (!this.crowdRng.chance(0.6)) continue;
      try {
        this.playBackgroundRound(cfg);
      } catch (e) {
        console.warn('background round failed', cfg.id, e);
      }
    }
    for (const cfg of POKER_TABLES) {
      if (cfg.id === this.cs.activeTable || !this.crowdRng.chance(0.3)) continue;
      try {
        this.playBackgroundPoker(cfg.id);
      } catch (e) {
        console.warn('background poker hand failed', cfg.id, e);
      }
    }
    if (this.crowdRng.chance(0.25)) this.refreshCrowd();
  }

  private playBackgroundRound(cfg: TableConfig): void {
    if (cfg.game === 'blackjack') {
      const s = this.bj(cfg.id);
      if (s.phase === 'insurance' || s.phase === 'player') return;
      this.bjPatronBets(cfg.id);
      if (!BJ.canStartRound(s)) return;
      for (const p of this.patronsAt(cfg.id)) {
        const idx = BJ.seatOf(s, p.id);
        if (idx >= 0) p.bankroll -= s.seats[idx].pendingBet;
      }
      BJ.startRound(s);
      const phase = () => s.phase as BJ.BJPhase;
      if (phase() === 'insurance') BJ.closeInsurance(s);
      let guard = 0;
      while (phase() === 'player' && guard++ < 60) {
        const owner = this.bjTurnOwner(cfg.id);
        if (owner === PLAYER) break;
        this.bjPatronAct(cfg.id);
      }
      if (phase() === 'settled') {
        this.collect(cfg.id);
        BJ.finishRound(s);
      }
    } else if (cfg.game === 'baccarat') {
      const s = this.bac(cfg.id);
      this.bacPatronBets(cfg.id);
      if (s.bets.length === 0) return;
      for (const p of this.patronsAt(cfg.id)) p.bankroll -= BAC.ownerStake(s, p.id);
      BAC.dealCoup(s);
      this.collect(cfg.id);
      this.core.bus.emit('casino:bgResult', { tableId: cfg.id, text: s.last ? (s.last.winner === 'banker' ? '庄赢' : s.last.winner === 'player' ? '闲赢' : '和局') : '' });
      BAC.finishBacRound(s);
    } else {
      const s = this.rl(cfg.id);
      this.rlPatronBets(cfg.id);
      if (s.bets.length === 0) return;
      for (const o of RL.ownersBelowMinimum(s)) RL.clearRouletteBets(s, o);
      for (const p of this.patronsAt(cfg.id)) p.bankroll -= RL.ownerTotal(s, p.id);
      const out = RL.spinWheel(s);
      this.collect(cfg.id);
      this.core.bus.emit('casino:bgResult', { tableId: cfg.id, text: `${out.result} ${RL.numberColor(out.result) === 'red' ? '红' : RL.numberColor(out.result) === 'black' ? '黑' : '绿'}` });
      RL.clearRouletteRound(s);
    }
  }

  // ------------------------------------------------------------ misc

  dailyUpdate(): void {
    this.cs.heat = Math.max(0, this.cs.heat - 5);
    if (this.cs.barredBlackjack && this.core.state.player.flags.barredDay === undefined) this.core.state.player.flags.barredDay = this.core.today();
    const bd = Number(this.core.state.player.flags.barredDay ?? -1);
    if (this.cs.barredBlackjack && bd >= 0 && this.core.today() - bd >= 56) {
      this.cs.barredBlackjack = false;
      delete this.core.state.player.flags.barredDay;
      this.core.phone.send('casino', '灰港大赌场', '经过复核，您重新获准参与 21 点游戏。请遵守赌场规定。');
    }
  }

  /** Hours the player has spent in the casino in the last 7 days (for social consequences). */
  recentHours(days = 7): number {
    const since = this.core.now() - days * MINUTES_PER_DAY;
    let total = 0;
    for (const s of this.cs.stats.sessions) if (s.end >= since) total += (s.end - Math.max(s.start, since)) / 60;
    if (this.cs.session) total += (this.core.now() - Math.max(this.cs.session.start, since)) / 60;
    return total;
  }

  netLast(days: number): Money {
    const since = this.core.now() - days * MINUTES_PER_DAY;
    let total = this.cs.session ? this.cs.session.net : 0;
    for (const s of this.cs.stats.sessions) if (s.end >= since) total += s.net;
    return total;
  }
}
