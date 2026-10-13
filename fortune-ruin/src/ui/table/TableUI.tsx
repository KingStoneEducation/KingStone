import { useEffect, useState } from 'react';
import { store } from '../store';
import { useCore, useKey } from '../hooks';
import { GV } from '../components';
import { TABLE_BY_ID, GAME_NAMES } from '../../casino/tables';
import * as BJE from '../../casino/BlackjackEngine';
import * as BACE from '../../casino/BaccaratEngine';
import * as RLE from '../../casino/RouletteEngine';
import * as PKE from '../../casino/PokerEngine';
import { basicStrategy } from '../../casino/blackjackStrategy';
import { beadPlate, bigRoad, shoeStats } from '../../casino/baccaratRoads';
import { CHIP_COLORS, CHIP_DENOMS } from '../../art/palette';
import { formatG, G, type Money } from '../../core/money';
import type { GameCore } from '../../core/GameCore';

const ACTION_NAMES: Record<BJE.BJAction, string> = { hit: '要牌', stand: '停牌', double: '加倍', split: '分牌', surrender: '投降' };
const SIDE_LABELS: Record<BACE.BacSide, string> = { player: '闲 1:1', banker: '庄 0.95:1', tie: '和', playerPair: '闲对 11:1', bankerPair: '庄对 11:1' };

function limits(tableId: string): { min: Money; max: Money } {
  const cfg = TABLE_BY_ID[tableId];
  const r = cfg.rules as Record<string, number>;
  if (cfg.game === 'poker') return { min: r.minBuyIn ?? G(40), max: r.maxBuyIn ?? G(200) };
  return { min: r.minBet ?? r.minTotal ?? G(1), max: r.maxBet ?? r.maxOutside ?? G(1000) };
}

