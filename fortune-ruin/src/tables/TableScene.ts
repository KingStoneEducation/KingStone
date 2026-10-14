import Phaser from 'phaser';
import type { GameCore } from '../core/GameCore';
import { store } from '../ui/store';
import { TABLE_BY_ID, type TableConfig } from '../casino/tables';
import { CARD_H, CARD_SCALE, CARD_W, cardFrame, chipFrame, registerTableTextures, tableAtlas, TH, TW, type FeltVariant } from '../art/tableArt';
import { breakIntoChips, formatG, G, type Money } from '../core/money';
import { CHIP_DENOMS } from '../art/palette';
import type { Card } from '../casino/cards';
import { ensureCharacter, frameRef, WORLD_FONT, anonLook } from '../world/textures';
import { staffLook, playerLook } from '../world/looks';
import { NPC_BY_ID, type CharacterLook } from '../data/npcs';
import { smoothText } from '../world/CharacterSprite';
import { sfx } from '../audio/Audio';

export type TablePhase = 'betting' | 'dealing' | 'insurance' | 'player' | 'dealer' | 'settling' | 'spinning';

export interface SeatInfo {
  /** 'player' or a patron id */
  owner: string;
  look: CharacterLook;
  name: string;
  isPlayer: boolean;
}

const DENOMS_DESC = CHIP_DENOMS.map((d) => G(d));

/**
 * Shared machinery for the close-up table views: a fixed 480×270 logical
 * stage scaled to the window, the dealer, seat plaques, card and chip
 * sprites with simple async animation helpers.
 */
export abstract class TableScene extends Phaser.Scene {
  core!: GameCore;
  tableId = '';
  cfg!: TableConfig;
  variant: FeltVariant = 'green';
  protected alive = false;
  /** bumped on every shutdown; async work started in an earlier visit checks it and stops */
  protected gen = 0;
  protected busy = false;
  protected dealer: Phaser.GameObjects.Image | null = null;
  private dealerBubble: Phaser.GameObjects.Text | null = null;
  private bubbleTimer: Phaser.Time.TimerEvent | null = null;
  protected plaques = new Map<string, { bust: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; x: number; y: number; emote?: Phaser.GameObjects.Image }>();
  private offs: (() => void)[] = [];

  init(data: { tableId: string }): void {
    this.tableId = data.tableId;
  }

  create(): void {
    this.core = store.core!;
    this.cfg = TABLE_BY_ID[this.tableId];
    this.variant = this.cfg.area === 'vip' ? 'red' : this.cfg.area === 'high' ? 'blue' : 'green';
    registerTableTextures(this);
    this.cameras.main.setBackgroundColor('#0b0912');
    this.add.image(0, 0, `backdrop:${this.variant}`).setOrigin(0, 0).setDepth(-100);
    // extra backdrop to cover letterboxing on wide screens
    this.add.image(-TW, 0, `backdrop:${this.variant}`).setOrigin(0, 0).setDepth(-101).setFlipX(true);
    this.add.image(TW, 0, `backdrop:${this.variant}`).setOrigin(0, 0).setDepth(-101).setFlipX(true);
    this.buildDealer();
    this.add.image(0, 0, this.feltKey()).setOrigin(0, 0).setDepth(0);
    this.fit();
    this.scale.on('resize', this.fit, this);
    let hints = store.settings.casinoHints;
    this.offs.push(
      this.core.bus.on('patron:emote', ({ id, emote }) => this.plaqueEmote(id, emote)),
      this.core.bus.on('patron:left', ({ id }) => this.time.delayedCall(10, () => this.removePlaque(id))),
      store.subscribe(() => {
        if (store.settings.casinoHints === hints || !this.alive) return;
        hints = store.settings.casinoHints;
        this.refreshHints();
      }),
    );
    this.events.once('shutdown', () => this.teardown());
    store.tableApi = this as unknown as TableApi;
    store.tableUi = { ...store.tableUi, busy: false, result: null, message: '' };
    this.alive = true;
    this.build();
    store.notify();
  }

