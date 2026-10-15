import type { GameCore } from '../core/GameCore';
import { formatG, mulRatio, type Money } from '../core/money';
import { JOBS, type JobDef } from '../data/jobs';
import type { JobState } from '../core/state';
import { MINUTES_PER_DAY, formatClock, toDate } from '../core/calendar';
import { runSteps } from '../core/steps';
import { LOCATIONS } from '../data/locations';

export interface ShiftInfo {
  job: JobState;
  def: JobDef;
  start: number;
  end: number;
  status: 'upcoming' | 'open' | 'late' | 'done' | 'missed';
}

export interface ShiftReport {
  jobTitle: string;
  hours: number;
  wage: Money;
  tips: Money;
  performance: number;
  late: number;
  notes: string[];
  promotionOffer: string | null;
}

export type CareerResult = { ok: true; message: string; report?: ShiftReport } | { ok: false; error: string };

/** What the player should know about a job right now (the HUD's work line). */
export interface AgendaItem {
  jobId: string;
  title: string;
  employer: string;
  location: string;
  /** the shift in question: today's, or the next one */
  start: number;
  end: number;
  status: 'upcoming' | 'open' | 'late' | 'leave' | 'next';
}

const LATE_GRACE = 10;

export class CareerSystem {
  constructor(private core: GameCore) {}

  private get c() {
    return this.core.state.career;
  }

  def(id: string): JobDef {
    return JOBS[id];
  }

  activeJobs(): JobState[] {
    return this.c.jobs.filter((j) => j.status === 'active');
  }

  job(id: string): JobState | undefined {
    return this.c.jobs.find((j) => j.jobId === id && j.status === 'active');
  }

  title(j: JobState): string {
    const d = this.def(j.jobId);
    return d.levels[Math.min(j.level, d.levels.length - 1)].title;
  }

  /** Per-hour wage for the job at its current level (salary jobs: salary / 20 workdays / shift hours). */
  hourlyRate(j: JobState): Money {
    const d = this.def(j.jobId);
    const mult = d.levels[Math.min(j.level, d.levels.length - 1)].payMult;
    if (d.payType === 'hourly') return Math.round(d.rate * mult);
    const hours = (d.end - d.start) / 60;
    return Math.round((d.rate * mult) / 20 / hours);
  }

  monthlyIncomeEstimate(): Money {
    let total = 0;
    for (const j of this.activeJobs()) {
      const d = this.def(j.jobId);
      if (d.flexible) continue;
      const mult = d.levels[Math.min(j.level, d.levels.length - 1)].payMult;
      if (d.payType === 'salary') total += Math.round(d.rate * mult);
      else total += Math.round(((d.rate * mult + (d.tipsPerHour ?? 0)) * (d.end - d.start)) / 60) * d.days.length * 4;
    }
    return total;
  }

  /** Shift window (absolute minutes) of a job on the given day, or null if not a workday. */
  shiftOn(def: JobDef, dayIndex: number): { start: number; end: number } | null {
    const weekday = dayIndex % 7;
    if (!def.days.includes(weekday)) return null;
    const base = dayIndex * MINUTES_PER_DAY;
    return { start: base + def.start, end: base + def.end };
  }

  /** The shift relevant right now (today's, or one that started yesterday and runs past midnight). */
  currentShift(jobId: string): ShiftInfo | null {
    const j = this.job(jobId);
    if (!j) return null;
    const def = this.def(jobId);
    if (def.flexible) return null;
    const now = this.core.now();
    const day = Math.floor(now / MINUTES_PER_DAY);
    for (const d of [day - 1, day]) {
      const w = this.shiftOn(def, d);
      if (!w) continue;
      if (now >= w.end && d === day - 1) continue;
      let status: ShiftInfo['status'];
      if (j.workedToday === d) status = 'done';
      else if (now < w.start - 60) status = 'upcoming';
      else if (now <= w.start + LATE_GRACE) status = 'open';
      else if (now < w.end - 30) status = 'late';
      else status = 'missed';
      return { job: j, def, start: w.start, end: w.end, status };
    }
    return null;
  }