export function rulesText(core: GameCore, tableId: string): string[] {
  const cfg = TABLE_BY_ID[tableId];
  const t = core.casino.table(tableId);
  if (t.game === 'blackjack') {
    const r = t.s.rules;
    return [
      `${r.decks} 副牌牌靴，切牌位置约 ${Math.round(r.penetration * 100)}%`,
      `Blackjack 赔 ${r.blackjackPays[0]}:${r.blackjackPays[1]}，其余赢局 1:1`,
      r.dealerHitsSoft17 ? '庄家软 17 必须要牌' : '庄家所有 17 点停牌（含软 17）',
      `加倍：${r.doubleOn === 'any' ? '任意两张' : r.doubleOn === '9-11' ? '仅 9/10/11 点' : '仅 10/11 点'}${r.doubleAfterSplit ? '，分牌后可加倍' : ''}`,
      `分牌最多 ${r.maxHands} 手${r.resplitAces ? '，A 可再分' : ''}，分开的 A 各只补一张`,
      r.insurance ? '庄家明牌为 A 时可买保险（下注额的一半，赔 2:1）' : '不提供保险',
      r.surrender === 'late' ? '可晚投降（庄家确认无 Blackjack 后，退回一半）' : '不可投降',
      '庄家明牌为 A 或 10 点时先检查是否 Blackjack',
      `限注 ${formatG(r.minBet)}–${formatG(r.maxBet)} · 理论庄家优势约 ${BJE.approxHouseEdge(r).toFixed(2)}%（完美基本策略）`,
    ];
  }
  if (t.game === 'baccarat') {
    const r = t.s.rules;
    return [
      `${r.decks} 副牌牌靴，开靴时按首张牌面烧牌`,
      `闲赢 1:1；庄赢 1:1 并抽 ${r.commissionBp / 100}% 佣金（即 0.95:1）`,
      `和局 ${r.tiePays}:1；开和局时庄、闲注退回`,
      r.pairs ? `闲对 / 庄对 ${r.pairPays}:1（前两张同点数）` : '不设对子注',
      '补牌完全按标准规则表执行，与下注无关',
      `限注 ${formatG(r.minBet)}–${formatG(r.maxBet)}，和局最高 ${formatG(r.tieMax)}`,
      `理论庄家优势：庄 ${BACE.BACCARAT_EDGES.banker}% · 闲 ${BACE.BACCARAT_EDGES.player}% · 和 ${BACE.BACCARAT_EDGES.tie}%`,
    ];
  }
  if (t.game === 'poker') {
    const r = t.s.rules;
    return [
      `无限注德州扑克现金桌，最多 ${r.seats} 人；牌手之间互相比牌，赌场不参与输赢`,
      `盲注 ${formatG(r.smallBlind)}/${formatG(r.bigBlind)}，按钮位每手顺时针轮转；两人单挑时按钮位下小盲、翻牌前先行动`,
      `买入 ${formatG(r.minBuyIn)}–${formatG(r.maxBuyIn)}；只能在两手之间补码，离桌时面前筹码全部带走`,
      '每人两张底牌，五张公共牌依次发出：翻牌 3 张、转牌 1 张、河牌 1 张，每次发牌前先烧一张',
      '最小加注 = 本轮上一次加注的幅度（至少一个大盲）；不足额的全下不会重新开放加注',
      '摊牌比最好的五张：同花顺 > 四条 > 葫芦 > 同花 > 顺子 > 三条 > 两对 > 一对 > 高牌；A-2-3-4-5 是最小的顺子，花色不分大小',
      '有人全下时按投入额分成主池和边池；平分底池时零头筹码归按钮左侧最近的赢家；无人跟注的下注退回',
      `抽水：看到翻牌的底池抽 ${r.rakeBp / 100}%，每手最多 ${formatG(r.rakeCap)}；翻牌前结束的底池不抽水`,
      '每手都用重新洗过的一副牌；NPC 牌手只能看到自己的底牌和桌面公开信息',
    ];
  }
  const r = (t as { game: 'roulette'; s: RLE.RouletteState }).s.rules;
  return [
    '欧式单零轮盘，37 个格子出现机会均等',
    '单号 35:1 · 分注 17:1 · 街注/三数 11:1 · 角注/前四 8:1 · 线注 5:1',
    '打注/列注 2:1 · 红黑/单双/大小 1:1',
    r.laPartage ? 'La Partage：开出 0 时，外围平注退回一半' : '开出 0 时外围注全输',
    `每局最低合计 ${formatG(r.minTotal)} · 内围单注最高 ${formatG(r.maxInside)} · 外围单注最高 ${formatG(r.maxOutside)}`,
    `理论庄家优势 ${r.laPartage ? '平注 1.35%，其余 2.70%' : '2.70%'}`,
    `${cfg.name}的转盘结果由公开的随机数决定，动画只是把这个结果演示出来`,
  ];
}

