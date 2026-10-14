import type { GameCore } from '../core/GameCore';
import { G, formatG } from '../core/money';
import { MINUTES_PER_DAY, formatClock, hm, toDate } from '../core/calendar';
import type { IsleState } from '../core/state';
import type { ActionResult } from './InventorySystem';
import { timeOfDay, type TimeOfDay } from './MarinaSystem';
import { ITEMS } from '../data/items';

import { ISLE, onIsle } from '../world/maps/isleLayout';

export { ISLE, onIsle };
export const ISLE_INTERIORS = ['isle_diner', 'isle_guesthouse', 'isle_resort'];

export function emptyIsle(): IsleState {
  return { room: null, crossings: 0, nights: 0, fishingDay: -1, fishingTrips: 0, fishingEarned: 0, swimDay: -1, loungerUntil: -1, breakfastDay: -1, visited: false };
}

// ------------------------------------------------------------------ the ferry

/** Forty minutes across the bay. */
export const FERRY_MINUTES = 40;
/**
 * One ferry shuttles across: departures from Greyhaven's pier and from
 * Whitestone's. Each crossing lands twenty minutes before the boat turns
 * round, and the last one back leaves at eight; she spends the night at
 * Greyhaven's pier.
 */
export const FERRY: Record<'city' | 'isle', number[]> = {
  city: [hm(7, 30), hm(10), hm(13), hm(16), hm(19)],
  isle: [hm(8, 30), hm(11), hm(14), hm(17), hm(20)],
};
/** Boarding opens twenty minutes before a departure and closes two minutes after. */
export const FERRY_BOARD = 20;
export const FERRY_LATE = 2;
export const FARES = { deck: G(25), lounge: G(80) } as const;
export type FareClass = keyof typeof FARES;

export interface CrossingReport {
  from: 'city' | 'isle';
  cls: FareClass;
  depart: number;
  arrive: number;
  waited: number;
  /** the people you know of who took the same boat */
  aboard: string[];
  card: { seed: number; tod: TimeOfDay; caption: string; boatsOut: boolean };
}

// ------------------------------------------------------------------ rooms

export const ROOMS = {
  guesthouse: { name: '海鸥民宿 · 小单间', price: G(120), where: 'isle_guesthouse', desc: '一张单人床、一把椅子和一扇小窗，干净，便宜。' },
  resort: { name: '白石湾度假酒店 · 海景房', price: G(980), where: 'isle_resort', desc: '阳台对着私人海滩，含早餐，可以用无边泳池和住客海滩。' },
  suite: { name: '白石湾度假酒店 · 灯塔套房', price: G(2600), where: 'isle_resort', desc: '顶层的转角套房，两面落地窗，看得见灯塔。含早餐，岛上最好睡的床。' },
} as const;
export type RoomKind = keyof typeof ROOMS;
/** Rooms are let until eleven the next morning. */
export const CHECKOUT = hm(11);

// ------------------------------------------------------------------ the beach and the boats

/** The lifeguard is on the public beach from nine to six; nobody swims outside those hours. */
export const LIFEGUARD = { from: hm(9), to: hm(18) };
export const LOUNGER = { price: G(30), minutes: 120 };
export const SWIM_MINUTES = 40;
/**
 * The co-op's boats take on hands at dawn, Monday to Saturday: they sail at
 * half past five and are back at half past two, a day at sea paid in cash.
 */
export const FISHING = { from: hm(4, 30), until: hm(5, 30), back: hm(14, 30), hours: 9, pay: G(240), minEnergy: 50, minSleep: 50, maxDrunk: 20 };

/** Are the co-op's boats in the harbour: at night, in the afternoon, and all of Sunday. */
export function boatsIn(t: number): boolean {
  const d = toDate(t);
  return d.weekday === 6 || d.minuteOfDay < FISHING.until || d.minuteOfDay >= FISHING.back;
}
/** The fish market on the quay opens when the boats are back, and there is none on Sunday. */
export const FISH_MARKET_HOURS = { from: FISHING.back, to: hm(18) };
export const SHACK_HOURS = { from: hm(10), to: hm(23) };

/** The next departure from this side that someone at the pier at time t can still board (absolute minutes). */
export function nextDeparture(side: 'city' | 'isle', t: number): number {
  const day = Math.floor(t / MINUTES_PER_DAY);
  const m = t - day * MINUTES_PER_DAY;
  const d = FERRY[side].find((x) => x + FERRY_LATE >= m);
  return d !== undefined ? day * MINUTES_PER_DAY + d : (day + 1) * MINUTES_PER_DAY + FERRY[side][0];
}

