import type { GameCore } from '../src/core/GameCore';
import { G, type Money } from '../src/core/money';
import { MINUTES_PER_DAY, toDate } from '../src/core/calendar';
import { HOMES } from '../src/data/housing';
import { playBlackjackRound } from './helpers';

/** How a simulated player lives. */
export interface Habits {
  works: boolean;
  /** evenings at the casino: weekday indices (0 = Monday) */
  casinoDays: number[];
  /** share of liquid money brought to the casino per visit */
  casinoShare: number;
  /** hours at the table per visit */
  casinoHours: number;
}

export const ARCHETYPES: Record<string, Habits> = {
  diligent: { works: true, casinoDays: [], casinoShare: 0, casinoHours: 0 },
  weekend: { works: true, casinoDays: [4, 5], casinoShare: 0.05, casinoHours: 3 },
  heavy: { works: true, casinoDays: [0, 1, 2, 3, 4, 5, 6], casinoShare: 0.2, casinoHours: 5 },
  idle: { works: false, casinoDays: [], casinoShare: 0, casinoHours: 0 },
};

function home(core: GameCore): string {
  return HOMES[core.state.housing.homeId].location;
}

function goTo(core: GameCore, loc: string, minutes = 20): void {
  if (core.state.world.location !== loc) {
    core.advance(minutes, 'idle');
    core.setLocation(loc, -1, -1);
  }
}

function meals(core: GameCore): number {
  return core.inventory.count('meal_basic') + core.inventory.count('meal_fresh');
}

function eat(core: GameCore): void {
  if (!core.isAtHome()) return;
  if (core.inventory.count('meal_basic') > 0) core.inventory.use('meal_basic');
  else if (core.inventory.count('meal_fresh') > 0) core.inventory.use('meal_fresh');
}

function shop(core: GameCore): void {
  if (meals(core) >= 4) return;
  goTo(core, 'store');
  core.inventory.buy('store', 'groceries_basic', 'card', 3);
  goTo(core, home(core));
}

/** Wait until a time of the simulated day that began at `dayStart` (never into the next one). */
function waitUntil(core: GameCore, dayStart: number, minuteOfDay: number): void {
  const target = dayStart * MINUTES_PER_DAY + minuteOfDay;
  if (core.now() < target) core.advance(target - core.now(), 'idle');
}

function casinoNight(core: GameCore, h: Habits): void {
  const liquid = core.economy.balance('cash') + core.economy.balance('bank');
  const bring = Math.floor((liquid * h.casinoShare) / G(10)) * G(10);
  if (bring < G(50)) return;
  goTo(core, 'casino');
  const fromCash = Math.min(bring, core.economy.balance('cash'));
  if (fromCash > 0) core.economy.buyChips(fromCash, 'cash');
  if (bring - fromCash > 0) core.economy.buyChips(bring - fromCash, 'bank');
  const table = 'bj2';
  const sit = core.casino.sit(table);
  if (sit.ok) {
    const end = core.now() + h.casinoHours * 60;
    const minBet = (core.casino.config(table).rules as { minBet?: number }).minBet ?? G(10);
    const bet = Math.max(minBet, Math.floor((bring * 0.05) / G(5)) * G(5));
    while (core.now() < end) {
      const chips = core.casino.availableChips();
      if (chips < bet) break;
      try {
        playBlackjackRound(core, table, bet);
      } catch {
        break;
      }
      core.advance(2, 'gambling');
    }
    core.casino.standUp();
  }
  const left = core.economy.balance('chips');
  if (left > 0) core.economy.cashOutChips(left);
  goTo(core, home(core));
}

/** One simulated day, starting around 07:00 at home. */
export function liveDay(core: GameCore, h: Habits): void {
  const d = toDate(core.now());
  const day = d.dayIndex;
  eat(core);
  const weekday = d.weekday <= 4;
  if (h.works && weekday && core.state.career.jobs.some((j) => j.jobId === 'office_clerk' && j.status === 'active')) {
    waitUntil(core, day, 8 * 60 + 25);
    goTo(core, 'office', 25);
    core.career.workShift('office_clerk');
  } else {
    waitUntil(core, day, 12 * 60);
    eat(core);
  }
  shop(core);
  waitUntil(core, day, 18 * 60 + 30);
  goTo(core, home(core));
  eat(core);
  if (h.casinoDays.includes(d.weekday)) casinoNight(core, h);
  // to bed by 23:00, up at 07:00
  waitUntil(core, day, 23 * 60);
  if (core.state.world.location !== home(core)) goTo(core, home(core));
  const m = toDate(core.now()).minuteOfDay;
  const toSeven = m < 7 * 60 ? 7 * 60 - m : MINUTES_PER_DAY - m + 7 * 60;
  if (core.canSleep() === null) core.sleep(Math.max(1, toSeven / 60));
  else core.advance(Math.max(1, toSeven), 'idle');
}

export interface LifeReport {
  start: Money;
  end: Money;
  min: Money;
  monthly: Money[];
  salary: Money;
  casinoNet: Money;
  rentPaid: Money;
  food: Money;
  evicted: boolean;
  job: string;
  conserved: boolean;
  home: string;
}

export function liveFor(core: GameCore, h: Habits, days: number): LifeReport {
  const start = core.economy.netWorth();
  let min = start;
  const monthly: Money[] = [];
  let conserved = true;
  const startHome = core.state.housing.homeId;
  let evicted = false;
  core.bus.on('evicted', () => (evicted = true));
  for (let i = 0; i < days; i++) {
    liveDay(core, h);
    const nw = core.economy.netWorth();
    min = Math.min(min, nw);
    if ((i + 1) % 28 === 0) monthly.push(nw);
    if (!core.economy.checkConservation().ok) conserved = false;
  }
  const by = core.state.economy.lifetimeByCat;
  const st = core.state.casino.stats.byGame;
  return {
    start,
    end: core.economy.netWorth(),
    min,
    monthly,
    salary: by.salary ?? 0,
    casinoNet: Object.values(st).reduce((a, g) => a + g.net, 0),
    rentPaid: by.rent ?? 0,
    food: (by.groceries ?? 0) + (by.food ?? 0),
    evicted: evicted || core.state.housing.homeId !== startHome,
    job: core.state.career.jobs.find((j) => j.jobId === 'office_clerk')?.status ?? 'none',
    conserved,
    home: core.state.housing.homeId,
  };
}
