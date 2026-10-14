import { useState } from 'react';
import { store } from '../store';
import { useCore } from '../hooks';
import { AmountInput, GV, Modal, Tabs, useFeedback } from '../components';
import { G, formatG } from '../../core/money';
import { ATM_DAILY_LIMIT, ATM_FEES } from '../../systems/EconomySystem';
import { MarketView } from './MarketView';
import { toDate } from '../../core/calendar';

// ------------------------------------------------------------------ cashier cage

export function CashierModal(): JSX.Element {
  const core = useCore();
  const eco = core.economy;
  const [buy, setBuy] = useState(500);
  const [sell, setSell] = useState(Math.floor(eco.balance('chips') / 100));
  const [fb, say] = useFeedback();
  const chips = eco.balance('chips');
  const doBuy = (from: 'cash' | 'bank') => {
    const r = eco.buyChips(G(buy), from);
    say(r.ok, r.ok ? `兑换了 ${formatG(G(buy))} 筹码${from === 'bank' ? `（另收 3% 手续费 ${formatG(Math.floor(G(buy) * 0.03))}）` : ''}` : r.error);
    if (r.ok) core.touch();
  };
  const doSell = (amount: number) => {
    const r = eco.cashOutChips(amount);
    say(r.ok, r.ok ? `兑现了 ${formatG(amount)}，现金已放入钱包` : r.error);
    if (r.ok) setSell(Math.floor(eco.balance('chips') / 100));
  };
  return (
    <Modal title="筹码兑换台" sub={`会员：${core.casino.tierInfo().name}`}>
      <div className="grid3" style={{ marginBottom: 12 }}>
        <div className="card">
          <h3>现金</h3>
          <GV v={eco.balance('cash')} />
        </div>
        <div className="card">
          <h3>银行存款</h3>
          <GV v={eco.balance('bank')} />
        </div>
        <div className="card">
          <h3>筹码</h3>
          <GV v={chips} className="gold" />
        </div>
      </div>
      <div className="card" style={{ marginBottom: 10 }}>
        <h3>买入筹码</h3>
        <div className="row wrap">
          <AmountInput value={buy} onChange={setBuy} /> <span className="muted">G</span>
          {[100, 500, 1000, 5000].map((v) => (
            <button key={v} className="small ghost" onClick={() => setBuy(v)}>
              {v.toLocaleString()}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" disabled={buy <= 0} onClick={() => doBuy('cash')}>
            用现金兑换
          </button>
          <button disabled={buy <= 0} onClick={() => doBuy('bank')}>
            刷卡兑换（+3% 手续费）
          </button>
        </div>
      </div>
      <div className="card">
        <h3>筹码兑现</h3>
        <div className="row wrap">
          <AmountInput value={sell} onChange={setSell} /> <span className="muted">G</span>
          <button className="small" disabled={sell <= 0 || G(sell) > chips} onClick={() => doSell(G(sell))}>
            兑现
          </button>
          <button className="small primary" disabled={chips <= 0} onClick={() => doSell(chips)}>
            全部兑现
          </button>
        </div>
      </div>
      {fb}
      <div className="note" style={{ marginTop: 10 }}>筹码只能在赌场内使用，和现金一样计入你的资产。离开前别忘了兑现。</div>
    </Modal>
  );
}

// ------------------------------------------------------------------ ATM

export function AtmModal(props: { where: 'branch' | 'street' | 'casino' }): JSX.Element {
  const core = useCore();
  const eco = core.economy;
  const [amount, setAmount] = useState(200);
  const [fb, say] = useFeedback();
  const st = core.state.economy;
  const today = toDate(core.now()).dayIndex;
  const used = st.atmDay === today ? st.atmWithdrawn : 0;
  const fee = ATM_FEES[props.where];
  const withdraw = (g: number) => {
    const r = eco.withdraw(G(g), props.where);
    say(r.ok, r.ok ? `取出 ${formatG(G(g))}${fee > 0 ? `，手续费 ${formatG(fee)}` : ''}` : r.error);
  };
  return (
    <Modal title={props.where === 'casino' ? '赌场 ATM' : props.where === 'branch' ? '银行 ATM' : '街边 ATM'} sub={`手续费 ${fee > 0 ? formatG(fee) : '免费'} · 今日已取 ${formatG(used)} / ${formatG(ATM_DAILY_LIMIT)}`}>
      <div className="grid2" style={{ marginBottom: 10 }}>
        <div className="card">
          <h3>账户余额</h3>
          <GV v={eco.balance('bank')} />
        </div>
        <div className="card">
          <h3>钱包现金</h3>
          <GV v={eco.balance('cash')} />
        </div>
      </div>
      <div className="row wrap">
        {[100, 200, 500, 1000, 2000].map((v) => (
          <button key={v} onClick={() => withdraw(v)}>
            取 {v.toLocaleString()}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <AmountInput value={amount} onChange={setAmount} /> <span className="muted">G</span>
        <button className="primary" disabled={amount <= 0} onClick={() => withdraw(amount)}>
          取款
        </button>
        {props.where === 'branch' && (
          <button
            disabled={amount <= 0}
            onClick={() => {
              const r = eco.deposit(G(amount));
              say(r.ok, r.ok ? `存入 ${formatG(G(amount))}` : r.error);
            }}
          >
            存款
          </button>
        )}
      </div>
      {fb}
      {props.where === 'casino' && <div className="note" style={{ marginTop: 10 }}>赌场里的 ATM 手续费最高——这不是巧合。</div>}
    </Modal>
  );
}

// ------------------------------------------------------------------ bank

type BankTab = 'account' | 'bills' | 'loans' | 'invest';

export function BankModal(props: { tab: 'account' | 'loans' | 'invest' }): JSX.Element {
  const core = useCore();
  const [tab, setTab] = useState<BankTab>(props.tab);
  return (
    <Modal title="灰港储蓄信托" sub={`信用分 ${core.state.player.creditScore} · 储蓄年化 1.5%`} wide="x">
      <Tabs<BankTab>
        tabs={[
          { id: 'account', label: '账户' },
          { id: 'bills', label: `账单${core.economy.unpaidBills().length ? ` (${core.economy.unpaidBills().length})` : ''}` },
          { id: 'loans', label: '贷款' },
          { id: 'invest', label: '证券投资' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ paddingTop: 12 }}>
        {tab === 'account' && <AccountTab />}
        {tab === 'bills' && <BillsTab />}
        {tab === 'loans' && <LoansTab />}
        {tab === 'invest' && <MarketView />}
      </div>
    </Modal>
  );
}

function AccountTab(): JSX.Element {
  const core = useCore();
  const eco = core.economy;
  const [amount, setAmount] = useState(500);
  const [fb, say] = useFeedback();
  const st = core.state.economy;
  const atBank = core.state.world.location === 'bank';
  return (
    <div className="stack">
      <div className="grid3">
        <div className="card">
          <h3>储蓄账户</h3>
          <GV v={eco.balance('bank')} />
        </div>
        <div className="card">
          <h3>现金</h3>
          <GV v={eco.balance('cash')} />
        </div>
        <div className="card">
          <h3>每月固定支出</h3>
          <GV v={eco.monthlyObligations()} />
        </div>
      </div>
      {atBank ? (
        <div className="row wrap">
          <AmountInput value={amount} onChange={setAmount} /> <span className="muted">G</span>
          <button
            className="primary"
            onClick={() => {
              const r = eco.deposit(G(amount));
              say(r.ok, r.ok ? `存入 ${formatG(G(amount))}` : r.error);
            }}
          >
            柜台存款
          </button>
          <button
            onClick={() => {
              const r = eco.withdraw(G(amount), 'branch');
              say(r.ok, r.ok ? `取出 ${formatG(G(amount))}` : r.error);
            }}
          >
            柜台取款（无限额、免手续费）
          </button>
          <button className="ghost small" onClick={() => setAmount(Math.floor(eco.balance('cash') / 100))}>
            全部现金
          </button>
        </div>
      ) : (
        <div className="note">存取现金要去银行柜台或 ATM。</div>
      )}
      <label className="row" style={{ cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={st.autopay}
          onChange={(e) => {
            st.autopay = e.target.checked;
            core.touch();
          }}
        />
        自动扣款：到期从存款里付房租、水电和月供
      </label>
      {fb}
      <h4 style={{ margin: '8px 0 0', color: 'var(--gold-light)' }}>最近交易</h4>
      <table className="data">
        <tbody>
          {st.ledger
            .filter((t) => t.from === 'bank' || t.to === 'bank')
            .slice(-12)
            .reverse()
            .map((t) => (
              <tr key={t.id}>
                <td className="dim">{toDate(t.t).month + 1}/{toDate(t.t).day}</td>
                <td>{t.memo}</td>
                <td className="r">
                  <GV v={t.to === 'bank' ? t.amount : -t.amount} sign />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function BillsTab(): JSX.Element {
  const core = useCore();
  const eco = core.economy;
  const [fb, say] = useFeedback();
  const bills = eco.unpaidBills();
  const today = core.today();
  return (
    <div className="stack">
      {bills.length === 0 ? (
        <div className="note">没有待付账单。</div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>账单</th>
              <th>收款方</th>
              <th className="r">金额</th>
              <th>到期</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => {
              const late = today > b.dueDay;
              return (
                <tr key={b.id}>
                  <td>{b.memo}</td>
                  <td className="muted">{b.payeeName}</td>
                  <td className="r">
                    <GV v={eco.billTotal(b)} />
                    {b.lateFees > 0 && <div className="bad" style={{ fontSize: 12 }}>含滞纳金 {formatG(b.lateFees)}</div>}
                  </td>
                  <td className={late ? 'bad' : ''}>{late ? `逾期 ${today - b.dueDay} 天` : b.dueDay === today ? '今天' : `${b.dueDay - today} 天后`}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button
                        className="small primary"
                        onClick={() => {
                          const r = eco.payBill(b.id, 'bank');
                          say(r.ok, r.ok ? '已支付' : r.error);
                        }}
                      >
                        存款支付
                      </button>
                      <button
                        className="small"
                        onClick={() => {
                          const r = eco.payBill(b.id, 'cash');
                          say(r.ok, r.ok ? '已用现金支付' : r.error);
                        }}
                      >
                        现金
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {fb}
      <div className="note">逾期会产生滞纳金并影响信用分。信用分决定贷款利率和能否租到好房子。</div>
    </div>
  );
}

function LoansTab(): JSX.Element {
  const core = useCore();
  const eco = core.economy;
  const [principal, setPrincipal] = useState(5000);
  const [term, setTerm] = useState(12);
  const [prepay, setPrepay] = useState<Record<string, number>>({});
  const [fb, say] = useFeedback();
  const q = eco.personalLoanQuote(G(principal), term);
  const loans = core.state.economy.loans.filter((l) => l.status !== 'paid');
  const income = core.career.monthlyIncomeEstimate();
  return (
    <div className="stack">
      {loans.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th>贷款</th>
              <th className="r">剩余本金</th>
              <th className="r">年利率</th>
              <th className="r">月供</th>
              <th>状态</th>
              <th>提前还款</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => (
              <tr key={l.id}>
                <td>{l.lenderName}</td>
                <td className="r">
                  <GV v={l.balance} />
                </td>
                <td className="r">{(l.aprBp / 100).toFixed(2)}%</td>
                <td className="r">
                  <GV v={l.monthlyPayment} />
                </td>
                <td className={l.status === 'default' ? 'bad' : l.missedPayments ? 'warn' : ''}>
                  {l.status === 'default' ? '已违约' : l.missedPayments ? `逾期 ${l.missedPayments} 期` : `已还 ${l.paymentsMade} 期`}
                </td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <AmountInput value={prepay[l.id] ?? Math.ceil(l.balance / 100)} onChange={(v) => setPrepay({ ...prepay, [l.id]: v })} />
                    <button
                      className="small"
                      onClick={() => {
                        const r = eco.prepayLoan(l.id, G(prepay[l.id] ?? Math.ceil(l.balance / 100)));
                        say(r.ok, r.ok ? '还款成功' : r.error);
                      }}
                    >
                      还款
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="card">
        <h3>申请个人贷款</h3>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          估算月收入 <GV v={income} /> · 信用分 {core.state.player.creditScore} · 银行按你的收入与现有负债核定额度
        </div>
        <div className="row wrap">
          <span className="muted">金额</span>
          <AmountInput value={principal} onChange={setPrincipal} step={100} /> <span className="muted">G</span>
          <span className="muted" style={{ marginLeft: 8 }}>
            期限
          </span>
          {[6, 12, 24, 36].map((m) => (
            <button key={m} className={`small ${term === m ? 'primary' : ''}`} onClick={() => setTerm(m)}>
              {m} 个月
            </button>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          年利率 <b>{(q.aprBp / 100).toFixed(2)}%</b> · 月供 <GV v={q.monthly} /> · 总利息 <GV v={q.totalInterest} /> · 可贷上限 <GV v={q.maxPrincipal} />
        </div>
        {!q.ok && <div className="error">{q.reason}</div>}
        <button
          className="primary"
          style={{ marginTop: 8 }}
          disabled={!q.ok}
          onClick={() => {
            const r = eco.takePersonalLoan(G(principal), term);
            say(r.ok, r.ok ? `放款 ${formatG(G(principal))} 已到账` : r.error);
          }}
        >
          签约借款
        </button>
      </div>
      {fb}
      <div className="note">借来的钱是负债，每月都要还。连续三期不还算违约，信用分会大跌。</div>
    </div>
  );
}

export function closeAll(): void {
  store.closeAll();
}
