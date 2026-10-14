import { useState } from 'react';
import { store } from '../store';
import { useCore } from '../hooks';
import { GV, Modal, Portrait, useFeedback } from '../components';
import { formatClock, formatDate, MINUTES_PER_DAY, toDate } from '../../core/calendar';
import { G, formatG } from '../../core/money';
import { ITEMS, OUTFITS } from '../../data/items';
import { MEAL_BASIC, MEAL_FRESH } from '../../systems/InventorySystem';
import type { CareerResult, ShiftReport } from '../../systems/CareerSystem';
import { runSteps } from '../../core/steps';
import type { EventPrompt } from '../../systems/EventManager';
import { BUS_STOPS, locationAnchor, travelMinutes } from '../../world/maps/cityLayout';
import { JOBS } from '../../data/jobs';
import { HOMES } from '../../data/housing';
import { busStopTile } from '../../world/WorldScene';
import { lookFor } from '../../world/looks';
import { LOCATIONS } from '../../data/locations';
import { SKILL_NAMES } from '../../systems/PlayerSystem';
import { Icon } from '../Icon';

// ------------------------------------------------------------------ sleep

function hoursUntil(nowMin: number, targetHour: number): number {
  const d = toDate(nowMin);
  let diff = targetHour * 60 - d.minuteOfDay;
  if (diff <= 30) diff += MINUTES_PER_DAY;
  return Math.round((diff / 60) * 4) / 4;
}

