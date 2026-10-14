import { useState } from 'react';
import { store, type MarinaTab } from '../store';
import { useCore } from '../hooks';
import { GV, Modal, Portrait, Tabs, useFeedback } from '../components';
import { PayToggle } from './OldTownModals';
import { formatG } from '../../core/money';
import { MINUTES_PER_DAY, formatClock, toDate } from '../../core/calendar';
import { NPC_BY_ID } from '../../data/npcs';
import { propImageUrl } from '../../art/props';
import { cardUrl } from '../../art/postcards';
import {
  ALONE_MINUTES,
  BOARD_BEFORE,
  BROKER_BP,
  CHARTER,
  CLUB_BOAT,
  CRUISES,
  CRUISE_MINUTES,
  WAIT,
  YACHTS,
  type TripReport,
  type YachtDef,
} from '../../systems/MarinaSystem';

type Pay = 'cash' | 'card';

const YACHT_ART: Record<YachtDef['id'], string> = { seagull: 'yacht_seagull', aurora: 'yacht_aurora' };

/** "今天 14:00" / "明天 10:00" */
function slotText(at: number, today: number): string {
  return `${Math.floor(at / MINUTES_PER_DAY) > today ? '明天' : '今天'} ${formatClock(toDate(at).minuteOfDay)}`;
}

function BoatPic(props: { id: string; scale?: number }): JSX.Element {
  return <img src={propImageUrl(props.id)} style={{ imageRendering: 'pixelated', display: 'block', transform: `scale(${props.scale ?? 2})`, transformOrigin: 'left top', marginRight: 'auto' }} />;
}

/** The boat's picture in a box sized for its scale. */
function Boat(props: { id: string; w: number; h: number; scale?: number }): JSX.Element {
  const s = props.scale ?? 2;
  return (
    <div style={{ width: props.w * s, height: props.h * s, flex: 'none' }}>
      <BoatPic id={props.id} scale={s} />
    </div>
  );
}

