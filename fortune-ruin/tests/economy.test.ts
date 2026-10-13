import { describe, expect, it } from 'vitest';
import { G } from '../src/core/money';
import { Rng } from '../src/core/rng';
import { amortizedPayment, ATM_DAILY_LIMIT } from '../src/systems/EconomySystem';
import { newCore, playBlackjackRound, skip } from './helpers';

describe('economy ledger', () => {
  it('starts with the required finances', () => {
    const core = newCore();
    expect(core.economy.balance('cash')).toBe(G(1000));
    expect(core.economy.balance('bank')).toBe(G(19000));
    expect(core.economy.balance('chips')).toBe(0);
    expect(core.economy.totalDebt()).toBe(0);
    expect(core.economy.netWorth()).toBe(G(20000));
    expect(core.state.housing.homeId).toBe('home_basic');
    expect(core.career.activeJobs().length).toBe(1);
    expect(core.state.casino.membership.tier).toBe('visitor');
  });

  it('rejects invalid amounts and overdrafts without side effects', () => {
    const core = newCore();
    const before = JSON.stringify(core.state.economy.accounts);
    expect(core.economy.spend('cash', 1.5, 'food', 'x').ok).toBe(false);
    expect(core.economy.spend('cash', -100, 'food', 'x').ok).toBe(false);
    expect(core.economy.spend('cash', 0, 'food', 'x').ok).toBe(false);
    expect(core.economy.spend('cash', G(1000.01), 'food', 'x').ok).toBe(false);
    expect(core.economy.transfer('bank', 'cash', G(50000), 'withdrawal', 'x').ok).toBe(false);
    expect(core.economy.receive('bank', Number.NaN, 'salary', 'x').ok).toBe(false);
    expect(JSON.stringify(core.state.economy.accounts)).toBe(before);
  });

  it('chips can only be spent at the casino', () => {
    const core = newCore();
    core.economy.buyChips(G(100), 'cash');
    expect(core.economy.spend('chips', G(10), 'food', '咖啡').ok).toBe(false);
    expect(core.economy.spend('chips', G(10), 'casino_bet', '下注').ok).toBe(true);
  });

  it('enforces ATM limits and fees', () => {
    const core = newCore();
    expect(core.economy.withdraw(ATM_DAILY_LIMIT + G(100), 'street').ok).toBe(false);
    const bank = core.economy.balance('bank');
    expect(core.economy.withdraw(G(500), 'casino').ok).toBe(true);
    expect(core.economy.balance('bank')).toBe(bank - G(500) - G(6));
    expect(core.economy.withdraw(G(5000), 'branch').ok).toBe(true);
  });

  it('records every transaction and keeps money conserved through random activity', () => {
    const core = newCore(777);
    const rng = new Rng(4242);
    core.setLocation('casino', 100, 100);
    for (let i = 0; i < 400; i++) {
      const op = rng.int(0, 7);
      switch (op) {
        case 0:
          core.economy.deposit(G(rng.int(1, 300)));
          break;
        case 1:
          core.economy.withdraw(G(rng.int(1, 300)), rng.pick(['branch', 'street', 'casino'] as const));
          break;
        case 2:
          core.economy.buyChips(G(rng.int(10, 400)), rng.chance(0.5) ? 'cash' : 'bank');
          break;
        case 3:
          core.economy.cashOutChips(G(rng.int(1, 200)));
          break;
        case 4:
          core.economy.pay(G(rng.int(1, 60)), 'food', '吃饭');
          break;
        case 5:
          core.economy.receive('bank', G(rng.int(10, 500)), 'salary', '工资');
          break;
        case 6:
          if (core.economy.balance('chips') >= G(10)) {
            core.casino.sit('bj1');
            try {
              playBlackjackRound(core, 'bj1', G(10));
            } catch {
              /* not enough chips etc. */
            }
            core.casino.standUp();
          }
          break;
        case 7:
          core.advance(rng.int(1, 30), 'idle');
          break;
      }
      const c = core.economy.checkConservation();
      expect(c.ok, `step ${i}: expected ${c.expected} actual ${c.actual}`).toBe(true);
      for (const a of ['cash', 'bank', 'chips'] as const) {
        expect(Number.isSafeInteger(core.economy.balance(a))).toBe(true);
        expect(core.economy.balance(a)).toBeGreaterThanOrEqual(0);
      }
    }
    expect(core.state.economy.ledger.length).toBeGreaterThan(100);
    // every ledger entry has a positive integer amount
    for (const t of core.state.economy.ledger) expect(Number.isSafeInteger(t.amount) && t.amount > 0).toBe(true);
  });

  it('casino ledger: stakes out, payouts in, chips reconcile with the engine', () => {
    const core = newCore(99);
    core.setLocation('casino', 100, 100);
    core.economy.buyChips(G(500), 'cash');
    core.casino.sit('bj1');
    let netFromEngine = 0;
    for (let i = 0; i < 30; i++) {
      const chipsBefore = core.economy.balance('chips');
      playBlackjackRound(core, 'bj1', G(10));
      const s = core.casino.bj('bj1');
      const seat = s.seats.findIndex((x) => x.occupant === 'player');
      const stake = s.seats[seat].hands.reduce((a, h) => a + h.bet, 0) + s.seats[seat].insurance;
      const ret = s.seats[seat].hands.reduce((a, h) => a + (h.payout ?? 0), 0) + (s.seats[seat].insurancePayout ?? 0);
      netFromEngine += ret - stake;
      expect(core.economy.balance('chips') - chipsBefore).toBe(ret - stake);
    }
    expect(core.state.casino.stats.byGame.blackjack.net).toBe(netFromEngine);
    expect(core.state.casino.stats.byGame.blackjack.rounds).toBe(30);
    // paying twice is impossible
    const chips = core.economy.balance('chips');
    core.casino.collect('bj1');
    expect(core.economy.balance('chips')).toBe(chips);
  });
});

describe('loans', () => {
  it('amortises correctly', () => {
    const p = amortizedPayment(G(12000), 1200, 12);
    // standard formula: 12000 * 0.01 / (1 - 1.01^-12) ≈ 1066.19
    expect(p).toBeGreaterThanOrEqual(G(1066.18));
    expect(p).toBeLessThanOrEqual(G(1066.2));
  });

  it('loans generate monthly bills and must be repaid', () => {
    const core = newCore();
    const before = core.economy.balance('bank');
    const loan = core.economy.openLoan({ lender: 'bank', lenderName: '测试银行', principal: G(5000), aprBp: 1200, termMonths: 6, kind: 'personal' });
    expect(core.economy.balance('bank')).toBe(before + G(5000));
    expect(core.economy.totalDebt()).toBe(G(5000));
    // net worth unchanged by borrowing
    expect(core.economy.netWorth()).toBe(G(20000));
    skip(core, 28 * 24 * 60 + 60 * 10);
    const paidBills = core.state.economy.bills.filter((b) => b.loanId === loan.id && b.paidDay !== null);
    expect(paidBills.length).toBe(1);
    expect(loan.balance).toBeLessThan(G(5000));
  });
});