  /**
   * One line per scheduled job: today's shift while it matters (upcoming,
   * open for clock-in, running late, or on leave), otherwise the next one.
   */
  agenda(): AgendaItem[] {
    const out: AgendaItem[] = [];
    const now = this.core.now();
    const today = Math.floor(now / MINUTES_PER_DAY);
    for (const j of this.activeJobs()) {
      const d = this.def(j.jobId);
      if (d.flexible) continue;
      const title = d.levels[Math.min(j.level, d.levels.length - 1)].title;
      const base = { jobId: j.jobId, title, employer: d.employer, location: d.location };
      const cur = this.currentShift(j.jobId);
      if (cur && (cur.status === 'upcoming' || cur.status === 'open' || cur.status === 'late')) {
        const day = Math.floor(cur.start / MINUTES_PER_DAY);
        out.push({ ...base, start: cur.start, end: cur.end, status: this.isExcused(j, day) ? 'leave' : cur.status });
        continue;
      }
      for (let k = 1; k <= 7; k++) {
        const w = this.shiftOn(d, today + k);
        if (w && w.start > now) {
          out.push({ ...base, start: w.start, end: w.end, status: 'next' });
          break;
        }
      }
    }
    return out.sort((a, b) => a.start - b.start);
  }

  upcomingShifts(): ShiftInfo[] {
    return this.activeJobs()
      .map((j) => this.currentShift(j.jobId))
      .filter((s): s is ShiftInfo => !!s && s.status !== 'done' && s.status !== 'missed');
  }

  /** Called when the player interacts with a work station. */
  canWork(jobId: string): string | null {
    const s = this.currentShift(jobId);
    if (!s) return '今天不是你的班';
    if (s.status === 'done') return '今天的班已经上完了';
    if (s.status === 'upcoming') return `还没到上班时间（${formatClock(s.start % MINUTES_PER_DAY)} 开始，可提前一小时打卡）`;
    if (s.status === 'missed') return '这个班次已经快结束了，算缺勤';
    if (this.core.state.world.location !== s.def.location) return '你不在工作地点';
    if (this.core.state.player.stats.drunk >= 55) return '你醉成这样，不能上班';
    return null;
  }

  workShift(jobId: string, leaveEarlyAt?: number): CareerResult {
    return runSteps(this.shiftSteps(jobId, leaveEarlyAt));
  }

