import type { GameCore } from '../core/GameCore';
import { G, formatG, mulRatio, type Money } from '../core/money';
import { MINUTES_PER_DAY, daylight, formatClock, hm, toDate } from '../core/calendar';
import type { MarinaState } from '../core/state';
import { NPC_BY_ID } from '../data/npcs';
import type { ActionResult } from './InventorySystem';

export function emptyMarina(): MarinaState {
  return { owned: null, boughtDay: -1, booking: null, cruises: 0, charters: 0, trips: 0 };
}

/** The harbour cruise leaves from the pier four times a day. */
export const CRUISES: { at: number; price: Money; name: string }[] = [
  { at: hm(11), price: G(60), name: '上午航班' },
  { at: hm(14), price: G(60), name: '下午航班' },
  { at: hm(17), price: G(60), name: '日落航班' },
  { at: hm(19, 30), price: G(90), name: '夜游航班' },
];
export const CRUISE_MINUTES = 90;
/** Boarding opens half an hour before a departure and closes five minutes after. */
export const BOARD_BEFORE = 30;
export const BOARD_AFTER = 5;

/** A private charter of the club's sailing yacht, with captain and crew. */
export const CHARTER = { price: G(3200), minutes: 180, guests: 3 };
/** The club's own boat, the one you charter. */
export const CLUB_BOAT = '信天翁号';
/** Departure slots for charters and for parties on your own boat. */
export const SLOTS = [hm(10), hm(14), hm(18)];
/** How long the guests wait on the pier before the party is off. */
export const WAIT = 60;
/** Guests set out early enough to be on the pier by the time boarding opens, half an hour before (a walk across town takes up to 40 minutes). */
export const COME_EARLY = 75;
/** A trip on your own boat without guests. */
export const ALONE_MINUTES = 120;

export interface YachtDef {
  id: 'seagull' | 'aurora';
  name: string;
  model: string;
  price: Money;
  /** berth and crew, billed on the first of the month */
  monthly: Money;
  /** fuel for an outing */
  fuel: Money;
  guests: number;
  /** what a broker would get for it (share of the price) */
  resale: number;
}

export const YACHTS: Record<'seagull' | 'aurora', YachtDef> = {
  seagull: { id: 'seagull', name: '海鸥号', model: 'Seagull 42 帆船', price: G(1280000), monthly: G(14000), fuel: G(600), guests: 4, resale: 0.7 },
  aurora: { id: 'aurora', name: '极光号', model: 'Aurora 68 机动游艇', price: G(4600000), monthly: G(38000), fuel: G(1500), guests: 8, resale: 0.7 },
};
export const BROKER_BP = 500;

/** What each of them says when asked out on the water. */
const ANSWERS: Record<string, { yes: (core: GameCore) => boolean; line: string; no: string; aboard: string[] }> = {
  daniel: { yes: () => true, line: '游艇？你小子发了啊。行，我去。', no: '', aboard: ['开这么快干嘛，我的早饭要出来了。', '……说真的，替你高兴。'] },
  eileen: { yes: () => true, line: '……好吧，就这一次。我还没坐过游艇呢。', no: '', aboard: ['风好大，好舒服。', '从这里看过去，老城区好小。'] },
  kiki: { yes: () => true, line: '真的吗？！我要拍好多照片！', no: '', aboard: ['快帮我拍一张！要有天际线的！', '这张发出去，办公室的人要羡慕死了。'] },
  marco: { yes: () => true, line: '上船！今天不谈赌场，只谈风景。', no: '', aboard: ['要是天天能这样，谁还去赌场啊。', '这船多少钱？……算了，别告诉我。'] },
  tommy: { yes: () => true, line: '我带吉他。', no: '', aboard: ['（汤米在船尾弹起了一首老歌。）', '海上的回声真好听。'] },
  oldzhou: { yes: () => true, line: '我在码头干了一辈子，坐游艇出海倒是头一回。', no: '', aboard: ['那边就是 7 号码头，我在那儿扛了三十年货。', '年轻人，海上的日子，比岸上长。'] },
  margaret: { yes: () => false, line: '', no: '我这把年纪，一上船就晕。你们年轻人去吧。', aboard: [] },
  ben: { yes: (core) => toDate(core.now()).weekday === 0, line: '礼拜一店里休息，我去！我带点心。', no: '店里走不开，下次挑礼拜一吧。', aboard: ['尝尝这个，我早上现做的。'] },
  lillian: { yes: () => true, line: '亲爱的，我最喜欢海上的落日了。记得准备香槟。', no: '', aboard: ['香槟再开一瓶吧。', '你知道吗，惠特莫尔家的船比这个大一倍。不过你的客人更有意思。'] },
  alexander: { yes: (core) => core.social.rel('alexander').affection >= 40, line: '我自己的船就停在南边的泊位。……不过，好吧，我来。', no: '我家的船比这个大。下次吧。', aboard: ['帆再收一点，风向要变了。', '你开得不错。'] },
  sophia: { yes: () => true, line: '偶尔放松一下也是投资。', no: '', aboard: ['我算过，包一次船够请一个实习生一个月。不过今天不算账。'] },
  grace: { yes: () => true, line: '银行的同事知道了一定羡慕我。', no: '', aboard: ['我已经很久没有不看邮件过一个下午了。'] },
  isabella: { yes: () => true, line: '那我要穿那条白裙子。', no: '', aboard: ['海风把头发都吹乱了……没关系，好看就行。'] },
  raymond: { yes: () => true, line: '和下属一起……也不是不行。就当团建。', no: '', aboard: ['这周的报表，周一再说。'] },
  victor: { yes: () => false, line: '', no: '我得在赌场招待客人。祝你们玩得愉快。', aboard: [] },
  natasha: { yes: () => false, line: '', no: '我要上班。替我看看海。', aboard: [] },
  jack: { yes: () => false, line: '', no: '我值班。', aboard: [] },
};

