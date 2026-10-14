import { useState } from 'react';
import { store } from '../store';
import { useCore } from '../hooks';
import { GV, Modal, Tabs } from '../components';
import { Bust, BACKDROPS } from '../Bust';
import { NPCS, NPC_BY_ID } from '../../data/npcs';
import { faceFor } from '../../data/faces';
import { moodFrom } from '../../systems/DialogueEngine';
import { DIM_NAMES, TIE_BAND_NAMES, describeMemory, momentText, type TieBand, type WebEdge } from '../../systems/SocialSystem';
import { formatAgo } from '../../core/calendar';
import { LOCATIONS } from '../../data/locations';
import { HOMES } from '../../data/housing';
import { JOBS } from '../../data/jobs';
import type { RelDims } from '../../core/state';

const DIMS: (keyof RelDims)[] = ['affection', 'trust', 'respect', 'familiarity', 'attraction', 'dependency', 'envy', 'fear'];
const BIPOLAR = new Set<keyof RelDims>(['affection', 'trust', 'respect']);
const SOURCE_NAMES = { witnessed: '亲眼所见', told: '你亲口说的', rumor: '听来的传闻', self: '亲身经历', inferred: '推测' } as const;
/** what an NPC's estimate of your wealth is based on */
const BASIS_NAMES: Record<string, string> = {
  acquaintance: '平时的来往',
  appearance: '你的穿着',
  bank_records: '银行记录',
  big_win: '你赢钱的事',
  big_loss: '你输钱的事',
  flashy_purchase: '你买的东西',
  moved: '你的住处',
  evicted: '你被赶出公寓',
  fired: '你丢了工作',
  promotion: '你升职了',
  vip_upgrade: '你的会员等级',
  admit_trouble: '你说手头紧',
  claim: '你自己说的',
  loan_default: '你欠债不还',
  debt_unpaid: '你欠债不还',
};

/** An estimate is a guess: show it to three significant figures. */
function rough(v: number): number {
  const g = Math.abs(v) / 100;
  if (g < 100) return Math.round(v / 100) * 100;
  const step = 10 ** (Math.floor(Math.log10(g)) - 2);
  return Math.round(g / step) * step * 100 * Math.sign(v);
}

function DimBar(props: { k: keyof RelDims; v: number }): JSX.Element {
  const bip = BIPOLAR.has(props.k);
  const v = props.v;
  const color = props.k === 'envy' || props.k === 'fear' ? '#ff6b6b' : v < 0 ? '#ff6b6b' : '#e0b13e';
  return (
    <div className="need" style={{ gridTemplateColumns: '34px 1fr 30px' }}>
      <span className="label">{DIM_NAMES[props.k]}</span>
      {bip ? (
        <div className="bar" style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: v >= 0 ? '50%' : `${50 + v / 2}%`,
              width: `${Math.abs(v) / 2}%`,
              background: color,
            }}
          />
          <span style={{ position: 'absolute', left: '50%', width: 1, background: 'rgba(255,255,255,0.4)' }} />
        </div>
      ) : (
        <div className="bar">
          <span style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} />
        </div>
      )}
      <span className="val">{Math.round(v)}</span>
    </div>
  );
}