/** Where the one ferry is at a minute of the day (see FERRY). */
export function ferryAt(side: 'city' | 'isle', m: number): boolean {
  const gone = (d: number) => d + FERRY_LATE;
  if (side === 'isle') return FERRY.city.some((c, i) => m >= c + FERRY_MINUTES && m <= gone(FERRY.isle[i]));
  if (m <= gone(FERRY.city[0])) return true;
  return FERRY.isle.some((d, i) => m >= d + FERRY_MINUTES && (i + 1 >= FERRY.city.length || m <= gone(FERRY.city[i + 1])));
}

/**
 * Whitestone Bay, across the water from Greyhaven: the ferry over (deck seats
 * or the first-class lounge), a fishing village with a dawn fish market and
 * a diner, a cheap guesthouse, the public beach, and the resort on the point
 * with its pool and private beach for guests only; at dawn the co-op's boats
 * take on hands for a day at sea.
 */
export class IsleSystem {
  constructor(private core: GameCore) {}

  private get s(): IsleState {
    return this.core.state.isle!;
  }

  private minute(): number {
    return toDate(this.core.now()).minuteOfDay;
  }

  /** Which side of the bay the player is on. */
  side(): 'city' | 'isle' {
    return onIsle(this.core.state.world.location) ? 'isle' : 'city';
  }

  // ------------------------------------------------------------ the ferry

  /** The departure boarding now from this side, if any (minute of the day). */
  boarding(side = this.side()): number | null {
    const m = this.minute();
    return FERRY[side].find((d) => m >= d - FERRY_BOARD && m <= d + FERRY_LATE) ?? null;
  }

  /** The next departure from this side, today or tomorrow (absolute minutes). */
  nextFerry(side = this.side()): number {
    return nextDeparture(side, this.core.now());
  }

  /** Is the ferry at the pier on this side now: from her arrival there until she leaves? */
  ferryAt(side: 'city' | 'isle', t = this.core.now()): boolean {
    return ferryAt(side, toDate(t).minuteOfDay);
  }

  boardCheck(cls: FareClass, method: 'cash' | 'card'): string | null {
    const side = this.side();
    const d = this.boarding(side);
    if (d === null) {
      const n = this.nextFerry(side);
      const tomorrow = n >= (this.core.today() + 1) * MINUTES_PER_DAY;
      return `下一班 ${tomorrow ? '明天 ' : ''}${formatClock(toDate(n).minuteOfDay)} 开，开船前 ${FERRY_BOARD} 分钟开始检票。`;
    }
    const have = this.core.economy.balance(method === 'cash' ? 'cash' : 'bank');
    if (have < FARES[cls]) return `${cls === 'lounge' ? '头等舱' : '普通舱'}船票 ${formatG(FARES[cls])}，${method === 'cash' ? '现金' : '卡里的钱'}不够`;
    return null;
  }

