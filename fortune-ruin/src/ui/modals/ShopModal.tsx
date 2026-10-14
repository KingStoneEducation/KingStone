import { useState } from 'react';
import { store } from '../store';
import { useCore } from '../hooks';
import { GV, Modal, Portrait, useFeedback } from '../components';
import { ITEMS, SHOPS, type ItemDef } from '../../data/items';
import { STAT_NAMES } from '../../systems/PlayerSystem';
import { lookFor } from '../../world/looks';
import type { PlayerStats } from '../../core/state';

export function effectText(d: ItemDef): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d.effects ?? {})) {
    if (!v) continue;
    const name = STAT_NAMES[k as keyof PlayerStats] ?? k;
    parts.push(`${name}${v > 0 ? '+' : ''}${v}`);
  }
  if (d.prestige) parts.push(`体面度 ${d.prestige}`);
  if (d.comfort) parts.push(`舒适度 +${Math.round(d.comfort * 100)}%`);
  if (d.meals) parts.push(`可做 ${d.meals} 顿饭`);
  if (d.vehicle) parts.push(`出行更快 · 每月养车 ${Math.round(d.vehicle.upkeep / 100)} G`);
  return parts.join(' · ');
}

export function ShopModal(props: { shopId: string; consume: boolean }): JSX.Element {
  const core = useCore();
  const shop = SHOPS[props.shopId];
  const [method, setMethod] = useState<'cash' | 'card'>(shop?.accepts.includes('cash') ? 'cash' : 'card');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [fb, say] = useFeedback();
  if (!shop) return <Modal title="商店">这家店暂时不营业。</Modal>;
  const isCasinoBar = props.shopId === 'casino_bar';
  const app = core.state.player.appearance;
  const buy = (d: ItemDef) => {
    const q = qty[d.id] ?? 1;
    const r = props.consume && (d.kind === 'food' || d.kind === 'drink') ? core.inventory.order(props.shopId, d.id, method) : core.inventory.buy(props.shopId, d.id, method, q);
    say(r.ok, r.ok ? r.message : r.error);
  };
  const balance = method === 'cash' ? core.economy.balance('cash') : core.economy.balance('bank');
  return (
    <Modal title={shop.name} sub={shop.greeting} wide>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="row">
          <span className="muted" style={{ fontSize: 12 }}>付款方式</span>
          {shop.accepts.includes('cash') && (
            <button className={`small ${method === 'cash' ? 'primary' : ''}`} onClick={() => setMethod('cash')}>
              现金
            </button>
          )}
          {shop.accepts.includes('card') && (
            <button className={`small ${method === 'card' ? 'primary' : ''}`} onClick={() => setMethod('card')}>
              银行卡
            </button>
          )}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          可用：<GV v={balance} />
        </span>
      </div>
      {isCasinoBar && <div className="note" style={{ marginBottom: 8 }}>会员等级：{core.casino.tierInfo().name}。金卡及以上会员酒水免费。</div>}
      <div className="list">
        {shop.items.map((id) => {
          const d = ITEMS[id];
          if (!d) return null;
          const price = core.inventory.unitPrice(props.shopId, id);
          const full = core.inventory.unitPrice(props.shopId, id, true);
          // a promised freebie covers the first one
          const promised = price === 0 && full > 0;
          const owned = (d.kind === 'outfit' && core.inventory.ownsOutfit(id)) || (d.kind === 'vehicle' && core.state.player.vehicle === id) || (d.kind === 'furniture' && core.housing.furniture().includes(id));
          const stackable = d.kind === 'grocery' || d.kind === 'food' || d.kind === 'drink' || d.kind === 'gift' || d.kind === 'book' || d.kind === 'misc';
          const q = qty[id] ?? 1;
          return (
            <div className="item" key={id}>
              {d.kind === 'outfit' && d.look && <Portrait look={lookFor(app, id)} scale={2} />}
              <div className="grow">
                <div className="title">
                  {d.name} {owned && <span className="tag good">已拥有</span>}
                  {core.inventory.count(id) > 0 && stackable && <span className="tag">持有 {core.inventory.count(id)}</span>}
                </div>
                <div className="desc">{d.desc}</div>
                {effectText(d) && <div className="desc" style={{ color: 'var(--info)' }}>{effectText(d)}</div>}
              </div>
              <div style={{ textAlign: 'right', minWidth: 90 }}>
                {promised ? (
                  <>
                    <span className="good">第一份免费</span>
                    {stackable && !props.consume && q > 1 && (
                      <div>
                        <GV v={full * (q - 1)} />
                      </div>
                    )}
                  </>
                ) : price === 0 ? (
                  <span className="good">招待</span>
                ) : (
                  <>
                    {d.kind === 'outfit' && price < d.price && <span className="tag good">八五折</span>}
                    <GV v={price * (stackable && !props.consume ? q : 1)} />
                  </>
                )}
              </div>
              {stackable && !props.consume && (
                <select value={q} onChange={(e) => setQty({ ...qty, [id]: Number(e.target.value) })} style={{ width: 56, padding: '4px' }}>
                  {[1, 2, 3, 5, 10].map((n) => (
                    <option key={n} value={n}>
                      ×{n}
                    </option>
                  ))}
                </select>
              )}
              <button className="small primary" disabled={owned} onClick={() => buy(d)}>
                {props.consume && (d.kind === 'food' || d.kind === 'drink') ? '点单' : '购买'}
              </button>
            </div>
          );
        })}
      </div>
      {fb}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
        <button onClick={() => store.closeModal()}>离开</button>
      </div>
    </Modal>
  );
}