function ChipSelector(props: { tableId: string }): JSX.Element {
  const core = useCore();
  const { min, max } = limits(props.tableId);
  const avail = core.casino.availableChips();
  const denoms = [...CHIP_DENOMS].reverse().filter((d) => G(d) <= max && (G(d) >= Math.min(min, G(5)) || d >= min / 100 / 5));
  useEffect(() => {
    if (!denoms.includes(store.tableUi.chip)) {
      store.tableUi = { ...store.tableUi, chip: denoms.find((d) => G(d) >= min) ?? denoms[0] };
      store.notify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.tableId]);
  return (
    <div className="chip-row">
      {denoms.map((d) => {
        const c = CHIP_COLORS[d];
        return (
          <button
            key={d}
            className={`chip-btn ${store.tableUi.chip === d ? 'active' : ''}`}
            style={{ background: c.base, color: c.text, borderColor: c.edge, opacity: G(d) > avail ? 0.45 : 1 }}
            onClick={() => {
              store.tableUi = { ...store.tableUi, chip: d };
              store.notify();
            }}
            title={`${d} G 筹码`}
          >
            {d >= 1000 ? `${d / 1000}K` : d}
          </button>
        );
      })}
    </div>
  );
}

function BjActions(props: { tableId: string }): JSX.Element {
  const core = useCore();
  const api = store.tableApi;
  const s = core.casino.bj(props.tableId);
  const ui = store.tableUi;
  const seat = BJE.seatOf(s, 'player');
  const busy = ui.busy;
  if (s.phase === 'betting' || s.phase === 'settled') {
    const bet = seat >= 0 ? s.seats[seat].pendingBet : 0;
    const anyBet = BJE.canStartRound(s);
    return (
      <div className="action-row">
        <span className="muted" style={{ alignSelf: 'center' }}>
          本局下注 <GV v={bet} />
        </span>
        <button disabled={busy} onClick={() => api?.bjAddBet?.()}>
          ＋{store.tableUi.chip} G
        </button>
        <button disabled={busy || bet === 0} onClick={() => api?.clearBets()}>
          清除
        </button>
        <button disabled={busy} onClick={() => api?.rebet()}>
          重复上局
        </button>
        <button className="primary" disabled={busy || !anyBet} onClick={() => api?.deal()} title={anyBet ? '' : '还没有人下注'}>
          {bet > 0 ? '发牌' : '观看一局'}
        </button>
        <button className="ghost" disabled={busy} onClick={() => api?.leave()}>
          离桌
        </button>
      </div>
    );
  }
  if (s.phase === 'insurance' && seat >= 0 && s.seats[seat].hands.length > 0 && !s.seats[seat].insuranceDecided) {
    const cost = BJE.insuranceCost(s, seat);
    return (
      <div className="action-row">
        <button disabled={busy} onClick={() => api?.bjInsurance?.(true)}>
          买保险（<GV v={cost} />）
        </button>
        <button className="primary" disabled={busy} onClick={() => api?.bjInsurance?.(false)}>
          不买
        </button>
        <span className="dim" style={{ alignSelf: 'center', fontSize: 12 }}>
          保险本身的庄家优势约 7%，基本策略建议不买
        </span>
      </div>
    );
  }
  const myTurn = core.casino.bjTurnOwner(props.tableId) === 'player';
  const legal = myTurn ? BJE.legalActions(s, seat) : [];
  let hint: string | null = null;
  if (myTurn && core.inventory.count('strategy_card') > 0 && s.dealer.cards[0] !== undefined) {
    const h = s.seats[seat].hands[s.seats[seat].active];
    if (h) hint = ACTION_NAMES[basicStrategy(h.cards, s.dealer.cards[0], legal, s.rules.dealerHitsSoft17)];
  }
  return (
    <div className="action-row">
      {(['hit', 'stand', 'double', 'split', 'surrender'] as BJE.BJAction[]).map((a) => (
        <button key={a} className={a === 'hit' || a === 'stand' ? 'primary' : ''} disabled={busy || !legal.includes(a)} onClick={() => api?.bjAct?.(a)}>
          {ACTION_NAMES[a]}
          {a === 'double' || a === 'split' ? <span style={{ fontSize: 11, opacity: 0.8 }}> +{formatG(BJE.extraStakeFor(s, seat, a) || 0)}</span> : null}
        </button>
      ))}
      {hint && (
        <span className="tag gold" style={{ alignSelf: 'center' }}>
          策略卡：{hint}
        </span>
      )}
      {!myTurn && <span className="muted" style={{ alignSelf: 'center' }}>等待其他玩家……</span>}
    </div>
  );
}

function BacActions(props: { tableId: string }): JSX.Element {
  const core = useCore();
  const api = store.tableApi;
  const s = core.casino.bac(props.tableId);
  const busy = store.tableUi.busy;
  const mine = { player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0 } as Record<BACE.BacSide, Money>;
  for (const b of s.bets) if (b.owner === 'player') mine[b.side] += b.amount;
  const total = Object.values(mine).reduce((a, b) => a + b, 0);
  return (
    <div className="action-row">
      {(['playerPair', 'player', 'tie', 'banker', 'bankerPair'] as BACE.BacSide[]).map((side) => (
        <button
          key={side}
          disabled={busy || s.phase === 'settled'}
          onClick={() => api?.bacBet?.(side)}
          style={side === 'player' ? { borderColor: '#5a8aff' } : side === 'banker' ? { borderColor: '#ff5a6a' } : side === 'tie' ? { borderColor: '#4ad07a' } : undefined}
        >
          {SIDE_LABELS[side]}
          {mine[side] > 0 && <div style={{ fontSize: 11, color: 'var(--gold-light)' }}>{formatG(mine[side])}</div>}
        </button>
      ))}
      <button disabled={busy || total === 0} onClick={() => api?.clearBets()}>
        清除
      </button>
      <button disabled={busy} onClick={() => api?.rebet()}>
        重复
      </button>
      <button className="primary" disabled={busy || s.bets.length === 0} onClick={() => api?.deal()}>
        {total > 0 ? `开牌（${formatG(total)}）` : '观看一局'}
      </button>
      <button className="ghost" disabled={busy} onClick={() => api?.leave()}>
        离桌
      </button>
    </div>
  );
}

function RlActions(props: { tableId: string }): JSX.Element {
  const core = useCore();
  const api = store.tableApi;
  const s = core.casino.rl(props.tableId);
  const busy = store.tableUi.busy;
  const total = RLE.ownerTotal(s, 'player');
  return (
    <div className="action-row">
      <span className="muted" style={{ alignSelf: 'center' }}>
        点击桌面下注 · 本局合计 <GV v={total} />
      </span>
      <button disabled={busy || total === 0} onClick={() => api?.rlUndo?.()}>
        撤销
      </button>
      <button disabled={busy || total === 0} onClick={() => api?.clearBets()}>
        清除
      </button>
      <button disabled={busy} onClick={() => api?.rebet()}>
        重复上局
      </button>
      <button className="primary" disabled={busy || s.phase !== 'betting'} onClick={() => api?.deal()}>
        {total > 0 ? '转动轮盘' : '观看一局'}
      </button>
      <button className="ghost" disabled={busy} onClick={() => api?.leave()}>
        离桌
      </button>
    </div>
  );
}

function PkActions(props: { tableId: string }): JSX.Element {
  const core = useCore();
  const api = store.tableApi;
  const s = core.casino.pk(props.tableId);
  const ui = store.tableUi;
  const r = s.rules;
  const me = PKE.seatOfPoker(s, 'player');
  const seat = me >= 0 ? s.seats[me] : null;
  const busy = ui.busy;
  const live = PKE.handInProgress(s);
  const avail = core.casino.availableChips();
  const unit = r.smallBlind;
  const legal = seat && ui.phase === 'player' && !busy ? PKE.legalPokerActions(s, me) : null;
  const pot = s.seats.reduce((a, x) => a + x.committed, 0);
  const maxBuy = Math.min(r.maxBuyIn, Math.floor(avail / G(1)) * G(1));
  const [buyIn, setBuyIn] = useState(() => Math.max(r.minBuyIn, Math.min(maxBuy, Math.round(r.maxBuyIn / 2 / G(10)) * G(10))));
  const [raiseTo, setRaiseTo] = useState(0);
  const [auto, setAuto] = useState(false);
  const decisionKey = legal ? `${s.hand}:${s.phase}:${s.currentBet}:${legal.minRaiseTo}:${legal.maxRaiseTo}` : '';
  useEffect(() => {
    if (legal) setRaiseTo(legal.minRaiseTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionKey]);
  useEffect(() => {
    if (buyIn > maxBuy && maxBuy >= r.minBuyIn) setBuyIn(maxBuy);
  }, [maxBuy, buyIn, r.minBuyIn]);
  const snap = (v: number): number => (legal ? Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(v / unit) * unit)) : v);
  const potRaise = (f: number): number => snap(s.currentBet + f * (pot + (legal?.call ?? 0)));
  const doRaise = (to: number): void => {
    if (!legal) return;
    if (to >= legal.maxRaiseTo) api?.pkAct?.({ type: 'allin' });
    else api?.pkAct?.({ type: 'raise', to });
  };
  useKey(
    (e) => {
      if (store.modal || store.panel || !legal) return;
      if (e.code === 'KeyF') api?.pkAct?.({ type: 'fold' });
      else if (e.code === 'KeyC') api?.pkAct?.({ type: legal.check ? 'check' : 'call' });
      else if (e.code === 'KeyR' && legal.canRaise) doRaise(raiseTo);
      else if (e.code === 'KeyA') api?.pkAct?.({ type: 'allin' });
    },
    [decisionKey, raiseTo],
  );
  const leaveBtn = (
    <button className="ghost" disabled={!!seat && live && seat.inHand && !seat.folded} onClick={() => api?.leave()} title="打完这一手（或弃牌）后可以离桌，面前的筹码随身带走">
      离桌
    </button>
  );
  if (!seat) {
    const short = avail < r.minBuyIn;
    return (
      <div className="action-row" style={{ alignItems: 'center' }}>
        {short ? (
          <span className="error">筹码不足：最低买入 {formatG(r.minBuyIn)}，请离桌去兑换台换筹码。</span>
        ) : (
          <>
            <span className="muted">买入</span>
            <input type="range" min={r.minBuyIn} max={maxBuy} step={G(5)} value={Math.min(buyIn, maxBuy)} onChange={(e) => setBuyIn(Number(e.target.value))} onPointerUp={(e) => e.currentTarget.blur()} style={{ width: 150 }} />
            <span className="num" style={{ minWidth: 64, color: 'var(--gold-light)' }}>
              {formatG(Math.min(buyIn, maxBuy))}
            </span>
            <button className="primary" disabled={busy || live} onClick={() => api?.pkBuyIn?.(Math.min(buyIn, maxBuy))} title={live ? '这一手结束后可以入座' : ''}>
              买入入座
            </button>
          </>
        )}
        <button disabled={busy || live} onClick={() => api?.deal()}>
          看下一手
        </button>
        {leaveBtn}
      </div>
    );
  }
  if (legal) {
    const allInCall = !legal.check && legal.call >= seat.stack;
    return (
      <div className="action-row" style={{ alignItems: 'center' }}>
        <button onClick={() => api?.pkAct?.({ type: 'fold' })} title="快捷键 F">
          弃牌
        </button>
        {legal.check ? (
          <button className="primary" onClick={() => api?.pkAct?.({ type: 'check' })} title="快捷键 C">
            过牌
          </button>
        ) : (
          <button className="primary" onClick={() => api?.pkAct?.({ type: 'call' })} title="快捷键 C">
            {allInCall ? '全下跟注' : '跟注'} {formatG(legal.call)}
          </button>
        )}
        {legal.canRaise && (
          <>
            <input type="range" min={legal.minRaiseTo} max={legal.maxRaiseTo} step={unit} value={Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, raiseTo))} onChange={(e) => setRaiseTo(Number(e.target.value))} onPointerUp={(e) => e.currentTarget.blur()} style={{ width: 120 }} />
            {(
              [
                ['½池', 0.5],
                ['¾池', 0.75],
                ['1池', 1],
              ] as const
            ).map(([label, f]) => (
              <button key={label} className="small" style={{ minWidth: 0 }} onClick={() => setRaiseTo(potRaise(f))}>
                {label}
              </button>
            ))}
            <button className="primary" onClick={() => doRaise(snap(raiseTo))} title="快捷键 R">
              {raiseTo >= legal.maxRaiseTo ? '全下' : s.currentBet === 0 ? '下注' : '加注到'} {formatG(snap(raiseTo))}
            </button>
          </>
        )}
        {(legal.canRaise || allInCall) && !(legal.canRaise && raiseTo >= legal.maxRaiseTo) && (
          <button onClick={() => api?.pkAct?.({ type: 'allin' })} title="快捷键 A" style={{ borderColor: '#ff5a6a' }}>
            全下 {formatG(seat.bet + seat.stack)}
          </button>
        )}
      </div>
    );
  }
  const inHand = live && seat.inHand && !seat.folded;
  const topUp = Math.min(r.maxBuyIn - seat.stack, Math.floor(avail / G(1)) * G(1));
  return (
    <div className="action-row" style={{ alignItems: 'center' }}>
      <span className="muted">
        面前筹码 <GV v={seat.stack} />
      </span>
      {inHand ? (
        <span className="muted">{seat.allIn ? '你已全下，等待发完公共牌……' : '等待其他玩家行动……'}</span>
      ) : (
        <>
          <button disabled={busy || topUp <= 0 || (live && seat.inHand)} onClick={() => api?.pkTopUp?.(topUp)} title={`补到最高买入 ${formatG(r.maxBuyIn)}`}>
            补码 +{formatG(Math.max(0, topUp))}
          </button>
          <label className="row" style={{ gap: 4, fontSize: 12.5, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked);
                api?.pkAuto?.(e.target.checked);
              }}
            />
            自动发下一手
          </label>
          <button className="primary" disabled={busy || live || seat.stack <= 0} onClick={() => api?.deal()} title="快捷键 空格">
            {seat.folded && live ? '等这一手结束' : '下一手'}
          </button>
        </>
      )}
      {leaveBtn}
    </div>
  );
}

