import { useEffect, useRef, useState } from 'react';
import { type AuctionTab } from '../store';
import { useCore } from '../hooks';
import { GV, Modal, Tabs, useFeedback } from '../components';
import { formatG } from '../../core/money';
import { WEEKDAY_NAMES, formatClock, toDate } from '../../core/calendar';
import type { Lot, Piece } from '../../core/state';
import { BUYER_PREMIUM_BP, GENRE_NAMES, KIND_NAMES, PADDLE_MIN, SALE_START, SELLER_COMMISSION_BP, TIER_NAMES } from '../../data/auction';
import { HOTEL, HOUSE_BID, withPremium, type AuctionEvent } from '../../systems/AuctionSystem';
import { pieceUrl } from '../../art/artworks';
import { sfx } from '../../audio/Audio';

const TICK_MS = 1100;

function Art(props: { piece: Piece; scale: number }): JSX.Element {
  // the framed picture is 54 × 42 art pixels
  return <img className="art" src={pieceUrl(props.piece)} width={54 * props.scale} height={42 * props.scale} alt={props.piece.title} />;
}

function kindLine(p: Piece): string {
  if (p.kind === 'painting') return `${KIND_NAMES.painting}（${GENRE_NAMES[p.genre ?? 'landscape']}）· ${TIER_NAMES[p.tier]}`;
  return KIND_NAMES[p.kind];
}

