import { useState } from 'react';
import { store, type CharityTab, type PawnTab } from '../store';
import { useCore } from '../hooks';
import { AmountInput, GV, ItemIcon, Modal, Portrait, Tabs, useFeedback } from '../components';
import { lookFor } from '../../world/looks';
import { G, formatG, type Money } from '../../core/money';
import { formatDate, toDate, MINUTES_PER_DAY } from '../../core/calendar';
import { itemDef } from '../../data/items';
import { PAWN_FEE_BP, PAWN_GRACE, PAWN_PERIOD, PAWN_TERM } from '../../systems/PawnSystem';
import { FORTUNE_PRICE, LABOR, VOLUNTEER_HOURS } from '../../systems/OldTownSystem';
import { effectText } from './ShopModal';
import { runSteps } from '../../core/steps';
import type { ActionResult } from '../../systems/InventorySystem';

type Pay = 'cash' | 'card';

const dayText = (day: number) => formatDate(toDate(day * MINUTES_PER_DAY));

/** Clothes are shown on the player, everything else by its icon. */
function Thumb(props: { id: string }): JSX.Element {
  const core = useCore();
  const d = itemDef(props.id);
  return d?.kind === 'outfit' && d.look ? <Portrait look={lookFor(core.state.player.appearance, props.id)} scale={2} /> : <ItemIcon id={props.id} />;
}

