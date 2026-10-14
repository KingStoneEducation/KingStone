import { useState } from 'react';
import { store } from '../store';
import { useCore } from '../hooks';
import { GV, Modal, Tabs } from '../components';
import { ACCOUNT_NAMES, CATEGORY_NAMES } from '../../systems/EconomySystem';
import { WEALTH_CLASSES } from '../../systems/WealthSystem';
import { toDate } from '../../core/calendar';
import { BarChart, LineChart } from './charts';
import type { TxnCategory } from '../../core/state';

type Tab = 'overview' | 'ledger' | 'trends';

export function FinancePanel(): JSX.Element {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <Modal title="资产与财务" wide="x" onClose={() => store.closePanel()}>
      <Tabs<Tab>
        tabs={[
          { id: 'overview', label: '总览' },
          { id: 'ledger', label: '流水' },
          { id: 'trends', label: '趋势' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ paddingTop: 12 }}>
        {tab === 'overview' && <Overview />}
        {tab === 'ledger' && <Ledger />}
        {tab === 'trends' && <Trends />}
      </div>
    </Modal>
  );
}

function Overview(): JSX.Element {
  const core = useCore();
  const eco = core.economy;
  const w = core.wealth;
  const cls = w.wealthClass();
  const circle = w.circleImpression();
  const loans = core.state.economy.loans.filter((l) => l.status !== 'paid');
  const bills = eco.unpaidBills();
  const income = core.career.monthlyIncomeEstimate();
  const obligations = eco.monthlyObligations();
  const assets: [string, number][] = [
    ['现金', eco.balance('cash')],
    ['银行存款', eco.balance('bank')],
    ['赌场筹码', eco.balance('chips')],
    ['证券持仓', eco.securitiesValue()],
    ['房产（市价）', eco.propertyValue()],
    ['车辆', eco.vehicleValue()],
    ['贵重物品', eco.valuablesValue()],
    ['别人欠你的钱', eco.receivablesValue()],
    ['私人投资（股份）', eco.stakesValue()],
    ...(core.state.business ? ([['自己的生意（估值）', core.business.value()]] as [string, number][]) : []),
    ...(core.pawn.openTickets().length ? ([['当在当铺的东西（估价减去赎回所需）', core.pawn.equity()]] as [string, number][]) : []),
    ...(core.state.auction?.collection.length ? ([['收藏品（拍卖行参考市值）', core.auction.value()]] as [string, number][]) : []),
  ];
  return (
    <div className="stack">
      <div className="grid3">
        <div className="card">
          <h3>真实净资产</h3>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            <GV v={w.real()} />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {cls.name} · {cls.desc}
          </div>
        </div>
        <div className="card">
          <h3>流动财富</h3>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            <GV v={w.liquid()} />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>现金 + 存款 + 筹码 + 可卖出的证券</div>
        </div>
        <div className="card">
          <h3>别人眼中的你</h3>
          <div style={{ fontSize: 12 }}>
            陌生人估计 <GV v={w.perceivedByStrangers()} />
          </div>
          <div style={{ fontSize: 12 }}>{circle.avg !== null ? <>熟人平均估计 <GV v={circle.avg} />（{circle.n} 人）</> : '还没有人了解你的身家'}</div>
          <div className="muted" style={{ fontSize: 12 }}>只来自衣着、住处、他们看到和听到的事</div>
        </div>
      </div>
      <div className="grid2">
        <div className="card">
          <h3>资产</h3>
          <table className="data">
            <tbody>
              {assets.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="r">
                    <GV v={v} />
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <b>合计</b>
                </td>
                <td className="r">
                  <b>
                    <GV v={eco.totalAssets()} />
                  </b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>负债</h3>
          <table className="data">
            <tbody>
              {loans.length === 0 && bills.length === 0 && (
                <tr>
                  <td className="muted">没有负债</td>
                  <td />
                </tr>
              )}
              {loans.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.lenderName}
                    {l.status === 'default' && <span className="tag bad">违约</span>}
                  </td>
                  <td className="r">
                    <GV v={l.balance} />
                  </td>
                </tr>
              ))}
              {bills
                .filter((b) => b.kind !== 'loan')
                .map((b) => (
                  <tr key={b.id}>
                    <td>{b.memo}</td>
                    <td className="r">
                      <GV v={eco.billTotal(b)} />
                    </td>
                  </tr>
                ))}
              <tr>
                <td>
                  <b>合计</b>
                </td>
                <td className="r">
                  <b>
                    <GV v={eco.totalDebt()} />
                  </b>
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 12 }}>
            每月固定支出 <GV v={obligations} /> · 预计月收入 <GV v={income} /> · 信用分 {core.state.player.creditScore}
          </div>
          {income > 0 && obligations > income * 0.6 && <div className="error">固定支出超过收入的 60%，现金流很紧张。</div>}
        </div>
      </div>
      <div className="card">
        <h3>财富阶层</h3>
        <div className="row wrap" style={{ gap: 6 }}>
          {WEALTH_CLASSES.map((c) => (
            <span key={c.id} className={`tag ${c.id === cls.id ? 'gold' : ''}`}>
              {c.name} {c.min === -Infinity ? '资不抵债' : `${(c.min / 100).toLocaleString()} G 以上`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Ledger(): JSX.Element {
  const core = useCore();
  const [cat, setCat] = useState<string>('all');
  const ledger = core.state.economy.ledger;
  const rows = ledger.filter((t) => cat === 'all' || t.cat === cat).slice(-150).reverse();
  const cats = [...new Set(ledger.map((t) => t.cat))];
  const flow = core.state.economy.today;
  return (
    <div className="stack">
      <div className="row between">
        <div style={{ fontSize: 12 }}>
          今日收入 <GV v={flow.income} /> · 支出 <GV v={flow.expenses} /> · 赌场 <GV v={flow.casinoNet} sign />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">全部类别</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_NAMES[c as TxnCategory] ?? c}
            </option>
          ))}
        </select>
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>时间</th>
            <th>说明</th>
            <th>类别</th>
            <th>账户</th>
            <th className="r">金额</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const d = toDate(t.t);
            const isAcc = (a: string) => a === 'cash' || a === 'bank' || a === 'chips';
            const out = isAcc(t.from);
            const account = out ? t.from : t.to;
            const internal = isAcc(t.from) && isAcc(t.to);
            return (
              <tr key={t.id}>
                <td className="dim">
                  {d.month + 1}/{d.day} {String(d.hour).padStart(2, '0')}:{String(d.minute).padStart(2, '0')}
                </td>
                <td>{t.memo}</td>
                <td className="muted">{CATEGORY_NAMES[t.cat] ?? t.cat}</td>
                <td className="muted">{internal ? `${ACCOUNT_NAMES[t.from as 'cash']} → ${ACCOUNT_NAMES[t.to as 'cash']}` : ACCOUNT_NAMES[account as 'cash']}</td>
                <td className="r">{internal ? <GV v={t.amount} /> : <GV v={out ? -t.amount : t.amount} sign />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Trends(): JSX.Element {
  const core = useCore();
  const days = core.state.stats.days.slice(-90);
  const labels = days.map((d) => `${toDate(d.day * 1440).month + 1}/${toDate(d.day * 1440).day}`);
  let cum = 0;
  const casinoCum = days.map((d) => (cum += d.casinoNet));
  return (
    <div className="stack">
      <div className="card">
        <h3>净资产与流动资金（近 90 天）</h3>
        <LineChart
          labels={labels}
          series={[
            { name: '净资产', color: '#e0b13e', data: days.map((d) => d.netWorth) },
            { name: '流动资金', color: '#46f0ff', data: days.map((d) => d.liquid) },
            { name: '负债', color: '#ff6b6b', data: days.map((d) => d.debt) },
          ]}
        />
      </div>
      <div className="grid2">
        <div className="card">
          <h3>每日现金流：收入减支出</h3>
          <BarChart data={days.map((d) => d.income - d.expenses)} />
        </div>
        <div className="card">
          <h3>赌场累计盈亏</h3>
          <LineChart zero series={[{ name: '累计', color: '#ff4fa3', data: casinoCum }]} height={120} />
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        历史最高净资产 <GV v={core.state.stats.peakNetWorth} /> · 历史最低 <GV v={core.state.stats.lowestNetWorth} />
      </div>
    </div>
  );
}
