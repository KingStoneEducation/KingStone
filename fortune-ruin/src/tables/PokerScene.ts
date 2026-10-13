import Phaser from 'phaser';
import * as PK from '../casino/PokerEngine';
import { TableScene } from './TableScene';
import { drawPokerTable, feltTexture, PKT, pokerSeatGeom, tableAtlas, type PokerSeatGeom } from '../art/tableArt';
import { cardRank, cardSuit, type Card } from '../casino/cards';
import { formatG, type Money } from '../core/money';
import { store } from '../ui/store';
import { WORLD_FONT } from '../world/textures';
import { smoothText } from '../world/CharacterSprite';
import { sfx } from '../audio/Audio';

const PLAYER = 'player';
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const STREET_NAMES: Record<PK.Street, string> = { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌' };

interface SeatView {
  cards: Phaser.GameObjects.Image[];
  bet: Phaser.GameObjects.Container | null;
  stackText: Phaser.GameObjects.Text | null;
  action: Phaser.GameObjects.Text | null;
  handName: Phaser.GameObjects.Text | null;
}

const emptyView = (): SeatView => ({ cards: [], bet: null, stackText: null, action: null, handName: null });

const g = (m: Money) => formatG(m, { compact: true });

/** Short description of two hole cards, e.g. "A-K 同花" or "一对 9". */
export function holeLabel(hole: readonly Card[]): string {
  if (hole.length < 2) return '';
  const [a, b] = [...hole].sort((x, y) => PK.pokerRank(y) - PK.pokerRank(x));
  if (cardRank(a) === cardRank(b)) return `口袋对子 ${RANKS[cardRank(a)]}`;
  return `${RANKS[cardRank(a)]}-${RANKS[cardRank(b)]}${cardSuit(a) === cardSuit(b) ? ' 同花' : ''}`;
}

/**
 * No-limit hold'em table. The engine is the authority; this scene replays its
 * events with animation. Stacks, bets and the pot on screen follow the
 * events, so they are never ahead of what has been shown.
 */
export class PokerScene extends TableScene {
  private views: SeatView[] = [];
  private board: Phaser.GameObjects.Image[] = [];
  private pot: Phaser.GameObjects.Container | null = null;
  private potText: Phaser.GameObjects.Text | null = null;
  private button: Phaser.GameObjects.Image | null = null;
  private marker: Phaser.GameObjects.Image | null = null;
  private strength: Phaser.GameObjects.Text | null = null;
  private anchor = 0;
  private vStack: Money[] = [];
  private vBet: Money[] = [];
  private vPot: Money = 0;
  private running = false;
  private auto = false;
  private autoTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super('poker');
  }

  private get st(): PK.PokerState {
    return this.core.casino.pk(this.tableId);
  }

  private get n(): number {
    return this.st.seats.length;
  }

  protected feltKey(): string {
    const r = this.st.rules;
    const stakes = `BLINDS ${r.smallBlind / 100}/${r.bigBlind / 100}`;
    return feltTexture(this, `pk:${this.variant}:${stakes}`, (ctx) => drawPokerTable(ctx, this.variant, stakes));
  }

  /** Display position: the player's seat is always at the bottom left, then clockwise. */
  private disp(seat: number): number {
    return (seat - this.anchor + this.n) % this.n;
  }

  private geom(seat: number): PokerSeatGeom {
    return pokerSeatGeom(this.disp(seat));
  }

  protected plaquePos(seat: number): { x: number; y: number } {
    return this.geom(seat).plaque;
  }

  private mine(seat: number): boolean {
    return this.st.seats[seat]?.occupant === PLAYER;
  }

  private mySeat(): number {
    return PK.seatOfPoker(this.st, PLAYER);
  }

  private cardPos(seat: number, j: number, revealed = false): { x: number; y: number; scale: number; angle: number } {
    const c = this.geom(seat).cards;
    if (this.mine(seat) && this.disp(seat) === 0) return { x: c.x + (j - 0.5) * 27, y: c.y, scale: 1.15, angle: 0 };
    if (revealed) return { x: c.x + (j - 0.5) * 16, y: c.y, scale: 0.95, angle: 0 };
    return { x: c.x + (j - 0.5) * 9, y: c.y, scale: 0.78, angle: j === 0 ? -7 : 7 };
  }

  private boardPos(i: number): { x: number; y: number } {
    return { x: PKT.board.x + (i - 2) * PKT.board.gap, y: PKT.board.y };
  }

  // ------------------------------------------------------------------ build / sync

  protected build(): void {
    this.events.once('shutdown', () => {
      // the objects are destroyed with the scene; drop the references for the next visit
      this.views = [];
      this.board = [];
      this.pot = null;
      this.potText = null;
      this.button = null;
      this.marker = null;
      this.strength = null;
      this.autoTimer = null;
      this.auto = false;
      this.running = false;
    });
    const me = this.mySeat();
    this.anchor = me >= 0 ? me : 0;
    this.syncFromState();
    const s = this.st;
    if (PK.handInProgress(s)) void this.run(() => this.advance());
    else if (s.phase === 'settled') void this.run(() => this.finishHand());
    else this.betweenHands(true);
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    const gen = this.gen;
    this.running = true;
    this.setBusy(true);
    try {
      await fn();
    } finally {
      // a chain left over from an earlier visit must not touch the current one
      if (gen === this.gen) {
        this.running = false;
        if (this.alive) this.setBusy(false);
      }
    }
  }

  private destroyView(v: SeatView | undefined): void {
    if (!v) return;
    for (const c of v.cards) c.destroy();
    v.bet?.destroy();
    v.stackText?.destroy();
    v.action?.destroy();
    v.handName?.destroy();
  }

  private clearAll(): void {
    for (const v of this.views) this.destroyView(v);
    this.views = [];
    for (const c of this.board) c.destroy();
    this.board = [];
    this.pot?.destroy();
    this.pot = null;
    this.potText?.destroy();
    this.potText = null;
    this.button?.destroy();
    this.button = null;
    this.marker?.destroy();
    this.marker = null;
    this.strength?.destroy();
    this.strength = null;
  }

  /** Draw everything exactly as the engine state says (no animation). */
  private syncFromState(): void {
    this.clearAll();
    const s = this.st;
    const live = PK.handInProgress(s);
    for (let i = 0; i < this.n; i++) this.setPlaque(i, null);
    this.vPot = 0;
    for (let i = 0; i < this.n; i++) {
      const st = s.seats[i];
      const v = emptyView();
      this.views[i] = v;
      this.vStack[i] = st.stack;
      this.vBet[i] = live ? st.bet : 0;
      if (live) this.vPot += st.committed - st.bet;
      this.setPlaque(i, st.occupant);
      if (st.inHand && !st.folded && (live || s.phase === 'settled')) {
        const shown = s.phase === 'settled' && !!s.result?.showdown.some((h) => h.seat === i);
        st.hole.forEach((c, j) => {
          const p = this.cardPos(i, j, shown);
          v.cards.push(this.cardImage(this.mine(i) || shown ? c : null, p.x, p.y, 100 + j).setScale(p.scale).setAngle(p.angle));
        });
      }
      this.refreshBet(i);
      this.refreshStack(i);
      if (live && st.inHand && st.lastAction) this.setAction(i, st.lastAction, '#c8c0d8');
    }
    if (live || s.phase === 'settled') {
      s.board.forEach((c, i) => {
        const p = this.boardPos(i);
        this.board.push(this.cardImage(c, p.x, p.y, 90 + i));
      });
      if (s.hand > 0) this.placeButton(s.button, false);
    }
    this.refreshPot();
    this.refreshStrength();
    if (live && s.toAct >= 0) this.pointAt(s.toAct);
  }

  /** Plaques and stacks after patrons came or went between hands. */
  private syncSeats(): void {
    const s = this.st;
    for (let i = 0; i < this.n; i++) {
      const st = s.seats[i];
      this.setPlaque(i, st.occupant);
      if (!this.views[i]) this.views[i] = emptyView();
      this.vStack[i] = st.stack;
      this.refreshStack(i);
    }
  }

  // ------------------------------------------------------------------ small views

  private refreshBet(seat: number): void {
    const v = this.views[seat];
    if (!v) return;
    v.bet?.destroy();
    v.bet = null;
    if (this.vBet[seat] > 0) {
      const b = this.geom(seat).bet;
      v.bet = this.chipStack(this.vBet[seat], b.x, b.y, { mine: this.mine(seat) });
    }
  }

  private refreshStack(seat: number): void {
    const v = this.views[seat];
    const st = this.st.seats[seat];
    if (!v) return;
    if (!st.occupant) {
      v.stackText?.destroy();
      v.stackText = null;
      return;
    }
    const allIn = PK.handInProgress(this.st) && st.inHand && !st.folded && this.vStack[seat] <= 0;
    const text = allIn ? '全下' : g(this.vStack[seat]);
    const l = this.geom(seat).label;
    if (!v.stackText) {
      v.stackText = this.add
        .text(l.x, l.y, text, { fontFamily: WORLD_FONT, fontSize: '7px', color: this.mine(seat) ? '#ffe45c' : '#e8e2d0', stroke: '#120d1f', strokeThickness: 2, resolution: 4 })
        .setOrigin(0.5, 0)
        .setDepth(42);
      smoothText(v.stackText);
    } else v.stackText.setText(text).setPosition(l.x, l.y);
  }

  private setAction(seat: number, text: string | null, color = '#f4f1ea'): void {
    const v = this.views[seat];
    if (!v) return;
    if (!text) {
      v.action?.destroy();
      v.action = null;
      return;
    }
    const p = this.geom(seat).plaque;
    // keep labels on screen at the narrow ends of the table
    const ox = p.x < 60 ? 0 : p.x > 420 ? 1 : 0.5;
    const x = ox === 0 ? p.x - 10 : ox === 1 ? p.x + 10 : p.x;
    if (!v.action) {
      v.action = this.add
        .text(x, p.y - 2, text, { fontFamily: WORLD_FONT, fontSize: '7px', color, backgroundColor: '#120d1fd9', padding: { x: 3, y: 1 }, resolution: 4 })
        .setOrigin(ox, 1)
        .setDepth(160);
      smoothText(v.action);
    } else v.action.setText(text).setColor(color).setPosition(x, p.y - 2).setOrigin(ox, 1);
  }

  private setHandName(seat: number, text: string, win = false): void {
    const v = this.views[seat];
    if (!v) return;
    const c = this.cardPos(seat, 0, true);
    const y = c.y + 18;
    v.handName?.destroy();
    v.handName = this.add
      .text(this.geom(seat).cards.x, y, text, { fontFamily: WORLD_FONT, fontSize: '7px', color: win ? '#24170a' : '#f4f1ea', backgroundColor: win ? '#e8bf55' : '#120d1fd9', padding: { x: 3, y: 1 }, resolution: 4 })
      .setOrigin(0.5, 0)
      .setDepth(165);
    smoothText(v.handName);
  }

  private refreshPot(): void {
    this.pot?.destroy();
    this.pot = null;
    if (this.vPot > 0) this.pot = this.chipStack(this.vPot, PKT.pot.x, PKT.pot.y, { label: false, depth: 55 });
    const text = this.vPot > 0 ? `底池 ${g(this.vPot)}` : '';
    if (!this.potText) {
      this.potText = this.add
        .text(PKT.pot.x, PKT.pot.y - 14, text, { fontFamily: WORLD_FONT, fontSize: '8px', color: '#ffe9a8', stroke: '#120d1f', strokeThickness: 3, resolution: 4 })
        .setOrigin(0.5, 1)
        .setDepth(56);
      smoothText(this.potText);
    } else this.potText.setText(text);
  }

  /** The player's current hand, from their own cards and the board only. */
  private refreshStrength(): void {
    const s = this.st;
    const me = this.mySeat();
    const st = me >= 0 ? s.seats[me] : null;
    let text = '';
    if (st && st.inHand && !st.folded && st.hole.length === 2 && (PK.handInProgress(s) || s.phase === 'settled')) {
      text = s.board.length >= 3 ? `你的牌：${PK.describeBest([...st.hole, ...s.board]).detail}` : `你的牌：${holeLabel(st.hole)}`;
    }
    if (!text) {
      this.strength?.destroy();
      this.strength = null;
      return;
    }
    const c = this.geom(me).cards;
    if (!this.strength) {
      this.strength = this.add
        .text(c.x + 32, c.y + 4, text, { fontFamily: WORLD_FONT, fontSize: '7px', color: '#ffe9a8', backgroundColor: '#120d1fd9', padding: { x: 3, y: 1 }, resolution: 4 })
        .setOrigin(0, 0.5)
        .setDepth(166);
      smoothText(this.strength);
    } else this.strength.setText(text).setPosition(c.x + 32, c.y + 4);
  }

  private placeButton(seat: number, animate: boolean): void {
    const p = this.geom(seat).button;
    if (!this.button) {
      const ref = tableAtlas.ref('btn:D');
      this.button = this.add.image(p.x, p.y, ref.key, ref.frame).setDepth(58);
      return;
    }
    if (animate) void this.tween(this.button, { x: p.x, y: p.y }, 320);
    else this.button.setPosition(p.x, p.y);
  }

  private pointAt(seat: number): void {
    this.marker?.destroy();
    this.marker = null;
    if (seat < 0) return;
    const p = this.geom(seat).plaque;
    const ref = tableAtlas.ref('marker');
    const y = p.y - 14;
    this.marker = this.add.image(p.x, y, ref.key, ref.frame).setDepth(170).setOrigin(0.5, 1);
    this.tweens.add({ targets: this.marker, y: y + 3, yoyo: true, repeat: -1, duration: 380 });
  }

  private async flipTo(img: Phaser.GameObjects.Image, card: Card, ms = 160): Promise<void> {
    const sx = img.scaleY;
    await this.tween(img, { scaleX: 0 }, ms / 2, 'Sine.easeIn');
    this.setCardFace(img, card);
    await this.tween(img, { scaleX: sx }, ms / 2, 'Sine.easeOut');
  }

  /** Chips travel from one point to another, then the destination is redrawn. */
  private async moveChips(amount: Money, from: { x: number; y: number }, to: { x: number; y: number }, mine: boolean, ms = 260): Promise<void> {
    if (amount <= 0) return;
    const c = this.chipStack(amount, from.x, from.y, { mine, label: false, depth: 70 });
    await this.tween(c, { x: to.x, y: to.y }, ms);
    c.destroy();
  }

  // ------------------------------------------------------------------ event playback

  private async play(events: PK.PokerEvent[]): Promise<void> {
    const holes: { seat: number; cards: Card[] }[] = [];
    for (const e of events) {
      if (!this.alive) return;
      if (e.k !== 'hole' && holes.length) {
        await this.animDealHoles(holes.splice(0));
      }
      switch (e.k) {
        case 'handStart':
          this.onHandStart(e.button);
          break;
        case 'blind':
          await this.animBlind(e.seat, e.amount, e.kind);
          break;
        case 'hole':
          holes.push({ seat: e.seat, cards: e.cards });
          break;
        case 'turn':
          this.pointAt(e.seat);
          break;
        case 'action':
          await this.animAction(e);
          break;
        case 'street':
          await this.animStreet(e.street, e.cards);
          break;
        case 'uncalled':
          await this.animUncalled(e.seat, e.amount);
          break;
        case 'showdown':
          await this.animShowdown(e.hands);
          break;
        case 'rake':
          await this.animRake(e.amount);
          break;
        case 'win':
          await this.animWin(e.seat, e.amount, e.hand);
          break;
        case 'handOver':
          this.pointAt(-1);
          break;
      }
    }
    if (holes.length) await this.animDealHoles(holes);
  }

  private onHandStart(button: number): void {
    const s = this.st;
    this.syncSeats();
    for (let i = 0; i < this.n; i++) {
      const st = s.seats[i];
      this.vStack[i] = st.inHand ? st.startStack : st.stack;
      this.vBet[i] = 0;
      this.setAction(i, null);
      this.views[i].handName?.destroy();
      this.views[i].handName = null;
      this.refreshBet(i);
      this.refreshStack(i);
    }
    this.vPot = 0;
    this.refreshPot();
    this.placeButton(button, true);
    this.message(`第 ${s.hand} 手 · 按钮位：${this.seatName(button)}`);
  }

  private seatName(seat: number): string {
    const o = this.st.seats[seat]?.occupant;
    if (!o) return '空位';
    return this.seatInfo(o).name;
  }

  private async animBlind(seat: number, amount: Money, kind: 'sb' | 'bb'): Promise<void> {
    this.vStack[seat] -= amount;
    this.vBet[seat] += amount;
    this.setAction(seat, `${kind === 'sb' ? '小盲' : '大盲'} ${g(amount)}`, '#c8c0d8');
    this.refreshStack(seat);
    sfx('chip');
    await this.moveChips(amount, this.geom(seat).plaque, this.geom(seat).bet, this.mine(seat), 220);
    this.refreshBet(seat);
  }

  private async animDealHoles(holes: { seat: number; cards: Card[] }[]): Promise<void> {
    const s = this.st;
    // dealt one at a time, starting left of the button
    const order = holes.map((h) => h.seat).sort((a, b) => ((a - s.button - 1 + this.n) % this.n) - ((b - s.button - 1 + this.n) % this.n));
    const from = { x: PKT.muck.x, y: PKT.muck.y - 8 };
    for (let r = 0; r < 2; r++) {
      for (const seat of order) {
        if (!this.alive) return;
        // everyone's cards arrive face down; only the player's own are turned up below
        const p = this.cardPos(seat, r);
        const img = this.cardImage(null, from.x, from.y, 100 + r).setScale(0.5);
        sfx('card');
        await this.tween(img, { x: p.x, y: p.y, scale: p.scale, angle: { from: -25, to: p.angle } }, 150);
        this.views[seat].cards[r] = img;
      }
    }
    const me = this.mySeat();
    const mineHole = holes.find((h) => h.seat === me);
    if (mineHole) {
      await Promise.all(mineHole.cards.map((c, j) => this.flipTo(this.views[me].cards[j], c)));
      this.refreshStrength();
    }
  }

  private async animAction(e: Extract<PK.PokerEvent, { k: 'action' }>): Promise<void> {
    const seat = e.seat;
    // with chips already out (blinds count) it is a raise, otherwise the first bet of the street
    const opened = this.vBet.some((b) => b > 0);
    switch (e.action) {
      case 'fold':
        this.setAction(seat, '弃牌', '#8f87a3');
        await this.muck(seat);
        break;
      case 'check':
        this.setAction(seat, '过牌', '#c8f0d8');
        sfx('click');
        await this.wait(160);
        break;
      default: {
        const label = e.action === 'call' ? `跟注 ${g(e.add)}` : e.action === 'allin' ? `全下 ${g(e.to)}` : opened ? `加注到 ${g(e.to)}` : `下注 ${g(e.to)}`;
        this.setAction(seat, label, e.action === 'call' ? '#9fe0ff' : e.action === 'allin' ? '#ff8a8a' : '#ffc56a');
        this.vStack[seat] -= e.add;
        this.vBet[seat] += e.add;
        this.refreshStack(seat);
        sfx(e.add >= this.st.rules.bigBlind * 10 ? 'chips' : 'chip');
        await this.moveChips(e.add, this.geom(seat).plaque, this.geom(seat).bet, this.mine(seat));
        this.refreshBet(seat);
        if (e.action === 'allin' && !this.mine(seat)) this.dealerSay(`${this.seatName(seat)} 全下！`, 1600);
      }
    }
    if (this.mine(seat)) this.refreshStrength();
  }

  private async muck(seat: number): Promise<void> {
    const v = this.views[seat];
    const cards = v.cards.splice(0);
    await Promise.all(cards.map((c) => this.tween(c, { x: PKT.muck.x, y: PKT.muck.y, alpha: 0, angle: 80 }, 280, 'Cubic.easeIn')));
    for (const c of cards) c.destroy();
  }

  /** Bets go into the middle at the end of a betting round. */
  private async gather(): Promise<void> {
    const moves: Promise<void>[] = [];
    let total = 0;
    for (let i = 0; i < this.n; i++) {
      const amt = this.vBet[i];
      if (amt <= 0) continue;
      total += amt;
      const v = this.views[i];
      if (v.bet) {
        const b = v.bet;
        v.bet = null;
        moves.push(this.tween(b, { x: PKT.pot.x, y: PKT.pot.y, alpha: 0.4 }, 300, 'Cubic.easeIn').then(() => b.destroy()));
      }
      this.vBet[i] = 0;
    }
    if (total === 0) return;
    sfx('chips');
    await Promise.all(moves);
    this.vPot += total;
    this.refreshPot();
  }

  private async animStreet(street: PK.Street, cards: Card[]): Promise<void> {
    await this.gather();
    for (let i = 0; i < this.n; i++) {
      const st = this.st.seats[i];
      if (st.inHand && !st.folded && this.vStack[i] > 0) this.setAction(i, null);
    }
    // burn one, then turn the street over
    const burn = this.cardImage(null, PKT.muck.x, PKT.muck.y - 8, 95).setScale(0.6);
    await this.tween(burn, { x: PKT.muck.x + 26, y: PKT.muck.y, alpha: 0.2 }, 160);
    burn.destroy();
    this.message(`${STREET_NAMES[street]}`);
    for (const c of cards) {
      if (!this.alive) return;
      const i = this.board.length;
      const p = this.boardPos(i);
      const img = this.cardImage(null, PKT.muck.x, PKT.muck.y - 8, 90 + i).setScale(0.6);
      sfx('card');
      this.board.push(img);
      await this.tween(img, { x: p.x, y: p.y, scale: 1 }, 170);
      await this.flipTo(img, c, 150);
    }
    this.refreshStrength();
    await this.wait(260);
  }

  private async animUncalled(seat: number, amount: Money): Promise<void> {
    this.vBet[seat] -= amount;
    this.vStack[seat] += amount;
    const v = this.views[seat];
    v.bet?.destroy();
    v.bet = null;
    await this.moveChips(amount, this.geom(seat).bet, this.geom(seat).plaque, this.mine(seat), 240);
    this.refreshBet(seat);
    this.refreshStack(seat);
  }

  private async animShowdown(hands: { seat: number; cards: Card[]; name: string }[]): Promise<void> {
    await this.gather();
    this.pointAt(-1);
    this.dealerSay('摊牌。', 1500);
    for (const h of hands) {
      if (!this.alive) return;
      const v = this.views[h.seat];
      if (!this.mine(h.seat)) {
        await Promise.all(
          h.cards.map(async (c, j) => {
            const img = v.cards[j];
            if (!img) return;
            const p = this.cardPos(h.seat, j, true);
            await this.tween(img, { x: p.x, y: p.y, angle: 0, scaleY: p.scale, scaleX: p.scale }, 160);
            await this.flipTo(img, c, 180);
          }),
        );
        sfx('card');
      }
      this.setHandName(h.seat, h.name);
      await this.wait(420);
    }
  }

  private async animRake(amount: Money): Promise<void> {
    this.vPot -= amount;
    this.refreshPot();
    await this.moveChips(amount, PKT.pot, { x: PKT.cx, y: PKT.cy - PKT.ry + 8 }, false, 260);
    this.message(`赌场抽水 ${formatG(amount)}`);
  }

  private async animWin(seat: number, amount: Money, hand: string | null): Promise<void> {
    await this.gather();
    this.vPot = Math.max(0, this.vPot - amount);
    this.refreshPot();
    const mine = this.mine(seat);
    if (mine) sfx(amount >= this.st.rules.bigBlind * 25 ? 'bigwin' : 'chips');
    else sfx('chips');
    await this.moveChips(amount, PKT.pot, this.geom(seat).plaque, mine, 420);
    this.vStack[seat] += amount;
    this.refreshStack(seat);
    this.setAction(seat, `赢 ${g(amount)}`, '#ffe45c');
    if (hand) this.setHandName(seat, hand, true);
    this.dealerSay(`${this.seatName(seat)} 赢得 ${formatG(amount)}${hand ? `（${hand}）` : ''}。`, 2200);
    await this.wait(300);
  }

  // ------------------------------------------------------------------ flow

  /** Patrons act in turn until it is the player's decision or the hand is over. */
  private async advance(): Promise<void> {
    for (let guard = 0; guard < 300 && this.alive; guard++) {
      const s = this.st;
      if (PK.handInProgress(s)) {
        const owner = this.core.casino.pkTurnOwner(this.tableId);
        if (owner === PLAYER) {
          this.pointAt(s.toAct);
          const legal = PK.legalPokerActions(s, s.toAct);
          this.setPhase('player', legal?.check ? '轮到你：可以过牌或下注。' : `轮到你：跟注需要 ${formatG(legal?.call ?? 0)}。`);
          return;
        }
        this.setPhase('dealing');
        const me = this.mySeat();
        const away = me < 0 || !s.seats[me].inHand || s.seats[me].folded || s.seats[me].allIn;
        await this.wait((away ? 320 : 600) + Math.random() * (away ? 260 : 600));
        if (!this.alive) return;
        const r = this.core.casino.pkPatronAct(this.tableId);
        if (!r.ok) return;
        await this.play(r.value);
        continue;
      }
      if (s.phase === 'settled') {
        await this.finishHand();
        return;
      }
      this.betweenHands(false);
      return;
    }
  }

  private async finishHand(): Promise<void> {
    if (!this.alive) return;
    this.setPhase('settling');
    this.pointAt(-1);
    const s = this.st;
    const me = this.mySeat();
    const res = this.core.casino.collect(this.tableId);
    if (res && me >= 0) {
      const name = s.result?.showdown.find((h) => h.seat === me)?.name;
      const text = res.net > 0 ? `赢下底池${name ? `（${name}）` : ''}` : res.net < 0 ? `这一手输了 ${formatG(-res.net)}` : '平分底池';
      this.showResult(res.net, text);
    }
    await this.wait(res ? 2000 : 1300);
    if (!this.alive) return;
    // sweep the cards
    const all: Phaser.GameObjects.Image[] = [...this.board];
    for (const v of this.views) all.push(...v.cards);
    await Promise.all(all.map((c, i) => this.tween(c, { x: PKT.muck.x, y: PKT.muck.y, angle: 90, alpha: 0, delay: i * 12 }, 300, 'Cubic.easeIn')));
    for (const c of all) c.destroy();
    this.board = [];
    for (const v of this.views) {
      v.cards = [];
      v.handName?.destroy();
      v.handName = null;
    }
    for (let i = 0; i < this.n; i++) this.setAction(i, null);
    this.strength?.destroy();
    this.strength = null;
    // patrons come and go between hands
    this.core.casino.pkManage(this.tableId);
    this.syncSeats();
    this.vPot = 0;
    this.refreshPot();
    this.betweenHands(false);
  }

  private betweenHands(initial: boolean): void {
    const s = this.st;
    const me = this.mySeat();
    this.setPhase('betting');
    if (me < 0) this.dealerSay(initial ? '欢迎来到扑克室。选好买入金额就可以入座，也可以先看几手。' : '下一手马上开始，想入座的话现在可以买入。', 3200);
    else if (s.seats[me].stack <= 0) this.dealerSay('你面前的筹码打光了。补码后才能继续，或者离桌。', 3200);
    else this.dealerSay(initial ? '请坐。准备好了就开始下一手。' : '准备下一手。', 2000);
    this.scheduleAuto();
  }

  private scheduleAuto(): void {
    this.autoTimer?.remove();
    this.autoTimer = null;
    if (!this.auto || !this.alive) return;
    this.autoTimer = this.time.delayedCall(2600 / this.speedMul(), () => {
      this.autoTimer = null;
      if (store.modal || store.panel) return this.scheduleAuto();
      this.deal();
    });
  }

  // ------------------------------------------------------------------ player API

  deal(): void {
    if (this.running || PK.handInProgress(this.st)) return;
    this.autoTimer?.remove();
    this.autoTimer = null;
    const r = this.core.casino.pkDeal(this.tableId);
    if (!r.ok) {
      store.toast(r.error, 'warn');
      return;
    }
    store.tableUi = { ...store.tableUi, result: null };
    void this.run(async () => {
      this.setPhase('dealing', '发牌中……');
      await this.play(r.value);
      await this.advance();
    });
  }

  pkAct(action: PK.PokerAction): void {
    if (this.running || this.core.casino.pkTurnOwner(this.tableId) !== PLAYER) return;
    const r = this.core.casino.pkPlayerAct(this.tableId, action);
    if (!r.ok) {
      store.toast(r.error, 'warn');
      sfx('deny');
      return;
    }
    this.pointAt(-1);
    void this.run(async () => {
      this.setPhase('dealing');
      await this.play(r.value);
      await this.advance();
    });
  }

  pkBuyIn(amount: Money): void {
    if (this.running || PK.handInProgress(this.st)) {
      store.toast('请等这一手结束再入座', 'warn');
      return;
    }
    const r = this.core.casino.pkBuyIn(this.tableId, amount);
    if (!r.ok) {
      store.toast(r.error, 'warn');
      sfx('deny');
      return;
    }
    sfx('chips');
    this.anchor = r.value;
    this.syncFromState();
    this.betweenHands(true);
  }

  pkTopUp(amount: Money): void {
    const r = this.core.casino.pkTopUp(this.tableId, amount);
    if (!r.ok) {
      store.toast(r.error, 'warn');
      sfx('deny');
      return;
    }
    const me = this.mySeat();
    this.vStack[me] = this.st.seats[me].stack;
    this.refreshStack(me);
    sfx('chips');
    this.message(`补码 ${formatG(amount)}，面前筹码 ${formatG(this.st.seats[me].stack)}。`);
    this.core.touch();
  }

  pkAuto(on: boolean): void {
    this.auto = on;
    if (on && !this.running && !PK.handInProgress(this.st)) this.scheduleAuto();
    if (!on) {
      this.autoTimer?.remove();
      this.autoTimer = null;
    }
  }

  clearBets(): void {
    /* no layout bets in poker */
  }

  rebet(): void {
    /* no layout bets in poker */
  }

  leave(): void {
    const s = this.st;
    const me = this.mySeat();
    if (me >= 0 && PK.handInProgress(s) && s.seats[me].inHand && !s.seats[me].folded) {
      store.toast('请先打完这一手（或者弃牌）', 'warn');
      return;
    }
    this.autoTimer?.remove();
    this.autoTimer = null;
    store.world?.leaveTable();
  }
}