  /** Table hints were switched on or off: show or hide the helper labels. */
  protected refreshHints(): void {
    /* subclasses with hint labels override this */
  }

  /** Felt texture key (subclasses draw their own layout). */
  protected abstract feltKey(): string;
  /** Subclass setup after the stage exists. */
  protected abstract build(): void;
  /** Seat plaque position for a seat index. */
  protected abstract plaquePos(seat: number): { x: number; y: number };

  private teardown(): void {
    this.alive = false;
    this.gen++;
    for (const off of this.offs) off();
    this.offs = [];
    // Phaser reuses this scene object for the next visit: forget the destroyed objects
    this.plaques.clear();
    this.dealerBubble = null;
    this.bubbleTimer = null;
    this.dealer = null;
    this.scale.off('resize', this.fit, this);
    if (store.tableApi === (this as unknown as TableApi)) store.tableApi = null;
  }

  private fit(): void {
    const cam = this.cameras.main;
    const w = this.scale.width;
    const h = this.scale.height;
    // the stage sits at the top; the action bar takes the bottom of the screen
    const bar = h < 600 ? 92 : 112;
    const z = Math.max(0.5, Math.min(w / TW, (h - bar) / TH));
    cam.setZoom(z);
    cam.centerOn(TW / 2, h / z / 2);
    cam.setRoundPixels(true);
  }

  // ------------------------------------------------------------------ helpers

  speedMul(): number {
    return Math.max(0.5, store.settings.tableSpeed || 1);
  }

  wait(ms: number): Promise<void> {
    return new Promise((res) => {
      if (!this.alive) return res();
      this.time.delayedCall(ms / this.speedMul(), () => res());
    });
  }

  tween(targets: object | object[], props: Record<string, unknown>, ms: number, ease = 'Cubic.easeOut'): Promise<void> {
    return new Promise((res) => {
      if (!this.alive) return res();
      this.tweens.add({ targets, ...props, duration: ms / this.speedMul(), ease, onComplete: () => res() });
    });
  }

  setBusy(b: boolean): void {
    this.busy = b;
    store.tableUi = { ...store.tableUi, busy: b };
    store.notify();
  }

  /** `prompt` is a helper line for newcomers; it is dropped when table hints are off. */
  setPhase(phase: TablePhase, prompt?: string): void {
    const message = prompt !== undefined && this.hintsOn() ? prompt : store.tableUi.message;
    store.tableUi = { ...store.tableUi, phase, message };
    store.notify();
    this.core.touch();
  }

  message(text: string): void {
    store.tableUi = { ...store.tableUi, message: text };
    store.notify();
  }

  /** A helper line (payouts, whose turn it is ...), only shown with table hints on. */
  hint(text: string): void {
    if (this.hintsOn()) this.message(text);
  }

  hintsOn(): boolean {
    return store.settings.casinoHints;
  }

  showResult(net: Money, text: string): void {
    store.tableUi = { ...store.tableUi, result: { net, text, t: Date.now() } };
    store.notify();
    if (net > 0) sfx('win');
    else if (net < 0) sfx('lose');
  }

  // ------------------------------------------------------------------ dealer

  protected dealerLook(): { look: CharacterLook; name: string } {
    const npcId = this.cfg.dealerNpc;
    if (npcId) {
      const rt = this.core.state.npcs[npcId];
      if (rt?.location === 'casino' && rt.activity === 'work') return { look: NPC_BY_ID[npcId].look, name: NPC_BY_ID[npcId].name };
    }
    let seed = 0;
    for (const ch of this.tableId) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    return { look: staffLook('dealer', 1400 + (seed % 97)), name: '荷官' };
  }

