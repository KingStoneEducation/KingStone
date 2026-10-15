import type { GameCore } from '../core/GameCore';
import { MINUTES_PER_DAY, toDate } from '../core/calendar';
import { formatG, type Money } from '../core/money';
import { hashString, type Rng } from '../core/rng';
import type { TourneyEntrant, TourneyState } from '../core/state';
import * as PK from '../casino/PokerEngine';
import { decidePoker, POKER_STYLES, type PokerStyleId } from '../casino/pokerAI';
import { generatePatron, uniqueName } from '../casino/patrons';
import { LEVELS, TOURNEY, TOURNEY_TABLE, levelRules, tchips, tourneyPrizes } from '../casino/tournament';
import { NPC_BY_ID } from '../data/npcs';
import { onIsle } from '../world/maps/isleLayout';
import { NPC_POKER } from './CasinoManager';

const PLAYER = 'player';
/** The reason on a regular's schedule while they are in the tournament. */
export const TOURNEY_OVERRIDE = '扑克锦标赛';

export type TourneyResult<T = undefined> = { ok: true; value: T; message?: string } | { ok: false; error: string };
const ok = <T>(value: T, message?: string): TourneyResult<T> => ({ ok: true, value, message });
const fail = (error: string): TourneyResult<never> => ({ ok: false, error });

/** A roll from the day and the person, so who enters does not depend on anything else that happened. */
function roll(key: string): number {
  return (hashString(key) % 10000) / 10000;
}

function pickStyle(rng: Rng): PokerStyleId {
  return rng.weighted<PokerStyleId>(['tight', 'loose', 'aggressive', 'passive', 'bluffer', 'tilter'], (s) => ({ tight: 0.22, loose: 0.22, aggressive: 0.14, passive: 0.2, bluffer: 0.1, tilter: 0.12 })[s]);
}

/**
 * The Sunday night tournament (see casino/tournament.ts). Registration opens at the poker room at
 * 17:00; the regulars who can afford it put their names down (and pay, out of their own money);
 * at 19:00 walk-ins fill the table and the cards go in the air. While the player sits at the table
 * the hands are dealt there; otherwise they go on without them, a hand every few minutes, and a
 * player who is registered but away has their hands folded for them (the blinds are still paid).
 * The last two share the buy-ins, in real money. The 1/2 cash table is closed meanwhile.
 */
export class TournamentSystem {
  constructor(private core: GameCore) {}

  private get cs() {
    return this.core.state.casino;
  }

  /** Tonight's tournament: open for names, running, or (until the next one) the last one's result. */
  current(): TourneyState | null {
    return this.cs.tourney ?? null;
  }

  running(): TourneyState | null {
    const t = this.cs.tourney;
    return t?.status === 'running' ? t : null;
  }

  /** The game being dealt, while it runs. */
  table(): PK.PokerState | null {
    return this.running()?.table ?? null;
  }

  /** The table as it stands, running or just finished (for the view). */
  view(): PK.PokerState | null {
    return this.cs.tourney?.table ?? null;
  }

  entrant(id: string): TourneyEntrant | undefined {
    return this.cs.tourney?.entrants.find((e) => e.id === id);
  }

  /** The player has a place in tonight's tournament (and it is not over). */
  registered(): boolean {
    const t = this.cs.tourney;
    return !!t && t.status !== 'done' && t.entrants.some((e) => e.id === PLAYER);
  }

  /** Still in with chips (or waiting for the start). */
  alive(id = PLAYER): boolean {
    const t = this.cs.tourney;
    const e = this.entrant(id);
    return !!t && t.status !== 'done' && !!e && e.place === undefined;
  }

  /** A named regular is playing in it right now (so they do not also sit at a cash table). */
  playing(npcId: string): boolean {
    return this.alive(`npc:${npcId}`);
  }

  /** Who is left, and the seat each sits in. */
  seatOf(id: string): number {
    const s = this.table();
    return s ? PK.seatOfPoker(s, id) : -1;
  }

  /** The player is at the tournament table. */
  seated(): boolean {
    return !!this.running()?.seated;
  }

  blinds(t = this.cs.tourney): [number, number] {
    const [sb, bb] = LEVELS[Math.min(t?.level ?? 0, LEVELS.length - 1)];
    return [sb, bb];
  }

  /** Hands left at this level before the blinds go up. */
  handsToNextLevel(t = this.cs.tourney): number {
    return Math.max(0, TOURNEY.handsPerLevel - (t?.handsAtLevel ?? 0));
  }

  left(t = this.cs.tourney): TourneyEntrant[] {
    return t ? t.entrants.filter((e) => e.place === undefined) : [];
  }

