import { useState } from 'react';
import { store, type BeachTab } from '../store';
import { useCore } from '../hooks';
import { GV, Modal, Tabs, useFeedback } from '../components';
import { PayToggle } from './OldTownModals';
import { formatG } from '../../core/money';
import { formatClock, toDate } from '../../core/calendar';
import { cardUrl } from '../../art/postcards';
import { NPC_BY_ID } from '../../data/npcs';
import {
  CHECKOUT,
  FARES,
  FERRY,
  FERRY_BOARD,
  FERRY_MINUTES,
  FISHING,
  LIFEGUARD,
  LOUNGER,
  ROOMS,
  SWIM_MINUTES,
  type CrossingReport,
  type FareClass,
  type RoomKind,
} from '../../systems/IsleSystem';

type Pay = 'cash' | 'card';

// ------------------------------------------------------------------ the ferry

export function FerryModal(): JSX.Element {
  const core = useCore();
  const [cls, setCls] = useState<FareClass>('deck');
  const [pay, setPay] = useState<Pay>('cash');
  const side = core.isle.side();
  const m = toDate(core.now()).minuteOfDay;
  const boarding = core.isle.boarding();
  const err = core.isle.boardCheck(cls, pay);
  const here = core.isle.ferryAt(side);
  const next = core.isle.nextFerry();
  return (
    <Modal title="灰港—白石湾渡轮" sub={side === 'city' ? '灰港渡轮码头 → 白石湾 · 单程 40 分钟' : '白石湾码头 → 灰港 · 单程 40 分钟'} wide className="theme-marina">
      <div className="stack">
        <div className="note">
          {side === 'city'
            ? '去海湾对面的白石湾：渔港、海滩、灯塔，岬角上有度假酒店。末班船 20:00 从白石湾开回来，错过了就只能在岛上过夜。'
            : `回灰港的末班船 ${formatClock(FERRY.isle.at(-1)!)} 开。错过了，海鸥民宿一晚 ${formatG(ROOMS.guesthouse.price)}，度假酒店 ${formatG(ROOMS.resort.price)} 起。`}
        </div>
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="title" style={{ marginBottom: 4 }}>
              {side === 'city' ? '灰港开' : '白石湾开'}
            </div>
            <div className="list">
              {FERRY[side].map((d) => {
                const gone = m > d + 2;
                const now = boarding === d;
                return (
                  <div className="item" key={d}>
                    <div className="grow">
                      <div className="title">
                        {formatClock(d)} {now ? <span className="tag good">检票中</span> : gone ? <span className="tag">已开</span> : <span className="tag">{formatClock(d - FERRY_BOARD)} 检票</span>}
                      </div>
                      <div className="desc">约 {formatClock(d + FERRY_MINUTES)} 到{side === 'city' ? '白石湾' : '灰港'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grow">
            <div className="title" style={{ marginBottom: 4 }}>
              {side === 'city' ? '白石湾开（回程）' : '灰港开（去程）'}
            </div>
            <div className="list">
              {FERRY[side === 'city' ? 'isle' : 'city'].map((d) => (
                <div className="item" key={d}>
                  <div className="grow">
                    <div className="title">{formatClock(d)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {here ? '渡轮靠在码头上。' : `渡轮不在这边，下一班 ${next >= (core.today() + 1) * 1440 ? '明天 ' : ''}${formatClock(toDate(next).minuteOfDay)} 开。`}
          {core.state.isle!.crossings > 0 && ` 你坐过 ${core.state.isle!.crossings} 次渡轮。`}
        </div>
        <div className="card stack">
          <div className="row" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>舱位</span>
            <button className={`small ${cls === 'deck' ? 'primary' : ''}`} onClick={() => setCls('deck')}>
              普通舱 {formatG(FARES.deck)}
            </button>
            <button className={`small ${cls === 'lounge' ? 'primary' : ''}`} onClick={() => setCls('lounge')}>
              头等舱 {formatG(FARES.lounge)}（含一杯咖啡）
            </button>
          </div>
          <PayToggle value={pay} onChange={setPay} />
          <div className="row between">
            <span className="muted" style={{ fontSize: 12 }}>
              {cls === 'deck' ? '甲板上的长椅，风大，和赶海的人、拎着鱼篓的老人坐在一起。' : '上层的头等舱：软座、空调、侍应端咖啡，窗外是整个海湾。'}
            </span>
            <button className="primary" disabled={!!err} onClick={() => void store.world?.ferry(cls, pay)}>
              买票上船
            </button>
          </div>
          {err && <div className="muted" style={{ fontSize: 12 }}>{err}</div>}
        </div>
      </div>
    </Modal>
  );
}

/** The crossing: one postcard of where you are going, in the light of the hour. */
export function CrossingModal(props: { report: CrossingReport }): JSX.Element {
  const core = useCore();
  const r = props.report;
  const toIsle = r.from === 'city';
  // the fellow passengers you know by name
  const known = r.aboard.filter((id) => core.state.social.rel[id]?.knowsName).map((id) => NPC_BY_ID[id].name);
  return (
    <Modal title={toIsle ? '去白石湾' : '回灰港'} sub={`${r.cls === 'lounge' ? '头等舱' : '普通舱'} · ${formatClock(r.depart)} 开船 · 40 分钟`} wide className="theme-marina" onClose={() => store.closeModal()}>
      <div className="stack">
        <div className="postcard">
          <img src={cardUrl({ seed: r.card.seed, scene: toIsle ? 'to_isle' : 'to_city', tod: r.card.tod, party: false, model: 'ferry', guests: r.aboard, boatsOut: r.card.boatsOut })} />
          <div className="cap">{r.card.caption}</div>
        </div>
        {known.length > 0 && <div>同船的还有{known.join('、')}。</div>}
        {r.waited > 0 && <div className="muted" style={{ fontSize: 12 }}>上船后等了 {r.waited} 分钟才开船。</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="primary" onClick={() => store.closeModal()}>
            下船
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ the beach

export function BeachModal(props: { tab: BeachTab }): JSX.Element {
  const core = useCore();
  const [tab, setTab] = useState<BeachTab>(props.tab);
  const [fb, say] = useFeedback();
  const guest = !core.isle.resortAccess();
  const resortSide = tab === 'pool' || tab === 'private';
  const done = (r: { ok: true; message: string } | { ok: false; error: string }) => {
    if (r.ok) {
      store.closeModal();
      store.openModal({ type: 'eventResult', title: resortSide ? '白石湾度假酒店' : '白石湾海滩', text: r.message });
    } else say(false, r.error);
  };
  return (
    <Modal title={resortSide ? '白石湾度假酒店 · 住客区' : '白石湾公共海滩'} sub={resortSide ? '泳池与住客海滩 7:00–22:00' : `救生员值班 ${formatClock(LIFEGUARD.from)}–${formatClock(LIFEGUARD.to)}`}>
      <Tabs<BeachTab>
        tabs={
          resortSide
            ? [
                { id: 'private', label: '住客海滩' },
                { id: 'pool', label: '无边泳池' },
              ]
            : [
                { id: 'lounger', label: '躺椅和遮阳伞' },
                { id: 'swim', label: '下海游泳' },
              ]
        }
        value={tab}
        onChange={setTab}
      />
      <div className="stack" style={{ paddingTop: 12 }}>
        {tab === 'lounger' && (
          <>
            <div>救生员亭边上摞着一排躺椅。「两个钟头 {formatG(LOUNGER.price)}，伞一起，只收现金。」</div>
            <button className="primary" disabled={!core.isle.lifeguardOn()} onClick={() => done(core.isle.rentLounger())}>
              租两个小时（现金 {formatG(LOUNGER.price)}，手上 <GV v={core.economy.balance('cash')} />）
            </button>
          </>
        )}
        {tab === 'swim' && (
          <>
            <div>浮标拉出了一片游泳区，救生员坐在高高的椅子上。喝了酒、太累，或者救生员下班了，就不能下水。</div>
            <button className="primary" onClick={() => done(core.isle.swim())}>
              游 {SWIM_MINUTES} 分钟
            </button>
          </>
        )}
        {tab === 'private' && (
          <>
            <div>住客海滩只有几张柚木躺椅，伞下备着热毛巾和饮料单。{guest ? '' : '侍应生看见你，客气地拦了一下。'}</div>
            <button className="primary" disabled={!guest} onClick={() => done(core.isle.guestBeach('beach'))}>
              躺两个小时
            </button>
          </>
        )}
        {tab === 'pool' && (
          <>
            <div>无边泳池的水面和海连在一起，池边有人在看书。</div>
            <button className="primary" disabled={!guest} onClick={() => done(core.isle.guestBeach('pool'))}>
              下水游一会儿
            </button>
          </>
        )}
        {resortSide && !guest && <div className="muted" style={{ fontSize: 12 }}>只对住客开放。入住手续在大堂前台办理。</div>}
        {fb}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ the fishing boats

export function FishingModal(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const o = core.isle.fishingOffer();
  const st = core.state.isle!;
  return (
    <Modal title="白石湾渔船 · 招工" sub="跟船出海 · 日结现金">
      <div className="stack">
        <div>
          船老大裹着橙色的雨衣，抽着烟：「跟船出去拉网，五点半开船，回来下午两点半。一天 {formatG(FISHING.pay)}，现钱，再给你一条鱼带回去。礼拜天不出海。」
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          每天 {formatClock(FISHING.from)}–{formatClock(FISHING.until)} 在码头招人，出海 {FISHING.hours} 小时。不能喝酒，要睡够、有力气。第一次出海多半会晕船。
        </div>
        {o.ok ? (
          <div className="note good">
            今天的船还缺人。回港后到手 <GV v={FISHING.pay} /> 和一条鱼（够在家做 3 顿饭）。
          </div>
        ) : (
          <div className="note">{o.reason}</div>
        )}
        {o.ok && o.clash && <div className="note bad">这会和你在{o.clash}冲突，不去上班会被记缺勤。</div>}
        {st.fishingTrips > 0 && (
          <div className="muted" style={{ fontSize: 12 }}>
            你跟船出过 {st.fishingTrips} 次海，一共挣了 {formatG(st.fishingEarned)}。
          </div>
        )}
        {fb}
      </div>
      <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
        <button
          className="primary"
          disabled={!o.ok}
          onClick={() => {
            const r = core.isle.goFishing();
            if (r.ok) {
              store.closeModal();
              store.openModal({ type: 'eventResult', title: '回港了', text: r.message });
            } else say(false, r.error);
          }}
        >
          上船（{formatClock(FISHING.back)} 回港）
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ the front desks

export function LodgingModal(props: { place: 'guesthouse' | 'resort' }): JSX.Element {
  const core = useCore();
  const [pay, setPay] = useState<Pay>(props.place === 'guesthouse' ? 'cash' : 'card');
  const [fb, say] = useFeedback();
  const room = core.isle.room();
  const kinds: RoomKind[] = props.place === 'guesthouse' ? ['guesthouse'] : ['resort', 'suite'];
  const resort = props.place === 'resort';
  return (
    <Modal title={resort ? '白石湾度假酒店 · 前台' : '海鸥民宿'} sub={`退房时间 ${formatClock(CHECKOUT)}`} className={resort ? 'theme-luxe' : 'theme-cafe'}>
      <div className="stack">
        <div>
          {resort
            ? '前台的姑娘穿着深蓝色的制服，抬头冲你笑：「欢迎来到白石湾。今晚还有海景房和灯塔套房。」'
            : '老板娘从一摞账本后面抬起头：「住一晚？后面那间小房间，一百二，现钱最好。」'}
        </div>
        {room ? (
          <div className="note good">
            你订了{ROOMS[room.kind].name}，可以住到 {toDate(room.until).day} 日 {formatClock(CHECKOUT)}。
          </div>
        ) : (
          <>
            <PayToggle value={pay} onChange={setPay} />
            <div className="list">
              {kinds.map((k) => (
                <div className="item" key={k}>
                  <div className="grow">
                    <div className="title">{ROOMS[k].name}</div>
                    <div className="desc">
                      <GV v={ROOMS[k].price} /> 一晚 · {ROOMS[k].desc}
                    </div>
                  </div>
                  <button
                    className="small primary"
                    onClick={() => {
                      const r = core.isle.checkIn(k, pay);
                      say(r.ok, r.ok ? r.message : r.error);
                    }}
                  >
                    入住
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="muted" style={{ fontSize: 12 }}>
          {resort ? '住客可以用泳池和住客海滩，每天早上 7:00–10:30 在餐厅吃自助早餐。' : '床在后面的小房间里。'}
        </div>
        {fb}
      </div>
    </Modal>
  );
}
