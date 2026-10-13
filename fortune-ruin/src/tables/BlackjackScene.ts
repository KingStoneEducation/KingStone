import Phaser from 'phaser';
import * as BJE from '../casino/BlackjackEngine';
import { TableScene } from './TableScene';
import { BJ, bjSeat, drawBlackjackTable, feltTexture, tableAtlas } from '../art/tableArt';
import type { Card } from '../casino/cards';
import { formatG, G, type Money } from '../core/money';
import { store } from '../ui/store';
import { WORLD_FONT } from '../world/textures';
import { smoothText } from '../world/CharacterSprite';
import { sfx } from '../audio/Audio';

const PLAYER = 'player';

interface HandView {
  cards: Phaser.GameObjects.Image[];
  values: Card[];
  stack: Phaser.GameObjects.Container | null;
  extra: Phaser.GameObjects.Container | null;
  label: Phaser.GameObjects.Text | null;
}

function emptyHand(): HandView {
  return { cards: [], values: [], stack: null, extra: null, label: null };
}

export class BlackjackScene extends TableScene {
  private hands: HandView[][] = [];
  private dealerCards: Phaser.GameObjects.Image[] = [];
  private dealerValues: Card[] = [];
  private dealerHidden = true;
  private dealerLabel: Phaser.GameObjects.Text | null = null;
  private pending: (Phaser.GameObjects.Container | null)[] = [];
  private insurance: (Phaser.GameObjects.Container | null)[] = [];
  private marker: Phaser.GameObjects.Image | null = null;
  private lastBet: Money = 0;

  constructor() {
    super('blackjack');
  }

  private get st(): BJE.BlackjackState {
    return this.core.casino.bj(this.tableId);
  }

  private get n(): number {
    return this.st.rules.seats;
  }

  protected feltKey(): string {
    const r = this.st.rules;
    const pay = r.blackjackPays[0] === 3 ? 'BLACKJACK PAYS 3 TO 2' : 'BLACKJACK PAYS 6 TO 5';
    const rule = r.dealerHitsSoft17 ? 'DEALER HITS SOFT 17' : 'DEALER MUST STAND ON ALL 17S';
    return feltTexture(this, `bj:${this.variant}:${r.seats}:${pay}:${rule}`, (ctx) => drawBlackjackTable(ctx, this.variant, r.seats, pay, rule));
  }

  protected plaquePos(seat: number): { x: number; y: number } {
    const s = bjSeat(seat, this.n);
    return { x: s.x, y: s.y + 17 };
  }

  // ------------------------------------------------------------------ geometry

  private seatAngle(i: number): number {
    return ((24 + (132 * i) / Math.max(1, this.n - 1)) * Math.PI) / 180;
  }

  private stackPos(seat: number, h: number, H: number): { x: number; y: number } {
    const s = bjSeat(seat, this.n);
    return { x: s.x + (H > 1 ? (h - (H - 1) / 2) * 16 : 0), y: s.y + 2 };
  }

  private cardPos(seat: number, h: number, H: number, j: number): { x: number; y: number } {
    const s = bjSeat(seat, this.n);
    const bx = s.x + (H > 1 ? (h - (H - 1) / 2) * 30 : 0);
    return { x: bx - 4 + j * 8, y: s.y - 34 - j * 3 };
  }

  private insurancePos(seat: number): { x: number; y: number } {
    const a = this.seatAngle(seat);
    return { x: BJ.cx + Math.cos(a) * 134, y: BJ.top + Math.sin(a) * 92 };
  }

  private dealerCardPos(j: number): { x: number; y: number } {
    return { x: BJ.dealerCards.x - 18 + j * 14, y: BJ.dealerCards.y };
  }

  private shoePos(): { x: number; y: number } {
    return { x: BJ.shoe.x, y: BJ.shoe.y };
  }

  // ------------------------------------------------------------------ build / sync

  protected build(): void {
    this.syncFromState();
    const s = this.st;
    if (s.phase === 'betting') {
      this.beginBetting(true);
    } else if (s.phase === 'settled') {
      void this.run(() => this.finishRound());
    } else {
      void this.run(() => this.advance());
    }
  }

