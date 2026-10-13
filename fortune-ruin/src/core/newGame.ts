import { G } from './money';
import { Rng } from './rng';
import { GAME_START_MINUTES, MINUTES_PER_DAY } from './calendar';
import { SAVE_VERSION, type Appearance, type BackgroundId, type GameState, type PersonalityTendency, type RelDims } from './state';
import { NPCS } from '../data/npcs';
import { initialNpcRuntime } from '../systems/NPCManager';
import { emptyBelief, emptyRelationship, initialTies } from '../systems/SocialSystem';
import { emptyFlow } from '../systems/EconomySystem';
import { initialMarket } from '../systems/MarketSystem';
import { BASE_IMPULSIVITY } from '../systems/PlayerSystem';
import { GameCore } from './GameCore';

export interface NewGameOptions {
  name: string;
  appearance: Appearance;
  personality: PersonalityTendency;
  background: BackgroundId;
  seed?: number;
}

export const BACKGROUNDS: Record<BackgroundId, { name: string; desc: string }> = {
  local: { name: '本地普通家庭', desc: '在老城区长大，丹尼尔是你的发小，房东玛格丽特看着你长大。' },
  newcomer: { name: '外来打工者', desc: '三年前只身来到灰港。人脉不多，但吃得了苦，工作上手快。' },
  graduate: { name: '大学毕业生', desc: '刚从灰港大学毕业，懂一点理财，背着一笔不大的助学贷款。' },
  restart: { name: '东山再起', desc: '曾经创业失败。信用记录有污点，但见过世面，也懂人情世故。' },
};

export const PERSONALITIES: Record<PersonalityTendency, { name: string; desc: string }> = {
  cautious: { name: '谨慎', desc: '不容易冲动，压力来时更容易焦虑。' },
  bold: { name: '大胆', desc: '自信、敢冒险，也更容易上头。' },
  sociable: { name: '外向', desc: '擅长与人相处，社交能力更强。' },
  rational: { name: '理性', desc: '理财能力较好，冲动程度最低。' },
};

