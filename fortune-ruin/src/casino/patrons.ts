import { G, type Money } from '../core/money';
import type { Rng } from '../core/rng';
import type { GameKind, Patron } from '../core/state';
import type { BacHistoryEntry, BacSide } from './BaccaratEngine';
import { outsideNumbers, type RouletteBetKind } from './RouletteEngine';
import type { TableArea } from './tables';

const MALE = ['卡尔', '汉斯', '罗伯特', '杰森', '威廉', '陈先生', '老王', '李伟', '阿明', '赵先生', '弗兰克', '乔治', '亨利', '彼得', '托尼', '雷', '山姆', '迈克', '伊凡', '拉斐尔', '何先生', '大刘', '保罗', '马丁'];
const FEMALE = ['安娜', '玛丽亚', '苏珊', '露西', '海伦', '张女士', '林小姐', '美玲', '凯特', '罗莎', '艾米', '薇薇安', '黛西', '娜迪亚', '克拉拉', '周太太', '莎拉', '伊莲娜'];

export function generatePatron(id: string, rng: Rng, area: TableArea, favorite: GameKind, now: number): Patron {
  const female = rng.chance(0.42);
  const name = rng.pick(female ? FEMALE : MALE);
  const scale = area === 'vip' ? 160 : area === 'high' ? 20 : 1;
  // log-normal bankroll, median ≈ 450 G on the main floor
  const bankroll = Math.max(G(60), Math.round((Math.exp(rng.normal(Math.log(450), 0.75)) * scale) / 5) * 5 * 100);
  const skill = Math.min(0.97, Math.max(0.05, rng.normal(0.55, 0.22)));
  const styleRoll = rng.float();
  const style: Patron['style'] = skill > 0.85 ? 'basic' : styleRoll < 0.35 ? 'cautious' : styleRoll < 0.7 ? 'dealer-mimic' : 'reckless';
  return {
    id,
    name,
    look: rng.int(0, 9999) * 2 + (female ? 1 : 0),
    bankroll,
    startBankroll: bankroll,
    risk: Math.min(0.25, Math.max(0.015, rng.normal(0.06, 0.035))),
    skill,
    mood: rng.int(-10, 30),
    favorite,
    style,
    superstition: rng.float(),
    seat: null,
    arriveAt: now,
    leaveAt: now + rng.int(45, 300),
    stopLoss: rng.range(0.05, 0.55),
    winGoal: style === 'reckless' ? rng.range(2.2, 5) : rng.range(1.3, 2.4),
    wins: 0,
    losses: 0,
    streak: 0,
    state: 'arriving',
  };
}

/** Give a patron a name nobody else at the table has (same gender list). */
export function uniqueName(p: Patron, taken: ReadonlySet<string>, rng: Rng): void {
  if (!taken.has(p.name)) return;
  const pool = (p.look % 2 === 1 ? FEMALE : MALE).filter((n) => !taken.has(n));
  if (pool.length) p.name = rng.pick(pool);
}

/** Round to the table's betting unit and clamp to limits/bankroll. */
function clampBet(amount: number, min: Money, max: Money, bankroll: Money): Money {
  const unit = min >= G(100) ? G(25) : G(5);
  let a = Math.round(amount / unit) * unit;
  a = Math.max(min, Math.min(max, a));
  if (a > bankroll) a = Math.floor(bankroll / unit) * unit;
  return a >= min ? a : 0;
}

/** How much a patron wants to stake on the next round (0 = sits out / leaves). */
export function patronBetSize(p: Patron, min: Money, max: Money, rng: Rng): Money {
  let base = p.bankroll * p.risk;
  // chasing losses or pressing wins depending on temperament
  if (p.streak <= -2) base *= p.style === 'reckless' ? 1.8 : p.style === 'cautious' ? 0.7 : 1.1;
  if (p.streak >= 2) base *= p.style === 'cautious' ? 1 : 1.3;
  base *= rng.range(0.75, 1.3);
  return clampBet(base, min, max, p.bankroll);
}

export function patronWantsToLeave(p: Patron, now: number, min: Money): boolean {
  if (p.bankroll < min) return true;
  if (p.bankroll <= p.startBankroll * p.stopLoss) return true;
  if (p.bankroll >= p.startBankroll * p.winGoal) return true;
  return now >= p.leaveAt;
}

/** Baccarat side choice: superstitious players read the road; others favour Banker. */
export function patronBaccaratSide(p: Patron, history: BacHistoryEntry[], rng: Rng): BacSide {
  const last = history.filter((h) => h.w !== 'T').slice(-4).map((h) => h.w);
  if (rng.chance(0.04 + p.superstition * 0.05)) return 'tie';
  if (p.superstition > 0.5 && last.length >= 2) {
    const streak = last.length >= 3 && last.slice(-3).every((x) => x === last[last.length - 1]);
    const chop = last.length >= 4 && last.every((x, i) => i === 0 || x !== last[i - 1]);
    if (streak) return last[last.length - 1] === 'B' ? 'banker' : 'player';
    if (chop) return last[last.length - 1] === 'B' ? 'player' : 'banker';
  }
  return rng.chance(0.58 + p.skill * 0.15) ? 'banker' : 'player';
}

export interface RouletteChoice {
  kind: RouletteBetKind;
  numbers: number[];
  share: number;
}

/** A patron's roulette betting pattern for one spin. */
export function patronRouletteBets(p: Patron, rng: Rng): RouletteChoice[] {
  const lucky = (p.look % 36) + 1;
  if (p.style === 'cautious') {
    const k = rng.pick(['red', 'black', 'odd', 'even', 'low', 'high'] as RouletteBetKind[]);
    return [{ kind: k, numbers: outsideNumbers(k), share: 1 }];
  }
  if (p.style === 'reckless') {
    const picks = new Set<number>([lucky]);
    while (picks.size < rng.int(3, 6)) picks.add(rng.int(0, 36));
    return [...picks].map((n) => ({ kind: 'straight' as const, numbers: [n], share: 1 / picks.size }));
  }
  const out: RouletteChoice[] = [];
  if (rng.chance(0.6)) {
    const d = rng.int(0, 2);
    out.push({ kind: rng.chance(0.5) ? 'dozen' : 'column', numbers: rng.chance(0.5) ? outsideNumbers('dozen', d) : outsideNumbers('column', d), share: 0.5 });
  }
  if (rng.chance(0.7)) out.push({ kind: 'straight', numbers: [lucky], share: 0.2 });
  const k = rng.pick(['red', 'black'] as RouletteBetKind[]);
  out.push({ kind: k, numbers: outsideNumbers(k), share: 0.6 });
  // fix kinds for dozen/column numbers
  return out.map((c) => {
    if (c.kind === 'dozen' || c.kind === 'column') {
      const isDozen = [0, 1, 2].some((i) => outsideNumbers('dozen', i).join() === c.numbers.join());
      return { ...c, kind: isDozen ? 'dozen' : 'column' };
    }
    return c;
  });
}

export function patronReaction(p: Patron, net: Money, stake: Money): string | null {
  if (stake <= 0) return null;
  const ratio = net / stake;
  if (ratio >= 7) return '!!';
  if (ratio >= 1.4) return '!';
  if (ratio > 0) return p.streak >= 3 ? '♪' : null;
  if (p.streak <= -4) return p.style === 'reckless' ? '💢' : '…';
  if (ratio <= -1.9) return '💢';
  return null;
}
