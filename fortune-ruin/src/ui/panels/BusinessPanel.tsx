import { useState } from 'react';
import { store } from '../store';
import { useCore } from '../hooks';
import { GV, Modal, Tabs, useFeedback } from '../components';
import { BarChart } from './charts';
import { formatG } from '../../core/money';
import { toDate } from '../../core/calendar';
import { BIZ_ORDER, BIZ_TYPES, MARKETING, PREMISES, PREMISE_ORDER, PRICE_LEVELS, RENOVATION_DAYS, SUPPLY_LEVELS, type PriceLevel, type Supplies } from '../../data/business';

export function BusinessPanel(): JSX.Element {
  return (
    <Modal title="我的生意" wide="x" onClose={() => store.closePanel()}>
      <BusinessView />
    </Modal>
  );
}

/** Leasing and running the shops; also shown as a tab on the home computer. */
export function BusinessView(): JSX.Element {
  const core = useCore();
  const shops = core.business.list();
  // the shop you are standing in, else the first one, else the listings
  const [tab, setTab] = useState<string>(() => core.business.here()?.premise ?? shops[0]?.premise ?? 'lease');
  const current = tab !== 'lease' && core.business.at(tab) ? tab : (shops[0]?.premise ?? 'lease');
  const free = PREMISE_ORDER.filter((id) => !core.business.at(id));
  return (
    <div className="stack">
      {shops.length > 0 && (
        <Tabs<string>
          tabs={[
            ...shops.map((x) => ({ id: x.premise, label: `${BIZ_TYPES[x.type].name} · ${PREMISES[x.premise].address.split('（')[0]}` })),
            ...(free.length ? [{ id: 'lease', label: '招租铺面' }] : []),
          ]}
          value={current}
          onChange={setTab}
        />
      )}
      {current === 'lease' ? <Lease /> : <Running key={current} premise={current} />}
    </div>
  );
}

/** "×1.3" next to an ordinary street. */
const times = (x: number) => `×${x.toFixed(1)}`;

function Lease(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const free = PREMISE_ORDER.filter((id) => !core.business.at(id));
  const [pick, setPick] = useState(free[0]);
  const p = PREMISES[free.includes(pick) ? pick : free[0]];
  if (!p) return <div className="note">所有铺面都是你的了。</div>;
  return (
    <div className="stack">
      {free.length > 1 && <Choice<string> value={p.id} options={free.map((id) => [id, PREMISES[id].address.split('（')[0]])} onChange={setPick} />}
      <div className="card">
        <h3>招租：{p.address}</h3>
        <div style={{ fontSize: 12 }}>{p.desc}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          月租 <GV v={p.rent} /> · 押金两个月（退租时退还） · 装修 {RENOVATION_DAYS} 天
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          人流：{p.crowd}（工作日约为普通商业街的 {times(p.footfall)}，周末 {times(p.footfall * p.weekend)}）
        </div>
      </div>
      <div className="note">
        签约时一次付清押金、首月租金和装修费。之后每月 1 日交房租、工资和水电，每周付推广费，每天打烊后营业额减去进货结进银行。刚开张的几个月知道的人少，多半是亏的。
      </div>
      <div className="list">
        {BIZ_ORDER.map((t) => {
          const d = BIZ_TYPES[t];
          const err = core.business.canLease(p.id, t);
          const total = core.business.upfront(p.id, t);
          const fit = p.suits[t] ?? 1;
          return (
            <div className="item" key={t}>
              <div className="grow">
                <div className="title">{d.name}</div>
                <div className="desc">{d.desc}</div>
                <div className="desc muted">
                  装修与设备 {formatG(d.fitout)} · 客单价约 {formatG(d.ticket)} · 员工月薪 {formatG(d.wage)} · 水电执照每月 {formatG(d.utilities)} · 营业 {d.hours[0]}:00–{d.hours[1] % 24}:00
                </div>
                <div className="desc muted">
                  在这里：{fit > 1.05 ? '很适合这条街' : fit < 0.95 ? '不太适合这条街' : '和别处差不多'} · 上门的人工作日 {times(core.business.footfall(p.id, t, false))}、周末 {times(core.business.footfall(p.id, t, true))}
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 120 }}>
                <div className="muted" style={{ fontSize: 12 }}>签约共需</div>
                <GV v={total} />
              </div>
              <button
                className="small primary"
                disabled={!!err}
                title={err ?? undefined}
                onClick={() => {
                  const r = core.business.lease(p.id, t);
                  say(r.ok, r.ok ? r.message : r.error);
                }}
              >
                签约开店
              </button>
            </div>
          );
        })}
      </div>
      {fb}
    </div>
  );
}