  private clearTable(): void {
    for (const seat of this.hands) for (const h of seat) this.destroyHand(h);
    this.hands = [];
    for (const c of this.dealerCards) c.destroy();
    this.dealerCards = [];
    this.dealerValues = [];
    this.dealerLabel?.destroy();
    this.dealerLabel = null;
    for (const p of this.pending) p?.destroy();
    this.pending = [];
    for (const p of this.insurance) p?.destroy();
    this.insurance = [];
    this.marker?.destroy();
    this.marker = null;
  }

  private destroyHand(h: HandView): void {
    for (const c of h.cards) c.destroy();
    h.stack?.destroy();
    h.extra?.destroy();
    h.label?.destroy();
  }

  /** Draw everything exactly as the engine state says (no animation). */
  private syncFromState(): void {
    this.clearTable();
    const s = this.st;
    for (let i = 0; i < this.n; i++) {
      const seat = s.seats[i];
      this.setPlaque(i, seat.occupant);
      const views: HandView[] = [];
      seat.hands.forEach((h, hi) => {
        const v = emptyHand();
        h.cards.forEach((c, j) => {
          const p = this.cardPos(i, hi, seat.hands.length, j);
          v.cards.push(this.cardImage(c, p.x, p.y, 100 + j));
          v.values.push(c);
        });
        const sp = this.stackPos(i, hi, seat.hands.length);
        const base = h.doubled ? h.bet / 2 : h.bet;
        v.stack = this.chipStack(base, sp.x, sp.y, { mine: seat.occupant === PLAYER });
        if (h.doubled) v.extra = this.chipStack(base, sp.x + 8, sp.y + 3, { mine: seat.occupant === PLAYER, label: false });
        views.push(v);
        this.updateHandLabel(i, hi);
      });
      this.hands[i] = views;
      this.pending[i] = seat.pendingBet > 0 ? this.chipStack(seat.pendingBet, bjSeat(i, this.n).x, bjSeat(i, this.n).y + 2, { mine: seat.occupant === PLAYER }) : null;
      this.insurance[i] = seat.insurance > 0 ? this.chipStack(seat.insurance, this.insurancePos(i).x, this.insurancePos(i).y, { mine: seat.occupant === PLAYER }) : null;
    }
    this.dealerHidden = s.dealer.holeHidden;
    s.dealer.cards.forEach((c, j) => {
      const p = this.dealerCardPos(j);
      const hidden = j === 1 && s.dealer.holeHidden;
      this.dealerCards.push(this.cardImage(hidden ? null : c, p.x, p.y, 100 + j));
      this.dealerValues.push(c);
    });
    this.updateDealerLabel();
  }

  private handLabelText(seat: number, h: number): { text: string; color: string } {
    const v = this.hands[seat]?.[h];
    if (!v || v.values.length === 0) return { text: '', color: '#fff' };
    const hv = BJE.handValue(v.values);
    const eh = this.st.seats[seat].hands[h];
    const natural = v.values.length === 2 && hv.total === 21 && !eh?.fromSplit;
    if (natural) return { text: 'BJ', color: '#ffe45c' };
    if (hv.total > 21) return { text: `爆 ${hv.total}`, color: '#ff8a8a' };
    return { text: hv.soft ? `软${hv.total}` : String(hv.total), color: '#f4f1ea' };
  }

  private updateHandLabel(seat: number, h: number): void {
    const v = this.hands[seat]?.[h];
    if (!v) return;
    const { text, color } = this.handLabelText(seat, h);
    const H = this.hands[seat].length || this.st.seats[seat].hands.length;
    const last = this.cardPos(seat, h, H, Math.max(0, v.values.length - 1));
    if (!text) {
      v.label?.destroy();
      v.label = null;
      return;
    }
    if (!v.label) {
      v.label = this.add
        .text(last.x, last.y - 20, text, { fontFamily: WORLD_FONT, fontSize: '7px', color, backgroundColor: '#120d1fdd', padding: { x: 2, y: 0 }, resolution: 4 })
        .setOrigin(0.5, 1)
        .setDepth(150);
      smoothText(v.label);
    } else v.label.setText(text).setColor(color).setPosition(last.x, last.y - 20);
  }

