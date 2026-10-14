import { useEffect, useRef, useState } from 'react';
import { store, type Panel } from './store';
import { useCore } from './hooks';
import { Bar, GV, Keycap } from './components';
import { formatClock, formatDate, MINUTES_PER_DAY, SEASON_NAMES, toDate, WEEKDAY_NAMES } from '../core/calendar';
import { LOCATIONS, isOpen } from '../data/locations';
import { formatG, G, type Money } from '../core/money';
import type { AccountId } from '../core/state';
import { Icon } from './Icon';

function Clock(): JSX.Element {
  const core = useCore();
  const d = toDate(core.now());
  const loc = core.state.world.location;
  const inCasino = loc === 'casino';
  const hide = inCasino && !store.settings.showCasinoClock;
  const def = LOCATIONS[loc];
  let status = '';
  if (def?.hours && loc !== 'city') status = isOpen(def, d.weekday, d.minuteOfDay) ? '' : ' · 已过营业时间';
  return (
    <div className="hud-box interactive" title={hide ? '赌场里没有时钟。可以在设置里打开。' : undefined}>
      <div className="clock">
        <span className="time">{hide ? '--:--' : formatClock(d.minuteOfDay)}</span>
        <span className="date">
          {formatDate(d)} · {SEASON_NAMES[d.season]}
        </span>
      </div>
      <div className="loc">
        <Icon name="pin" /> {def?.name ?? loc}
        <span className="muted">{status}</span>
        {hide && <span className="dim" style={{ fontSize: 12 }}> · 这里看不到时钟</span>}
      </div>
    </div>
  );
}