function Choice<T extends string | number>(props: { value: T; options: [T, string][]; onChange: (v: T) => void }): JSX.Element {
  return (
    <div className="row wrap" style={{ gap: 4 }}>
      {props.options.map(([v, l]) => (
        <button key={String(v)} className={`small ${props.value === v ? 'primary' : ''}`} onClick={() => props.onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Running(props: { premise: string }): JSX.Element {
  const core = useCore();
  const biz = core.business;
  const b = biz.at(props.premise)!;
  const d = BIZ_TYPES[b.type];
  const p = PREMISES[b.premise];
  const [fb, say] = useFeedback();
  const [confirm, setConfirm] = useState<'sell' | 'close' | null>(null);
  const last7 = b.days.slice(-7);
  const sum = (k: 'customers' | 'revenue' | 'net') => last7.reduce((a, x) => a + x[k], 0);
  const recent = b.days.slice(-28);
  const opening = b.phase === 'renovating';
  return (
    <div className="stack">
      <div className="grid3">
        <div className="card">
          <h3>
            {d.name} · {p.address}
          </h3>
          <div style={{ fontSize: 12 }}>
            {opening ? (
              <span>装修中，{toDate(b.openDay * 1440).month + 1} 月 {toDate(b.openDay * 1440).day} 日开业</span>
            ) : (
              <span>
                已营业 {core.today() - b.openDay} 天 · 声誉 {Math.round(b.reputation)} · 知名度 {Math.round(b.awareness * 100)}%
              </span>
            )}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            店里需要约 {biz.staffNeeded(b)} 名员工；你可以去店里帮忙看店，当天服务更好、能接待更多客人。
          </div>
        </div>
        <div className="card">
          <h3>最近 7 天</h3>
          <div style={{ fontSize: 12 }}>
            顾客 {sum('customers')} 人 · 营业额 <GV v={sum('revenue')} />
          </div>
          <div style={{ fontSize: 12 }}>
            扣除进货后 <GV v={sum('net')} sign />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            按最近的生意估算，每月扣除全部固定成本后 <GV v={biz.monthlyProfit(b)} sign />
          </div>
        </div>
        <div className="card">
          <h3>估值</h3>
          <div style={{ fontSize: 12 }}>
            <GV v={biz.valueOf(b)} />（设备折旧价 + 一年利润 + 押金）
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            开店至今累计盈亏 <GV v={biz.lifetimeProfit(b)} sign />（含装修投入）
          </div>
        </div>
      </div>
      {recent.length > 1 && (
        <div className="card">
          <h3>每日营业额减进货（近 {recent.length} 天）</h3>
          <BarChart data={recent.map((x) => x.net)} height={100} />
        </div>
      )}
      <div className="grid2">
        <div className="card stack" style={{ gap: 8 }}>
          <h3>经营方针</h3>
          <div className="field">
            <label>价格</label>
            <Choice<PriceLevel> value={b.price} options={(Object.keys(PRICE_LEVELS) as PriceLevel[]).map((k) => [k, PRICE_LEVELS[k].name])} onChange={(v) => biz.setPolicy(b.premise, { price: v })} />
          </div>
          <div className="field">
            <label>货源</label>
            <Choice<Supplies> value={b.supplies} options={(Object.keys(SUPPLY_LEVELS) as Supplies[]).map((k) => [k, SUPPLY_LEVELS[k].name])} onChange={(v) => biz.setPolicy(b.premise, { supplies: v })} />
          </div>
          <div className="field">
            <label>员工（每人月薪 {formatG(d.wage)}）</label>
            <Choice<number> value={b.staff} options={[1, 2, 3, 4, 5, 6].map((n) => [n, `${n} 人`])} onChange={(v) => biz.setPolicy(b.premise, { staff: v })} />
          </div>
          <div className="field">
            <label>推广</label>
            <Choice<number> value={b.marketing} options={MARKETING.map((m, i) => [i, m.cost ? `${m.name}（每周 ${formatG(m.cost)}）` : m.name])} onChange={(v) => biz.setPolicy(b.premise, { marketing: v })} />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            每月固定成本 <GV v={biz.fixedPerMonth(b)} />（房租、工资、水电与推广）
          </div>
        </div>
        <div className="card stack" style={{ gap: 8 }}>
          <h3>转让或关店</h3>
          <div style={{ fontSize: 12 }}>
            有人愿意出 <GV v={biz.offer(b)} /> 接手整家店（开业满两周后才有人问）。关店则设备按 {formatG(Math.round(b.fitout * 0.12))} 变卖，押金退还。
          </div>
          <div className="row" style={{ gap: 6 }}>
            {confirm ? (
              <>
                <button
                  className="small danger"
                  onClick={() => {
                    const r = confirm === 'sell' ? biz.sell(b.premise) : biz.close(b.premise);
                    say(r.ok, r.ok ? r.message : r.error);
                    setConfirm(null);
                  }}
                >
                  确定{confirm === 'sell' ? '转让' : '关店'}
                </button>
                <button className="small" onClick={() => setConfirm(null)}>
                  再想想
                </button>
              </>
            ) : (
              <>
                <button className="small" disabled={opening || b.days.length < 14} onClick={() => setConfirm('sell')}>
                  转让
                </button>
                <button className="small" onClick={() => setConfirm('close')}>
                  关店
                </button>
              </>
            )}
          </div>
          {fb}
        </div>
      </div>
    </div>
  );
}