  // ------------------------------------------------------------ the evening

  /** Every minute: registration opens, the cards go in the air, and hands go on while the player is away. */
  tickMinute(now: number): void {
    const d = toDate(now);
    const t = this.cs.tourney;
    if (d.weekday === TOURNEY.weekday && d.minuteOfDay >= TOURNEY.opens && d.minuteOfDay < TOURNEY.starts && (!t || t.day !== d.dayIndex)) this.open(d.dayIndex);
    const cur = this.cs.tourney;
    if (!cur) return;
    if (cur.status === 'open' && (cur.day < d.dayIndex || d.minuteOfDay >= TOURNEY.starts)) this.start();
    // nobody can sit at the table from outside the casino
    if (cur.seated && this.core.state.world.location !== 'casino') this.leaveSeat();
    if (cur.status === 'running' && !cur.seated && now - cur.lastHandAt >= TOURNEY.minutesPerHand) this.backgroundHand(now);
  }

  /** Names go down from 17:00. The regulars who can afford it, and feel like it tonight, come and pay. */
  private open(day: number): void {
    const seq = (this.cs.tourneySeq ?? 0) + 1;
    this.cs.tourneySeq = seq;
    const t: TourneyState = { id: seq, day, status: 'open', buyIn: TOURNEY.buyIn, fee: TOURNEY.fee, entrants: [], table: null, level: 0, handsAtLevel: 0, prizes: [], seated: false, lastHandAt: 0 };
    this.cs.tourney = t;
    for (const [npc, how] of Object.entries(NPC_POKER)) {
      // one seat stays for the player
      if (t.entrants.length >= TOURNEY.seats - 1) break;
      const rt = this.core.state.npcs[npc];
      const def = NPC_BY_ID[npc];
      if (!rt || !def || rt.flags.inCrisis || Number(rt.flags.noGambleUntil ?? -1) >= day) continue;
      if (onIsle(rt.location) || rt.money < (t.buyIn + t.fee) * 4) continue;
      const keen = 0.4 + def.traits.gamblingView * 0.3 + (how.style === 'loose' || how.style === 'aggressive' ? 0.1 : 0);
      if (roll(`${npc}|${day}|tourney`) >= keen) continue;
      rt.money -= t.buyIn + t.fee;
      t.entrants.push({ id: `npc:${npc}`, name: def.name, npc, style: how.style });
      this.core.npcs.setOverrideAt(npc, day * MINUTES_PER_DAY + TOURNEY.starts - 20, 6 * 60, 'casino', `poker_rail${t.entrants.length}`, 'tourney', TOURNEY_OVERRIDE);
    }
    this.core.touch();
  }

  /** Put your name down at the poker room: the buy-in and the fee. */
  register(): TourneyResult {
    const t = this.cs.tourney;
    const today = this.core.today();
    if (!t || t.status !== 'open' || t.day !== today) return fail('现在没有可以报名的锦标赛（每周日 17:00 起报名，19:00 开赛）');
    if (t.entrants.some((e) => e.id === PLAYER)) return fail('你已经报过名了');
    if (this.core.state.world.location !== 'casino') return fail('要在赌场的扑克室报名');
    if (t.entrants.length >= TOURNEY.seats) return fail('名额已满');
    const cost = t.buyIn + t.fee;
    const r = this.core.economy.pay(cost, 'casino_bet', '周日锦标赛报名（买入 + 服务费）', `casino:${TOURNEY_TABLE}`, ['cash', 'bank']);
    if (!r.ok) return fail(`报名要 ${formatG(cost)}：${r.error}`);
    t.entrants.push({ id: PLAYER, name: '你', style: 'player' });
    this.core.journal.add('casino', `报名了周日扑克锦标赛（买入 ${formatG(t.buyIn)} + 服务费 ${formatG(t.fee)}）。`);
    this.core.touch();
    return ok(undefined, `报名成功。19:00 开赛，到时候请到 1/2 桌入座。`);
  }

  /** Take your name off before the start: the money comes back. */
  unregister(): TourneyResult {
    const t = this.cs.tourney;
    if (!t || t.status !== 'open' || !t.entrants.some((e) => e.id === PLAYER)) return fail('你没有报名');
    if (this.core.state.world.location !== 'casino') return fail('要在扑克室取消报名');
    t.entrants = t.entrants.filter((e) => e.id !== PLAYER);
    this.core.economy.receive('cash', t.buyIn + t.fee, 'casino_payout', '周日锦标赛取消报名退款', `casino:${TOURNEY_TABLE}`);
    this.core.journal.add('casino', '取消了周日锦标赛的报名，报名费退回了。');
    this.core.touch();
    return ok(undefined, '已取消报名，钱退给你了。');
  }

