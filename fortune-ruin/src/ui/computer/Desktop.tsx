import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { store } from '../store';
import { useCore } from '../hooks';
import { appIconUrl, wallpaperUrl, type AppId } from '../../art/appIcons';
import { CasinoMemberView, FurnitureTab, HousingTab, JobsTab, LifeTab, PaydayTab } from '../modals/ComputerModal';
import { MarketView } from '../modals/MarketView';
import { BillsTab } from '../modals/MoneyModals';
import { BusinessView } from '../panels/BusinessPanel';
import { AuctionWeb } from '../modals/AuctionModal';
import { formatClock, formatDate, toDate } from '../../core/calendar';

interface App {
  id: AppId;
  /** under the desktop icon */
  name: string;
  /** in the window's title bar */
  title: string;
  View: () => JSX.Element;
}

/** Every program on the desktop is one of the computer's real functions. */
export const APPS: App[] = [
  { id: 'housing', name: '灰港房产', title: '灰港房产网 · 租房与买房', View: HousingTab },
  { id: 'jobs', name: '招聘', title: '灰港招聘网', View: JobsTab },
  { id: 'invest', name: '证券', title: '证券交易', View: MarketView },
  { id: 'bank', name: '网上银行', title: '灰港银行 · 网上银行', View: BillsTab },
  { id: 'life', name: '生活服务', title: '生活服务 · 订位与会员', View: LifeTab },
  { id: 'furniture', name: '家居商城', title: '家居网上商城', View: FurnitureTab },
  { id: 'payday', name: '随借', title: '随借 App', View: PaydayTab },
  { id: 'business', name: '我的商铺', title: '商铺管理', View: BusinessView },
  { id: 'casino', name: '赌场会员', title: '灰港大赌场 · 会员中心', View: CasinoMemberView },
  { id: 'auction', name: '拍卖行', title: '灰港拍卖行 · 网上图录', View: AuctionWeb },
];

interface Win {
  app: AppId;
  x: number;
  y: number;
  z: number;
  min: boolean;
}

const BOOT_MS = 900;

function uiZoom(): number {
  return Number(document.getElementById('ui-root')?.dataset.zoom ?? 1) || 1;
}

/**
 * The home computer: a pixel desktop with program icons, windows that can be
 * moved, minimised and closed, a taskbar with the game clock, and a start
 * menu with the power button. Each window shows one of the computer's pages.
 */
