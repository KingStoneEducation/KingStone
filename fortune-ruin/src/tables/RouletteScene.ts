import Phaser from 'phaser';
import * as RLE from '../casino/RouletteEngine';
import { TableScene } from './TableScene';
import { drawRouletteTable, feltTexture, RL, tableAtlas } from '../art/tableArt';
import { betAnchor, betAt, numberRect, type LayoutBet } from '../casino/rouletteLayout';
import { ballAt, planSpin, pocketLocalAngle, type SpinPlan } from '../casino/rouletteMotion';
import { formatG, G, type Money } from '../core/money';
import { store } from '../ui/store';
import { sfx, audio } from '../audio/Audio';

const PLAYER = 'player';
const WHEEL_SPEED = 0.55; // rad/s, clockwise
const TRACK_R = 72;
const POCKET_R = 56;

export class RouletteScene extends TableScene {
  private wheel!: Phaser.GameObjects.Image;
  private ball!: Phaser.GameObjects.Image;
  private wheelBase = 0;
  private wheelT0 = 0;
  private plan: SpinPlan | null = null;
  private restPocket: number | null = null;
  private stacks = new Map<string, Phaser.GameObjects.Container>();
  private hover: Phaser.GameObjects.Rectangle[] = [];
  private dolly: Phaser.GameObjects.Image | null = null;
  private lastBets: { kind: RLE.RouletteBetKind; numbers: number[]; amount: Money }[] = [];
  private lastTick = 0;
  private spinDone: (() => void) | null = null;

  constructor() {
    super('roulette');
  }

  private get st(): RLE.RouletteState {
    return this.core.casino.rl(this.tableId);
  }

  protected feltKey(): string {
    return feltTexture(this, `rl:${this.variant}`, (ctx) => drawRouletteTable(ctx, this.variant));
  }

  protected plaquePos(seat: number): { x: number; y: number } {
    return { x: 236 + seat * 42, y: 200 };
  }

  private wheelRotation(t: number): number {
    return this.wheelBase + WHEEL_SPEED * ((t - this.wheelT0) / 1000);
  }

  protected build(): void {
    const scale = (RL.wheel.r * 2) / 360;
    this.wheel = this.add.image(RL.wheel.x, RL.wheel.y, 'wheel').setScale(scale).setDepth(20);
    const b = tableAtlas.ref('ball');
    this.ball = this.add.image(RL.wheel.x, RL.wheel.y - TRACK_R, b.key, b.frame).setDepth(25);
    this.wheelT0 = this.time.now;
    const hist = this.st.history;
    if (hist.length) this.restPocket = RLE.EURO_WHEEL.indexOf(hist[hist.length - 1]);
    this.refreshPlaques();
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.mouse?.disableContextMenu();
    if (this.st.phase === 'settled') {
      this.drawStacks();
      this.placeDolly(this.st.result!);
      void this.run(() => this.finishRound(false));
    } else this.beginBetting();
  }

  private refreshPlaques(): void {
    for (let i = 0; i < this.cfg.seats; i++) this.setPlaque(i, null);
    for (const p of this.core.casino.patronsAt(this.tableId)) this.setPlaque(Number(p.seat!.split(':')[1]), p.id);
    const me = this.core.casino.playerSeatIndex(this.tableId);
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
    if (!this.st.bets.some((b) => b.owner !== PLAYER)) {
      this.core.casino.rlPatronBets(this.tableId);
      this.refreshPlaques();
    }
    this.drawStacks();
    this.setPhase('betting');
    const r = this.st.rules;
    this.dealerSay(`请下注。每局最低合计 ${formatG(r.minTotal)}，内围单注最高 ${formatG(r.maxInside)}。`, 2800);
  }

  // ------------------------------------------------------------------ chips on the layout

  private betKey(owner: string, kind: string, numbers: number[]): string {
    return `${owner}|${kind}|${[...numbers].sort((a, b) => a - b).join(',')}`;
  }

  private ownerOffset(owner: string): { x: number; y: number } {
    if (owner === PLAYER) return { x: 0, y: 0 };
    let h = 0;
    for (const ch of owner) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { x: ((h % 5) - 2) * 2, y: (((h >> 3) % 3) - 1) * 2 - 2 };
  }

