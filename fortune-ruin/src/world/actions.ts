import Phaser from 'phaser';
import type { GameCore } from '../core/GameCore';
import { formatClock, toDate } from '../core/calendar';
import type { CharacterLook } from '../data/npcs';
import { ITEMS } from '../data/items';
import { MEAL_BASIC, MEAL_FRESH } from '../systems/InventorySystem';
import { runSteps } from '../core/steps';
import { sfx } from '../audio/Audio';
import type { CharDir } from '../art/characters';
import type { CharacterSprite } from './CharacterSprite';
import type { Interactable } from './maps/types';
import { ensureItemIcon, ensureSleeper, frameRef } from './textures';

/** Where a prop's picture sits in the world (pixels), and what it is. */
export interface PropBox {
  x: number;
  y: number;
  w: number;
  h: number;
  id: string | null;
  depth: number;
}

/** What the scene lends the actions while they play. */
export interface ActionHost {
  readonly scene: Phaser.Scene;
  readonly core: GameCore;
  player(): CharacterSprite | null;
  playerLook(): CharacterLook;
  /** the picture of the prop this interactable belongs to (or its tiles) */
  boxOf(it: Interactable): PropBox;
  /** the nearest prop of this kind within r pixels (the hoop over the court) */
  propNear(id: string, x: number, y: number, r: number): PropBox | null;
  /** whoever works behind this counter or desk, within r pixels */
  clerkNear(x: number, y: number, r: number): CharacterSprite | null;
  /** keep the world still while something plays (no walking, the clock stopped); false if something else already is */
  hold(on: boolean): boolean;
  /** the map being shown (an action that waited on a window gives up if it changed meanwhile) */
  mapId(): string;
  untilModalClosed(): Promise<void>;
  toast(text: string, kind: 'good' | 'warn' | 'info'): void;
}

const SLEEP: Record<string, { pillow: [number, number]; blanket: number }> = {
  bed_single: { pillow: [10, 7], blanket: 12 },
  bed_double: { pillow: [9, 8], blanket: 13 },
  bed_luxury: { pillow: [14, 12], blanket: 18 },
};

function towards(from: { x: number; y: number }, to: { x: number; y: number }): CharDir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

/**
 * The small things you see yourself do: the card into the ATM and the notes
 * out of it, a coffee handed across the counter and drunk, steam off the
 * stove, the TV's light, the notes off the piano, a ball on the court, a
 * book's pages, chips pushed across the cage, a new outfit, and lying down
 * in bed while the clock runs through the night. Each one plays the thing
 * that really happened (what was bought, how much was drawn, how long you
 * slept) and nothing else; the clock is stopped while it plays.
 */
export class Actions {
  private live: Phaser.GameObjects.GameObject[] = [];

  constructor(private h: ActionHost) {}

  private get s(): Phaser.Scene {
    return this.h.scene;
  }

  /** The map is changing: whatever is still showing goes. */
  clear(): void {
    for (const o of this.live) o.destroy();
    this.live = [];
  }

