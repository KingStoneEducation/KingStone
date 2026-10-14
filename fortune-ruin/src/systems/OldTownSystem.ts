import type { GameCore } from '../core/GameCore';
import { G, formatG, type Money } from '../core/money';
import { formatClock, hm, toDate } from '../core/calendar';
import type { OldTownState } from '../core/state';
import { isOpen, LOCATIONS, type OpenHours } from '../data/locations';
import { ITEMS } from '../data/items';
import type { ActionResult } from './InventorySystem';

export function emptyOldTown(): OldTownState {
  return { tickets: [], seq: 0, stock: [], stockWeek: -1, mealDay: -1, volunteerDay: -1, laborDay: -1, fortuneDay: -1, meals: 0, volunteerShifts: 0, laborShifts: 0, laborEarned: 0, donated: 0 };
}


/** The stalls on the old pier open at six in the evening, and stay later at the weekend. */
export const NIGHT_MARKET_HOURS: OpenHours[] = [
  { days: [0, 1, 2, 3, 6], from: hm(18), to: hm(25) },
  { days: [4, 5], from: hm(18), to: hm(26) },
];

/** Whether the stalls are out (on a storm day nobody sets up: pass `storm`). */
export function nightMarketOpen(minutes: number, storm = false): boolean {
  const d = toDate(minutes);
  return !storm && isOpen({ hours: NIGHT_MARKET_HOURS }, d.weekday, d.minuteOfDay);
}

/** Day labour at Pier 7: the foreman takes people on at dawn; a shift is eight hours, paid in cash. */
export const LABOR = {
  from: hm(5, 30),
  until: hm(9),
  hours: 8,
  rate: G(15),
  /** Saturday pays more; there is no work on Sunday */
  saturdayRate: G(18),
  minEnergy: 45,
  minSleep: 50,
  minHealth: 35,
  maxDrunk: 25,
};

export const VOLUNTEER_HOURS = 2;
export const FORTUNE_PRICE = G(20);
/** Net worth from which taking a free meal looks wrong to people. */
export const RICH = G(200000);

/** The donor board on the kitchen wall: who gives what each year. */
export const KITCHEN_DONORS: { name: string; npc?: string; amount: Money; note?: string }[] = [
  { name: '惠特莫尔航运基金会', npc: 'alexander', amount: G(50000) },
  { name: '莉莉安·万斯', npc: 'lillian', amount: G(20000) },
  { name: "Marlow's 小馆", npc: 'ben', amount: G(3600), note: '每周四十份饭菜' },
  { name: '玛格丽特', npc: 'margaret', amount: G(1200) },
  { name: '老周', npc: 'oldzhou', amount: G(200) },
  { name: 'Harbor Bean 咖啡馆', amount: G(800), note: '每天剩下的面包' },
];

/**
 * The poorer side of the city: the community kitchen (a free meal, a
 * volunteer shift, donations), day labour on the docks and the fortune
 * teller at the night market.
 */
export class OldTownSystem {
  constructor(private core: GameCore) {}

  private get s(): OldTownState {
    return this.core.state.oldtown!;
  }

  private at(loc: string): boolean {
    return this.core.state.world.location === loc;
  }

  // ------------------------------------------------------------ community kitchen

  /** Is a meal being served right now (the kitchen's opening hours)? */
  serving(): boolean {
    const d = toDate(this.core.now());
    return isOpen(LOCATIONS.community_kitchen, d.weekday, d.minuteOfDay);
  }

  isRich(): boolean {
    return this.core.economy.netWorth() >= RICH || this.core.inventory.appearancePrestige() >= 4;
  }

  freeMeal(): ActionResult {
    if (!this.at('community_kitchen')) return { ok: false, error: '要在社区食堂里才能领饭' };
    if (!this.serving()) return { ok: false, error: '现在不是开饭时间（11:00–14:00，17:00–20:00）' };
    if (this.s.mealDay === this.core.today()) return { ok: false, error: '每人每天一份，今天已经领过了' };
    const meal = ITEMS.kitchen_meal;
    this.s.mealDay = this.core.today();
    this.s.meals++;
    const rich = this.isRich();
    this.core.player.applyEffects(meal.effects ?? {});
    this.core.state.player.lastMealAt = this.core.now();
    if (rich) this.core.social.witness({ kind: 'free_meal_rich', facets: { stinginess: 0.7 }, importance: 14 });
    else this.core.social.witness({ kind: 'free_meal', facets: { crisis: 0.2 }, importance: 6 });
    this.core.advance(meal.useMinutes ?? 20, 'eating');
    return {
      ok: true,
      message: rich ? '你排队领了一份热饭。排在后面的老人看了看你的衣服，又看了看你，什么也没说。' : '你排队领了一份热饭，在长桌边坐下吃完了。米饭管够。',
    };
  }

