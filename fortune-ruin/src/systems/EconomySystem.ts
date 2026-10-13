import type { GameCore } from '../core/GameCore';
import { G, formatG, mulRatio, type Money } from '../core/money';
import type { AccountId, Bill, FlowDay, Loan, Txn, TxnCategory } from '../core/state';
import { DAYS_PER_MONTH, toDate } from '../core/calendar';

export type TxnResult = { ok: true; txn: Txn } | { ok: false; error: string };

export const ACCOUNT_NAMES: Record<AccountId, string> = { cash: '现金', bank: '银行存款', chips: '赌场筹码' };

export const CATEGORY_NAMES: Record<TxnCategory, string> = {
  salary: '工资',
  tips: '小费',
  bonus: '奖金',
  casino_buyin: '兑换筹码',
  casino_cashout: '筹码兑现',
  casino_bet: '赌场下注',
  casino_payout: '赌场派彩',
  deposit: '存款',
  withdrawal: '取款',
  rent: '房租',
  utilities: '水电燃气',
  phone: '话费',
  insurance: '保险',
  food: '餐饮',
  groceries: '日用杂货',
  drinks: '酒水',
  transport: '交通',
  entertainment: '娱乐',
  clothing: '服装',
  furniture: '家具',
  housing: '住房',
  vehicle: '车辆',
  fees: '手续费',
  interest_income: '利息收入',
  interest_paid: '利息支出',
  loan_disbursement: '贷款到账',
  loan_repayment: '还款',
  gift_given: '赠礼',
  gift_received: '收到馈赠',
  lend: '借出',
  repaid_to_you: '收回借款',
  medical: '医疗',
  investment_buy: '投资买入',
  investment_sell: '投资卖出',
  dividend: '分红',
  property_sale: '出售房产',
  property_purchase: '购买房产',
  business_income: '经营收入',
  business_cost: '经营支出',
  item_sale: '变卖物品',
  tax: '税费',
  other: '其他',
};

/** Categories that represent borrowed money rather than income. */
const NON_INCOME: ReadonlySet<TxnCategory> = new Set(['loan_disbursement', 'casino_payout', 'investment_sell', 'property_sale', 'repaid_to_you']);
const NON_EXPENSE: ReadonlySet<TxnCategory> = new Set(['casino_bet', 'investment_buy', 'property_purchase', 'lend', 'loan_repayment']);

export const ATM_DAILY_LIMIT = G(3000);
export const LEDGER_LIMIT = 2500;

export const ATM_FEES: Record<'branch' | 'street' | 'casino', Money> = { branch: 0, street: G(2.5), casino: G(6) };

export function emptyFlow(day: number): FlowDay {
  return { day, income: 0, expenses: 0, casinoNet: 0, byCat: {} };
}

/** Standard amortised monthly payment, rounded up to the minor unit. */
export function amortizedPayment(principal: Money, aprBp: number, months: number): Money {
  if (months <= 0) return principal;
  const r = aprBp / 10000 / 12;
  if (r === 0) return Math.ceil(principal / months);
  const p = (principal * r) / (1 - Math.pow(1 + r, -months));
  return Math.ceil(p);
}

export interface LoanQuote {
  ok: boolean;
  reason?: string;
  aprBp: number;
  monthly: Money;
  maxPrincipal: Money;
  totalInterest: Money;
  termMonths: number;
}

export class EconomySystem {
  constructor(private core: GameCore) {}

  private get s() {
    return this.core.state.economy;
  }

  balance(a: AccountId): Money {
    return this.s.accounts[a];
  }

  // ---------------------------------------------------------------- primitive ledger operations

  private validateAmount(amount: Money): string | null {
    if (!Number.isSafeInteger(amount)) return '金额必须为整数最小货币单位';
    if (amount <= 0) return '金额必须大于零';
    return null;
  }