  /** The same shift in a few steps, so the clock on screen can run through it (see GameCore.advanceSteps). */
  *shiftSteps(jobId: string, leaveEarlyAt?: number, steps = 1): Generator<number, CareerResult, void> {
    const err = this.canWork(jobId);
    if (err) return { ok: false, error: err };
    const s = this.currentShift(jobId)!;
    const now = this.core.now();
    const begin = Math.max(now, s.start);
    const endAt = Math.min(s.end, leaveEarlyAt ?? s.end);
    const lateBy = Math.max(0, now - s.start);
    const minutes = Math.max(30, endAt - begin);
    // Wait until the shift starts if early, then work.
    if (now < s.start) this.core.advance(s.start - now, 'idle');
    const eff = this.core.player.workEfficiency(s.def.skill);
    this.core.state.player.stats.stress = Math.min(100, this.core.state.player.stats.stress + (s.def.stressPerHour * minutes) / 60);
    const j = s.job;
    // mark the shift before time passes, so the end-of-shift absence check sees it
    j.workedToday = Math.floor(s.start / MINUTES_PER_DAY);
    const t0 = this.core.now();
    yield* this.core.advanceSteps(minutes, 'working', steps);
    const worked = Math.max(1, Math.min(minutes, this.core.now() - t0));
    const hours = worked / 60;
    const rate = this.hourlyRate(j);
    const wage = Math.round(rate * hours);
    let tips = 0;
    if (s.def.tipsPerHour) {
      const rng = this.core.rng;
      const social = this.core.state.player.skills.social;
      tips = Math.max(0, Math.round(s.def.tipsPerHour * hours * eff * (0.7 + social / 200) * rng.range(0.6, 1.4) / 100) * 100);
    }
    let perf = eff * 80 + this.core.rng.range(-6, 6);
    const notes: string[] = [];
    if (lateBy > LATE_GRACE) {
      perf -= Math.min(30, lateBy / 4);
      j.lates += 1;
      notes.push(`迟到了 ${lateBy} 分钟。`);
      this.core.social.applyDirect(s.def.boss, { kind: 'late_work', facets: { unreliability: 0.4 }, importance: 18 });
    }
    if (endAt < s.end) {
      perf -= 15;
      notes.push('提前离开了。');
    }
    if (this.core.state.player.stats.sleep < 25) notes.push('你困得睁不开眼，效率很低。');
    if (this.core.state.player.stats.stress > 70) notes.push('压力让你很难集中注意力。');
    if (this.core.state.player.stats.drunk > 20) notes.push('同事闻到了你身上的酒味。');
    perf = Math.max(5, Math.min(100, perf));
    j.performance = Math.round(j.performance * 0.8 + perf * 0.2);
    j.shifts += 1;
    j.lastShiftDay = Math.floor(s.start / MINUTES_PER_DAY);
    j.workedToday = Math.floor(s.start / MINUTES_PER_DAY);
    j.accrued += wage;
    const gain = this.core.player.addSkill(s.def.skill, 0.5 * hours * 0.5, 80);
    if (gain > 0.3) notes.push(`${s.def.skill === 'work' ? '职场能力' : '技能'}有所提升。`);
    if (tips > 0) this.core.economy.receive('cash', tips, 'tips', `${s.def.employer} 小费`, s.def.employer);
    // coworkers and boss get to know you
    for (const npc of [s.def.boss, ...s.def.coworkers]) {
      if (npc) this.core.social.applyDirect(npc, { kind: 'worked_together', facets: { attention: 0.3, diligence: perf > 70 ? 0.25 : 0 }, importance: 6 }, { silent: true });
    }
    if (perf < 40) this.core.social.applyDirect(s.def.boss, { kind: 'poor_work', facets: { unreliability: 0.25 }, importance: 14 });
    const promotionOffer = this.checkPromotion(j);
    this.core.journal.add('work', `在${s.def.employer}上了 ${hours.toFixed(1)} 小时班，表现 ${Math.round(perf)}/100。`);
    this.core.bus.emit('shift:done', { jobId, perf });
    return {
      ok: true,
      message: '下班了',
      report: { jobTitle: this.title(j), hours, wage, tips, performance: Math.round(perf), late: lateBy > LATE_GRACE ? lateBy : 0, notes, promotionOffer },
    };
  }

  /** Flexible gig work (courier). */
  workGig(jobId: string, hours: number): CareerResult {
    return runSteps(this.gigSteps(jobId, hours));
  }

  *gigSteps(jobId: string, hours: number, steps = 1): Generator<number, CareerResult, void> {
    const j = this.job(jobId);
    const d = this.def(jobId);
    if (!j || !d.flexible) return { ok: false, error: '没有这份零工' };
    const date = toDate(this.core.now());
    if (date.minuteOfDay < d.start || date.minuteOfDay + hours * 60 > d.end) return { ok: false, error: `接单时间为 ${formatClock(d.start)}–${formatClock(d.end)}` };
    if (this.core.state.player.stats.energy < 15) return { ok: false, error: '你太累了，骑不动车了' };
    if (this.core.state.player.stats.drunk >= 30) return { ok: false, error: '酒后不能骑车送单' };
    const eff = this.core.player.workEfficiency(d.skill);
    yield* this.core.advanceSteps(hours * 60, 'working', steps);
    this.core.player.change('energy', -d.energyPerHour * hours);
    this.core.player.change('hunger', d.hungerPerHour * hours);
    this.core.player.change('stress', d.stressPerHour * hours);
    const rate = this.hourlyRate(j);
    const pay = Math.round((rate * hours * (0.75 + eff * 0.3) * this.core.rng.range(0.8, 1.2)) / 100) * 100;
    const tips = Math.round(((d.tipsPerHour ?? 0) * hours * this.core.rng.range(0, 2)) / 100) * 100;
    j.accrued += pay + tips;
    j.shifts += 1;
    this.core.player.addSkill('fitness', 0.6 * hours, 70);
    this.core.journal.add('work', `跑了 ${hours} 小时闪送，预计收入 ${formatG(pay + tips)}（次日到账）。`);
    return { ok: true, message: `送了 ${hours} 小时外卖，收入 ${formatG(pay + tips)} 将在次日结算。`, report: { jobTitle: d.title, hours, wage: pay, tips, performance: Math.round(eff * 80), late: 0, notes: [], promotionOffer: null } };
  }