function span(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} 小时${m ? ` ${m} 分` : ''}` : `${m} 分钟`;
}

/** Your job, always in view: when the next shift starts, or that you are late for it. */
function WorkLine(): JSX.Element | null {
  const core = useCore();
  const items = core.career.agenda();
  if (core.state.world.location === 'casino' && !store.settings.showCasinoClock) return null;
  if (items.length === 0) {
    if (core.career.activeJobs().length > 0) return null;
    // nobody has to tell the well-off to go job hunting
    if (core.economy.balance('bank') + core.economy.balance('cash') >= G(200000)) return null;
    return (
      <div className="hud-box interactive work-line" onClick={() => store.openModal({ type: 'jobs' })} title="查看招聘信息">
        <div className="what">目前没有工作</div>
        <div className="when">用电脑上的招聘网站找一份工作</div>
      </div>
    );
  }
  const it = items[0];
  const now = core.now();
  const d = toDate(it.start);
  const sameDay = Math.floor(now / MINUTES_PER_DAY) === Math.floor(it.start / MINUTES_PER_DAY);
  const tomorrow = Math.floor(it.start / MINUTES_PER_DAY) === Math.floor(now / MINUTES_PER_DAY) + 1;
  const day = sameDay ? '今天' : tomorrow ? '明天' : WEEKDAY_NAMES[d.weekday];
  const at = `${day} ${formatClock(d.minuteOfDay)}`;
  let when = '';
  let tone = '';
  switch (it.status) {
    case 'upcoming':
      when = `${at} 上班 · 还有 ${span(it.start - now)}`;
      if (it.start - now <= 90) tone = 'warn';
      break;
    case 'open':
      when = now < it.start ? `可以打卡了 · ${formatClock(d.minuteOfDay)} 开始` : '上班时间到了，去工位打卡';
      tone = 'warn';
      break;
    case 'late':
      when = `已迟到 ${span(now - it.start)}，快去打卡`;
      tone = 'bad';
      break;
    case 'leave':
      when = '今天请了假';
      break;
    case 'next':
      when = `下一班：${at}`;
      break;
  }
  const place = LOCATIONS[it.location]?.name ?? it.employer;
  return (
    <div className="hud-box interactive work-line" onClick={() => store.openMap(it.location)} title="点击在地图上查看上班地点">
      <div className="what">
        {it.title} · {place}
      </div>
      <div className={`when ${tone}`}>{when}</div>
    </div>
  );
}

interface Pop {
  id: number;
  delta: Money;
}

function MoneyLine(props: { label: string; account: AccountId; value: Money; cls?: string }): JSX.Element {
  const core = useCore();
  const [pops, setPops] = useState<Pop[]>([]);
  const seq = useRef(0);
  useEffect(
    () =>
      core.bus.on('money', ({ account, delta }) => {
        if (account !== props.account || delta === 0) return;
        const id = ++seq.current;
        setPops((p) => [...p.slice(-2), { id, delta }]);
        setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1600);
      }),
    [core, props.account],
  );
  return (
    <>
      <span className="k">{props.label}</span>
      <span className={`v ${props.cls ?? ''}`} style={{ position: 'relative' }}>
        {formatG(props.value)}
        {pops.map((p) => (
          <span key={p.id} className={`delta-pop ${p.delta > 0 ? 'good' : 'bad'}`} style={{ position: 'absolute', right: '105%', top: 0, whiteSpace: 'nowrap' }}>
            {formatG(p.delta, { sign: true })}
          </span>
        ))}
      </span>
    </>
  );
}

function Money(): JSX.Element {
  const core = useCore();
  const eco = core.economy;
  const chips = eco.balance('chips');
  const inCasino = core.state.world.location === 'casino';
  return (
    <div className="hud-box interactive" style={{ cursor: 'pointer' }} onClick={() => store.openPanel('finance')} title="查看资产 (F)">
      <div className="money">
        <MoneyLine label="现金" account="cash" value={eco.balance('cash')} />
        <MoneyLine label="存款" account="bank" value={eco.balance('bank')} />
        {(chips > 0 || inCasino) && <MoneyLine label="筹码" account="chips" value={chips} cls="chips" />}
        <span className="k" style={{ fontSize: 12 }}>净资产</span>
        <span className="v" style={{ fontSize: 12, fontWeight: 400 }}>
          <GV v={eco.netWorth()} />
        </span>
      </div>
    </div>
  );
}

const NEEDS: { key: 'energy' | 'hunger' | 'sleep' | 'stress' | 'mood' | 'social'; label: string; invert?: boolean; color: string }[] = [
  { key: 'energy', label: '体力', color: '#58d68d' },
  { key: 'hunger', label: '饥饿', invert: true, color: '#ffb347' },
  { key: 'sleep', label: '睡眠', color: '#8fb8ff' },
  { key: 'stress', label: '压力', invert: true, color: '#ff6b6b' },
  { key: 'mood', label: '情绪', color: '#ff4fa3' },
  { key: 'social', label: '社交', color: '#46f0ff' },
];

function Needs(): JSX.Element {
  const core = useCore();
  const s = core.state.player.stats;
  const tags = core.player.statusTags();
  return (
    <div className="hud-box interactive hud-bl" onClick={() => store.openPanel('stats')} style={{ cursor: 'pointer' }} title="个人状态 (T)">
      {NEEDS.map((n) => {
        const v = s[n.key];
        const bad = n.invert ? v > 70 : v < 25;
        return (
          <div className="need" key={n.key}>
            <span className="label" style={bad ? { color: 'var(--bad)' } : undefined}>
              {n.label}
            </span>
            <Bar value={v} color={bad ? '#ff6b6b' : n.color} />
            <span className="val">{Math.round(v)}</span>
          </div>
        );
      })}
      {tags.length > 0 && (
        <div className="status-tags">
          {tags.map((t) => (
            <span key={t.label} className={`tag ${t.tone}`}>
              {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const QUICK: { panel: Exclude<Panel, null>; label: string; key: string }[] = [
  { panel: 'phone', label: '手机', key: 'P' },
  { panel: 'finance', label: '资产', key: 'F' },
  { panel: 'social', label: '人际', key: 'R' },
  { panel: 'map', label: '地图', key: 'M' },
  { panel: 'journal', label: '日志', key: 'J' },
  { panel: 'inventory', label: '物品', key: 'I' },
  { panel: 'stats', label: '统计', key: 'T' },
  { panel: 'menu', label: '菜单', key: 'Esc' },
];

function QuickBar(): JSX.Element {
  const core = useCore();
  const unread = core.phone.unread();
  const overdue = core.economy.overdueBills().length;
  return (
    <div className="hud-br">
      {QUICK.map((q) => (
        <button key={q.panel} className="qbtn" onClick={() => store.openPanel(q.panel)}>
          {q.label}
          <span className="key">{q.key}</span>
          {q.panel === 'phone' && unread > 0 && <span className="badge">{unread}</span>}
          {q.panel === 'finance' && overdue > 0 && <span className="badge">!</span>}
        </button>
      ))}
    </div>
  );
}

function PromptLine(): JSX.Element | null {
  const p = store.prompt;
  if (!p || store.blocking()) return null;
  return (
    <div className="prompt">
      <Keycap k="E" />
      <span>{p.verb}</span>
      <span className="muted">· {p.label}</span>
    </div>
  );
}

export function Toasts(): JSX.Element {
  return (
    <div className="toasts">
      {store.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function Banner(): JSX.Element | null {
  const b = store.locationBanner;
  if (!b) return null;
  return (
    <div className="banner" key={b.t}>
      <div className="name">{b.name}</div>
      {b.sub && <div className="sub">{b.sub}</div>}
    </div>
  );
}

export function Hud(): JSX.Element {
  useCore();
  const atTable = !!store.table;
  return (
    <>
      {!atTable && (
        <div className="hud-tl">
          <Clock />
          <WorkLine />
        </div>
      )}
      {!atTable && (
        <div className="hud-tr">
          <Money />
        </div>
      )}
      {!atTable && <Needs />}
      {!atTable && <QuickBar />}
      {!atTable && <PromptLine />}
      <Banner />
    </>
  );
}
