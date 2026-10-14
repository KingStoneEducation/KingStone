import type { GameCore } from '../core/GameCore';
import { G, formatG } from '../core/money';
import { MINUTES_PER_DAY, formatClock, fromDate, toDate } from '../core/calendar';
import type { ScheduledEvent } from '../core/state';
import { LOCATIONS, isOpen } from '../data/locations';
import { NPC_BY_ID } from '../data/npcs';
import { DATE_VENUES, ROMANCE, type Interest } from '../data/romance';

export type RomanceStage = 'none' | 'dating' | 'partner' | 'ex';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** when a date at each kind of place starts */
const DATE_TIME: Record<string, [number, number]> = { cafe: [15, 0], restaurant: [19, 0], bar: [20, 0], fine_dining: [19, 30], club: [20, 30] };

/**
 * Dating and partners. It sits on top of the ordinary relationship model:
 * whether someone says yes depends on attraction, affection and trust they
 * really feel (which in turn come from everything the player has done), on
 * who they are attracted to, and on the player's own stated interest.
 * Nothing here is explicit; dates are evenings out at real venues.
 */
export class RomanceSystem {
  constructor(private core: GameCore) {}

  interest(): Interest {
    return this.core.state.player.romanceInterest ?? 'all';
  }

  private gender(id: string): 'men' | 'women' {
    return NPC_BY_ID[id]?.look.body === 'f' ? 'women' : 'men';
  }

  /** The player character would consider them. */
  playerInterested(id: string): boolean {
    const i = this.interest();
    if (i === 'none') return false;
    return i === 'all' || i === this.gender(id);
  }

  /** They could fall for the player character. */
  npcInterested(id: string): boolean {
    const d = ROMANCE[id];
    return !!d && d.likes.includes(this.core.state.player.appearance.pronoun);
  }

  compatible(id: string): boolean {
    return this.playerInterested(id) && this.npcInterested(id);
  }

  stage(id: string): RomanceStage {
    return (this.core.social.rel(id).flags.romance as RomanceStage | undefined) ?? 'none';
  }

  partner(): string | null {
    for (const id of Object.keys(ROMANCE)) if (this.stage(id) === 'partner') return id;
    return null;
  }

  dates(id: string): number {
    return Number(this.core.social.rel(id).flags.dates ?? 0);
  }

  /** Everyone the player character could date in this game. */
  candidates(): string[] {
    return Object.keys(ROMANCE).filter((id) => this.compatible(id));
  }

  private pendingDate(id: string): ScheduledEvent | undefined {
    return this.core.events.upcoming().find((e) => e.def === 'date' && e.npc === id);
  }

  // ------------------------------------------------------------ dialogue options

  askOption(id: string): { show: boolean; disabled?: string } {
    if (!this.compatible(id)) return { show: false };
    const st = this.stage(id);
    if (st === 'dating' || st === 'partner') return { show: false };
    const r = this.core.social.rel(id);
    if (r.familiarity < 25 || r.affection < 30) return { show: false };
    const p = this.partner();
    if (p && p !== id) return { show: true, disabled: '你已经有恋人了' };
    if (this.pendingDate(id)) return { show: true, disabled: '你们已经约好了' };
    if (this.core.today() - Number(r.flags.askedDay ?? -99) < 7) return { show: true, disabled: '前几天刚问过' };
    return { show: true };
  }

  dateAgainOption(id: string): { show: boolean; disabled?: string } {
    const st = this.stage(id);
    if (st !== 'dating' && st !== 'partner') return { show: false };
    if (this.pendingDate(id)) return { show: true, disabled: '你们已经约好了' };
    return { show: true };
  }

  confessOption(id: string): { show: boolean; disabled?: string } {
    if (this.stage(id) !== 'dating') return { show: false };
    if (this.dates(id) < 3) return { show: true, disabled: '再多约会几次吧' };
    if (this.core.today() - Number(this.core.social.rel(id).flags.confessDay ?? -99) < 7) return { show: true, disabled: '前几天刚说过' };
    return { show: true };
  }

  // ------------------------------------------------------------ actions

  /** Chance that they say yes to a first date. */
  askChance(id: string): number {
    const r = this.core.social.rel(id);
    const t = NPC_BY_ID[id].traits;
    let p = clamp((0.45 * r.attraction + 0.35 * r.affection + 0.2 * r.trust - 18) / 30, 0.05, 0.9);
    if (this.core.state.player.stats.drunk >= 40) p *= 0.4;
    if ((this.core.inventory.currentOutfit().prestige ?? 1) < Math.round(t.classConscious * 4)) p *= 0.7;
    if (t.materialism > 0.6) {
      const est = this.core.social.wealthEstimate(id) ?? 0;
      if (est < G(500000)) p *= 0.35;
    }
    if (id === 'grace' && this.core.state.economy.loans.some((l) => l.status === 'default')) p = 0;
    return p;
  }