  /** Buy a ticket, wait on board for the departure, and cross: forty minutes on the water. */
  cross(cls: FareClass, method: 'cash' | 'card'): { ok: true; report: CrossingReport } | { ok: false; error: string } {
    const err = this.boardCheck(cls, method);
    if (err) return { ok: false, error: err };
    const core = this.core;
    const from = this.side();
    const dep = this.boarding(from)!;
    const r = core.economy.spend(method === 'cash' ? 'cash' : 'bank', FARES[cls], 'transport', `灰港—白石湾渡轮：${from === 'city' ? '去程' : '回程'}${cls === 'lounge' ? '头等舱' : '普通舱'}`, 'ferry');
    if (!r.ok) return { ok: false, error: r.error };
    const start = core.now();
    const waited = Math.max(0, dep - this.minute());
    const boat = Math.floor(start / MINUTES_PER_DAY) * MINUTES_PER_DAY + dep;
    core.advance(waited + FERRY_MINUTES, 'idle');
    // whoever else took this boat
    const aboard = Object.values(core.state.npcs)
      .filter((n) => n.travel?.boat === boat && onIsle(n.travel.from) === (from === 'isle'))
      .map((n) => n.id);
    const pl = core.player;
    if (cls === 'lounge') {
      pl.change('mood', 4);
      pl.change('stress', -4);
      pl.change('energy', 3);
    } else {
      pl.change('mood', 2);
      pl.change('stress', -2);
    }
    this.s.crossings++;
    const toIsle = from === 'city';
    if (toIsle && !this.s.visited) {
      this.s.visited = true;
      core.journal.add('life', '第一次坐渡轮去了海湾对面的白石湾。', true);
    }
    const tod = timeOfDay(start + waited + FERRY_MINUTES / 2);
    const lounge = cls === 'lounge';
    const boatsOut = !boatsIn(start + waited + FERRY_MINUTES);
    const caption = toIsle
      ? lounge
        ? '头等舱的窗边，侍应端来一杯咖啡。白石湾的灯塔从雾里慢慢露出来，岬角上是度假酒店白色的房子。'
        : tod === 'night'
          ? '甲板上风很大。前面是白石湾的灯塔，一亮一灭。'
          : boatsOut
            ? '甲板上的长椅坐满了拎着行李的人。白石湾的灯塔越来越近，远处的海面上，渔船还在拉网。'
            : '甲板上的长椅坐满了拎着鱼篓和行李的人。白石湾的灯塔越来越近，渔港里的渔船都靠在岸边。'
      : lounge
        ? '头等舱里很安静。灰港的塔楼和赌场的穹顶一点点变大。'
        : tod === 'night'
          ? '回程的船上没几个人。灰港的灯火铺满了整片海岸。'
          : '回程的甲板上，有人在打瞌睡，有人拎着一袋海鲜。灰港的天际线越来越近。';
    return {
      ok: true,
      report: { from, cls, depart: dep, arrive: core.now(), waited, aboard, card: { seed: (core.state.meta.seed * 17 + start) >>> 0, tod, caption, boatsOut } },
    };
  }

  // ------------------------------------------------------------ rooms

  /** How restful the bed is: the guesthouse's is lumpy, the resort's are not. */
  comfort(): number {
    const r = this.room();
    return r?.kind === 'suite' ? 0.45 : r?.kind === 'resort' ? 0.35 : -0.05;
  }

  /** The resort's gate opens for guests (whoever holds a room there tonight). */
  resortAccess(): string | null {
    const r = this.room();
    return r && ROOMS[r.kind].where === 'isle_resort' ? null : '侍应生客气地拦住了你：「泳池和海滩是住客专享的，入住手续在大堂前台办理。」';
  }

  /** The room the player holds now, if any (it lapses at checkout). */
  room(): IsleState['room'] {
    const r = this.s.room;
    if (r && this.core.now() >= r.until) this.s.room = null;
    return this.s.room;
  }

  /** Book tonight: until eleven tomorrow (or this morning, booked after midnight). */
  checkIn(kind: RoomKind, method: 'cash' | 'card'): ActionResult {
    const def = ROOMS[kind];
    if (this.core.state.world.location !== def.where) return { ok: false, error: '要在前台办理入住' };
    const cur = this.room();
    if (cur) return { ok: false, error: `你已经订了${ROOMS[cur.kind].name}` };
    const r = this.core.economy.spend(method === 'cash' ? 'cash' : 'bank', def.price, 'lodging', `白石湾住宿：${def.name}`, kind === 'guesthouse' ? 'isle_guesthouse' : 'isle_resort');
    if (!r.ok) return { ok: false, error: r.error };
    const m = this.minute();
    const day = this.core.today() + (m >= CHECKOUT ? 1 : 0);
    this.s.room = { kind, until: day * MINUTES_PER_DAY + CHECKOUT, paid: def.price };
    this.s.nights++;
    if (kind !== 'guesthouse') this.core.social.witness({ kind: 'flashy_purchase', facets: { wealthDisplay: kind === 'suite' ? 0.9 : 0.4 }, importance: kind === 'suite' ? 24 : 12, data: { item: def.name, amount: def.price } });
    this.core.touch();
    return { ok: true, message: `${def.name}，${formatG(def.price)}。房间留到明天 ${formatClock(CHECKOUT)}。` };
  }

  /** Whether the bed in this building is yours tonight. */
  canSleep(location: string): string | null {
    const r = this.room();
    if (!r || ROOMS[r.kind].where !== location) return location === 'isle_resort' ? '这是酒店的客房，先到前台办理入住。' : '这间房没有订，先找老板娘登记。';
    return null;
  }