  private record(from: string, to: string, amount: Money, cat: TxnCategory, memo: string): Txn {
    const txn: Txn = { id: ++this.s.seq, t: this.core.now(), from, to, amount, cat, memo };
    this.s.ledger.push(txn);
    if (this.s.ledger.length > LEDGER_LIMIT) this.s.ledger.splice(0, this.s.ledger.length - LEDGER_LIMIT);
    this.s.lifetimeByCat[cat] = (this.s.lifetimeByCat[cat] ?? 0) + amount;
    return txn;
  }

  private trackFlow(direction: 'in' | 'out', amount: Money, cat: TxnCategory): void {
    const today = this.s.today;
    today.byCat[cat] = (today.byCat[cat] ?? 0) + (direction === 'in' ? amount : -amount);
    if (cat === 'casino_bet') today.casinoNet -= amount;
    else if (cat === 'casino_payout') today.casinoNet += amount;
    if (direction === 'in' && !NON_INCOME.has(cat)) today.income += amount;
    if (direction === 'out' && !NON_EXPENSE.has(cat)) today.expenses += amount;
  }

  private emit(account: AccountId, delta: Money, txn: Txn): void {
    this.core.bus.emit('money', { account, balance: this.s.accounts[account], delta, txn });
    this.core.touch();
  }

  /** Move money between two of the player's own accounts. */
  transfer(from: AccountId, to: AccountId, amount: Money, cat: TxnCategory, memo: string): TxnResult {
    const err = this.validateAmount(amount);
    if (err) return { ok: false, error: err };
    if (from === to) return { ok: false, error: '无效的转账' };
    if (this.s.accounts[from] < amount) return { ok: false, error: `${ACCOUNT_NAMES[from]}不足` };
    this.s.accounts[from] -= amount;
    this.s.accounts[to] += amount;
    const txn = this.record(from, to, amount, cat, memo);
    this.emit(from, -amount, txn);
    this.emit(to, amount, txn);
    return { ok: true, txn };
  }

  /** Money arriving from outside the player's accounts (salary, payouts, sales...). */
  receive(to: AccountId, amount: Money, cat: TxnCategory, memo: string, source = 'world'): TxnResult {
    const err = this.validateAmount(amount);
    if (err) return { ok: false, error: err };
    this.s.accounts[to] += amount;
    this.s.externalIn[to] += amount;
    const txn = this.record(`ext:${source}`, to, amount, cat, memo);
    this.trackFlow('in', amount, cat);
    this.emit(to, amount, txn);
    return { ok: true, txn };
  }

  /** Money leaving the player's accounts. Fails without side effects when funds are insufficient. */
  spend(from: AccountId, amount: Money, cat: TxnCategory, memo: string, payee = 'world'): TxnResult {
    const err = this.validateAmount(amount);
    if (err) return { ok: false, error: err };
    if (from === 'chips' && !cat.startsWith('casino')) return { ok: false, error: '筹码只能在赌场内使用' };
    if (this.s.accounts[from] < amount) return { ok: false, error: `${ACCOUNT_NAMES[from]}不足` };
    this.s.accounts[from] -= amount;
    this.s.externalOut[from] += amount;
    const txn = this.record(from, `ext:${payee}`, amount, cat, memo);
    this.trackFlow('out', amount, cat);
    this.emit(from, -amount, txn);
    return { ok: true, txn };
  }

  /** Pay with cash if possible, otherwise by card from the bank account. */
  pay(amount: Money, cat: TxnCategory, memo: string, payee = 'world', prefer: AccountId[] = ['cash', 'bank']): TxnResult {
    for (const acc of prefer) {
      if (this.s.accounts[acc] >= amount) return this.spend(acc, amount, cat, memo, payee);
    }
    return { ok: false, error: '余额不足，无法支付' };
  }

  canPay(amount: Money, prefer: AccountId[] = ['cash', 'bank']): boolean {
    return prefer.some((a) => this.s.accounts[a] >= amount);
  }

  // ---------------------------------------------------------------- banking

  deposit(amount: Money): TxnResult {
    return this.transfer('cash', 'bank', amount, 'deposit', '存入银行');
  }