  private drawStacks(): void {
    for (const c of this.stacks.values()) c.destroy();
    this.stacks.clear();
    for (const b of this.st.bets) {
      const k = this.betKey(b.owner, b.kind, b.numbers);
      const a = betAnchor({ kind: b.kind, numbers: b.numbers });
      const o = this.ownerOffset(b.owner);
      this.stacks.set(k, this.chipStack(b.amount, a.x + o.x, a.y + o.y + 2, { mine: b.owner === PLAYER, label: b.owner === PLAYER, depth: b.owner === PLAYER ? 70 : 62 }));
    }
  }

  private clearHover(): void {
    for (const r of this.hover) r.destroy();
    this.hover = [];
  }

  private onMove(p: Phaser.Input.Pointer): void {
    this.clearHover();
    if (this.busy || this.st.phase !== 'betting') return;
    const bet = betAt(p.worldX, p.worldY);
    if (!bet) return;
    for (const n of bet.numbers.length <= 6 ? bet.numbers : []) {
      const r = numberRect(n);
      this.hover.push(this.add.rectangle(r.x + r.w / 2 + 0.5, r.y + r.h / 2 + 0.5, r.w - 1, r.h - 1, 0xffe45c, 0.22).setDepth(50));
    }
    if (bet.numbers.length > 6) {
      const a = betAnchor(bet);
      this.hover.push(this.add.rectangle(a.x, a.y, 30, 14, 0xffe45c, 0.18).setDepth(50));
    }
    const name = RLE.BET_KIND_NAMES[bet.kind];
    const nums = bet.numbers.length <= 6 ? ` ${bet.numbers.join('-')}` : '';
    this.message(`${name}${nums} · 赔率 ${RLE.ROULETTE_PAYOUTS[bet.kind]}:1 · 点击下注 ${formatG(G(store.tableUi.chip))}，右键撤销`);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) {
      this.rlUndo();
      return;
    }
    const bet = betAt(p.worldX, p.worldY);
    if (bet) this.placeBet(bet, G(store.tableUi.chip));
  }

  private placeBet(bet: LayoutBet, amount: Money): boolean {
    if (this.busy) return false;
    const r = this.core.casino.rlPlayerBet(this.tableId, bet.kind, bet.numbers, amount);
    if (!r.ok) {
      store.toast(r.error, 'warn');
      sfx('deny');
      return false;
    }
    if (this.dolly) {
      this.dolly.destroy();
      this.dolly = null;
    }
    sfx('chip');
    this.drawStacks();
    return true;
  }

  private placeDolly(n: number): void {
    this.dolly?.destroy();
    const a = betAnchor({ kind: 'straight', numbers: [n] });
    const ref = tableAtlas.ref('dolly');
    this.dolly = this.add.image(a.x, a.y - 2, ref.key, ref.frame).setOrigin(0.5, 1).setDepth(90);
  }

  // ------------------------------------------------------------------ wheel animation

  override update(time: number): void {
    if (!this.wheel) return;
    const rot = this.wheelRotation(time);
    this.wheel.setRotation(rot);
    let angle: number;
    let radius: number;
    if (this.plan) {
      const b = ballAt(this.plan, time);
      angle = b.angle;
      radius = POCKET_R + (TRACK_R - POCKET_R) * b.radius;
      if (time - this.lastTick > (b.radius < 0.6 ? 90 : 160) && b.radius < 0.95 && !b.settled) {
        this.lastTick = time;
        sfx('ball');
      }
      if (b.settled && this.spinDone) {
        const done = this.spinDone;
        this.spinDone = null;
        this.restPocket = this.plan.pocketIndex;
        done();
      }
    } else if (this.restPocket !== null) {
      angle = rot + pocketLocalAngle(this.restPocket);
      radius = POCKET_R;
    } else {
      angle = -Math.PI / 2;
      radius = TRACK_R;
    }
    this.ball.setPosition(RL.wheel.x + Math.cos(angle) * radius, RL.wheel.y + Math.sin(angle) * radius);
  }

  private spinTo(pocketIndex: number): Promise<void> {
    const now = this.time.now;
    const rot = this.wheelRotation(now);
    this.wheelBase = rot;
    this.wheelT0 = now;
    const ballAngle = Math.atan2(this.ball.y - RL.wheel.y, this.ball.x - RL.wheel.x);
    const duration = 6800 / this.speedMul();
    this.plan = planSpin(now, duration, rot, WHEEL_SPEED, ballAngle, pocketIndex, 6 + Math.floor(Math.random() * 3), 0.4);
    audio.wheel(true);
    return new Promise((res) => {
      this.spinDone = () => {
        audio.wheel(false);
        res();
      };
    });
  }

  // ------------------------------------------------------------------ round flow

  deal(): void {
    if (this.busy || this.st.phase !== 'betting') return;
    const mine = this.st.bets.filter((b) => b.owner === PLAYER);
    const r = this.core.casino.rlSpin(this.tableId);
    if (!r.ok) {
      store.toast(r.error, 'warn');
      return;
    }
    if (mine.length) this.lastBets = mine.map((b) => ({ kind: b.kind, numbers: [...b.numbers], amount: b.amount }));
    this.clearHover();
    store.tableUi = { ...store.tableUi, result: null };
    const out = r.value;
    void this.run(async () => {
      this.setPhase('spinning');
      this.dealerSay('停止下注！', 1500);
      this.dolly?.destroy();
      this.dolly = null;
      await this.spinTo(out.pocketIndex);
      this.plan = null;
      const n = out.result;
      const color = RLE.numberColor(n);
      this.dealerSay(`${n} 号，${color === 'red' ? '红' : color === 'black' ? '黑' : '绿色零'}${n !== 0 ? `，${n % 2 ? '单' : '双'}，${n <= 18 ? '小' : '大'}` : ''}。`, 3200);
      this.placeDolly(n);
      await this.settleChips(out.settlements);
      await this.finishRound(true);
    });
  }

  private async settleChips(settlements: RLE.RouletteSettlement[]): Promise<void> {
    const croupier = { x: RL.wheel.x + 70, y: 70 };
    const losers: Promise<void>[] = [];
    for (const s of settlements) {
      const k = this.betKey(s.owner, s.kind, s.numbers);
      const stack = this.stacks.get(k);
      if (!stack) continue;
      if (!s.won && s.payout === 0) {
        this.stacks.delete(k);
        losers.push(this.slideAway(stack, croupier.x, croupier.y, 420));
      } else if (!s.won && s.payout > 0) {
        // la partage: half returned
        stack.destroy();
        this.stacks.set(k, this.chipStack(s.payout, stack.x, stack.y, { mine: s.owner === PLAYER }));
      }
    }
    await Promise.all(losers);
    await this.wait(250);
    for (const s of settlements) {
      if (!s.won) continue;
      const k = this.betKey(s.owner, s.kind, s.numbers);
      const stack = this.stacks.get(k);
      if (!stack) continue;
      const mine = s.owner === PLAYER;
      const win = this.chipStack(s.payout - s.amount, croupier.x, croupier.y, { mine, label: false, depth: 80 });
      await this.tween(win, { x: stack.x + 8, y: stack.y }, 300);
      win.destroy();
      stack.destroy();
      this.stacks.set(k, this.chipStack(s.payout, stack.x, stack.y, { mine }));
      if (mine) sfx('chips');
    }
  }

  private async finishRound(showResult: boolean): Promise<void> {
    this.setPhase('settling');
    const res = this.core.casino.collect(this.tableId);
    if (res && showResult) {
      const net = res.net;
      this.showResult(net, net > 0 ? `赢了 ${formatG(net)}` : net < 0 ? `输了 ${formatG(-net)}` : '不输不赢');
    }
    await this.wait(2000);
    await Promise.all([...this.stacks.values()].map((c) => this.tween(c, { alpha: 0 }, 260)));
    for (const c of this.stacks.values()) c.destroy();
    this.stacks.clear();
    this.beginBetting();
  }

  // ------------------------------------------------------------------ player API

  rlUndo(): void {
    if (this.busy || this.st.phase !== 'betting') return;
    this.core.casino.rlUndo(this.tableId);
    this.drawStacks();
  }

  clearBets(): void {
    if (this.busy || this.st.phase !== 'betting') return;
    this.core.casino.rlClear(this.tableId);
    this.drawStacks();
  }

  rebet(): void {
    if (this.busy || this.st.phase !== 'betting' || this.lastBets.length === 0) return;
    this.core.casino.rlClear(this.tableId);
    for (const b of this.lastBets) if (!this.placeBet({ kind: b.kind, numbers: b.numbers }, b.amount)) break;
    sfx('chips');
  }

  leave(): void {
    if (this.busy) return;
    store.world?.leaveTable();
  }

  myTotal(): Money {
    return RLE.ownerTotal(this.st, PLAYER);
  }
}