  private updateDealerLabel(): void {
    if (this.dealerValues.length === 0) {
      this.dealerLabel?.destroy();
      this.dealerLabel = null;
      return;
    }
    const visible = this.dealerHidden ? this.dealerValues.filter((_, i) => i !== 1) : this.dealerValues;
    const hv = BJE.handValue(visible);
    const text = this.dealerHidden ? `${hv.soft ? '软' : ''}${hv.total} + ?` : hv.total > 21 ? `爆 ${hv.total}` : visible.length === 2 && hv.total === 21 ? 'BJ' : `${hv.soft && hv.total < 21 ? '软' : ''}${hv.total}`;
    const p = this.dealerCardPos(0);
    if (!this.dealerLabel) {
      this.dealerLabel = this.add
        .text(p.x - 20, p.y, text, { fontFamily: WORLD_FONT, fontSize: '7px', color: '#f4f1ea', backgroundColor: '#120d1fdd', padding: { x: 2, y: 0 }, resolution: 4 })
        .setOrigin(1, 0.5)
        .setDepth(150);
      smoothText(this.dealerLabel);
    } else this.dealerLabel.setText(text);
  }

  // ------------------------------------------------------------------ flow

  private async run(fn: () => Promise<void>): Promise<void> {
    this.setBusy(true);
    try {
      await fn();
    } finally {
      if (this.alive) this.setBusy(false);
    }
  }

  private beginBetting(initial: boolean): void {
    const s = this.st;
    const patronsBet = s.seats.some((x) => x.occupant && x.occupant !== PLAYER && x.pendingBet > 0);
    if (!patronsBet) {
      this.core.casino.bjPatronBets(this.tableId);
      // seat changes (patrons leaving / arriving)
      for (let i = 0; i < this.n; i++) this.setPlaque(i, this.st.seats[i].occupant);
      for (let i = 0; i < this.n; i++) this.refreshPending(i, !initial);
    }
    const shoe = this.st.shoe;
    const left = shoe.cards.length - shoe.pos;
    this.setPhase('betting');
    this.dealerSay(this.st.needsShuffle ? '这一靴牌用完了，下一局先洗牌。请下注。' : left < 80 ? '请下注。（牌靴快到切牌位置了）' : '请下注。', 2600);
  }

  private refreshPending(i: number, animate: boolean): void {
    const seat = this.st.seats[i];
    this.pending[i]?.destroy();
    this.pending[i] = null;
    if (seat.pendingBet <= 0) return;
    const p = bjSeat(i, this.n);
    const stack = this.chipStack(seat.pendingBet, p.x, p.y + 2, { mine: seat.occupant === PLAYER });
    this.pending[i] = stack;
    if (animate) {
      const from = this.plaquePos(i);
      stack.setPosition(from.x, from.y + 10).setAlpha(0.3);
      void this.tween(stack, { x: p.x, y: p.y + 2, alpha: 1 }, 260);
      sfx('chip');
    }
  }