export function MarinaModal(props: { tab: MarinaTab }): JSX.Element {
  const core = useCore();
  const [tab, setTab] = useState<MarinaTab>(props.tab);
  const booking = core.state.marina!.booking;
  const own = core.marina.ownedDef();
  return (
    <Modal title="灰港游艇会" sub="Greyhaven Marina · 河滨步道东侧的浮动码头" wide="x" className="theme-marina">
      <Tabs<MarinaTab>
        tabs={[
          { id: 'cruise', label: '港湾游船' },
          { id: 'charter', label: `包船出海${booking?.kind === 'charter' ? '（已预约）' : ''}` },
          { id: 'own', label: own ? `我的游艇 · ${own.name}${booking?.kind === 'own' ? '（已预约）' : ''}` : '买一条游艇' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ paddingTop: 12 }}>
        {tab === 'cruise' && <CruiseTab />}
        {tab === 'charter' && <CharterTab />}
        {tab === 'own' && <OwnTab />}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ the harbour cruise

function CruiseTab(): JSX.Element {
  const core = useCore();
  const [pay, setPay] = useState<Pay>('cash');
  const m = toDate(core.now()).minuteOfDay;
  const boarding = core.marina.boardingCruise();
  const out = core.marina.tourBoatOut();
  const err = core.marina.boardCheck('cruise', pay);
  const storm = core.marina.stormy();
  return (
    <div className="stack">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <Boat id="tour_boat" w={72} h={38} />
        <div className="grow stack" style={{ gap: 6 }}>
          <div className="note">双层的港湾游船，绕灯塔一周再回来，全程 {CRUISE_MINUTES} 分钟。开船前 {BOARD_BEFORE} 分钟开始登船，船票在船边买，现金、银行卡都行。</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {storm ? '风暴天，游船全天停航，用双缆拴在 A 泊位。' : out ? '游船正在海上，回港以后才有下一班。' : boarding ? `${boarding.name}正在登船，${formatClock(boarding.at)} 开船。` : '游船靠在 A 泊位。'}
            {core.state.marina!.cruises > 0 && ` 你已经坐过 ${core.state.marina!.cruises} 次。`}
          </div>
        </div>
      </div>
      <div className="list">
        {CRUISES.map((c) => {
          const gone = m > c.at + 5;
          const now = boarding === c;
          return (
            <div className="item" key={c.at}>
              <div className="grow">
                <div className="title">
                  {formatClock(c.at)} · {c.name}{' '}
                  {storm ? <span className="tag bad">停航</span> : now ? <span className="tag good">登船中</span> : gone ? <span className="tag">已开走</span> : <span className="tag">{formatClock(c.at - BOARD_BEFORE)} 起登船</span>}
                </div>
                <div className="desc">
                  <GV v={c.price} /> · 约 {formatClock(c.at + CRUISE_MINUTES)} 回港{c.at >= 19 * 60 ? ' · 夜游：灰港的灯火和灯塔的光' : c.at >= 17 * 60 ? ' · 正赶上日落' : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {boarding && (
        <div className="card stack">
          <PayToggle value={pay} onChange={setPay} />
          <div className="row between">
            <span>{boarding.name} · <GV v={boarding.price} /></span>
            <button className="primary" disabled={!!err} onClick={() => void store.world?.sail('cruise', pay)}>
              买票上船
            </button>
          </div>
          {err && <div className="bad" style={{ fontSize: 12 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ friends aboard

/** Pick up to `max` friends; each one says how you stand with them. */
function GuestPicker(props: { max: number; value: string[]; onChange: (v: string[]) => void }): JSX.Element {
  const core = useCore();
  const can = core.marina.invitable();
  if (!can.length) return <div className="muted" style={{ fontSize: 12 }}>还没有熟到可以约出海的朋友。（认识、熟悉，并且对你有好感的人才会考虑。）</div>;
  return (
    <div className="choice-grid">
      {can.map((id) => {
        const on = props.value.includes(id);
        const def = NPC_BY_ID[id];
        const r = core.social.rel(id);
        return (
          <button
            key={id}
            className={`choice ${on ? 'active' : ''}`}
            disabled={!on && props.value.length >= props.max}
            onClick={() => props.onChange(on ? props.value.filter((g) => g !== id) : [...props.value, id])}
          >
            <div className="row" style={{ gap: 8 }}>
              <Portrait look={def.look} scale={1} crop="bust" />
              <div>
                <div className="t">{def.name}</div>
                <div className="d">{def.occupation} · 好感 {Math.round(r.affection)}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** The trip you have booked: when, who is coming, who is on the pier now. */
function BookingCard(): JSX.Element | null {
  const core = useCore();
  const [fb, say] = useFeedback();
  const b = core.state.marina!.booking;
  if (!b) return null;
  const here = core.marina.waiting();
  const late = core.marina.late();
  const err = core.marina.canSail();
  const boat = b.kind === 'own' ? core.marina.ownedDef()?.name ?? '' : CLUB_BOAT;
  return (
    <div className="card stack">
      <div className="row between">
        <div className="title">
          {boat} · {slotText(b.at, core.today())} 出发
        </div>
        <span className="tag">已付 {formatG(b.paid)}</span>
      </div>
      <div style={{ fontSize: 12 }}>
        {b.guests.length === 0 && '只有你一个人。'}
        {b.guests.map((id) => (
          <span key={id} style={{ marginRight: 12 }}>
            {NPC_BY_ID[id].name}
            {here.includes(id) ? <span className="good"> · 在码头等你</span> : <span className="muted"> · 还没到</span>}
          </span>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="primary" disabled={!!err} onClick={() => void store.world?.sail(b.kind)}>
          登船出海
        </button>
        <button
          className="small ghost"
          onClick={() => {
            const r = core.marina.cancel();
            say(r.ok, r.ok ? r.message : r.error);
          }}
        >
          取消这次出海
        </button>
      </div>
      {err && <div className="muted" style={{ fontSize: 12 }}>{err}</div>}
      {!err && late.length > 0 && (
        <div className="warn" style={{ fontSize: 12 }}>
          {late.map((g) => NPC_BY_ID[g].name).join('、')}还在路上。现在出发，他们就扑空了；等一等的话，客人最多在码头等到开船后 {WAIT} 分钟。
        </div>
      )}
      {fb}
    </div>
  );
}

type Answer = { id: string; name: string; yes: boolean; line: string };

/** What each friend said when asked. */
function Answers(props: { list: Answer[] }): JSX.Element | null {
  if (!props.list.length) return null;
  return (
    <div className="list">
      {props.list.map((a) => (
        <div className="item" key={a.id}>
          <Portrait look={NPC_BY_ID[a.id].look} scale={1} crop="bust" />
          <div className="grow">
            <div className="title">
              {a.name} {a.yes ? <span className="tag good">会来</span> : <span className="tag bad">来不了</span>}
            </div>
            <div className="desc">「{a.line}」</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BookForm(props: { kind: 'charter' | 'own'; max: number; cost: number; label: string; onBooked: (answers: Answer[]) => void }): JSX.Element {
  const core = useCore();
  const slots = core.marina.slots();
  const [at, setAt] = useState<number>(slots[0] ?? 0);
  const stormDays = [0, 1].filter((i) => core.weather.stormDay(core.today() + i));
  const [guests, setGuests] = useState<string[]>([]);
  const [pay, setPay] = useState<Pay>('card');
  const [fb, say] = useFeedback();
  return (
    <div className="stack">
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12 }}>出发</span>
        {slots.map((s) => (
          <button key={s} className={`small ${at === s ? 'primary' : ''}`} onClick={() => setAt(s)}>
            {slotText(s, core.today())}
          </button>
        ))}
      </div>
      {stormDays.length > 0 && <div className="note">气象台预报{stormDays.map((i) => (i === 0 ? '今天' : '明天')).join('和')}有风暴，游艇会那天不出船。</div>}
      <div className="muted" style={{ fontSize: 12 }}>
        约朋友一起（最多 {props.max} 位，已选 {guests.length} 位）。答应的人会在开船前到码头等你。
      </div>
      <GuestPicker max={props.max} value={guests} onChange={setGuests} />
      <PayToggle value={pay} onChange={setPay} />
      <div className="row between">
        <span>
          {props.label} · <GV v={props.cost} />
        </span>
        <button
          className="primary"
          disabled={!slots.length}
          onClick={() => {
            const r = core.marina.book(props.kind, at, guests, pay);
            if (!r.ok) {
              say(false, r.error);
              return;
            }
            props.onBooked(r.answers);
          }}
        >
          预约
        </button>
      </div>
      {fb}
    </div>
  );
}

// ------------------------------------------------------------------ charters

function CharterTab(): JSX.Element {
  const core = useCore();
  const b = core.state.marina!.booking;
  const [answers, setAnswers] = useState<Answer[]>([]);
  return (
    <div className="stack">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <Boat id="yacht_club" w={64} h={54} />
        <div className="grow stack" style={{ gap: 6 }}>
          <div className="title">
            {CLUB_BOAT} · Seagull 42 帆船（游艇会自有）
          </div>
          <div className="note">
            连船长和船员一起包 {CHARTER.minutes / 60} 小时，船上备香槟和小食。每天 10:00、14:00、18:00 三个出发时间，最多带 {CHARTER.guests} 位客人。三小时以前取消退 80%。
          </div>
          {core.state.marina!.charters > 0 && <div className="muted" style={{ fontSize: 12 }}>你包过 {core.state.marina!.charters} 次。</div>}
        </div>
      </div>
      {b && <Answers list={answers} />}
      {b ? <BookingCard /> : <BookForm kind="charter" max={CHARTER.guests} cost={CHARTER.price} label="包船出海" onBooked={setAnswers} />}
    </div>
  );
}

// ------------------------------------------------------------------ your own boat

function OwnTab(): JSX.Element {
  const core = useCore();
  const own = core.marina.ownedDef();
  return own ? <YourBoat y={own} /> : <ForSale />;
}

function ForSale(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const bank = core.economy.balance('bank');
  return (
    <div className="stack">
      <div className="note">
        游艇会代售的两条船，停在 C 泊位。买下以后每月 1 日收泊位和船员费；每次出海另付燃油。不想要了可以交给经纪人卖，能拿回买价的七成，经纪人抽 {BROKER_BP / 100}%。
      </div>
      <div className="list">
        {(Object.values(YACHTS) as YachtDef[]).map((y) => (
          <div className="item" key={y.id} style={{ alignItems: 'flex-start' }}>
            <Boat id={YACHT_ART[y.id]} w={y.id === 'aurora' ? 96 : 64} h={y.id === 'aurora' ? 44 : 54} scale={y.id === 'aurora' ? 1.5 : 2} />
            <div className="grow">
              <div className="title">
                {y.name} · {y.model}
              </div>
              <div className="desc">
                <GV v={y.price} /> · 泊位和船员每月 <GV v={y.monthly} /> · 每次出海燃油 <GV v={y.fuel} /> · 最多 {y.guests} 位客人
              </div>
            </div>
            <button
              className="small primary"
              disabled={bank < y.price}
              onClick={() => {
                const r = core.marina.buy(y.id);
                say(r.ok, r.ok ? r.message : r.error);
              }}
            >
              {bank < y.price ? '存款不够' : '买下'}
            </button>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>银行存款 <GV v={bank} />（游艇只能从银行账户付款）</div>
      {fb}
    </div>
  );
}

function YourBoat(props: { y: YachtDef }): JSX.Element {
  const core = useCore();
  const y = props.y;
  const [fb, say] = useFeedback();
  const [selling, setSelling] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const b = core.state.marina!.booking;
  const alone = core.marina.canGoAlone();
  const price = core.marina.sellPrice();
  return (
    <div className="stack">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <Boat id={YACHT_ART[y.id]} w={y.id === 'aurora' ? 96 : 64} h={y.id === 'aurora' ? 44 : 54} scale={y.id === 'aurora' ? 1.5 : 2} />
        <div className="grow stack" style={{ gap: 4 }}>
          <div className="title">
            {y.name} · {y.model}
          </div>
          <div className="desc" style={{ fontSize: 12 }}>
            停在 C 泊位 · 转售估值 <GV v={core.marina.value()} /> · 泊位和船员每月 <GV v={y.monthly} /> · 燃油每次 <GV v={y.fuel} />
          </div>
          {core.state.marina!.trips > 0 && <div className="muted" style={{ fontSize: 12 }}>出过 {core.state.marina!.trips} 次海。</div>}
        </div>
      </div>
      {b?.kind === 'own' ? (
        <>
          <Answers list={answers} />
          <BookingCard />
        </>
      ) : b ? (
        <div className="muted" style={{ fontSize: 12 }}>你已经约了一次{CLUB_BOAT}包船，回来再开自己的船吧。</div>
      ) : (
        <>
          <div className="card stack">
            <div className="row between">
              <span>
                现在就出海，一个人（{ALONE_MINUTES / 60} 小时，燃油 <GV v={y.fuel} />）
              </span>
              <button className="primary" disabled={!!alone} onClick={() => void store.world?.sail('own')}>
                上船
              </button>
            </div>
            {alone && <div className="muted" style={{ fontSize: 12 }}>{alone}</div>}
          </div>
          <div className="card">
            <div className="title" style={{ marginBottom: 6 }}>
              约朋友出海
            </div>
            <BookForm kind="own" max={y.guests} cost={y.fuel} label="燃油和餐饮" onBooked={setAnswers} />
          </div>
        </>
      )}
      <div className="row between">
        <span className="muted" style={{ fontSize: 12 }}>
          经纪人报价 <GV v={price} />（转售估值扣 {BROKER_BP / 100}% 佣金）
        </span>
        {selling ? (
          <span className="row" style={{ gap: 6 }}>
            <button
              className="small danger"
              onClick={() => {
                const r = core.marina.sell();
                say(r.ok, r.ok ? r.message : r.error);
                setSelling(false);
              }}
            >
              确定卖掉
            </button>
            <button className="small ghost" onClick={() => setSelling(false)}>
              再想想
            </button>
          </span>
        ) : (
          <button className="small" onClick={() => setSelling(true)}>
            交给经纪人卖
          </button>
        )}
      </div>
      {fb}
    </div>
  );
}

// ------------------------------------------------------------------ back from the water

/** The trip's postcards, one at a time, then who was aboard and what the day did for you. */
export function CruiseModal(props: { report: TripReport }): JSX.Element {
  const r = props.report;
  const [i, setI] = useState(0);
  const card = r.cards[i];
  const ids = r.guests.map((g) => g.id);
  const last = i === r.cards.length - 1;
  return (
    <Modal title={`出海归来 · ${r.boat}`} sub={r.summary} wide className="theme-marina" onClose={() => store.closeModal()}>
      <div className="stack">
        <div className="postcard">
          <img src={cardUrl({ seed: card.seed, scene: card.scene, tod: card.tod, party: card.party, model: r.model, guests: ids })} />
          <div className="cap">{card.caption}</div>
        </div>
        <div className="row between">
          <button className="small ghost" disabled={i === 0} onClick={() => setI(i - 1)}>
            上一张
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            {i + 1} / {r.cards.length}
          </span>
          <button className="small" disabled={last} onClick={() => setI(i + 1)}>
            下一张
          </button>
        </div>
        {r.guests.length > 0 && (
          <div className="list">
            {r.guests.map((g) => (
              <div className="item" key={g.id}>
                <Portrait look={NPC_BY_ID[g.id].look} scale={1} crop="bust" />
                <div className="grow">
                  <div className="title">{g.name}</div>
                  <div className="desc">{g.line.startsWith('（') ? g.line : `「${g.line}」`}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 12, fontSize: 12 }}>
          <span className="good">心情 +{r.effects.mood}</span>
          <span className="good">压力 {r.effects.stress}</span>
          {r.effects.social > 0 && <span className="good">社交 +{r.effects.social}</span>}
          <span className="muted">在海上 {Math.round(r.minutes)} 分钟</span>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="primary" onClick={() => store.closeModal()}>
            回到码头
          </button>
        </div>
      </div>
    </Modal>
  );
}