  askOut(id: string): { yes: boolean; line: string } {
    const r = this.core.social.rel(id);
    const def = ROMANCE[id];
    r.flags.askedDay = this.core.today();
    if (!this.core.rng.chance(this.askChance(id))) {
      this.core.social.applyDelta(id, { affection: -1 });
      return { yes: false, line: this.core.rng.pick(def.askNo) };
    }
    const ev = this.scheduleDate(id);
    return { yes: true, line: `${this.core.rng.pick(def.askYes)}（${this.when(ev)}，${LOCATIONS[String(ev.location)]?.name}）` };
  }

  private when(ev: ScheduledEvent): string {
    const d = toDate(ev.at);
    const days = Math.floor(ev.at / MINUTES_PER_DAY) - this.core.today();
    return `${days === 1 ? '明天' : `${d.month + 1}月${d.day}日`} ${formatClock(d.minuteOfDay)}`;
  }

  /** Book an evening together (from tomorrow, on a day the place is open) at one of the places they like. */
  scheduleDate(id: string): ScheduledEvent {
    const def = ROMANCE[id];
    const venue = def.venues[this.dates(id) % def.venues.length];
    const [h, m] = DATE_TIME[venue] ?? [19, 30];
    const d = toDate(this.core.now());
    let at = fromDate(d.year, d.month, d.day, h, m) + MINUTES_PER_DAY;
    for (let i = 0; i < 7; i++) {
      const t = toDate(at);
      if (!LOCATIONS[venue] || isOpen(LOCATIONS[venue], t.weekday, t.minuteOfDay)) break;
      at += MINUTES_PER_DAY;
    }
    const ev: ScheduledEvent = { id: `D${this.core.now()}${id}`, def: 'date', at, until: at + 150, location: venue, npc: id, data: { venue }, status: 'accepted' };
    this.core.state.events.scheduled.push(ev);
    this.core.npcs.setOverrideAt(id, at - 10, 170, venue, DATE_VENUES[venue]?.spot ?? null, 'date', '约会');
    const dress = LOCATIONS[venue]?.dressCode ? '记得穿正装。' : '';
    this.core.phone.send(id, NPC_BY_ID[id].name, `${this.when(ev)}，${LOCATIONS[venue]?.name}见。${dress}`);
    return ev;
  }

  dateAgain(id: string): string {
    const ev = this.scheduleDate(id);
    return `好啊。${this.when(ev)}，${LOCATIONS[String(ev.location)]?.name}。`;
  }

  confess(id: string): { yes: boolean; line: string } {
    const r = this.core.social.rel(id);
    const def = ROMANCE[id];
    r.flags.confessDay = this.core.today();
    const p = clamp((r.attraction + r.affection + 0.5 * r.trust - 95) / 40, 0.08, 0.95);
    if (!this.core.rng.chance(p)) {
      this.core.social.applyDelta(id, { affection: -2 });
      return { yes: false, line: def.confessNo };
    }
    r.flags.romance = 'partner';
    r.flags.partnerSince = this.core.today();
    r.status = 'partner';
    const name = NPC_BY_ID[id].name;
    this.core.player.addMoodBuff('partner', 10, 3 * 24 * 60, `和${name}在一起了`);
    this.core.journal.add('social', `你和${name}在一起了。`, true);
    // word gets around their circle
    for (const o of NPC_BY_ID[id].circle) this.core.social.applyDirect(o, { kind: 'new_partner', facets: { attention: 0.1 }, importance: 22, data: { name } }, { source: 'rumor', reliability: 0.9, silent: true });
    return { yes: true, line: def.confessYes };
  }

  /** The player ends it. */
  breakUp(id: string): string {
    const r = this.core.social.rel(id);
    const was = this.stage(id);
    r.flags.romance = 'ex';
    if (r.status === 'partner') r.status = 'friend';
    const t = NPC_BY_ID[id].traits;
    this.core.social.applyDirect(id, { kind: 'broke_up', facets: { betrayal: was === 'partner' ? 0.7 : 0.3, neglect: 0.3 }, importance: was === 'partner' ? 50 : 30 });
    this.core.social.updateStatus(id);
    this.core.journal.add('social', `你和${NPC_BY_ID[id].name}分手了。`, was === 'partner');
    return t.temper > 0.55 ? '……行。你走吧。' : t.empathy > 0.6 ? '……我明白了。谢谢你说实话。' : '好吧。';
  }

  /** They end it. */
  private leaveBy(id: string): void {
    const r = this.core.social.rel(id);
    r.flags.romance = 'ex';
    if (r.status === 'partner') r.status = 'friend';
    this.core.social.updateStatus(id);
    this.core.phone.send(id, NPC_BY_ID[id].name, ROMANCE[id].leave);
    this.core.player.change('mood', -15);
    this.core.player.change('stress', 10);
    this.core.journal.add('social', `${NPC_BY_ID[id].name}和你分手了。`, true);
  }

