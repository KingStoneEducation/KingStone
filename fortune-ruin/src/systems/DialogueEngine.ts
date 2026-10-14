import type { GameCore } from '../core/GameCore';
import { G, formatG, type Money } from '../core/money';
import { hashString } from '../core/rng';
import type { Memory } from '../core/state';
import { NPC_BY_ID, type NpcDef } from '../data/npcs';
import { ADVICE_EXTRA, FACT_LINES, GENERIC_SMALL, SHARE_REACTIONS, STATE_LINES, attitudeFor, type Attitude } from '../data/dialogueLines';
import { ITEMS } from '../data/items';
import { LOCATIONS } from '../data/locations';
import { toDate } from '../core/calendar';
import { TIER_INDEX, tierInfo } from '../casino/tables';
import { JOBS } from '../data/jobs';
import type { Expression } from '../art/portraits';

export interface DialogueOption {
  id: string;
  label: string;
  /** reason the option is unavailable (shown greyed out) */
  disabled?: string;
  tone?: 'warm' | 'neutral' | 'risky' | 'money' | 'service' | 'leave';
}

export interface DialogueView {
  npcId: string;
  name: string;
  subtitle: string;
  lines: string[];
  options: DialogueOption[];
  ended?: boolean;
  /** UI panel to open after the conversation */
  openPanel?: string;
  /** face to show; absent = their resting expression */
  mood?: Expression;
}

/**
 * Optional future extension point: an external language model could generate
 * the NPC's wording from the same context. The game never depends on it.
 */
export interface DialogueTextProvider {
  phrase(ctx: { npc: NpcDef; lines: string[]; disposition: number }): string[];
}

interface Session {
  npcId: string;
  menu: 'main' | 'share' | 'gift' | 'borrow' | 'services' | 'respond' | 'romance';
  lastFact: Memory | null;
  pendingAsk: boolean;
  /** disposition when the last view was built, to read their reaction from */
  lastDisp: number;
  /** expression called for by what was just said */
  hint: Expression | null;
}

/** How a fact they bring up shows on their face. */
const FACT_MOOD: Record<string, Expression> = {
  big_win: 'surprised',
  flashy_purchase: 'surprised',
  vip_upgrade: 'surprised',
  promotion: 'smile',
  helped: 'smile',
  repaid: 'smile',
  attended_party: 'smile',
  lent_money: 'smile',
  big_loss: 'worried',
  fired: 'worried',
  evicted: 'worried',
  outburst: 'worried',
  debt_unpaid: 'frown',
  lied: 'frown',
  missed_party: 'frown',
  refused_help: 'frown',
  drunk_scene: 'frown',
  angry_at_me: 'angry',
  pawned: 'worried',
  volunteered: 'smile',
  donated_kitchen: 'smile',
  free_meal_rich: 'frown',
  day_labor: 'surprised',
};

/** Read a reaction from the change in how they feel about the player. */
export function moodFrom(delta: number, disposition: number, temper: number): Expression | undefined {
  if (delta >= 3) return 'grin';
  if (delta >= 0.8) return 'smile';
  if (delta <= -3) return temper > 0.55 ? 'angry' : 'sad';
  if (delta <= -0.8) return 'frown';
  if (disposition <= -25) return temper > 0.6 ? 'angry' : 'frown';
  if (disposition <= -12) return 'frown';
  return undefined;
}

const fmt = (m: Money) => formatG(m);