export type TripKind = 'cruise' | 'charter' | 'own';
export type CardScene = 'skyline' | 'open_sea' | 'homecoming';
export type TimeOfDay = 'day' | 'dusk' | 'night';
/** the deck in the photos: the tour boat's rail, a sailing yacht's teak, a motor yacht's aft sofa */
export type BoatModel = 'tour' | 'sail' | 'motor';

export interface TripReport {
  kind: TripKind;
  minutes: number;
  /** the boat you were on */
  boat: string;
  model: BoatModel;
  guests: { id: string; name: string; line: string }[];
  /** the trip's postcards: the harbour as you left it, out on the water, and coming home, each in the light of its hour */
  cards: { seed: number; scene: CardScene; tod: TimeOfDay; party: boolean; caption: string }[];
  summary: string;
  /** what the time on the water did for you */
  effects: { mood: number; stress: number; social: number };
}

/** The light of a moment, the way a photo shows it (dawn counts as golden hour too). */
export function timeOfDay(t: number): TimeOfDay {
  const dl = daylight(t);
  if (dl < 0.2) return 'night';
  if (dl < 0.92) return 'dusk';
  return 'day';
}

/** Where guests wait on the pier: by the club's boat for a charter, by your own berth for a party on your boat. */
export const CHARTER_SPOTS = ['marina_c1', 'marina_c2', 'marina_c3'];
export const OWN_SPOTS = ['marina_o1', 'marina_o2', 'marina_o3', 'marina_o4', 'marina_o5', 'marina_o6', 'marina_o7', 'marina_o8'];
export const GUEST_SPOTS = [...CHARTER_SPOTS, ...OWN_SPOTS];
const WAITING = '在码头等着上船';
const ABOARD = '在船上';
const LANDED = '刚下船';

/**
 * The Greyhaven Marina on the river: the public harbour cruise, private
 * charters of the club's yacht, and owning a yacht of your own (berth and
 * crew billed monthly, fuel per outing, a broker to sell it).
 */
export class MarinaSystem {
  constructor(private core: GameCore) {}

  private get s(): MarinaState {
    return this.core.state.marina!;
  }

  ownedDef(): YachtDef | null {
    return this.s.owned ? YACHTS[this.s.owned] : null;
  }

  /** The yacht at its resale value (net worth). */
  value(): Money {
    const y = this.ownedDef();
    return y ? mulRatio(y.price, Math.round(y.resale * 100), 100) : 0;
  }

  // ------------------------------------------------------------ the harbour cruise

  /** The departure you can board now, if any. */
  boardingCruise(): (typeof CRUISES)[number] | null {
    const m = toDate(this.core.now()).minuteOfDay;
    return CRUISES.find((c) => m >= c.at - BOARD_BEFORE && m <= c.at + BOARD_AFTER) ?? null;
  }

  nextCruise(): (typeof CRUISES)[number] | null {
    const m = toDate(this.core.now()).minuteOfDay;
    return CRUISES.find((c) => c.at - BOARD_BEFORE > m) ?? null;
  }