  /** The resort's breakfast, for guests, once a morning. */
  breakfast(): ActionResult {
    const r = this.room();
    if (!r || ROOMS[r.kind].where !== 'isle_resort') return { ok: false, error: '早餐只对住客供应' };
    const m = this.minute();
    if (m < hm(7) || m > hm(10, 30)) return { ok: false, error: '早餐 7:00–10:30 供应' };
    if (this.s.breakfastDay === this.core.today()) return { ok: false, error: '今天的早餐已经吃过了' };
    this.s.breakfastDay = this.core.today();
    this.core.advance(40, 'eating');
    this.core.player.change('hunger', -55);
    this.core.player.change('mood', 8);
    this.core.player.change('stress', -4);
    return { ok: true, message: '露台上的自助早餐：现煎的蛋卷、热带水果和刚出炉的可颂。海风把餐巾吹了起来。' };
  }

  // ------------------------------------------------------------ the beach

  lifeguardOn(): boolean {
    const m = this.minute();
    return m >= LIFEGUARD.from && m < LIFEGUARD.to;
  }

  /** A lounger and an umbrella on the public beach for two hours. */
  rentLounger(): ActionResult {
    if (!this.lifeguardOn()) return { ok: false, error: `躺椅 ${formatClock(LIFEGUARD.from)}–${formatClock(LIFEGUARD.to)} 出租` };
    const r = this.core.economy.spend('cash', LOUNGER.price, 'entertainment', '白石湾海滩：躺椅和遮阳伞（2 小时）', 'isle_beach');
    if (!r.ok) return { ok: false, error: `躺椅和遮阳伞 ${formatG(LOUNGER.price)}，只收现金` };
    this.core.advance(LOUNGER.minutes, 'idle');
    const pl = this.core.player;
    pl.change('stress', -10);
    pl.change('mood', 6);
    pl.change('energy', 4);
    return { ok: true, message: '你在遮阳伞下躺了两个小时。海浪一阵一阵地来，旁边一家人在堆沙堡。' };
  }

  /** In the sea from the public beach, while the lifeguard is on. */
  swim(): ActionResult {
    const s = this.core.state.player.stats;
    if (!this.lifeguardOn()) return { ok: false, error: `救生员 ${formatClock(LIFEGUARD.to)} 下班了，现在不能下水。` };
    if (s.drunk >= 30) return { ok: false, error: '救生员吹了哨子：「喝了酒的不能下水！」' };
    if (s.energy < 20) return { ok: false, error: '你太累了，游不动。' };
    this.s.swimDay = this.core.today();
    this.core.advance(SWIM_MINUTES, 'exercising');
    const pl = this.core.player;
    pl.change('energy', -10);
    pl.change('hunger', 8);
    pl.change('mood', 8);
    pl.change('stress', -8);
    pl.change('health', 1);
    pl.addSkill('fitness', 1, 60);
    return { ok: true, message: '海水有点凉，游开了就好了。你游到浮标那里再游回来，躺在沙滩上晒干。' };
  }

  /** The resort's own beach and pool: for guests only, the loungers come with towels. */
  guestBeach(what: 'beach' | 'pool'): ActionResult {
    const r = this.room();
    if (!r || ROOMS[r.kind].where !== 'isle_resort') return { ok: false, error: '住客专享。服务生客气地拦住了你。' };
    const m = this.minute();
    if (m < hm(7) || m >= hm(22)) return { ok: false, error: '泳池和海滩 7:00–22:00 开放' };
    const pl = this.core.player;
    if (what === 'pool') {
      this.core.advance(45, 'exercising');
      pl.change('mood', 7);
      pl.change('stress', -7);
      pl.change('energy', -4);
      return { ok: true, message: '无边泳池的水和海连成一片。你游了几个来回，服务生在池边放了一杯冰水。' };
    }
    this.core.advance(LOUNGER.minutes, 'idle');
    pl.change('stress', -14);
    pl.change('mood', 8);
    pl.change('energy', 5);
    return { ok: true, message: '住客海滩上只有几张躺椅。毛巾是热的，饮料单夹在伞柄上。你睡着了一会儿。' };
  }

  // ------------------------------------------------------------ the fishing boats