export function createNewGameState(opts: NewGameOptions): GameState {
  const seed = opts.seed ?? (Math.floor(Math.random() * 2 ** 31) >>> 0);
  const rng = new Rng(seed);
  const start = GAME_START_MINUTES;
  const day = Math.floor(start / MINUTES_PER_DAY);

  const skills = { work: 15, finance: 8, social: 12, fitness: 15, service: 5, cards: 5 };
  let credit = 690;
  if (opts.background === 'local') skills.social += 4;
  if (opts.background === 'newcomer') {
    skills.work += 5;
    skills.service += 8;
  }
  if (opts.background === 'graduate') skills.finance += 10;
  if (opts.background === 'restart') {
    skills.finance += 6;
    skills.social += 6;
    skills.cards += 8;
    credit = 615;
  }
  if (opts.personality === 'sociable') skills.social += 8;
  if (opts.personality === 'rational') skills.finance += 6;

  const state: GameState = {
    meta: { version: SAVE_VERSION, seed, createdReal: Date.now(), savedReal: 0, playMs: 0, saveLabel: '' },
    rng: rng.getState(),
    time: { minutes: start },
    player: {
      name: opts.name.trim() || '无名氏',
      appearance: opts.appearance,
      personality: opts.personality,
      background: opts.background,
      stats: {
        energy: 82,
        hunger: 28,
        sleep: 88,
        stress: 22,
        mood: 58,
        confidence: opts.personality === 'bold' ? 62 : opts.personality === 'cautious' ? 44 : 52,
        impulsivity: BASE_IMPULSIVITY[opts.personality],
        social: 60,
        health: 92,
        drunk: 0,
      },
      skills,
      outfit: 'outfit_casual',
      reputation: { social: 0, casino: 0, trust: opts.background === 'restart' ? 2 : 10 },
      creditScore: credit,
      lastMealAt: start - 12 * 60,
      lastSleepAt: start - 30,
      awakeSince: start - 30,
      vehicle: null,
      moodBuffs: [],
      flags: {},
    },
    world: { location: 'home_basic', x: -1, y: -1, facing: 'down', cityReturn: null, visited: { home_basic: 1 } },
    economy: {
      accounts: { cash: G(1000), bank: G(19000), chips: 0 },
      ledger: [],
      seq: 0,
      externalIn: { cash: 0, bank: 0, chips: 0 },
      externalOut: { cash: 0, bank: 0, chips: 0 },
      initial: { cash: G(1000), bank: G(19000), chips: 0 },
      lifetimeByCat: {},
      today: emptyFlow(day),
      history: [],
      loans: [],
      bills: [],
      billSeq: 0,
      atmDay: day,
      atmWithdrawn: 0,
      holdings: {},
      receivables: [],
      autopay: true,
      stakes: [],
    },
    inventory: { items: { meal_basic: 3, chocolate: 1 }, outfits: ['outfit_casual', 'outfit_hoodie'] },
    housing: {
      homeId: 'home_basic',
      tenure: 'rent',
      rent: G(1450),
      leaseStartDay: day - 200,
      owned: [],
      furniture: { home_basic: [] },
      pendingRent: null,
      overdueDays: 0,
      evictionNoticeDay: null,
      guestsHosted: 0,
    },
    career: {
      jobs: [
        {
          jobId: 'office_clerk',
          level: 0,
          performance: 62,
          hiredDay: day - 120,
          shifts: 60,
          lates: 2,
          absences: 0,
          warnings: 0,
          lastShiftDay: day - 3,
          accrued: G(1100),
          nextPayDay: day + 4,
          workedToday: -1,
          status: 'active',
          promotionsDeclined: 0,
        },
      ],
      history: [],
      applications: [],
    },
    casino: {
      membership: { tier: 'visitor', points: 0, lifetimePoints: 0, lifetimeHandle: 0, lifetimeTheo: 0, joinedDay: day, lastVisitDay: -99, visits: 0, tierReviewDay: day },
      tables: {},
      patrons: [],
      patronSeq: 0,
      session: null,
      stats: {
        byGame: {
          blackjack: { rounds: 0, wagered: 0, net: 0 },
          baccarat: { rounds: 0, wagered: 0, net: 0 },
          roulette: { rounds: 0, wagered: 0, net: 0 },
          poker: { rounds: 0, wagered: 0, net: 0 },
          slots: { rounds: 0, wagered: 0, net: 0 },
        },
        biggestWin: 0,
        biggestLoss: 0,
        sessions: [],
        lossStreak: 0,
        winStreak: 0,
      },
      heat: 0,
      countSamples: [],
      barredBlackjack: false,
      bannedUntil: 0,
      comps: 0,
      securityCheckedDay: -1,
      hostOffers: [],
      creditLine: 0,
      jackpot: G(25000),
      paidRounds: {},
      activeTable: null,
      invites: { highLimit: -1, vip: -1 },
    },
    npcs: Object.fromEntries(NPCS.map((d) => [d.id, initialNpcRuntime(d)])),
    social: { rel: {}, memories: [], memSeq: 0, beliefs: {}, ties: initialTies(), encounters: [], encSeq: 0, pairDay: {} },
    events: { cooldown: {}, count: {}, scheduled: [], seq: 0, lastDailyCheck: -1, marketShock: 0 },
    phone: { messages: [], seq: 0 },
    journal: { entries: [], seq: 0 },
    stats: { days: [], peakNetWorth: G(20000), lowestNetWorth: G(20000), milestones: {}, lifeEvents: [] },
    market: initialMarket(rng.nextU32()),
    stories: { active: [], done: [], ended: {} },
  };

  // relationships
  for (const d of NPCS) {
    const r = emptyRelationship();
    const init = { ...d.initial };
    if (opts.background === 'local') {
      if (d.id === 'daniel') {
        init.affection = (init.affection ?? 0) + 10;
        init.familiarity = (init.familiarity ?? 0) + 10;
      }
      if (d.id === 'margaret') init.trust = (init.trust ?? 0) + 10;
    }
    if (opts.background === 'newcomer' && d.id === 'daniel') {
      // a coworker-turned-friend rather than a childhood friend
      init.familiarity = 45;
      init.affection = 40;
    }
    for (const k of ['affection', 'trust', 'respect', 'attraction', 'envy', 'dependency', 'fear', 'familiarity'] as (keyof RelDims)[]) {
      if (init[k] !== undefined) r[k] = init[k] as number;
    }
    r.met = init.met ?? false;
    r.knowsName = init.knowsName ?? false;
    r.status = init.status ?? 'stranger';
    if (r.met) r.lastContact = start - 2 * MINUTES_PER_DAY;
    state.social.rel[d.id] = r;
    state.social.beliefs[d.id] = emptyBelief();
  }
  // people who know you have a rough idea of your circumstances
  for (const id of ['daniel', 'eileen', 'margaret', 'raymond', 'kiki']) {
    state.social.beliefs[id].wealth = { estimate: G(15000), confidence: 0.3, t: start, basis: 'acquaintance' };
    state.social.beliefs[id].knowsJob = 'office_clerk';
  }
  state.social.beliefs.margaret.knowsHome = 'home_basic';

  if (opts.background === 'graduate') {
    state.economy.loans.push({
      id: 'L0',
      lender: 'bank',
      lenderName: '灰港储蓄信托（助学贷款）',
      principal: G(6000),
      balance: G(6000),
      aprBp: 350,
      termMonths: 36,
      monthlyPayment: Math.ceil((G(6000) * (0.035 / 12)) / (1 - Math.pow(1 + 0.035 / 12, -36))),
      nextDueDay: day + 14,
      paymentsMade: 4,
      missedPayments: 0,
      startDay: day - 112,
      status: 'active',
      kind: 'personal',
    });
  }
  return state;
}

/** Builds the core and seeds the opening messages. */
export function startNewGame(opts: NewGameOptions): GameCore {
  const core = new GameCore(createNewGameState(opts));
  core.npcs.settle(core.now());
  const name = core.state.player.name;
  core.journal.add('life', `${name}在枫庭公寓 3B 醒来。窗外是灰港潮湿的早晨，手机屏幕亮了。`, true);
  core.phone.send('daniel', '丹尼尔', `早啊${name}！这周末有空吗？好久没一起打球了。对了，听说灰港大赌场新装修了，哪天去看看？`);
  core.phone.send('raymond', '雷蒙德（主管）', '提醒：今天 9:00 部门例会，不要迟到。');
  core.phone.send('bank', '灰港储蓄信托', `【账户概览】储蓄账户余额 19,000 G。自动扣款已开启，下月 1 日起将自动支付房租与水电账单。`);
  core.wealth.dailySnapshot(core.today() - 1);
  core.touch();
  return core;
}