  // ------------------------------------------------------------ dates

  arrival(ev: ScheduledEvent): string {
    const venue = String(ev.data.venue);
    const name = NPC_BY_ID[String(ev.npc)].name;
    return `${name}已经到了，${DATE_VENUES[venue]?.what ?? '在等你'}。今晚这顿由你来请（约 ${formatG(DATE_VENUES[venue]?.cost ?? 0)}）。`;
  }

  attend(ev: ScheduledEvent, choice?: string): string {
    const id = String(ev.npc);
    const venue = String(ev.data.venue);
    const v = DATE_VENUES[venue];
    const t = NPC_BY_ID[id].traits;
    const name = NPC_BY_ID[id].name;
    this.core.advance(120, 'talking');
    if (venue === 'restaurant' || venue === 'fine_dining') this.core.player.change('hunger', -60);
    const paid = v ? this.core.economy.pay(v.cost, 'entertainment', `约会：${v.what}`, venue, ['cash', 'bank']) : { ok: true as const };
    const facets: Record<string, number> = { romance: 1, attention: 0.5 };
    let text = '';
    if (choice === 'share') {
      facets.honesty = 0.5;
      facets.intimacy = 0.6;
      text = `你讲起了自己的事，${name}听得很认真。`;
    } else if (choice === 'joke') {
      facets.charm = 0.9;
      if (t.classConscious > 0.6) facets.vulgarity = 0.2;
      text = t.sociability > 0.5 ? `${name}被你逗得直笑。` : `${name}礼貌地笑了笑。`;
    } else {
      facets.intimacy = 0.6;
      facets.kindness = 0.3;
      text = `${name}说了很多平时不会说的话。`;
    }
    if (!paid.ok) {
      facets.charm = (facets.charm ?? 0) - 0.6;
      text += `结账时你发现钱不够，最后是${name}付的钱。`;
    } else if (v && v.cost >= 20000) {
      facets.wealthDisplay = 0.3;
    }
    this.core.social.applyDirect(id, { kind: 'date', facets, importance: 20, data: { venue: LOCATIONS[venue]?.name ?? venue } }, { source: 'witnessed' });
    const r = this.core.social.rel(id);
    r.flags.dates = this.dates(id) + 1;
    if (this.stage(id) === 'none' || this.stage(id) === 'ex') r.flags.romance = 'dating';
    this.core.player.addMoodBuff('date', 8, 12 * 60, `和${name}约会`);
    return `${text}（第 ${r.flags.dates} 次约会）`;
  }

  miss(ev: ScheduledEvent): void {
    const id = String(ev.npc);
    this.core.social.applyDirect(id, { kind: 'stood_up', facets: { unreliability: 1, neglect: 1, betrayal: 0.3 }, importance: 40 });
    this.core.phone.send(id, NPC_BY_ID[id].name, '我等了你一个晚上。');
  }

  // ------------------------------------------------------------ daily life

  /** Seeing your partner lifts your mood. */
  onTalk(id: string): void {
    if (this.stage(id) === 'partner') this.core.player.addMoodBuff('partner', 5, 24 * 60, `和${NPC_BY_ID[id].name}在一起`);
  }

  /** Once a day: silence cools things down; partners text good morning. */
  dailyPass(): void {
    const now = this.core.now();
    const day = this.core.today();
    for (const id of Object.keys(ROMANCE)) {
      const st = this.stage(id);
      if (st !== 'dating' && st !== 'partner') continue;
      const r = this.core.social.rel(id);
      const silent = (now - r.lastContact) / MINUTES_PER_DAY;
      if (st === 'dating' && silent >= 14) {
        // it fizzles out
        r.flags.romance = 'none';
        r.flags.dates = 0;
        this.core.journal.add('social', `你和${NPC_BY_ID[id].name}渐渐没了下文。`);
        continue;
      }
      if (st !== 'partner') continue;
      if (silent >= 7) this.core.social.applyDirect(id, { kind: 'neglected', facets: { neglect: 0.4 }, importance: 6 }, { silent: true, noMemory: true });
      if (silent >= 10 && Number(r.flags.distantDay ?? -99) < day - 20) {
        r.flags.distantDay = day;
        this.core.phone.send(id, NPC_BY_ID[id].name, ROMANCE[id].distant);
      }
      if (silent >= 18 && r.affection < 25) {
        this.leaveBy(id);
        continue;
      }
      if (silent < 3 && r.affection >= 45 && day - Number(r.flags.morningDay ?? -99) >= 3 && this.core.rng.chance(0.35)) {
        r.flags.morningDay = day;
        this.core.phone.send(id, NPC_BY_ID[id].name, this.core.rng.pick(ROMANCE[id].morning));
      }
    }
  }
}