/** The Greyhaven Auction House: the live sale on Sunday, the catalogue, the player's collection. */
export function AuctionModal(props: { tab: AuctionTab; lot?: number }): JSX.Element {
  const core = useCore();
  const [tab, setTab] = useState<AuctionTab>(props.tab);
  const lots = core.auction.catalogue();
  const st = core.state.auction!;
  return (
    <Modal title="灰港拍卖行 · 艺术品与收藏品专场" sub={`本周日 ${formatClock(SALE_START)} · 灰港大酒店宴会厅 · ${lots.length} 件拍品${st.paddle ? ` · 你的号牌 ${st.paddle} 号` : ''}`} wide="x">
      <Tabs<AuctionTab>
        tabs={[
          { id: 'live', label: '拍卖会' },
          { id: 'catalogue', label: '图录' },
          { id: 'collection', label: `我的藏品${st.collection.length ? `（${st.collection.length}）` : ''}` },
          { id: 'results', label: '成交记录' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ paddingTop: 12 }}>
        {tab === 'live' && <LiveTab />}
        {tab === 'catalogue' && <CatalogueTab focus={props.lot} />}
        {tab === 'collection' && <CollectionTab />}
        {tab === 'results' && <ResultsTab />}
      </div>
    </Modal>
  );
}

function Register(): JSX.Element | null {
  const core = useCore();
  const [fb, say] = useFeedback();
  if (core.state.auction!.paddle) return null;
  return (
    <div className="item">
      <div className="grow">
        <div className="title">登记竞投</div>
        <div className="desc">需要银行存款至少 {formatG(PADDLE_MIN)}。成交后从银行账户付款，另加 {BUYER_PREMIUM_BP / 100}% 买家佣金。</div>
        {fb}
      </div>
      <button
        className="small primary"
        onClick={() => {
          const r = core.auction.register();
          say(r.ok, r.ok ? r.message : r.error);
        }}
      >
        领号牌
      </button>
    </div>
  );
}

/** What the auctioneer says. */
function callLine(e: AuctionEvent | null, paddle: number | null): string {
  if (!e) return '';
  switch (e.type) {
    case 'open':
      return `第 ${e.lot.no} 号拍品，${e.lot.piece.title}。起拍价 ${formatG(e.ask)}，有人出价吗？`;
    case 'bid':
      return e.who === 'player' ? `${paddle} 号，${formatG(e.amount)}，谢谢您！还有更高的吗？` : `${e.name}，${formatG(e.amount)}！`;
    case 'call':
      return `${formatG(e.amount)}，第${e.calls === 1 ? '一' : '二'}次……`;
    case 'sold':
      return `${formatG(e.hammer)}，第三次——成交！恭喜${e.player ? '您' : e.buyerName}。`;
    case 'passed':
      return '未达保留价，这件流拍。';
    default:
      return '';
  }
}

function LiveTab(): JSX.Element {
  const core = useCore();
  const a = core.auction;
  const st = core.state.auction!;
  const [event, setEvent] = useState<AuctionEvent | null>(null);
  /** the lot that was just hammered, shown until the next one is announced */
  const [done, setDone] = useState<Lot | null>(null);
  const [, redraw] = useState(0);
  const [fb, say] = useFeedback();
  const hold = useRef(0);
  const inRoom = core.state.world.location === HOTEL;
  const phase = a.phase();
  const running = phase === 'sale' && inRoom;
  const step = () => {
    if (hold.current > 0) {
      hold.current--;
      return;
    }
    const e = a.tick();
    if (e.type === 'idle') return;
    setEvent(e);
    if (e.type === 'open') setDone(null);
    if (e.type === 'bid') sfx('paddle');
    if (e.type === 'sold' || e.type === 'passed') {
      sfx('gavel');
      setDone(e.lot);
      hold.current = 2;
    }
    redraw((n) => n + 1);
  };
  useEffect(() => {
    if (!running) return;
    // the first beat at once: the lot on the block is announced
    step();
    const t = setInterval(step, TICK_MS);
    return () => clearInterval(t);
    // the auctioneer keeps his own pace
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  if (!running) {
    const now = toDate(core.now());
    const start = a.saleStart();
    const days = Math.max(0, Math.ceil((start - core.now()) / 1440));
    return (
      <div className="stack">
        {phase === 'over' ? (
          <div className="note">本周的拍卖已经结束。下周一会出新的图录，成交结果见「成交记录」。</div>
        ) : phase === 'sale' ? (
          <div className="note">拍卖正在灰港大酒店的宴会厅进行。到宴会厅的拍卖台前就能参加。</div>
        ) : (
          <div className="note">
            本周日 {formatClock(SALE_START)} 在灰港大酒店宴会厅开拍{days > 0 ? `（还有 ${days} 天，今天是${WEEKDAY_NAMES[now.weekday]}）` : ''}。{phase === 'preview' ? '预展正在宴会厅里进行，可以走近画架看拍品。' : '周六 10:00 起在宴会厅预展。'}
          </div>
        )}
        <Register />
        <div className="muted" style={{ fontSize: 12 }}>
          拍卖是英式公开竞价：拍卖师从起拍价开始叫价，每次加一档；没人再举牌，叫三次就落槌。场内有熟客，也有电话委托和不认识的买家，每个人心里都有自己的上限；出价低于保留价时，拍卖师会代委托人叫价，直到差一档到保留价。落槌价之外买家另付 {BUYER_PREMIUM_BP / 100}% 佣金；委托拍卖的东西成交后扣除 {SELLER_COMMISSION_BP / 100}% 佣金，低于保留价则流拍退回。
        </div>
      </div>
    );
  }

  const live = st.live;
  const lot = live ? st.lots[live.lot] : done;
  const chk = a.bidCheck();
  const leaderName = live?.leader ? live.log[live.log.length - 1]?.name ?? '' : '';
  return (
    <div className="stack">
      {!st.paddle && <Register />}
      {lot && done && !live ? (
        <div className="auction-block">
          <div className="auction-art">
            <Art piece={lot.piece} scale={4} />
          </div>
          <div className="grow stack" style={{ gap: 6 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              第 {lot.no} 件 / 共 {st.lots.length} 件
            </div>
            <h3 style={{ margin: 0 }}>{lot.piece.title}</h3>
            <div className="auction-bid">{lot.status === 'sold' ? <>成交 <GV v={lot.hammer ?? 0} /> <span className="muted">· {lot.buyer === 'player' ? '你' : lot.buyerName}</span></> : '流拍'}</div>
            <div className="auction-call">拍卖师：「{callLine(event, st.paddle)}」</div>
          </div>
        </div>
      ) : lot && live ? (
        <div className="auction-block">
          <div className="auction-art">
            <Art piece={lot.piece} scale={4} />
          </div>
          <div className="grow stack" style={{ gap: 6 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              第 {lot.no} 件 / 共 {st.lots.length} 件 {lot.consignor === 'player' && <span className="tag warn">你委托的</span>}
            </div>
            <h3 style={{ margin: 0 }}>{lot.piece.title}</h3>
            <div style={{ fontSize: 12 }}>
              {lot.piece.maker} · {lot.piece.year} 年 · {kindLine(lot.piece)}
            </div>
            <div style={{ fontSize: 12 }}>
              估价 <GV v={lot.low} /> – <GV v={lot.high} />
            </div>
            <div className="auction-bid">
              {live.leader ? (
                <>
                  当前 <GV v={live.current} /> <span className="muted">· {leaderName}</span>
                </>
              ) : (
                <>
                  起拍 <GV v={live.ask} />
                </>
              )}
            </div>
            <div className="auction-call">拍卖师：「{callLine(event, st.paddle) || `第 ${lot.no} 号拍品，${lot.piece.title}。`}」</div>
            <div className="row wrap" style={{ gap: 4 }}>
              {live.bidders.filter((b) => b.id !== HOUSE_BID).map((b) => (
                <span key={b.id} className={`tag ${live.leader === b.id ? 'gold' : ''}`}>
                  {b.name}
                </span>
              ))}
              {st.paddle && <span className={`tag ${live.leader === 'player' ? 'good' : ''}`}>你（{st.paddle} 号）</span>}
            </div>
          </div>
        </div>
      ) : (
        <div className="muted">拍卖师在整理下一件拍品……</div>
      )}
      {(live || done) && (
        <div className="auction-log">
          {(live?.log ?? []).slice(-6).reverse().map((l, i) => (
            <div key={i} className={l.who === 'player' ? 'good' : ''}>
              {l.name} · {formatG(l.amount)}
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
        <span className="muted" style={{ fontSize: 12 }}>{chk.ok ? `含佣金共 ${formatG(withPremium(chk.amount))} · 存款 ${formatG(core.economy.balance('bank'))}` : chk.reason}</span>
        <button
          className="small"
          disabled={!live}
          onClick={() => {
            // let the bidding run to the hammer without you
            for (let i = 0; i < 400; i++) {
              const e = a.tick();
              if (e.type === 'sold' || e.type === 'passed' || e.type === 'idle') {
                setEvent(e);
                if (e.type !== 'idle') {
                  sfx('gavel');
                  setDone(e.lot);
                }
                hold.current = 2;
                break;
              }
            }
            redraw((n) => n + 1);
          }}
        >
          不跟了，看结果
        </button>
        <button
          className="primary"
          disabled={!chk.ok}
          onClick={() => {
            const r = a.bid();
            if (!r.ok) say(false, r.error);
            else {
              sfx('paddle');
              setEvent({ type: 'bid', who: 'player', name: `${st.paddle} 号`, amount: chk.amount });
              hold.current = 0;
            }
            redraw((n) => n + 1);
          }}
        >
          举牌 {formatG(chk.amount)}
        </button>
      </div>
      {fb}
    </div>
  );
}

function statusLine(l: Lot): JSX.Element {
  if (l.status === 'sold') return <span className="good">成交 {formatG(l.hammer ?? 0)} · {l.buyer === 'player' ? '你' : l.buyerName}</span>;
  if (l.status === 'passed') return <span className="dim">流拍</span>;
  return <span className="muted">待拍</span>;
}

export function CatalogueTab(props: { focus?: number }): JSX.Element {
  const core = useCore();
  const lots = core.auction.catalogue();
  const order = props.focus !== undefined && lots[props.focus] ? [lots[props.focus], ...lots.filter((_, i) => i !== props.focus)] : lots;
  return (
    <div className="stack">
      <div className="muted" style={{ fontSize: 12 }}>
        估价是拍卖行给的参考范围。保留价不公开，低于保留价不成交。落槌价另加 {BUYER_PREMIUM_BP / 100}% 买家佣金。
      </div>
      <div className="list">
        {order.map((l) => (
          <div className={`item ${props.focus !== undefined && l === lots[props.focus] ? 'focus' : ''}`} key={l.no}>
            <Art piece={l.piece} scale={2} />
            <div className="grow">
              <div className="title">
                {l.no}. {l.piece.title} {l.consignor === 'player' && <span className="tag warn">你委托的</span>}
              </div>
              <div className="desc">
                {l.piece.maker} · {l.piece.year} 年 · {kindLine(l.piece)}
              </div>
              <div className="desc">
                估价 <GV v={l.low} /> – <GV v={l.high} /> · {statusLine(l)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CollectionTab(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const st = core.state.auction!;
  const week = core.auction.currentWeek();
  if (st.collection.length === 0) return <div className="muted">你还没有藏品。在周日的拍卖会上拍下的东西会出现在这里，并按拍卖行的参考市值计入净资产。</div>;
  const total = core.auction.value();
  const paid = st.collection.reduce((a, p) => a + p.paid, 0);
  return (
    <div className="stack">
      <div className="row" style={{ gap: 12 }}>
        <span>
          参考市值合计 <GV v={total} />
        </span>
        <span className="muted">
          买入合计 <GV v={paid} />
        </span>
        <span>
          <GV v={total - paid} sign />
        </span>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>参考市值每周一按市场重新评估。委托拍卖：周六预展开始前委托的进本周图录，之后的排到下周；成交后扣除 {SELLER_COMMISSION_BP / 100}% 佣金，流拍退回。</div>
      <div className="list">
        {st.collection.map((p) => (
          <div className="item" key={p.id}>
            <Art piece={p} scale={2} />
            <div className="grow">
              <div className="title">
                {p.title} {p.consigned !== undefined && <span className="tag warn">{p.consigned === week ? '本周委托拍卖' : '下周委托拍卖'}</span>}
              </div>
              <div className="desc">
                {p.maker} · {p.year} 年 · {kindLine(p)}
              </div>
              <div className="desc">
                买入 <GV v={p.paid} /> · 参考市值 <GV v={p.value} /> · <GV v={p.value - p.paid} sign />
              </div>
            </div>
            {p.consigned === undefined ? (
              <button
                className="small"
                onClick={() => {
                  const r = core.auction.consign(p.id);
                  say(r.ok, r.ok ? r.message : r.error);
                }}
              >
                委托拍卖
              </button>
            ) : (
              <button
                className="small"
                onClick={() => {
                  const r = core.auction.withdraw(p.id);
                  say(r.ok, r.ok ? r.message : r.error);
                }}
              >
                撤回委托
              </button>
            )}
          </div>
        ))}
      </div>
      {fb}
    </div>
  );
}

export function ResultsTab(): JSX.Element {
  const core = useCore();
  const results = [...core.state.auction!.results].reverse();
  if (results.length === 0) return <div className="muted">还没有成交记录。</div>;
  return (
    <div className="stack">
      {results.map((r) => (
        <table className="data" key={r.week}>
          <thead>
            <tr>
              <th>{r.week === core.auction.currentWeek() ? '本周' : `${core.auction.currentWeek() - r.week} 周前`}</th>
              <th className="r">落槌价</th>
              <th>买家</th>
            </tr>
          </thead>
          <tbody>
            {r.lots.map((l) => (
              <tr key={l.no}>
                <td>
                  {l.no}. {l.title}
                  {l.consignor === 'player' ? '（你委托的）' : ''}
                </td>
                <td className="r num">{l.status === 'sold' ? formatG(l.hammer ?? 0) : '流拍'}</td>
                <td>{l.status === 'sold' ? l.buyerName : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}
/** The auction house's website on the home computer: the catalogue, your pieces, past results. */
export function AuctionWeb(): JSX.Element {
  const [tab, setTab] = useState<Exclude<AuctionTab, 'live'>>('catalogue');
  return (
    <div className="stack">
      <Tabs<Exclude<AuctionTab, 'live'>>
        tabs={[
          { id: 'catalogue', label: '本周图录' },
          { id: 'collection', label: '我的藏品' },
          { id: 'results', label: '成交记录' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'catalogue' && <CatalogueTab />}
      {tab === 'collection' && <CollectionTab />}
      {tab === 'results' && <ResultsTab />}
      <div className="muted" style={{ fontSize: 12 }}>竞投要本人在周日下午到灰港大酒店的宴会厅举牌。</div>
    </div>
  );
}
