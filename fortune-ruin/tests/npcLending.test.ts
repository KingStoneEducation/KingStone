import { describe, expect, it } from 'vitest';
import type { GameCore } from '../src/core/GameCore';
import { G } from '../src/core/money';
import { GIVE_UP_DAYS, LOAN_DAYS } from '../src/systems/NpcLendingSystem';
import { momentText, tieKey } from '../src/systems/SocialSystem';
import { NPCS } from '../src/data/npcs';
import { newCore } from './helpers';

const total = (c: GameCore) => NPCS.reduce((a, d) => a + c.state.npcs[d.id].money, 0);

/** Marco is broke, and Tommy (an old friend) has money to spare. */
function trouble(c: GameCore): void {
  c.state.npcs.marco.money = 0;
  c.state.npcs.marco.flags.inCrisis = true;
  c.state.npcs.tommy.money = G(30000);
  c.state.social.ties[tieKey('marco', 'tommy')] = 85;
}

/** Days of the lending pass until Marco has borrowed from someone (the rolls are deterministic). */
function untilLoan(c: GameCore): number {
  for (let k = 0; k < 60; k++) {
    const day = c.today() + k;
    c.lending.daily(day);
    if (c.lending.owedBy('marco').length) return day;
    c.state.npcs.marco.money = 0;
  }
  throw new Error('nobody lent');
}

describe('money between friends', () => {
  it('someone in trouble borrows from a close friend who can spare it; nothing is made or lost', () => {
    const c = newCore();
    trouble(c);
    const before = total(c);
    const day = untilLoan(c);
    const l = c.lending.owedBy('marco')[0];
    expect(l.lender).toBe('tommy');
    expect(l.amount).toBeGreaterThanOrEqual(G(100));
    expect(l.due).toBe(day + LOAN_DAYS);
    expect(c.state.npcs.marco.money).toBe(l.amount);
    expect(total(c)).toBe(before);
    // not asked again the next day
    c.lending.daily(day + 1);
    expect(c.lending.owedBy('marco').length).toBe(1);
  });

  it('a friend who is not close, or has nothing to spare, is not asked', () => {
    const c = newCore();
    trouble(c);
    c.state.social.ties[tieKey('marco', 'tommy')] = 20;
    for (const d of NPCS) if (d.id !== 'marco') c.state.social.ties[tieKey('marco', d.id)] = Math.min(c.state.social.ties[tieKey('marco', d.id)] ?? 0, 20);
    for (let k = 0; k < 30; k++) c.lending.daily(c.today() + k);
    expect(c.lending.owedBy('marco').length).toBe(0);
    const d = newCore();
    trouble(d);
    d.state.npcs.tommy.money = G(100);
    for (const n of NPCS) if (n.id !== 'marco' && n.id !== 'tommy') d.state.social.ties[tieKey('marco', n.id)] = 0;
    for (let k = 0; k < 30; k++) d.lending.daily(d.today() + k);
    expect(d.lending.owedBy('marco').length).toBe(0);
  });

  it('is paid back out of what is left over, and the friendship is the better for it', () => {
    const c = newCore();
    trouble(c);
    const day = untilLoan(c);
    const l = c.lending.owedBy('marco')[0];
    const tie = c.social.tie('marco', 'tommy');
    c.state.npcs.marco.money = G(50000);
    const before = total(c);
    for (let k = 1; k < 10 && l.status === 'open'; k++) c.lending.daily(day + k);
    expect(l.status).toBe('repaid');
    expect(l.repaid).toBe(l.amount);
    expect(total(c)).toBe(before);
    expect(c.social.tie('marco', 'tommy')).toBeGreaterThan(tie);
  });

  it('past its day it sours things every day, they have words about it, and in the end the lender gives up', () => {
    const c = newCore();
    trouble(c);
    const day = untilLoan(c);
    const l = c.lending.owedBy('marco')[0];
    c.state.npcs.marco.money = 0;
    for (let k = 1; k <= LOAN_DAYS; k++) c.lending.daily(day + k);
    const onTime = c.social.tie('marco', 'tommy');
    c.state.npcs.marco.money = 0;
    for (let k = LOAN_DAYS + 1; k <= LOAN_DAYS + 10; k++) {
      c.state.npcs.marco.money = 0;
      c.lending.daily(day + k);
    }
    expect(c.social.tie('marco', 'tommy')).toBeLessThan(onTime);
    expect(c.lending.overdue(l, day + LOAN_DAYS + 10)).toBe(true);
    // when they meet, the lender brings it up (sometimes as a row)
    c.state.time.minutes = (day + LOAN_DAYS + 10) * 1440 + 20 * 60;
    c.state.world.location = 'bar';
    const kinds = Array.from({ length: 40 }, (_, i) => c.encounters.start('marco', 'tommy', 'bar', c.now() + i * 37));
    const money = kinds.filter((e) => e.about === 'money');
    expect(money.length).toBeGreaterThan(10);
    expect(money.every((e) => e.a === 'tommy')).toBe(true);
    expect(money.some((e) => e.kind === 'argue')).toBe(true);
    // the player saw it: the loan is known, and the web says what it was about
    expect(l.known).toBe(true);
    const seen = c.state.social.pairLog!.find((m) => m.about === 'money' && m.kind === 'argue')!;
    expect(momentText(seen, (id) => id)).toContain('借钱');
    for (let k = LOAN_DAYS + 11; k <= LOAN_DAYS + GIVE_UP_DAYS + 2; k++) {
      c.state.npcs.marco.money = 0;
      c.lending.daily(day + k);
    }
    expect(l.status).toBe('forgiven');
  });

  it('the player can pay a friend\'s debt they know of: the lender gets it, the borrower remembers', () => {
    const c = newCore();
    trouble(c);
    const day = untilLoan(c);
    const l = c.lending.owedBy('marco')[0];
    for (let k = 1; k <= LOAN_DAYS + 3; k++) {
      c.state.npcs.marco.money = 0;
      c.lending.daily(day + k);
    }
    c.state.time.minutes = (day + LOAN_DAYS + 3) * 1440 + 12 * 60;
    // Tommy tells you about it when you talk (once you know him well enough)
    const r = c.social.rel('tommy');
    r.met = true;
    r.knowsName = true;
    r.familiarity = 40;
    c.state.world.location = 'bar';
    c.state.npcs.tommy.location = 'bar';
    const said = c.lending.mention('tommy');
    expect(said).toContain('马可');
    expect(l.known).toBe(true);
    c.economy.receive('bank', G(5000), 'other', 'test');
    const owed = c.lending.remaining(l);
    const lender = c.state.npcs.tommy.money;
    const mine = c.economy.balance('cash') + c.economy.balance('bank');
    const res = c.lending.cover(l.id);
    expect(res.ok).toBe(true);
    expect(l.status).toBe('covered');
    expect(c.state.npcs.tommy.money).toBe(lender + owed);
    expect(c.economy.balance('cash') + c.economy.balance('bank')).toBe(mine - owed);
    expect(c.social.memoriesOf('marco').some((m) => m.kind === 'covered_debt')).toBe(true);
    expect(c.lending.cover(l.id).ok).toBe(false);
  });

  it('old saves start with no loans between people', async () => {
    const { migrate } = await import('../src/systems/SaveManager');
    const c = newCore();
    const st = JSON.parse(JSON.stringify(c.state));
    delete st.social.npcLoans;
    delete st.social.npcLoanSeq;
    const m = migrate(st);
    expect(m.social.npcLoans).toEqual([]);
    expect(m.social.npcLoanSeq).toBe(0);
  });
});
