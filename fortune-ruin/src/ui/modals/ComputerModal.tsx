import { useState } from 'react';
import { store } from '../store';
import { useCore } from '../hooks';
import { AmountInput, GV, Modal, Tabs, useFeedback } from '../components';
import { HOMES, HOME_ORDER } from '../../data/housing';
import { JOBS } from '../../data/jobs';
import { formatClock, WEEKDAY_SHORT } from '../../core/calendar';
import { G, formatG, mulRatio } from '../../core/money';
import { MarketView } from './MarketView';
import { BillsTab } from './MoneyModals';
import { TIERS, TIER_INDEX } from '../../casino/tables';
import { CLUB_ANNUAL_FEE, LUMIERE_BOOKING_FEE } from '../../systems/ServicesSystem';
import { SHOPS, ITEMS } from '../../data/items';
import { effectText } from './ShopModal';

type Tab = 'housing' | 'jobs' | 'invest' | 'bills' | 'life' | 'payday';

export function ComputerModal(props: { tab?: Tab }): JSX.Element {
  const [tab, setTab] = useState<Tab>(props.tab ?? 'housing');
  return (
    <Modal title="电脑" sub="家里的旧笔记本电脑" wide="x">
      <Tabs<Tab>
        tabs={[
          { id: 'housing', label: '房屋' },
          { id: 'jobs', label: '招聘' },
          { id: 'invest', label: '证券' },
          { id: 'bills', label: '网上银行' },
          { id: 'life', label: '生活服务' },
          { id: 'payday', label: '随借 App' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ paddingTop: 12 }}>
        {tab === 'housing' && <HousingTab />}
        {tab === 'jobs' && <JobsTab />}
        {tab === 'invest' && <MarketView />}
        {tab === 'bills' && <BillsTab />}
        {tab === 'life' && <LifeTab />}
        {tab === 'payday' && <PaydayTab />}
      </div>
    </Modal>
  );
}

function moveTo(homeId: string): void {
  const core = store.core!;
  core.advance(120, 'idle');
  store.closeAll();
  store.world?.teleport(HOMES[homeId].location, 'bed');
  store.toast(`搬家公司花了两个小时，你搬进了${HOMES[homeId].name}。`, 'good');
}

function HousingTab(): JSX.Element {
  const core = useCore();
  const h = core.state.housing;
  const hs = core.housing;
  const [fb, say] = useFeedback();
  const cur = hs.current();
  const act = (fn: () => { ok: true; message: string } | { ok: false; error: string }, home?: string) => {
    const r = fn();
    say(r.ok, r.ok ? r.message : r.error);
    if (r.ok && home) moveTo(home);
  };
  return (
    <div className="stack">
      <div className="card">
        <h3>现在的家：{cur.name}</h3>
        <div className="muted" style={{ fontSize: 12 }}>
          {cur.district} · {cur.area} · {h.tenure === 'own' ? '自有产权' : `月租 ${formatG(h.rent)}`} · 每月居住总成本 <GV v={hs.monthlyCost()} /> · 舒适度 {Math.round(hs.comfort() * 100)}% · 体面度 {hs.prestige().toFixed(1)}
        </div>
      </div>
      <div className="list">
        {HOME_ORDER.map((id) => {
          const d = HOMES[id];
          const value = d.price !== null ? hs.marketValue(id) : null;
          const owned = h.owned.includes(id);
          const living = h.homeId === id;
          const rentErr = d.rent !== null ? hs.rentCheck(id) : null;
          const cashErr = d.price !== null ? hs.buyCheck(id, false) : null;
          const mortErr = d.price !== null ? hs.buyCheck(id, true) : null;
          return (
            <div className="item" key={id} style={living ? { borderColor: 'var(--gold)' } : undefined}>
              <div className="grow">
                <div className="title">
                  {d.name} {living && <span className="tag gold">现居</span>} {owned && <span className="tag good">已拥有</span>}
                </div>
                <div className="desc">
                  {d.district} · {d.area} · {d.desc}
                </div>
                <div className="desc">
                  {d.rent !== null && <>月租 {formatG(d.rent)}（押一付一 {formatG(d.rent * 2)}） · </>}
                  {value !== null && <>市价 {formatG(value)} · </>}
                  水电 {formatG(d.utilities)}/月{d.maintenance ? ` · 物业维护 ${formatG(d.maintenance)}/月` : ''} · 舒适度 {Math.round(d.comfort * 100)}% · 家具位 {d.furnitureSlots}
                </div>
                {!living && !owned && d.rent !== null && rentErr && <div className="desc bad">租房：{rentErr}</div>}
                {!living && !owned && d.price !== null && mortErr && cashErr && <div className="desc bad">购房：{mortErr}</div>}
              </div>
              <div className="stack" style={{ gap: 4 }}>
                {!living && !owned && d.rent !== null && (
                  <button className="small primary" disabled={!!rentErr} onClick={() => act(() => hs.rent(id), id)}>
                    租下
                  </button>
                )}
                {!owned && d.price !== null && (
                  <>
                    <button className="small" disabled={!!cashErr} title={cashErr ?? ''} onClick={() => act(() => hs.buy(id, false), id)}>
                      全款购买
                    </button>
                    <button className="small" disabled={!!mortErr} title={mortErr ?? `首付 20%：${formatG(mulRatio(value ?? 0, 20, 100))}，30 年 · 6.5%`} onClick={() => act(() => hs.buy(id, true), id)}>
                      贷款购买
                    </button>
                  </>
                )}
                {owned && !living && (
                  <>
                    <button className="small primary" onClick={() => act(() => hs.moveIntoOwned(id), id)}>
                      搬入
                    </button>
                    <button className="small danger" onClick={() => act(() => hs.sell(id))}>
                      出售
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {fb}
      <div className="note">房价随市场涨跌。卖房要付 5% 中介费，住着每月也有维护费和水电。</div>
    </div>
  );
}

function JobsTab(): JSX.Element {
  const core = useCore();
  const c = core.career;
  const [fb, say] = useFeedback();
  const apps = core.state.career.applications;
  return (
    <div className="stack">
      <div className="muted" style={{ fontSize: 12 }}>
        预计月收入 <GV v={c.monthlyIncomeEstimate()} />。可以兼几份工，只要班次不撞。
      </div>
      <div className="list">
        {Object.values(JOBS).map((d) => {
          const job = c.job(d.id);
          const req = c.requirementsMet(d.id);
          const pending = apps.some((a) => a.jobId === d.id && a.status === 'pending');
          return (
            <div className="item" key={d.id}>
              <div className="grow">
                <div className="title">
                  {d.title} · {d.employer} {job && <span className="tag good">{c.title(job)}</span>} {pending && <span className="tag warn">等待回复</span>}
                </div>
                <div className="desc">{d.desc}</div>
                <div className="desc">
                  {d.payType === 'salary' ? `月薪 ${formatG(d.rate)}` : `时薪 ${formatG(d.rate)}`}
                  {d.tipsPerHour ? ` + 小费（约 ${formatG(d.tipsPerHour)}/时）` : ''} ·{' '}
                  {d.flexible ? '时间自由' : `${d.days.map((x) => WEEKDAY_SHORT[x]).join('')} ${formatClock(d.start)}–${formatClock(d.end % 1440)}`} · 每小时压力 +{d.stressPerHour}
                  {d.casinoEmployee ? ' · 赌场员工不得在本场下注' : ''}
                </div>
                {!job && req && <div className="desc bad">条件：{req}</div>}
              </div>
              {job ? (
                <button
                  className="small danger"
                  onClick={() => {
                    const r = c.quit(d.id);
                    say(r.ok, r.ok ? r.message : r.error);
                  }}
                >
                  辞职
                </button>
              ) : (
                <button
                  className="small primary"
                  disabled={!!req || pending}
                  onClick={() => {
                    const r = c.apply(d.id);
                    say(r.ok, r.ok ? r.message : r.error);
                  }}
                >
                  {d.flexible ? '注册' : '投简历'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {fb}
    </div>
  );
}

function LifeTab(): JSX.Element {
  const core = useCore();
  const sv = core.services;
  const [fb, say] = useFeedback();
  const clubErr = sv.clubCheck();
  const furn = SHOPS.furniture;
  const res = Number(core.state.player.flags.lumiereReservation ?? -1);
  return (
    <div className="stack">
      <div className="grid2">
        <div className="card">
          <h3>Lumière 法餐厅 · 订位</h3>
          <div className="muted" style={{ fontSize: 12 }}>
            山丘区的米其林餐厅，需提前订位，着装要求：正装。订位费 {formatG(LUMIERE_BOOKING_FEE)}。{res >= core.today() && <span className="good"> 已预订：{res === core.today() ? '今天' : '明天'}</span>}
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button
              className="small"
              onClick={() => {
                const r = sv.bookLumiere(false);
                say(r.ok, r.ok ? r.message : r.error);
              }}
            >
              订今晚
            </button>
            <button
              className="small"
              onClick={() => {
                const r = sv.bookLumiere(true);
                say(r.ok, r.ok ? r.message : r.error);
              }}
            >
              订明晚
            </button>
          </div>
        </div>
        <div className="card">
          <h3>子午线会所 · 会员</h3>
          <div className="muted" style={{ fontSize: 12 }}>
            {sv.isClubMember() ? <span className="good">你是会员（有效至第 {Number(core.state.player.flags.clubMemberUntil) - core.today()} 天后）</span> : `年费 ${formatG(CLUB_ANNUAL_FEE)}。需要会员担保，或足够的身家与声望。`}
          </div>
          {!sv.isClubMember() && clubErr && <div className="error">{clubErr}</div>}
          {!sv.isClubMember() && (
            <button
              className="small primary"
              style={{ marginTop: 6 }}
              disabled={!!clubErr}
              onClick={() => {
                const r = sv.joinClub();
                say(r.ok, r.ok ? r.message : r.error);
              }}
            >
              申请入会
            </button>
          )}
        </div>
      </div>
      {furn && (
        <div className="card">
          <h3>家具网购（送货上门）</h3>
          <div className="list">
            {furn.items.map((id) => {
              const d = ITEMS[id];
              if (!d) return null;
              const owned = core.housing.furniture().includes(id);
              return (
                <div className="item" key={id}>
                  <div className="grow">
                    <div className="title">
                      {d.name} {owned && <span className="tag good">家里已有</span>}
                    </div>
                    <div className="desc">
                      {d.desc} {effectText(d)}
                    </div>
                  </div>
                  <GV v={d.price} />
                  <button
                    className="small"
                    disabled={owned}
                    onClick={() => {
                      const r = core.inventory.buy('furniture', id, 'card');
                      say(r.ok, r.ok ? r.message : r.error);
                    }}
                  >
                    下单
                  </button>
                </div>
              );
            })}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            家具位：{core.housing.furniture().length}/{core.housing.current().furnitureSlots}（搬家时家具跟着你走）
          </div>
        </div>
      )}
      {fb}
    </div>
  );
}

function PaydayTab(): JSX.Element {
  const core = useCore();
  const [amount, setAmount] = useState(500);
  const [fb, say] = useFeedback();
  const q = core.economy.paydayQuote(G(amount));
  return (
    <div className="stack">
      <div className="card" style={{ borderColor: 'rgba(255,107,107,0.5)' }}>
        <h3 style={{ color: 'var(--bad)' }}>随借 App · 秒到账</h3>
        <div className="muted" style={{ fontSize: 12 }}>不查征信，最快 1 分钟到账。最高 2,000 G，借期 1 个月。</div>
        <div className="row" style={{ marginTop: 8 }}>
          <AmountInput value={amount} onChange={setAmount} step={100} /> <span className="muted">G</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 12 }}>
          一个月后应还 <GV v={q.monthly} />（利息 <GV v={q.totalInterest} />，折合年化 {(q.aprBp / 100).toFixed(0)}%）
        </div>
        {!q.ok && <div className="error">{q.reason}</div>}
        <button
          className="danger"
          style={{ marginTop: 8 }}
          disabled={!q.ok}
          onClick={() => {
            const r = core.economy.takePayday(G(amount));
            say(r.ok, r.ok ? `${formatG(G(amount))} 已到账。` : r.error);
          }}
        >
          确认借款
        </button>
      </div>
      {fb}
      <div className="note">高利贷是最昂贵的钱。它能解一时之急，但每个月 30% 的成本会让窟窿越来越大。逾期同样会被记入信用记录。</div>
    </div>
  );
}

export function CasinoMemberModal(): JSX.Element {
  const core = useCore();
  const cs = core.state.casino;
  const m = cs.membership;
  const tier = core.casino.tierInfo();
  const next = core.casino.nextTier();
  const st = cs.stats;
  return (
    <Modal title="灰港大赌场 · 会员卡" sub={tier.name} wide>
      <div className="grid3">
        <div className="card">
          <h3>当前积分</h3>
          <div className="num">{Math.round(m.points).toLocaleString()}</div>
          {next && <div className="muted" style={{ fontSize: 12 }}>距 {next.name} 还需 {Math.max(0, Math.round(next.minPoints - m.points)).toLocaleString()}</div>}
        </div>
        <div className="card">
          <h3>累计投注额</h3>
          <GV v={m.lifetimeHandle} />
          <div className="muted" style={{ fontSize: 12 }}>理论损失 {formatG(m.lifetimeTheo)}</div>
        </div>
        <div className="card">
          <h3>餐饮积分</h3>
          <GV v={cs.comps} />
          <div className="muted" style={{ fontSize: 12 }}>只能用于赌场餐饮，不能兑现</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <h3>累计战绩</h3>
        <div className="row wrap" style={{ gap: 16, fontSize: 12 }}>
          <span>
            总盈亏 <GV v={Object.values(st.byGame).reduce((a, g) => a + g.net, 0)} sign />
          </span>
          <span>局数 {Object.values(st.byGame).reduce((a, g) => a + g.rounds, 0).toLocaleString()}</span>
          <span>
            单局最大赢 <GV v={st.biggestWin} />
          </span>
          <span>
            单局最大输 <GV v={st.biggestLoss} sign />
          </span>
        </div>
      </div>
      <table className="data" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>等级</th>
            <th className="r">积分门槛</th>
            <th>礼遇</th>
          </tr>
        </thead>
        <tbody>
          {TIERS.map((t) => (
            <tr key={t.id} style={TIER_INDEX[t.id] === TIER_INDEX[m.tier] ? { background: 'rgba(224,177,62,0.08)' } : undefined}>
              <td style={{ color: t.color, fontWeight: 700 }}>{t.name}</td>
              <td className="r num">{t.minPoints.toLocaleString()}</td>
              <td className="muted">{t.perks.join('、')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note" style={{ marginTop: 10 }}>
        积分按下注额乘以该游戏的庄家优势累计。
      </div>
    </Modal>
  );
}