  // ------------------------------------------------------------ helpers

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.live.push(o);
    return o;
  }

  private drop(o: Phaser.GameObjects.GameObject): void {
    o.destroy();
    this.live = this.live.filter((x) => x !== o);
  }

  private fx(name: string, x: number, y: number, depth: number): Phaser.GameObjects.Image {
    const r = frameRef(`fx:${name}`);
    return this.keep(this.s.add.image(x, y, r.key, r.frame).setDepth(depth));
  }

  private icon(id: string, x: number, y: number, depth: number): Phaser.GameObjects.Image {
    return this.keep(this.s.add.image(x, y, ensureItemIcon(this.s, id)).setScale(0.5).setDepth(depth));
  }

  private tw(target: object, props: Record<string, number>, ms: number, ease = 'Sine.easeInOut'): Promise<void> {
    return new Promise((res) => this.s.tweens.add({ targets: target, ...props, duration: ms, ease, onComplete: () => res() }));
  }

  private wait(ms: number): Promise<void> {
    return new Promise((res) => this.s.time.delayedCall(ms, () => res()));
  }

  /** Just in front of someone, about where their hands are; and their mouth. */
  private hand(p: CharacterSprite): { x: number; y: number } {
    return { x: p.x + (p.dir === 'left' ? -6 : p.dir === 'right' ? 6 : 4), y: p.y - 12 };
  }

  private mouth(p: CharacterSprite): { x: number; y: number } {
    return { x: p.x + (p.dir === 'left' ? -2 : p.dir === 'right' ? 2 : 0), y: p.y - 18 };
  }

  /** In front of the player (behind them when they face away). */
  private front(p: CharacterSprite): number {
    return (p.fixedDepth ?? p.y) + (p.dir === 'up' ? -0.5 : 0.5);
  }

  private async play(fn: () => Promise<void>): Promise<void> {
    if (!this.h.hold(true)) return;
    try {
      await fn();
    } finally {
      this.h.hold(false);
    }
  }

  /** Open a window and wait for it to close; false if you are somewhere else by then. */
  private async through(open: () => void): Promise<boolean> {
    const map = this.h.mapId();
    open();
    await this.h.untilModalClosed();
    return this.h.mapId() === map && !!this.h.player();
  }

  /** A few bites or sips: up to the mouth and back, a little less of it each time. */
  private async consume(p: CharacterSprite, thing: Phaser.GameObjects.Image, itemId: string | null): Promise<void> {
    const def = itemId ? ITEMS[itemId] : null;
    const drink = def?.kind === 'drink';
    // turn round from the counter (or the stove) to eat
    if (p.dir === 'up') {
      p.face('down');
      thing.setDepth(this.front(p) + 1);
    }
    p.showEmote(drink ? (def?.effects?.drunk ? 'drink' : 'coffee') : 'eat', 1700, this.s.time.now);
    const hand = this.hand(p);
    await this.tw(thing, { x: hand.x, y: hand.y }, 120);
    const mouth = this.mouth(p);
    for (let i = 0; i < 3; i++) {
      await this.tw(thing, { x: mouth.x, y: mouth.y }, 170);
      await this.wait(80);
      await this.tw(thing, { x: hand.x, y: hand.y, scale: thing.scale * (drink ? 0.92 : 0.8) }, 170);
    }
    await this.tw(thing, { alpha: 0 }, 160);
  }

  // ------------------------------------------------------------ the ATM

  /** The card goes in; the ATM does its business; the notes (if any) and the card come back out. */
  async atm(it: Interactable, open: () => void): Promise<void> {
    const p = this.h.player();
    if (!p) return open();
    const b = this.h.boxOf(it);
    const slot = { x: b.x + b.w / 2, y: b.y + Math.min(14, b.h / 2) };
    const depth = Math.max(b.depth, this.front(p)) + 1;
    await this.play(async () => {
      p.face(towards(p, slot));
      const hand = this.hand(p);
      const card = this.fx('card', hand.x, hand.y, depth);
      sfx('card');
      await this.tw(card, { x: slot.x, y: slot.y }, 260);
      await this.tw(card, { alpha: 0, scaleY: 0.3 }, 140);
      this.drop(card);
      await this.wait(120);
    });
    const cash0 = this.h.core.economy.balance('cash');
    if (!(await this.through(open))) return;
    const q = this.h.player()!;
    const d = this.h.core.economy.balance('cash') - cash0;
    await this.play(async () => {
      const hand = this.hand(q);
      if (d !== 0) {
        // notes out to you for a withdrawal, in from you for a deposit
        sfx('cash');
        const [a, z] = d > 0 ? [slot, hand] : [hand, slot];
        await Promise.all(
          [0, 1, 2].map(async (i) => {
            await this.wait(i * 90);
            const n = this.fx('cash', a.x, a.y, depth);
            await this.tw(n, { x: z.x, y: z.y - i }, 280, 'Sine.easeOut');
            await this.wait(140);
            this.drop(n);
          }),
        );
      }
      const back = this.fx('card', slot.x, slot.y, depth);
      back.setAlpha(0);
      await this.tw(back, { alpha: 1 }, 100);
      await this.tw(back, { x: hand.x, y: hand.y }, 240);
      this.drop(back);
    });
  }

  // ------------------------------------------------------------ counters and shops

  /** What you bought comes across the counter: eaten or drunk there and then, or into your bag. */
  async served(it: Interactable, consume: boolean, open: () => void): Promise<void> {
    const bought: string[] = [];
    const off = this.h.core.bus.on('purchase', (e) => bought.push(e.itemId));
    const here = await this.through(open);
    off();
    const p = this.h.player();
    if (!here || !p || bought.length === 0) return;
    const b = this.h.boxOf(it);
    const from = { x: b.x + b.w / 2, y: b.y + 8 };
    await this.play(async () => {
      const clerk = this.h.clerkNear(from.x, from.y, 56);
      if (clerk) {
        if (clerk.fixedDepth === null) clerk.face(towards(clerk, p));
        clerk.say(consume ? '请慢用。' : '谢谢惠顾。', 1800, this.s.time.now);
      }
      p.face(towards(p, from));
      const depth = Math.max(b.depth, this.front(p)) + 1;
      for (const id of [...new Set(bought)].slice(-3)) {
        const kind = ITEMS[id]?.kind;
        const thing = this.icon(id, from.x, from.y, depth);
        const hand = this.hand(p);
        await this.tw(thing, { x: hand.x, y: hand.y }, 300, 'Sine.easeOut');
        thing.setDepth(this.front(p) + 1);
        if (consume && (kind === 'food' || kind === 'drink')) await this.consume(p, thing, id);
        else await this.tw(thing, { alpha: 0, y: hand.y + 4 }, 180);
        this.drop(thing);
      }
      if (!consume) p.showEmote('shop', 1200, this.s.time.now);
    });
  }

  /** At home: steam off the pan, then the plate; or something out of the fridge. */
  async kitchen(it: Interactable, open: () => void): Promise<void> {
    const used: string[] = [];
    const off = this.h.core.bus.on('used', (e) => used.push(e.itemId));
    const here = await this.through(open);
    off();
    const p = this.h.player();
    if (!here || !p || used.length === 0) return;
    const k = this.h.boxOf(it);
    // the pan is on the stove, whichever of the kitchen things you went to
    const b = this.h.propNear('stove', k.x + k.w / 2, k.y + k.h / 2, 72) ?? k;
    const top = { x: b.x + b.w / 2, y: b.y + 6 };
    await this.play(async () => {
      p.face(towards(p, top));
      if (used.some((id) => id === MEAL_BASIC || id === MEAL_FRESH)) {
        sfx('cook');
        const puffs: Promise<void>[] = [];
        for (let i = 0; i < 6; i++) {
          const s = this.fx('steam', top.x + ((i * 5) % 9) - 4, top.y, b.depth + 1);
          puffs.push(this.tw(s, { y: top.y - 14, alpha: 0, scale: 1.6 }, 900).then(() => this.drop(s)));
          await this.wait(150);
        }
        await Promise.all(puffs);
        const plate = this.fx('plate', top.x, top.y + 4, this.front(p) + 1);
        const hand = this.hand(p);
        await this.tw(plate, { x: hand.x, y: hand.y }, 300);
        await this.consume(p, plate, null);
        this.drop(plate);
      }
      // anything else came out of the fridge (or off the shelf) you went to
      for (const id of used.filter((x) => x !== MEAL_BASIC && x !== MEAL_FRESH).slice(-2)) {
        const thing = this.icon(id, k.x + k.w / 2, k.y + 10, this.front(p) + 1);
        const hand = this.hand(p);
        await this.tw(thing, { x: hand.x, y: hand.y }, 260);
        await this.consume(p, thing, id);
        this.drop(thing);
      }
    });
  }

  // ------------------------------------------------------------ at home and about

  /** The TV's light on you for a while. */
  async tv(it: Interactable): Promise<void> {
    const p = this.h.player();
    if (!p) return;
    const b = this.h.boxOf(it);
    const screen = { x: b.x + b.w / 2, y: b.y + 8 };
    await this.play(async () => {
      p.face(towards(p, screen));
      const glow = this.keep(this.s.add.image(screen.x, screen.y + 10, 'glow').setScale(0.9).setTint(0x9fc8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(b.depth + 0.5));
      for (let i = 0; i < 10; i++) {
        glow.setAlpha(0.18 + ((i * 7) % 5) * 0.07);
        await this.wait(150);
      }
      this.drop(glow);
    });
  }

  /** Sat at the keys: a few bars, and the notes off the piano. */
  async piano(it: Interactable): Promise<void> {
    const p = this.h.player();
    if (!p) return;
    const b = this.h.boxOf(it);
    await this.play(async () => {
      const x0 = p.x;
      const y0 = p.y;
      p.setSitting(true, 'up');
      sfx('piano');
      const notes: Promise<void>[] = [];
      for (let i = 0; i < 6; i++) {
        const n = this.fx('note', b.x + 8 + ((i * 11) % Math.max(8, b.w - 16)), b.y + 6, b.depth + 1);
        notes.push(this.tw(n, { y: b.y - 12, x: n.x + (i % 2 ? 5 : -5), alpha: 0 }, 1100).then(() => this.drop(n)));
        await this.wait(240);
      }
      await Promise.all(notes);
      p.setSitting(false);
      p.setPos(x0, y0);
      p.face('up');
    });
  }

  /** A few bounces on the court, then a shot at the nearest hoop. */
  async court(): Promise<void> {
    const p = this.h.player();
    if (!p) return;
    await this.play(async () => {
      const depth = this.front(p) + 1;
      const side = { x: p.x + (p.dir === 'left' ? -7 : 7), y: p.y - 2 };
      const ball = this.fx('ball', side.x, side.y - 8, depth);
      for (let i = 0; i < 4; i++) {
        await this.tw(ball, { y: side.y }, 150, 'Quad.easeIn');
        sfx('bounce');
        await this.tw(ball, { y: side.y - 9 }, 150, 'Quad.easeOut');
      }
      const hoop = this.h.propNear('hoop', p.x, p.y, 200);
      const rim = hoop ? { x: hoop.x + hoop.w / 2, y: hoop.y + 12 } : { x: p.x, y: p.y - 60 };
      p.face(towards(p, rim));
      // the jump and the shot: along a line to the rim, lifted into an arc
      const start = { x: ball.x, y: ball.y };
      const k = { t: 0 };
      p.bob = -3;
      p.sync();
      await new Promise<void>((res) =>
        this.s.tweens.add({
          targets: k,
          t: 1,
          duration: 700,
          ease: 'Linear',
          onUpdate: () => {
            ball.setPosition(start.x + (rim.x - start.x) * k.t, start.y + (rim.y - start.y) * k.t - Math.sin(Math.PI * k.t) * 30);
          },
          onComplete: () => res(),
        }),
      );
      p.bob = 0;
      p.sync();
      sfx('bounce');
      await this.tw(ball, { y: rim.y + 18, alpha: 0 }, 300, 'Quad.easeIn');
      this.drop(ball);
    });
  }

  /** At the window or the telescope: a moment looking out. */
  async view(it: Interactable): Promise<void> {
    const p = this.h.player();
    if (!p) return;
    const b = this.h.boxOf(it);
    await this.play(async () => {
      p.face(towards(p, { x: b.x + b.w / 2, y: b.y + b.h / 2 }));
      for (const [dx, dy, ms] of [[-8, 4, 0], [9, 0, 260], [1, 10, 520]] as [number, number, number][]) {
        void this.wait(ms).then(async () => {
          const s = this.fx('spark', b.x + b.w / 2 + dx, b.y + dy, b.depth + 1);
          s.setAlpha(0);
          await this.tw(s, { alpha: 1 }, 220);
          await this.tw(s, { alpha: 0 }, 320);
          this.drop(s);
        });
      }
      await this.wait(1200);
    });
  }

  /** Back from the bookshelf with a book read: the pages turned. */
  async read(open: () => void): Promise<void> {
    const used: string[] = [];
    const off = this.h.core.bus.on('used', (e) => used.push(e.itemId));
    const here = await this.through(open);
    off();
    const p = this.h.player();
    if (!here || !p || !used.some((id) => ITEMS[id]?.kind === 'book')) return;
    await this.play(async () => {
      p.face('down');
      const hand = this.hand(p);
      const book = this.fx('book', hand.x, hand.y, this.front(p) + 1);
      p.showEmote('read', 1500, this.s.time.now);
      for (let i = 0; i < 2; i++) {
        await this.wait(380);
        sfx('page');
        await this.tw(book, { scaleX: 0.2 }, 110);
        await this.tw(book, { scaleX: 1 }, 110);
      }
      await this.wait(300);
      this.drop(book);
    });
  }

  /** The screen lights up before the desktop does. */
  async computer(it: Interactable, open: () => void): Promise<void> {
    const p = this.h.player();
    if (!p) return open();
    const b = this.h.boxOf(it);
    await this.play(async () => {
      p.face(towards(p, { x: b.x + b.w / 2, y: b.y + 8 }));
      const glow = this.keep(this.s.add.image(b.x + b.w / 2, b.y + 10, 'glow').setScale(0.5).setTint(0x9fe0ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(b.depth + 0.5).setAlpha(0));
      sfx('click');
      await this.tw(glow, { alpha: 0.6 }, 260);
      this.drop(glow);
    });
    open();
  }

  /** The cage: chips pushed across to you, or yours taken in and counted. */
  async cage(it: Interactable, open: () => void): Promise<void> {
    const before = this.h.core.economy.balance('chips');
    const here = await this.through(open);
    const p = this.h.player();
    const d = this.h.core.economy.balance('chips') - before;
    if (!here || !p || d === 0) return;
    const b = this.h.boxOf(it);
    const window = { x: b.x + b.w / 2, y: b.y + 10 };
    await this.play(async () => {
      const hand = this.hand(p);
      const [a, z] = d > 0 ? [window, hand] : [hand, window];
      const depth = Math.max(b.depth, this.front(p)) + 1;
      sfx('chips');
      await Promise.all(
        [0, 1, 2].map(async (i) => {
          await this.wait(i * 110);
          const c = this.fx('chips', a.x + (i - 1) * 3, a.y, depth);
          await this.tw(c, { x: z.x + (i - 1) * 3, y: z.y }, 300, 'Sine.easeOut');
          await this.wait(160);
          this.drop(c);
        }),
      );
      if (d < 0) {
        // cashed out: the notes come back
        sfx('cash');
        const n = this.fx('cash', window.x, window.y, depth);
        await this.tw(n, { x: hand.x, y: hand.y }, 280);
        this.drop(n);
      }
    });
  }

  /** A clerk who greets you before you are served (the bank's tellers). */
  async greet(it: Interactable, line: string, open: () => void): Promise<void> {
    const b = this.h.boxOf(it);
    const clerk = this.h.clerkNear(b.x + b.w / 2, b.y + 8, 56);
    if (clerk) {
      await this.play(async () => {
        clerk.say(line, 1600, this.s.time.now);
        await this.wait(450);
      });
    }
    open();
  }

  /** Out of the wardrobe in something else: a little sparkle. */
  async dressed(open: () => void): Promise<void> {
    const before = this.h.core.state.player.outfit;
    const here = await this.through(open);
    const p = this.h.player();
    if (!here || !p || this.h.core.state.player.outfit === before) return;
    await this.play(async () => {
      p.face('down');
      p.showEmote('★', 1200, this.s.time.now);
      const depth = this.front(p) + 1;
      await Promise.all(
        [[-8, -24], [7, -18], [-4, -8], [8, -30]].map(async ([dx, dy], i) => {
          await this.wait(i * 120);
          const s = this.fx('spark', p.x + dx, p.y + dy, depth);
          s.setAlpha(0);
          await this.tw(s, { alpha: 1 }, 160);
          await this.tw(s, { alpha: 0, y: p.y + dy - 4 }, 260);
          this.drop(s);
        }),
      );
    });
  }

  // ------------------------------------------------------------ a shift

  /** A long stretch (a shift at work): the clock runs through it while you get on with it, then what came of it. */
  async timelapse<T>(steps: Generator<number, T, void>, done: (r: T) => void): Promise<void> {
    const p = this.h.player();
    if (!p || !this.h.hold(true)) return done(runSteps(steps));
    let r: IteratorResult<number, T>;
    try {
      let i = 0;
      for (r = steps.next(); !r.done; r = steps.next()) {
        this.h.core.touch();
        if (i++ % 3 === 0) p.showEmote('…', 700, this.s.time.now);
        await this.wait(150);
      }
    } finally {
      this.h.hold(false);
    }
    this.h.core.touch();
    done(r.value);
  }

  // ------------------------------------------------------------ bed

  /**
   * Into bed: your head on the pillow, the lights down, the clock running through
   * the hours you sleep (the sleep itself happens step by step meanwhile), and up again.
   */
  async sleep(bed: Interactable | null, hours: number): Promise<void> {
    const core = this.h.core;
    const refused = core.canSleep();
    if (refused) return this.h.toast(refused, 'warn');
    const p = this.h.player();
    const b = bed ? this.h.boxOf(bed) : null;
    const spec = b?.id ? SLEEP[b.id] : undefined;
    const before = core.now();
    if (!p || !b || !spec || !this.h.hold(true)) {
      core.sleep(hours);
      return this.woke(before);
    }
    this.h.hold(false);
    const cam = this.s.cameras.main;
    await this.play(async () => {
      const x0 = p.x;
      const y0 = p.y;
      // lie down
      const head = this.keep(this.s.add.image(b.x + spec.pillow[0], b.y + spec.blanket, ensureSleeper(this.s, this.h.playerLook())).setOrigin(0.5, 1).setDepth(b.depth + 0.5).setAlpha(0));
      await Promise.all([this.tw(head, { alpha: 1 }, 260), this.tw(p, { alpha: 0 }, 260)]);
      p.sync();
      // the Z's float up from the pillow while the night goes by
      let zzz = true;
      const drift = async () => {
        for (let i = 0; zzz; i++) {
          const z = this.fx('zz', head.x + 4 + (i % 2) * 3, head.y - 12, b.depth + 1);
          void this.tw(z, { x: z.x + 8, y: z.y - 14, alpha: 0 }, 1300).then(() => this.drop(z));
          await this.wait(520);
        }
      };
      void drift();
      await this.wait(900);
      cam.fadeOut(700, 6, 8, 22);
      await this.wait(760);
      for (const _ of core.sleepSteps(hours, 12)) {
        core.touch();
        await this.wait(90);
      }
      core.touch();
      await this.wait(250);
      cam.fadeIn(700, 6, 8, 22);
      await this.wait(700);
      zzz = false;
      // and up again, beside the bed
      p.setPos(x0, y0);
      p.face('down');
      await Promise.all([this.tw(head, { alpha: 0 }, 240), this.tw(p, { alpha: 1 }, 240)]);
      p.sync();
      this.drop(head);
    });
    this.woke(before);
  }

  private woke(before: number): void {
    const core = this.h.core;
    const after = toDate(core.now());
    this.h.toast(`睡了 ${((core.now() - before) / 60).toFixed(1)} 小时，现在是 ${formatClock(after.minuteOfDay)}。`, 'good');
  }
}
