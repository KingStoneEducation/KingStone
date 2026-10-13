import { useState } from 'react';
import { store } from '../store';
import { useCore } from '../hooks';
import { GV, Modal, Portrait } from '../components';
import { NPCS, NPC_BY_ID } from '../../data/npcs';
import { DIM_NAMES, describeMemory } from '../../systems/SocialSystem';
import { formatAgo } from '../../core/calendar';
import { LOCATIONS } from '../../data/locations';
import { HOMES } from '../../data/housing';
import type { RelDims } from '../../core/state';

const DIMS: (keyof RelDims)[] = ['affection', 'trust', 'respect', 'familiarity', 'attraction', 'dependency', 'envy', 'fear'];
const BIPOLAR = new Set<keyof RelDims>(['affection', 'trust', 'respect']);
const SOURCE_NAMES = { witnessed: '亲眼所见', told: '你亲口说的', rumor: '听来的传闻', self: '亲身经历', inferred: '推测' } as const;

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
  const def = sel ? NPC_BY_ID[sel] : null;
  return (
    <Modal title="人际关系" sub="每个人在意的东西不同：有人看重你的人品，有人看重你的钱包。" wide="x" onClose={() => store.closePanel()}>
      {met.length === 0 ? (
        <div className="note">你还没有认识任何人。出门走走，和人聊聊吧。</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14 }}>
          <div className="list" style={{ maxHeight: '64vh', overflow: 'auto' }}>
            {met.map((n) => {
              const r = core.social.rel(n.id);
              return (
                <div key={n.id} className="item" style={{ cursor: 'pointer', borderColor: sel === n.id ? 'var(--gold)' : undefined, padding: '5px 8px' }} onClick={() => setSel(n.id)}>
                  <Portrait look={n.look} scale={2} crop="bust" />
                  <div className="grow">
                    <div className="title" style={{ fontSize: 13 }}>
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
        <div className="portrait" style={{ width: 96, height: 120 }}>
          <Portrait look={def.look} scale={5} crop="bust" />
        </div>
        <div className="grow">
          <h3 style={{ margin: 0, color: 'var(--gold-light)' }}>
            {r.knowsName ? `${def.name} · ${def.nameEn}` : '不知道名字的人'}
          </h3>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {def.age} 岁 · {def.occupation} · {def.district}
          </div>
          {r.familiarity >= 20 && <div style={{ fontSize: 13, marginTop: 4 }}>{def.bio}</div>}
          {r.familiarity >= 40 && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              对钱的看法：{def.moneyView}　对赌博：{def.gamblingAttitude}
            </div>
          )}
          {r.familiarity < 20 && <div className="dim" style={{ fontSize: 12 }}>多聊几次，才能更了解 TA。</div>}
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
          <div style={{ fontSize: 13 }} className="stack">
            <div>
              身家估计：
              {b?.wealth ? (
                <>
                  <GV v={b.wealth.estimate} />
                  <span className="dim">（把握 {Math.round(b.wealth.confidence * 100)}% · 依据：{b.wealth.basis}）</span>
                </>
              ) : (
                <span className="dim">不清楚</span>
              )}
            </div>
            <div>工作：{b?.knowsJob ?? <span className="dim">不知道</span>}</div>
            <div>住处：{b?.knowsHome ? HOMES[b.knowsHome]?.name ?? b.knowsHome : <span className="dim">不知道</span>}</div>
            <div>欠债：{b?.knowsDebt ? <span className="bad">知道你有债务</span> : <span className="dim">不知道</span>}</div>
            <div>赌博：{(b?.knowsGambling ?? 0) > 0 ? `知道你常去赌场（程度 ${Math.round(b!.knowsGambling)}）` : <span className="dim">不知道</span>}</div>
          </div>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>NPC 只能通过亲眼看到、你告诉 TA、或别人传的话来了解你——传闻可能夸大或失真。</div>
        </div>
      </div>
      <div className="card">
        <h3>TA 记得的事</h3>
        {mems.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>还没有什么特别的记忆。</div>
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
