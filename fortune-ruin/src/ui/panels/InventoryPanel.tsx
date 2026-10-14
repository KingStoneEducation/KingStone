import { store } from '../store';
import { useCore } from '../hooks';
import { GV, Modal, useFeedback } from '../components';
import { ITEMS, OUTFITS } from '../../data/items';
import { MEAL_BASIC, MEAL_FRESH } from '../../systems/InventorySystem';
import { effectText } from '../modals/ShopModal';
import { mulRatio } from '../../core/money';
import { Icon } from '../Icon';

export function InventoryPanel(): JSX.Element {
  const core = useCore();
  const inv = core.inventory;
  const [fb, say] = useFeedback();
  const items = Object.entries(core.state.inventory.items).filter(([, n]) => n > 0);
  const vehicle = inv.vehicle();
  const atHome = core.isAtHome();
  return (
    <Modal title="物品" sub={`衣着：${inv.currentOutfit().name} · 外在体面度 ${inv.appearancePrestige().toFixed(1)}`} wide onClose={() => store.closePanel()}>
      <div className="stack">
        {vehicle && (
          <div className="item">
            <div className="grow">
              <div className="title">
                <Icon name="car" /> {vehicle.name}
              </div>
              <div className="desc">
                {vehicle.desc} · 估值 <GV v={inv.vehicleValue()} />
              </div>
            </div>
            <button
              className="small danger"
              onClick={() => {
                const r = inv.sellVehicle();
                say(r.ok, r.ok ? r.message : r.error);
              }}
            >
              卖掉
            </button>
          </div>
        )}
        {items.length === 0 && <div className="muted">背包是空的。</div>}
        <div className="list">
          {items.map(([id, n]) => {
            const isMeal = id === MEAL_BASIC || id === MEAL_FRESH;
            const d = ITEMS[id];
            const name = isMeal ? (id === MEAL_FRESH ? '新鲜食材（份）' : '基础食材（份）') : d?.name ?? id;
            const usable = isMeal ? atHome : d && (d.kind === 'book' ? atHome : !!d.effects);
            return (
              <div className="item" key={id}>
                <div className="grow">
                  <div className="title">
                    {name} <span className="dim">×{n}</span>
                  </div>
                  <div className="desc">{isMeal ? '放在家里的冰箱，回家可以做饭。' : `${d?.desc ?? ''} ${d ? effectText(d) : ''}`}</div>
                </div>
                {d?.kind === 'valuable' && (
                  <button
                    className="small"
                    onClick={() => {
                      const r = inv.sellValuable(id);
                      say(r.ok, r.ok ? r.message : r.error);
                    }}
                  >
                    变卖（约 <GV v={mulRatio(d.price, Math.round((d.resale ?? 0.4) * 100), 100)} />）
                  </button>
                )}
                {usable && (
                  <button
                    className="small primary"
                    onClick={() => {
                      const r = inv.use(id);
                      say(r.ok, r.ok ? r.message : r.error);
                    }}
                  >
                    {isMeal ? '做饭' : d?.kind === 'book' ? '阅读' : '使用'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div>
          <h4 style={{ margin: '6px 0', color: 'var(--gold-light)' }}>衣服</h4>
          <div className="row wrap">
            {core.state.inventory.outfits.map((o) => (
              <span key={o} className={`tag ${o === core.state.player.outfit ? 'gold' : ''}`}>
                {OUTFITS[o]?.name ?? o}
              </span>
            ))}
          </div>
          <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>在家里的衣柜换衣服。</div>
        </div>
        {fb}
      </div>
    </Modal>
  );
}
