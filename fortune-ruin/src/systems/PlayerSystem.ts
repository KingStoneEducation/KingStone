import type { GameCore } from '../core/GameCore';
import type { PlayerStats, SkillId } from '../core/state';

export type Activity = 'idle' | 'walking' | 'gambling' | 'working' | 'sleeping' | 'talking' | 'exercising' | 'eating' | 'reading';

export type LeisureKind = 'tv' | 'piano' | 'exercise' | 'bench';

export const STAT_NAMES: Record<keyof PlayerStats, string> = {
  energy: '体力',
  hunger: '饥饿',
  sleep: '睡眠',
  stress: '压力',
  mood: '情绪',
  confidence: '自信',
  impulsivity: '冲动',
  social: '社交',
  health: '健康',
  drunk: '醉意',
};

export const SKILL_NAMES: Record<SkillId, string> = {
  work: '职场能力',
  finance: '理财能力',
  social: '社交能力',
  fitness: '体能',
  service: '服务技能',
  cards: '牌桌知识',
};

const clamp = (v: number, lo = 0, hi = 100) => (v < lo ? lo : v > hi ? hi : v);

export const BASE_IMPULSIVITY: Record<string, number> = { cautious: 22, bold: 48, sociable: 36, rational: 18 };

/**
 * Needs and emotional state. These affect movement, work performance,
 * available dialogue choices and how NPCs perceive the player — but never
 * the mathematics of any casino game.
 */
export class PlayerSystem {
  activity: Activity = 'idle';

  constructor(private core: GameCore) {}

  get p() {
    return this.core.state.player;
  }

  get stats(): PlayerStats {
    return this.core.state.player.stats;
  }