  volunteer(): ActionResult {
    if (!this.at('community_kitchen')) return { ok: false, error: '要在社区食堂里' };
    if (!this.serving()) return { ok: false, error: '开饭的时候才需要人手（11:00–14:00，17:00–20:00）' };
    if (this.s.volunteerDay === this.core.today()) return { ok: false, error: '今天已经帮过忙了，谢谢你' };
    const p = this.core.state.player.stats;
    if (p.energy < 20) return { ok: false, error: '你太累了，先歇一歇吧' };
    if (p.drunk >= 30) return { ok: false, error: '负责的阿姨闻到了酒味：「今天就算了，改天清醒的时候再来。」' };
    this.s.volunteerDay = this.core.today();
    this.s.volunteerShifts++;
    // whoever is in the hall when you put the apron on sees it
    this.core.social.witness({ kind: 'volunteered', facets: { kindness: 0.7, generosity: 0.2, diligence: 0.2 }, importance: 16 });
    this.core.advance(VOLUNTEER_HOURS * 60, 'working');
    const pl = this.core.player;
    pl.change('energy', -10);
    pl.change('stress', -8);
    pl.change('social', 12);
    pl.addMoodBuff('volunteer', 6, 8 * 60, '在食堂帮忙');
    pl.addSkill('service', 1, 60);
    if (this.core.state.player.reputation.social < 40) pl.adjustReputation('social', 1);
    this.core.journal.add('life', `在社区食堂帮忙打了 ${VOLUNTEER_HOURS} 小时饭菜。`);
    return { ok: true, message: `你系上围裙，在窗口后面打了 ${VOLUNTEER_HOURS} 个小时的饭菜。来吃饭的人里有几个你认识的面孔。` };
  }

  donate(amount: Money, method: 'cash' | 'card'): ActionResult {
    if (!this.at('community_kitchen')) return { ok: false, error: '要在社区食堂里' };
    if (!Number.isInteger(amount) || amount < G(10)) return { ok: false, error: '最少 10 G' };
    const r = this.core.economy.spend(method === 'cash' ? 'cash' : 'bank', amount, 'donation', '海员之家社区食堂捐款', 'kitchen');
    if (!r.ok) return { ok: false, error: r.error };
    this.s.donated += amount;
    const mag = Math.max(0.2, Math.min(1.2, Math.log10(amount / G(10)) / 3));
    this.core.player.addMoodBuff('donated', Math.round(3 + mag * 4), 12 * 60, '为食堂捐了款');
    this.core.social.witness({ kind: 'donated_kitchen', facets: { generosity: mag, kindness: 0.3 }, importance: Math.round(8 + mag * 20), data: { amount } });
    this.core.journal.add('money', `给社区食堂捐了 ${formatG(amount)}。`, amount >= G(10000));
    this.core.touch();
    return { ok: true, message: amount >= G(10000) ? `负责的阿姨愣了一下，然后握住你的手：「这够食堂开三个月了。」（${formatG(amount)}）` : `谢谢你。你的名字会写在墙上的捐赠板上。（${formatG(amount)}）` };
  }

  /** The donor board: this year's givers, the player included once they have given. */
  donors(): { name: string; amount: Money; note?: string; player?: boolean }[] {
    const list: { name: string; amount: Money; note?: string; player?: boolean }[] = KITCHEN_DONORS.map((d) => ({ name: d.name, amount: d.amount, note: d.note }));
    if (this.s.donated > 0) list.push({ name: this.core.state.player.name, amount: this.s.donated, player: true });
    return list.sort((a, b) => b.amount - a.amount);
  }

  // ------------------------------------------------------------ day labour

  laborRate(weekday = toDate(this.core.now()).weekday): Money {
    return weekday === 5 ? LABOR.saturdayRate : LABOR.rate;
  }

  /** Whether the foreman takes you on right now, and for what. */
  laborOffer(): { ok: boolean; pay: Money; ends: number; reason?: string; clash?: string } {
    const now = this.core.now();
    const d = toDate(now);
    const pay = this.laborRate(d.weekday) * LABOR.hours;
    const ends = now + LABOR.hours * 60;
    const no = (reason: string) => ({ ok: false, pay, ends, reason });
    if (d.weekday === 6) return no('周日码头不开工。');
    if (this.core.weather.stormDay()) return no('风暴天，吊车都停了，码头不开工。');
    if (this.s.laborDay === this.core.today()) return no('今天的活你已经干过了。');
    if (d.minuteOfDay < LABOR.from) return no(`工头还没来，${formatClock(LABOR.from)} 开始招人。`);
    if (d.minuteOfDay > LABOR.until) return no(`今天的人已经招满了。明天 ${formatClock(LABOR.from)}–${formatClock(LABOR.until)} 再来。`);
    const s = this.core.state.player.stats;
    if (s.drunk >= LABOR.maxDrunk) return no('工头摆摆手：「喝了酒的不要，出了事谁负责？」');
    if (s.health < LABOR.minHealth) return no('工头看了看你的脸色：「你这身体扛不了货，回去歇着吧。」');
    if (s.energy < LABOR.minEnergy || s.sleep < LABOR.minSleep) return no('工头打量了你一下：「你这样子扛不动箱子。睡够了再来。」');
    const clash = this.core.career.agenda().find((a) => a.status !== 'leave' && a.start < ends && a.end > now);
    return { ok: true, pay, ends, clash: clash ? `${clash.employer}的班（${formatClock(toDate(clash.start).minuteOfDay)}–${formatClock(toDate(clash.end).minuteOfDay)}）` : undefined };
  }