  /** 19:00: walk-ins take the empty seats and the first hand is dealt (here or in the background). */
  private start(): void {
    const t = this.cs.tourney!;
    const rng = this.core.rng;
    const taken = new Set(t.entrants.map((e) => e.name));
    for (let n = 1; t.entrants.length < TOURNEY.seats; n++) {
      const p = generatePatron(`t${t.id}-${n}`, rng, 'main', 'poker', this.core.now());
      uniqueName(p, taken, rng);
      taken.add(p.name);
      t.entrants.push({ id: p.id, name: p.name, look: p.look, style: pickStyle(rng) });
    }
    const s = PK.createPokerTable(TOURNEY_TABLE, levelRules(0), `${this.core.state.meta.seed}|tourney|${t.id}`);
    const order = rng.shuffle([...t.entrants]);
    order.forEach((e, i) => PK.sitPoker(s, i, e.id, TOURNEY.startStack));
    s.button = rng.int(0, TOURNEY.seats - 1);
    t.table = s;
    t.status = 'running';
    t.prizes = tourneyPrizes(t.entrants.length, t.buyIn);
    t.level = 0;
    t.handsAtLevel = 0;
    t.seated = false;
    t.lastHandAt = this.core.now();
    if (this.registered() && this.core.state.world.location !== 'casino') {
      this.core.phone.send('casino', '灰港大赌场', '周日锦标赛已经开赛。您不在座位上时，每一手牌都会替您弃掉，盲注照常扣除。', undefined, `tourney:start:${t.id}`);
    }
    this.core.touch();
  }

  // ------------------------------------------------------------ hands

  /** Between hands: who is out, whether it is over, and the blinds. False once it is over. */
  private between(t: TourneyState): boolean {
    const s = t.table!;
    if (s.phase === 'settled') PK.finishPokerHand(s);
    // out of chips: when two go in the same hand, the one who started it with more finishes higher
    const busted = s.seats
      .map((st, i) => ({ st, i }))
      .filter((x) => x.st.occupant && x.st.stack <= 0)
      .sort((a, b) => a.st.startStack - b.st.startStack);
    const winner = this.lastWinner(s);
    for (const b of busted) {
      const e = this.entrant(b.st.occupant!)!;
      e.place = this.left(t).length;
      e.outBy = winner ?? undefined;
      PK.leavePoker(s, b.i);
      this.onOut(t, e);
    }
    if (this.left(t).length <= 1) {
      this.finish(t);
      return false;
    }
    if (t.handsAtLevel >= TOURNEY.handsPerLevel) {
      t.level = Math.min(t.level + 1, LEVELS.length - 1);
      t.handsAtLevel = 0;
      const r = levelRules(t.level);
      s.rules.smallBlind = r.smallBlind;
      s.rules.bigBlind = r.bigBlind;
    }
    return true;
  }

  /** Who took the biggest share of the last pot. */
  private lastWinner(s: PK.PokerState): string | null {
    const last = s.history[s.history.length - 1];
    const top = last?.winners.slice().sort((a, b) => b.amount - a.amount)[0];
    return top?.who ?? null;
  }

  /** Deal the next hand at the table the player is sitting at. */
  deal(): TourneyResult<PK.PokerEvent[]> {
    const t = this.running();
    if (!t?.table) return fail('锦标赛没有在进行');
    const s = t.table;
    if (PK.handInProgress(s)) return fail('这一手还没有结束');
    if (!this.between(t)) return fail('锦标赛结束了');
    t.handsAtLevel += 1;
    const ev = PK.startHand(s);
    this.core.touch();
    return ok(ev);
  }

  /** Between hands at the table: the out are out and the blinds are what they are about to be. */
  manage(): void {
    const t = this.running();
    if (!t?.table || PK.handInProgress(t.table)) return;
    this.between(t);
    this.core.touch();
  }

  turnOwner(): string | null {
    const s = this.table();
    if (!s || !PK.handInProgress(s) || s.toAct < 0) return null;
    return s.seats[s.toAct].occupant;
  }

