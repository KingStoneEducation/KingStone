import type { GameCore } from '../core/GameCore';
import { G, formatG, type Money } from '../core/money';
import { MINUTES_PER_DAY, fromDate, toDate } from '../core/calendar';
import type { ScheduledEvent } from '../core/state';
import { NPC_BY_ID } from '../data/npcs';
import { TABLE_BY_ID } from '../casino/tables';

export type CompanionMode = 'play' | 'watch';

interface Answer {
  /** null: they will not come */
  mode: CompanionMode | null;
  line: string;
  /** being asked at all hurts */
  hurt?: boolean;
  /** the table they head for when you are not at one they can join */
  table?: string;
}

/** How each of them answers "shall we go to the casino tonight?". */
const ANSWERS: Record<string, Answer> = {
  marco: { mode: 'play', line: '走！今晚手感肯定好。', table: 'bj2' },
  kiki: { mode: 'play', line: '好呀！我要玩轮盘～', table: 'rl1' },
  lillian: { mode: 'play', line: '亲爱的，那就百家乐见。', table: 'bacv' },
  alexander: { mode: 'play', line: '百家乐？可以。', table: 'bacv' },
  tommy: { mode: 'play', line: '下班以后陪你玩两把，就两把。', table: 'rl1' },
  daniel: { mode: 'watch', line: '我陪你去，但我自己不赌。我是去看着你的。' },
  eileen: { mode: null, line: '……你约我去赌场？你知道我爸的事。', hurt: true },
  sophia: { mode: null, line: '期望值为负的事情，我不做。不过谢谢你想着我。' },
  grace: { mode: null, line: '我每天审批的贷款里，有不少是因为赌场。还是不了。' },
  isabella: { mode: null, line: '赌场的灯光太刺眼了。下次约我喝咖啡吧。' },
  ben: { mode: null, line: '店里走不开。' },
  oldzhou: { mode: null, line: '我年轻时在那儿输掉过一辈子的积蓄。孩子，你也少去。' },
  margaret: { mode: null, line: '我这把年纪，还是算了吧。' },
  raymond: { mode: null, line: '和下属一起去赌场？不合适。' },
  natasha: { mode: null, line: '我在那里上班。下了班，我只想离那里远一点。' },
  jack: { mode: null, line: '我在那里上班。' },
};

/** Friends you can take to the casino, and what happens when you do. */
export class CompanionSystem {
  constructor(private core: GameCore) {}

  private tonight(npc: string): ScheduledEvent | undefined {
    return this.core.events.upcoming().find((e) => e.def === 'casino_night' && e.npc === npc);
  }

  /** The conversation option, or null when it makes no sense to ask this person. */
  inviteOption(npc: string): { show: boolean; disabled?: string } {
    const a = ANSWERS[npc];
    const r = this.core.social.rel(npc);
    if (!a || r.familiarity < 20 || r.affection < 10) return { show: false };
    if (this.tonight(npc)) return { show: true, disabled: '已经约好了' };
    if (this.core.state.casino.bannedUntil > this.core.now()) return { show: true, disabled: '你现在进不了赌场' };
    if (this.core.today() - Number(r.flags.casinoAskDay ?? -99) < 3) return { show: true, disabled: '前几天刚约过' };
    return { show: true };
  }

