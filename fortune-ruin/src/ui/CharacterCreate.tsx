import { useMemo, useState } from 'react';
import { store } from './store';
import { JOBS } from '../data/jobs';
import { HOMES } from '../data/housing';
import { Portrait } from './components';
import { lookFor } from '../world/looks';
import { P } from '../art/palette';
import { BACKGROUNDS, PERSONALITIES, STARTS, type StartPreset } from '../core/newGame';
import type { Appearance, PersonalityTendency } from '../core/state';
import type { BackgroundId } from '../core/state';
import { newGame } from '../game/session';
import { OUTFITS } from '../data/items';
import { Bust, BACKDROPS } from './Bust';
import { EYE_COLORS, EYE_SHAPES, playerFace } from '../data/faces';
import type { Expression } from '../art/portraits';

const HAIR_STYLES = ['短发', '侧分', '长直发', '波波头', '马尾', '盘发', '卷发', '背头', '寸头', '长波浪', '光头', '长卷发'];
const NAMES = ['林默', '周远', '陈夏', '苏言', '顾北', '江屿', '叶晚', '程野', '许诺', '沈星'];
const STARTER_OUTFITS = ['outfit_casual', 'outfit_hoodie', 'outfit_smart'] as const;
type StarterOutfit = (typeof STARTER_OUTFITS)[number];
const TOP_COLORS = ['#4f7fbf', '#b8432e', '#3f7a4a', '#d9a441', '#6b4a8a', '#2f3540', '#c46a8a', '#e6e1d3'];
const PREVIEW_EXPR: [Expression, string][] = [
  ['neutral', '平静'],
  ['smile', '微笑'],
  ['surprised', '惊讶'],
  ['angry', '生气'],
];
const HATS: [Appearance['hat'], string][] = [
  [null, '不戴'],
  ['beanie', '毛线帽'],
  ['cap', '鸭舌帽'],
];

function startSummary(preset: StartPreset): string {
  const basic = HOMES.home_basic.name;
  const job = JOBS.office_clerk;
  const employer = job.employer.replace(/ .*/, '');
  switch (preset) {
    case 'lottery':
      return `住在老城区的${basic}，在${employer}做${job.title}。现金 1,000 G，存款 819,000 G。`;
    case 'founder':
      return `住在自己的${HOMES.home_river.name}。存款 1,200,000 G，指数基金 300,000 G，没有工作。`;
    case 'heir':
      return `住在自己的${HOMES.home_penthouse.name}，有一辆跑车。存款 3,000,000 G，没有工作，赌场金卡会员。`;
    default:
      return `住在老城区的${basic}，在${employer}做${job.title}。现金 1,000 G，存款 19,000 G。`;
  }
}