  fishingOffer(): { ok: boolean; ends: number; reason?: string; clash?: string } {
    const now = this.core.now();
    const d = toDate(now);
    const ends = this.core.today() * MINUTES_PER_DAY + FISHING.back;
    const no = (reason: string) => ({ ok: false, ends, reason });
    if (d.weekday === 6) return no('礼拜天渔船不出海。');
    if (this.s.fishingDay === this.core.today()) return no('今天已经跟船出过海了。');
    if (d.minuteOfDay < FISHING.from) return no(`船老大还没来，${formatClock(FISHING.from)} 开始招人。`);
    if (d.minuteOfDay > FISHING.until) return no(`船都开走了。明天 ${formatClock(FISHING.from)}–${formatClock(FISHING.until)} 再来。`);
    const s = this.core.state.player.stats;
    if (s.drunk >= FISHING.maxDrunk) return no('船老大闻了闻：「喝了酒的上船要出人命的。」');
    if (s.energy < FISHING.minEnergy || s.sleep < FISHING.minSleep) return no('船老大看了你一眼：「一天九个钟头拉网，你这样撑不住。」');
    const clash = this.core.career.agenda().find((a) => a.status !== 'leave' && a.start < ends && a.end > now);
    return { ok: true, ends, clash: clash ? `${clash.employer}的班（${formatClock(toDate(clash.start).minuteOfDay)}–${formatClock(toDate(clash.end).minuteOfDay)}）` : undefined };
  }

  /** A day at sea on a co-op boat: hauling nets for nine hours, paid in cash, a fish to take home. */
  goFishing(): ActionResult {
    const o = this.fishingOffer();
    if (!o.ok) return { ok: false, error: o.reason ?? '' };
    const core = this.core;
    this.s.fishingDay = core.today();
    core.social.witness({ kind: 'fishing_labor', facets: { diligence: 0.5, crisis: 0.15 }, importance: 10 });
    // on board until she sails, then nine hours at sea
    core.advance(FISHING.back - this.minute(), 'working');
    const pl = core.player;
    const first = this.s.fishingTrips === 0;
    pl.change('energy', -30);
    pl.change('hunger', 15);
    pl.change('stress', first ? 10 : 4);
    pl.change('mood', first ? -4 : 2);
    pl.addSkill('fitness', 2, 70);
    this.s.fishingTrips++;
    this.s.fishingEarned += FISHING.pay;
    core.economy.receive('cash', FISHING.pay, 'salary', '白石湾渔业合作社：跟船出海一天', 'isle_coop');
    core.inventory.give(ITEMS.isle_fish, 1);
    core.journal.add('work', `跟白石湾的渔船出海 ${FISHING.hours} 小时，拿到 ${formatG(FISHING.pay)} 现金和一条鱼。`);
    return {
      ok: true,
      message: first
        ? `天还没亮船就出了港。你吐了两次，手被网绳磨破了，还是跟着把网一网一网拉了上来。回港的时候船老大塞给你 ${formatG(FISHING.pay)} 和一条鱼：「第一次都这样。」`
        : `你跟着船出海拉了一天网，收成还不错。船老大点了 ${formatG(FISHING.pay)} 现金给你，又挑了一条鱼让你带回去。`,
    };
  }

  // ------------------------------------------------------------ the lighthouse

  lighthouse(): ActionResult {
    this.core.advance(20, 'idle');
    this.core.player.change('stress', -6);
    this.core.player.change('mood', 4);
    const night = timeOfDay(this.core.now()) === 'night';
    return {
      ok: true,
      message: night
        ? '灯塔的光一圈圈扫过海面。对岸的灰港亮成一条线，赌场的穹顶是其中最亮的一点。'
        : '从岬角上看得见整个海湾：脚下是渔港，远处是灰港，渡轮在两边之间慢慢地走。',
    };
  }

  /** Is the fish market on: from when the boats are back until six, Monday to Saturday? */
  marketOpen(): boolean {
    const d = toDate(this.core.now());
    return d.weekday !== 6 && d.minuteOfDay >= FISH_MARKET_HOURS.from && d.minuteOfDay < FISH_MARKET_HOURS.to;
  }

  shackOpen(): boolean {
    const m = this.minute();
    return m >= SHACK_HOURS.from && m < SHACK_HOURS.to;
  }

  /** Every minute: the room lapses at checkout. */
  tickMinute(now: number): void {
    const r = this.s.room;
    if (r && now >= r.until) {
      this.s.room = null;
      if (onIsle(this.core.state.world.location)) this.core.phone.send('isle', '白石湾', `${ROOMS[r.kind].name}已经退房了。`);
    }
  }
}

