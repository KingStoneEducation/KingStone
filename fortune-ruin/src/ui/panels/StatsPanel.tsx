import { useState } from 'react';
import { store } from '../store';
import { useCore } from '../hooks';
import { Bar, GV, Modal, Tabs } from '../components';
import { SKILL_NAMES, STAT_NAMES } from '../../systems/PlayerSystem';
import { GAME_NAMES } from '../../casino/tables';
import { formatDate, toDate } from '../../core/calendar';
import { LineChart } from './charts';
import type { GameKind, PlayerStats, SkillId } from '../../core/state';

type Tab = 'self' | 'casino' | 'life';

export function StatsPanel(): JSX.Element {
  const [tab, setTab] = useState<Tab>('self');
  return (
    <Modal title="个人与统计" wide="x" onClose={() => store.closePanel()}>
      <Tabs<Tab>
        tabs={[
          { id: 'self', label: '状态与技能' },
          { id: 'casino', label: '赌场战绩' },
          { id: 'life', label: '人生轨迹' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ paddingTop: 12 }}>
        {tab === 'self' && <Self />}
        {tab === 'casino' && <Casino />}
        {tab === 'life' && <Life />}
      </div>
    </Modal>
  );
}

function Self(): JSX.Element {
  const core = useCore();
  const p = core.state.player;
  const stats: (keyof PlayerStats)[] = ['energy', 'hunger', 'sleep', 'stress', 'mood', 'confidence', 'impulsivity', 'social', 'health', 'drunk'];
  return (
    <div className="grid2">
      <div className="card">
        <h3>身心状态</h3>
        {stats.map((k) => (
          <div className="need" key={k} style={{ gridTemplateColumns: '40px 1fr 30px' }}>
            <span className="label">{STAT_NAMES[k]}</span>
            <Bar value={p.stats[k]} color={k === 'stress' || k === 'hunger' || k === 'impulsivity' || k === 'drunk' ? '#ff8a6b' : '#58d68d'} />
            <span className="val">{Math.round(p.stats[k])}</span>
          </div>
        ))}
        <div className="note" style={{ marginTop: 8 }}>
          状态会影响走路快慢、工作效率和对话；冲动值高的时候，你在牌桌上更容易加注。
        </div>
        {p.moodBuffs.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {p.moodBuffs.map((b) => (
              <span key={b.id} className={`tag ${b.amount > 0 ? 'good' : 'bad'}`}>
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="stack">
        <div className="card">
          <h3>技能</h3>
          {(Object.keys(SKILL_NAMES) as SkillId[]).map((k) => (
            <div className="need" key={k} style={{ gridTemplateColumns: '64px 1fr 30px' }}>
              <span className="label">{SKILL_NAMES[k]}</span>
              <Bar value={p.skills[k]} color="#8fb8ff" />
              <span className="val">{Math.round(p.skills[k])}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>声望与信用</h3>
          <div style={{ fontSize: 12 }} className="stack">
            <div>社会声望 {Math.round(p.reputation.social)} · 赌场声望 {Math.round(p.reputation.casino)} · 可信度 {Math.round(p.reputation.trust)}</div>
            <div>信用分 {p.creditScore}</div>
            <div>财富阶层：{core.wealth.wealthClass().name}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Casino(): JSX.Element {
  const core = useCore();
  const st = core.state.casino.stats;
  const games = Object.entries(st.byGame).filter(([, g]) => g.rounds > 0) as [GameKind, { rounds: number; wagered: number; net: number }][];
  const sessions = st.sessions.slice(-40);
  let cum = 0;
  return (
    <div className="stack">
      <table className="data">
        <thead>
          <tr>
            <th>游戏</th>
            <th className="r">局数</th>
            <th className="r">总投注</th>
            <th className="r">净盈亏</th>
            <th className="r">实际回报率</th>
          </tr>
        </thead>
        <tbody>
          {games.length === 0 && (
            <tr>
              <td className="muted" colSpan={5}>
                还没有玩过。
              </td>
            </tr>
          )}
          {games.map(([g, v]) => (
            <tr key={g}>
              <td>{GAME_NAMES[g]}</td>
              <td className="r num">{v.rounds}</td>
              <td className="r">
                <GV v={v.wagered} />
              </td>
              <td className="r">
                <GV v={v.net} sign />
              </td>
              <td className="r num">{v.wagered > 0 ? `${(((v.wagered + v.net) / v.wagered) * 100).toFixed(1)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="card">
        <h3>每次去赌场的累计结果</h3>
        <LineChart zero series={[{ name: '累计盈亏', color: '#ff4fa3', data: sessions.map((s) => (cum += s.net)) }]} height={140} />
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        单局最大赢 <GV v={st.biggestWin} /> · 单局最大输 <GV v={st.biggestLoss} sign /> · 当前连胜 {st.winStreak} / 连败 {st.lossStreak}
      </div>
      <div className="note">短期内什么都可能发生；玩得越久，回报率越接近理论值：21 点（基本策略）约 99.5%，百家乐押庄约 98.9%，欧式轮盘 97.3%。</div>
    </div>
  );
}

function Life(): JSX.Element {
  const core = useCore();
  const s = core.state.stats;
  const days = s.days.slice(-120);
  const events = s.lifeEvents.slice(-40).reverse();
  return (
    <div className="stack">
      <div className="card">
        <h3>净资产曲线 · 情绪 · 压力</h3>
        <LineChart series={[{ name: '净资产', color: '#e0b13e', data: days.map((d) => d.netWorth) }]} height={140} />
        <LineChart series={[
          { name: '情绪', color: '#ff4fa3', data: days.map((d) => d.mood * 100) },
          { name: '压力', color: '#ff6b6b', data: days.map((d) => d.stress * 100) },
        ]} height={100} />
      </div>
      <div className="card">
        <h3>人生大事</h3>
        {events.length === 0 && <div className="muted">平静的日子。</div>}
        {events.map((e, i) => (
          <div key={i} className="row" style={{ alignItems: 'baseline', padding: '2px 0' }}>
            <span className="dim" style={{ fontSize: 12, minWidth: 120 }}>
              {formatDate(toDate(e.t), true)}
            </span>
            <span>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
