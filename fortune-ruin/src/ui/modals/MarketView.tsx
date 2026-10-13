import { useState } from 'react';
import { useCore } from '../hooks';
import { GV, useFeedback } from '../components';
import { ASSETS } from '../../systems/MarketSystem';
import { formatG } from '../../core/money';

export function Sparkline(props: { data: number[]; width?: number; height?: number; color?: string }): JSX.Element {
  const w = props.width ?? 120;
  const h = props.height ?? 28;
  const d = props.data;
  if (d.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...d);
  const max = Math.max(...d);
  const span = max - min || 1;
  const pts = d.map((v, i) => `${((i / (d.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * (h - 2) - 1).toFixed(1)}`).join(' ');
  const up = d[d.length - 1] >= d[0];
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={props.color ?? (up ? '#58d68d' : '#ff6b6b')} strokeWidth={1.4} />
    </svg>
  );
}

export function MarketView(): JSX.Element {
  const core = useCore();
  const [units, setUnits] = useState<Record<string, number>>({});
  const [fb, say] = useFeedback();
  const weekend = core.today() % 7 >= 5;
  const holdings = core.state.economy.holdings;
  const total = core.market.portfolioValue();
  const basis = Object.values(holdings).reduce((a, h) => a + h.costBasis, 0);
  return (
    <div className="stack">
      <div className="row between">
        <div>
          持仓市值 <GV v={total} />
          {basis > 0 && (
            <span style={{ marginLeft: 10 }}>
              浮动盈亏 <GV v={total - basis} sign />
            </span>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          银行可用 <GV v={core.economy.balance('bank')} /> · 佣金 0.25%（最低 2 G）{weekend && ' · 周末休市'}
        </div>
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>资产</th>
            <th className="r">价格</th>
            <th className="r">日涨跌</th>
            <th>近 60 日</th>
            <th className="r">持有</th>
            <th className="r">市值 / 盈亏</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ASSETS.filter((a) => a.tradable).map((a) => {
            const st = core.state.market.assets[a.id];
            const price = core.market.price(a.id);
            const h = holdings[a.id];
            const u = units[a.id] ?? 1;
            const hist = st.history.slice(-60);
            const chg = st.lastChange / Math.max(1, price - st.lastChange);
            return (
              <tr key={a.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  <div className="dim" style={{ fontSize: 11 }}>
                    {a.kind} · 年化波动约 {Math.round(a.sigma * 100)}% · {a.desc}
                  </div>
                </td>
                <td className="r num">{formatG(price)}</td>
                <td className={`r num ${chg > 0 ? 'good' : chg < 0 ? 'bad' : ''}`}>{(chg * 100).toFixed(2)}%</td>
                <td>
                  <Sparkline data={hist} />
                </td>
                <td className="r num">{h?.units ?? 0}</td>
                <td className="r">
                  {h ? (
                    <>
                      <GV v={h.units * price} />
                      <div style={{ fontSize: 11 }}>
                        <GV v={h.units * price - h.costBasis} sign />
                      </div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <input type="number" min={1} value={u} onChange={(e) => setUnits({ ...units, [a.id]: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} style={{ width: 64, padding: '3px 6px' }} />
                    <button
                      className="small"
                      disabled={weekend}
                      onClick={() => {
                        const r = core.market.buy(a.id, u);
                        say(r.ok, r.ok ? r.message : r.error);
                      }}
                    >
                      买入
                    </button>
                    <button
                      className="small"
                      disabled={weekend || !h}
                      onClick={() => {
                        const r = core.market.sell(a.id, Math.min(u, h?.units ?? 0));
                        say(r.ok, r.ok ? r.message : r.error);
                      }}
                    >
                      卖出
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {fb}
      <div className="note">价格按随机过程逐日变化，有长期趋势也有剧烈波动，没有任何稳赚不赔的产品。历史表现不代表未来收益；持仓市值不是可以直接花的现金。</div>
    </div>
  );
}
