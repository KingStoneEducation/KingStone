import { useEffect, useMemo, useRef, useState } from 'react';
import { store } from '../store';
import { useCore } from '../hooks';
import { GV, Modal, useFeedback } from '../components';
import { buildCityMap } from '../../world/maps/city';
import { BUILDINGS, BUS_STOPS, CITY_H, CITY_W, OUTDOOR_PLACES } from '../../world/maps/cityLayout';
import { TILE_INDEX } from '../../art/tiles';
import { LOCATIONS, hoursText, isOpen } from '../../data/locations';
import { toDate } from '../../core/calendar';
import { HOMES } from '../../data/housing';
import { Icon } from '../Icon';

const S = 4;

function tileColor(name: string): string {
  if (name.startsWith('water') || name.startsWith('shore')) return '#25507a';
  if (name.startsWith('road') || name.startsWith('crosswalk')) return '#33333d';
  if (name.startsWith('curb')) return '#55555e';
  if (name.startsWith('grass') || name.startsWith('garden')) return '#3c6e42';
  if (name.startsWith('hedge')) return '#2c5232';
  if (name.startsWith('court')) return '#a0603a';
  if (name.startsWith('path') || name === 'sand') return '#a9946a';
  if (name.startsWith('runner')) return '#8a1a2a';
  if (name === 'dock') return '#6a5038';
  if (name.startsWith('deck')) return '#a87a4a';
  if (name === 'rail') return '#222';
  return '#8a8478';
}

let cached: HTMLCanvasElement | null = null;

function renderMinimap(): HTMLCanvasElement {
  if (cached) return cached;
  const m = buildCityMap();
  const names: string[] = [];
  for (const [n, i] of Object.entries(TILE_INDEX)) names[i] = n;
  const c = document.createElement('canvas');
  c.width = CITY_W * S;
  c.height = CITY_H * S;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < CITY_H; y++) {
    for (let x = 0; x < CITY_W; x++) {
      ctx.fillStyle = tileColor(names[m.ground[y * CITY_W + x]] ?? '');
      ctx.fillRect(x * S, y * S, S, S);
    }
  }
  for (const b of BUILDINGS) {
    ctx.fillStyle = b.target === 'casino' ? '#7a1830' : b.style === 'mansion' ? '#6a5a7a' : b.target?.startsWith('home') ? '#6a5848' : '#4a4058';
    ctx.fillRect(b.x * S, b.y * S, b.w * S, b.h * S);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeRect(b.x * S + 0.5, b.y * S + 0.5, b.w * S - 1, b.h * S - 1);
  }
  cached = c;
  return c;
}

