import type { GameCore } from '../core/GameCore';
import { G, formatG, type Money } from '../core/money';
import { MINUTES_PER_DAY } from '../core/calendar';
import type { Belief, Memory, MemorySource, RelDims, Relationship } from '../core/state';
import { INITIAL_TIES, NPCS, NPC_BY_ID, type NpcDef, type Traits } from '../data/npcs';
import { CITY_SPOTS } from '../world/maps/cityLayout';
import { HOMES } from '../data/housing';

export type Facet =
  | 'wealthGain'
  | 'wealthLoss'
  | 'wealthDisplay'
  | 'gambling'
  | 'generosity'
  | 'stinginess'
  | 'honesty'
  | 'deceit'
  | 'reliability'
  | 'unreliability'
  | 'anger'
  | 'kindness'
  | 'rudeness'
  | 'diligence'
  | 'recklessness'
  | 'sophistication'
  | 'vulgarity'
  | 'attention'
  | 'neglect'
  | 'crisis'
  | 'success'
  | 'charm'
  | 'intimacy'
  | 'support'
  | 'betrayal';

export interface SocialEventSpec {
  kind: string;
  facets: Partial<Record<Facet, number>>;
  importance: number;
  data?: Record<string, number | string | boolean>;
}

export const DIM_NAMES: Record<keyof RelDims, string> = {
  affection: '好感',
  trust: '信任',
  respect: '尊重',
  attraction: '吸引',
  envy: '嫉妒',
  dependency: '依赖',
  fear: '畏惧',
  familiarity: '熟悉',
};

const BIPOLAR: (keyof RelDims)[] = ['affection', 'trust', 'respect'];

/** Kinds that people like to talk about. */
const GOSSIP_KINDS = new Set(['big_win', 'big_loss', 'flashy_purchase', 'fired', 'promotion', 'evicted', 'outburst', 'drunk_scene', 'lied', 'loan_default', 'moved', 'vip_upgrade', 'barred', 'generous_treat', 'debt_unpaid', 'helped_friend']);

export const MEMORY_TEXT: Record<string, (m: Memory) => string> = {
  big_win: (m) => `在赌场赢了 ${formatG(Number(m.data.amount ?? 0))}${m.data.game ? `（${m.data.game}）` : ''}`,
  big_loss: (m) => `在赌场输了 ${formatG(Number(m.data.amount ?? 0))}`,
  flashy_purchase: (m) => `花大价钱买了${m.data.item ?? '奢侈品'}（约 ${formatG(Number(m.data.amount ?? 0))}）`,
  fired: (m) => `被${m.data.employer ?? '公司'}解雇了`,
  promotion: (m) => `升职为${m.data.title ?? '新职位'}`,
  evicted: () => '因为欠租被赶出了公寓',
  moved: (m) => `搬进了${HOMES[String(m.data.home)]?.name ?? '新家'}`,
  outburst: () => '当众发脾气',
  drunk_scene: () => '喝得烂醉',
  lied: (m) => `对我撒了谎${m.data.about ? `（${m.data.about}）` : ''}`,
  loan_default: () => '借了钱没有按时还',
  debt_unpaid: () => '欠钱不还',
  lent_money: (m) => `借给我 ${formatG(Number(m.data.amount ?? 0))}`,
  borrowed: (m) => `向我借了 ${formatG(Number(m.data.amount ?? 0))}`,
  repaid: (m) => `按时还了 ${formatG(Number(m.data.amount ?? 0))}`,
  refused_help: () => '在我需要帮助时拒绝了我',
  helped: (m) => `在我困难时帮了我${m.data.amount ? ` ${formatG(Number(m.data.amount))}` : ''}`,
  helped_friend: (m) => `帮助了${m.data.name ?? '朋友'}`,
  gift: (m) => `送了我${m.data.item ?? '礼物'}`,
  gift_bad: (m) => `送了我不合心意的${m.data.item ?? '礼物'}`,
  chat: () => '和我聊天',
  deep_talk: () => '和我推心置腹地谈了一次',
  brag: (m) => `跟我炫耀${m.data.what ?? '自己的财富'}`,
  admit_trouble: () => '向我坦白了经济困难',
  rude: () => '对我很无礼',
  angry_at_me: () => '冲我发脾气',
  apologized: () => '向我道歉',
  generous_treat: (m) => `请大家${m.data.what ?? '喝酒'}`,
  treated_me: (m) => `请我${m.data.what ?? '喝东西'}`,
  ignored: () => '很久没有联系我',
  attended_party: (m) => `来参加了${m.data.event ?? '聚会'}`,
  missed_party: (m) => `答应了却没来${m.data.event ?? '聚会'}`,
  declined_invite: (m) => `拒绝了我的${m.data.event ?? '邀请'}`,
  vip_upgrade: (m) => `成为赌场${m.data.tier ?? 'VIP'}会员`,
  barred: () => '被赌场禁止玩 21 点',
  missed_work: () => '无故缺勤',
  late_work: () => '上班迟到',
  poor_work: () => '工作表现很差',
  worked_together: () => '一起工作',
  took_leave: () => '请了假',
  claim: (m) => `跟我说${m.data.text ?? '了一些事'}`,
  seen_casino: () => '常在赌场出没',
  rent_late: () => '拖欠房租',
  rent_paid: () => '按时交了房租',
  invited_home: () => '邀请我去家里做客',
  npc_big_win: (m) => `我自己赢了 ${formatG(Number(m.data.amount ?? 0))}`,
  npc_big_loss: (m) => `我自己输了 ${formatG(Number(m.data.amount ?? 0))}`,
  npc_hardship: (m) => `我自己遇到了一笔意外开销（${formatG(Number(m.data.amount ?? 0))}）`,
  sophisticated: () => '举止得体，很有修养',
  vulgar: () => '炫富、粗俗',
  advice_taken: () => '听取了我的建议',
};