export function CharacterCreate(): JSX.Element {
  const [name, setName] = useState(NAMES[Math.floor(Math.random() * NAMES.length)]);
  const [app, setApp] = useState<Appearance>({
    skin: 1,
    hairStyle: 1,
    hairColor: 1,
    pronoun: 'he',
    body: 'm',
    glasses: false,
    beard: false,
    earrings: false,
    hat: null,
    eyes: 0,
    eyeColor: 0,
  });
  const [personality, setPersonality] = useState<PersonalityTendency>('rational');
  const [background, setBackground] = useState<BackgroundId>('local');
  const [start, setStart] = useState<StartPreset>('ordinary');
  const [outfit, setOutfit] = useState<StarterOutfit>('outfit_casual');
  const [frame, setFrame] = useState(0);
  const [expr, setExpr] = useState<Expression>('neutral');
  const look = useMemo(() => lookFor(app, outfit), [app, outfit]);
  const face = useMemo(() => playerFace(app, look), [app, look]);
  const set = (p: Partial<Appearance>) => setApp((a) => ({ ...a, ...p }));
  const valid = name.trim().length >= 1 && name.trim().length <= 12;

  return (
    <div className="create">
      <div className="create-panel">
        <div className="create-preview">
          <div className="muted">形象</div>
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div className="portrait" style={{ width: 140, height: 172 }}>
              <Bust look={look} face={face} expr={expr} scale={2} bg={BACKDROPS.home} />
            </div>
            <div className="stack" style={{ alignItems: 'center', gap: 4 }}>
              <div className="portrait" style={{ width: 60, height: 108, alignItems: 'center' }}>
                <Portrait look={look} scale={3} frame={frame} />
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button className="small" onClick={() => setFrame((f) => (f + 12) % 16)} title="向左转">
                  ←
                </button>
                <button className="small" onClick={() => setFrame((f) => (f + 4) % 16)} title="向右转">
                  →
                </button>
              </div>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 4 }}>
            {PREVIEW_EXPR.map(([e, l]) => (
              <button key={e} className={`small ${expr === e ? 'primary' : ''}`} onClick={() => setExpr(e)}>
                {l}
              </button>
            ))}
          </div>
          <div className="field" style={{ width: '100%' }}>
            <label>衣着</label>
            <div className="row wrap" style={{ gap: 4 }}>
              {STARTER_OUTFITS.map((o) => (
                <button key={o} className={`small ${outfit === o ? 'primary' : ''}`} onClick={() => setOutfit(o)}>
                  {OUTFITS[o]?.name ?? o}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ width: '100%' }}>
            <label>上衣颜色</label>
            <div className="swatches">
              <button className={`swatch ${!app.topColor ? 'active' : ''}`} style={{ background: OUTFITS[outfit]?.look?.top }} title="原色" onClick={() => set({ topColor: undefined })} />
              {TOP_COLORS.filter((c) => c !== OUTFITS[outfit]?.look?.top)
                .slice(0, 7)
                .map((c) => (
                  <button key={c} className={`swatch ${app.topColor === c ? 'active' : ''}`} style={{ background: c }} onClick={() => set({ topColor: c })} />
                ))}
            </div>
          </div>
          <div className="note" style={{ width: '100%' }}>
            {startSummary(start)}
          </div>
        </div>
        <div className="create-form">
          <div>
            <h2 style={{ margin: 0, color: 'var(--gold-light)' }}>新的人生</h2>
            <div className="muted">灰港，第 1 年 3 月 1 日，星期一，早上 7 点。</div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>名字</label>
              <input type="text" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div className="field">
              <label>称呼与体型</label>
              <div className="row">
                {(
                  [
                    ['he', '他'],
                    ['she', '她'],
                    ['they', 'TA'],
                  ] as const
                ).map(([p, l]) => (
                  <button
                    key={p}
                    className={`small ${app.pronoun === p ? 'primary' : ''}`}
                    onClick={() =>
                      set({
                        pronoun: p,
                        body: p === 'she' ? 'f' : p === 'he' ? 'm' : app.body,
                      })
                    }
                  >
                    {l}
                  </button>
                ))}
                <span className="muted" style={{ marginLeft: 6 }}>
                  体型
                </span>
                {(
                  [
                    ['m', 'A'],
                    ['f', 'B'],
                  ] as const
                ).map(([b, l]) => (
                  <button key={b} className={`small ${app.body === b ? 'primary' : ''}`} onClick={() => set({ body: b })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>肤色</label>
              <div className="swatches">
                {P.skin.map((c, i) => (
                  <button key={c} className={`swatch ${app.skin === i ? 'active' : ''}`} style={{ background: c }} onClick={() => set({ skin: i })} />
                ))}
              </div>
            </div>
            <div className="field">
              <label>发色</label>
              <div className="swatches">
                {P.hair.map((c, i) => (
                  <button key={c} className={`swatch ${app.hairColor === i ? 'active' : ''}`} style={{ background: c }} onClick={() => set({ hairColor: i })} />
                ))}
              </div>
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>眼型</label>
              <div className="row wrap" style={{ gap: 4 }}>
                {EYE_SHAPES.map(([k, l], i) => (
                  <button key={k} className={`small ${(app.eyes ?? 0) === i ? 'primary' : ''}`} onClick={() => set({ eyes: i })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>瞳色</label>
              <div className="swatches">
                {EYE_COLORS.map((c, i) => (
                  <button key={c} className={`swatch ${(app.eyeColor ?? 0) === i ? 'active' : ''}`} style={{ background: c }} onClick={() => set({ eyeColor: i })} />
                ))}
              </div>
            </div>
          </div>
          <div className="field">
            <label>发型</label>
            <div className="row wrap" style={{ gap: 4 }}>
              {HAIR_STYLES.map((h, i) => (
                <button key={h} className={`small ${app.hairStyle === i ? 'primary' : ''}`} onClick={() => set({ hairStyle: i })}>
                  {h}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>配饰</label>
            <div className="row wrap" style={{ gap: 4 }}>
              <button className={`small ${app.glasses ? 'primary' : ''}`} onClick={() => set({ glasses: !app.glasses })}>
                眼镜
              </button>
              <button className={`small ${app.beard ? 'primary' : ''}`} onClick={() => set({ beard: !app.beard })}>
                胡子
              </button>
              <button className={`small ${app.earrings ? 'primary' : ''}`} onClick={() => set({ earrings: !app.earrings })}>
                耳环
              </button>
              <span className="muted" style={{ marginLeft: 6 }}>
                帽子
              </span>
              {HATS.map(([h, l]) => (
                <button key={l} className={`small ${(app.hat ?? null) === h ? 'primary' : ''}`} onClick={() => set({ hat: h })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>开局</label>
            <div className="choice-grid">
              {(Object.keys(STARTS) as StartPreset[]).map((k) => (
                <button key={k} className={`choice ${start === k ? 'active' : ''}`} onClick={() => setStart(k)}>
                  <div className="t">{STARTS[k].name}</div>
                  <div className="d">{STARTS[k].desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>性格</label>
            <div className="choice-grid">
              {(Object.keys(PERSONALITIES) as PersonalityTendency[]).map((k) => (
                <button key={k} className={`choice ${personality === k ? 'active' : ''}`} onClick={() => setPersonality(k)}>
                  <div className="t">{PERSONALITIES[k].name}</div>
                  <div className="d">{PERSONALITIES[k].desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>出身</label>
            <div className="choice-grid">
              {(Object.keys(BACKGROUNDS) as BackgroundId[]).map((k) => (
                <button key={k} className={`choice ${background === k ? 'active' : ''}`} onClick={() => setBackground(k)}>
                  <div className="t">{BACKGROUNDS[k].name}</div>
                  <div className="d">{BACKGROUNDS[k].desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="row between">
            <button
              className="ghost"
              onClick={() => {
                store.screen = 'menu';
                store.notify();
              }}
            >
              返回
            </button>
            <button
              className="primary"
              disabled={!valid}
              onClick={() => {
                newGame({
                  name: name.trim(),
                  appearance: app,
                  personality,
                  background,
                  start,
                });
                const core = store.core;
                if (core && outfit !== 'outfit_casual') {
                  if (!core.state.inventory.outfits.includes(outfit)) core.state.inventory.outfits.push(outfit);
                  core.inventory.wear(outfit);
                }
              }}
            >
              开始生活 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