export function MapPanel(): JSX.Element {
  const core = useCore();
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(() => {
    const f = store.mapFocus;
    store.mapFocus = null;
    return f;
  });
  const [fb, say] = useFeedback();
  const img = useMemo(() => renderMinimap().toDataURL(), []);
  const d = toDate(core.now());
  const w = core.state.world;
  const here = w.location === 'city' ? { x: w.x, y: w.y } : core.services.originTile();
  const homeLoc = HOMES[core.state.housing.homeId].location;
  const workLocs = new Set(core.career.agenda().map((a) => a.location));
  useEffect(() => setSel((s) => s), []);
  const pins = BUILDINGS.filter((b) => b.target && b.door);
  const selDef = sel ? LOCATIONS[sel] : null;
  const selPlace = sel && !selDef ? OUTDOOR_PLACES[sel] ?? null : null;
  const taxi = sel ? core.services.taxiQuote(sel) : null;
  const drive = sel ? core.services.driveQuote(sel) : null;
  const go = (mode: 'taxi' | 'drive') => {
    if (!sel) return;
    const tile = core.services.destinationTile(sel);
    const r = core.services.travel(sel, mode);
    if (!r.ok || !tile) {
      say(false, r.ok ? '无法到达' : r.error);
      return;
    }
    store.closeAll();
    store.world?.teleport('city', null, tile);
    store.toast(r.message, 'info');
  };
  return (
    <Modal title="灰港地图" sub="点地名看营业时间和怎么去" wide="x" onClose={() => store.closePanel()}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 270px', gap: 14 }}>
        <div className="mapwrap" ref={ref}>
          <img src={img} style={{ width: '100%', imageRendering: 'pixelated', display: 'block' }} />
          {pins.map((b) => {
            const loc = LOCATIONS[b.target!];
            if (!loc) return null;
            const open = !loc.hours || isOpen(loc, d.weekday, d.minuteOfDay);
            const isHome = b.target === homeLoc;
            const isWork = workLocs.has(b.target!);
            if (b.target!.startsWith('home') && !isHome) return null;
            return (
              <div
                key={b.id}
                className={`mappin ${open ? '' : 'closed'} ${isWork ? 'work' : ''}`}
                style={{ left: `${((b.door!.x + 0.5) / CITY_W) * 100}%`, top: `${(b.door!.y / CITY_H) * 100}%`, borderColor: isHome ? 'var(--good)' : sel === b.target ? 'var(--gold-light)' : undefined }}
                onClick={() => setSel(b.target!)}
              >
                {isHome ? (
                  <>
                    <Icon name="home" /> 家
                  </>
                ) : (
                  loc.name.replace(/ .*/, '')
                )}
                {isWork && ' · 上班'}
              </div>
            );
          })}
          {Object.entries(OUTDOOR_PLACES).map(([id, p]) => (
            <div
              key={id}
              className="mappin"
              style={{ left: `${((p.tile.x + 0.5) / CITY_W) * 100}%`, top: `${(p.tile.y / CITY_H) * 100}%`, borderColor: sel === id ? 'var(--gold-light)' : undefined }}
              onClick={() => setSel(id)}
            >
              {p.short}
            </div>
          ))}
          {BUS_STOPS.map((s) => (
            <div key={s.id} style={{ position: 'absolute', left: `${(s.x / CITY_W) * 100}%`, top: `${(s.y / CITY_H) * 100}%`, transform: 'translate(-50%,-50%)', fontSize: 12 }} title={s.name}>
              <Icon name="bus" />
            </div>
          ))}
          <div className="mappin you" style={{ left: `${((here.x + 0.5) / CITY_W) * 100}%`, top: `${(here.y / CITY_H) * 100}%` }}>
            你
          </div>
        </div>
        <div className="stack">
          {selPlace && (
            <>
              <h3 style={{ margin: 0, color: 'var(--gold-light)' }}>{selPlace.name}</h3>
              <div className="muted" style={{ fontSize: 12 }}>{selPlace.desc}</div>
              <div style={{ fontSize: 12 }}>{selPlace.hours}</div>
              <div className="card">
                <div className="row between">
                  <span>出租车</span>
                  {taxi ? (
                    <span>
                      <GV v={taxi.fare} /> · {taxi.minutes} 分钟
                    </span>
                  ) : (
                    '—'
                  )}
                </div>
                <button className="small primary" style={{ marginTop: 6 }} disabled={!taxi} onClick={() => go('taxi')}>
                  打车前往
                </button>
                {drive && (
                  <>
                    <div className="row between" style={{ marginTop: 8 }}>
                      <span>{core.inventory.vehicle()?.name}</span>
                      <span>
                        <GV v={drive.cost} /> · {drive.minutes} 分钟
                      </span>
                    </div>
                    <button className="small" style={{ marginTop: 6 }} onClick={() => go('drive')}>
                      {core.inventory.vehicle()?.id === 'bicycle' ? '骑车前往' : '开车前往'}
                    </button>
                  </>
                )}
              </div>
              {fb}
            </>
          )}
          {selPlace ? null : selDef ? (
            <>
              <h3 style={{ margin: 0, color: 'var(--gold-light)' }}>{selDef.name}</h3>
              <div className="muted" style={{ fontSize: 12 }}>{selDef.desc}</div>
              <div style={{ fontSize: 12 }}>
                营业：{selDef.hours ? hoursText(selDef) : '全天'}
                {selDef.hours && (isOpen(selDef, d.weekday, d.minuteOfDay) ? <span className="good"> · 营业中</span> : <span className="bad"> · 已打烊</span>)}
              </div>
              {selDef.dressCode !== undefined && <div style={{ fontSize: 12 }}>着装要求：体面度至少 {selDef.dressCode}</div>}
              {selDef.access && selDef.access !== 'resident' && (
                <div style={{ fontSize: 12 }}>
                  进入条件：{{ members: '会员或会员宾客', reservation: '需要预订或受邀', employees: '仅限员工', resident: '' }[selDef.access]}
                </div>
              )}
              <div style={{ fontSize: 12 }}>消费水平：{'G'.repeat(Math.max(1, selDef.priceLevel))}</div>
              <div className="card">
                <div className="row between">
                  <span>出租车</span>
                  {taxi ? (
                    <span>
                      <GV v={taxi.fare} /> · {taxi.minutes} 分钟
                    </span>
                  ) : (
                    '—'
                  )}
                </div>
                <button className="small primary" style={{ marginTop: 6 }} disabled={!taxi || sel === w.location} onClick={() => go('taxi')}>
                  打车前往
                </button>
                {drive && (
                  <>
                    <div className="row between" style={{ marginTop: 8 }}>
                      <span>{core.inventory.vehicle()?.name}</span>
                      <span>
                        <GV v={drive.cost} /> · {drive.minutes} 分钟
                      </span>
                    </div>
                    <button className="small" style={{ marginTop: 6 }} disabled={sel === w.location} onClick={() => go('drive')}>
                      {core.inventory.vehicle()?.id === 'bicycle' ? '骑车前往' : '开车前往'}
                    </button>
                  </>
                )}
              </div>
              {fb}
            </>
          ) : (
            <div className="muted" style={{ fontSize: 12 }}>
              步行最省钱；公交 06:00–24:00 在各站之间往返；出租车随叫随到，但贵。
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
