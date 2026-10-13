import type { GameCore } from '../core/GameCore';
import { G, type Money } from '../core/money';
import { hashString } from '../core/rng';
import { DAYS_PER_MONTH, MINUTES_PER_DAY, toDate } from '../core/calendar';
import type { NpcRuntime } from '../core/state';
import { NPCS, NPC_BY_ID, type NpcDef, type ScheduleBlock } from '../data/npcs';
import { locationAnchor, travelMinutes } from '../world/maps/cityLayout';

export interface Whereabouts {
  loc: string | null;
  spot: string | null;
  act: string;
}

export const ACTIVITY_NAMES: Record<string, string> = {
  work: '工作中',
  leisure: '休闲',
  exercise: '运动',
  shop: '购物',
  drink: '喝酒',
  eat: '用餐',
  gamble: '赌博',
  watch: '旁观',
  busk: '街头演奏',
  home: '在家',
};

export function initialNpcRuntime(def: NpcDef): NpcRuntime {
  return {
    id: def.id,
    location: null,
    spot: null,
    activity: 'home',
    travel: null,
    mood: 10,
    stress: 20,
    money: def.startMoney,
    debt: def.startDebt,
    overrides: [],
    flags: {},
  };
}

/** Deterministic per-day chance roll so schedules are reproducible. */
function dayRoll(npc: string, day: number, idx: number): number {
  return (hashString(`${npc}|${day}|${idx}`) % 10000) / 10000;
}

/**
 * NPCs follow weekly schedules (with daily randomness), travel between places
 * in real game time, and keep their own finances.
 */
export class NPCManager {
  constructor(private core: GameCore) {}

  defs(): NpcDef[] {
    return NPCS;
  }

  def(id: string): NpcDef {
    return NPC_BY_ID[id];
  }

  rt(id: string): NpcRuntime {
    return this.core.state.npcs[id];
  }

  /** Which schedule block applies at absolute time t (later blocks win). */
  scheduled(def: NpcDef, t: number): Whereabouts {
    const d = toDate(t);
    let result: Whereabouts = { loc: null, spot: null, act: 'home' };
    def.schedule.forEach((b: ScheduleBlock, i) => {
      let startDay: number | null = null;
      if (b.days.includes(d.weekday) && d.minuteOfDay >= b.from && d.minuteOfDay < Math.min(b.to, MINUTES_PER_DAY)) startDay = d.dayIndex;
      const yesterday = (d.weekday + 6) % 7;
      if (b.to > MINUTES_PER_DAY && b.days.includes(yesterday) && d.minuteOfDay < b.to - MINUTES_PER_DAY) startDay = d.dayIndex - 1;
      if (startDay === null) return;
      if (b.chance !== undefined && dayRoll(def.id, startDay, i) >= b.chance) return;
      result = { loc: b.loc, spot: b.spot ?? null, act: b.act };
    });
    return result;
  }

  /** Effective target, considering temporary overrides and personal circumstances. */
  target(id: string, t: number): Whereabouts {
    const rt = this.rt(id);
    if (rt.overrides.length) {
      rt.overrides = rt.overrides.filter((o) => o.until > t);
      const o = rt.overrides.find((x) => t >= x.from);
      if (o) return { loc: o.location, spot: o.spot, act: o.activity };
    }
    const w = this.scheduled(this.def(id), t);
    // A broke gambler can't go to the casino; a banned one can't either.
    if (w.act === 'gamble' && (rt.money < G(40) || rt.flags.bustedTonight === Math.floor(t / MINUTES_PER_DAY))) return { loc: id === 'marco' ? 'bar' : null, spot: id === 'marco' ? 'bar_stool3' : null, act: id === 'marco' ? 'drink' : 'home' };
    return w;
  }

  setOverride(id: string, location: string | null, spot: string | null, activity: string, minutes: number, reason: string): void {
    this.setOverrideAt(id, this.core.now(), minutes, location, spot, activity, reason);
  }

  /** Commit an NPC to be somewhere during [at, at + minutes) — used by invitations. */
  setOverrideAt(id: string, at: number, minutes: number, location: string | null, spot: string | null, activity: string, reason: string): void {
    const rt = this.rt(id);
    if (!rt) return;
    rt.overrides.push({ location, spot, activity, from: at, until: at + minutes, reason });
    this.core.touch();
  }