  withdraw(amount: Money, where: 'branch' | 'street' | 'casino'): TxnResult {
    const day = toDate(this.core.now()).dayIndex;
    if (this.s.atmDay !== day) {
      this.s.atmDay = day;
      this.s.atmWithdrawn = 0;
    }
    if (where !== 'branch' && this.s.atmWithdrawn + amount > ATM_DAILY_LIMIT) {
      return { ok: false, error: `超过 ATM 每日取款上限 ${formatG(ATM_DAILY_LIMIT)}` };
    }
    const fee = ATM_FEES[where];
    if (this.s.accounts.bank < amount + fee) return { ok: false, error: '银行余额不足（含手续费）' };
    const r = this.transfer('bank', 'cash', amount, 'withdrawal', where === 'branch' ? '柜台取款' : 'ATM 取款');
    if (!r.ok) return r;
    if (where !== 'branch') this.s.atmWithdrawn += amount;
    if (fee > 0) this.spend('bank', fee, 'fees', where === 'casino' ? '赌场 ATM 手续费' : 'ATM 手续费', 'atm');
    return r;
  }

  /** Buy chips at the cage. Card purchases are charged a 3% cash-advance fee. */
  buyChips(amount: Money, from: 'cash' | 'bank'): TxnResult {
    if (amount % 100 !== 0) return { ok: false, error: '筹码只能按整数 G 兑换' };
    if (from === 'cash') return this.transfer('cash', 'chips', amount, 'casino_buyin', '兑换筹码');
    const fee = mulRatio(amount, 3, 100);
    if (this.s.accounts.bank < amount + fee) return { ok: false, error: '银行余额不足（含 3% 预借现金手续费）' };
    const r = this.transfer('bank', 'chips', amount, 'casino_buyin', '刷卡兑换筹码');
    if (r.ok && fee > 0) this.spend('bank', fee, 'fees', '刷卡兑换筹码手续费', 'casino');
    return r;
  }

  cashOutChips(amount: Money): TxnResult {
    // chips in play (a poker stack, bets on a layout) stay at the table
    if (amount > this.core.casino.availableChips()) return { ok: false, error: '桌上的筹码不能兑现，请先离桌' };
    return this.transfer('chips', 'cash', amount, 'casino_cashout', '筹码兑现');
  }

  // ---------------------------------------------------------------- derived figures

  liquid(): Money {
    const a = this.s.accounts;
    return a.cash + a.bank + a.chips;
  }

  securitiesValue(): Money {
    return this.core.market.portfolioValue();
  }

  propertyValue(): Money {
    return this.core.housing.ownedValue();
  }

  vehicleValue(): Money {
    return this.core.inventory.vehicleValue();
  }

  valuablesValue(): Money {
    return this.core.inventory.valuablesValue();
  }

  receivablesValue(): Money {
    return this.s.receivables.filter((r) => r.status === 'open').reduce((a, r) => a + (r.amount - r.repaid), 0);
  }

  totalDebt(): Money {
    const loans = this.s.loans.filter((l) => l.status !== 'paid').reduce((a, l) => a + l.balance, 0);
    const bills = this.s.bills.filter((b) => b.paidDay === null && b.kind !== 'loan').reduce((a, b) => a + b.amount + b.lateFees, 0);
    return loans + bills;
  }

  totalAssets(): Money {
    return this.liquid() + this.securitiesValue() + this.propertyValue() + this.vehicleValue() + this.valuablesValue() + this.receivablesValue();
  }

  /** Real net worth: assets minus liabilities. */
  netWorth(): Money {
    return this.totalAssets() - this.totalDebt();
  }

  /** Σ balances must equal Σ initial + Σ external inflows − Σ external outflows. */
  checkConservation(): { ok: boolean; expected: Money; actual: Money } {
    const a = this.s.accounts;
    const actual = a.cash + a.bank + a.chips;
    let expected = 0;
    for (const k of ['cash', 'bank', 'chips'] as AccountId[]) expected += this.s.initial[k] + this.s.externalIn[k] - this.s.externalOut[k];
    return { ok: actual === expected, expected, actual };
  }

  // ---------------------------------------------------------------- bills

