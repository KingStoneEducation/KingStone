import { useState } from 'react';
import { store } from '../store';
import { useCore } from '../hooks';
import { Portrait, Tabs, useFeedback } from '../components';
import { formatAgo, formatClock, formatDate, MINUTES_PER_DAY, toDate } from '../../core/calendar';
import { NPC_BY_ID, NPCS } from '../../data/npcs';
import { LOCATIONS } from '../../data/locations';
import { formatG } from '../../core/money';

type Tab = 'messages' | 'calendar' | 'contacts';

export function PhonePanel(): JSX.Element {
  const core = useCore();
  const [tab, setTab] = useState<Tab>('messages');
  const [thread, setThread] = useState<string | null>(null);
  const d = toDate(core.now());
  const inCasino = core.state.world.location === 'casino';
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && store.closePanel()}>
      <div className="modal phone" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>{formatClock(d.minuteOfDay)}</h2>
            <div className="sub">
              {formatDate(d)}
              {inCasino && ' · 赌场里只有手机能看时间'}
            </div>
          </div>
          <button className="ghost small" onClick={() => store.closePanel()}>
            ×
          </button>
        </div>
        <Tabs<Tab>
          tabs={[
            { id: 'messages', label: `消息${core.phone.unread() ? ` (${core.phone.unread()})` : ''}` },
            { id: 'calendar', label: '日程' },
            { id: 'contacts', label: '联系人' },
          ]}
          value={tab}
          onChange={(t) => {
            setTab(t);
            setThread(null);
          }}
        />
        <div className="modal-body" style={{ flex: 1 }}>
          {tab === 'messages' && (thread ? <Thread from={thread} onBack={() => setThread(null)} /> : <Threads onOpen={setThread} />)}
          {tab === 'calendar' && <Calendar />}
          {tab === 'contacts' && <Contacts />}
        </div>
      </div>
    </div>
  );
}

function Threads(props: { onOpen: (from: string) => void }): JSX.Element {
  const core = useCore();
  const threads = core.phone.threads();
  if (threads.length === 0) return <div className="muted">没有消息。</div>;
  return (
    <div>
      {threads.map((t) => (
        <div key={t.from} className={`msg ${t.unread ? 'unread' : ''}`} style={{ cursor: 'pointer' }} onClick={() => props.onOpen(t.from)}>
          <div className="row between">
            <span className="from">
              {t.fromName} {t.unread > 0 && <span className="tag bad">{t.unread}</span>}
            </span>
            <span className="when">{formatAgo(core.now(), t.last.t)}</span>
          </div>
          <div className="body muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t.last.body}
          </div>
        </div>
      ))}
    </div>
  );
}

function Thread(props: { from: string; onBack: () => void }): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const msgs = core.state.phone.messages.filter((m) => m.from === props.from);
  for (const m of msgs) if (!m.read && !m.actions?.length) core.phone.markRead(m.id);
  const npc = NPC_BY_ID[props.from];
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="small ghost" onClick={props.onBack}>
          ← 返回
        </button>
        {npc && <Portrait look={npc.look} scale={2} crop="bust" />}
        <b>{msgs[msgs.length - 1]?.fromName}</b>
      </div>
      {msgs.slice(-30).map((m) => (
        <div key={m.id} className="msg">
          <div className="when">{toDate(m.t).month + 1}月{toDate(m.t).day}日 {formatClock(toDate(m.t).minuteOfDay)}</div>
          <div className="body" style={{ whiteSpace: 'pre-wrap' }}>
            {m.body}
          </div>
          {m.actions && m.actions.length > 0 && !m.resolved && (
            <div className="row wrap" style={{ marginTop: 6 }}>
              {m.actions.map((a) => (
                <button
                  key={a.id}
                  className="small"
                  onClick={() => {
                    const text = core.phone.respond(m.id, a.id);
                    say(true, text);
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
          {m.resolved && m.actions && (
            <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
              已回复：{m.actions.find((a) => a.id === m.resolved)?.label ?? m.resolved}
            </div>
          )}
        </div>
      ))}
      {fb}
    </div>
  );
}

function Calendar(): JSX.Element {
  const core = useCore();
  const shifts = core.career.upcomingShifts();
  const events = core.events.upcoming();
  const bills = core.economy.unpaidBills().sort((a, b) => a.dueDay - b.dueDay);
  const today = core.today();
  return (
    <div className="stack">
      <div>
        <h4 style={{ margin: '0 0 4px', color: 'var(--gold-light)' }}>工作</h4>
        {shifts.length === 0 ? (
          <div className="muted">近期没有排班。</div>
        ) : (
          shifts.map((s) => (
            <div key={s.job.jobId} className="msg">
              {s.def.employer} · {toDate(s.start).day}日 {formatClock(s.start % MINUTES_PER_DAY)}–{formatClock(s.end % MINUTES_PER_DAY)}
              <span className="dim"> · {LOCATIONS[s.def.location]?.name}</span>
            </div>
          ))
        )}
      </div>
      <div>
        <h4 style={{ margin: '0 0 4px', color: 'var(--gold-light)' }}>约会与邀请</h4>
        {events.length === 0 ? (
          <div className="muted">没有安排。</div>
        ) : (
          events.map((e) => (
            <div key={e.id} className="msg">
              {e.npc ? NPC_BY_ID[e.npc]?.name : ''} · {toDate(e.at).day}日 {formatClock(toDate(e.at).minuteOfDay)} · {LOCATIONS[e.location ?? '']?.name ?? '城里'}
              <span className={`tag ${e.status === 'accepted' ? 'good' : 'warn'}`} style={{ marginLeft: 6 }}>
                {e.status === 'accepted' ? '已答应' : '待回复'}
              </span>
            </div>
          ))
        )}
      </div>
      <div>
        <h4 style={{ margin: '0 0 4px', color: 'var(--gold-light)' }}>账单</h4>
        {bills.length === 0 ? (
          <div className="muted">没有待付账单。</div>
        ) : (
          bills.map((b) => (
            <div key={b.id} className="msg">
              {b.memo} · {formatG(core.economy.billTotal(b))}{' '}
              <span className={today > b.dueDay ? 'bad' : 'dim'}>{today > b.dueDay ? `逾期 ${today - b.dueDay} 天` : `${b.dueDay - today} 天后到期`}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Contacts(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const known = NPCS.filter((n) => core.state.social.rel[n.id]?.knowsName);
  if (known.length === 0) return <div className="muted">还没有存下任何人的号码。</div>;
  return (
    <div>
      {known.map((n) => {
        const r = core.social.rel(n.id);
        const can = core.social.canText(n.id);
        return (
          <div key={n.id} className="item" style={{ marginBottom: 6 }}>
            <Portrait look={n.look} scale={2} crop="bust" />
            <div className="grow">
              <div className="title">{n.name}</div>
              <div className="desc">
                {n.occupation} · {core.social.statusName(r.status)} · 上次联系 {r.lastContact > 0 ? formatAgo(core.now(), r.lastContact) : '从未'}
              </div>
            </div>
            <button
              className="small"
              disabled={!!can}
              title={can ?? ''}
              onClick={() => {
                const text = core.social.textGreeting(n.id);
                say(true, text);
              }}
            >
              发消息问候
            </button>
          </div>
        );
      })}
      {fb}
    </div>
  );
}