export function SleepModal(): JSX.Element {
  const core = useCore();
  const err = core.canSleep();
  const s = core.state.player.stats;
  const now = core.now();
  const shifts = core.career.upcomingShifts();
  const plans = core.events.upcoming().filter((e) => e.status === 'accepted');
  const options: { label: string; hours: number }[] = [
    { label: '小睡 1 小时', hours: 1 },
    { label: '睡 3 小时', hours: 3 },
    { label: `睡到早上 7:00（${hoursUntil(now, 7)} 小时）`, hours: hoursUntil(now, 7) },
    { label: `睡到早上 9:00（${hoursUntil(now, 9)} 小时）`, hours: hoursUntil(now, 9) },
    { label: '睡足 8 小时', hours: 8 },
  ];
  const sleep = (h: number) => {
    store.closeModal();
    // in the world: into bed, the night going by, and up again
    if (store.world) {
      void store.world.sleep(h);
      return;
    }
    const before = core.now();
    core.sleep(h);
    const after = toDate(core.now());
    store.toast(`睡了 ${((core.now() - before) / 60).toFixed(1)} 小时，现在是 ${formatClock(after.minuteOfDay)}。`, 'good');
  };
  return (
    <Modal title="休息" sub={`现在 ${formatClock(toDate(now).minuteOfDay)} · 睡眠 ${Math.round(s.sleep)} · 体力 ${Math.round(s.energy)}`}>
      {err ? (
        <div className="note">{err}</div>
      ) : (
        <div className="stack">
          <div className="muted" style={{ fontSize: 12 }}>
            床越舒适，恢复越快（{core.sleepPlace()}舒适度 {Math.round(core.sleepComfort() * 100)}%）。睡眠时时间快进，账单、消息与 NPC 的生活照常进行。
          </div>
          {shifts.length > 0 && (
            <div className="note">
              <Icon name="clock" /> 下一个班：{shifts[0].def.employer} {formatClock(shifts[0].start % MINUTES_PER_DAY)}（{toDate(shifts[0].start).day}日）
            </div>
          )}
          {plans.slice(0, 2).map((p) => (
            <div className="note" key={p.id}>
              <Icon name="calendar" /> 已答应的约：{LOCATIONS[p.location ?? '']?.name ?? p.location} {toDate(p.at).day}日 {formatClock(toDate(p.at).minuteOfDay)}
            </div>
          ))}
          <div className="list">
            {options.map((o) => (
              <button key={o.label} onClick={() => sleep(o.hours)} style={{ textAlign: 'left' }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ kitchen

export function KitchenModal(): JSX.Element {
  const core = useCore();
  const inv = core.inventory;
  const [fb, say] = useFeedback();
  const foods = Object.entries(core.state.inventory.items)
    .filter(([id, n]) => n > 0 && id !== MEAL_BASIC && id !== MEAL_FRESH && ITEMS[id] && (ITEMS[id].kind === 'food' || ITEMS[id].kind === 'drink' || ITEMS[id].kind === 'misc') && ITEMS[id].effects)
    .map(([id, n]) => ({ def: ITEMS[id], n }));
  const use = (id: string) => {
    const r = inv.use(id);
    say(r.ok, r.ok ? r.message : r.error);
  };
  const s = core.state.player.stats;
  return (
    <Modal title="厨房与冰箱" sub={`饥饿 ${Math.round(s.hunger)} · 体力 ${Math.round(s.energy)}`}>
      <div className="stack">
        <div className="grid2">
          <div className="card">
            <h3>家常饭（简单食材）</h3>
            <div className="muted" style={{ fontSize: 12 }}>剩余 {inv.count(MEAL_BASIC)} 份 · 做饭约 30 分钟</div>
            <button style={{ marginTop: 6 }} disabled={inv.count(MEAL_BASIC) <= 0} onClick={() => use(MEAL_BASIC)}>
              做一顿
            </button>
          </div>
          <div className="card">
            <h3>健康餐（新鲜食材）</h3>
            <div className="muted" style={{ fontSize: 12 }}>剩余 {inv.count(MEAL_FRESH)} 份 · 恢复更多体力与情绪</div>
            <button style={{ marginTop: 6 }} disabled={inv.count(MEAL_FRESH) <= 0} onClick={() => use(MEAL_FRESH)}>
              做一顿
            </button>
          </div>
        </div>
        {foods.length > 0 && (
          <div className="list">
            {foods.map(({ def, n }) => (
              <div className="item" key={def.id}>
                <div className="grow">
                  <div className="title">
                    {def.name} <span className="dim">×{n}</span>
                  </div>
                  <div className="desc">{def.desc}</div>
                </div>
                <button className="small" onClick={() => use(def.id)}>
                  吃 / 喝
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="note">食材在集市街的 QuickMart 便利店买。</div>
        {fb}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ wardrobe

export function WardrobeModal(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const app = core.state.player.appearance;
  const cur = core.state.player.outfit;
  return (
    <Modal title="衣柜" sub="体面度影响路人的眼光，也决定有些地方进不进得去" wide>
      <div className="grid3">
        {core.state.inventory.outfits.map((id) => {
          const o = OUTFITS[id];
          if (!o) return null;
          return (
            <div className="card" key={id} style={id === cur ? { borderColor: 'var(--gold)' } : undefined}>
              <div className="row">
                <Portrait look={lookFor(app, id)} scale={3} />
                <div>
                  <h3>{o.name}</h3>
                  <div className="muted" style={{ fontSize: 12 }}>
                    体面度 {'★'.repeat(Math.max(0, Math.round(o.prestige ?? 0)))}
                    {'☆'.repeat(Math.max(0, 5 - Math.round(o.prestige ?? 0)))}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{o.desc}</div>
                </div>
              </div>
              <button
                className="small"
                style={{ marginTop: 6 }}
                disabled={id === cur}
                onClick={() => {
                  const r = core.inventory.wear(id);
                  say(r.ok, r.ok ? r.message : r.error);
                }}
              >
                {id === cur ? '正在穿' : '换上'}
              </button>
            </div>
          );
        })}
      </div>
      {fb}
    </Modal>
  );
}

// ------------------------------------------------------------------ reading

export function ReadModal(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const books = Object.entries(core.state.inventory.items)
    .filter(([id, n]) => n > 0 && ITEMS[id]?.kind === 'book')
    .map(([id, n]) => ({ def: ITEMS[id], n }));
  return (
    <Modal title="书架" sub="读完一本要好几个小时">
      {books.length === 0 ? (
        <div className="note">书架上都是读过的旧书。QuickMart 便利店有新书出售。</div>
      ) : (
        <div className="list">
          {books.map(({ def, n }) => (
            <div className="item" key={def.id}>
              <div className="grow">
                <div className="title">
                  {def.name} <span className="dim">×{n}</span>
                </div>
                <div className="desc">
                  {def.desc}
                  {def.skill && ` · ${SKILL_NAMES[def.skill.id]} +${def.skill.amount}（上限 ${def.skill.cap}）`} · 约 {Math.round((def.useMinutes ?? 120) / 60)} 小时
                </div>
              </div>
              <button
                className="small"
                onClick={() => {
                  const r = core.inventory.use(def.id);
                  say(r.ok, r.ok ? r.message : r.error);
                }}
              >
                阅读
              </button>
            </div>
          ))}
        </div>
      )}
      {fb}
    </Modal>
  );
}

// ------------------------------------------------------------------ work

export function WorkModal(props: { jobId: string }): JSX.Element {
  const core = useCore();
  const career = core.career;
  const def = career.def(props.jobId);
  const job = career.job(props.jobId);
  const [fb, say] = useFeedback();
  const [gigHours, setGigHours] = useState(3);
  if (!def) return <TextModal title="工作" text="这里没有可做的工作。" />;
  if (!job) {
    const req = career.requirementsMet(props.jobId);
    return (
      <Modal title={`${def.employer} · ${def.title}`} sub="你还没有在这里工作">
        <div className="stack">
          <div>{def.desc}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {def.payType === 'salary' ? `月薪 ${formatG(def.rate)}` : `时薪 ${formatG(def.rate)}`}
            {def.tipsPerHour ? ` + 小费` : ''} · 班次 {formatClock(def.start)}–{formatClock(def.end)}
          </div>
          {req ? <div className="note">申请条件未满足：{req}</div> : <div className="note">满足申请条件。递交申请后，第二天早上会收到答复。</div>}
          {fb}
        </div>
        <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          <button
            className="primary"
            disabled={!!req}
            onClick={() => {
              const r = career.apply(props.jobId);
              say(r.ok, r.ok ? r.message : r.error);
            }}
          >
            递交申请
          </button>
        </div>
      </Modal>
    );
  }
  const shift = career.currentShift(props.jobId);
  const err = def.flexible ? null : career.canWork(props.jobId);
  const est = career.estimateShiftPay(props.jobId);
  const s = core.state.player.stats;
  const start = () => {
    const done = (r: CareerResult) => {
      if (!r.ok) return;
      if (r.report) store.openModal({ type: 'shift', report: r.report, title: `${def.employer} · 下班` });
      else store.toast(r.message, 'good');
    };
    // the shift in steps: the first one here (it may refuse), the rest on the clock in the world
    const steps = def.flexible ? career.gigSteps(props.jobId, gigHours, 12) : career.shiftSteps(props.jobId, undefined, 12);
    const first = steps.next();
    if (first.done && !first.value.ok) {
      say(false, first.value.error);
      return;
    }
    store.closeModal();
    if (first.done) done(first.value);
    else if (store.world) void store.world.timelapse(steps, done);
    else done(runSteps(steps));
  };
  return (
    <Modal title={`${career.title(job)} · ${def.employer}`} sub={`表现 ${job.performance}/100 · 已上 ${job.shifts} 个班`}>
      <div className="stack">
        {shift && (
          <div className="muted" style={{ fontSize: 12 }}>
            今日班次 {formatClock(shift.start % MINUTES_PER_DAY)}–{formatClock(shift.end % MINUTES_PER_DAY)} ·{' '}
            {{ upcoming: '还没开始', open: '可以打卡', late: '已迟到', done: '已完成', missed: '已缺勤' }[shift.status]}
          </div>
        )}
        <div className="grid2">
          <div className="card">
            <h3>预计收入</h3>
            <div>
              <GV v={est} /> {def.payType === 'salary' ? '（计入工资，发薪日到账）' : '（计入工资）'}
            </div>
            {def.tipsPerHour && <div className="muted" style={{ fontSize: 12 }}>另有小费，取决于状态与社交能力</div>}
          </div>
          <div className="card">
            <h3>你的状态</h3>
            <div className="muted" style={{ fontSize: 12 }}>
              工作效率 {Math.round(core.player.workEfficiency(def.skill) * 100)}% · 睡眠 {Math.round(s.sleep)} · 压力 {Math.round(s.stress)}
            </div>
          </div>
        </div>
        {def.flexible && (
          <div className="row">
            <span className="muted">工作时长</span>
            {[2, 3, 4, 6].map((h) => (
              <button key={h} className={`small ${gigHours === h ? 'primary' : ''}`} onClick={() => setGigHours(h)}>
                {h} 小时
              </button>
            ))}
          </div>
        )}
        {err && <div className="note">{err}</div>}
        {fb}
      </div>
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={() => store.closeModal()}>
          离开
        </button>
        <button className="primary" disabled={!!err} onClick={start}>
          {def.flexible ? `接单 ${gigHours} 小时` : '开始上班'}
        </button>
      </div>
    </Modal>
  );
}

export function ShiftModal(props: { report: ShiftReport; title: string }): JSX.Element {
  const r = props.report;
  return (
    <Modal title={props.title} sub={r.jobTitle} foot={<button className="primary" onClick={() => store.closeModal()}>好的</button>}>
      <div className="grid3">
        <div className="card">
          <h3>工作时长</h3>
          {r.hours.toFixed(1)} 小时
        </div>
        <div className="card">
          <h3>工资（发薪日结算）</h3>
          <GV v={r.wage} />
        </div>
        <div className="card">
          <h3>小费（现金）</h3>
          <GV v={r.tips} />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        表现评分：<b className={r.performance >= 70 ? 'good' : r.performance < 45 ? 'bad' : ''}>{r.performance}</b>/100
        {r.late > 0 && <span className="bad">（迟到 {r.late} 分钟）</span>}
      </div>
      {r.notes.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--muted)' }}>
          {r.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {r.promotionOffer && <div className="note" style={{ marginTop: 8 }}>{r.promotionOffer}</div>}
    </Modal>
  );
}

// ------------------------------------------------------------------ bus

const FARE = G(3);

export function BusModal(props: { stop: string }): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const here = BUS_STOPS.find((s) => s.id === props.stop);
  const d = toDate(core.now());
  const running = d.hour >= 6;
  const wait = 12 - (d.minuteOfDay % 12);
  const go = (id: string) => {
    const to = BUS_STOPS.find((s) => s.id === id)!;
    const tile = busStopTile(id);
    if (!here || !tile) return;
    if (core.economy.balance('cash') + core.economy.balance('bank') < FARE) {
      say(false, '车费不够');
      return;
    }
    const ride = Math.ceil((Math.abs(to.x - here.x) + Math.abs(to.y - here.y)) / 6) + 2;
    const run = (): { ok: true; message: string } | { ok: false; error: string } => {
      const r = core.economy.pay(FARE, 'transport', `公交车：${here.name} → ${to.name}`, 'bus', ['cash', 'bank']);
      if (!r.ok) return { ok: false, error: r.error };
      core.advance(wait + ride, 'idle');
      return { ok: true, message: `乘车 ${wait + ride} 分钟到达${to.name}` };
    };
    store.closeModal();
    // the bus pulls in at the stop, you get on, and off at the other end
    if (store.world) {
      void store.world.ride('bus', run, tile);
      return;
    }
    const r = run();
    store.toast(r.ok ? r.message : r.error, r.ok ? 'info' : 'warn');
  };
  return (
    <Modal title={`公交站 · ${here?.name ?? ''}`} sub={running ? `运营时间 06:00–24:00 · 下一班约 ${wait} 分钟后 · 票价 ${formatG(FARE)}` : '末班车已过，早上 6 点恢复运营'}>
      <div className="list">
        {BUS_STOPS.filter((s) => s.id !== props.stop).map((s) => {
          const ride = here ? Math.ceil((Math.abs(s.x - here.x) + Math.abs(s.y - here.y)) / 6) + 2 : 0;
          return (
            <div className="item" key={s.id}>
              <div className="grow">
                <div className="title">{s.name}</div>
                <div className="desc">约 {wait + ride} 分钟（等车 {wait} + 乘车 {ride}）</div>
              </div>
              <button className="small" disabled={!running} onClick={() => go(s.id)}>
                上车
              </button>
            </div>
          );
        })}
      </div>
      {!running && <div className="note" style={{ marginTop: 8 }}>深夜可以用手机地图叫出租车（更贵）。</div>}
      {fb}
    </Modal>
  );
}

// ------------------------------------------------------------------ first morning

/**
 * The first thing a new life sees: who you are on Monday morning — the job
 * you already have, when and where it starts, and what is at stake.
 */
export function IntroModal(): JSX.Element {
  const core = useCore();
  const p = core.state.player;
  const d = toDate(core.now());
  const shift = core.career.agenda()[0] ?? null;
  const job = shift ? JOBS[shift.jobId] : null;
  const homeLoc = HOMES[core.state.housing.homeId].location;
  const walk = shift ? travelMinutes(locationAnchor(homeLoc, null), locationAnchor(shift.location, null)) : 0;
  const place = shift ? (LOCATIONS[shift.location]?.name ?? shift.employer) : '';
  return (
    <Modal
      title={`${formatDate(d)} · 清晨 ${formatClock(d.minuteOfDay)}`}
      sub={`${p.name}，闹钟响了`}
      onClose={() => store.closeModal()}
      foot={
        <div className="row" style={{ gap: 8 }}>
          {shift && (
            <button
              onClick={() => {
                store.closeModal();
                store.openMap(shift.location);
              }}
            >
              在地图上看看公司
            </button>
          )}
          <button className="primary" onClick={() => store.closeModal()}>
            起床
          </button>
        </div>
      }
    >
      <div className="stack" style={{ gap: 10, lineHeight: 1.65 }}>
        {shift && job ? (
          <>
            <div>
              你在<b>{job.employer}</b> 做<b>{shift.title}</b>。{job.desc}
            </div>
            <div className="note">
              今天是工作日：<b>{formatClock(job.start)}</b> 前要到<b>{place}</b>，去工位打卡（可以提前一小时）。从家走过去大约 {walk} 分钟。
              {core.phone.unread() > 0 && ' 手机里有主管发来的消息。'}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              左上角会一直显示下一班的时间，点击它就能在地图上找到公司。迟到超过 10 分钟会被记下来；无故缺勤一天，{job.bossName}会发来警告，累计几次就会被辞退。工资每 {job.payEveryDays} 天打进银行账户。
            </div>
          </>
        ) : core.state.player.flags.start === 'heir' ? (
          <div>
            你不用上班。账上有 {formatG(core.economy.balance('bank'))}，住在自己的{HOMES[core.state.housing.homeId].name}，楼下停着一辆跑车。顶层公寓的物业费和跑车的保养，每个月照样要交。
          </div>
        ) : core.state.player.flags.start === 'founder' ? (
          <div>
            公司刚卖掉，你暂时没有工作。账上有 {formatG(core.economy.balance('bank'))}，{HOMES[core.state.housing.homeId].name}的房子是自己的，投资顾问索菲亚替你管着一笔指数基金。
          </div>
        ) : (
          <div>你眼下没有工作。家里的电脑上能看招聘信息。</div>
        )}
        {core.state.player.flags.start === 'lottery' && <div>上周的彩票中了头奖，税后 800,000 G 已经存进银行。消息传得比你想的快。</div>}
        <div className="muted" style={{ fontSize: 12 }}>
          钱包里有 {formatG(core.economy.balance('cash'))} 现金，银行里有 {formatG(core.economy.balance('bank'))}。{core.state.housing.tenure === 'rent' ? '房租和水电' : '物业费和水电'}每月自动扣款。灰港大赌场在城北的赌场广场，二十四小时营业。
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ generic

export function TextModal(props: { title: string; text: string; tone?: 'info' | 'warn' | 'bad' }): JSX.Element {
  return (
    <Modal title={props.title} foot={<button className="primary" onClick={() => store.closeModal()}>好的</button>}>
      <div style={{ whiteSpace: 'pre-wrap', color: props.tone === 'bad' ? 'var(--bad)' : undefined }}>{props.text}</div>
    </Modal>
  );
}

export function EventModal(props: { prompt: EventPrompt }): JSX.Element {
  const core = useCore();
  const p = props.prompt;
  return (
    <Modal title={p.title} onClose={() => undefined}>
      <div style={{ whiteSpace: 'pre-wrap' }}>{p.text}</div>
      <div className="list" style={{ marginTop: 12 }}>
        {p.choices.map((c) => (
          <button
            key={c.id}
            style={{ textAlign: 'left' }}
            onClick={() => {
              const text = core.events.resolvePrompt(c.id);
              store.replaceModal({ type: 'eventResult', title: p.title, text: text || '……' });
            }}
          >
            {c.label}
            {c.hint && <span className="dim"> · {c.hint}</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function EventResultModal(props: { title: string; text: string }): JSX.Element {
  return (
    <Modal title={props.title} foot={<button className="primary" onClick={() => store.closeModal()}>继续</button>}>
      <div style={{ whiteSpace: 'pre-wrap' }}>{props.text}</div>
    </Modal>
  );
}

export function CollapseModal(props: { text: string }): JSX.Element {
  return (
    <Modal title="你撑不住了" onClose={() => store.closeModal()} foot={<button className="primary" onClick={() => store.closeModal()}>醒来</button>}>
      <div style={{ whiteSpace: 'pre-wrap' }}>{props.text}</div>
      <div className="note" style={{ marginTop: 10 }}>按时吃饭、睡觉，别在疲惫和醉酒时做重要决定。</div>
    </Modal>
  );
}
