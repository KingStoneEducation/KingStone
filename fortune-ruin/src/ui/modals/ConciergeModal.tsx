import { useState } from 'react';
import { store, type ConciergeTab } from '../store';
import { useCore } from '../hooks';
import { GV, Modal, Tabs, useFeedback } from '../components';
import { formatG } from '../../core/money';
import { toDate } from '../../core/calendar';
import { ITEMS } from '../../data/items';
import { LOCATIONS } from '../../data/locations';
import { HOMES } from '../../data/housing';
import { TIERS, TIER_INDEX } from '../../casino/tables';
import { CHECKOUT, COMP_STORE, LIMO_PLACES, SPA_MENU, SUITE_COMFORT, SUITE_RATES, type SkyPay } from '../../systems/SkyFloorSystem';
import { LUMIERE_BOOKING_FEE } from '../../systems/ServicesSystem';
import { effectText } from './ShopModal';

/** The members' floor services: the concierge desk, the spa front desk and the boutique counter. */
export function ConciergeModal(props: { tab: ConciergeTab; lobby?: boolean }): JSX.Element {
  const core = useCore();
  const [tab, setTab] = useState<ConciergeTab>(props.tab);
  const tier = core.casino.tierInfo();
  if (props.lobby) {
    // at the lift on the ground floor: whoever may not go up can still take a room
    const err = core.sky.access();
    return (
      <Modal title="会员电梯 · 天穹层" sub={tier.name} wide className="theme-sky">
        {err && <div className="note" style={{ marginBottom: 10 }}>{err}</div>}
        <SuiteTab />
      </Modal>
    );
  }
  return (
    <Modal title="天穹层 · 礼宾服务" sub={`${tier.name} · 餐饮积分 ${formatG(core.state.casino.comps)}`} wide="x" className="theme-sky">
      <Tabs<ConciergeTab>
        tabs={[
          { id: 'suite', label: '套房' },
          { id: 'spa', label: '水疗' },
          { id: 'car', label: '专车' },
          { id: 'dining', label: '订位' },
          { id: 'store', label: '精品店' },
          { id: 'perks', label: '会员礼遇' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ paddingTop: 12 }}>
        {tab === 'suite' && <SuiteTab />}
        {tab === 'spa' && <SpaTab />}
        {tab === 'car' && <CarTab />}
        {tab === 'dining' && <DiningTab />}
        {tab === 'store' && <StoreTab />}
        {tab === 'perks' && <PerksTab />}
      </div>
    </Modal>
  );
}

function PayChoice(props: { value: SkyPay; onChange: (p: SkyPay) => void }): JSX.Element {
  const core = useCore();
  return (
    <div className="row" style={{ gap: 6 }}>
      <span className="muted" style={{ fontSize: 12 }}>付款</span>
      <button className={`small ${props.value === 'bank' ? 'primary' : ''}`} onClick={() => props.onChange('bank')}>
        银行卡（<GV v={core.economy.balance('bank')} />）
      </button>
      <button className={`small ${props.value === 'comps' ? 'primary' : ''}`} onClick={() => props.onChange('comps')}>
        餐饮积分（<GV v={core.state.casino.comps} />）
      </button>
    </div>
  );
}

function SuiteTab(): JSX.Element {
  const core = useCore();
  const sky = core.sky;
  const [pay, setPay] = useState<SkyPay>('bank');
  const [fb, say] = useFeedback();
  const q = sky.suiteQuote();
  const guest = sky.suiteGuest();
  const until = toDate(core.state.casino.sky.suiteUntil);
  return (
    <div className="stack">
      <div className="card">
        <h3>1201 套房</h3>
        <div style={{ fontSize: 12 }}>走廊尽头的转角套房：特大床、独立浴缸、衣帽间，窗外是港口。睡在这里的恢复速度比任何一处住宅都快（舒适度 {Math.round(SUITE_COMFORT * 100)}%）。</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          入住即可使用，第二天中午 {CHECKOUT / 60}:00 退房。房卡有效期间可以随时乘会员电梯上楼。
        </div>
      </div>
      {guest ? (
        <div className="note good">
          你的房卡有效至 {until.month + 1} 月 {until.day} 日 12:00。
        </div>
      ) : (
        <div className="item">
          <div className="grow">
            <div className="title">今晚入住</div>
            <div className="desc">{q.note}</div>
          </div>
          <div style={{ minWidth: 110, textAlign: 'right' }}>{q.price ? <GV v={q.price} /> : <span className="good">免费</span>}</div>
          <button
            className="small primary"
            onClick={() => {
              const r = sky.bookSuite(pay);
              say(r.ok, r.ok ? r.message : r.error);
            }}
          >
            办理入住
          </button>
        </div>
      )}
      {!guest && q.price > 0 && <PayChoice value={pay} onChange={setPay} />}
      {fb}
      <table className="data">
        <thead>
          <tr>
            <th>会员等级</th>
            <th className="r">每晚</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>普通访客 / 银卡</td>
            <td className="r num">{formatG(SUITE_RATES.visitor)}</td>
          </tr>
          <tr>
            <td>金卡</td>
            <td className="r num">{formatG(SUITE_RATES.gold)}</td>
          </tr>
          <tr>
            <td>白金卡</td>
            <td className="r">每周一晚免费，其余 {formatG(SUITE_RATES.platinum)}</td>
          </tr>
          <tr>
            <td>钻石卡</td>
            <td className="r">免费</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SpaTab(): JSX.Element {
  const core = useCore();
  const sky = core.sky;
  const [pay, setPay] = useState<SkyPay>('bank');
  const [fb, say] = useFeedback();
  const s = core.state.player.stats;
  return (
    <div className="stack">
      <div className="muted" style={{ fontSize: 12 }}>
        现在：压力 {Math.round(s.stress)} · 体力 {Math.round(s.energy)}
        {s.drunk >= 30 ? ` · 醉意 ${Math.round(s.drunk)}` : ''}。金卡八折，白金卡每天一次免费、其余七折，钻石卡全部免费。
      </div>
      <div className="list">
        {SPA_MENU.map((t) => {
          const q = sky.spaQuote(t.id);
          return (
            <div className="item" key={t.id}>
              <div className="grow">
                <div className="title">
                  {t.name} <span className="tag">{t.minutes} 分钟</span>
                </div>
                <div className="desc">{t.desc}</div>
                <div className="desc" style={{ color: 'var(--info)' }}>
                  {effectText({ id: t.id, name: t.name, kind: 'misc', price: t.price, desc: '', effects: t.effects })} · 之后几小时心情更好
                </div>
              </div>
              <div style={{ minWidth: 110, textAlign: 'right' }}>
                {q.price ? <GV v={q.price} /> : <span className="good">免费</span>}
                <div className="muted" style={{ fontSize: 12 }}>
                  {q.note}
                </div>
              </div>
              <button
                className="small primary"
                onClick={() => {
                  const r = sky.spa(t.id, pay);
                  say(r.ok, r.ok ? r.message : r.error);
                }}
              >
                预约
              </button>
            </div>
          );
        })}
      </div>
      <PayChoice value={pay} onChange={setPay} />
      {fb}
    </div>
  );
}

function CarTab(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const home = HOMES[core.state.housing.homeId].location;
  const places = [home, ...LIMO_PLACES.filter((l) => l !== home)];
  const free = core.casino.tierAtLeast('platinum');
  return (
    <div className="stack">
      <div className="note">{free ? '白金卡及以上会员，赌场的车免费送你去城里任何地方。' : '赌场的车按出租车价格的 1.5 倍收费；白金卡及以上会员免费。'}</div>
      <div className="list">
        {places.map((loc) => {
          const q = core.sky.limoQuote(loc);
          if (!q) return null;
          return (
            <div className="item" key={loc}>
              <div className="grow">
                <div className="title">{loc === home ? `回家（${LOCATIONS[loc]?.name}）` : LOCATIONS[loc]?.name}</div>
                <div className="desc">约 {q.minutes} 分钟</div>
              </div>
              <div style={{ minWidth: 90, textAlign: 'right' }}>{q.fare ? <GV v={q.fare} /> : <span className="good">免费</span>}</div>
              <button
                className="small primary"
                onClick={() => {
                  const tile = core.services.destinationTile(loc);
                  const r = core.sky.limo(loc);
                  if (!r.ok || !tile) {
                    say(false, r.ok ? '无法到达' : r.error);
                    return;
                  }
                  store.closeAll();
                  store.world?.teleport('city', null, tile);
                  store.toast(r.message, 'info');
                }}
              >
                叫车
              </button>
            </div>
          );
        })}
      </div>
      {fb}
    </div>
  );
}

function DiningTab(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const plat = core.casino.tierAtLeast('platinum');
  const booked = Number(core.state.player.flags.lumiereReservation ?? -1);
  return (
    <div className="stack">
      <div className="card">
        <h3>Lumière 法餐厅</h3>
        <div style={{ fontSize: 12 }}>礼宾台可以代订。{plat ? '白金卡及以上会员免订位费。' : `订位费 ${formatG(LUMIERE_BOOKING_FEE)}，白金卡及以上会员免收。`}钻石卡会员晚到 23 点前也能订到当晚的位子。用餐需正装。</div>
        {booked >= core.today() && <div className="good" style={{ fontSize: 12, marginTop: 4 }}>已有预订：{booked === core.today() ? '今天' : '明天'}晚上。</div>}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button
          className="small primary"
          onClick={() => {
            const r = core.sky.bookLumiere(false);
            say(r.ok, r.ok ? r.message : r.error);
          }}
        >
          订今晚
        </button>
        <button
          className="small"
          onClick={() => {
            const r = core.sky.bookLumiere(true);
            say(r.ok, r.ok ? r.message : r.error);
          }}
        >
          订明晚
        </button>
      </div>
      {fb}
    </div>
  );
}

function StoreTab(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const comps = core.state.casino.comps;
  return (
    <div className="stack">
      <div className="note">会员精品店只收餐饮积分（打牌时按理论损失返还的那部分，不能兑现）。换来的东西可以送人。</div>
      <div className="list">
        {COMP_STORE.map((c) => {
          const d = ITEMS[c.id];
          if (!d) return null;
          return (
            <div className="item" key={c.id}>
              <div className="grow">
                <div className="title">
                  {d.name} {core.inventory.count(c.id) > 0 && <span className="tag">持有 {core.inventory.count(c.id)}</span>}
                </div>
                <div className="desc">{d.desc}</div>
              </div>
              <div style={{ minWidth: 110, textAlign: 'right' }}>
                <GV v={c.comps} />
                <div className="muted" style={{ fontSize: 12 }}>
                  积分
                </div>
              </div>
              <button
                className="small primary"
                disabled={comps < c.comps}
                onClick={() => {
                  const r = core.sky.redeem(c.id);
                  say(r.ok, r.ok ? r.message : r.error);
                }}
              >
                兑换
              </button>
            </div>
          );
        })}
      </div>
      {fb}
    </div>
  );
}

function PerksTab(): JSX.Element {
  const core = useCore();
  const m = core.state.casino.membership;
  return (
    <div className="stack">
      <table className="data">
        <thead>
          <tr>
            <th>等级</th>
            <th>天穹层的礼遇</th>
          </tr>
        </thead>
        <tbody>
          {TIERS.map((t) => (
            <tr key={t.id} style={TIER_INDEX[t.id] === TIER_INDEX[m.tier] ? { background: 'rgba(224,177,62,0.12)' } : undefined}>
              <td style={{ color: t.color }}>{t.name}</td>
              <td className="muted">{SKY_PERKS[t.id]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">每周六 21:00 到次日 1:00 是「天穹之夜」：现场爵士乐，酒廊的香槟免费，银卡会员也可以上楼。会员礼遇不影响任何游戏的规则和赔率。</div>
    </div>
  );
}

const SKY_PERKS: Record<string, string> = {
  visitor: '只能以套房住客或受邀客人的身份上楼；套房、水疗按门市价',
  silver: '天穹之夜可以上楼；套房、水疗按门市价',
  gold: '随时上楼；休息室自助餐与酒水免费；套房会员价；水疗八折；专车按 1.5 倍车费',
  platinum: '以上全部；每周一晚免费套房；每天一次免费水疗；专车免费；代订 Lumière 免订位费',
  diamond: '以上全部；套房与水疗全部免费；当晚 23 点前都能订到 Lumière',
};
