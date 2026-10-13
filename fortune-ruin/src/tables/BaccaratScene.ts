import Phaser from 'phaser';
import * as BAC from '../casino/BaccaratEngine';
import { TableScene } from './TableScene';
import { BAC as L, bjSeat, drawBaccaratTable, feltTexture } from '../art/tableArt';
import { cardLabel, type Card } from '../casino/cards';
import { formatG, G, type Money } from '../core/money';
import { store } from '../ui/store';
import { WORLD_FONT } from '../world/textures';
import { smoothText } from '../world/CharacterSprite';
import { sfx } from '../audio/Audio';

const PLAYER = 'player';
type Side = BAC.BacSide;
const SIDES: Side[] = ['player', 'banker', 'tie', 'playerPair', 'bankerPair'];
const SIDE_NAMES: Record<Side, string> = { player: '闲', banker: '庄', tie: '和', playerPair: '闲对', bankerPair: '庄对' };

export class BaccaratScene extends TableScene {
  private stacks = new Map<string, Phaser.GameObjects.Container>();
  private cards: { player: Phaser.GameObjects.Image[]; banker: Phaser.GameObjects.Image[] } = { player: [], banker: [] };
  private values: { player: Card[]; banker: Card[] } = { player: [], banker: [] };
  private totals: { player: Phaser.GameObjects.Text | null; banker: Phaser.GameObjects.Text | null } = { player: null, banker: null };
  private glow: Phaser.GameObjects.Rectangle | null = null;
  private lastBets: { side: Side; amount: Money }[] = [];

  constructor() {
    super('baccarat');
  }

  private get st(): BAC.BaccaratState {
    return this.core.casino.bac(this.tableId);
  }

  protected feltKey(): string {
    const r = this.st.rules;
    return feltTexture(this, `bac:${this.variant}:${r.tiePays}`, (ctx) => drawBaccaratTable(ctx, this.variant, `TIE PAYS ${r.tiePays} TO 1`));
  }

  protected plaquePos(seat: number): { x: number; y: number } {
    const s = bjSeat(seat, this.cfg.seats);
    return { x: s.x, y: Math.max(s.y + 26, 166) };
  }

  private playerSeat(): number {
    return this.core.casino.playerSeatIndex(this.tableId);
  }

  private ownerSlot(owner: string): number {
    if (owner === PLAYER) return Math.max(0, this.playerSeat());
    const p = this.core.casino.patronById(owner);
    return p?.seat ? Number(p.seat.split(':')[1]) : 0;
  }

  private stackPos(owner: string, side: Side): { x: number; y: number } {
    const z = L.zones[side];
    const n = this.cfg.seats;
    const slot = this.ownerSlot(owner);
    if (side === 'tie') return { x: z.x + z.w / 2, y: z.y + 6 + (slot % 4) * 6 };
    const t = n > 1 ? slot / (n - 1) : 0.5;
    // first base (seat 0) is on the right, like the plaques
    return { x: z.x + z.w - 8 - t * (z.w - 16), y: z.y + z.h / 2 + 4 };
  }

  private cardPos(to: 'player' | 'banker', i: number): { x: number; y: number } {
    const b = to === 'player' ? L.playerBox : L.bankerBox;
    return { x: b.x + 13 + i * 27, y: b.y + b.h / 2 };
  }

  protected build(): void {
    this.refreshPlaques();
    const s = this.st;
    if (s.phase === 'settled') {
      this.showLastCoup();
      void this.run(() => this.finishRound());
      return;
    }
    this.drawStacks();
    this.beginBetting();
  }

  private refreshPlaques(): void {
    for (let i = 0; i < this.cfg.seats; i++) this.setPlaque(i, null);
    for (const p of this.core.casino.patronsAt(this.tableId)) this.setPlaque(Number(p.seat!.split(':')[1]), p.id);
    const me = this.playerSeat();
    if (me >= 0) this.setPlaque(me, PLAYER);
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.setBusy(true);
    try {
      await fn();
    } finally {
      if (this.alive) this.setBusy(false);
    }
  }

  private beginBetting(): void {
    const s = this.st;
    if (!s.bets.some((b) => b.owner !== PLAYER)) {
      this.core.casino.bacPatronBets(this.tableId);
      this.refreshPlaques();
    }
    this.drawStacks();
    this.setPhase('betting');
    const left = s.shoe.cards.length - s.shoe.pos;
    this.dealerSay(s.needsShuffle ? '本靴结束，下一局重新洗牌。请下注。' : `请下注。（第 ${s.history.length + 1} 局 · 牌靴剩余约 ${Math.round(left / 52)} 副）`, 2600);
  }