  /** Ask them; a yes books tonight (or tomorrow night if it is already late). */
  invite(npc: string): { yes: boolean; line: string } {
    const a = ANSWERS[npc];
    const r = this.core.social.rel(npc);
    const rt = this.core.state.npcs[npc];
    r.flags.casinoAskDay = this.core.today();
    if (!a.mode) {
      if (a.hurt) this.core.social.applyDirect(npc, { kind: 'invited_gamble', facets: { rudeness: 0.5, gambling: 0.6 }, importance: 22 });
      return { yes: false, line: a.line };
    }
    if (a.mode === 'play' && rt.money < G(200)) return { yes: false, line: '我这个月手头紧，就不去了。' };
    if (npc === 'marco' && Number(rt.flags.noGambleUntil ?? -1) >= this.core.today()) {
      // he promised to stay away; the invitation is what breaks it
      rt.flags.noGambleUntil = -1;
      this.core.social.remember({ npc: 'marco', kind: 'tempted', about: 'player', importance: 30, valence: -5, source: 'self', reliability: 1, data: {} });
      for (const o of ['daniel', 'eileen']) this.core.social.applyDirect(o, { kind: 'tempted', facets: { recklessness: 0.6, unreliability: 0.4 }, importance: 24 }, { source: 'rumor', reliability: 0.8, silent: true });
      this.core.journal.add('social', '马可答应戒赌一个月，你却约他去赌场。他犹豫了很久，还是答应了。', true);
    }
    const d = toDate(this.core.now());
    let at = fromDate(d.year, d.month, d.day, 21, 0);
    if (this.core.now() > at - 30) at += MINUTES_PER_DAY;
    const ev: ScheduledEvent = { id: `C${this.core.now()}${npc}`, def: 'casino_night', at, until: at + 240, location: 'casino', npc, data: { mode: a.mode, money: rt.money }, status: 'accepted' };
    this.core.state.events.scheduled.push(ev);
    this.core.npcs.setOverrideAt(npc, at - 5, 245, 'casino', null, a.mode === 'play' ? 'gamble' : 'leisure', '陪你去赌场');
    const when = at - this.core.now() > 12 * 60 ? '明晚九点' : '今晚九点';
    return { yes: true, line: `${a.line}（${when}，灰港大赌场）` };
  }

  /** Named NPCs who are at the casino with you right now and want to play. */
  playing(): string[] {
    const now = this.core.now();
    if (this.core.state.world.location !== 'casino') return [];
    return this.core.state.events.scheduled
      .filter((e) => e.def === 'casino_night' && (e.status === 'accepted' || e.status === 'attended') && e.data.mode === 'play' && now >= e.at && now < e.until)
      .map((e) => String(e.npc))
      .filter((id) => this.core.state.npcs[id]?.location === 'casino');
  }

  /** Where a companion sits: your table if they can join it, otherwise their own favourite. */
  tableFor(npc: string): string {
    const mine = this.core.state.casino.activeTable;
    const cfg = mine ? TABLE_BY_ID[mine] : null;
    if (cfg && cfg.game !== 'poker' && cfg.area === 'main') return mine!;
    if (cfg && cfg.game !== 'poker' && (npc === 'lillian' || npc === 'alexander')) return mine!;
    return ANSWERS[npc]?.table ?? 'bj1';
  }

  /** Their own favourite table. */
  homeTable(npc: string): string {
    return ANSWERS[npc]?.table ?? 'bj1';
  }

  arrival(ev: ScheduledEvent): string {
    const name = NPC_BY_ID[String(ev.npc)].name;
    return ev.data.mode === 'watch' ? `${name}在大厅门口等你，手插在口袋里：「说好了，我只看不玩。」` : `${name}已经到了，正在兑换台前排队。「坐哪张桌子？跟着你。」`;
  }

  /** At the end of the evening: how it went for them, and what they make of you for it. */
  after(ev: ScheduledEvent): void {
    const id = String(ev.npc);
    const name = NPC_BY_ID[id].name;
    const rt = this.core.state.npcs[id];
    const t = NPC_BY_ID[id].traits;
    if (ev.data.mode === 'watch') {
      const lost = this.core.casino.netLast(0.2);
      this.core.social.applyDirect(id, { kind: 'casino_night', facets: { attention: 0.5, gambling: 0.4, ...(lost < -G(2000) ? { recklessness: 0.6 } : {}) }, importance: 18, data: { net: lost } });
      this.core.phone.send(id, name, lost < -G(2000) ? `今晚你输了 ${formatG(-lost)}。我什么都没说，但你自己心里有数。` : '今晚还行。下次我们去打球吧，比这个便宜。');
      return;
    }
    const net: Money = rt.money - Number(ev.data.money ?? rt.money);
    const facets = net >= 0 ? { attention: 0.5, charm: 0.4 } : { attention: 0.3, gambling: 0.3, ...(t.opportunism > 0.5 || t.temper > 0.6 ? { rudeness: 0.3 } : {}) };
    this.core.social.applyDirect(id, { kind: 'casino_night', facets, importance: 18, data: { net } }, { source: 'witnessed' });
    const won = net >= G(100);
    this.core.phone.send(id, name, won ? `今晚赢了 ${formatG(net)}！下次还找你。` : net <= -G(100) ? `输了 ${formatG(-net)}……${t.temper > 0.6 ? '都怪你约我。' : '算了，下次手气会好的。'}` : '今晚不输不赢，挺好。');
  }
}
