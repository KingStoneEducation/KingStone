import * as PK from '../casino/PokerEngine';
import { PokerScene } from './PokerScene';
import type { SeatInfo } from './TableScene';
import { createPokerTable } from '../casino/PokerEngine';
import { TOURNEY_TABLE, levelRules, tchips } from '../casino/tournament';
import { NPC_BY_ID } from '../data/npcs';
import { formatG, type Money } from '../core/money';
import { anonLook } from '../world/textures';
import { store } from '../ui/store';

/** An empty table to show if the tournament is gone by the time the view opens. */
const EMPTY = createPokerTable(TOURNEY_TABLE, levelRules(0), 1);

/**
 * The Sunday tournament at the table: the same game and the same view as the cash tables, with its
 * own chips (plain numbers, not money), the dealer calling the levels, and the next hand dealt by
 * itself. The game is the tournament's (see TournamentSystem); nothing here moves any money.
 */
export class TournamentScene extends PokerScene {
  constructor() {
    super('tourney');
  }

  protected override get st(): PK.PokerState {
    return this.core.tourney.view() ?? EMPTY;
  }

  protected override fmt(m: Money): string {
    return tchips(m);
  }

  protected override fmtFull(m: Money): string {
    return `${tchips(m)} 筹码`;
  }

  protected override stakesLabel(): string {
    return 'SUNDAY TOURNAMENT';
  }

  protected override turnOwner(): string | null {
    return this.core.tourney.turnOwner();
  }

  protected override patronAct() {
    return this.core.tourney.npcAct();
  }

  protected override playerAct(action: PK.PokerAction) {
    return this.core.tourney.playerAct(action);
  }

  protected override collectHand(): { net: Money } | null {
    return this.core.tourney.handResult();
  }

  protected override manage(): void {
    this.core.tourney.manage();
  }

  protected override dealHand() {
    return this.core.tourney.deal();
  }

  protected override winLine(name: string, amount: Money, hand: string | null, mine: boolean): string {
    return `这一池 ${tchips(amount)} 筹码归${mine ? '您' : ` ${name}`}${hand ? `（${hand}）` : ''}。`;
  }

  override seatInfo(owner: string): SeatInfo {
    if (owner === 'player') return super.seatInfo(owner);
    // names as the tournament board lists them
    const e = this.core.tourney.entrant(owner);
    if (e?.npc) return { owner, look: NPC_BY_ID[e.npc].look, name: NPC_BY_ID[e.npc].name, isPlayer: false };
    return { owner, look: anonLook(e?.look ?? 1), name: e?.name ?? '牌手', isPlayer: false };
  }

  protected override build(): void {
    // a tournament deals the next hand by itself
    this.auto = true;
    super.build();
  }

  protected override betweenHands(initial: boolean): void {
    const t = this.core.tourney.current();
    if (!t || t.status === 'done') {
      this.setPhase('betting');
      const w = t?.entrants.find((e) => e.place === 1);
      const me = t?.entrants.find((e) => e.id === 'player');
      this.dealerSay(`锦标赛结束，冠军是${w?.id === 'player' ? '您' : (w?.name ?? '')}。${me?.prize ? `您获得第 ${me.place} 名，奖金 ${formatG(me.prize)} 已经付给您。` : me?.place ? `您是第 ${me.place} 名。` : ''}`, 8000);
      return;
    }
    const me = this.core.tourney.entrant('player');
    const [sb, bb] = this.core.tourney.blinds(t);
    if (me?.place) this.dealerSay(`您在第 ${me.place} 名出局。可以留下来看完，也可以离桌。`, 3000);
    else if (t.handsAtLevel === 0 && t.level > 0) this.dealerSay(`盲注升级：${sb}/${bb}。`, 2400);
    else if (initial) this.dealerSay(`欢迎参加周日锦标赛。现在是第 ${t.level + 1} 级，盲注 ${sb}/${bb}，祝您好运。`, 3000);
    this.setPhase('betting');
    this.scheduleAuto();
  }

  override pkBuyIn(): void {
    store.toast('锦标赛不能买入筹码', 'warn');
  }

  override pkTopUp(): void {
    store.toast('锦标赛不能补码', 'warn');
  }
}