  change(stat: keyof PlayerStats, delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) return;
    this.stats[stat] = clamp(this.stats[stat] + delta);
    this.core.touch();
  }

  applyEffects(effects: Partial<Record<keyof PlayerStats, number>>): void {
    for (const [k, v] of Object.entries(effects)) this.change(k as keyof PlayerStats, v as number);
  }

  adjustCredit(delta: number, reason: string): void {
    const before = this.p.creditScore;
    this.p.creditScore = Math.round(clamp(before + delta, 300, 850));
    if (Math.abs(delta) >= 20) this.core.journal.add('money', `信用分 ${delta > 0 ? '+' : ''}${delta}（${reason}），当前 ${this.p.creditScore}`);
    this.core.touch();
  }

  adjustReputation(kind: 'social' | 'casino' | 'trust', delta: number): void {
    this.p.reputation[kind] = clamp(this.p.reputation[kind] + delta, -100, 100);
    this.core.touch();
  }

  addSkill(skill: SkillId, amount: number, cap = 100): number {
    const cur = this.p.skills[skill];
    if (cur >= cap) return 0;
    // diminishing returns near the cap
    const gain = Math.min(cap - cur, amount * (1 - cur / 140));
    this.p.skills[skill] = Math.round((cur + gain) * 10) / 10;
    this.core.touch();
    return gain;
  }

  addMoodBuff(id: string, amount: number, minutes: number, label: string): void {
    const now = this.core.now();
    const existing = this.p.moodBuffs.find((b) => b.id === id);
    if (existing) {
      existing.amount = amount;
      existing.until = now + minutes;
      existing.label = label;
    } else {
      this.p.moodBuffs.push({ id, amount, until: now + minutes, label });
    }
    this.change('mood', amount * 0.35);
  }

  moodTarget(): number {
    const s = this.stats;
    let t = 56;
    t -= Math.max(0, s.hunger - 45) * 0.35;
    t -= Math.max(0, 40 - s.sleep) * 0.45;
    t -= Math.max(0, s.stress - 35) * 0.4;
    t -= Math.max(0, 35 - s.social) * 0.3;
    t -= Math.max(0, 50 - s.health) * 0.3;
    t += Math.min(12, s.drunk * 0.25);
    t += this.core.housing.comfort() * 25;
    for (const b of this.p.moodBuffs) t += b.amount;
    return clamp(t);
  }

  /** Per-minute needs update. */
  tick(minutes: number, activity: Activity): void {
    const s = this.stats;
    const now = this.core.now();
    if (activity === 'sleeping') {
      const comfort = 1 + this.core.housing.comfort();
      s.sleep = clamp(s.sleep + 0.2 * comfort * minutes);
      s.energy = clamp(s.energy + 0.19 * comfort * minutes);
      s.stress = clamp(s.stress - 0.035 * comfort * minutes);
      s.hunger = clamp(s.hunger + 0.045 * minutes);
      s.health = clamp(s.health + 0.012 * minutes);
      s.drunk = clamp(s.drunk - 0.16 * minutes);
      s.impulsivity = clamp(s.impulsivity + (this.baseImpulsivity() - s.impulsivity) * 0.004 * minutes);
    } else {
      const sleepRate = 0.085 + (s.drunk > 30 ? 0.02 : 0) + (activity === 'gambling' ? 0.01 : 0);
      s.sleep = clamp(s.sleep - sleepRate * minutes);
      let e = 0;
      switch (activity) {
        case 'walking':
          e = -0.03;
          break;
        case 'gambling':
          e = -0.022;
          break;
        case 'exercising':
          e = -0.16;
          break;
        case 'working':
          e = -0.05;
          break;
        case 'talking':
          e = -0.006;
          break;
        case 'idle':
        case 'eating':
        case 'reading':
          e = 0.012;
          break;
      }
      if (s.hunger > 60) e -= 0.02;
      if (s.sleep < 20) e -= 0.02;
      s.energy = clamp(s.energy + e * minutes);
      s.hunger = clamp(s.hunger + (activity === 'exercising' ? 0.2 : 0.11) * minutes);
      // stress pressures
      let st = -0.01;
      if (this.core.economy.overdueBills().length > 0) st += 0.012;
      if (s.sleep < 25) st += 0.01;
      if (s.hunger > 70) st += 0.01;
      if (activity === 'exercising') st -= 0.06;
      s.stress = clamp(s.stress + st * minutes);
      s.social = clamp(s.social - (activity === 'talking' ? -0.4 : 0.018) * minutes);
      s.drunk = clamp(s.drunk - 0.1 * minutes);
      // health
      let h = 0.003;
      if (s.hunger > 88) h -= 0.03;
      if (s.sleep < 6) h -= 0.02;
      if (s.drunk > 70) h -= 0.015;
      s.health = clamp(s.health + h * minutes);
      // impulsivity drifts to a target raised by alcohol, stress and fatigue
      const impTarget = this.baseImpulsivity() + s.drunk * 0.35 + Math.max(0, s.stress - 50) * 0.3 + Math.max(0, 30 - s.sleep) * 0.3;
      s.impulsivity = clamp(s.impulsivity + (impTarget - s.impulsivity) * 0.01 * minutes);
    }
    // mood eases toward target, confidence toward 50
    s.mood = clamp(s.mood + (this.moodTarget() - s.mood) * 0.015 * minutes);
    s.confidence = clamp(s.confidence + (50 - s.confidence) * 0.0015 * minutes);
    // expire buffs
    if (this.p.moodBuffs.length) this.p.moodBuffs = this.p.moodBuffs.filter((b) => b.until > now);
    this.core.touch();
  }

  baseImpulsivity(): number {
    return BASE_IMPULSIVITY[this.p.personality] ?? 30;
  }

  /** Movement speed multiplier from fatigue, hunger and alcohol. */
  speedMultiplier(): number {
    const s = this.stats;
    let m = 1;
    if (s.sleep < 20) m -= 0.18;
    if (s.sleep < 8) m -= 0.12;
    if (s.energy < 15) m -= 0.15;
    if (s.hunger > 85) m -= 0.1;
    if (s.drunk > 55) m -= 0.12;
    return Math.max(0.45, m);
  }

  /** Work efficiency 0.3..1.25 */
  workEfficiency(skill: SkillId): number {
    const s = this.stats;
    let e = 1;
    e -= Math.max(0, 45 - s.sleep) / 85;
    e -= Math.max(0, 30 - s.energy) / 110;
    e -= Math.max(0, s.stress - 60) / 120;
    e -= Math.max(0, s.hunger - 60) / 130;
    e -= s.drunk / 140;
    e += (s.mood - 50) / 260;
    e += this.p.skills[skill] / 420;
    return Math.max(0.3, Math.min(1.25, e));
  }

  statusTags(): { label: string; tone: 'bad' | 'warn' | 'good' }[] {
    const s = this.stats;
    const out: { label: string; tone: 'bad' | 'warn' | 'good' }[] = [];
    if (s.hunger >= 85) out.push({ label: '饿坏了', tone: 'bad' });
    else if (s.hunger >= 60) out.push({ label: '饿了', tone: 'warn' });
    if (s.sleep <= 10) out.push({ label: '极度困倦', tone: 'bad' });
    else if (s.sleep <= 25) out.push({ label: '困倦', tone: 'warn' });
    if (s.energy <= 18) out.push({ label: '疲惫', tone: 'warn' });
    if (s.stress >= 75) out.push({ label: '压力很大', tone: 'bad' });
    else if (s.stress >= 55) out.push({ label: '有压力', tone: 'warn' });
    if (s.mood <= 22) out.push({ label: '情绪低落', tone: 'bad' });
    else if (s.mood >= 80) out.push({ label: '心情很好', tone: 'good' });
    if (s.drunk >= 55) out.push({ label: '醉了', tone: 'bad' });
    else if (s.drunk >= 25) out.push({ label: '微醺', tone: 'warn' });
    if (s.impulsivity >= 70) out.push({ label: '上头', tone: 'bad' });
    if (s.social <= 18) out.push({ label: '孤独', tone: 'warn' });
    if (s.health <= 35) out.push({ label: '身体不适', tone: 'bad' });
    if (s.confidence >= 80) out.push({ label: '自信', tone: 'good' });
    return out;
  }

  /**
   * Small pastimes found around the world. Each one costs game time and
   * changes needs/skills; none of them touches any game odds.
   */
  leisure(kind: LeisureKind): { ok: boolean; text: string } {
    const core = this.core;
    const s = this.stats;
    switch (kind) {
      case 'tv': {
        core.advance(60, 'idle');
        this.change('stress', -5);
        this.change('energy', 2);
        this.addMoodBuff('tv', 3, 180, '放松了一会儿');
        const shows = ['一部老电影', '灰港本地新闻', '一档美食节目', '纪录片《港口百年》', '职业篮球赛转播'];
        return { ok: true, text: `看了一小时电视（${shows[Math.floor(core.rng.float() * shows.length)]}）。` };
      }
      case 'piano': {
        core.advance(30, 'idle');
        this.change('stress', -7);
        this.addMoodBuff('piano', 4, 240, '弹了会儿琴');
        const gain = this.addSkill('social', 0.15);
        return { ok: true, text: `你坐在钢琴前弹了半小时。${gain > 0 ? '指法渐渐熟练了些。' : ''}` };
      }
      case 'exercise': {
        if (s.energy < 20) return { ok: false, text: '你太累了，现在练不动。' };
        if (s.hunger > 80) return { ok: false, text: '饿着肚子运动容易头晕，先吃点东西吧。' };
        core.advance(45, 'exercising');
        const gain = this.addSkill('fitness', 1.2);
        this.change('health', 2);
        this.addMoodBuff('exercise', 5, 300, '运动后的畅快');
        return { ok: true, text: `运动了 45 分钟，出了一身汗。体能 +${gain.toFixed(1)}` };
      }
      case 'bench': {
        core.advance(20, 'idle');
        this.change('stress', -3);
        return { ok: true, text: '你在长椅上坐了一会儿，看着来来往往的人。' };
      }
    }
  }

  /** True when the character can no longer stay awake. */
  mustCollapse(): 'sleep' | 'health' | null {
    if (this.stats.health <= 0.5) return 'health';
    if (this.stats.sleep <= 0.2) return 'sleep';
    return null;
  }
}