  private checkPromotion(j: JobState): string | null {
    const d = this.def(j.jobId);
    const next = d.levels[j.level + 1];
    if (!next) return null;
    // a boss who has promised you the next step asks for fewer shifts first
    const shifts = j.fastTrack ? Math.round(next.shiftsRequired * 0.6) : next.shiftsRequired;
    if (j.shifts >= shifts && j.performance >= next.perfRequired && j.warnings === 0) {
      const id = `promo:${j.jobId}:${j.level + 1}`;
      if (this.core.phone.hasRef(id)) return null;
      this.core.phone.send(d.boss ?? 'hr', d.bossName, `你最近的表现很稳定。我们想提拔你为「${next.title}」，薪资上调到原来的 ${Math.round(next.payMult * 100)}%。你愿意吗？`, [
        { id: `promote:${j.jobId}`, label: '接受升职' },
        { id: `decline_promote:${j.jobId}`, label: '暂时不考虑' },
      ], id);
      return next.title;
    }
    return null;
  }

  promote(jobId: string): CareerResult {
    const j = this.job(jobId);
    if (!j) return { ok: false, error: '没有这份工作' };
    const d = this.def(jobId);
    if (!d.levels[j.level + 1]) return { ok: false, error: '已经是最高职级' };
    j.level += 1;
    delete j.fastTrack;
    const t = this.title(j);
    this.core.journal.add('milestone', `升职为${d.employer}的${t}！`, true);
    this.core.player.change('confidence', 12);
    this.core.player.addMoodBuff('promotion', 12, 60 * 24 * 3, '升职了');
    this.core.social.broadcastEvent('promotion', { title: t, employer: d.employer });
    return { ok: true, message: `你现在是${t}了。` };
  }

  /** End-of-shift absence check and paydays, called every minute (cheap). */
  tickMinute(now: number, activity: string = 'idle'): void {
    for (const j of this.activeJobs()) {
      const d = this.def(j.jobId);
      if (d.flexible) continue;
      const day = Math.floor(now / MINUTES_PER_DAY);
      for (const sd of [day - 1, day]) {
        const w = this.shiftOn(d, sd);
        if (!w) continue;
        if (now === w.end && j.workedToday !== sd && !this.isExcused(j, sd)) this.recordAbsence(j, d);
        if (activity !== 'sleeping' && activity !== 'working') this.remind(j, d, w, sd, now);
      }
    }
  }

  /** A heads-up an hour and a quarter of an hour before a shift, and once when running late. */
  private remind(j: JobState, d: JobDef, w: { start: number; end: number }, day: number, now: number): void {
    if (j.workedToday === day || this.isExcused(j, day)) return;
    const there = this.core.state.world.location === d.location;
    const where = LOCATIONS[d.location]?.name ?? d.employer;
    if (now === w.start - 60 && !there) this.core.toast(`一小时后（${formatClock(d.start)}）要去${where}上班。按 M 打开地图可以查看路线。`, 'info');
    else if (now === w.start - 15 && !there) this.core.toast(`离上班只剩 15 分钟了（${where}，${formatClock(d.start)}）。`, 'warn');
    else if (now === w.start + LATE_GRACE + 1) this.core.toast(there ? `你已经迟到了，去工位打卡吧。` : `你上班已经迟到了。缺勤一整天会收到${d.bossName}的警告。`, 'bad');
  }

  private isExcused(j: JobState, day: number): boolean {
    return this.core.state.player.flags[`leave:${j.jobId}`] === day || j.hiredDay > day;
  }

