import type { GameCore } from '../core/GameCore';
import { G, formatG, type Money } from '../core/money';
import { hashString } from '../core/rng';
import type { NpcLoan } from '../core/state';
import { NPCS, NPC_BY_ID } from '../data/npcs';

/** A loan between friends is meant to come back within two weeks. */
export const LOAN_DAYS = 14;
/** After this many days past its day, the lender gives up on it. */
export const GIVE_UP_DAYS = 40;
/** How close a friend has to be before you ask them for money. */
export const ASK_TIE = 40;
/** Monthly income from which people do not borrow from friends. */
const RICH_INCOME = G(30000);
/** Never asking the same people every day: at most one loan in this many days. */
const BORROW_GAP = 10;

/** A deterministic roll that does not disturb the world's random stream. */
function roll(key: string): number {
  return (hashString(key) % 10000) / 10000;
}

/**
 * Money between the city's people. Someone in trouble (deep in debt, or nearly
 * broke) asks their closest friend who can spare it; the generous and the loyal
 * say yes more often, the careful and the materialistic less. They pay it back
 * out of what they have over their own needs. Past its day, an unpaid loan sours
 * the friendship a little every day (and the two may have words when they meet);
 * after long enough the lender gives up on it. The player can step in and pay a
 * friend's debt.
 */
export class NpcLendingSystem {
  constructor(private core: GameCore) {}

  private get s() {
    return this.core.state.social;
  }

  loans(): NpcLoan[] {
    return (this.s.npcLoans ??= []);
  }

  open(): NpcLoan[] {
    return this.loans().filter((l) => l.status === 'open');
  }

  /** The open loan between two people, whichever way it goes. */
  between(a: string, b: string): NpcLoan | undefined {
    return this.open().find((l) => (l.lender === a && l.borrower === b) || (l.lender === b && l.borrower === a));
  }

  overdue(l: NpcLoan, day = this.core.today()): boolean {
    return l.status === 'open' && day > l.due;
  }

  owedBy(borrower: string): NpcLoan[] {
    return this.open().filter((l) => l.borrower === borrower);
  }

  owedTo(lender: string): NpcLoan[] {
    return this.open().filter((l) => l.lender === lender);
  }

  remaining(l: NpcLoan): Money {
    return l.amount - l.repaid;
  }

  /** What someone keeps for themselves before paying anything back. */
  private keep(id: string): Money {
    return Math.round(NPC_BY_ID[id].income * 0.6);
  }

  /** Every morning: repayments, overdue loans souring, lenders giving up, and new loans. */
  daily(day: number): void {
    for (const l of this.open()) this.settle(l, day);
    for (const def of NPCS) this.maybeBorrow(def.id, day);
    // the story of old loans is kept a while, then forgotten
    const list = this.loans();
    this.s.npcLoans = list.filter((l) => l.status === 'open' || (l.closed ?? day) > day - 120);
  }

  private settle(l: NpcLoan, day: number): void {
    const b = this.core.state.npcs[l.borrower];
    const a = this.core.state.npcs[l.lender];
    if (!a || !b) return;
    const social = this.core.social;
    const spare = b.money - this.keep(l.borrower);
    if (spare > G(20)) {
      const pay = Math.min(this.remaining(l), Math.max(G(20), Math.round((spare * 0.5) / G(10)) * G(10)));
      b.money -= pay;
      a.money += pay;
      l.repaid += pay;
      if (l.repaid >= l.amount) {
        l.status = 'repaid';
        l.closed = day;
        social.adjustTie(l.lender, l.borrower, 3);
        return;
      }
    }
    if (day <= l.due) return;
    // past its day: the lender minds a little more every day
    social.adjustTie(l.lender, l.borrower, -0.8);
    a.stress = Math.min(100, a.stress + 0.5);
    if (day > l.due + GIVE_UP_DAYS) {
      const kind = NPC_BY_ID[l.lender].traits.empathy >= 0.6;
      l.status = 'forgiven';
      l.closed = day;
      social.adjustTie(l.lender, l.borrower, kind ? -4 : -15);
    }
  }