  /** Per-minute movement update. */
  tick(t: number): void {
    for (const def of NPCS) {
      const rt = this.rt(def.id);
      if (rt.travel) {
        if (t >= rt.travel.arrive) {
          rt.location = rt.travel.to;
          rt.travel = null;
          const w = this.target(def.id, t);
          rt.spot = w.loc === rt.location ? w.spot : null;
          rt.activity = w.loc === rt.location ? w.act : 'home';
          this.core.bus.emit('npc:arrived', { id: def.id, location: rt.location });
        }
        continue;
      }
      const w = this.target(def.id, t);
      if (w.loc !== rt.location) {
        const from = locationAnchor(rt.location, rt.spot, def.district);
        const to = locationAnchor(w.loc, w.spot, def.district);
        const minutes = travelMinutes(from, to);
        const prev = rt.location;
        rt.travel = { from: prev, to: w.loc, depart: t, arrive: t + minutes };
        rt.location = null;
        rt.activity = 'travel';
        this.core.bus.emit('npc:departed', { id: def.id, from: prev, to: w.loc });
      } else if (w.spot !== rt.spot || w.act !== rt.activity) {
        rt.spot = w.spot;
        rt.activity = w.act;
        this.core.bus.emit('npc:moved', { id: def.id });
      }
    }
  }

  /** Place everyone instantly where they should be (new game / after load safety). */
  settle(t: number): void {
    for (const def of NPCS) {
      const rt = this.rt(def.id);
      const w = this.target(def.id, t);
      rt.location = w.loc;
      rt.spot = w.spot;
      rt.activity = w.act;
      rt.travel = null;
    }
  }

  npcsAt(location: string): NpcRuntime[] {
    return NPCS.map((d) => this.rt(d.id)).filter((r) => r.location === location && !r.travel);
  }

  travelling(): NpcRuntime[] {
    return NPCS.map((d) => this.rt(d.id)).filter((r) => r.travel);
  }

  where(id: string): string {
    const rt = this.rt(id);
    if (rt.travel) return '在路上';
    if (!rt.location) return '不在公共场所';
    return rt.location;
  }

  // ------------------------------------------------------------ NPC lives

  /** Daily finances: income, living costs, gambling (when not simulated live), debt dynamics. */
  dailyUpdate(day: number): void {
    const rng = this.core.rng;
    for (const def of NPCS) {
      const rt = this.rt(def.id);
      const dailyIncome = Math.round(def.income / DAYS_PER_MONTH);
      const living = Math.round(dailyIncome * (0.72 + def.traits.materialism * 0.25 - def.traits.prudence * 0.15));
      rt.money += dailyIncome - living;
      // debt service
      if (rt.debt > 0) {
        const pay = Math.min(rt.debt, Math.round(dailyIncome * 0.12), Math.max(0, rt.money));
        rt.money -= pay;
        rt.debt -= pay;
        rt.debt += Math.round((rt.debt * 0.18) / 336); // interest
      }
      // gamblers lose money over time when the player isn't there to see it
      const gambledYesterday = this.scheduledGambling(def, day - 1);
      if (gambledYesterday && rt.flags.liveGambleDay !== day - 1) {
        const stake = Math.max(G(10), Math.round(rt.money * 0.05));
        const rounds = rng.int(25, 70);
        const ev = -0.012 * stake * rounds;
        const sd = 1.15 * stake * Math.sqrt(rounds);
        const result = Math.round(rng.normal(ev, sd) / 100) * 100;
        rt.money += result;
        if (result >= G(800)) this.core.social.npcEvent(def.id, 'npc_big_win', { amount: result });
        if (result <= -G(800)) this.core.social.npcEvent(def.id, 'npc_big_loss', { amount: -result });
      }
      if (rt.money < 0) {
        // shortfall becomes (expensive) debt
        rt.debt += -rt.money;
        rt.money = 0;
      }
      // mood drift
      const pressure = rt.debt > def.income * 4 ? 25 : rt.debt > def.income * 2 ? 12 : 0;
      rt.stress = clamp(rt.stress + (pressure - (rt.stress - 20) * 0.1));
      rt.mood = clamp(rt.mood + (10 - pressure * 0.8 - rt.mood) * 0.15 + rng.range(-6, 6), -100, 100);
      rt.flags.inCrisis = rt.debt > def.income * 3.5 && rt.money < def.income * 0.5;
      // occasional life shocks (medical bills, car repairs...)
      if (rng.chance(0.012)) {
        const cost = Math.round((def.income * rng.range(0.3, 1.2)) / 100) * 100;
        rt.money -= cost;
        if (rt.money < 0) {
          rt.debt += -rt.money;
          rt.money = 0;
        }
        rt.flags.lastShock = day;
        rt.flags.lastShockAmount = cost;
        this.core.social.npcEvent(def.id, 'npc_hardship', { amount: cost });
      }
    }
  }

  private scheduledGambling(def: NpcDef, day: number): boolean {
    if (day < 0) return false;
    return def.schedule.some((b, i) => b.act === 'gamble' && b.days.includes(day % 7) && (b.chance === undefined || dayRoll(def.id, day, i) < b.chance));
  }

  /** Money an NPC can spare (for gifts, loans, covering a bill). */
  disposable(id: string): Money {
    const rt = this.rt(id);
    const def = this.def(id);
    return Math.max(0, rt.money - Math.round(def.income * 0.5));
  }
}

function clamp(v: number, lo = 0, hi = 100): number {
  return v < lo ? lo : v > hi ? hi : v;
}