  private key(owner: string, side: Side): string {
    return `${owner}|${side}`;
  }

  /** (Re)draw every bet on the layout from the engine state. */
  private drawStacks(): void {
    for (const c of this.stacks.values()) c.destroy();
    this.stacks.clear();
    const s = this.st;
    const sums = new Map<string, Money>();
    for (const b of s.bets) sums.set(this.key(b.owner, b.side), (sums.get(this.key(b.owner, b.side)) ?? 0) + b.amount);
    for (const [k, amount] of sums) {
      const [owner, side] = k.split('|') as [string, Side];
      const p = this.stackPos(owner, side);
      this.stacks.set(k, this.chipStack(amount, p.x, p.y, { mine: owner === PLAYER }));
    }
  }

  private showLastCoup(): void {
    const last = this.st.last;
    if (!last) return;
    this.clearCards();
    for (const to of ['player', 'banker'] as const) {
      const cs = to === 'player' ? last.player : last.banker;
      cs.forEach((c, i) => {
        const p = this.cardPos(to, i);
        const img = this.cardImage(c, p.x, p.y, 100 + i);
        if (i === 2) img.setAngle(90);
        this.cards[to].push(img);
        this.values[to].push(c);
      });
      this.updateTotal(to);
    }
  }

  private clearCards(): void {
    for (const to of ['player', 'banker'] as const) {
      for (const c of this.cards[to]) c.destroy();
      this.cards[to] = [];
      this.values[to] = [];
      this.totals[to]?.destroy();
      this.totals[to] = null;
    }
    this.glow?.destroy();
    this.glow = null;
  }

  private updateTotal(to: 'player' | 'banker'): void {
    const total = BAC.bacTotal(this.values[to]);
    const b = to === 'player' ? L.playerBox : L.bankerBox;
    const text = `${to === 'player' ? '闲' : '庄'} ${total}`;
    if (!this.totals[to]) {
      this.totals[to] = this.add
        .text(b.x + b.w / 2, b.y - 3, text, { fontFamily: WORLD_FONT, fontSize: '8px', color: to === 'player' ? '#9cc4ff' : '#ff9aa8', backgroundColor: '#120d1fdd', padding: { x: 3, y: 0 }, resolution: 4 })
        .setOrigin(0.5, 1)
        .setDepth(150);
      smoothText(this.totals[to]!);
    } else this.totals[to]!.setText(text);
  }

  private async play(events: BAC.BacEvent[]): Promise<void> {
    const shoe = { x: L.shoe.x, y: L.shoe.y };
    for (const e of events) {
      if (!this.alive) return;
      switch (e.k) {
        case 'shuffle':
          this.dealerSay('洗牌中……', 1600);
          sfx('shuffle');
          await this.wait(1300);
          break;
        case 'burn': {
          this.dealerSay(`烧牌：翻开 ${cardLabel(e.reveal)}，按规则烧掉 ${e.count} 张。`, 1800);
          const img = this.cardImage(e.reveal, shoe.x, shoe.y, 90);
          await this.tween(img, { x: L.discard.x, y: L.discard.y }, 380);
          img.destroy();
          break;
        }
        case 'deal': {
          const p = this.cardPos(e.to, e.index);
          const img = await this.dealCard(shoe, p.x, p.y, e.card, 100 + e.index);
          if (e.index === 2) await this.tween(img, { angle: 90 }, 160);
          this.cards[e.to].push(img);
          this.values[e.to].push(e.card);
          this.updateTotal(e.to);
          await this.wait(e.index === 2 ? 260 : 120);
          break;
        }
        case 'natural':
          this.dealerSay(e.side === 'both' ? '双方天牌！' : `${e.side === 'player' ? '闲家' : '庄家'}天牌，不再补牌。`, 1800);
          await this.wait(500);
          break;
        case 'draw':
          this.dealerSay(e.reason, 1600);
          await this.wait(450);
          break;
        case 'result': {
          const r = e.result;
          const zone = L.zones[r.winner];
          this.glow = this.add.rectangle(zone.x + zone.w / 2, zone.y + zone.h / 2, zone.w + 4, zone.h + 4, 0xffe45c, 0.18).setStrokeStyle(1, 0xffe45c, 0.9).setDepth(55);
          this.tweens.add({ targets: this.glow, alpha: 0.4, yoyo: true, repeat: 3, duration: 260 });
          const msg = r.winner === 'tie' ? `和局 ${r.playerTotal} : ${r.bankerTotal}` : `${r.winner === 'player' ? '闲' : '庄'}赢，${r.playerTotal} 比 ${r.bankerTotal}`;
          this.dealerSay(msg + (r.playerPair ? ' · 闲对' : '') + (r.bankerPair ? ' · 庄对' : ''), 2600);
          await this.wait(700);
          break;
        }
        case 'settle':
          await this.animSettle(e.settlement);
          break;
      }
    }
  }