  requestLeave(jobId: string): CareerResult {
    const j = this.job(jobId);
    if (!j) return { ok: false, error: '没有这份工作' };
    const d = this.def(jobId);
    const today = this.core.today();
    const used = Number(this.core.state.player.flags[`leaveCount:${jobId}`] ?? 0);
    if (used >= 6) return { ok: false, error: `${d.bossName}：「这个月你请的假太多了。」` };
    this.core.state.player.flags[`leave:${jobId}`] = today;
    this.core.state.player.flags[`leaveCount:${jobId}`] = used + 1;
    if (d.boss) this.core.social.applyDirect(d.boss, { kind: 'took_leave', facets: { unreliability: 0.08 }, importance: 5 }, { silent: true });
    return { ok: true, message: `已向${d.bossName}请了今天的假。` };
  }

  private recordAbsence(j: JobState, d: JobDef): void {
    j.absences += 1;
    j.performance = Math.max(0, j.performance - 12);
    const boss = d.boss;
    if (boss) this.core.social.applyDirect(boss, { kind: 'missed_work', facets: { unreliability: 0.8 }, importance: 30 });
    this.core.journal.add('work', `无故缺勤：错过了${d.employer}的班。`, true);
    const recent = j.absences;
    if (recent >= 3 || (recent >= 2 && j.warnings >= 1)) {
      this.fire(j, d, '多次无故缺勤');
      return;
    }
    j.warnings += 1;
    this.core.phone.send(boss ?? 'hr', d.bossName, j.warnings === 1 ? `你今天没来上班，也没有请假。这是第一次警告。` : `再有一次缺勤，你就不用来了。`);
  }

  fire(j: JobState, d: JobDef, reason: string): void {
    j.status = 'fired';
    this.c.history.push({ jobId: j.jobId, start: j.hiredDay, end: this.core.today(), reason, level: j.level });
    // final pay is still owed
    if (j.accrued > 0) {
      this.core.economy.receive('bank', j.accrued, 'salary', `${d.employer} 最终工资结算`, d.employer);
      j.accrued = 0;
    }
    this.core.player.change('confidence', -15);
    this.core.player.change('stress', 15);
    this.core.player.addMoodBuff('fired', -15, 60 * 24 * 4, '被解雇了');
    this.core.player.adjustReputation('trust', -6);
    this.core.journal.add('work', `被${d.employer}解雇了（${reason}）。`, true);
    this.core.phone.send(d.boss ?? 'hr', d.bossName, `很遗憾，由于${reason}，公司决定与你解除劳动关系。最后的工资会打到你的账户上。`);
    this.core.social.broadcastEvent('fired', { employer: d.employer });
  }

  quit(jobId: string): CareerResult {
    const j = this.job(jobId);
    if (!j) return { ok: false, error: '没有这份工作' };
    const d = this.def(jobId);
    j.status = 'quit';
    this.c.history.push({ jobId, start: j.hiredDay, end: this.core.today(), reason: '主动辞职', level: j.level });
    if (j.accrued > 0) {
      this.core.economy.receive('bank', j.accrued, 'salary', `${d.employer} 离职工资结算`, d.employer);
      j.accrued = 0;
    }
    this.core.journal.add('work', `辞去了${d.employer}的工作。`, true);
    return { ok: true, message: `你辞去了${d.title}的工作。` };
  }

  /** Paydays and gig settlements, called once a day at 09:00. */
  processPay(): void {
    const day = this.core.today();
    for (const j of this.activeJobs()) {
      const d = this.def(j.jobId);
      if (day >= j.nextPayDay) {
        if (j.accrued > 0) {
          const amount = j.accrued;
          j.accrued = 0;
          this.core.economy.receive('bank', amount, 'salary', `${d.employer} 工资`, d.employer);
          if (!d.flexible) this.core.phone.send('bank', '灰港储蓄信托', `【入账提醒】${d.employer} 工资 ${formatG(amount)} 已到账。`);
          this.core.player.addMoodBuff('payday', 5, 60 * 12, '发工资了');
        }
        j.nextPayDay = day + d.payEveryDays;
      }
    }
  }

