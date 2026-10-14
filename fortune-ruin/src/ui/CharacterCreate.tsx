import { useMemo, useState } from 'react';
import { store } from './store';
import { JOBS } from '../data/jobs';
import { HOMES } from '../data/housing';
import { Portrait } from './components';
import { lookFor } from '../world/looks';
import { P } from '../art/palette';
import { BACKGROUNDS, PERSONALITIES } from '../core/newGame';
import type { Appearance, PersonalityTendency } from '../core/state';
import type { BackgroundId } from '../core/state';
import { newGame } from '../game/session';
import { OUTFITS } from '../data/items';

const HAIR_STYLES = ['短发', '侧分', '长直发', '马尾', '波波头', '盘发', '寸头', '背头', '卷发', '双马尾'];
const NAMES = ['林默', '周远', '陈夏', '苏言', '顾北', '江屿', '叶晚', '程野', '许诺', '沈星'];

export function CharacterCreate(): JSX.Element {
  const [name, setName] = useState(NAMES[Math.floor(Math.random() * NAMES.length)]);
  const [app, setApp] = useState<Appearance>({ skin: 1, hairStyle: 1, hairColor: 1, pronoun: 'he', body: 'm', glasses: false, beard: false });
  const [personality, setPersonality] = useState<PersonalityTendency>('rational');
  const [background, setBackground] = useState<BackgroundId>('local');
  const [outfit, setOutfit] = useState<'outfit_casual' | 'outfit_hoodie'>('outfit_casual');
  const [frame, setFrame] = useState(0);
  const look = useMemo(() => lookFor(app, outfit), [app, outfit]);
  const set = (p: Partial<Appearance>) => setApp((a) => ({ ...a, ...p }));
  const valid = name.trim().length >= 1 && name.trim().length <= 12;

  return (
    <div className="create">
      <div className="create-panel">
        <div className="create-preview">
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>形象预览</div>
          <div className="portrait" style={{ width: 160, height: 220, alignItems: 'center' }}>
            <Portrait look={look} scale={6} frame={frame} />
          </div>
          <div className="row">
            <button className="small" onClick={() => setFrame((f) => (f + 12) % 16)}>
              ←
            </button>
            <button className="small" onClick={() => setFrame((f) => (f + 4) % 16)}>
              →
            </button>
          </div>
          <div className="field" style={{ width: '100%' }}>
            <label>初始衣着</label>
            <div className="row">
              {(['outfit_casual', 'outfit_hoodie'] as const).map((o) => (
                <button key={o} className={`small ${outfit === o ? 'primary' : ''}`} onClick={() => setOutfit(o)}>
                  {OUTFITS[o]?.name ?? o}
                </button>
              ))}
            </div>
          </div>
          <div className="note" style={{ width: '100%' }}>
            你住在老城区的{HOMES.home_basic.name}，在{JOBS.office_clerk.employer.replace(/ .*/, '')}做{JOBS.office_clerk.title}。现金 1,000 G，存款 19,000 G。
          </div>
        </div>
        <div className="create-form">
          <div>
            <h2 style={{ margin: 0, color: 'var(--gold-light)' }}>新的人生</h2>
            <div className="muted" style={{ fontSize: 12 }}>灰港 · 第 1 年 3 月 1 日，星期一，早上 7 点。</div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>名字</label>
              <input type="text" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div className="field">
              <label>称呼</label>
              <div className="row">
                {(
                  [
                    ['he', '他'],
                    ['she', '她'],
                    ['they', 'TA'],
                  ] as const
                ).map(([p, l]) => (
                  <button key={p} className={`small ${app.pronoun === p ? 'primary' : ''}`} onClick={() => set({ pronoun: p, body: p === 'she' ? 'f' : p === 'he' ? 'm' : app.body })}>
                    {l}
                  </button>
                ))}
                <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>体型</span>
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
          <div className="field">
            <label>发型</label>
            <div className="row wrap">
              {HAIR_STYLES.map((h, i) => (
                <button key={h} className={`small ${app.hairStyle === i ? 'primary' : ''}`} onClick={() => set({ hairStyle: i })}>
                  {h}
                </button>
              ))}
              <button className={`small ${app.glasses ? 'primary' : ''}`} onClick={() => set({ glasses: !app.glasses })}>
                眼镜
              </button>
              <button className={`small ${app.beard ? 'primary' : ''}`} onClick={() => set({ beard: !app.beard })}>
                胡子
              </button>
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
            <label>出身背景</label>
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
                newGame({ name: name.trim(), appearance: app, personality, background });
                if (outfit !== 'outfit_casual') store.core?.inventory.wear(outfit);
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