  private async animSettle(st: BAC.BacSettlement): Promise<void> {
    const k = this.key(st.owner, st.side);
    const stack = this.stacks.get(k);
    if (!stack) return;
    const mine = st.owner === PLAYER;
    const rack = { x: 240, y: 62 };
    if (st.outcome === 'lose') {
      this.stacks.delete(k);
      await this.slideAway(stack, rack.x, rack.y, 300);
    } else if (st.outcome === 'win') {
      const p = this.stackPos(st.owner, st.side);
      const win = this.chipStack(st.payout - st.amount, rack.x, rack.y, { mine, label: false });
      await this.tween(win, { x: p.x - 9, y: p.y }, 300);
      win.destroy();
      stack.destroy();
      this.stacks.set(k, this.chipStack(st.payout, p.x, p.y, { mine }));
      if (mine) sfx('chips');
    }
    // pushes stay where they are
  }

  private async finishRound(): Promise<void> {
    this.setPhase('settling');
    const res = this.core.casino.collect(this.tableId);
    if (res) {
      const net = res.net;
      this.showResult(net, net > 0 ? `赢了 ${formatG(net)}` : net < 0 ? `输了 ${formatG(-net)}` : '和局退回本金');
    }
    await this.wait(1700);
    const all = [...this.cards.player, ...this.cards.banker];
    await Promise.all(all.map((c, i) => this.tween(c, { x: L.discard.x, y: L.discard.y, angle: 90, alpha: 0.5, delay: i * 30 }, 320, 'Cubic.easeIn')));
    this.clearCards();
    await Promise.all([...this.stacks.values()].map((c) => this.tween(c, { alpha: 0 }, 220)));
    for (const c of this.stacks.values()) c.destroy();
    this.stacks.clear();
    this.beginBetting();
  }

  // ------------------------------------------------------------------ player API

  bacBet(side: Side): void {
    if (this.busy) return;
    if (this.st.phase === 'settled') return;
    const r = this.core.casino.bacPlayerBet(this.tableId, side, G(store.tableUi.chip));
    if (!r.ok) {
      store.toast(r.error, 'warn');
      sfx('deny');
      return;
    }
    sfx('chip');
    this.drawStacks();
  }

  clearBets(): void {
    if (this.busy) return;
    this.core.casino.bacClear(this.tableId);
    this.drawStacks();
  }

  rebet(): void {
    if (this.busy || this.lastBets.length === 0) return;
    this.core.casino.bacClear(this.tableId);
    for (const b of this.lastBets) {
      const r = this.core.casino.bacPlayerBet(this.tableId, b.side, b.amount);
      if (!r.ok) {
        store.toast(r.error, 'warn');
        break;
      }
    }
    sfx('chips');
    this.drawStacks();
  }

  deal(): void {
    if (this.busy || this.st.phase !== 'betting') return;
    if (this.st.bets.length === 0) {
      store.toast('还没有人下注', 'warn');
      return;
    }
    const mine = this.st.bets.filter((b) => b.owner === PLAYER);
    const r = this.core.casino.bacDeal(this.tableId);
    if (!r.ok) {
      store.toast(r.error, 'warn');
      return;
    }
    if (mine.length) {
      const agg = new Map<Side, Money>();
      for (const b of mine) agg.set(b.side, (agg.get(b.side) ?? 0) + b.amount);
      this.lastBets = [...agg.entries()].map(([side, amount]) => ({ side, amount }));
    }
    store.tableUi = { ...store.tableUi, result: null };
    void this.run(async () => {
      this.setPhase('dealing', '停止下注，开牌。');
      this.clearCards();
      await this.play(r.value);
      await this.finishRound();
    });
  }

  leave(): void {
    if (this.busy) return;
    store.world?.leaveTable();
  }

  /** Bet totals per side for the overlay. */
  myBets(): Record<Side, Money> {
    const out = { player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0 } as Record<Side, Money>;
    for (const b of this.st.bets) if (b.owner === PLAYER) out[b.side] += b.amount;
    return out;
  }
}

export { SIDES, SIDE_NAMES };