export function describeMemory(m: Memory): string {
  const f = MEMORY_TEXT[m.kind];
  return f ? f(m) : m.kind;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Wealth people assume from appearance prestige 0..6. */
export function prestigeWealth(p: number): Money {
  const table = [G(3000), G(12000), G(35000), G(120000), G(450000), G(1600000), G(5000000)];
  const i = Math.floor(clamp(p, 0, 6));
  const f = clamp(p, 0, 6) - i;
  const a = table[i];
  const b = table[Math.min(6, i + 1)];
  return Math.round(a + (b - a) * f);
}

/**
 * How an NPC with the given traits appraises an event: the same event yields
 * very different relationship changes for different people.
 */
export function appraise(t: Traits, facets: Partial<Record<Facet, number>>, rel: RelDims): Partial<RelDims> {
  const d: Record<keyof RelDims, number> = { affection: 0, trust: 0, respect: 0, attraction: 0, envy: 0, dependency: 0, fear: 0, familiarity: 0 };
  const close = rel.familiarity > 45 && rel.affection > 25;
  const loyaltyBuffer = close ? 1 - 0.65 * t.loyalty : 1;
  for (const [k, raw] of Object.entries(facets) as [Facet, number][]) {
    const m = raw ?? 0;
    if (!m) continue;
    switch (k) {
      case 'wealthGain':
        d.respect += m * (8 * t.materialism - 3 * t.classConscious + 1);
        d.envy += m * 12 * t.envy * (1 - Math.max(0, rel.affection) / 160);
        d.affection += m * (5 * t.opportunism - 1);
        d.attraction += m * 5 * t.materialism;
        d.dependency += m * 6 * t.opportunism;
        break;
      case 'wealthLoss':
        d.respect -= m * (7 * t.materialism + 3 * t.prudence - 2 * t.empathy) * loyaltyBuffer;
        d.affection += m * (3 * t.empathy * t.loyalty - 6 * t.opportunism);
        d.envy -= m * 10 * t.envy;
        d.attraction -= m * 5 * t.materialism * loyaltyBuffer;
        d.dependency -= m * 8 * t.opportunism;
        d.trust -= m * 2 * t.prudence * loyaltyBuffer;
        break;
      case 'wealthDisplay':
        d.respect += m * (7 * t.materialism - 9 * t.classConscious * (1 - t.materialism) - 2 * t.prudence);
        d.attraction += m * 6 * t.materialism;
        d.envy += m * 10 * t.envy;
        d.affection += m * (4 * t.opportunism - 3 * (1 - t.materialism) * t.honesty * 0.5);
        break;
      case 'gambling':
        d.respect += m * (7 * t.gamblingView - 3 * t.prudence);
        d.trust += m * 5 * Math.min(0, t.gamblingView);
        d.affection += m * 3 * t.gamblingView;
        break;
      case 'generosity':
        d.affection += m * (6 + 6 * t.empathy);
        d.trust += m * 3;
        d.respect += m * (3 + 2 * t.empathy);
        d.dependency += m * 5 * t.opportunism;
        break;
      case 'stinginess':
        d.affection -= m * (5 + 4 * t.opportunism);
        d.respect -= m * 2 * t.materialism;
        break;
      case 'honesty':
        d.trust += m * (5 + 10 * t.honesty);
        d.respect += m * 5 * t.honesty;
        break;
      case 'deceit':
        d.trust -= m * (14 + 24 * t.honesty) * (0.6 + 0.4 * t.perceptive);
        d.affection -= m * 10 * t.honesty;
        d.respect -= m * 7;
        break;
      case 'reliability':
        d.trust += m * (7 + 6 * t.prudence);
        d.respect += m * 5 * t.prudence;
        break;
      case 'unreliability':
        d.trust -= m * (8 + 10 * t.prudence) * (close ? 0.8 : 1);
        d.affection -= m * 5 * (1 - t.loyalty * 0.5);
        d.respect -= m * 4;
        break;
      case 'anger':
        d.affection -= m * 9 * (0.5 + t.temper);
        d.fear += m * 9 * (1 - t.pride * 0.6);
        d.respect -= m * 6;
        d.trust -= m * 4;
        break;
      case 'kindness':
        d.affection += m * 7 * (0.5 + t.empathy);
        d.trust += m * 4;
        break;
      case 'rudeness':
        d.affection -= m * 7 * (0.5 + t.temper);
        d.respect -= m * 5 * (0.4 + t.pride);
        break;
      case 'diligence':
        d.respect += m * (5 + 6 * t.prudence);
        d.trust += m * 3;
        break;
      case 'recklessness':
        d.respect -= m * 8 * t.prudence;
        d.trust -= m * 4 * t.prudence;
        d.attraction += m * 3 * Math.max(0, t.gamblingView);
        break;
      case 'sophistication':
        d.respect += m * (3 + 10 * t.classConscious);
        d.attraction += m * 3;
        break;
      case 'vulgarity':
        d.respect -= m * 10 * t.classConscious;
        d.affection -= m * 3 * t.classConscious;
        d.attraction += m * 2 * t.materialism * (1 - t.classConscious);
        break;
      case 'attention':
        d.familiarity += m * 6;
        d.affection += m * 3 * (0.4 + t.sociability);
        break;
      case 'neglect':
        d.affection -= m * 5 * t.sociability * (1 - t.loyalty * 0.4);
        d.familiarity -= m * 2;
        break;
      case 'crisis':
        d.affection += m * (6 * t.empathy * t.loyalty - 5 * t.opportunism);
        d.respect -= m * 5 * t.materialism * loyaltyBuffer;
        d.dependency -= m * 10 * t.opportunism;
        d.attraction -= m * 4 * t.materialism;
        break;
      case 'success':
        d.respect += m * (4 + 4 * (t.prudence + t.materialism));
        d.envy += m * 7 * t.envy;
        d.attraction += m * 2 * t.materialism;
        break;
      case 'charm':
        d.affection += m * 4;
        d.attraction += m * 2;
        break;
      case 'intimacy':
        d.affection += m * 5 * (0.5 + t.sociability);
        d.trust += m * 4;
        d.familiarity += m * 3;
        break;
      case 'support':
        d.affection += m * (8 + 6 * t.loyalty);
        d.trust += m * (6 + 4 * t.loyalty);
        d.dependency += m * 4;
        break;
      case 'betrayal':
        d.trust -= m * (18 + 12 * t.loyalty);
        d.affection -= m * (12 + 10 * t.loyalty);
        break;
    }
  }
  // attribution bias: people who like you give you the benefit of the doubt
  for (const k of BIPOLAR) {
    if (d[k] < 0 && rel.affection > 40) d[k] *= 0.75;
    if (d[k] > 0 && rel.affection < -20) d[k] *= 0.7;
  }
  const out: Partial<RelDims> = {};
  for (const k of Object.keys(d) as (keyof RelDims)[]) {
    if (Math.abs(d[k]) > 0.01) out[k] = clamp(d[k], -28, 28);
  }
  return out;
}

function sourceWeight(source: MemorySource, reliability: number): number {
  switch (source) {
    case 'witnessed':
      return 1;
    case 'told':
      return 0.85;
    case 'rumor':
      return 0.5 * reliability;
    case 'inferred':
      return 0.4;
    default:
      return 1;
  }
}

export function emptyRelationship(): Relationship {
  return {
    affection: 0,
    trust: 0,
    respect: 0,
    attraction: 0,
    envy: 0,
    dependency: 0,
    fear: 0,
    familiarity: 0,
    met: false,
    knowsName: false,
    lastTalk: -1,
    talkDay: -1,
    talksToday: 0,
    lastGiftDay: -1,
    lastContact: -1,
    status: 'stranger',
    recentLines: [],
    flags: {},
    history: [],
  };
}

export function emptyBelief(): Belief {
  return { wealth: null, outfitPrestige: -1, knowsJob: null, knowsHome: null, knowsDebt: false, knowsGambling: 0, lastSeen: -1 };
}

export function tieKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function initialTies(): Record<string, number> {
  const ties: Record<string, number> = {};
  for (const [a, b, v] of INITIAL_TIES) ties[tieKey(a, b)] = v;
  return ties;
}

export interface ApplyOptions {
  source?: MemorySource;
  reliability?: number;
  via?: string;
  silent?: boolean;
  /** skip recording a memory (minor routine interactions) */
  noMemory?: boolean;
}

export class SocialSystem {
  constructor(private core: GameCore) {}

  private get s() {
    return this.core.state.social;
  }

  rel(id: string): Relationship {
    let r = this.s.rel[id];
    if (!r) {
      r = emptyRelationship();
      this.s.rel[id] = r;
    }
    return r;
  }

  belief(id: string): Belief {
    let b = this.s.beliefs[id];
    if (!b) {
      b = emptyBelief();
      this.s.beliefs[id] = b;
    }
    return b;
  }

  tie(a: string, b: string): number {
    return this.s.ties[tieKey(a, b)] ?? 0;
  }

  // ------------------------------------------------------------ applying events

  /** An event the NPC experiences or is told about. Returns the relationship change. */
  applyDirect(npcId: string | null, spec: SocialEventSpec, opts: ApplyOptions = {}): Partial<RelDims> {
    if (!npcId || !NPC_BY_ID[npcId]) return {};
    const def = NPC_BY_ID[npcId];
    const rel = this.rel(npcId);
    const source = opts.source ?? 'witnessed';
    const reliability = opts.reliability ?? 1;
    const raw = appraise(def.traits, spec.facets, rel);
    const w = sourceWeight(source, reliability);
    const delta: Partial<RelDims> = {};
    for (const [k, v] of Object.entries(raw) as [keyof RelDims, number][]) delta[k] = v * w;
    this.applyDelta(npcId, delta);
    if (source === 'witnessed' || source === 'told') {
      rel.lastContact = this.core.now();
      if (!rel.met) rel.met = true;
    }
    if (!opts.noMemory && spec.importance >= 4) {
      const valence = clamp(Math.round(((delta.affection ?? 0) + (delta.trust ?? 0) + (delta.respect ?? 0)) * 3), -100, 100);
      this.remember({
        npc: npcId,
        kind: spec.kind,
        about: 'player',
        importance: spec.importance * (source === 'rumor' ? 0.7 : source === 'told' ? 0.9 : 1),
        valence,
        source,
        reliability,
        via: opts.via,
        data: spec.data ?? {},
      });
      this.updateBeliefFrom(npcId, spec.kind, spec.data ?? {}, source, reliability);
      this.checkContradictions(npcId, spec.kind);
    }
    if (!opts.silent && (Math.abs(delta.affection ?? 0) >= 3 || Math.abs(delta.trust ?? 0) >= 4 || Math.abs(delta.respect ?? 0) >= 4)) {
      this.core.bus.emit('relationship', { npc: npcId, delta, reason: spec.kind });
    }
    return delta;
  }

  applyDelta(npcId: string, delta: Partial<RelDims>): void {
    const rel = this.rel(npcId);
    for (const [k, v] of Object.entries(delta) as [keyof RelDims, number][]) {
      if (!v) continue;
      const lo = BIPOLAR.includes(k) ? -100 : 0;
      rel[k] = Math.round(clamp(rel[k] + v, lo, 100) * 10) / 10;
    }
    this.updateStatus(npcId);
    this.core.touch();
  }

  /** Everyone present at the player's location (and close enough in the city) witnesses. */
  witness(spec: SocialEventSpec, opts: { exclude?: string[]; radius?: number } = {}): string[] {
    const present = this.presentNpcs(opts.radius ?? 14).filter((id) => !opts.exclude?.includes(id));
    for (const id of present) this.applyDirect(id, spec, { source: 'witnessed', silent: true });
    return present;
  }

  /** Named NPCs at the player's location; in the city only those nearby. */
  presentNpcs(radiusTiles = 14): string[] {
    const loc = this.core.state.world.location;
    const out: string[] = [];
    for (const rt of this.core.npcs.npcsAt(loc)) {
      if (loc === 'city') {
        const spot = rt.spot ? CITY_SPOTS[rt.spot] : null;
        if (!spot) continue;
        const px = this.core.state.world.x / 16;
        const py = this.core.state.world.y / 16;
        if (Math.abs(spot.x - px) + Math.abs(spot.y - py) > radiusTiles) continue;
      }
      out.push(rt.id);
    }
    return out;
  }

  /** Life events: those directly involved learn now; the rest hear through the grapevine. */
  broadcastEvent(kind: string, data: Record<string, number | string | boolean>): void {
    const specs: Record<string, SocialEventSpec> = {
      promotion: { kind: 'promotion', facets: { success: 0.8, diligence: 0.5 }, importance: 35, data },
      fired: { kind: 'fired', facets: { wealthLoss: 0.4, unreliability: 0.3, crisis: 0.3 }, importance: 35, data },
      moved: { kind: 'moved', facets: Number(data.tier ?? 1) >= 3 ? { wealthDisplay: 0.6, success: 0.3 } : Number(data.tier ?? 1) === 0 ? { wealthLoss: 0.3, crisis: 0.2 } : { attention: 0 }, importance: Number(data.tier ?? 1) >= 3 ? 30 : 15, data },
      evicted: { kind: 'evicted', facets: { wealthLoss: 0.7, crisis: 0.8, unreliability: 0.4 }, importance: 45, data },
    };
    const spec = specs[kind];
    if (!spec) return;
    // first-hand knowledge
    const firstHand: string[] = [];
    if (kind === 'promotion' || kind === 'fired') {
      for (const j of this.core.state.career.jobs) {
        const jd = this.core.career.def(j.jobId);
        if (jd.employer === data.employer) firstHand.push(...[jd.boss, ...jd.coworkers].filter((x): x is string => !!x));
      }
    }
    if (kind === 'evicted' || kind === 'moved') firstHand.push('margaret');
    for (const id of new Set(firstHand)) this.applyDirect(id, spec, { source: 'witnessed', silent: true });
    // close friends are usually told directly by the player character's social circle
    for (const def of NPCS) {
      if (firstHand.includes(def.id)) continue;
      const r = this.rel(def.id);
      if (r.status === 'close' || (r.status === 'friend' && this.core.rng.chance(0.5))) {
        this.applyDirect(def.id, spec, { source: 'told', reliability: 0.95, silent: true });
      }
    }
  }

  /** Big casino rounds are noticed by people around and by the casino itself. */
  casinoPlay(game: string, tableId: string, stake: number, net: number): void {
    const b = this.belief('victor');
    b.knowsGambling = Math.min(100, b.knowsGambling + stake / G(500));
    const liquid = Math.max(G(1000), this.core.economy.liquid());
    const notable = Math.abs(net) >= G(800) && Math.abs(net) >= liquid * 0.08;
    const huge = Math.abs(net) >= G(5000);
    if (!notable && !huge) return;
    const amountG = Math.abs(net) / 100;
    const mag = clamp(Math.log10(Math.max(10, amountG)) - 2.2, 0.2, 1.6);
    const gameName = game === 'blackjack' ? '21点' : game === 'baccarat' ? '百家乐' : game === 'roulette' ? '轮盘' : game === 'poker' ? '德州扑克' : game;
    const spec: SocialEventSpec =
      net > 0
        ? { kind: 'big_win', facets: { wealthGain: mag, gambling: 0.6 + mag * 0.2 }, importance: 22 + mag * 18, data: { amount: net, game: gameName, table: tableId } }
        : { kind: 'big_loss', facets: { wealthLoss: mag, gambling: 0.6 + mag * 0.2, recklessness: mag * 0.5 }, importance: 22 + mag * 18, data: { amount: -net, game: gameName, table: tableId } };
    const cs = this.core.state.casino;
    const present = this.core.npcs.npcsAt('casino').map((r) => r.id);
    const seatedTogether = new Set(cs.patrons.filter((p) => p.npc && p.seat?.startsWith(`${tableId}:`)).map((p) => p.npc!));
    for (const id of present) {
      const rt = this.core.npcs.rt(id);
      const sameTable = seatedTogether.has(id) || (rt.spot === 'dealer_bj1' && tableId === 'bj1');
      if (sameTable || huge || id === 'victor' || (id === 'jack' && Math.abs(net) >= G(3000))) {
        this.applyDirect(id, spec, { source: 'witnessed', silent: true });
      }
    }
    // the host learns about big action from the floor even off shift (business records)
    if (!present.includes('victor') && huge) this.applyDirect('victor', spec, { source: 'inferred', reliability: 1, silent: true });
    this.core.player.adjustReputation('casino', net > 0 ? mag * 2 : mag);
    this.core.bus.emit('casino:notable', { net });
  }

  /** NPC's own life events (they remember them; some open up dialogue or events). */
  npcEvent(npcId: string, kind: string, data: Record<string, number | string | boolean>): void {
    this.remember({ npc: npcId, kind, about: npcId, importance: 30, valence: kind.includes('win') ? 40 : -40, source: 'self', reliability: 1, data });
  }

  // ------------------------------------------------------------ memory

  remember(m: Omit<Memory, 'id' | 't' | 'sharedWith'> & { t?: number }): Memory {
    const mem: Memory = { ...m, id: ++this.s.memSeq, t: m.t ?? this.core.now(), sharedWith: [] };
    this.s.memories.push(mem);
    this.core.bus.emit('memory', { npc: m.npc, memory: mem });
    if (this.s.memories.length > 1400) this.pruneMemories();
    return mem;
  }

  effectiveImportance(m: Memory, now = this.core.now()): number {
    const ageDays = (now - m.t) / MINUTES_PER_DAY;
    const halfLife = 6 + m.importance * 0.9;
    return m.importance * Math.pow(0.5, ageDays / halfLife);
  }

  memoriesOf(npcId: string, about = 'player'): Memory[] {
    const now = this.core.now();
    return this.s.memories
      .filter((m) => m.npc === npcId && m.about === about)
      .sort((a, b) => this.effectiveImportance(b, now) - this.effectiveImportance(a, now));
  }

  /** Most salient memory of a kind (or any of several kinds). */
  recall(npcId: string, kinds: string | string[], withinDays = 9999): Memory | undefined {
    const ks = Array.isArray(kinds) ? kinds : [kinds];
    const since = this.core.now() - withinDays * MINUTES_PER_DAY;
    const now = this.core.now();
    let best: Memory | undefined;
    let bestScore = -1;
    for (const m of this.s.memories) {
      if (m.npc !== npcId || m.about !== 'player' || !ks.includes(m.kind) || m.t < since) continue;
      const sc = this.effectiveImportance(m, now) + (m.t - since) / 1e7;
      if (sc > bestScore) {
        best = m;
        bestScore = sc;
      }
    }
    return best;
  }

  private pruneMemories(): void {
    const now = this.core.now();
    const byNpc = new Map<string, Memory[]>();
    for (const m of this.s.memories) {
      const list = byNpc.get(m.npc) ?? [];
      list.push(m);
      byNpc.set(m.npc, list);
    }
    const keep: Memory[] = [];
    for (const list of byNpc.values()) {
      list.sort((a, b) => this.effectiveImportance(b, now) - this.effectiveImportance(a, now));
      keep.push(...list.slice(0, 70).filter((m, i) => i < 25 || this.effectiveImportance(m, now) >= 2));
    }
    keep.sort((a, b) => a.id - b.id);
    this.s.memories = keep;
  }

  // ------------------------------------------------------------ beliefs

  private updateBeliefFrom(npcId: string, kind: string, data: Record<string, number | string | boolean>, source: MemorySource, reliability: number): void {
    const b = this.belief(npcId);
    const conf = source === 'witnessed' ? 0.25 : source === 'told' ? 0.15 : source === 'inferred' ? 0.3 : 0.1 * reliability;
    const cur = b.wealth?.estimate ?? prestigeWealth(Math.max(1, b.outfitPrestige));
    const amount = Number(data.amount ?? 0);
    let next: number | null = null;
    switch (kind) {
      case 'big_win':
        next = cur + amount * 0.75;
        b.knowsGambling = Math.min(100, b.knowsGambling + 15);
        break;
      case 'big_loss':
        next = Math.max(0, cur - amount * 0.75);
        b.knowsGambling = Math.min(100, b.knowsGambling + 15);
        break;
      case 'flashy_purchase':
        next = Math.max(cur, amount * 8);
        break;
      case 'moved': {
        const tier = Number(data.tier ?? 1);
        next = Math.max(tier >= 3 ? cur : cur * 0.8, prestigeWealth(tier + 0.5));
        b.knowsHome = String(data.home ?? '');
        break;
      }
      case 'evicted':
        next = Math.min(cur, G(4000));
        b.knowsDebt = true;
        break;
      case 'fired':
        next = cur * 0.85;
        b.knowsJob = null;
        break;
      case 'promotion':
        next = cur * 1.12;
        break;
      case 'vip_upgrade':
        next = Math.max(cur, prestigeWealth(2.5 + ['silver', 'gold', 'platinum', 'diamond'].indexOf(String(data.tier))));
        break;
      case 'admit_trouble':
        next = Math.min(cur, G(6000));
        b.knowsDebt = true;
        break;
      case 'claim':
        if (data.claim === 'doing_well') next = cur * (1.2 + 0.6 * reliability);
        if (data.claim === 'struggling') next = cur * 0.6;
        break;
      case 'loan_default':
      case 'debt_unpaid':
        b.knowsDebt = true;
        next = cur * 0.8;
        break;
    }
    if (next !== null) {
      const old = b.wealth?.confidence ?? 0;
      b.wealth = { estimate: Math.round(Math.max(0, next)), confidence: Math.min(0.95, old + conf), t: this.core.now(), basis: kind };
    }
  }

  /** An NPC sees the player: outfit and (outdoors) the car shape their impression. */
  observePlayer(npcId: string): void {
    const b = this.belief(npcId);
    const def = NPC_BY_ID[npcId];
    const now = this.core.now();
    if (b.lastSeen >= 0 && now - b.lastSeen < 60) return;
    b.lastSeen = now;
    const prestige = this.core.inventory.appearancePrestige(this.core.state.world.location === 'city');
    b.outfitPrestige = prestige;
    const implied = prestigeWealth(prestige);
    const w = 0.08 + 0.17 * def.traits.perceptive * (def.traits.materialism + 0.3);
    if (!b.wealth) b.wealth = { estimate: implied, confidence: 0.12, t: now, basis: 'appearance' };
    else {
      // strong facts resist appearance updates; perceptive people discount cheap signals
      const k = w * (1 - b.wealth.confidence * 0.8);
      b.wealth.estimate = Math.round(b.wealth.estimate * (1 - k) + implied * k);
      b.wealth.t = now;
    }
    const rel = this.rel(npcId);
    if (rel.met) rel.familiarity = Math.min(100, rel.familiarity + 0.15);
    // visible state reactions (drunk, exhausted) are noticed
    const st = this.core.state.player.stats;
    if (st.drunk >= 60 && this.core.rng.chance(0.5)) this.applyDirect(npcId, { kind: 'drunk_scene', facets: { recklessness: 0.4, vulgarity: 0.3 }, importance: 16 }, { source: 'witnessed', silent: true });
  }

  /** Bank staff see account data; casino host sees play records; landlord sees rent records. */
  institutionalKnowledge(npcId: string): void {
    const b = this.belief(npcId);
    const now = this.core.now();
    if (npcId === 'grace') {
      const eco = this.core.economy;
      b.wealth = { estimate: eco.balance('bank') + this.core.market.portfolioValue() - eco.totalDebt(), confidence: 0.85, t: now, basis: 'bank_records' };
      b.knowsDebt = eco.totalDebt() > 0;
    }
  }

  wealthEstimate(npcId: string): Money | null {
    return this.belief(npcId).wealth?.estimate ?? null;
  }

  // ------------------------------------------------------------ lies and promises

  /** If the NPC learns something contradicting what the player claimed, they feel lied to. */
  private checkContradictions(npcId: string, kind: string): void {
    const since = this.core.now() - 21 * MINUTES_PER_DAY;
    const claims = this.s.memories.filter((m) => m.npc === npcId && m.kind === 'claim' && m.t >= since && !m.data.resolved);
    for (const c of claims) {
      const claim = String(c.data.claim);
      const contradicted =
        (claim === 'quit_gambling' && (kind === 'big_win' || kind === 'big_loss' || kind === 'seen_casino')) ||
        (claim === 'struggling' && (kind === 'flashy_purchase' || kind === 'big_win')) ||
        (claim === 'doing_well' && (kind === 'evicted' || kind === 'loan_default'));
      if (contradicted) {
        c.data.resolved = true;
        this.applyDirect(npcId, { kind: 'lied', facets: { deceit: 1 }, importance: 40, data: { about: String(c.data.text ?? '') } }, { source: 'inferred' });
      }
    }
  }

  // ------------------------------------------------------------ rumors

  /** Daily gossip: memorable stories about the player travel along social ties, getting distorted. */
  spreadRumors(): void {
    const rng = this.core.rng;
    const now = this.core.now();
    const fresh = this.s.memories.filter((m) => m.about === 'player' && GOSSIP_KINDS.has(m.kind) && now - m.t < 10 * MINUTES_PER_DAY && this.effectiveImportance(m, now) >= 12);
    const newOnes: Memory[] = [];
    for (const m of fresh) {
      const teller = NPC_BY_ID[m.npc];
      if (!teller) continue;
      for (const listener of teller.circle) {
        if (m.sharedWith.includes(listener)) continue;
        // does the listener already know this story?
        if (this.s.memories.some((x) => x.npc === listener && x.kind === m.kind && Math.abs(x.t - m.t) < 2 * MINUTES_PER_DAY)) {
          m.sharedWith.push(listener);
          continue;
        }
        const tie = this.tie(teller.id, listener) / 100;
        const p = teller.traits.gossip * (0.25 + tie) * 0.6;
        if (!rng.chance(p)) continue;
        m.sharedWith.push(listener);
        const exaggeration = Math.exp(rng.normal(0.12 + teller.traits.gossip * 0.18, 0.3));
        const data = { ...m.data };
        if (typeof data.amount === 'number') data.amount = Math.round((data.amount * exaggeration) / 100) * 100;
        const reliability = Math.max(0.1, m.reliability * (0.55 + 0.35 * teller.traits.honesty));
        newOnes.push({ ...m, id: 0, npc: listener, source: 'rumor', reliability, via: teller.id, data, sharedWith: [teller.id], t: m.t });
      }
    }
    for (const r of newOnes) {
      const spec = this.specFromMemory(r);
      if (spec) this.applyDirect(r.npc, spec, { source: 'rumor', reliability: r.reliability, via: r.via, silent: true });
    }
  }

  /** Rebuild the facets of a memory so a listener can appraise a rumor. */
  private specFromMemory(m: Memory): SocialEventSpec | null {
    const amount = Number(m.data.amount ?? 0);
    const mag = clamp(Math.log10(Math.max(10, amount / 100)) - 2.2, 0.2, 1.6);
    switch (m.kind) {
      case 'big_win':
        return { kind: m.kind, facets: { wealthGain: mag, gambling: 0.7 }, importance: m.importance, data: m.data };
      case 'big_loss':
        return { kind: m.kind, facets: { wealthLoss: mag, gambling: 0.7, recklessness: mag * 0.5 }, importance: m.importance, data: m.data };
      case 'flashy_purchase':
        return { kind: m.kind, facets: { wealthDisplay: mag }, importance: m.importance, data: m.data };
      case 'fired':
        return { kind: m.kind, facets: { wealthLoss: 0.4, unreliability: 0.3, crisis: 0.3 }, importance: m.importance, data: m.data };
      case 'promotion':
        return { kind: m.kind, facets: { success: 0.8, diligence: 0.4 }, importance: m.importance, data: m.data };
      case 'evicted':
        return { kind: m.kind, facets: { wealthLoss: 0.7, crisis: 0.8, unreliability: 0.4 }, importance: m.importance, data: m.data };
      case 'outburst':
        return { kind: m.kind, facets: { anger: 0.6 }, importance: m.importance, data: m.data };
      case 'drunk_scene':
        return { kind: m.kind, facets: { recklessness: 0.4, vulgarity: 0.3 }, importance: m.importance, data: m.data };
      case 'lied':
        return { kind: m.kind, facets: { deceit: 0.5 }, importance: m.importance * 0.7, data: m.data };
      case 'loan_default':
      case 'debt_unpaid':
        return { kind: m.kind, facets: { unreliability: 0.8 }, importance: m.importance, data: m.data };
      case 'moved':
        return { kind: m.kind, facets: { wealthDisplay: 0.4 }, importance: m.importance, data: m.data };
      case 'vip_upgrade':
        return { kind: m.kind, facets: { wealthDisplay: 0.3, gambling: 0.5 }, importance: m.importance, data: m.data };
      case 'barred':
        return { kind: m.kind, facets: { gambling: 0.5, deceit: 0.2 }, importance: m.importance, data: m.data };
      case 'generous_treat':
        return { kind: m.kind, facets: { generosity: 0.5, wealthDisplay: 0.3 }, importance: m.importance, data: m.data };
      case 'helped_friend':
        return { kind: m.kind, facets: { kindness: 0.6 }, importance: m.importance, data: m.data };
    }
    return null;
  }

  // ------------------------------------------------------------ relationship dynamics

  dailyDrift(day: number): void {
    const now = this.core.now();
    for (const def of NPCS) {
      const r = this.rel(def.id);
      r.envy = Math.round(r.envy * 0.97 * 10) / 10;
      r.fear = Math.round(r.fear * 0.95 * 10) / 10;
      r.affection = Math.round(r.affection * 0.997 * 10) / 10;
      const sinceContact = r.lastContact < 0 ? 999 : (now - r.lastContact) / MINUTES_PER_DAY;
      if (sinceContact > 7) r.familiarity = Math.max(0, r.familiarity - 0.12);
      if ((r.status === 'friend' || r.status === 'close') && sinceContact > 12 && Number(r.flags.lastNeglect ?? -99) < day - 12) {
        r.flags.lastNeglect = day;
        this.applyDirect(def.id, { kind: 'ignored', facets: { neglect: 0.5 }, importance: 14 }, { source: 'inferred', silent: true });
      }
      if (day % 7 === 0) {
        r.history.push({ day, affection: r.affection, trust: r.trust, respect: r.respect });
        if (r.history.length > 52) r.history.shift();
      }
      this.updateStatus(def.id);
    }
  }

  updateStatus(npcId: string): void {
    const r = this.rel(npcId);
    if (r.status === 'partner') return;
    let s: Relationship['status'] = 'stranger';
    if (r.affection < -30 && r.familiarity > 25) s = 'estranged';
    else if (r.envy > 60 && r.affection < 0) s = 'rival';
    else if (r.affection >= 60 && r.trust >= 45 && r.familiarity >= 50) s = 'close';
    else if (r.affection >= 28 && r.familiarity >= 28) s = 'friend';
    else if (r.met && r.familiarity >= 8) s = 'acquaintance';
    r.status = s;
  }

  /**
   * Overall warmth towards the player (-100..100). Opportunists add a term
   * for what they *believe* the player's wealth to be; the casino host also
   * weighs the player's commercial value.
   */
  disposition(npcId: string): number {
    const def = NPC_BY_ID[npcId];
    const r = this.rel(npcId);
    let d = 0.4 * r.affection + 0.25 * r.trust + 0.2 * r.respect + 0.1 * r.attraction - 0.15 * r.envy - 0.1 * r.fear;
    const est = this.wealthEstimate(npcId);
    if (est !== null) {
      const wf = clamp(Math.log10(Math.max(100, est / 100) / 20000) * 12, -15, 25);
      d += def.traits.opportunism * def.traits.materialism * wf;
    }
    if (def.role === 'casino_host') {
      const m = this.core.state.casino.membership;
      d += ['visitor', 'silver', 'gold', 'platinum', 'diamond'].indexOf(m.tier) * 7 + Math.min(15, m.lifetimeTheo / G(1000));
      const recent = this.core.casino.recentHours(14);
      if (recent < 1 && m.lifetimeTheo > G(2000)) d -= 8; // a cooling commercial interest
    }
    if (def.role === 'banker') d += (this.core.state.player.creditScore - 650) / 12;
    return clamp(Math.round(d), -100, 100);
  }

  statusName(s: Relationship['status']): string {
    return { stranger: '陌生人', acquaintance: '点头之交', friend: '朋友', close: '挚友', partner: '恋人', estranged: '疏远', rival: '心存芥蒂' }[s];
  }

  /** Whether a short "how are you" text makes sense right now. */
  canText(npcId: string): string | null {
    const r = this.rel(npcId);
    if (!r.knowsName) return '你没有对方的联系方式';
    const last = Number(r.flags.lastText ?? -99);
    if (this.core.today() - last < 2) return '前两天刚发过消息';
    if (r.status === 'estranged' && r.affection < -30) return '对方大概不会回你';
    return null;
  }

  /** A light-touch message that keeps a relationship warm; replies depend on who they are. */
  textGreeting(npcId: string): string {
    const err = this.canText(npcId);
    if (err) return err;
    const def = NPC_BY_ID[npcId];
    const r = this.rel(npcId);
    r.flags.lastText = this.core.today();
    r.lastContact = this.core.now();
    const d = this.disposition(npcId);
    // texting someone you barely know is a little odd for reserved people
    const facets: Partial<Record<Facet, number>> = r.familiarity < 10 ? { attention: 0.08 } : { attention: 0.18 };
    this.applyDirect(npcId, { kind: 'texted', facets, importance: 2 }, { silent: true, noMemory: true });
    this.applyDelta(npcId, { familiarity: r.familiarity < 40 ? 0.6 : 0.2 });
    const warm = ['最近还好吗？有空一起吃饭。', '哈哈，正想起你呢。', '收到～这周忙完找你。', '谢谢惦记，我挺好的，你也照顾好自己。'];
    const neutral = ['嗯，挺好的。', '收到。', '最近有点忙，回头聊。'];
    const cold = ['……', '有事吗？', '嗯。'];
    const pool = d > 25 ? warm : d > -10 ? neutral : cold;
    const reply = pool[this.core.rng.int(0, pool.length - 1)];
    this.core.phone.send(npcId, def.name, reply);
    return `你给${def.name}发了条问候。`;
  }

  /** Record a conversation contact (limits farming of small talk). */
  touchContact(npcId: string): void {
    const r = this.rel(npcId);
    const day = this.core.today();
    if (r.talkDay !== day) {
      r.talkDay = day;
      r.talksToday = 0;
    }
    r.talksToday += 1;
    r.lastTalk = this.core.now();
    r.lastContact = this.core.now();
    r.met = true;
  }

  npcDef(id: string): NpcDef {
    return NPC_BY_ID[id];
  }
}