  /** Someone in trouble asks their closest friend who can spare it, and who is willing. */
  private maybeBorrow(id: string, day: number): void {
    const rt = this.core.state.npcs[id];
    const def = NPC_BY_ID[id];
    if (!rt || !def) return;
    const trouble = rt.flags.inCrisis === true || rt.money < def.income * 0.25;
    // the very well-off do not go round their friends for money (they have the bank, and family)
    if (!trouble || def.income >= RICH_INCOME || this.owedBy(id).length >= 2) return;
    if (Number(rt.flags.borrowedDay ?? -99) > day - BORROW_GAP) return;
    const need = Math.max(G(200), Math.round((def.income * 0.6 - rt.money) / G(50)) * G(50));
    const social = this.core.social;
    const friends = NPCS.filter((f) => f.id !== id)
      .map((f) => ({ f, tie: social.tie(id, f.id) }))
      .filter((x) => x.tie >= ASK_TIE)
      .sort((x, y) => y.tie - x.tie);
    for (const { f, tie } of friends) {
      // nobody lends while they owe money themselves
      if (this.between(id, f.id) || this.owedBy(f.id).length) continue;
      const lender = this.core.state.npcs[f.id];
      if (!lender) continue;
      const t = f.traits;
      const generous = t.empathy * 0.45 + t.loyalty * 0.35 + (1 - t.prudence) * 0.2 - t.materialism * 0.15;
      if (roll(`${id}|${f.id}|${day}|lend`) > generous * (tie / 100) * 1.6) continue;
      const amount = Math.min(need, Math.round((this.core.npcs.disposable(f.id) * 0.35) / G(50)) * G(50));
      if (amount < G(100)) continue;
      rt.money += amount;
      lender.money -= amount;
      this.s.npcLoanSeq = (this.s.npcLoanSeq ?? 0) + 1;
      this.loans().push({ id: this.s.npcLoanSeq, lender: f.id, borrower: id, amount, repaid: 0, day, due: day + LOAN_DAYS, status: 'open' });
      rt.flags.borrowedDay = day;
      social.adjustTie(id, f.id, 1);
      return;
    }
  }

  /** The loan the player knows about that this person is part of (to bring up, or to pay off). */
  knownLoanOf(id: string): NpcLoan | undefined {
    return this.open().find((l) => l.known && (l.borrower === id || l.lender === id));
  }

  /**
   * What someone says about money between them and a friend, if anything: the lender about
   * a loan that is late, the borrower about one they cannot pay. The player then knows of it.
   */
  mention(id: string): string | null {
    const day = this.core.today();
    const r = this.core.social.rel(id);
    const name = (n: string) => NPC_BY_ID[n]?.name ?? n;
    const late = this.owedTo(id).find((l) => this.overdue(l, day));
    if (late && r.familiarity >= 25) {
      late.known = true;
      return `${name(late.borrower)}还欠我 ${formatG(this.remaining(late))}，说好的日子都过去 ${day - late.due} 天了……`;
    }
    const mine = this.owedBy(id).find((l) => this.overdue(l, day));
    if (mine && r.familiarity >= 35) {
      mine.known = true;
      return `我还欠${name(mine.lender)} ${formatG(this.remaining(mine))}，这个月实在拿不出来……`;
    }
    return null;
  }

  /** The player pays what is left of a friend's debt to the lender. */
  cover(loanId: number): { ok: true; message: string } | { ok: false; error: string } {
    const l = this.open().find((x) => x.id === loanId);
    if (!l) return { ok: false, error: '这笔钱已经不欠了' };
    const owed = this.remaining(l);
    const lenderName = NPC_BY_ID[l.lender].name;
    const borrowerName = NPC_BY_ID[l.borrower].name;
    const r = this.core.economy.pay(owed, 'gift_given', `替${borrowerName}还给${lenderName}的钱`, l.lender, ['cash', 'bank']);
    if (!r.ok) return { ok: false, error: `要 ${formatG(owed)}，你身上和卡里的钱不够` };
    this.core.state.npcs[l.lender].money += owed;
    l.repaid = l.amount;
    l.status = 'covered';
    l.closed = this.core.today();
    const social = this.core.social;
    social.adjustTie(l.lender, l.borrower, 10);
    social.applyDirect(l.borrower, { kind: 'covered_debt', facets: { generosity: 0.9, support: 0.7 }, importance: 24, data: { amount: owed, npc: l.lender } });
    social.applyDirect(l.lender, { kind: 'paid_for_friend', facets: { generosity: 0.5, kindness: 0.4 }, importance: 12, data: { amount: owed, npc: l.borrower } }, { silent: true });
    this.core.journal.add('social', `替${borrowerName}把欠${lenderName}的 ${formatG(owed)} 还上了。`, true);
    this.core.touch();
    return { ok: true, message: `你替${borrowerName}把 ${formatG(owed)} 还给了${lenderName}。` };
  }
}