  private async play(events: BJE.BJEvent[]): Promise<void> {
    for (const e of events) {
      if (!this.alive) return;
      switch (e.k) {
        case 'shuffle':
          this.dealerSay('洗牌中……', 1800);
          sfx('shuffle');
          await this.animShuffle();
          break;
        case 'burn': {
          const img = this.cardImage(null, this.shoePos().x, this.shoePos().y, 90);
          await this.tween(img, { x: BJ.discard.x, y: BJ.discard.y }, 300);
          img.destroy();
          break;
        }
        case 'deal':
          await this.animDeal(e.seat, e.hand, e.card);
          break;
        case 'dealerDeal':
          await this.animDealerDeal(e.card, e.hidden);
          break;
        case 'insuranceOffered':
          this.dealerSay('庄家明牌是 A。需要买保险吗？（保险赔率 2:1）', 3500);
          break;
        case 'peek': {
          const hole = this.dealerCards[1];
          if (hole) {
            await this.tween(hole, { y: hole.y - 4 }, 160);
            await this.wait(250);
            await this.tween(hole, { y: hole.y + 4 }, 160);
          }
          if (!e.dealerBlackjack) this.dealerSay('庄家没有 Blackjack，继续。', 1600);
          await this.wait(300);
          break;
        }
        case 'reveal': {
          const hole = this.dealerCards[1];
          this.dealerHidden = false;
          if (hole) await this.flip(hole, e.card);
          this.updateDealerLabel();
          if (BJE.dealerHasNatural(this.st)) this.dealerSay('庄家 Blackjack。', 1800);
          await this.wait(250);
          break;
        }
        case 'split':
          await this.animSplit(e.seat, e.hand);
          break;
        case 'double':
          await this.animDouble(e.seat, e.hand, e.extra);
          break;
        case 'surrender': {
          const v = this.hands[e.seat]?.[e.hand];
          if (v?.label) v.label.setText('投降').setColor('#c8c0d8');
          await this.wait(300);
          break;
        }
        case 'bust':
          this.updateHandLabel(e.seat, e.hand);
          if (this.st.seats[e.seat].occupant === PLAYER) sfx('deny');
          await this.wait(380);
          break;
        case 'turn':
          this.pointAt(e.seat, e.hand);
          break;
        case 'dealerTurn':
          this.pointAt(-1, 0);
          this.setPhase('dealer');
          break;
        case 'dealerStands':
          this.dealerSay(`庄家 ${e.total} 点，停牌。`, 1800);
          await this.wait(450);
          break;
        case 'dealerBust':
          this.dealerSay(`庄家爆牌（${e.total} 点）！`, 1800);
          await this.wait(500);
          break;
        case 'settle':
          await this.animSettle(e.seat, e.hand, e.result, e.bet, e.payout);
          break;
        case 'insuranceSettle':
          await this.animInsurance(e.seat, e.payout);
          break;
        case 'roundOver':
          break;
      }
    }
  }