export function Desktop(props: { open?: AppId }): JSX.Element {
  const core = useCore();
  const screenRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'boot' | 'on' | 'off'>('boot');
  const [wins, setWins] = useState<Win[]>([]);
  const [focus, setFocus] = useState<AppId | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const zTop = useRef(10);

  useEffect(() => {
    const t = setTimeout(() => setPhase((p) => (p === 'boot' ? 'on' : p)), BOOT_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (phase === 'on' && props.open) openApp(props.open);
    // open the requested program once the desktop is up
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const size = () => {
    const el = screenRef.current;
    return { w: el?.clientWidth ?? 1000, h: el?.clientHeight ?? 600 };
  };
  const winSize = () => {
    const s = size();
    return { w: Math.min(880, s.w - 40), h: Math.min(560, s.h - 70) };
  };
  const openApp = (id: AppId) => {
    setStartOpen(false);
    setWins((ws) => {
      const z = ++zTop.current;
      const have = ws.find((w) => w.app === id);
      if (have) return ws.map((w) => (w.app === id ? { ...w, min: false, z } : w));
      const s = size();
      const ws2 = winSize();
      const n = ws.length;
      return [...ws, { app: id, x: Math.max(8, (s.w - ws2.w) / 2 + n * 24 - 36), y: Math.max(8, (s.h - 34 - ws2.h) / 2 + n * 20 - 20), z, min: false }];
    });
    setFocus(id);
  };
  const closeApp = (id: AppId) => {
    setWins((ws) => ws.filter((w) => w.app !== id));
    setFocus((f) => (f === id ? null : f));
  };
  const minApp = (id: AppId) => {
    setWins((ws) => ws.map((w) => (w.app === id ? { ...w, min: true } : w)));
    setFocus(null);
  };
  const raise = (id: AppId) => {
    const z = ++zTop.current;
    setWins((ws) => ws.map((w) => (w.app === id ? { ...w, z } : w)));
    setFocus(id);
  };
  const move = (id: AppId, x: number, y: number) => {
    const s = size();
    const ws2 = winSize();
    setWins((ws) => ws.map((w) => (w.app === id ? { ...w, x: Math.max(-ws2.w + 80, Math.min(s.w - 80, x)), y: Math.max(0, Math.min(s.h - 60, y)) } : w)));
  };
  const shutDown = () => {
    setStartOpen(false);
    setPhase('off');
    setTimeout(() => store.closeModal(), 450);
  };

  const d = toDate(core.now());
  return (
    <div className="os-monitor" onMouseDown={(e) => e.stopPropagation()}>
      <div className="os-screen" ref={screenRef} style={{ backgroundImage: `url(${wallpaperUrl()})` }}>
        {phase === 'boot' && (
          <div className="os-boot" onClick={() => setPhase('on')}>
            <div className="os-logo">灰港 OS</div>
            <div className="os-bar">
              <span />
            </div>
          </div>
        )}
        {phase === 'off' && (
          <div className="os-boot">
            <div className="os-logo">正在关机……</div>
          </div>
        )}
        {phase === 'on' && (
          <>
            <div className="os-icons">
              {APPS.map((a) => (
                <button key={a.id} className="os-icon" onClick={() => openApp(a.id)} title={a.title}>
                  <img src={appIconUrl(a.id)} width={48} height={48} alt="" />
                  <span>{a.name}</span>
                </button>
              ))}
            </div>
            {wins
              .filter((w) => !w.min)
              .map((w) => {
                const app = APPS.find((a) => a.id === w.app)!;
                return <Window key={w.app} w={w} app={app} size={winSize()} focused={focus === w.app} onFocus={() => raise(w.app)} onClose={() => closeApp(w.app)} onMin={() => minApp(w.app)} onMove={(x, y) => move(w.app, x, y)} />;
              })}
            {startOpen && (
              <div className="os-start-menu">
                <div className="os-start-side">灰港 OS</div>
                <div className="os-start-list">
                  {APPS.map((a) => (
                    <button key={a.id} onClick={() => openApp(a.id)}>
                      <img src={appIconUrl(a.id)} width={16} height={16} alt="" /> {a.title}
                    </button>
                  ))}
                  <div className="os-sep" />
                  <button onClick={shutDown}>
                    <img src={appIconUrl('power')} width={16} height={16} alt="" /> 关机（离开电脑）
                  </button>
                </div>
              </div>
            )}
            <div className="os-taskbar">
              <button className={`os-start ${startOpen ? 'on' : ''}`} onClick={() => setStartOpen((v) => !v)}>
                开始
              </button>
              <div className="os-tasks">
                {wins.map((w) => {
                  const app = APPS.find((a) => a.id === w.app)!;
                  return (
                    <button key={w.app} className={`os-task ${focus === w.app && !w.min ? 'on' : ''}`} onClick={() => (focus === w.app && !w.min ? minApp(w.app) : (setWins((ws) => ws.map((x) => (x.app === w.app ? { ...x, min: false } : x))), raise(w.app)))}>
                      <img src={appIconUrl(w.app)} width={16} height={16} alt="" /> {app.name}
                    </button>
                  );
                })}
              </div>
              <div className="os-tray">
                {formatDate(d)} {formatClock(d.minuteOfDay)}
              </div>
              <button className="os-power" onClick={shutDown} title="关机（离开电脑）">
                <img src={appIconUrl('power')} width={16} height={16} alt="关机" />
              </button>
            </div>
          </>
        )}
      </div>
      <div className="os-bezel">
        <span className="os-brand">GREYHAVEN</span>
        <span className="os-led" />
      </div>
    </div>
  );
}

function Window(props: { w: Win; app: App; size: { w: number; h: number }; focused: boolean; onFocus: () => void; onClose: () => void; onMin: () => void; onMove: (x: number, y: number) => void }): JSX.Element {
  const drag = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);
  const { w, app } = props;
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    props.onFocus();
    drag.current = { sx: e.clientX, sy: e.clientY, x: w.x, y: w.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveP = (e: RPointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g) return;
    const z = uiZoom();
    props.onMove(g.x + (e.clientX - g.sx) / z, g.y + (e.clientY - g.sy) / z);
  };
  const up = () => {
    drag.current = null;
  };
  const View = app.View;
  return (
    <div className="os-window" style={{ left: w.x, top: w.y, zIndex: w.z, width: props.size.w, height: props.size.h }} onMouseDown={props.onFocus}>
      <div className={`os-title ${props.focused ? '' : 'idle'}`} onPointerDown={down} onPointerMove={moveP} onPointerUp={up} onPointerCancel={up}>
        <img src={appIconUrl(app.id)} width={16} height={16} alt="" />
        <span className="os-title-text">{app.title}</span>
        <button className="os-tbtn" onClick={props.onMin} title="最小化">
          _
        </button>
        <button className="os-tbtn" onClick={props.onClose} title="关闭">
          ×
        </button>
      </div>
      <div className="os-body theme-os">
        <View />
      </div>
    </div>
  );
}