  /** Someone else acts on what they can see; a player who is away checks if they can, else folds. */
  npcAct(): TourneyResult<PK.PokerEvent[]> {
    const s = this.table();
    const owner = this.turnOwner();
    if (!s || !owner) return fail('现在没有人需要行动');
    const seat = s.toAct;
    const t = this.running()!;
    if (owner === PLAYER) {
      if (t.seated) return fail('轮到你了');
      const legal = PK.legalPokerActions(s, seat);
      return ok(PK.actPoker(s, seat, { type: legal?.check ? 'check' : 'fold' }));
    }
    const view = PK.pokerView(s, seat);
    if (!view) return fail('现在不能行动');
    const e = this.entrant(owner);
    const persona = POKER_STYLES[(e?.style as PokerStyleId) ?? 'tight'] ?? POKER_STYLES.tight;
    const action = decidePoker(view, persona, 0, this.core.rng);
    let ev: PK.PokerEvent[];
    try {
      ev = PK.actPoker(s, seat, action);
    } catch {
      ev = PK.actPoker(s, seat, { type: view.toCall === 0 ? 'check' : 'fold' });
    }
    this.core.touch();
    return ok(ev);
  }

  playerAct(action: PK.PokerAction): TourneyResult<PK.PokerEvent[]> {
    const s = this.table();
    if (!s || this.turnOwner() !== PLAYER) return fail('现在不是你的回合');
    try {
      const ev = PK.actPoker(s, PK.seatOfPoker(s, PLAYER), action);
      this.core.touch();
      return ok(ev);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The finished hand's change to the player's stack, for the table (tournament chips; no money moves). */
  handResult(): { net: number } | null {
    const s = this.table();
    if (!s || s.phase !== 'settled') return null;
    const seat = PK.seatOfPoker(s, PLAYER);
    if (seat < 0 || !s.seats[seat].inHand) return null;
    return { net: PK.handDelta(s, seat) };
  }

  /** The rest of a hand with nobody waiting on the player. */
  private runOut(): void {
    const s = this.table();
    for (let guard = 0; s && guard < 400 && PK.handInProgress(s); guard++) {
      const r = this.npcAct();
      if (!r.ok) {
        const legal = PK.legalPokerActions(s, s.toAct);
        PK.actPoker(s, s.toAct, { type: legal?.check ? 'check' : 'fold' });
      }
    }
  }

  /** A hand while the player is away from the table (or out, or not in it). */
  private backgroundHand(now: number): void {
    const t = this.running();
    if (!t?.table) return;
    t.lastHandAt = now;
    const s = t.table;
    if (PK.handInProgress(s)) this.runOut();
    if (!this.between(t)) return;
    t.handsAtLevel += 1;
    PK.startHand(s);
    this.runOut();
    // the out get up right away, so the floor shows who is left
    this.between(t);
    this.core.touch();
  }

  /** Everything that is left, at once (the player went home, or the night is over). */
  runToEnd(): void {
    const t = this.running();
    if (!t) return;
    t.seated = false;
    for (let guard = 0; guard < 3000 && t.status === 'running'; guard++) this.backgroundHand(this.core.now());
  }

  /** The player sits down at the tournament table (or stands at the rail to watch it, if not in it). */
  sit(): TourneyResult {
    const t = this.running();
    if (!t) return fail(this.cs.tourney?.status === 'open' ? `锦标赛 ${Math.floor(TOURNEY.starts / 60)}:00 开赛` : '现在没有锦标赛');
    if (this.core.state.world.location !== 'casino') return fail('锦标赛在赌场的扑克室');
    t.seated = true;
    this.core.touch();
    return ok(undefined);
  }

  /**
   * Away from the table whatever is going on (the view was closed on them: carried home, a door, a
   * collapse). The game goes on without them; a hand they are in is folded for them.
   */
  leaveSeat(): void {
    const t = this.cs.tourney;
    if (!t || !t.seated) return;
    t.seated = false;
    t.lastHandAt = this.core.now();
    this.core.touch();
  }

  /** Get up from the table: only between hands, or after folding (the hand is then played out). */
  standUp(): TourneyResult {
    const t = this.running();
    if (!t?.table) {
      if (this.cs.tourney) this.cs.tourney.seated = false;
      return ok(undefined);
    }
    const s = t.table;
    const me = PK.seatOfPoker(s, PLAYER);
    if (me >= 0 && PK.handInProgress(s) && s.seats[me].inHand && !s.seats[me].folded) return fail('请先打完这一手（或者弃牌）');
    t.seated = false;
    if (PK.handInProgress(s)) this.runOut();
    if (s.phase === 'settled') this.between(t);
    t.lastHandAt = this.core.now();
    this.core.touch();
    return ok(undefined);
  }

  // ------------------------------------------------------------ out, and the end

  private onOut(t: TourneyState, e: TourneyEntrant): void {
    if (e.npc) {
      const rt = this.core.state.npcs[e.npc];
      // done for the night: off home (or wherever the evening takes them)
      if (rt) rt.overrides = rt.overrides.filter((o) => o.reason !== TOURNEY_OVERRIDE);
      if (e.outBy === PLAYER) this.core.social.applyDirect(e.npc, { kind: 'knocked_me_out', facets: { success: 0.3 }, importance: 8 }, { silent: true });
    }
    if (e.id === PLAYER && e.place! > t.prizes.length) {
      this.core.journal.add('casino', `周日锦标赛：你在第 ${e.place} 名出局（共 ${t.entrants.length} 人）。`);
      this.core.bus.emit('tourney:out', { place: e.place! });
    }
  }

  private finish(t: TourneyState): void {
    const winner = this.left(t)[0];
    if (winner) {
      winner.place = 1;
      winner.outBy = undefined;
    }
    for (const e of t.entrants) {
      if (!e.place || e.place > t.prizes.length) continue;
      e.prize = t.prizes[e.place - 1];
      if (e.id === PLAYER) this.core.economy.receive('cash', e.prize, 'casino_payout', `周日锦标赛第 ${e.place} 名奖金`, `casino:${TOURNEY_TABLE}`);
      else if (e.npc) {
        const rt = this.core.state.npcs[e.npc];
        if (rt) rt.money += e.prize;
        this.core.social.npcEvent(e.npc, 'npc_big_win', { amount: e.prize - t.buyIn - t.fee });
      }
    }
    for (const e of t.entrants) {
      const rt = e.npc ? this.core.state.npcs[e.npc] : undefined;
      if (rt) rt.overrides = rt.overrides.filter((o) => o.reason !== TOURNEY_OVERRIDE);
    }
    t.status = 'done';
    t.seated = false;
    const me = t.entrants.find((e) => e.id === PLAYER);
    const second = t.entrants.find((e) => e.place === 2);
    const log = (this.cs.tourneyLog ??= []);
    log.push({ day: t.day, entrants: t.entrants.length, winner: winner?.name ?? '', second: second?.name ?? '', playerPlace: me?.place, playerPrize: me?.prize });
    if (log.length > 8) log.shift();
    if (me) {
      const prize = me.prize ?? 0;
      this.core.casino.recordTournament(t.buyIn + t.fee, prize);
      if (me.place === 1) {
        this.core.journal.add('casino', `周日扑克锦标赛夺冠！奖金 ${formatG(prize)}。`, true);
        this.core.social.broadcastEvent('tourney_win', { amount: prize, at: t.entrants.flatMap((e) => (e.npc ? [e.npc] : [])).join(',') });
      } else if (prize > 0) this.core.journal.add('casino', `周日扑克锦标赛：你拿到第 ${me.place} 名，奖金 ${formatG(prize)}。冠军是${winner?.name ?? '别人'}。`, true);
      else this.core.journal.add('casino', `周日扑克锦标赛结束了，冠军是${winner?.name ?? '别人'}。`);
      if (this.core.state.world.location !== 'casino') {
        this.core.phone.send('casino', '灰港大赌场', prize > 0 ? `周日锦标赛结束：您获得第 ${me.place} 名，奖金 ${formatG(prize)}。` : `周日锦标赛结束：您获得第 ${me.place} 名。冠军是${winner?.name ?? '别人'}。`, undefined, `tourney:end:${t.id}`);
      }
    }
    this.core.bus.emit('tourney:done', { winner: winner?.name ?? '', playerPlace: me?.place ?? 0, prize: me?.prize ?? 0 });
    this.core.touch();
  }

  /** What the table looks like in words (for the rail, the phone, the poker room's board). */
  describe(): string {
    const t = this.cs.tourney;
    if (!t) return '';
    if (t.status === 'open') return `报名中：已有 ${t.entrants.length}/${TOURNEY.seats} 人`;
    if (t.status === 'running') {
      const [sb, bb] = this.blinds(t);
      const me = t.table ? PK.seatOfPoker(t.table, PLAYER) : -1;
      return `第 ${t.level + 1} 级 · 盲注 ${sb}/${bb} · 还剩 ${this.left(t).length} 人${me >= 0 ? ` · 你的筹码 ${tchips(t.table!.seats[me].stack)}` : ''}`;
    }
    const w = t.entrants.find((e) => e.place === 1);
    return `已结束：冠军 ${w?.name ?? ''}`;
  }

  /** Prize for a place in tonight's tournament (0 if unpaid). */
  prizeFor(place: number): Money {
    return this.cs.tourney?.prizes[place - 1] ?? 0;
  }
}