function PkHistory(props: { tableId: string }): JSX.Element {
  const core = useCore();
  const s = core.casino.pk(props.tableId);
  const h = s.history.slice(-5).reverse();
  const who = (id: string | null): string => {
    if (id === 'player') return '你';
    const p = id ? core.casino.patronById(id) : undefined;
    return p?.name ?? '已离座的牌手';
  };
  const players = s.seats.filter((x) => x.occupant).length;
  return (
    <div className="table-info" style={{ maxWidth: 260 }}>
      <div className="row between" style={{ fontSize: 12 }}>
        <span>最近几手</span>
        <span className="dim">在座 {players}/{s.seats.length}</span>
      </div>
      {h.length === 0 && <div className="dim" style={{ fontSize: 12 }}>—</div>}
      {h.map((e) => (
        <div key={e.hand} style={{ fontSize: 11.5, lineHeight: 1.5 }} className="muted">
          #{e.hand} 底池 {formatG(e.pot, { compact: true })}：
          {e.winners.map((w, i) => (
            <span key={i} style={{ color: w.who === 'player' ? 'var(--gold-light)' : undefined }}>
              {i > 0 ? '、' : ''}
              {who(w.who)} {formatG(w.amount, { compact: true })}
              {w.name ? `（${w.name}）` : ''}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function BacRoads(props: { tableId: string }): JSX.Element {
  const core = useCore();
  const h = core.casino.bac(props.tableId).history;
  const bead = beadPlate(h);
  const big = bigRoad(h);
  const st = shoeStats(h);
  const beadCols = Math.max(0, Math.floor((bead.length - 1) / 6) - 11);
  const bigMax = big.reduce((m, c) => Math.max(m, c.col), 0);
  const bigOff = Math.max(0, bigMax - 21);
  const col = (w: string) => (w === 'B' ? '#e8414f' : w === 'P' ? '#4a7dff' : '#3ac46a');
  return (
    <div className="table-info" style={{ maxWidth: 300 }}>
      <div className="row between" style={{ fontSize: 12 }}>
        <span>路单（只是记录，不预示下一局）</span>
        <span>
          <span style={{ color: '#e8414f' }}>庄 {st.B}</span> · <span style={{ color: '#4a7dff' }}>闲 {st.P}</span> · <span style={{ color: '#3ac46a' }}>和 {st.T}</span>
        </span>
      </div>
      <svg width={12 * 13} height={6 * 13} style={{ background: '#f4f1ea', borderRadius: 4, marginTop: 4 }}>
        {bead
          .filter((c) => c.col >= beadCols)
          .map((c, i) => (
            <g key={i}>
              <circle cx={(c.col - beadCols) * 13 + 6.5} cy={c.row * 13 + 6.5} r={5.5} fill={col(c.w)} />
              <text x={(c.col - beadCols) * 13 + 6.5} y={c.row * 13 + 9.5} fontSize={8} textAnchor="middle" fill="#fff">
                {c.total}
              </text>
            </g>
          ))}
      </svg>
      <svg width={22 * 9} height={6 * 9} style={{ background: '#f4f1ea', borderRadius: 4, marginTop: 4, display: 'block' }}>
        {big
          .filter((c) => c.col >= bigOff)
          .map((c, i) => (
            <g key={i}>
              <circle cx={(c.col - bigOff) * 9 + 4.5} cy={c.row * 9 + 4.5} r={3.4} fill="none" stroke={col(c.w)} strokeWidth={1.6} />
              {c.ties > 0 && <line x1={(c.col - bigOff) * 9 + 1.5} y1={c.row * 9 + 7.5} x2={(c.col - bigOff) * 9 + 7.5} y2={c.row * 9 + 1.5} stroke="#3ac46a" strokeWidth={1.4} />}
            </g>
          ))}
      </svg>
    </div>
  );
}

function RlHistory(props: { tableId: string }): JSX.Element {
  const core = useCore();
  const h = core.casino.rl(props.tableId).history.slice(-16).reverse();
  return (
    <div className="table-info">
      <div style={{ fontSize: 12, marginBottom: 4 }}>最近开出（每一局都是独立的）</div>
      <div className="row wrap" style={{ gap: 3 }}>
        {h.length === 0 && <span className="dim">—</span>}
        {h.map((n, i) => (
          <span
            key={i}
            className="num"
            style={{
              width: 22,
              textAlign: 'center',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              background: RLE.numberColor(n) === 'red' ? '#b8202f' : RLE.numberColor(n) === 'black' ? '#1b1a22' : '#1f8a4c',
              border: i === 0 ? '1px solid var(--gold-light)' : '1px solid transparent',
            }}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TableUI(): JSX.Element | null {
  const core = useCore();
  const t = store.table;
  const [showRules, setShowRules] = useState(false);
  useKey(
    (e) => {
      const api = store.tableApi;
      if (!t || !api || store.modal || store.panel) return;
      if (t.game === 'blackjack') {
        const map: Record<string, BJE.BJAction> = { KeyH: 'hit', KeyS: 'stand', KeyD: 'double', KeyP: 'split', KeyR: 'surrender' };
        if (map[e.code]) api.bjAct?.(map[e.code]);
        if (e.code === 'KeyB') api.bjAddBet?.();
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        api.deal();
        e.preventDefault();
      }
      if (e.code === 'Escape') api.leave();
    },
    [t?.tableId],
  );
  if (!t) return null;
  const cfg = TABLE_BY_ID[t.tableId];
  const ui = store.tableUi;
  const cs = core.state.casino;
  const session = cs.session;
  const rules = rulesText(core, t.tableId);
  const shoeInfo = (() => {
    const tb = core.casino.table(t.tableId);
    if (tb.game === 'roulette' || tb.game === 'poker') return null;
    const sh = tb.s.shoe;
    const left = sh.cards.length - sh.pos;
    return { left, pct: left / sh.cards.length, cut: sh.cutIndex / sh.cards.length };
  })();
  const lim = limits(t.tableId);
  return (
    <div className="table-ui">
      <div className="table-top">
        <div className="table-info" style={{ maxWidth: showRules ? 380 : 250 }}>
          <div className="row between">
            <span className="tname">{cfg.name}</span>
            <button className="small ghost" onClick={() => setShowRules((v) => !v)} title="查看本桌公开规则">
              {showRules ? '收起' : '规则'}
            </button>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {cfg.game === 'poker'
              ? `无限注 · 盲注 ${formatG(cfg.rules.smallBlind ?? 0)}/${formatG(cfg.rules.bigBlind ?? 0)} · 买入 ${formatG(lim.min)}–${formatG(lim.max)}`
              : `${GAME_NAMES[cfg.game]} · 限注 ${formatG(lim.min)}–${formatG(lim.max)}`}
          </div>
          {showRules && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, lineHeight: 1.55, color: 'var(--muted)' }}>
              {rules.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
          {shoeInfo && (
            <div style={{ marginTop: 5, fontSize: 11.5 }} className="muted">
              牌靴剩余 {shoeInfo.left} 张
              <div className="bar" style={{ marginTop: 3, position: 'relative' }}>
                <span style={{ width: `${shoeInfo.pct * 100}%`, background: '#8fb8ff' }} />
                <span style={{ position: 'absolute', left: `${(1 - shoeInfo.cut) * 100}%`, width: 2, background: '#ffe45c', top: 0, height: '100%' }} title="切牌位置" />
              </div>
            </div>
          )}
        </div>
        <div className="stack" style={{ alignItems: 'flex-end' }}>
          <div className="table-info">
            <div className="money" style={{ fontSize: 13 }}>
              <span className="k">可用筹码</span>
              <span className="v chips">{formatG(core.casino.availableChips())}</span>
              <span className="k">本次进场</span>
              <span className="v">
                <GV v={session?.net ?? 0} sign />
              </span>
              <span className="k">会员</span>
              <span className="v" style={{ fontWeight: 400 }}>
                {core.casino.tierInfo().name}
              </span>
            </div>
            {cfg.game !== 'poker' && core.casino.availableChips() < lim.min && <div className="error" style={{ marginTop: 4 }}>筹码不足：离桌去兑换台换筹码。</div>}
          </div>
          {t.game === 'baccarat' && <BacRoads tableId={t.tableId} />}
          {t.game === 'roulette' && <RlHistory tableId={t.tableId} />}
          {t.game === 'poker' && <PkHistory tableId={t.tableId} />}
        </div>
      </div>
      {ui.result && (
        <div key={ui.result.t} className="result-pop" style={{ color: ui.result.net > 0 ? 'var(--good)' : ui.result.net < 0 ? 'var(--bad)' : 'var(--text)' }}>
          {ui.result.net > 0 ? '+' : ''}
          {ui.result.net !== 0 ? formatG(ui.result.net) : '±0'}
          <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', color: 'var(--text)' }}>{ui.result.text}</div>
        </div>
      )}
      <div
        className="table-bar"
        title={
          t.game === 'blackjack'
            ? '快捷键：B 下注 · 空格 发牌 · H 要牌 · S 停牌 · D 加倍 · P 分牌 · R 投降 · Esc 离桌'
            : t.game === 'poker'
              ? '快捷键：F 弃牌 · C 过牌/跟注 · R 下注/加注 · A 全下 · 空格 下一手 · Esc 离桌'
              : '快捷键：空格 开局 · Esc 离桌'
        }
      >
        <div className="table-msg">{ui.message || '\u00a0'}</div>
        <div className="row wrap" style={{ gap: 10, justifyContent: 'center' }}>
          {t.game !== 'poker' && <ChipSelector tableId={t.tableId} />}
          {t.game === 'blackjack' && <BjActions tableId={t.tableId} />}
          {t.game === 'baccarat' && <BacActions tableId={t.tableId} />}
          {t.game === 'roulette' && <RlActions tableId={t.tableId} />}
          {t.game === 'poker' && <PkActions tableId={t.tableId} />}
        </div>
      </div>
    </div>
  );
}