  requirementsMet(jobId: string): string | null {
    const d = this.def(jobId);
    const p = this.core.state.player;
    if (this.job(jobId)) return '你已经在做这份工作了';
    for (const [k, v] of Object.entries(d.requirements.skills ?? {})) {
      if ((p.skills as Record<string, number>)[k] < (v as number)) return `能力不足（需要${k === 'finance' ? '理财' : k === 'work' ? '职场' : k === 'social' ? '社交' : k === 'cards' ? '牌桌知识' : k}能力 ${v}）`;
    }
    if (d.requirements.minOutfit && (this.core.inventory.currentOutfit().prestige ?? 0) < d.requirements.minOutfit) return '着装不符合要求（面试时请穿得更正式）';
    if (d.requirements.minTrust !== undefined && p.reputation.trust < d.requirements.minTrust) return '你的社会信誉不足';
    if (d.requirements.minCredit && p.creditScore < d.requirements.minCredit) return `信用分不足（需要 ${d.requirements.minCredit}）`;
    // schedule clash
    for (const j of this.activeJobs()) {
      const other = this.def(j.jobId);
      if (other.flexible || d.flexible) continue;
      const clash = d.days.some((day) => other.days.includes(day) && d.start < other.end && other.start < d.end);
      if (clash) return `与「${other.title}」的工作时间冲突`;
    }
    return null;
  }

  apply(jobId: string): CareerResult {
    const err = this.requirementsMet(jobId);
    if (err) return { ok: false, error: err };
    if (this.c.applications.some((a) => a.jobId === jobId && a.status === 'pending')) return { ok: false, error: '你已经投过简历了，请等待回复' };
    const d = this.def(jobId);
    if (d.flexible) {
      this.hire(jobId);
      return { ok: true, message: `注册成功！你现在可以在手机上接${d.title}的单了。` };
    }
    this.c.applications.push({ jobId, day: this.core.today(), decideDay: this.core.today() + 1, status: 'pending' });
    return { ok: true, message: `已向${d.employer}投递简历，通常会在第二天回复。` };
  }

  processApplications(): void {
    const day = this.core.today();
    for (const a of this.c.applications) {
      if (a.status !== 'pending' || a.decideDay > day) continue;
      const d = this.def(a.jobId);
      const err = this.requirementsMet(a.jobId);
      const p = this.core.state.player;
      const chance = err ? 0 : Math.min(0.95, 0.55 + p.reputation.trust / 200 + p.skills.social / 300 + (p.creditScore - 600) / 1000);
      if (this.core.rng.chance(chance)) {
        a.status = 'accepted';
        this.hire(a.jobId);
        this.core.phone.send('hr', d.employer, `恭喜！你被录用为「${d.title}」。${d.desc}`);
      } else {
        a.status = 'rejected';
        this.core.phone.send('hr', d.employer, `感谢你的申请。很遗憾，我们这次决定选择其他候选人。${err ? `（${err}）` : ''}`);
      }
    }
  }

  hire(jobId: string): JobState {
    const d = this.def(jobId);
    const day = this.core.today();
    const existing = this.c.jobs.find((j) => j.jobId === jobId);
    const state: JobState = {
      jobId,
      level: 0,
      performance: 60,
      hiredDay: day,
      shifts: 0,
      lates: 0,
      absences: 0,
      warnings: 0,
      lastShiftDay: -1,
      accrued: 0,
      nextPayDay: day + d.payEveryDays,
      workedToday: -1,
      status: 'active',
      promotionsDeclined: 0,
    };
    if (existing) Object.assign(existing, state);
    else this.c.jobs.push(state);
    this.core.journal.add('work', `开始在${d.employer}担任${d.title}。`, true);
    return existing ?? state;
  }

  /** Monthly reset of attendance counters (a fresh start each month). */
  monthlyReset(): void {
    for (const j of this.activeJobs()) {
      j.absences = Math.max(0, j.absences - 1);
      if (j.performance > 65 && j.warnings > 0) j.warnings -= 1;
      this.core.state.player.flags[`leaveCount:${j.jobId}`] = 0;
    }
  }

  estimateShiftPay(jobId: string): Money {
    const j = this.job(jobId);
    if (!j) return 0;
    const d = this.def(jobId);
    return mulRatio(this.hourlyRate(j), d.end - d.start, 60);
  }
}