  issueBill(kind: Bill['kind'], payee: string, payeeName: string, amount: Money, dueInDays: number, memo: string, loanId?: string): Bill {
    const day = this.core.today();
    const bill: Bill = {
      id: `b${++this.s.billSeq}`,
      kind,
      payee,
      payeeName,
      amount,
      issuedDay: day,
      dueDay: day + dueInDays,
      paidDay: null,
      lateFees: 0,
      memo,
      loanId,
    };
    this.s.bills.push(bill);
    this.core.touch();
    return bill;
  }

  unpaidBills(): Bill[] {
    return this.s.bills.filter((b) => b.paidDay === null);
  }

  overdueBills(): Bill[] {
    const day = this.core.today();
    return this.unpaidBills().filter((b) => b.dueDay < day);
  }

  billTotal(b: Bill): Money {
    return b.amount + b.lateFees;
  }

  payBill(id: string, from: AccountId = 'bank'): TxnResult {
    const bill = this.s.bills.find((b) => b.id === id);
    if (!bill) return { ok: false, error: '账单不存在' };
    if (bill.paidDay !== null) return { ok: false, error: '账单已支付' };
    const total = this.billTotal(bill);
    const cat: TxnCategory =
      bill.kind === 'rent' ? 'rent' : bill.kind === 'utilities' ? 'utilities' : bill.kind === 'phone' ? 'phone' : bill.kind === 'insurance' ? 'insurance' : bill.kind === 'loan' ? 'loan_repayment' : bill.kind === 'maintenance' ? 'housing' : 'other';
    const r = this.spend(from, total, cat, `${bill.payeeName}：${bill.memo}`, bill.payee);
    if (!r.ok) return r;
    bill.paidDay = this.core.today();
    const late = bill.paidDay > bill.dueDay;
    this.core.bus.emit('bill:paid', { bill, late });
    if (bill.kind === 'loan' && bill.loanId) this.applyLoanPayment(bill.loanId, bill.amount);
    return r;
  }

  /** Called daily: autopay due bills, apply late fees on overdue ones. */
  processBills(): void {
    const day = this.core.today();
    for (const b of this.unpaidBills()) {
      if (this.s.autopay && b.dueDay <= day && this.s.accounts.bank >= this.billTotal(b)) {
        this.payBill(b.id, 'bank');
        continue;
      }
      if (b.dueDay < day) {
        const daysLate = day - b.dueDay;
        // One-off late fee on day 1 late, then a second one after two weeks.
        if (daysLate === 1 || daysLate === 15) {
          const fee = b.kind === 'rent' ? Math.max(G(25), mulRatio(b.amount, 5, 100)) : b.kind === 'loan' ? G(35) : G(15);
          b.lateFees += fee;
          this.core.player.adjustCredit(b.kind === 'loan' ? -25 : -12, `${b.payeeName}账单逾期`);
          this.core.bus.emit('bill:late', { bill: b, daysLate });
        }
      }
    }
  }

  // ---------------------------------------------------------------- loans

  /** Creates an active loan and disburses the principal to the bank account. */
  openLoan(params: Omit<Loan, 'id' | 'balance' | 'monthlyPayment' | 'nextDueDay' | 'paymentsMade' | 'missedPayments' | 'startDay' | 'status'>): Loan {
    const day = this.core.today();
    const loan: Loan = {
      ...params,
      id: `L${++this.s.billSeq}`,
      balance: params.principal,
      monthlyPayment: amortizedPayment(params.principal, params.aprBp, params.termMonths),
      nextDueDay: day + DAYS_PER_MONTH,
      paymentsMade: 0,
      missedPayments: 0,
      startDay: day,
      status: 'active',
    };
    this.s.loans.push(loan);
    this.receive('bank', params.principal, 'loan_disbursement', `${params.lenderName}贷款放款`, params.lender);
    return loan;
  }

