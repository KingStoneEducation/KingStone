import { store } from '../store';
import { useCore } from '../hooks';
import { Modal, useFeedback } from '../components';
import { formatG } from '../../core/money';
import { formatClock, formatDate, MINUTES_PER_DAY, toDate } from '../../core/calendar';
import { LEVELS, TOURNEY, tchips, tourneyPrizes } from '../../casino/tournament';
import type { TourneyEntrant } from '../../core/state';

/** The poker room's board: the Sunday tournament's rules, who has put their name down, and how the last ones went. */
export function TourneyModal(): JSX.Element {
  const core = useCore();
  const [fb, say] = useFeedback();
  const t = core.tourney.current();
  const today = core.today();
  const tonight = t && (t.day === today || t.status === 'running') ? t : null;
  const prizes = tourneyPrizes(TOURNEY.seats, TOURNEY.buyIn);
  // the board lists everyone by name
  const name = (e: TourneyEntrant): string => (e.id === 'player' ? '你' : e.name);
  const next = (() => {
    for (let d = today; d < today + 8; d++) {
      const date = toDate(d * MINUTES_PER_DAY);
      if (date.weekday === TOURNEY.weekday && (d > today || toDate(core.now()).minuteOfDay < TOURNEY.starts)) return formatDate(date);
    }
    return '';
  })();
  const levels = LEVELS.slice(0, 5)
    .map(([sb, bb]) => `${sb}/${bb}`)
    .join('、');
  const log = (core.state.casino.tourneyLog ?? []).slice(-4).reverse();
  const run = (r: { ok: true; message?: string } | { ok: false; error: string }): void => (r.ok ? say(true, r.message ?? '好了') : say(false, r.error));
  const seat = tonight?.table && tonight.status === 'running' ? tonight.table.seats : [];
  return (
    <Modal title="周日扑克锦标赛" sub="无限注德州扑克 · 6 人单桌">
      <div className="stack">
        <div>
          告示牌上用粉笔写着：每周日 {formatClock(TOURNEY.opens)} 起在扑克室报名，{formatClock(TOURNEY.starts)} 准时开赛，在 1/2 桌打。买入 {formatG(TOURNEY.buyIn)}，服务费 {formatG(TOURNEY.fee)}。
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7 }} className="muted">
          <li>每人 {tchips(TOURNEY.startStack)} 锦标赛筹码。筹码只在比赛里用，不能兑换，也不能加买。</li>
          <li>
            盲注从 {LEVELS[0][0]}/{LEVELS[0][1]} 开始，每 {TOURNEY.handsPerLevel} 手升一级（{levels}……）。
          </li>
          <li>
            筹码输光就出局；最后两名分全部买入：冠军 {formatG(prizes[0])}，亚军 {formatG(prizes[1])}。服务费归赌场，奖金当场付现金。
          </li>
          <li>不在座位上时（离桌、离开赌场或者没来），你的牌会被自动弃掉，盲注照付。</li>
          <li>人不满时由散客补齐六个座位。</li>
        </ul>
        {!tonight && <div className="note">下一场：{next}。</div>}
        {tonight?.status === 'open' && (
          <div className="note">
            今晚的名单（{tonight.entrants.length}/{TOURNEY.seats}）：{tonight.entrants.length ? tonight.entrants.map(name).join('、') : '还没有人报名'}。{formatClock(TOURNEY.starts)} 时空着的座位由散客补上。
          </div>
        )}
        {tonight?.status === 'running' && (
          <div className="note">
            <div>{core.tourney.describe()}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {seat
                .filter((x) => x.occupant)
                .map((x) => {
                  const e = core.tourney.entrant(x.occupant!);
                  return `${e ? name(e) : '牌手'} ${tchips(x.stack)}`;
                })
                .join(' · ')}
            </div>
            {core.tourney.handsToNextLevel(tonight) > 0 && (
              <div className="muted" style={{ fontSize: 12 }}>
                再打 {core.tourney.handsToNextLevel(tonight)} 手盲注升级。
              </div>
            )}
          </div>
        )}
        {tonight?.status === 'done' && (
          <div className="note">
            今晚的比赛结束了：
            {tonight.entrants
              .filter((e) => e.place !== undefined)
              .sort((a, b) => a.place! - b.place!)
              .map((e) => `第 ${e.place} 名 ${name(e)}${e.prize ? `（${formatG(e.prize)}）` : ''}`)
              .join('，')}
            。
          </div>
        )}
        {log.length > 0 && (
          <div className="muted" style={{ fontSize: 12 }}>
            往期：
            {log.map((r, i) => (
              <div key={i}>
                {formatDate(toDate(r.day * MINUTES_PER_DAY))}：冠军 {r.winner}，亚军 {r.second}
                {r.playerPlace ? `；你第 ${r.playerPlace} 名${r.playerPrize ? `，奖金 ${formatG(r.playerPrize)}` : ''}` : ''}
              </div>
            ))}
          </div>
        )}
        {fb}
      </div>
      <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end', gap: 8 }}>
        {tonight?.status === 'open' && !core.tourney.registered() && (
          <button className="primary" onClick={() => run(core.tourney.register())}>
            报名（{formatG(TOURNEY.buyIn + TOURNEY.fee)}）
          </button>
        )}
        {tonight?.status === 'open' && core.tourney.registered() && <button onClick={() => run(core.tourney.unregister())}>取消报名（退款）</button>}
        {tonight?.status === 'running' && (
          <button
            className="primary"
            onClick={() => {
              store.closeModal();
              store.world?.openTournament();
            }}
          >
            {core.tourney.alive() ? '回到座位' : '去 1/2 桌旁观'}
          </button>
        )}
        <button className="ghost" onClick={() => store.closeModal()}>
          关闭
        </button>
      </div>
    </Modal>
  );
}