  private buildDealer(): void {
    const { look } = this.dealerLook();
    const key = ensureCharacter(this, look);
    this.dealer = this.add.image(TW / 2, 4, key, 0).setOrigin(0.5, 0).setScale(2.5).setDepth(-10);
    this.tweens.add({ targets: this.dealer, y: 5, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  dealerSay(text: string, ms = 2200): void {
    if (!this.alive) return;
    if (!this.dealerBubble) {
      this.dealerBubble = this.add
        .text(TW / 2 + 34, 14, text, {
          fontFamily: WORLD_FONT,
          fontSize: '6px',
          color: '#241b30',
          backgroundColor: '#f4f1eaee',
          padding: { x: 4, y: 2 },
          resolution: 2,
        })
        .setOrigin(0, 0)
        .setDepth(500);
      smoothText(this.dealerBubble);
    } else this.dealerBubble.setText(text).setVisible(true);
    this.bubbleTimer?.remove();
    this.bubbleTimer = this.time.delayedCall(ms, () => this.dealerBubble?.setVisible(false));
    this.message(text);
  }

  // ------------------------------------------------------------------ seats

  seatInfo(owner: string): SeatInfo {
    if (owner === 'player') return { owner, look: playerLook(this.core), name: '你', isPlayer: true };
    const p = this.core.casino.patronById(owner);
    if (p?.npc) {
      const rel = this.core.state.social.rel[p.npc];
      return { owner, look: NPC_BY_ID[p.npc].look, name: rel?.knowsName ? NPC_BY_ID[p.npc].name : '赌客', isPlayer: false };
    }
    return { owner, look: anonLook(p?.look ?? 1), name: p?.name ?? '赌客', isPlayer: false };
  }

  /** Create or update the plaque for whoever sits at `seat`. */
  setPlaque(seat: number, owner: string | null): void {
    const key = `seat${seat}`;
    const cur = this.plaques.get(key);
    if (!owner) {
      if (cur) {
        cur.bust.destroy();
        cur.label.destroy();
        cur.emote?.destroy();
        this.plaques.delete(key);
      }
      return;
    }
    const info = this.seatInfo(owner);
    const pos = this.plaquePos(seat);
    const tex = ensureCharacter(this, info.look);
    if (cur && cur.bust.texture.key === tex && cur.label.text === info.name) return;
    if (cur) {
      cur.bust.destroy();
      cur.label.destroy();
      cur.emote?.destroy();
    }
    const bust = this.add.image(pos.x, pos.y, tex, 0).setOrigin(0.5, 0).setCrop(0, 0, 16, 19).setScale(1.5).setDepth(40);
    const label = this.add
      .text(pos.x, pos.y + 29, info.name, {
        fontFamily: WORLD_FONT,
        fontSize: '6px',
        color: info.isPlayer ? '#24170a' : '#f4f1ea',
        backgroundColor: info.isPlayer ? '#e8bf55' : '#120d1fcc',
        padding: { x: 3, y: 1 },
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(41);
    smoothText(label);
    this.plaques.set(key, { bust, label, x: pos.x, y: pos.y });
    (bust as unknown as { ownerId: string }).ownerId = owner;
  }

  private removePlaque(ownerId: string): void {
    for (const [k, p] of this.plaques) {
      if ((p.bust as unknown as { ownerId: string }).ownerId === ownerId) {
        p.bust.destroy();
        p.label.destroy();
        p.emote?.destroy();
        this.plaques.delete(k);
      }
    }
  }

  private plaqueEmote(ownerId: string, emote: string): void {
    for (const p of this.plaques.values()) {
      if ((p.bust as unknown as { ownerId: string }).ownerId !== ownerId) continue;
      const ref = frameRef(`emote:${emote}`);
      p.emote?.destroy();
      p.emote = this.add.image(p.x + 14, p.y - 2, ref.key, ref.frame).setOrigin(0.5, 1).setDepth(45);
      const e = p.emote;
      this.time.delayedCall(1800, () => {
        if (p.emote === e) {
          e.destroy();
          p.emote = undefined;
        }
      });
    }
  }

  // ------------------------------------------------------------------ cards

  /**
   * A card on the table. Card textures carry CARD_DENSITY × the stage's
   * detail, so `size` is relative to the card's table size (1 = 22 × 30).
   */
  cardImage(card: Card | null, x: number, y: number, depth = 100, size = 1): Phaser.GameObjects.Image {
    const ref = tableAtlas.ref(cardFrame(card, store.settings.fourColorDeck));
    return this.add.image(x, y, ref.key, ref.frame).setOrigin(0.5, 0.5).setDepth(depth).setScale(size * CARD_SCALE);
  }

  /** Texture scale for a card shown at `size` × its table size. */
  cardScale(size = 1): number {
    return size * CARD_SCALE;
  }

  setCardFace(img: Phaser.GameObjects.Image, card: Card | null): void {
    const ref = tableAtlas.ref(cardFrame(card, store.settings.fourColorDeck));
    img.setTexture(ref.key, ref.frame);
  }

  async flip(img: Phaser.GameObjects.Image, card: Card | null, ms = 180): Promise<void> {
    const sx = img.scaleY;
    await this.tween(img, { scaleX: 0 }, ms / 2, 'Sine.easeIn');
    this.setCardFace(img, card);
    await this.tween(img, { scaleX: sx }, ms / 2, 'Sine.easeOut');
  }

  /** Slide a new card from the shoe to (x, y), turning it face up on arrival. */
  async dealCard(from: { x: number; y: number }, x: number, y: number, card: Card | null, depth: number): Promise<Phaser.GameObjects.Image> {
    const img = this.cardImage(null, from.x, from.y, depth, 0.85);
    sfx('card');
    await this.tween(img, { x, y, scale: this.cardScale(), angle: { from: -12, to: 0 } }, 260);
    if (card !== null) await this.flip(img, card, 150);
    return img;
  }

  // ------------------------------------------------------------------ chips

  /** A stack of chips worth `amount`, with an optional value label; returns a container. */
  chipStack(amount: Money, x: number, y: number, opts: { mine?: boolean; label?: boolean; depth?: number } = {}): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(opts.depth ?? 60);
    if (amount <= 0) return c;
    const chips = breakIntoChips(amount, DENOMS_DESC);
    const shown = chips.slice(0, 12);
    if (opts.mine) {
      const ring = this.add.ellipse(0, 1, 16, 8, 0xffe45c, 0.0).setStrokeStyle(1, 0xffe45c, 0.9);
      c.add(ring);
    }
    shown.forEach((d, i) => {
      const ref = tableAtlas.ref(chipFrame(d / 100));
      c.add(this.add.image(0, -i * 2, ref.key, ref.frame).setOrigin(0.5, 0.5));
    });
    if (opts.label !== false) {
      const t = this.add
        .text(0, -shown.length * 2 - 4, formatG(amount, { compact: true }).replace(' G', ''), {
          fontFamily: WORLD_FONT,
          fontSize: '6px',
          color: opts.mine ? '#ffe45c' : '#f4f1ea',
          stroke: '#120d1f',
          strokeThickness: 2,
          resolution: 2,
        })
        .setOrigin(0.5, 1);
      smoothText(t);
      c.add(t);
    }
    return c;
  }

  /** Animate a stack sliding to a point, then destroy it. */
  async slideAway(stack: Phaser.GameObjects.Container | null, x: number, y: number, ms = 360): Promise<void> {
    if (!stack) return;
    await this.tween(stack, { x, y, alpha: 0.2 }, ms, 'Cubic.easeIn');
    stack.destroy();
  }

  frameSize(): { w: number; h: number } {
    return { w: CARD_W, h: CARD_H };
  }
}

/** What the React overlay can ask a table to do. */
export interface TableApi {
  readonly tableId: string;
  deal(): void;
  clearBets(): void;
  rebet(): void;
  leave(): void;
  // blackjack
  bjAddBet?(): void;
  bjAct?(action: 'hit' | 'stand' | 'double' | 'split' | 'surrender'): void;
  bjInsurance?(take: boolean): void;
  // baccarat
  bacBet?(side: 'player' | 'banker' | 'tie' | 'playerPair' | 'bankerPair'): void;
  // roulette
  rlUndo?(): void;
  // poker
  pkAct?(action: { type: 'fold' | 'check' | 'call' | 'raise' | 'allin'; to?: Money }): void;
  pkBuyIn?(amount: Money): void;
  pkTopUp?(amount: Money): void;
  pkAuto?(on: boolean): void;
}