  /** Monthly interest accrual + installment bill generation, run daily. */
  processLoans(): void {
    const day = this.core.today();
    for (const loan of this.s.loans) {
      if (loan.status !== 'active') continue;
      if (day === loan.nextDueDay - 7) {
        // interest accrues for the month, billed together with principal
        const interest = Math.round((loan.balance * loan.aprBp) / 10000 / 12);
        if (interest > 0) loan.balance += interest;
        const due = Math.min(loan.monthlyPayment, loan.balance);
        this.issueBill('loan', loan.lender, loan.lenderName, due, 7, `第 ${loan.paymentsMade + 1} 期还款（含利息 ${formatG(interest)}）`, loan.id);
      }
      // checked the day after the due date, so same-day autopay counts as on time
      if (day === loan.nextDueDay + 1) {
        const open = this.s.bills.find((b) => b.loanId === loan.id && b.paidDay === null);
        if (open) {
          loan.missedPayments += 1;
          this.core.bus.emit('loan:missed', { loan });
          if (loan.missedPayments >= 3) {
            loan.status = 'default';
            this.core.bus.emit('loan:default', { loan });
            this.core.player.adjustCredit(-90, `${loan.lenderName}贷款违约`);
          }
        }
        loan.nextDueDay += DAYS_PER_MONTH;
      }
    }
  }

  private applyLoanPayment(loanId: string, amount: Money): void {
    const loan = this.s.loans.find((l) => l.id === loanId);
    if (!loan) return;
    loan.balance = Math.max(0, loan.balance - amount);
    loan.paymentsMade += 1;
    if (loan.missedPayments > 0) loan.missedPayments -= 1;
    if (loan.balance === 0) {
      loan.status = 'paid';
      this.core.bus.emit('loan:paid', { loan });
      this.core.player.adjustCredit(20, `${loan.lenderName}贷款结清`);
    } else {
      this.core.player.adjustCredit(2, '按时还款');
    }
  }

  /** Pay down a loan early (no prepayment penalty). */
  prepayLoan(loanId: string, amount: Money, from: AccountId = 'bank'): TxnResult {
    const loan = this.s.loans.find((l) => l.id === loanId);
    if (!loan || loan.status === 'paid') return { ok: false, error: '贷款不存在或已结清' };
    const amt = Math.min(amount, loan.balance);
    const r = this.spend(from, amt, 'loan_repayment', `${loan.lenderName}提前还款`, loan.lender);
    if (!r.ok) return r;
    loan.balance -= amt;
    if (loan.balance === 0) {
      loan.status = 'paid';
      for (const b of this.s.bills) if (b.loanId === loan.id && b.paidDay === null) b.paidDay = this.core.today();
      this.core.bus.emit('loan:paid', { loan });
      this.core.player.adjustCredit(15, `${loan.lenderName}贷款结清`);
    }
    return r;
  }

  /**
   * Bank personal-loan underwriting. The rate depends on the credit score
   * band; the amount is capped by a 40% debt-service-to-income ratio.
   * Every term is shown to the player before signing.
   */
  personalLoanQuote(principal: Money, termMonths: number): LoanQuote {
    const score = this.core.state.player.creditScore;
    const income = this.core.career.monthlyIncomeEstimate();
    const existing = this.s.loans.filter((l) => l.status === 'active').reduce((a, l) => a + l.monthlyPayment, 0);
    const aprBp = score >= 760 ? 690 : score >= 720 ? 850 : score >= 680 ? 1050 : score >= 640 ? 1390 : score >= 600 ? 1790 : 2390;
    const capacity = Math.max(0, Math.floor(income * 0.4) - existing);
    const per1000 = amortizedPayment(G(1000), aprBp, termMonths);
    const byIncome = per1000 > 0 ? Math.floor(capacity / per1000) * G(1000) : 0;
    const maxPrincipal = Math.max(0, Math.min(G(80000), byIncome, income * 8));
    const monthly = amortizedPayment(principal, aprBp, termMonths);
    const base = { aprBp, maxPrincipal, monthly, totalInterest: Math.max(0, monthly * termMonths - principal), termMonths };
    if (this.s.loans.some((l) => l.status === 'default')) return { ...base, ok: false, reason: '你有贷款违约记录，银行暂不受理新的贷款申请', maxPrincipal: 0 };
    if (score < 560) return { ...base, ok: false, reason: `信用分 ${score} 低于最低要求 560`, maxPrincipal: 0 };
    if (income <= 0) return { ...base, ok: false, reason: '没有稳定的工资收入，无法评估还款能力', maxPrincipal: 0 };
    if (![6, 12, 24, 36].includes(termMonths)) return { ...base, ok: false, reason: '贷款期限只能选择 6 / 12 / 24 / 36 个月' };
    if (principal < G(1000) || principal % G(100) !== 0) return { ...base, ok: false, reason: '贷款金额至少 1,000 G，且为 100 G 的整数倍' };
    if (principal > maxPrincipal) return { ...base, ok: false, reason: `超出可贷额度（按你的收入与现有负债，最多 ${formatG(maxPrincipal)}）` };
    return { ...base, ok: true };
  }