  doLabor(): ActionResult {
    const o = this.laborOffer();
    if (!o.ok) return { ok: false, error: o.reason ?? '' };
    this.s.laborDay = this.core.today();
    this.core.social.witness({ kind: 'day_labor', facets: { diligence: 0.5, crisis: 0.15 }, importance: 10 });
    this.core.advance(LABOR.hours * 60, 'working');
    const pl = this.core.player;
    pl.change('energy', -25);
    pl.change('hunger', 10);
    pl.change('stress', 6);
    pl.change('health', -1);
    pl.addSkill('fitness', 2, 70);
    this.s.laborShifts++;
    this.s.laborEarned += o.pay;
    this.core.economy.receive('cash', o.pay, 'salary', '码头日结工资（卸货 8 小时）', 'pier7');
    this.core.journal.add('work', `在 7 号码头卸了 ${LABOR.hours} 小时货，工头当场结了 ${formatG(o.pay)} 现金。`);
    return { ok: true, message: `你和十几个工人一起把一整船的货卸完了。肩膀火辣辣地疼。工头点了 ${formatG(o.pay)} 现金给你：「明天还来吗？」` };
  }

  // ------------------------------------------------------------ fortune teller

  /**
   * The fortune teller at the night market reads you from what he can see and
   * what the market has been saying. He cannot change your luck.
   */
  fortune(): ActionResult {
    if (!nightMarketOpen(this.core.now(), this.core.weather.stormDay())) return { ok: false, error: '看相的摊子还没摆出来' };
    if (this.s.fortuneDay === this.core.today()) return { ok: false, error: '「一天只看一次。看多了，就不灵了。」' };
    const r = this.core.economy.spend('cash', FORTUNE_PRICE, 'entertainment', '夜市看相', 'fortune');
    if (!r.ok) return { ok: false, error: '看相只收现金（20 G）' };
    this.s.fortuneDay = this.core.today();
    this.core.advance(15, 'talking');
    return { ok: true, message: this.reading() };
  }

  /** Built only from things a sharp-eyed stranger could see or hear about. */
  reading(): string {
    const core = this.core;
    const st = core.state;
    const s = st.player.stats;
    const lines: string[] = [];
    const since = core.now() - 7 * 1440;
    const recent = st.casino.stats.sessions.filter((x) => x.end >= since);
    const net = recent.reduce((a, x) => a + x.net, 0);
    const talkedAbout = (kinds: string[]) => st.social.memories.some((m) => m.about === 'player' && kinds.includes(m.kind) && m.t >= core.now() - 10 * 1440);
    if (net <= -G(2000) || talkedAbout(['big_loss'])) lines.push('最近破了财，还不是小数目。');
    else if (net >= G(2000) || talkedAbout(['big_win'])) lines.push('财星照着你——可来得快的钱，走得也快。');
    if (core.pawn.openTickets().length) lines.push('有东西押在别人手里，日子是算着过的。');
    if (core.economy.totalDebt() > G(5000)) lines.push('身上背着债，走路都比别人沉一点。');
    if (core.inventory.appearancePrestige() >= 4) lines.push('穿得这么讲究来夜市，是来找回点什么吧。');
    else if (core.inventory.appearancePrestige() < 1) lines.push('衣服旧了不要紧，人别跟着旧了。');
    if (s.sleep < 30) lines.push('眼睛底下发青，好几晚没睡好了。');
    if (s.stress >= 65) lines.push('印堂发暗，心里压着事。');
    if (s.drunk >= 30) lines.push('酒能壮胆，不能改命。');
    const partner = Object.entries(st.social.rel).find(([, r]) => r.status === 'partner');
    if (partner) lines.push('身边有人在等你，别让 TA 等太久。');
    if (st.career.jobs.every((j) => j.status !== 'active')) lines.push('手上没有正经活计，心就定不下来。');
    if (lines.length < 2) lines.push('你这面相，是能吃苦的人。', '眉毛浓的人，脾气倔。');
    const advice = ['想清楚再下注，不管是牌桌还是人生。', '钱是赚出来的，不是等出来的。', '今晚早点回家。', '多跟老朋友吃顿饭。'];
    const pick = advice[(core.today() + st.meta.seed) % advice.length];
    return `看相的老先生眯着眼睛打量了你半天：「${lines.slice(0, 3).join('')}」他顿了顿，又补了一句：「${pick}」`;
  }
}