export function PayToggle(props: { value: Pay; onChange: (p: Pay) => void }): JSX.Element {
  const core = useCore();
  return (
    <div className="row" style={{ gap: 6 }}>
      <span className="muted" style={{ fontSize: 12 }}>付款</span>
      <button className={`small ${props.value === 'cash' ? 'primary' : ''}`} onClick={() => props.onChange('cash')}>
        现金（<GV v={core.economy.balance('cash')} />）
      </button>
      <button className={`small ${props.value === 'card' ? 'primary' : ''}`} onClick={() => props.onChange('card')}>
        银行卡（<GV v={core.economy.balance('bank')} />）
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ the pawn shop

export function PawnModal(props: { tab: PawnTab }): JSX.Element {
  const core = useCore();
  const [tab, setTab] = useState<PawnTab>(props.tab);
  const open = core.pawn.openTickets();
  return (
    <Modal title="福来当铺" sub={`现金 ${formatG(core.economy.balance('cash'))} · 当期 ${PAWN_TERM} 天 · 每 ${PAWN_PERIOD} 天 ${PAWN_FEE_BP / 100}% 综合费`} wide="x">
      <Tabs<PawnTab>
        tabs={[
          { id: 'pawn', label: '典当' },
          { id: 'tickets', label: `当票${open.length ? `（${open.length}）` : ''}` },
          { id: 'sell', label: '卖断' },
          { id: 'shelf', label: '二手柜台' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ paddingTop: 12 }}>
        {tab === 'pawn' && <PawnTabView />}
        {tab === 'tickets' && <TicketsTab />}
        {tab === 'sell' && <SellTab />}
        {tab === 'shelf' && <ShelfTab />}
      </div>
    </Modal>
  );
}

function PawnTabView(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const list = core.pawn.pledgeables();
  return (
    <div className="stack">
      <div className="note">
        掌柜推了推眼镜：「东西放这儿，钱你拿走。{PAWN_TERM} 天内连本带费来赎；过了期限再宽限你 {PAWN_GRACE} 天，再不来就是绝当，东西归店里。」
      </div>
      {list.length === 0 && <div className="muted">你身上没有当铺收的东西（首饰、手表、贵重礼品、正装、车）。</div>}
      <div className="list">
        {list.map((p) => (
          <div className="item" key={p.id}>
            <Thumb id={p.id} />
            <div className="grow">
              <div className="title">{p.name}</div>
              <div className="desc">
                估价 <GV v={p.appraisal} /> · 可当 <GV v={p.loan} /> · 每 {PAWN_PERIOD} 天综合费 <GV v={core.pawn.periodFee(p.loan)} />
                {p.refusal && <span className="bad"> · {p.refusal}</span>}
              </div>
            </div>
            <button
              className="small primary"
              disabled={!!p.refusal}
              onClick={() => {
                const r = core.pawn.pawn(p.id);
                say(r.ok, r.ok ? r.message : r.error);
              }}
            >
              当 {formatG(p.loan)}
            </button>
          </div>
        ))}
      </div>
      {fb}
    </div>
  );
}

function TicketsTab(): JSX.Element {
  const core = useCore();
  const [pay, setPay] = useState<Pay>('cash');
  const [fb, say] = useFeedback();
  const all = core.state.oldtown!.tickets;
  const open = all.filter((t) => t.status === 'open');
  const past = all.filter((t) => t.status !== 'open').slice(-6).reverse();
  const today = core.today();
  return (
    <div className="stack">
      {open.length === 0 && <div className="muted">没有未赎的当票。</div>}
      {open.length > 0 && <PayToggle value={pay} onChange={setPay} />}
      <div className="list">
        {open.map((t) => {
          const d = itemDef(t.item);
          const fee = core.pawn.fees(t);
          const late = today > t.due;
          const left = core.pawn.lastDay(t) - today;
          return (
            <div className="item" key={t.id}>
              <Thumb id={t.item} />
              <div className="grow">
                <div className="title">
                  当票 {t.id} 号 · {d?.name ?? t.item} {late ? <span className="tag bad">已过期 · 宽限中</span> : <span className="tag">当期内</span>}
                </div>
                <div className="desc">
                  {dayText(t.start)} 当得 <GV v={t.loan} /> · {dayText(t.due)} 到期 · 最晚 {dayText(core.pawn.lastDay(t))}（还剩 {left} 天）· 到今天的综合费 <GV v={fee} />
                </div>
              </div>
              <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                <button
                  className="small primary"
                  onClick={() => {
                    const r = core.pawn.redeem(t.id, pay);
                    say(r.ok, r.ok ? r.message : r.error);
                  }}
                >
                  赎回 {formatG(t.loan + fee)}
                </button>
                <button
                  className="small"
                  disabled={t.start === today}
                  onClick={() => {
                    const r = core.pawn.renew(t.id, pay);
                    say(r.ok, r.ok ? r.message : r.error);
                  }}
                >
                  续当（付 {formatG(fee)}）
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {fb}
      {past.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th>当票</th>
              <th>物品</th>
              <th className="r">当得</th>
              <th className="r">付过的费</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            {past.map((t) => (
              <tr key={t.id}>
                <td>{t.id} 号</td>
                <td>{itemDef(t.item)?.name ?? t.item}</td>
                <td className="r num">{formatG(t.loan)}</td>
                <td className="r num">{formatG(t.feesPaid)}</td>
                <td className={t.status === 'forfeited' ? 'bad' : 'good'}>{t.status === 'forfeited' ? '绝当' : '已赎回'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SellTab(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const list = core.pawn.pledgeables();
  return (
    <div className="stack">
      <div className="note">卖断就是一手交钱一手交货，以后不能赎回。车按估价的八五折收。</div>
      {list.length === 0 && <div className="muted">你身上没有当铺收的东西。</div>}
      <div className="list">
        {list.map((p) => (
          <div className="item" key={p.id}>
            <Thumb id={p.id} />
            <div className="grow">
              <div className="title">{p.name}</div>
              <div className="desc">{p.refusal ? <span className="bad">{p.refusal}</span> : <>当铺出价 <GV v={core.pawn.buyPrice(p.id)} /></>}</div>
            </div>
            <button
              className="small danger"
              disabled={!!p.refusal}
              onClick={() => {
                const r = core.pawn.sell(p.id);
                say(r.ok, r.ok ? r.message : r.error);
              }}
            >
              卖 {formatG(core.pawn.buyPrice(p.id))}
            </button>
          </div>
        ))}
      </div>
      {fb}
    </div>
  );
}

function ShelfTab(): JSX.Element {
  const core = useCore();
  const [pay, setPay] = useState<Pay>('cash');
  const [fb, say] = useFeedback();
  const stock = core.pawn.stock();
  return (
    <div className="stack">
      <div className="muted" style={{ fontSize: 12 }}>玻璃柜里的二手货每周一换一批；绝当品卖掉之前一直摆着。</div>
      <PayToggle value={pay} onChange={setPay} />
      <div className="list">
        {stock.map((l) => {
          const d = itemDef(l.item);
          if (!d) return null;
          return (
            <div className="item" key={l.id}>
              <Thumb id={l.item} />
              <div className="grow">
                <div className="title">
                  {d.name} {l.from === 'player' && <span className="tag warn">你的旧物</span>}
                </div>
                <div className="desc">
                  {d.desc} {effectText(d)} · 新品 <GV v={d.price} />
                </div>
              </div>
              <button
                className="small primary"
                onClick={() => {
                  const r = core.pawn.buy(l.id, pay);
                  say(r.ok, r.ok ? r.message : r.error);
                }}
              >
                买 {formatG(l.price)}
              </button>
            </div>
          );
        })}
      </div>
      {fb}
    </div>
  );
}

// ------------------------------------------------------------------ the community kitchen

export function CharityModal(props: { tab: CharityTab }): JSX.Element {
  const core = useCore();
  const [tab, setTab] = useState<CharityTab>(props.tab);
  const serving = core.oldtown.serving();
  return (
    <Modal title="海员之家社区食堂" sub={serving ? '正在开饭' : '现在不是开饭时间 · 11:00–14:00、17:00–20:00'} wide>
      <Tabs<CharityTab>
        tabs={[
          { id: 'meal', label: '领饭' },
          { id: 'volunteer', label: '做义工' },
          { id: 'donate', label: '捐款' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ paddingTop: 12 }}>
        {tab === 'meal' && <MealTab />}
        {tab === 'volunteer' && <VolunteerTab />}
        {tab === 'donate' && <DonateTab />}
      </div>
    </Modal>
  );
}

function MealTab(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const ot = core.state.oldtown!;
  const meal = itemDef('kitchen_meal')!;
  const done = ot.mealDay === core.today();
  return (
    <div className="stack">
      <div className="item">
        <ItemIcon id="kitchen_meal" />
        <div className="grow">
          <div className="title">{meal.name}</div>
          <div className="desc">
            {meal.desc} {effectText(meal)}
          </div>
        </div>
        <button
          className="small primary"
          disabled={done || !core.oldtown.serving()}
          onClick={() => {
            const r = core.oldtown.freeMeal();
            say(r.ok, r.ok ? r.message : r.error);
          }}
        >
          {done ? '今天领过了' : '排队领一份'}
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        免费，每人每天一份。来吃饭的有退休的码头工人、刚下夜班的护工，也有带着孩子的人。
      </div>
      {core.oldtown.isRich() && <div className="note">你穿得很体面。在这里排队领饭，旁边的人会看见。</div>}
      {fb}
    </div>
  );
}

function VolunteerTab(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const ot = core.state.oldtown!;
  const done = ot.volunteerDay === core.today();
  return (
    <div className="stack">
      <div className="card">
        <h3>在窗口后面打饭</h3>
        <div style={{ fontSize: 12 }}>
          系上围裙，在开饭时间帮忙打 {VOLUNTEER_HOURS} 个小时的饭菜、收拾桌子。有点累，但心情会好起来，压力也会小一点；在场的人会记住你帮过忙。
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>你一共来帮过 {ot.volunteerShifts} 次忙。</div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button
          className="primary"
          disabled={done || !core.oldtown.serving()}
          onClick={() => {
            // two hours at the serving hatch, on the clock
            const g = core.oldtown.volunteerSteps(16);
            const first = g.next();
            if (first.done) return say(first.value.ok, first.value.ok ? first.value.message : first.value.error);
            store.closeModal();
            const show = (r: ActionResult) => (r.ok ? store.openModal({ type: 'eventResult', title: '帮完忙了', text: r.message }) : store.toast(r.error, 'warn'));
            if (store.world) void store.world.timelapse(g, show, 'ladle');
            else show(runSteps(g));
          }}
        >
          {done ? '今天帮过忙了' : `帮忙 ${VOLUNTEER_HOURS} 小时`}
        </button>
      </div>
      {fb}
    </div>
  );
}

function DonateTab(): JSX.Element {
  const core = useCore();
  const [amount, setAmount] = useState(200);
  const [pay, setPay] = useState<Pay>('card');
  const [fb, say] = useFeedback();
  const board = core.oldtown.donors();
  const give = (g: number) => {
    const r = core.oldtown.donate(G(g) as Money, pay);
    say(r.ok, r.ok ? r.message : r.error);
  };
  return (
    <div className="stack">
      <div className="row wrap" style={{ gap: 6 }}>
        {[50, 200, 1000, 10000].map((g) => (
          <button key={g} className="small" onClick={() => setAmount(g)}>
            {formatG(G(g))}
          </button>
        ))}
        <AmountInput value={amount} onChange={setAmount} />
        <span className="muted">G</span>
      </div>
      <PayToggle value={pay} onChange={setPay} />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="primary" disabled={amount < 10} onClick={() => give(amount)}>
          捐 {formatG(G(amount))}
        </button>
      </div>
      {fb}
      <h4 style={{ margin: '6px 0' }}>墙上的捐赠板 · 今年</h4>
      <table className="data">
        <tbody>
          {board.map((d, i) => (
            <tr key={i} className={d.player ? 'gold' : ''}>
              <td>{d.player ? <b>{d.name}（你）</b> : d.name}</td>
              <td className="dim">{d.note ?? ''}</td>
              <td className="r num">{formatG(d.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ the docks and the night market

export function LaborModal(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const o = core.oldtown.laborOffer();
  const ot = core.state.oldtown!;
  return (
    <Modal title="7 号码头 · 今日招工" sub="卸货 · 日结现金">
      <div className="stack">
        <div>
          工头叼着烟靠在木牌边：「卸一船货，{LABOR.hours} 个钟头，一小时 {formatG(LABOR.rate)}，礼拜六 {formatG(LABOR.saturdayRate)}。干完当场给钱。礼拜天不开工。」
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          每天 05:30–09:00 招人。要扛得动箱子：不能喝酒，精力和睡眠要够。会很累，饿得也快。
        </div>
        {o.ok ? (
          <div className="note good">
            今天收人。干完到手 <GV v={o.pay} />。
          </div>
        ) : (
          <div className="note">{o.reason}</div>
        )}
        {o.ok && o.clash && <div className="note bad">这会和你在{o.clash}冲突，不去上班会被记缺勤。</div>}
        {ot.laborShifts > 0 && (
          <div className="muted" style={{ fontSize: 12 }}>
            你在码头干过 {ot.laborShifts} 天，一共挣了 {formatG(ot.laborEarned)}。
          </div>
        )}
        {fb}
      </div>
      <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
        <button
          className="primary"
          disabled={!o.ok}
          onClick={() => {
            // eight hours of crates along the quay, on the clock
            const g = core.oldtown.laborSteps(24);
            const first = g.next();
            if (first.done) {
              if (first.value.ok) {
                store.closeModal();
                store.openModal({ type: 'eventResult', title: '下工了', text: first.value.message });
              } else say(false, first.value.error);
              return;
            }
            store.closeModal();
            const show = (r: ActionResult) => (r.ok ? store.openModal({ type: 'eventResult', title: '下工了', text: r.message }) : store.toast(r.error, 'warn'));
            if (store.world) void store.world.timelapse(g, show, 'haul');
            else show(runSteps(g));
          }}
        >
          报名开工（{LABOR.hours} 小时）
        </button>
      </div>
    </Modal>
  );
}

export function FortuneModal(): JSX.Element {
  const core = useCore();
  const [reading, setReading] = useState<string | null>(null);
  const [fb, say] = useFeedback();
  const done = core.state.oldtown!.fortuneDay === core.today();
  return (
    <Modal title="夜市 · 看相" sub={`${formatG(FORTUNE_PRICE)} · 只收现金`}>
      <div className="stack">
        {reading ? (
          <div className="card">{reading}</div>
        ) : (
          <div>一张铺着红布的小桌，桌上点着一根蜡烛，竹筒里插满了签。看相的老先生抬头看了你一眼，又低头翻他的旧书。</div>
        )}
        {fb}
      </div>
      {!reading && (
        <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          <button
            className="primary"
            disabled={done}
            onClick={() => {
              const r = core.oldtown.fortune();
              if (r.ok) setReading(r.message);
              else say(false, r.error);
            }}
          >
            {done ? '今晚已经看过了' : `坐下看看（${formatG(FORTUNE_PRICE)}）`}
          </button>
        </div>
      )}
    </Modal>
  );
}