  /** The tour boat is away from the pier between a departure and its return. */
  tourBoatOut(t = this.core.now()): boolean {
    const m = toDate(t).minuteOfDay;
    return CRUISES.some((c) => m > c.at + BOARD_AFTER && m < c.at + CRUISE_MINUTES);
  }

  private cruiseError(method: 'cash' | 'card'): string | null {
    const c = this.boardingCruise();
    if (!c) {
      const n = this.nextCruise();
      return n ? `下一班 ${formatClock(n.at)}，开船前半小时开始登船。` : '今天的游船都开走了，明天 11:00 有第一班。';
    }
    const have = this.core.economy.balance(method === 'cash' ? 'cash' : 'bank');
    if (have < c.price) return `船票 ${formatG(c.price)}，${method === 'cash' ? '现金' : '卡里的钱'}不够`;
    return null;
  }

  /** Buy a ticket for the departure that is boarding. */
  buyCruise(method: 'cash' | 'card'): ActionResult {
    const err = this.cruiseError(method);
    if (err) return { ok: false, error: err };
    const c = this.boardingCruise()!;
    const r = this.core.economy.spend(method === 'cash' ? 'cash' : 'bank', c.price, 'entertainment', `灰港游船：${c.name}`, 'marina');
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, message: `${c.name}，${formatG(c.price)}。请从栈桥登船。` };
  }

  // ------------------------------------------------------------ charters and parties

  /** Friends you could ask aboard. */
  invitable(): string[] {
    return Object.keys(ANSWERS).filter((id) => {
      const r = this.core.social.rel(id);
      return r.met && r.familiarity >= 20 && r.affection >= 15 && r.status !== 'estranged';
    });
  }

  /** The next departure slots (today if there is still an hour to go, else tomorrow). */
  slots(): number[] {
    const now = this.core.now();
    const day = this.core.today();
    const out: number[] = [];
    for (let d = day; d <= day + 1; d++) for (const s of SLOTS) if (d * MINUTES_PER_DAY + s >= now + 60) out.push(d * MINUTES_PER_DAY + s);
    return out.slice(0, 4);
  }

  /** Book the club's yacht (or take your own out) at a slot and ask friends along. */
  book(kind: 'charter' | 'own', at: number, guests: string[], method: 'cash' | 'card' = 'card'): { ok: true; answers: { id: string; name: string; yes: boolean; line: string }[]; message: string } | { ok: false; error: string } {
    if (this.s.booking) return { ok: false, error: '你已经约了一次出海' };
    if (!this.slots().includes(at)) return { ok: false, error: '这个时间不能出发' };
    const own = this.ownedDef();
    if (kind === 'own' && !own) return { ok: false, error: '你还没有自己的船' };
    const max = kind === 'own' ? own!.guests : CHARTER.guests;
    const can = new Set(this.invitable());
    const list = [...new Set(guests)].filter((g) => can.has(g));
    if (list.length > max) return { ok: false, error: `船上最多带 ${max} 位客人` };
    const cost = kind === 'own' ? own!.fuel : CHARTER.price;
    const r = this.core.economy.spend(method === 'cash' ? 'cash' : 'bank', cost, kind === 'own' ? 'vehicle' : 'entertainment', kind === 'own' ? `${own!.name}：出海燃油与餐饮` : `灰港游艇会：${CLUB_BOAT}包船出海（含船长、船员和香槟）`, 'marina');
    if (!r.ok) return { ok: false, error: r.error };
    const answers = list.map((id) => {
      const a = ANSWERS[id];
      const yes = a.yes(this.core);
      return { id, name: NPC_BY_ID[id].name, yes, line: yes ? a.line : a.no };
    });
    const going = answers.filter((a) => a.yes);
    const spots = kind === 'own' ? OWN_SPOTS : CHARTER_SPOTS;
    going.forEach((g, i) => this.core.npcs.setOverrideAt(g.id, at - COME_EARLY, COME_EARLY + WAIT, 'city', spots[i], 'leisure', WAITING));
    this.s.booking = { at, kind, guests: going.map((g) => g.id), paid: cost };
    const when = `${at >= (this.core.today() + 1) * MINUTES_PER_DAY ? '明天' : '今天'} ${formatClock(toDate(at).minuteOfDay)}`;
    this.core.phone.send('marina', '灰港游艇会', `已为您预留${kind === 'own' ? `${own!.name}的出海` : `${CLUB_BOAT}包船`}：${when} 从游艇会栈桥出发，${going.length ? `${going.map((g) => g.name).join('、')}会在码头等您。` : '共一人。'}请提前到场。`);
    this.core.touch();
    return { ok: true, answers, message: `${when}出发。` };
  }

  /**
   * Call the trip off. In good time (three hours or more before) the club
   * refunds most of a charter and the fuel is not bought yet; later than that
   * the money is gone, and friends already on their way are put out.
   */
  cancel(): ActionResult {
    const b = this.s.booking;
    if (!b) return { ok: false, error: '没有预约' };
    const early = b.at - this.core.now() >= 3 * 60;
    const refund = early ? (b.kind === 'own' ? b.paid : mulRatio(b.paid, 80, 100)) : 0;
    for (const id of b.guests) {
      const rt = this.core.state.npcs[id];
      if (!rt) continue;
      rt.overrides = rt.overrides.filter((o) => o.reason !== WAITING);
      if (!early) this.core.social.applyDirect(id, { kind: 'stood_up', facets: { unreliability: 0.3 }, importance: 10, data: { event: '出海' } }, { silent: true });
    }
    if (refund > 0) this.core.economy.receive('bank', refund, 'other', b.kind === 'own' ? '取消出海：燃油退回' : `取消${CLUB_BOAT}包船：退还 80%`, 'marina');
    this.s.booking = null;
    this.core.touch();
    const told = b.guests.length ? `已经告诉了${b.guests.map((g) => NPC_BY_ID[g]?.name ?? g).join('、')}。` : '';
    return { ok: true, message: refund > 0 ? `出海取消了，退回 ${formatG(refund)}。${told}` : `出海取消了。离出发不到三个小时，费用不退。${told}` };
  }

  /** Whether the booked party can sail now (from half an hour before the slot until the guests give up). */
  canSail(): string | null {
    const b = this.s.booking;
    if (!b) return '没有预约';
    const now = this.core.now();
    if (now < b.at - 30) return `还没到时间，${formatClock(toDate(b.at).minuteOfDay)} 出发，提前半小时可以登船`;
    if (now > b.at + WAIT) return '客人已经走了';
    return null;
  }

  /** Who is waiting on the pier for the booked trip. */
  waiting(): string[] {
    const b = this.s.booking;
    if (!b) return [];
    return b.guests.filter((id) => this.core.state.npcs[id]?.location === 'city' && !this.core.state.npcs[id]?.travel && GUEST_SPOTS.includes(String(this.core.state.npcs[id]?.spot)));
  }

  /** Booked guests who are not on the pier yet. */
  late(): string[] {
    const here = new Set(this.waiting());
    return (this.s.booking?.guests ?? []).filter((id) => !here.has(id));
  }

  /** Go out alone on your own boat, now. */
  canGoAlone(): string | null {
    const own = this.ownedDef();
    if (!own) return '你还没有自己的船';
    const m = toDate(this.core.now()).minuteOfDay;
    if (m < hm(8) || m > hm(20)) return '船员只在 8:00–20:00 出海';
    if (this.s.booking) return '你已经约了一次出海';
    if (this.core.economy.balance('bank') < own.fuel) return `燃油要 ${formatG(own.fuel)}`;
    return null;
  }

  /** What would stop you sailing now, if anything (checked before the walk to the boat). */
  boardCheck(kind: TripKind, method: 'cash' | 'card' = 'cash'): string | null {
    if (kind === 'cruise') return this.cruiseError(method);
    const b = this.s.booking;
    if (kind === 'own' && !b) return this.canGoAlone();
    if (!b) return '没有预约';
    if (b.kind !== kind) return b.kind === 'own' ? `你约的是自己的船，${this.ownedDef()?.name ?? ''}停在 C 泊位` : `你约的是${CLUB_BOAT}包船`;
    return this.canSail();
  }

  /** Which boat a trip of this kind is on now. */
  boatName(kind: TripKind): string {
    if (kind === 'cruise') return '灰港游船';
    if (kind === 'charter' || this.s.booking?.kind === 'charter') return CLUB_BOAT;
    return this.ownedDef()?.name ?? CLUB_BOAT;
  }

  // ------------------------------------------------------------ the trip itself

  /** Out on the water: time passes, everyone has a good afternoon, and you come back to the pier. */
  sail(kind: TripKind, method: 'cash' | 'card' = 'cash'): { ok: true; report: TripReport } | { ok: false; error: string } {
    const core = this.core;
    const err = this.boardCheck(kind, method);
    if (err) return { ok: false, error: err };
    const boat = this.boatName(kind);
    const model: BoatModel = kind === 'cruise' ? 'tour' : (kind === 'own' || this.s.booking?.kind === 'own') && this.s.owned === 'aurora' ? 'motor' : 'sail';
    const start = core.now();
    let guests: string[] = [];
    let minutes = CRUISE_MINUTES;
    const alone = kind === 'own' && !this.s.booking;
    if (kind === 'cruise') {
      const c = this.boardingCruise()!;
      const r = this.buyCruise(method);
      if (!r.ok) return r;
      // on board early, you wait on deck until she casts off
      minutes = c.at + CRUISE_MINUTES - toDate(start).minuteOfDay;
      this.s.cruises++;
    } else if (alone) {
      const own = this.ownedDef()!;
      const r = core.economy.spend('bank', own.fuel, 'vehicle', `${own.name}：出海燃油`, 'marina');
      if (!r.ok) return { ok: false, error: r.error };
      minutes = ALONE_MINUTES;
    } else {
      const b = this.s.booking!;
      guests = this.waiting();
      // the boat leaves at its time: board early and you wait on deck for the others
      minutes = Math.max(b.at, start) + CHARTER.minutes - start;
      if (b.kind === 'charter') this.s.charters++;
      for (const id of this.late()) {
        // left on the pier: they hear the horn from the street
        core.state.npcs[id].overrides = core.state.npcs[id].overrides.filter((o) => o.reason !== WAITING);
        core.social.applyDirect(id, { kind: 'stood_up', facets: { unreliability: 0.4 }, importance: 16, data: { event: '出海' } });
      }
      this.s.booking = null;
    }
    this.s.trips++;
    const pl = core.player;
    const party = guests.length > 0;
    const effects = { mood: party ? 14 : kind === 'cruise' ? 8 : 10, stress: party ? -14 : kind === 'cruise' ? -10 : -12, social: party ? 25 : kind === 'cruise' ? 6 : 0 };
    pl.change('mood', effects.mood);
    pl.change('stress', effects.stress);
    pl.change('social', effects.social);
    pl.addMoodBuff('sea', party ? 6 : 4, 10 * 60, '在海上待了一个下午');
    const lines: TripReport['guests'] = [];
    for (const id of guests) {
      const a = ANSWERS[id];
      const rt = core.state.npcs[id];
      core.social.applyDirect(id, { kind: 'yacht_trip', facets: { generosity: 0.6, wealthDisplay: 0.4, intimacy: 0.3 }, importance: 26 }, { source: 'witnessed', silent: true });
      rt.mood = Math.min(100, rt.mood + 15);
      lines.push({ id, name: NPC_BY_ID[id].name, line: a.aboard[(core.today() + id.length) % a.aboard.length] ?? '' });
      // aboard: nowhere on the map until the boat is back
      rt.overrides = rt.overrides.filter((o) => o.reason !== WAITING);
      core.npcs.setOverrideAt(id, start, minutes, null, null, 'leisure', ABOARD);
      rt.location = null;
      rt.spot = null;
      rt.travel = null;
      rt.activity = 'leisure';
    }
    core.advance(minutes, 'idle');
    // back on the pier together; they linger a moment before going their way
    const spots = kind === 'own' ? OWN_SPOTS : CHARTER_SPOTS;
    guests.forEach((id, i) => {
      const rt = core.state.npcs[id];
      rt.overrides = rt.overrides.filter((o) => o.reason !== ABOARD);
      const spot = spots[i % spots.length];
      core.npcs.setOverrideAt(id, core.now(), 15, 'city', spot, 'leisure', LANDED);
      rt.location = 'city';
      rt.spot = spot;
      rt.travel = null;
    });
    const seed = (core.state.meta.seed * 31 + start) >>> 0;
    const mid = start + Math.round(minutes / 2);
    const end = core.now();
    const tod = [timeOfDay(start), timeOfDay(mid), timeOfDay(end)];
    const first = lines[0];
    const cards: TripReport['cards'] = [
      {
        seed,
        scene: 'skyline',
        tod: tod[0],
        party,
        caption: tod[0] === 'night' ? '船驶出港口，灰港的灯火在身后连成一片。' : '船驶出港口，赌场的塔楼和天际大厦在身后慢慢变小。',
      },
      {
        seed: seed + 1,
        scene: 'open_sea',
        tod: tod[1],
        party,
        caption: party
          ? `你们在甲板上喝香槟、吹海风。${first ? `${first.name}说：「${first.line}」` : ''}`
          : kind === 'cruise'
            ? '游船绕过灯塔，广播里在讲灰港航运的历史。旁边一家人在分一袋薯片。'
            : '你把手机调成静音，躺在甲板上看云。',
      },
      {
        seed: seed + 2,
        scene: 'homecoming',
        tod: tod[2],
        party,
        caption: tod[2] === 'night' ? '回港的时候已经很晚了，码头的灯一盏盏亮着。' : tod[2] === 'dusk' ? '回港的时候太阳斜了，河面上全是碎金。' : '回港的时候，码头上已经有下一拨人在排队了。',
      },
    ];
    // the time under way (waiting on deck for the departure is not part of it)
    const hours = (alone ? ALONE_MINUTES : CHARTER.minutes) / 60;
    const summary =
      kind === 'cruise'
        ? `坐了一趟港湾游船（${CRUISE_MINUTES} 分钟）。`
        : party
          ? `坐${boat}带着${lines.map((l) => l.name).join('、')}出海 ${hours} 小时。`
          : `坐${boat}一个人出海 ${hours} 小时。`;
    core.journal.add('life', summary, party);
    return { ok: true, report: { kind, minutes, boat, model, guests: lines, cards, summary, effects } };
  }

  /** Every minute: a reminder an hour before; guests who waited for nothing go home and remember it. */
  tickMinute(now: number): void {
    const b = this.s.booking;
    if (!b) return;
    if (!b.reminded && now >= b.at - 60 && now < b.at) {
      b.reminded = true;
      const who = b.guests.length ? `${b.guests.map((g) => NPC_BY_ID[g]?.name ?? g).join('、')}快到码头了。` : '';
      this.core.phone.send('marina', '灰港游艇会', `提醒：您的出海 ${formatClock(toDate(b.at).minuteOfDay)} 从游艇会栈桥出发（河滨步道，灰港大酒店东边）。${who}`);
    }
    if (now <= b.at + WAIT) return;
    for (const id of b.guests) {
      this.core.social.applyDirect(id, { kind: 'missed_party', facets: { unreliability: 0.7, rudeness: 0.3 }, importance: 24, data: { event: '出海' } });
    }
    if (b.guests.length) this.core.journal.add('social', `约好了出海却没去，${b.guests.map((g) => NPC_BY_ID[g]?.name ?? g).join('、')}在码头白等了一个小时。`, true);
    this.s.booking = null;
  }

  // ------------------------------------------------------------ owning a boat

  buy(id: 'seagull' | 'aurora'): ActionResult {
    if (this.s.owned) return { ok: false, error: '你已经有一条船了，先卖掉它' };
    const y = YACHTS[id];
    const r = this.core.economy.spend('bank', y.price, 'vehicle', `灰港游艇会：购入${y.name}（${y.model}）`, 'marina');
    if (!r.ok) return { ok: false, error: r.error };
    this.s.owned = id;
    this.s.boughtDay = this.core.today();
    this.core.social.witness({ kind: 'flashy_purchase', facets: { wealthDisplay: 1.2 }, importance: 40, data: { item: y.name, amount: y.price } });
    this.core.journal.add('milestone', `买下了自己的游艇：${y.name}（${y.model}），${formatG(y.price)}。`, true);
    this.core.touch();
    return { ok: true, message: `${y.name}是你的了，停在游艇会的 C 泊位。泊位和船员每月 ${formatG(y.monthly)}，每月 1 日出账单。` };
  }

  /** Price a broker gets for it, after commission. */
  sellPrice(): Money {
    const v = this.value();
    return v - mulRatio(v, BROKER_BP, 10000);
  }

  sell(): ActionResult {
    const y = this.ownedDef();
    if (!y) return { ok: false, error: '你没有船' };
    if (this.s.booking?.kind === 'own') return { ok: false, error: '还有一次约好的出海' };
    const price = this.sellPrice();
    this.s.owned = null;
    this.core.economy.receive('bank', price, 'item_sale', `游艇经纪：出售${y.name}（扣除 ${BROKER_BP / 100}% 佣金）`, 'marina');
    this.core.journal.add('money', `卖掉了${y.name}，到手 ${formatG(price)}。`, true);
    this.core.touch();
    return { ok: true, message: `${y.name}卖掉了，${formatG(price)} 已转入银行账户。` };
  }

  /** The first of the month: berth and crew. */
  monthlyBills(): void {
    const y = this.ownedDef();
    if (!y) return;
    this.core.economy.issueBill('other', 'marina', '灰港游艇会', y.monthly, 10, `${y.name}：泊位与船员（月）`);
  }
}