export function SocialPanel(): JSX.Element {
  const core = useCore();
  const met = NPCS.filter((n) => core.state.social.rel[n.id]?.met);
  const [sel, setSel] = useState<string | null>(met[0]?.id ?? null);
  const [tab, setTab] = useState<'people' | 'web'>('people');
  const def = sel ? NPC_BY_ID[sel] : null;
  return (
    <Modal title="人际关系" wide="x" onClose={() => store.closePanel()}>
      {met.length > 0 && (
        <Tabs<'people' | 'web'>
          tabs={[
            { id: 'people', label: '认识的人' },
            { id: 'web', label: '他们之间' },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}
      {met.length === 0 ? (
        <div className="note">你还没有认识任何人。出门走走，和人聊聊吧。</div>
      ) : tab === 'web' ? (
        <SocialWeb
          onOpen={(id) => {
            setSel(id);
            setTab('people');
          }}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div className="list" style={{ maxHeight: 'calc(var(--vh, 100vh) * 0.64)', overflow: 'auto' }}>
            {met.map((n) => {
              const r = core.social.rel(n.id);
              return (
                <div key={n.id} className="item" style={{ cursor: 'pointer', borderColor: sel === n.id ? 'var(--gold)' : undefined, padding: '5px 8px' }} onClick={() => setSel(n.id)}>
                  <Bust look={n.look} face={faceFor(n.id, n.look)} crop="head" scale={1} still />
                  <div className="grow">
                    <div className="title" style={{ fontSize: 12 }}>
                      {r.knowsName ? n.name : '？'}
                    </div>
                    <div className="desc">{core.social.statusName(r.status)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {def && <Detail id={def.id} />}
        </div>
      )}
    </Modal>
  );
}

function Detail(props: { id: string }): JSX.Element {
  const core = useCore();
  const def = NPC_BY_ID[props.id];
  const r = core.social.rel(props.id);
  const b = core.state.social.beliefs[props.id];
  const mems = core.social.memoriesOf(props.id).slice(0, 10);
  const rt = core.state.npcs[props.id];
  const seenRecently = r.lastTalk > 0 && core.now() - r.lastTalk < 60 * 3;
  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div className="portrait" style={{ width: 140, height: 172, flex: 'none' }}>
          <Bust look={def.look} face={faceFor(def.id, def.look)} expr={moodFrom(0, core.social.disposition(def.id), def.traits.temper)} scale={2} bg={BACKDROPS.home} blush={['dating', 'partner'].includes(core.romance.stage(def.id))} />
        </div>
        <div className="grow">
          <h3 style={{ margin: 0, color: 'var(--gold-light)' }}>
            {r.knowsName ? `${def.name} · ${def.nameEn}` : '不知道名字的人'}
          </h3>
          <div className="muted" style={{ fontSize: 12 }}>
            {def.age} 岁 · {def.occupation} · {def.district}
          </div>
          {r.familiarity >= 20 && <div style={{ fontSize: 12, marginTop: 4 }}>{def.bio}</div>}
          {r.familiarity >= 40 && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              对钱的看法：{def.moneyView}　对赌博：{def.gamblingAttitude}
            </div>
          )}
          {r.familiarity < 20 && <div className="dim" style={{ fontSize: 12 }}>多聊几次，才能更了解 TA。</div>}
          {(() => {
            const st = core.romance.stage(def.id);
            if (st === 'partner') return <div style={{ fontSize: 12, marginTop: 4 }} className="good">恋人 · 在一起 {core.today() - Number(r.flags.partnerSince ?? core.today())} 天 · 约会 {core.romance.dates(def.id)} 次</div>;
            if (st === 'dating') return <div style={{ fontSize: 12, marginTop: 4 }} className="good">约会中 · 已约会 {core.romance.dates(def.id)} 次</div>;
            if (st === 'ex') return <div style={{ fontSize: 12, marginTop: 4 }} className="muted">前任</div>;
            return null;
          })()}
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            上次交谈：{r.lastTalk > 0 ? formatAgo(core.now(), r.lastTalk) : '还没有'}
            {seenRecently && rt.location && ` · 刚才在${LOCATIONS[rt.location]?.name ?? '城里'}`}
          </div>
        </div>
      </div>
      <div className="grid2">
        <div className="card">
          <h3>关系 · {core.social.statusName(r.status)}</h3>
          {DIMS.map((k) => (
            <DimBar key={k} k={k} v={r[k]} />
          ))}
        </div>
        <div className="card">
          <h3>TA 对你的了解</h3>
          <div style={{ fontSize: 12 }} className="stack">
            <div>
              身家估计：
              {b?.wealth ? (
                <>
                  约 <GV v={rough(b.wealth.estimate)} />
                  <span className="dim">（把握 {Math.round(b.wealth.confidence * 100)}% · 依据：{BASIS_NAMES[b.wealth.basis] ?? '传闻'}）</span>
                </>
              ) : (
                <span className="dim">不清楚</span>
              )}
            </div>
            <div>工作：{b?.knowsJob ? (JOBS[b.knowsJob]?.title ?? b.knowsJob) : <span className="dim">不知道</span>}</div>
            <div>住处：{b?.knowsHome ? HOMES[b.knowsHome]?.name ?? b.knowsHome : <span className="dim">不知道</span>}</div>
            <div>欠债：{b?.knowsDebt ? <span className="bad">知道你有债务</span> : <span className="dim">不知道</span>}</div>
            <div>赌博：{(b?.knowsGambling ?? 0) > 0 ? `知道你常去赌场（程度 ${Math.round(b!.knowsGambling)}）` : <span className="dim">不知道</span>}</div>
          </div>
        </div>
      </div>
      <PeopleAround id={props.id} />
      <div className="card">
        <h3>TA 记得的事</h3>
        {mems.length === 0 ? (
          <div className="muted" style={{ fontSize: 12 }}>还没有什么特别的记忆。</div>
        ) : (
          <table className="data">
            <tbody>
              {mems.map((m) => (
                <tr key={m.id}>
                  <td className="dim" style={{ whiteSpace: 'nowrap' }}>
                    {formatAgo(core.now(), m.t)}
                  </td>
                  <td>
                    {describeMemory(m)}
                    {m.via && <span className="dim">（{NPC_BY_ID[m.via]?.name ?? m.via} 说的）</span>}
                  </td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {SOURCE_NAMES[m.source]}
                    {m.source === 'rumor' && ` · 可信度 ${Math.round(m.reliability * 100)}%`}
                  </td>
                  <td className={m.valence > 5 ? 'good' : m.valence < -5 ? 'bad' : 'muted'}>{m.valence > 5 ? '好印象' : m.valence < -5 ? '坏印象' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the web between them

const BAND_COLOR: Record<TieBand, string> = { close: '#4caf6a', friendly: '#e0b13e', acquainted: '#9a9aa8', strained: '#d4483a' };
const WEB_W = 520;
const WEB_H = 330;

/** Someone by name, or as a stranger if you do not know it. */
function nameOf(core: ReturnType<typeof useCore>, id: string): string {
  return core.state.social.rel[id]?.knowsName ? NPC_BY_ID[id].name : '一个你不认识的人';
}

/** Someone you have seen with another: how close they looked, and the last time (who did what, where). */
function EdgeLine(props: { e: WebEdge; from: string }): JSX.Element {
  const core = useCore();
  const { e, from } = props;
  const other = e.a === from ? e.b : e.a;
  const where = LOCATIONS[e.location]?.name ?? '城里';
  const ago = core.today() === e.day ? '今天' : formatAgo(core.now(), e.day * 1440 + 720);
  const what = momentText({ a: e.by, b: e.by === e.a ? e.b : e.a, kind: e.kind }, (id) => nameOf(core, id));
  return (
    <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
      <span style={{ display: 'inline-block', width: 12, height: e.band === 'close' ? 4 : 2, background: BAND_COLOR[e.band], flex: 'none' }} />
      <span>
        <b>{nameOf(core, other)}</b> · <span className={e.band === 'strained' ? 'bad' : undefined}>{TIE_BAND_NAMES[e.band]}</span> · 见过 {e.times} 次
        <span className="dim">
          {' '}
          · 上次：{ago}在{where}，{what}
        </span>
      </span>
    </div>
  );
}

/** The pairs you have seen together, drawn as a web: whom each person is close to, and who has fallen out. */
function SocialWeb(props: { onOpen: (id: string) => void }): JSX.Element {
  const core = useCore();
  const { nodes, edges } = core.social.knownWeb();
  const [sel, setSel] = useState<string | null>(null);
  const moments = (core.state.social.pairLog ?? []).slice(-12).reverse();
  if (edges.length === 0)
    return (
      <div className="note">
        你还没见过认识的人彼此之间来往。在酒吧、咖啡馆、公园里多待一会儿，就能看到谁和谁聊得来、谁和谁合不来。
      </div>
    );
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((id, i) => {
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(id, { x: Math.round(WEB_W / 2 + Math.cos(a) * (WEB_W / 2 - 64)), y: Math.round(WEB_H / 2 + Math.sin(a) * (WEB_H / 2 - 26)) });
  });
  const mine = sel ? edges.filter((e) => e.a === sel || e.b === sel).sort((x, y) => y.tie - x.tie) : [];
  return (
    <div className="stack">
      <div style={{ display: 'grid', gridTemplateColumns: `${WEB_W}px 1fr`, gap: 14, alignItems: 'start' }}>
        <div style={{ position: 'relative', width: WEB_W, height: WEB_H }} className="card">
          <svg width={WEB_W} height={WEB_H} style={{ position: 'absolute', left: 0, top: 0 }} shapeRendering="crispEdges">
            {edges.map((e) => {
              const p = pos.get(e.a)!;
              const q = pos.get(e.b)!;
              const lit = !sel || e.a === sel || e.b === sel;
              return (
                <line
                  key={`${e.a}|${e.b}`}
                  x1={p.x}
                  y1={p.y}
                  x2={q.x}
                  y2={q.y}
                  stroke={BAND_COLOR[e.band]}
                  strokeWidth={e.band === 'close' ? 4 : 2}
                  strokeDasharray={e.band === 'strained' ? '6 4' : undefined}
                  opacity={lit ? 1 : 0.18}
                />
              );
            })}
          </svg>
          {nodes.map((id) => {
            const p = pos.get(id)!;
            return (
              <button
                key={id}
                className={`small ${sel === id ? 'primary' : ''}`}
                style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%, -50%)', whiteSpace: 'nowrap' }}
                onClick={() => setSel(sel === id ? null : id)}
              >
                {NPC_BY_ID[id].name}
              </button>
            );
          })}
        </div>
        <div className="stack">
          <div className="row wrap" style={{ gap: 8, fontSize: 12 }}>
            {(Object.keys(BAND_COLOR) as TieBand[]).map((b) => (
              <span key={b} className="row" style={{ gap: 4 }}>
                <span style={{ display: 'inline-block', width: 16, height: b === 'close' ? 4 : 2, background: BAND_COLOR[b] }} />
                {TIE_BAND_NAMES[b]}
              </span>
            ))}
          </div>
          {sel ? (
            <div className="card">
              <h3>
                {NPC_BY_ID[sel].name}
                <button className="small ghost" style={{ marginLeft: 8 }} onClick={() => props.onOpen(sel)}>
                  看 TA 的资料
                </button>
              </h3>
              <div className="stack" style={{ fontSize: 12 }}>
                {mine.map((e) => (
                  <EdgeLine key={`${e.a}|${e.b}`} e={e} from={sel} />
                ))}
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12 }}>
              点一个人的名字，看 TA 和谁走得近。这里只有你亲眼见过的来往，远近是你上次见到他们在一起时的样子。
            </div>
          )}
          <div className="dim" style={{ fontSize: 12 }}>
            关于你的事会沿着这些关系传开：越亲近的两个人，越会把听到的事讲给对方。
          </div>
        </div>
      </div>
      <div className="card">
        <h3>你看到的</h3>
        <table className="data">
          <tbody>
            {moments.map((m, i) => (
              <tr key={`${m.t}|${i}`}>
                <td className="dim" style={{ whiteSpace: 'nowrap' }}>
                  {formatAgo(core.now(), m.t)}
                </td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                  {LOCATIONS[m.location]?.name ?? '城里'}
                </td>
                <td className={m.kind === 'argue' ? 'bad' : m.kind === 'comfort' || m.kind === 'toast' ? 'good' : undefined}>{momentText(m, (id) => nameOf(core, id))}。</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** In someone's details: the people you have seen them with. */
function PeopleAround(props: { id: string }): JSX.Element | null {
  const core = useCore();
  const edges = core.social
    .knownWeb()
    .edges.filter((e) => e.a === props.id || e.b === props.id)
    .sort((x, y) => y.tie - x.tie);
  if (edges.length === 0) return null;
  return (
    <div className="card">
      <h3>你见过 TA 和谁在一起</h3>
      <div className="stack" style={{ fontSize: 12 }}>
        {edges.map((e) => (
          <EdgeLine key={`${e.a}|${e.b}`} e={e} from={props.id} />
        ))}
      </div>
    </div>
  );
}