  private async animShuffle(): Promise<void> {
    const imgs: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < 10; i++) imgs.push(this.cardImage(null, BJ.cx - 30 + (i % 2) * 60, 120, 120 + i).setAngle(i % 2 ? 8 : -8));
    for (let k = 0; k < 3; k++) {
      await Promise.all(imgs.map((im, i) => this.tween(im, { x: BJ.cx + (i % 2 ? -3 : 3), angle: 0 }, 220, 'Sine.easeInOut')));
      await Promise.all(imgs.map((im, i) => this.tween(im, { x: BJ.cx - 30 + (i % 2) * 60, angle: i % 2 ? 8 : -8 }, 220, 'Sine.easeInOut')));
    }
    await Promise.all(imgs.map((im) => this.tween(im, { x: this.shoePos().x, y: this.shoePos().y, angle: 0, alpha: 0.4 }, 300)));
    imgs.forEach((i) => i.destroy());
  }

  private ensureHand(seat: number, h: number): HandView {
    if (!this.hands[seat]) this.hands[seat] = [];
    while (this.hands[seat].length <= h) this.hands[seat].push(emptyHand());
    return this.hands[seat][h];
  }

  private async animDeal(seat: number, h: number, card: Card): Promise<void> {
    const v = this.ensureHand(seat, h);
    // the pre-deal bet becomes the hand's bet on the first card
    if (h === 0 && v.values.length === 0 && !v.stack) {
      const pend = this.pending[seat];
      const eh = this.st.seats[seat].hands[0];
      if (pend) {
        v.stack = pend;
        this.pending[seat] = null;
      } else if (eh) {
        const sp = this.stackPos(seat, 0, 1);
        v.stack = this.chipStack(eh.doubled ? eh.bet / 2 : eh.bet, sp.x, sp.y, { mine: this.st.seats[seat].occupant === PLAYER });
      }
    }
    const H = this.hands[seat].length;
    const p = this.cardPos(seat, h, H, v.values.length);
    const img = await this.dealCard(this.shoePos(), p.x, p.y, card, 100 + v.values.length);
    v.cards.push(img);
    v.values.push(card);
    this.updateHandLabel(seat, h);
    const hv = BJE.handValue(v.values);
    if (v.values.length === 2 && hv.total === 21 && this.st.seats[seat].occupant === PLAYER && !this.st.seats[seat].hands[h]?.fromSplit) sfx('blackjack');
  }

  private async animDealerDeal(card: Card, hidden: boolean): Promise<void> {
    const j = this.dealerValues.length;
    const p = this.dealerCardPos(j);
    if (j === 1) this.dealerHidden = hidden;
    const img = await this.dealCard(this.shoePos(), p.x, p.y, hidden ? null : card, 100 + j);
    this.dealerCards.push(img);
    this.dealerValues.push(card);
    this.updateDealerLabel();
  }

  private async animSplit(seat: number, h: number): Promise<void> {
    const views = this.hands[seat];
    const v = views[h];
    const moved = v.cards.pop()!;
    const val = v.values.pop()!;
    const nv = emptyHand();
    nv.cards.push(moved);
    nv.values.push(val);
    views.splice(h + 1, 0, nv);
    const mine = this.st.seats[seat].occupant === PLAYER;
    const H = views.length;
    const eh = this.st.seats[seat].hands[h + 1];
    nv.stack = this.chipStack(eh ? eh.bet : 0, bjSeat(seat, this.n).x, bjSeat(seat, this.n).y + 2, { mine });
    sfx('chips');
    // relayout every hand of the seat
    const moves: Promise<void>[] = [];
    views.forEach((hv, hi) => {
      hv.cards.forEach((c, j) => {
        const p = this.cardPos(seat, hi, H, j);
        moves.push(this.tween(c, { x: p.x, y: p.y }, 260));
        c.setDepth(100 + j);
      });
      const sp = this.stackPos(seat, hi, H);
      if (hv.stack) moves.push(this.tween(hv.stack, { x: sp.x, y: sp.y }, 260));
      if (hv.extra) moves.push(this.tween(hv.extra, { x: sp.x + 8, y: sp.y + 3 }, 260));
    });
    await Promise.all(moves);
    views.forEach((_, hi) => this.updateHandLabel(seat, hi));
  }

  private async animDouble(seat: number, h: number, extra: Money): Promise<void> {
    const v = this.ensureHand(seat, h);
    const sp = this.stackPos(seat, h, this.hands[seat].length);
    v.extra = this.chipStack(extra, sp.x + 8, sp.y + 3, { mine: this.st.seats[seat].occupant === PLAYER, label: false });
    sfx('chips');
    await this.wait(200);
  }

  private pointAt(seat: number, h: number): void {
    this.marker?.destroy();
    this.marker = null;
    if (seat < 0) return;
    const H = this.hands[seat]?.length ?? 1;
    const v = this.hands[seat]?.[h];
    const last = this.cardPos(seat, h, H, Math.max(0, (v?.values.length ?? 1) - 1));
    const ref = tableAtlas.ref('marker');
    this.marker = this.add.image(last.x, last.y - 30, ref.key, ref.frame).setDepth(160).setOrigin(0.5, 1);
    this.tweens.add({ targets: this.marker, y: last.y - 27, yoyo: true, repeat: -1, duration: 380 });
  }

  /** Patrons decide on insurance as soon as it is offered; show their stakes. */
  private showPatronInsurance(): void {
    this.st.seats.forEach((seat, i) => {
      if (seat.occupant && seat.occupant !== PLAYER && seat.insurance > 0 && !this.insurance[i]) {
        const p = this.insurancePos(i);
        this.insurance[i] = this.chipStack(seat.insurance, p.x, p.y);
      }
    });
  }

  private async animSettle(seat: number, h: number, result: BJE.HandResult, bet: Money, payout: Money): Promise<void> {
    const v = this.hands[seat]?.[h];
    if (!v) return;
    const mine = this.st.seats[seat].occupant === PLAYER;
    const sp = this.stackPos(seat, h, this.hands[seat].length);
    const rack = { x: BJ.cx, y: BJ.rack.y + 6 };
    const labels: Record<string, [string, string]> = {
      blackjack: ['Blackjack!', '#ffe45c'],
      win: ['赢', '#7dffa8'],
      push: ['平局', '#c8c0d8'],
      lose: ['输', '#ff8a8a'],
      bust: ['爆牌', '#ff8a8a'],
      surrender: ['投降', '#c8c0d8'],
    };
    const [text, color] = labels[result] ?? [result, '#fff'];
    const total = this.handLabelText(seat, h).text;
    if (v.label) v.label.setText(result === 'blackjack' || result === 'bust' || result === 'surrender' ? text : `${total} · ${text}`).setColor(color);
    if (payout > bet) {
      // the dealer pays from the rack
      const win = this.chipStack(payout - bet, rack.x, rack.y, { mine, label: false });
      await this.tween(win, { x: sp.x - 9, y: sp.y + 1 }, 320);
      v.stack?.destroy();
      v.extra?.destroy();
      win.destroy();
      v.stack = this.chipStack(payout, sp.x, sp.y, { mine });
      v.extra = null;
      if (mine) sfx('chips');
    } else if (payout === 0) {
      await Promise.all([this.slideAway(v.stack, rack.x, rack.y), this.slideAway(v.extra, rack.x, rack.y)]);
      v.stack = null;
      v.extra = null;
    } else if (payout < bet) {
      // surrender: half back
      v.extra?.destroy();
      v.extra = null;
      v.stack?.destroy();
      v.stack = this.chipStack(payout, sp.x, sp.y, { mine });
    }
    await this.wait(140);
  }

  private async animInsurance(seat: number, payout: Money): Promise<void> {
    const st = this.insurance[seat];
    if (!st) return;
    const p = this.insurancePos(seat);
    if (payout > 0) {
      st.destroy();
      this.insurance[seat] = this.chipStack(payout, p.x, p.y, { mine: this.st.seats[seat].occupant === PLAYER });
    } else {
      await this.slideAway(st, BJ.cx, BJ.rack.y + 6);
      this.insurance[seat] = null;
    }
  }

  /** Run patron decisions until it is the player's turn or the round is over. */
  private async advance(): Promise<void> {
    for (let guard = 0; guard < 80 && this.alive; guard++) {
      const s = this.st;
      if (s.phase === 'insurance') {
        this.showPatronInsurance();
        const i = BJE.seatOf(s, PLAYER);
        const needsPlayer = i >= 0 && s.seats[i].hands.length > 0 && !s.seats[i].insuranceDecided;
        if (needsPlayer) {
          this.setPhase('insurance');
          return;
        }
        const r = this.core.casino.bjInsurance(this.tableId, false);
        if (r.ok) await this.play(r.value);
        continue;
      }
      if (s.phase === 'player') {
        const owner = this.core.casino.bjTurnOwner(this.tableId);
        if (owner === PLAYER) {
          const cur = BJE.currentHand(s);
          if (cur) this.pointAt(cur.seat, cur.hand);
          this.setPhase('player', '轮到你了。');
          return;
        }
        if (owner) {
          this.setPhase('dealing');
          await this.wait(520 + Math.random() * 400);
          const r = this.core.casino.bjPatronAct(this.tableId);
          if (r.ok) await this.play(r.value);
          continue;
        }
      }
      if (s.phase === 'settled') {
        await this.finishRound();
        return;
      }
      if (s.phase === 'betting') {
        this.beginBetting(false);
        return;
      }
      return;
    }
  }

  private async finishRound(): Promise<void> {
    this.setPhase('settling');
    this.pointAt(-1, 0);
    const res = this.core.casino.collect(this.tableId);
    if (res) {
      const net = res.net;
      this.showResult(net, net > 0 ? `赢了 ${formatG(net)}` : net < 0 ? `输了 ${formatG(-net)}` : '平局，退回本金');
    }
    await this.wait(1500);
    // sweep cards to the discard tray
    const all: Phaser.GameObjects.Image[] = [...this.dealerCards];
    for (const seat of this.hands) for (const h of seat) all.push(...h.cards);
    await Promise.all(all.map((c, i) => this.tween(c, { x: BJ.discard.x, y: BJ.discard.y, angle: 90, alpha: 0.6, delay: i * 15 }, 340, 'Cubic.easeIn')));
    for (const seat of this.hands) for (const h of seat) {
      h.stack?.destroy();
      h.extra?.destroy();
    }
    this.clearTable();
    this.beginBetting(false);
    // the player's previous stake is kept for "rebet"
  }

  // ------------------------------------------------------------------ player API

  private playerSeat(): number {
    return BJE.seatOf(this.st, PLAYER);
  }

  bjAddBet(): void {
    if (this.busy || this.st.phase !== 'betting') return;
    const i = this.playerSeat();
    if (i < 0) return;
    const cur = this.st.seats[i].pendingBet;
    const r = this.core.casino.bjSetBet(this.tableId, cur + G(store.tableUi.chip));
    if (!r.ok) {
      store.toast(r.error, 'warn');
      sfx('deny');
      return;
    }
    sfx('chip');
    this.refreshPending(i, false);
    this.core.touch();
  }

  clearBets(): void {
    if (this.busy || this.st.phase !== 'betting') return;
    const i = this.playerSeat();
    if (i < 0) return;
    this.core.casino.bjSetBet(this.tableId, 0);
    this.refreshPending(i, false);
    this.core.touch();
  }

  rebet(): void {
    if (this.busy || this.st.phase !== 'betting' || this.lastBet <= 0) return;
    const i = this.playerSeat();
    const r = this.core.casino.bjSetBet(this.tableId, this.lastBet);
    if (!r.ok) {
      store.toast(r.error, 'warn');
      return;
    }
    sfx('chips');
    this.refreshPending(i, false);
    this.core.touch();
  }

  deal(): void {
    if (this.busy || this.st.phase !== 'betting') return;
    const i = this.playerSeat();
    const bet = i >= 0 ? this.st.seats[i].pendingBet : 0;
    const r = this.core.casino.bjDeal(this.tableId);
    if (!r.ok) {
      store.toast(r.error, 'warn');
      return;
    }
    if (bet > 0) this.lastBet = bet;
    store.tableUi = { ...store.tableUi, result: null };
    void this.run(async () => {
      this.setPhase('dealing', '发牌中……');
      await this.play(r.value);
      await this.advance();
    });
  }

  bjAct(action: BJE.BJAction): void {
    if (this.busy || this.core.casino.bjTurnOwner(this.tableId) !== PLAYER) return;
    const r = this.core.casino.bjPlayerAct(this.tableId, action);
    if (!r.ok) {
      store.toast(r.error, 'warn');
      return;
    }
    void this.run(async () => {
      this.setPhase('dealing');
      await this.play(r.value);
      await this.advance();
    });
  }

  bjInsurance(take: boolean): void {
    if (this.busy || this.st.phase !== 'insurance') return;
    const i = this.playerSeat();
    const cost = i >= 0 ? BJE.insuranceCost(this.st, i) : 0;
    const r = this.core.casino.bjInsurance(this.tableId, take);
    if (!r.ok) {
      store.toast(r.error, 'warn');
      return;
    }
    if (take && i >= 0) {
      const p = this.insurancePos(i);
      this.insurance[i] = this.chipStack(cost, p.x, p.y, { mine: true });
      sfx('chip');
    }
    void this.run(async () => {
      await this.play(r.value);
      await this.advance();
    });
  }

  leave(): void {
    if (this.busy) return;
    store.world?.leaveTable();
  }
}
