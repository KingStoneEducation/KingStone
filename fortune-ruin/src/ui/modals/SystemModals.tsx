import { useState } from 'react';
import { store } from '../store';
import { useStore } from '../hooks';
import { Modal, useFeedback } from '../components';
import { loadGame, saveGame, saves } from '../../game/session';
import { SLOTS } from '../../systems/SaveManager';

export function SettingsModal(): JSX.Element {
  useStore();
  const s = store.settings;
  const set = (p: Partial<typeof s>) => store.saveSettings(p);
  const slider = (label: string, key: 'musicVolume' | 'sfxVolume' | 'ambienceVolume') => (
    <div className="row between">
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={s[key]} onChange={(e) => set({ [key]: Number(e.target.value) })} style={{ width: 200 }} />
    </div>
  );
  return (
    <Modal title="设置">
      <div className="stack">
        {slider('音乐', 'musicVolume')}
        {slider('音效', 'sfxVolume')}
        {slider('环境声', 'ambienceVolume')}
        <div className="row between">
          <span>时间流速</span>
          <div className="row">
            {[0.5, 1, 1.5, 2].map((v) => (
              <button key={v} className={`small ${s.timeSpeed === v ? 'primary' : ''}`} onClick={() => set({ timeSpeed: v })}>
                ×{v}
              </button>
            ))}
          </div>
        </div>
        <div className="row between">
          <span>画面缩放</span>
          <div className="row">
            {[0, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                className={`small ${s.zoom === v ? 'primary' : ''}`}
                onClick={() => {
                  set({ zoom: v });
                  window.dispatchEvent(new Event('resize'));
                }}
              >
                {v === 0 ? '自动' : `${v}×`}
              </button>
            ))}
          </div>
        </div>
        <div className="row between">
          <span>赌桌动画速度</span>
          <div className="row">
            {[1, 1.6, 2.4].map((v) => (
              <button key={v} className={`small ${s.tableSpeed === v ? 'primary' : ''}`} onClick={() => set({ tableSpeed: v })}>
                {v === 1 ? '标准' : v < 2 ? '快' : '很快'}
              </button>
            ))}
          </div>
        </div>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={s.showCasinoClock} onChange={(e) => set({ showCasinoClock: e.target.checked })} />
          在赌场内显示时间（真实的赌场里通常看不到时钟）
        </label>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={s.reduceFlashing} onChange={(e) => set({ reduceFlashing: e.target.checked })} />
          减少闪烁效果
        </label>
      </div>
    </Modal>
  );
}

export function SavesModal(props: { mode: 'save' | 'load' }): JSX.Element {
  useStore();
  const [, force] = useState(0);
  const [fb, say] = useFeedback();
  const [importText, setImportText] = useState('');
  const list = saves.list();
  const inGame = !!store.core;
  return (
    <Modal title={props.mode === 'save' ? '保存游戏' : '读取存档'} sub="存档保存在本机浏览器中，可导出为文本备份" wide>
      <div className="list">
        {SLOTS.map((slot, i) => {
          const s = list[i];
          return (
            <div className="item" key={slot}>
              <div className="grow">
                <div className="title">
                  {slot === 'auto' ? '自动存档' : `存档 ${slot.replace('slot', '')}`} {s && <span className="dim">· {new Date(s.savedReal).toLocaleString()}</span>}
                </div>
                <div className="desc">{s ? `${s.name} · ${s.gameTime} · ${s.location} · 净资产 ${s.netWorth} · 游玩 ${s.playHours} 小时` : '空'}</div>
              </div>
              {props.mode === 'save' && slot !== 'auto' && inGame && (
                <button
                  className="small primary"
                  onClick={() => {
                    const err = saveGame(slot);
                    say(!err, err ?? '已保存');
                    force((x) => x + 1);
                  }}
                >
                  保存
                </button>
              )}
              {s && (
                <button
                  className="small"
                  onClick={() => {
                    store.closeAll();
                    const err = loadGame(slot);
                    if (err) store.openModal({ type: 'text', title: '读档失败', text: err, tone: 'bad' });
                  }}
                >
                  读取
                </button>
              )}
              {s && (
                <button
                  className="small ghost"
                  onClick={() => {
                    const text = saves.exportText(slot);
                    if (!text) return;
                    const blob = new Blob([text], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `fortune-ruin-${slot}.json`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  导出
                </button>
              )}
              {s && slot !== 'auto' && (
                <button
                  className="small danger"
                  onClick={() => {
                    saves.remove(slot);
                    force((x) => x + 1);
                  }}
                >
                  删除
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <h3>导入存档</h3>
        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="粘贴导出的存档文本" style={{ width: '100%', height: 70 }} />
        <div className="row" style={{ marginTop: 6 }}>
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setImportText(await f.text());
            }}
          />
          <button
            className="small"
            disabled={!importText.trim()}
            onClick={() => {
              try {
                saves.importText('slot3', importText.trim());
                say(true, '已导入到存档 3');
                setImportText('');
                force((x) => x + 1);
              } catch (err) {
                say(false, (err as Error).message);
              }
            }}
          >
            导入到存档 3
          </button>
        </div>
      </div>
      {fb}
    </Modal>
  );
}