function fill(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

const stage = (core: GameCore, id: string) => core.romance.stage(id);

export class DialogueEngine {
  session: Session | null = null;
  provider: DialogueTextProvider | null = null;

  constructor(private core: GameCore) {}

  private def(id: string): NpcDef {
    return NPC_BY_ID[id];
  }

  private vars(npcId: string, extra: Record<string, string> = {}): Record<string, string> {
    const r = this.core.social.rel(npcId);
    return { name: r.knowsName ? this.core.state.player.name : '你', npc: this.def(npcId).name, ...extra };
  }

  /** Pick a line avoiding recent repeats for this NPC. */
  private pick(npcId: string, pool: string[] | undefined, vars: Record<string, string> = {}): string | null {
    if (!pool || pool.length === 0) return null;
    const r = this.core.social.rel(npcId);
    const fresh = pool.filter((l) => !r.recentLines.includes(String(hashString(l))));
    const choice = (fresh.length ? fresh : pool)[this.core.rng.int(0, (fresh.length ? fresh : pool).length - 1)];
    r.recentLines.push(String(hashString(choice)));
    if (r.recentLines.length > 16) r.recentLines.shift();
    return fill(choice, { ...this.vars(npcId), ...vars });
  }

  private byAttitude(npcId: string, table: Partial<Record<Attitude, string[]>> | undefined, vars: Record<string, string>): string | null {
    if (!table) return null;
    const d = this.def(npcId);
    const r = this.core.social.rel(npcId);
    for (const a of attitudeFor(d.traits, r.affection, d.role)) {
      const l = this.pick(npcId, table[a], vars);
      if (l) return l;
    }
    return null;
  }

  // ------------------------------------------------------------ entry

  canTalk(npcId: string): string | null {
    const rt = this.core.state.npcs[npcId];
    if (!rt || rt.location !== this.core.state.world.location) return '对方不在这里';
    if (rt.activity === 'work' && ['natasha'].includes(npcId) && this.core.casino.cs.activeTable) return null;
    return null;
  }

  start(npcId: string): DialogueView {
    const def = this.def(npcId);
    const r = this.core.social.rel(npcId);
    this.session = { npcId, menu: 'main', lastFact: null, pendingAsk: false, lastDisp: this.core.social.disposition(npcId), hint: null };
    this.core.social.observePlayer(npcId);
    if (def.role === 'banker' && this.core.state.world.location === 'bank') this.core.social.institutionalKnowledge(npcId);
    const lines: string[] = [];
    const disp = this.core.social.disposition(npcId);
    if (!r.met || r.familiarity < 3) {
      lines.push(this.pick(npcId, def.voice.greetStranger) ?? '你好。');
      if (!r.knowsName) {
        lines.push(`（${def.name}，${def.occupation}。）`);
        r.knowsName = true;
      }
      r.met = true;
      this.core.social.applyDelta(npcId, { familiarity: 3 });
    } else {
      const pool = disp < -15 ? def.voice.greetCold : disp > 28 && r.familiarity > 30 ? def.voice.greetWarm : def.voice.greetAcquaint;
      lines.push(this.pick(npcId, pool) ?? '嗨。');
    }
    // A salient fact they know (and haven't raised yet)
    const fact = this.salientFact(npcId);
    if (fact) {
      const l = this.factLine(npcId, fact);
      if (l) {
        lines.push(l);
        fact.discussed = true;
        this.session.lastFact = fact;
        this.session.menu = 'respond';
        this.session.hint = FACT_MOOD[fact.kind] ?? null;
      }
    }
    // Visible state comments
    if (!fact) {
      const sl = this.stateLine(npcId);
      if (sl) lines.push(sl);
    }
    // Upcoming shared plans
    const plan = this.core.events.upcoming().find((e) => e.npc === npcId && e.status === 'accepted' && e.at - this.core.now() < 18 * 60);
    if (plan) lines.push(`别忘了${toDate(plan.at).hour}点的约哦。`);
    this.core.social.touchContact(npcId);
    this.core.romance.onTalk(npcId);
    this.core.paused.add('dialogue');
    // stay for the conversation, even when chatting makes time pass
    this.core.state.npcs[npcId].flags.talkHold = true;
    this.core.bus.emit('dialogue:start', { npc: npcId });
    return this.view(lines);
  }

  end(): void {
    const npc = this.session?.npcId;
    this.session = null;
    this.core.paused.delete('dialogue');
    if (npc) {
      const rt = this.core.state.npcs[npc];
      rt.flags.talkHold = false;
      // nobody walks off the moment a conversation ends
      rt.flags.talkHoldUntil = this.core.now() + 15;
      this.core.bus.emit('dialogue:end', { npc });
    }
    this.core.touch();
  }

  /**
   * Someone who dislikes the player may not want to talk: a small chance that
   * grows with the dislike. Returns what they say instead, or null.
   */
  refusal(npcId: string): string | null {
    const r = this.core.social.rel(npcId);
    if (!r.met) return null;
    const now = this.core.now();
    if (Number(r.flags.refusedUntil ?? -1) > now) return this.pick(npcId, ['我说了，现在不想聊。', '……', '别再来了。']);
    const disp = this.core.social.disposition(npcId);
    if (r.affection > -20 && disp > -25) return null;
    const dislike = Math.max(-r.affection, -disp);
    const p = Math.min(0.45, 0.1 + Math.max(0, dislike - 20) / 140);
    if (!this.core.rng.chance(p)) return null;
    r.flags.refusedUntil = now + 30;
    const t = this.def(npcId).traits;
    const pool = t.temper > 0.6 ? ['离我远点，好吗？', '我没什么想跟你说的。', '你还有脸来找我？'] : t.empathy > 0.6 ? ['……抱歉，我现在不太想说话。', '改天吧，今天不方便。'] : ['我还有事。', '现在不太方便。', '……（对方别过头去，假装没看见你。）'];
    return this.pick(npcId, pool);
  }

  private salientFact(npcId: string): Memory | null {
    const kinds = Object.keys(FACT_LINES);
    const mems = this.core.social.memoriesOf(npcId).filter((m) => kinds.includes(m.kind) && !m.discussed && this.core.social.effectiveImportance(m) >= 10);
    return mems[0] ?? null;
  }

  private sourcePhrase(m: Memory): string {
    if (m.source === 'rumor' && m.via) return m.reliability < 0.35 ? `不知道是不是真的，${NPC_BY_ID[m.via]?.name ?? '有人'}说` : `我听${NPC_BY_ID[m.via]?.name ?? '别人'}说`;
    if (m.source === 'witnessed') return '我那天看见';
    if (m.source === 'inferred') return '我听说';
    return '听说';
  }

  private factLine(npcId: string, m: Memory): string | null {
    const vars: Record<string, string> = {
      src: this.sourcePhrase(m),
      amount: m.data.amount !== undefined ? fmt(Number(m.data.amount)) : '',
      game: String(m.data.game ?? '赌桌'),
      item: String(m.data.item ?? '奢侈品'),
      title: String(m.data.title ?? ''),
      tier: m.data.tier ? tierInfo(m.data.tier as never)?.name ?? String(m.data.tier) : '',
    };
    return this.byAttitude(npcId, FACT_LINES[m.kind], vars);
  }

  private stateLine(npcId: string): string | null {
    const s = this.core.state.player.stats;
    const loc = LOCATIONS[this.core.state.world.location];
    const prestige = this.core.inventory.currentOutfit().prestige ?? 1;
    const hour = toDate(this.core.now()).hour;
    const hint = (e: Expression) => {
      if (this.session) this.session.hint = e;
    };
    if (s.drunk >= 50) {
      hint('frown');
      return this.byAttitude(npcId, STATE_LINES.drunk, {});
    }
    if (s.sleep <= 15 || s.energy <= 12) {
      hint('worried');
      return this.byAttitude(npcId, STATE_LINES.exhausted, {});
    }
    if (loc && loc.priceLevel >= 4 && prestige < 3) return this.byAttitude(npcId, STATE_LINES.shabby_upscale, {});
    if (this.core.state.world.location === 'casino' && hour >= 3 && hour < 7) return this.byAttitude(npcId, STATE_LINES.late_casino, {});
    if (s.stress >= 75 && this.core.rng.chance(0.6)) {
      hint('worried');
      return this.byAttitude(npcId, STATE_LINES.stressed, {});
    }
    if (s.hunger >= 80 && this.core.rng.chance(0.5)) return this.byAttitude(npcId, STATE_LINES.hungry, {});
    const b = this.core.social.belief(npcId);
    if (prestige >= 3 && b.outfitPrestige >= 0 && this.core.rng.chance(0.3)) return this.byAttitude(npcId, STATE_LINES.sharp, {});
    return null;
  }

  // ------------------------------------------------------------ view building

  private view(lines: string[], ended = false, openPanel?: string): DialogueView {
    const s = this.session!;
    const def = this.def(s.npcId);
    const r = this.core.social.rel(s.npcId);
    const disp = this.core.social.disposition(s.npcId);
    const final = this.provider ? this.provider.phrase({ npc: def, lines, disposition: disp }) : lines;
    const mood = s.hint ?? moodFrom(disp - s.lastDisp, disp, def.traits.temper);
    s.lastDisp = disp;
    s.hint = null;
    return {
      npcId: s.npcId,
      name: r.knowsName ? def.name : '陌生人',
      subtitle: `${def.occupation} · ${this.core.social.statusName(r.status)}`,
      lines: final,
      options: ended ? [] : this.options(),
      ended,
      openPanel,
      mood,
    };
  }

  private options(): DialogueOption[] {
    const s = this.session!;
    const id = s.npcId;
    const def = this.def(id);
    const r = this.core.social.rel(id);
    const st = this.core.state.player.stats;
    const opts: DialogueOption[] = [];
    if (s.menu === 'respond' && s.lastFact) {
      const k = s.lastFact.kind;
      if (k === 'big_win') {
        opts.push({ id: 'resp_modest', label: '「运气好而已。」', tone: 'warm' });
        opts.push({ id: 'resp_skill', label: '「那当然，我有一套方法。」', tone: 'risky' });
        const real = this.actualRecentWin();
        if (real > 0 && Number(s.lastFact.data.amount ?? 0) > real * 1.3) opts.push({ id: 'resp_correct', label: `「其实没那么多，只有 ${fmt(real)}。」`, tone: 'neutral' });
      } else if (k === 'big_loss' || k === 'evicted' || k === 'fired' || k === 'pawned') {
        opts.push({ id: 'resp_honest', label: '「是啊……最近确实不太好。」', tone: 'warm' });
        opts.push({ id: 'resp_deny', label: '「没那回事，我好得很。」', tone: 'risky' });
        if (k === 'big_loss') opts.push({ id: 'resp_quit', label: '「我打算不再赌了。」', tone: 'warm' });
      } else if (k === 'lied' || k === 'missed_party' || k === 'angry_at_me' || k === 'outburst' || k === 'refused_help' || k === 'debt_unpaid') {
        opts.push({ id: 'apologize', label: '「对不起，是我不好。」', tone: 'warm' });
        opts.push({ id: 'resp_shrug', label: '「有什么大不了的。」', tone: 'risky' });
      } else {
        opts.push({ id: 'resp_thanks', label: '「谢谢。」', tone: 'warm' });
      }
      opts.push({ id: 'main', label: '换个话题', tone: 'neutral' });
      return opts;
    }
    if (s.menu === 'share') {
      opts.push({ id: 'share_brag', label: '「我最近赚了不少。」', tone: 'risky' });
      opts.push({ id: 'share_trouble', label: '「最近手头有点紧……」', tone: 'warm' });
      opts.push({ id: 'share_quit', label: '「我已经不去赌场了。」', tone: 'neutral' });
      opts.push({ id: 'share_work', label: '「工作上还挺顺利的。」', tone: 'neutral', disabled: this.core.career.activeJobs().length ? undefined : '你现在没有工作' });
      opts.push({ id: 'main', label: '算了', tone: 'leave' });
      return opts;
    }
    if (s.menu === 'gift') {
      const items = this.core.inventory.giftables();
      for (const it of items.slice(0, 8)) opts.push({ id: `give:${it.id}`, label: `送出${it.name}（持有 ${this.core.inventory.count(it.id)}）`, tone: 'warm' });
      if (items.length === 0) opts.push({ id: 'main', label: '（你身上没有可以送的礼物）', tone: 'leave' });
      else opts.push({ id: 'main', label: '算了', tone: 'leave' });
      return opts;
    }
    if (s.menu === 'borrow') {
      for (const amt of [G(200), G(1000), G(5000)]) opts.push({ id: `borrow:${amt}`, label: `借 ${fmt(amt)}`, tone: 'money' });
      opts.push({ id: 'main', label: '还是算了', tone: 'leave' });
      return opts;
    }
    if (s.menu === 'services') {
      return [...this.serviceOptions(id), { id: 'main', label: '返回', tone: 'leave' }];
    }
    const rom = this.core.romance;
    const stage = rom.stage(id);
    if (s.menu === 'romance') {
      const ask = rom.askOption(id);
      if (ask.show) opts.push({ id: 'romance_ask', label: '「明晚有空吗？想单独约你。」', tone: 'warm', disabled: ask.disabled });
      const again = rom.dateAgainOption(id);
      if (again.show) opts.push({ id: 'romance_date', label: '「明晚再一起出去吧。」', tone: 'warm', disabled: again.disabled });
      const conf = rom.confessOption(id);
      if (conf.show) opts.push({ id: 'romance_confess', label: '「我喜欢你。我们在一起吧。」', tone: 'warm', disabled: conf.disabled });
      if (stage === 'dating' || stage === 'partner') opts.push({ id: 'romance_end', label: stage === 'partner' ? '提出分手' : '「我们还是做朋友吧。」', tone: 'risky' });
      opts.push({ id: 'main', label: '算了', tone: 'leave' });
      return opts;
    }
    // main menu
    const talked = r.talkDay === this.core.today() ? r.talksToday : 0;
    opts.push({ id: 'chat', label: '聊聊天', tone: 'warm', disabled: talked > 5 ? '今天已经聊得够多了' : undefined });
    opts.push({ id: 'ask', label: '「最近怎么样？」', tone: 'warm' });
    opts.push({ id: 'menu_share', label: '说说自己的近况…', tone: 'neutral' });
    if (this.core.inventory.giftables().length) opts.push({ id: 'menu_gift', label: '送礼物…', tone: 'warm' });
    const venue = this.treatPrice();
    if (venue) opts.push({ id: 'treat', label: `请对方${venue.what}（${fmt(venue.price)}）`, tone: 'money', disabled: r.flags.treatDay === this.core.today() ? '今天已经请过了' : undefined });
    if (r.familiarity >= 25) opts.push({ id: 'hangout', label: '一起待一会儿（约 45 分钟）', tone: 'warm', disabled: r.flags.hangoutDay === this.core.today() ? '今天已经一起待过了' : undefined });
    opts.push({ id: 'advice', label: '请教点事', tone: 'neutral', disabled: r.flags.adviceDay === this.core.today() ? '今天已经请教过了' : undefined });
    const owes = Number(this.core.state.player.flags[`owes:${id}`] ?? 0);
    if (owes > 0) opts.push({ id: 'repay', label: `还钱（${fmt(owes)}）`, tone: 'money' });
    else if (r.familiarity >= 30) opts.push({ id: 'menu_borrow', label: '向对方借钱…', tone: 'money' });
    const receivable = this.core.state.economy.receivables.find((x) => x.npc === id && x.status === 'open');
    if (receivable) opts.push({ id: 'ask_repay', label: `提起借给对方的 ${fmt(receivable.amount - receivable.repaid)}`, tone: 'money' });
    const negative = this.core.social.recall(id, ['angry_at_me', 'rude', 'missed_party', 'lied', 'refused_help', 'debt_unpaid'], 30);
    if (negative && !negative.data.apologized) opts.push({ id: 'apologize', label: '为之前的事道歉', tone: 'warm' });
    if (st.stress >= 62 || st.impulsivity >= 66 || st.drunk >= 45) opts.push({ id: 'lash_out', label: '（烦躁）冲对方发脾气', tone: 'risky' });
    if (this.serviceOptions(id).length) opts.push({ id: 'menu_services', label: this.serviceLabel(def), tone: 'service' });
    if (stage === 'dating' || stage === 'partner' || rom.askOption(id).show) opts.push({ id: 'menu_romance', label: stage === 'partner' ? '我们俩……' : '感情……', tone: 'warm' });
    const casino = this.core.companions.inviteOption(id);
    if (casino.show) opts.push({ id: 'invite_casino', label: '「今晚一起去赌场？」', tone: 'risky', disabled: casino.disabled });
    opts.push({ id: 'bye', label: '告辞', tone: 'leave' });
    return opts;
  }

  private serviceLabel(def: NpcDef): string {
    switch (def.role) {
      case 'casino_host':
        return '会员与贵宾服务…';
      case 'banker':
        return '办理业务…';
      case 'landlord':
        return '房租相关…';
      case 'boss':
        return '工作相关…';
      default:
        return '其他事情…';
    }
  }

  private serviceOptions(id: string): DialogueOption[] {
    const out: DialogueOption[] = [];
    const loc = this.core.state.world.location;
    const cs = this.core.state.casino;
    switch (id) {
      case 'victor':
        if (loc !== 'casino') break;
        out.push({ id: 'svc_tiers', label: '了解会员等级与权益', tone: 'service' });
        out.push({ id: 'svc_highlimit', label: '请求进入高额投注区', tone: 'service' });
        out.push({ id: 'svc_vip', label: '请求进入 VIP 私人厅', tone: 'service' });
        out.push({ id: 'svc_sky', label: '「楼上的天穹层，我能上去看看吗？」', tone: 'service' });
        out.push({ id: 'svc_comp', label: `用餐饮积分兑换一杯香槟（积分 ${fmt(cs.comps)}）`, tone: 'service', disabled: cs.comps < G(28) ? '积分不足' : undefined });
        out.push({ id: 'svc_credit', label: '申请赌场信用额度（marker）', tone: 'risky' });
        out.push({ id: 'svc_limit', label: '申请自我限制（暂停入场 28 天）', tone: 'warm' });
        break;
      case 'grace':
        if (loc === 'bank') {
          out.push({ id: 'svc_loan', label: '咨询个人贷款', tone: 'service' });
          out.push({ id: 'svc_credit_report', label: '查询我的信用状况', tone: 'service' });
          if (this.core.economy.overdueBills().length || this.core.state.economy.loans.some((l) => l.missedPayments > 0)) out.push({ id: 'svc_restructure', label: '申请延期还款', tone: 'warm' });
        }
        break;
      case 'margaret': {
        const rent = this.core.economy.unpaidBills().find((b) => b.kind === 'rent' && b.payee === 'margaret');
        if (rent) {
          out.push({ id: `svc_payrent:${rent.id}`, label: `当面交房租（${fmt(this.core.economy.billTotal(rent))}）`, tone: 'money' });
          if (!rent.memo.includes('宽限')) out.push({ id: `svc_grace:${rent.id}`, label: '请求宽限几天', tone: 'warm' });
        }
        break;
      }
      case 'raymond':
        if (this.core.career.job('office_clerk')) {
          out.push({ id: 'svc_leave:office_clerk', label: '申请今天请假', tone: 'service' });
          out.push({ id: 'svc_review', label: '询问自己的表现', tone: 'service' });
        }
        break;
      case 'ben':
        if (!this.core.career.job('waiter')) out.push({ id: 'svc_apply:waiter', label: '「你们还招服务员吗？」', tone: 'service' });
        break;
      case 'eileen':
        if (!this.core.career.job('barista')) out.push({ id: 'svc_apply:barista', label: '「咖啡馆还缺人吗？」', tone: 'service' });
        break;
      case 'tommy':
        if (!this.core.career.job('bartender')) out.push({ id: 'svc_apply:bartender', label: '「酒吧在招人吗？」', tone: 'service' });
        break;
      case 'natasha':
        if (!this.core.career.job('dealer')) out.push({ id: 'svc_apply:dealer', label: '「赌场招荷官吗？」', tone: 'service' });
        out.push({ id: 'svc_rules', label: '「能讲讲这张桌的规则吗？」', tone: 'service' });
        break;
      case 'sophia':
        if (!this.core.career.job('analyst')) out.push({ id: 'svc_apply:analyst', label: '「北门资本在招人吗？」', tone: 'service' });
        out.push({ id: 'svc_portfolio', label: '请她看看你的资产配置', tone: 'service' });
        break;
      case 'isabella':
        out.push({ id: 'svc_style', label: '「帮我看看这身怎么样？」', tone: 'service' });
        break;
    }
    return out;
  }

  private treatPrice(): { what: string; price: Money } | null {
    switch (this.core.state.world.location) {
      case 'cafe':
        return { what: '喝杯咖啡', price: G(5.5) };
      case 'bar':
        return { what: '喝一杯', price: G(13) };
      case 'restaurant':
        return { what: '吃顿饭', price: G(30) };
      case 'casino':
        return { what: '喝一杯', price: this.core.casino.barPrice(G(16)) || G(16) };
      case 'fine_dining':
        return { what: '喝杯酒', price: G(45) };
      default:
        return null;
    }
  }

  private actualRecentWin(): Money {
    const stats = this.core.state.casino.stats;
    return Math.max(0, Math.max(stats.biggestWin, this.core.casino.netLast(10)));
  }

  // ------------------------------------------------------------ choices

  choose(optionId: string): DialogueView {
    const s = this.session;
    if (!s) throw new Error('no conversation');
    const id = s.npcId;
    const def = this.def(id);
    const soc = this.core.social;
    const r = soc.rel(id);
    const lines: string[] = [];
    const [verb, arg] = optionId.split(':');
    switch (verb) {
      case 'main':
        s.menu = 'main';
        lines.push(this.pick(id, ['嗯？', '还有什么事吗？', '你说。']) ?? '');
        break;
      case 'menu_share':
        s.menu = 'share';
        lines.push(this.pick(id, ['你最近怎么样？', '说来听听。']) ?? '');
        break;
      case 'menu_gift':
        s.menu = 'gift';
        lines.push('（你想送什么？）');
        break;
      case 'menu_borrow':
        s.menu = 'borrow';
        lines.push('（你斟酌着怎么开口……）');
        break;
      case 'menu_romance':
        s.menu = 'romance';
        lines.push(stage(this.core, id) === 'partner' ? this.pick(id, ['嗯？', '怎么了？']) ?? '' : '（你犹豫着该怎么开口……）');
        break;
      case 'invite_casino': {
        const res = this.core.companions.invite(id);
        lines.push(res.line);
        s.hint = res.yes ? 'smile' : null;
        s.menu = 'main';
        break;
      }
      case 'romance_ask': {
        const res = this.core.romance.askOut(id);
        lines.push(res.line);
        s.hint = res.yes ? 'smile' : 'worried';
        s.menu = 'main';
        break;
      }
      case 'romance_date':
        lines.push(this.core.romance.dateAgain(id));
        s.hint = 'smile';
        s.menu = 'main';
        break;
      case 'romance_confess': {
        const res = this.core.romance.confess(id);
        lines.push(res.line);
        s.hint = res.yes ? 'grin' : 'worried';
        s.menu = 'main';
        break;
      }
      case 'romance_end': {
        lines.push(this.core.romance.breakUp(id));
        this.end();
        return this.viewEnded(id, lines);
      }
      case 'menu_services':
        s.menu = 'services';
        lines.push(this.pick(id, ['请说。', '需要什么？', '我能帮你什么？']) ?? '');
        break;
      case 'chat': {
        const talked = r.talksToday;
        const mag = Math.max(0.1, 1 - talked * 0.25);
        soc.applyDirect(id, { kind: 'chat', facets: { attention: 0.5 * mag, charm: 0.25 * mag + this.core.state.player.skills.social / 400 }, importance: 5 }, { silent: true, noMemory: true, routine: 0.5 });
        this.core.player.change('social', 8 * mag);
        this.core.player.addSkill('social', 0.15 * mag, 60);
        const own = this.pick(id, def.voice.small) ?? this.pick(id, GENERIC_SMALL);
        lines.push(own ?? '……');
        this.core.advance(10, 'talking');
        s.menu = 'main';
        break;
      }
      case 'ask': {
        const today = this.core.today();
        if (r.flags.askDay !== today) {
          r.flags.askDay = today;
          r.flags.askCount = 0;
        }
        r.flags.askCount = Number(r.flags.askCount) + 1;
        if (Number(r.flags.askCount) > 3) {
          lines.push(this.pick(id, ['你今天已经问过好几次啦，我真的挺好的。', '……你今天怎么老问这个？', '还是那样，跟刚才一样。']) ?? '');
          if (Number(r.flags.askCount) > 5) soc.applyDirect(id, { kind: 'chat', facets: { attention: -0.3 }, importance: 3 }, { silent: true, noMemory: true });
          break;
        }
        const rt = this.core.state.npcs[id];
        const self = soc.memoriesOf(id, id)[0];
        let line: string | null = null;
        if (self && !self.discussed && this.core.now() - self.t < 5 * 1440) {
          self.discussed = true;
          if (self.kind === 'npc_hardship') line = r.trust > 25 ? `说实话……最近出了点事，一下子花掉了 ${fmt(Number(self.data.amount))}。有点喘不过气。` : '还行吧，有些烦心事，不提了。';
          else if (self.kind === 'npc_big_win') line = `哈，我前两天赢了 ${fmt(Number(self.data.amount))}！`;
          else if (self.kind === 'npc_big_loss') line = r.trust > 30 ? `别提了，前几天输了 ${fmt(Number(self.data.amount))}……` : '还凑合。';
        }
        if (!line && rt.flags.inCrisis && r.trust > 30) line = id === 'marco' ? '……兄弟，我欠了不少钱，那些人天天打电话催。我不知道该怎么办了。' : '最近真的很难，欠了好多钱。';
        if (!line) line = rt.mood > 25 ? this.pick(id, def.voice.happy) : rt.mood < -10 || rt.stress > 60 ? this.pick(id, def.voice.stressed) : this.pick(id, def.voice.work);
        lines.push(line ?? '还是老样子。');
        soc.applyDirect(id, { kind: 'chat', facets: { attention: 0.4, kindness: 0.2 }, importance: 5 }, { silent: true, noMemory: true, routine: 0.4 });
        this.core.advance(8, 'talking');
        break;
      }
      // ---------------------------------------- responses to a fact
      case 'resp_modest':
        soc.applyDirect(id, { kind: 'chat', facets: { honesty: 0.2, sophistication: 0.3 }, importance: 6 }, { silent: true });
        lines.push(this.pick(id, ['嗯，那就好。', '知道就好。', '运气这东西，来得快去得也快。']) ?? '');
        s.menu = 'main';
        break;
      case 'resp_skill':
        soc.applyDirect(id, { kind: 'brag', facets: { wealthDisplay: 0.4, recklessness: 0.5, vulgarity: 0.3 }, importance: 12, data: { what: '赌技' } }, { silent: true });
        lines.push(this.byAttitude(id, SHARE_REACTIONS.brag, {}) ?? '……是吗。');
        s.menu = 'main';
        break;
      case 'resp_correct': {
        soc.applyDirect(id, { kind: 'chat', facets: { honesty: 0.7 }, importance: 10 }, { silent: true });
        const f = s.lastFact;
        if (f) f.data.amount = this.actualRecentWin();
        lines.push(this.pick(id, ['哦？原来传得那么夸张。', '哈，果然是谣言越传越离谱。', '谢谢你实话实说。']) ?? '');
        s.menu = 'main';
        break;
      }
      case 'resp_honest':
        soc.applyDirect(id, { kind: 'admit_trouble', facets: { honesty: 0.6, intimacy: 0.4, crisis: 0.3 }, importance: 16 }, { silent: true });
        lines.push(this.byAttitude(id, SHARE_REACTIONS.admit_trouble, {}) ?? this.pick(id, def.voice.onTrouble) ?? '');
        if (def.traits.empathy > 0.5) s.hint = 'worried';
        this.core.player.change('stress', -3);
        s.menu = 'main';
        break;
      case 'resp_deny':
        soc.applyDirect(id, { kind: 'claim', facets: { deceit: 0.15 * def.traits.perceptive }, importance: 12, data: { claim: 'doing_well', text: '自己「好得很」' } }, { silent: true });
        lines.push(this.pick(id, def.traits.perceptive > 0.7 ? ['……好吧，你说是就是。', '你的眼睛可不是这么说的。'] : ['那就好。', '嗯，没事就好。']) ?? '');
        s.menu = 'main';
        break;
      case 'resp_quit':
      case 'share_quit': {
        const recent = this.core.casino.recentHours(7);
        soc.applyDirect(id, { kind: 'claim', facets: recent > 1 ? { deceit: 0.25 * def.traits.perceptive } : { honesty: 0.3, diligence: 0.2 }, importance: 18, data: { claim: 'quit_gambling', text: '已经不赌了' } }, { silent: true });
        lines.push(this.byAttitude(id, SHARE_REACTIONS.quit_gambling, {}) ?? '');
        s.menu = 'main';
        break;
      }
      case 'resp_thanks':
        soc.applyDirect(id, { kind: 'chat', facets: { charm: 0.3 }, importance: 4 }, { silent: true, noMemory: true, routine: 0.2 });
        lines.push(this.pick(id, ['不客气。', '嗯。', '应该的。']) ?? '');
        s.menu = 'main';
        break;
      case 'resp_shrug':
        soc.applyDirect(id, { kind: 'rude', facets: { rudeness: 0.7 }, importance: 16 });
        lines.push(this.pick(id, ['……你真是一点都没变。', '好吧。我知道了。', '你……算了。']) ?? '');
        s.menu = 'main';
        break;
      // ---------------------------------------- sharing
      case 'share_brag': {
        const truthy = this.core.economy.netWorth() > G(60000) || this.core.casino.netLast(7) > G(2000);
        soc.applyDirect(id, { kind: 'brag', facets: { wealthDisplay: 0.6, vulgarity: 0.35, ...(truthy ? {} : { deceit: 0.2 * def.traits.perceptive }) }, importance: 14, data: { what: '赚钱' } }, { silent: true });
        if (!truthy) soc.applyDirect(id, { kind: 'claim', facets: {}, importance: 10, data: { claim: 'doing_well', text: '赚了不少' } }, { silent: true });
        else soc.applyDirect(id, { kind: 'claim', facets: {}, importance: 8, data: { claim: 'doing_well', text: '赚了不少', truthful: true } }, { silent: true });
        lines.push(this.byAttitude(id, SHARE_REACTIONS.brag, {}) ?? this.pick(id, def.voice.onBrag) ?? '');
        s.menu = 'main';
        break;
      }
      case 'share_trouble': {
        const truthy = this.core.economy.netWorth() < G(10000) || this.core.economy.overdueBills().length > 0;
        soc.applyDirect(id, { kind: 'admit_trouble', facets: truthy ? { honesty: 0.6, intimacy: 0.5, crisis: 0.5 } : { intimacy: 0.3, crisis: 0.2 }, importance: 18 }, { silent: true });
        soc.applyDirect(id, { kind: 'claim', facets: {}, importance: 10, data: { claim: 'struggling', text: '手头很紧', truthful: truthy } }, { silent: true });
        lines.push(this.pick(id, def.voice.onTrouble) ?? this.byAttitude(id, SHARE_REACTIONS.admit_trouble, {}) ?? '');
        if (def.traits.empathy > 0.5) s.hint = 'worried';
        s.menu = 'main';
        break;
      }
      case 'share_work': {
        const j = this.core.career.activeJobs()[0];
        const good = j && j.performance >= 65;
        soc.applyDirect(id, { kind: 'chat', facets: good ? { diligence: 0.4, success: 0.2 } : { attention: 0.2 }, importance: 6 }, { silent: true, noMemory: true });
        lines.push(this.byAttitude(id, SHARE_REACTIONS.work_good, {}) ?? '');
        s.menu = 'main';
        break;
      }
      // ---------------------------------------- gifts
      case 'give':
        lines.push(...this.giveGift(id, arg));
        s.menu = 'main';
        break;
      case 'treat': {
        const v = this.treatPrice();
        if (!v) break;
        const res = this.core.economy.pay(v.price, 'food', `请${def.name}${v.what}`, this.core.state.world.location);
        if (!res.ok) {
          lines.push('（你摸了摸口袋——钱不够。尴尬。）');
          soc.applyDirect(id, { kind: 'chat', facets: { charm: -0.1 }, importance: 3 }, { silent: true, noMemory: true });
          break;
        }
        r.flags.treatDay = this.core.today();
        soc.applyDirect(id, { kind: 'treated_me', facets: { generosity: 0.45, attention: 0.6, intimacy: 0.2 }, importance: 14, data: { what: v.what.replace('喝', '').replace('吃', '') || v.what } }, { routine: 0.8 });
        this.core.player.change('social', 12);
        this.core.advance(30, 'talking');
        lines.push(this.pick(id, ['谢谢，那我就不客气了。', '你请客？好啊！', '今天是什么好日子？谢啦。', '……谢谢。']) ?? '');
        break;
      }
      case 'hangout': {
        const t = def.traits;
        r.flags.hangoutDay = this.core.today();
        soc.applyDirect(id, { kind: 'deep_talk', facets: { intimacy: 0.7 * (0.6 + t.sociability * 0.4), attention: 0.8 }, importance: 16 }, { routine: 1.2 });
        this.core.player.change('social', 20);
        this.core.player.change('stress', -6);
        this.core.advance(45, 'talking');
        const mem = soc.memoriesOf(id).find((m) => m.valence > 20 && m.kind !== 'chat');
        lines.push(mem ? `你们聊了很多。${def.name}提起了以前的事：「还记得你${mem.kind === 'lent_money' ? '借钱给我' : mem.kind === 'attended_party' ? '来我的聚会' : mem.kind === 'gift' ? '送我礼物' : '那次'}吗？」` : `你们聊了很多，时间过得很快。`);
        break;
      }
      case 'advice': {
        r.flags.adviceDay = this.core.today();
        lines.push(this.pick(id, def.voice.advice) ?? '我也说不好。');
        const ex = ADVICE_EXTRA[id];
        if (ex?.skill) this.core.player.addSkill(ex.skill, ex.amount ?? 1, 60);
        if (ex?.calm) {
          this.core.player.change('impulsivity', -ex.calm);
          this.core.player.change('stress', -ex.calm / 2);
        }
        soc.applyDirect(id, { kind: 'advice_taken', facets: { attention: 0.4, sophistication: 0.1 }, importance: 8 }, { silent: true, routine: 0.3 });
        this.core.advance(10, 'talking');
        break;
      }
      case 'repay':
        lines.push(this.core.events.repayFriend(id));
        break;
      case 'ask_repay': {
        const rec = this.core.state.economy.receivables.find((x) => x.npc === id && x.status === 'open');
        if (!rec) break;
        const rt = this.core.state.npcs[id];
        const owed = rec.amount - rec.repaid;
        if (rt.money >= owed + def.income * 0.1 && this.core.rng.chance(0.3 + def.traits.honesty * 0.6)) {
          rt.money -= owed;
          rec.repaid += owed;
          rec.status = 'repaid';
          this.core.economy.receive('cash', owed, 'repaid_to_you', `${def.name}当面还款`, id);
          lines.push(this.pick(id, ['啊，对，我差点忘了。给你，谢谢你。', '一直想还你的，正好。']) ?? '');
          soc.applyDelta(id, { trust: 1 });
        } else {
          const early = this.core.today() < rec.dueDay;
          soc.applyDirect(id, { kind: 'chat', facets: early ? { stinginess: 0.3 } : { attention: 0.1 }, importance: 6 }, { silent: true, noMemory: true });
          lines.push(early ? this.pick(id, ['不是说好月底吗？……我会还的。', '你这么急吗？'])! : this.pick(id, ['我知道……再给我一点时间，好吗？', '最近真的手头紧，对不起。'])!);
        }
        break;
      }
      case 'borrow':
        lines.push(...this.borrow(id, Number(arg)));
        s.menu = 'main';
        break;
      case 'apologize': {
        const neg = soc.recall(id, ['angry_at_me', 'rude', 'missed_party', 'lied', 'refused_help', 'debt_unpaid', 'outburst'], 40);
        if (neg) neg.data.apologized = true;
        const forgiving = def.traits.empathy * 0.6 + def.traits.loyalty * 0.4;
        soc.applyDirect(id, { kind: 'apologized', facets: { honesty: 0.5, kindness: 0.4 + forgiving * 0.4 }, importance: 16 });
        lines.push(forgiving > 0.55 ? this.pick(id, ['……好吧，我接受你的道歉。', '谢谢你这么说。我们翻篇吧。'])! : this.pick(id, ['道歉谁都会说。', '嗯。看你以后的表现吧。'])!);
        s.menu = 'main';
        break;
      }
      case 'lash_out': {
        const present = soc.presentNpcs().filter((x) => x !== id);
        soc.applyDirect(id, { kind: 'angry_at_me', facets: { anger: 1, rudeness: 0.6 }, importance: 34 });
        for (const w of present) soc.applyDirect(w, { kind: 'outburst', facets: { anger: 0.5 }, importance: 18 }, { silent: true });
        this.core.player.change('stress', -6);
        this.core.player.change('impulsivity', -4);
        this.core.player.adjustReputation('social', -3);
        lines.push(def.traits.temper > 0.55 ? this.pick(id, ['你冲我发什么火？！', '你有病吧？我招你惹你了？'])! : this.pick(id, ['……你怎么了？', '我……我先走了。'])!);
        this.end();
        return this.viewEnded(id, lines);
      }
      case 'bye':
        lines.push(this.pick(id, def.voice.farewell) ?? '再见。');
        this.end();
        return this.viewEnded(id, lines);
      default:
        if (verb.startsWith('svc_')) {
          const res = this.service(id, verb, arg);
          lines.push(...res.lines);
          if (res.panel) {
            this.end();
            return this.viewEnded(id, lines, res.panel);
          }
          s.menu = 'main';
        }
    }
    if (this.session) this.session.menu = s.menu === 'respond' ? 'main' : s.menu;
    return this.view(lines.filter(Boolean));
  }

  private viewEnded(npcId: string, lines: string[], panel?: string): DialogueView {
    const def = this.def(npcId);
    const r = this.core.social.rel(npcId);
    return { npcId, name: r.knowsName ? def.name : '陌生人', subtitle: def.occupation, lines, options: [], ended: true, openPanel: panel };
  }

  private giveGift(id: string, itemId: string): string[] {
    const def = this.def(id);
    const item = ITEMS[itemId];
    const soc = this.core.social;
    const r = soc.rel(id);
    if (!item || !this.core.inventory.remove(itemId)) return ['（你没有这件东西。）'];
    const tags = item.giftTags ?? [];
    const loves = tags.some((t) => def.giftLikes.includes(t));
    const hates = tags.some((t) => def.giftDislikes.includes(t));
    const expensive = item.price >= G(500);
    if (r.lastGiftDay === this.core.today()) {
      // a second present on the same day is awkward, not twice as nice
      this.core.inventory.add(itemId);
      return [this.pick(id, ['今天已经收了你的礼物了，真的不用了。', '你今天已经送过我东西啦，留着吧。']) ?? '不用了。', '（对方没有收下。）'];
    }
    r.lastGiftDay = this.core.today();
    // professionals can't accept valuable gifts from clients
    if (expensive && (id === 'jack' || id === 'grace' || id === 'natasha')) {
      this.core.inventory.add(itemId);
      soc.applyDirect(id, { kind: 'gift_bad', facets: { deceit: 0.1 }, importance: 10, data: { item: item.name } }, { silent: true });
      return [this.pick(id, def.voice.giftDislike) ?? '我不能收。', '（对方把礼物还给了你。）'];
    }
    const priceMag = Math.min(1.5, Math.log10(Math.max(10, item.price / 100)) / 2.5);
    if (hates) {
      soc.applyDirect(id, { kind: 'gift_bad', facets: { attention: 0.2, vulgarity: expensive ? 0.3 : 0 }, importance: 10, data: { item: item.name } });
      return [this.pick(id, def.voice.giftDislike) ?? '……谢谢。'];
    }
    soc.applyDirect(id, { kind: 'gift', facets: { generosity: (loves ? 0.8 : 0.4) * (0.6 + priceMag), kindness: loves ? 0.4 : 0.1, wealthDisplay: expensive ? priceMag * 0.5 : 0 }, importance: loves ? 22 : 12, data: { item: item.name } }, { routine: 0.8 });
    return [loves ? (this.pick(id, def.voice.giftLove) ?? '谢谢！') : this.pick(id, ['谢谢，你有心了。', '哦，谢谢。', '这是给我的？谢谢。'])!];
  }

  private borrow(id: string, amount: Money): string[] {
    const def = this.def(id);
    const soc = this.core.social;
    const r = soc.rel(id);
    const t = def.traits;
    const est = soc.wealthEstimate(id) ?? 0;
    const disposable = this.core.npcs.disposable(id);
    const knowsGambling = soc.belief(id).knowsGambling > 20 || soc.recall(id, ['big_loss', 'big_win', 'seen_casino'], 30);
    let will = soc.disposition(id) + r.trust * 0.3 + t.empathy * 20 + t.loyalty * 10 - t.prudence * (knowsGambling ? 25 : 8);
    if (est > G(150000)) will -= 15; // "you're rich, why ask me?"
    if (Number(this.core.state.player.flags[`owes:${id}`] ?? 0) > 0) will -= 40;
    will -= (amount / G(1000)) * 8;
    const lines: string[] = [];
    if (amount > disposable) {
      lines.push(this.pick(id, ['我自己也没有那么多钱……', '这么多？我真拿不出来。', '抱歉，我手头真的没那么宽裕。'])!);
      soc.applyDirect(id, { kind: 'chat', facets: { attention: 0.05 }, importance: 4 }, { silent: true, noMemory: true });
      return lines;
    }
    if (will < 25) {
      lines.push(knowsGambling && t.gamblingView < 0 ? this.pick(id, ['是要拿去赌吗？……对不起，我不能借。', '如果是为了赌场，我一分都不会借。'])! : this.pick(id, ['这个……我不太方便。', '抱歉，借钱的事我一般不做。', '你找别人问问吧。'])!);
      soc.applyDirect(id, { kind: 'chat', facets: { crisis: 0.2 }, importance: 6 }, { silent: true });
      return lines;
    }
    const rt = this.core.state.npcs[id];
    rt.money -= amount;
    this.core.economy.receive('cash', amount, 'gift_received', `向${def.name}借款`, id);
    this.core.state.player.flags[`owes:${id}`] = Number(this.core.state.player.flags[`owes:${id}`] ?? 0) + amount;
    this.core.state.player.flags[`owesAsked:${id}`] = this.core.today();
    soc.applyDirect(id, { kind: 'borrowed', facets: { crisis: 0.2, intimacy: 0.2 }, importance: 22, data: { amount } });
    soc.remember({ npc: id, kind: 'claim', about: 'player', importance: 22, valence: 0, source: 'told', reliability: 1, data: { claim: 'will_repay', text: '会尽快还钱', amount } });
    this.core.journal.add('social', `向${def.name}借了 ${fmt(amount)}。`, true);
    lines.push(this.pick(id, ['好吧……拿着。尽快还我就行。', '行，我相信你。', '给你。别让我后悔。'])!);
    return lines;
  }

  private service(id: string, verb: string, arg?: string): { lines: string[]; panel?: string } {
    const core = this.core;
    const cs = core.state.casino;
    const soc = core.social;
    switch (verb) {
      case 'svc_tiers': {
        const t = core.casino.tierInfo();
        const n = core.casino.nextTier();
        return {
          lines: [
            `您目前是「${t.name}」。${n ? `距离「${n.name}」还需要约 ${Math.ceil(n.minPoints - cs.membership.points)} 积分。` : '您已经是最高等级。'}`,
            '积分按您的「理论损失」计算——下注额乘以该游戏公布的庄家优势。会员礼遇是我们的商业投入，但请记住：它不会改变任何一张牌、任何一次转盘的结果。',
          ],
          panel: 'casino_member',
        };
      }
      case 'svc_highlimit': {
        const disp = soc.disposition('victor');
        const theo = cs.membership.lifetimeTheo;
        if (core.casino.areaAccess('high') === null) return { lines: ['您已经可以进入高额区了，请随意。'] };
        if (theo >= G(900) || core.economy.balance('chips') >= G(12000) || (disp > 25 && theo >= G(400))) {
          cs.invites.highLimit = core.today() + 7;
          return { lines: ['没问题。接下来一周，高额区的工作人员会为您放行。'] };
        }
        return { lines: ['恐怕现在还不行。高额区是为长期支持我们的贵宾准备的。多来玩玩，我们会注意到的。'] };
      }
      case 'svc_vip': {
        if (core.casino.areaAccess('vip') === null) return { lines: ['请随我来，VIP 私人厅一直为您准备着。'] };
        const theo = cs.membership.lifetimeTheo;
        const chips = core.economy.balance('chips');
        if (TIER_INDEX[cs.membership.tier] >= 3 && (theo >= G(5000) || chips >= G(50000))) {
          cs.invites.vip = core.today() + 3;
          return { lines: ['我为您安排三天的私人厅资格。提醒您，私人厅需着正装。'] };
        }
        return { lines: ['私人厅只对钻石卡会员和特别邀请的贵宾开放。您的潜力我看得到，再等等。'] };
      }
      case 'svc_sky': {
        if (core.sky.access() === null) return { lines: ['您随时可以上楼。会员电梯在 VIP 厅和高额区之间的走廊尽头。'] };
        const theo = cs.membership.lifetimeTheo;
        const disp = soc.disposition('victor');
        if (TIER_INDEX[cs.membership.tier] >= 1 && (theo >= G(300) || disp > 20)) {
          cs.invites.sky = core.today() + 1;
          return { lines: ['当然。我跟电梯那边打过招呼了，今天和明天您都可以上去。休息室的自助餐请随意。'] };
        }
        return { lines: ['天穹层是金卡会员的楼层。不过——您也可以在电梯口订一晚套房，住客随时可以上楼。', '要是您常来，我会记得的。'] };
      }
      case 'svc_comp': {
        if (cs.comps < G(28)) return { lines: ['您的积分还不够。'] };
        cs.comps -= G(28);
        const r = core.inventory.order('casino_bar', 'champagne', 'cash', true);
        return { lines: ['一杯香槟，用您的积分支付。祝您今晚愉快。', r.ok ? r.message : ''] };
      }
      case 'svc_credit': {
        if (TIER_INDEX[cs.membership.tier] < 3) return { lines: ['信用额度服务仅对白金卡以上会员开放。'] };
        if (core.state.player.creditScore < 680) return { lines: ['很抱歉，风控部门没有通过您的额度申请。'] };
        if (core.state.economy.loans.some((l) => l.kind === 'casino_marker' && l.status === 'active')) return { lines: ['您还有未结清的 marker，请先结清。'] };
        const line = Math.min(G(50000), Math.max(G(5000), Math.round(cs.membership.lifetimeTheo * 4 / 100) * 100));
        cs.creditLine = line;
        core.economy.openLoan({ lender: 'casino', lenderName: '灰港大赌场（marker）', principal: line, aprBp: 1800, termMonths: 2, kind: 'casino_marker' });
        core.economy.transfer('bank', 'chips', line, 'casino_buyin', '赌场 marker 筹码');
        core.journal.add('casino', `签了一张 ${fmt(line)} 的赌场 marker（借款，需按期偿还）。`, true);
        return { lines: [`已为您签发 ${fmt(line)} 的 marker，筹码已经放进您的账户。请在两个月内偿还——逾期的 marker 会被移交催收。`] };
      }
      case 'svc_limit': {
        cs.bannedUntil = core.now() + 28 * 1440;
        soc.applyDirect('victor', { kind: 'claim', facets: { honesty: 0.2 }, importance: 10, data: { claim: 'quit_gambling', text: '申请了自我限制' } }, { silent: true });
        core.journal.add('casino', '你申请了 28 天的赌场自我限制。', true);
        core.player.change('impulsivity', -10);
        return { lines: ['……我理解。手续办好了，接下来 28 天您将无法进入赌场。照顾好自己。'] };
      }
      case 'svc_loan':
        return { lines: ['我们有几种个人贷款产品，利率取决于您的信用分和收入。我把方案给您看看。'], panel: 'bank' };
      case 'svc_credit_report': {
        const p = core.state.player;
        const debt = core.economy.totalDebt();
        return { lines: [`您的信用分是 ${p.creditScore}。${p.creditScore >= 720 ? '非常好。' : p.creditScore >= 650 ? '还不错。' : p.creditScore >= 580 ? '一般，按时还款会慢慢提升。' : '偏低，很多贷款产品会受限。'}`, debt > 0 ? `您目前的负债总额是 ${fmt(debt)}。` : '您目前没有负债。'] };
      }
      case 'svc_restructure': {
        const overdue = core.economy.overdueBills().filter((b) => b.kind === 'loan');
        if (overdue.length === 0) return { lines: ['您的贷款目前没有逾期。'] };
        for (const b of overdue) b.dueDay = core.today() + 10;
        core.player.adjustCredit(-5, '申请延期还款');
        soc.applyDirect('grace', { kind: 'admit_trouble', facets: { honesty: 0.5 }, importance: 12 }, { silent: true });
        return { lines: ['我帮您把逾期的还款延后了十天，滞纳金不变。这次之后，请一定按计划还款。'] };
      }
      case 'svc_payrent': {
        const r = core.economy.payBill(String(arg), 'bank');
        if (!r.ok) {
          const r2 = core.economy.payBill(String(arg), 'cash');
          if (!r2.ok) return { lines: [`（${r2.error}）`, '……钱不够吗？'] };
        }
        soc.applyDirect('margaret', { kind: 'rent_paid', facets: { reliability: 0.6 }, importance: 10 }, { silent: true });
        return { lines: ['好，收到了。这才像话。'] };
      }
      case 'svc_grace': {
        const bill = core.state.economy.bills.find((b) => b.id === arg);
        if (!bill) return { lines: ['什么账单？'] };
        const r = soc.rel('margaret');
        if (r.trust >= 15 && soc.disposition('margaret') > -5) {
          bill.dueDay = Math.max(bill.dueDay, core.today()) + 5;
          bill.memo += '（已宽限）';
          soc.applyDirect('margaret', { kind: 'admit_trouble', facets: { honesty: 0.3 }, importance: 10 }, { silent: true });
          return { lines: ['……好吧，再给你五天。但这是最后一次。'] };
        }
        return { lines: ['宽限？你上次也这么说。合同上写得清清楚楚。'] };
      }
      case 'svc_leave': {
        const r = core.career.requestLeave(String(arg));
        return { lines: [r.ok ? '好吧，今天准你假。别养成习惯。' : r.error] };
      }
      case 'svc_review': {
        const j = core.career.job('office_clerk');
        if (!j) return { lines: ['你不在我手下工作。'] };
        const p = j.performance;
        return { lines: [p >= 75 ? '你最近表现不错，继续保持，升职的事我会考虑。' : p >= 55 ? '还行，但还不够突出。' : '说实话，你最近的表现很让我失望。', `（表现评分 ${p}/100，出勤 ${j.shifts} 次，迟到 ${j.lates} 次，缺勤 ${j.absences} 次）`] };
      }
      case 'svc_apply': {
        const job = JOBS[String(arg)];
        const r = core.career.apply(String(arg));
        return { lines: [r.ok ? `「可以啊，」${this.def(id).name}说，「${job.desc}」` : `「${r.error}。」`, r.ok ? r.message : ''] };
      }
      case 'svc_rules': {
        core.player.addSkill('cards', 1, 40);
        return { lines: ['这张桌：六副牌，庄家软 17 停牌，Blackjack 赔 3:2，任意两张牌可加倍，分牌后可加倍，最多分成四手，A 分牌后各发一张。庄家明牌是 A 时可以买保险。', '规则都写在桌上，我们只按规则发牌。'] };
      }
      case 'svc_portfolio': {
        const eco = core.economy;
        const liquid = eco.liquid();
        const inv = core.market.portfolioValue();
        const monthly = core.housing.monthlyCost();
        const emergency = liquid >= monthly * 3;
        const sr = soc.rel('sophia');
        if (sr.familiarity < 15) return { lines: ['我们还不太熟。不过如果你愿意，可以先从记账开始。'] };
        core.player.addSkill('finance', 1.5, 60);
        return {
          lines: [
            `你的流动资金大约 ${fmt(liquid)}，投资 ${fmt(inv)}，每月固定支出约 ${fmt(monthly)}。`,
            emergency ? '应急金是够的。多余的部分，可以考虑分批买入指数基金。' : '首先要攒够三个月的生活费作为应急金，在那之前别谈投资。',
            core.state.casino.stats.byGame.blackjack.wagered + core.state.casino.stats.byGame.roulette.wagered + core.state.casino.stats.byGame.baccarat.wagered > G(20000) ? '还有……你在赌场的流水不小。那是一笔负期望的支出。' : '',
          ].filter(Boolean),
        };
      }
      case 'svc_style': {
        const o = core.inventory.currentOutfit();
        const p = core.inventory.appearancePrestige();
        core.player.addSkill('social', 0.5, 50);
        return { lines: [`这身「${o.name}」……${p >= 4 ? '非常好，在富人区也不会丢面子。' : p >= 3 ? '很得体，去金融公司面试没问题。' : p >= 2 ? '干净利落，但去高档场所还差点意思。' : '嗯……很「接地气」。高档场所的门童可能会多看你两眼。'}`, `在一般人眼里，你看起来像是身家 ${fmt(core.wealth.perceivedByStrangers())} 左右的人。`] };
      }
    }
    return { lines: ['……'] };
  }

  /** Helper for UI: compact relationship summary. */
  summary(npcId: string) {
    const r = this.core.social.rel(npcId);
    return { status: this.core.social.statusName(r.status), disposition: this.core.social.disposition(npcId), rel: r };
  }
}

export function weekdayName(t: number): string {
  return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][toDate(t).weekday];
}