  takePersonalLoan(principal: Money, termMonths: number): TxnResult {
    const q = this.personalLoanQuote(principal, termMonths);
    if (!q.ok) return { ok: false, error: q.reason ?? '申请未通过' };
    const loan = this.openLoan({ lender: 'bank', lenderName: '灰港储蓄信托', principal, aprBp: q.aprBp, termMonths, kind: 'personal' });
    this.core.player.adjustCredit(-4, '新增贷款');
    this.core.journal.add('money', `向灰港储蓄信托借了 ${formatG(principal)}，${termMonths} 个月，年利率 ${(q.aprBp / 100).toFixed(2)}%，月供 ${formatG(loan.monthlyPayment)}。`, true);
    return { ok: true, txn: this.s.ledger[this.s.ledger.length - 1] };
  }

  /** Payday lender: no credit check, tiny amounts, ruinous price (30% per month). */
  paydayQuote(principal: Money): LoanQuote {
    const aprBp = 36000;
    const monthly = amortizedPayment(principal, aprBp, 1);
    const open = this.s.loans.filter((l) => l.kind === 'payday' && l.status === 'active');
    const maxPrincipal = open.length ? 0 : G(2000);
    const base = { aprBp, maxPrincipal, monthly, totalInterest: monthly - principal, termMonths: 1 };
    if (open.length) return { ...base, ok: false, reason: '你还有一笔未还清的随借贷款' };
    if (this.s.loans.filter((l) => l.status === 'default').length >= 2) return { ...base, ok: false, reason: '多次违约，平台拒绝放款' };
    if (principal < G(100) || principal > maxPrincipal || principal % G(100) !== 0) return { ...base, ok: false, reason: `金额需在 100–${formatG(maxPrincipal)} 之间，且为 100 G 的整数倍` };
    return { ...base, ok: true };
  }

  takePayday(principal: Money): TxnResult {
    const q = this.paydayQuote(principal);
    if (!q.ok) return { ok: false, error: q.reason ?? '申请未通过' };
    this.openLoan({ lender: 'payday', lenderName: '随借 App', principal, aprBp: q.aprBp, termMonths: 1, kind: 'payday' });
    this.core.player.adjustCredit(-8, '使用高利贷款');
    this.core.journal.add('money', `用随借 App 借了 ${formatG(principal)}，一个月后要还 ${formatG(q.monthly)}。`, true);
    return { ok: true, txn: this.s.ledger[this.s.ledger.length - 1] };
  }

  monthlyObligations(): Money {
    const loans = this.s.loans.filter((l) => l.status === 'active').reduce((a, l) => a + l.monthlyPayment, 0);
    return loans + this.core.housing.monthlyCost();
  }

  // ---------------------------------------------------------------- day rollover

  rolloverDay(newDay: number): void {
    this.s.history.push(this.s.today);
    if (this.s.history.length > 200) this.s.history.splice(0, this.s.history.length - 200);
    this.s.today = emptyFlow(newDay);
  }

  /** Savings interest credited monthly at 1.5% APR. */
  payMonthlyInterest(): void {
    const bal = this.s.accounts.bank;
    const interest = Math.floor((bal * 150) / 10000 / 12);
    if (interest > 0) this.receive('bank', interest, 'interest_income', '储蓄利息（年化 1.5%）', 'bank');
  }
}
