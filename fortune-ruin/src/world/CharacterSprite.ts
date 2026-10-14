import Phaser from 'phaser';
import type { CharacterLook } from '../data/npcs';
import { ensureCharacter, frameRef, WORLD_FONT } from './textures';
import { frameIndex, type CharDir } from '../art/characters';
import type { Pt } from './pathfinding';

export const LABEL_DEPTH = 200000;

const TEXT_RES = 4;

/** A walking/sitting pixel character with shadow, optional name tag and emote bubble. */
export class CharacterSprite {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text | null = null;
  private emote: Phaser.GameObjects.Image | null = null;
  private emoteUntil = 0;
  private bubble: Phaser.GameObjects.Text | null = null;
  private bubbleUntil = 0;
  private texKey: string;
  x: number;
  y: number;
  dir: CharDir = 'down';
  moving = false;
  sitting = false;
  /** horizontal offset of the emote and speech bubble (keeps them off a neighbour's head) */
  bubbleDx = 0;
  path: Pt[] = [];
  speed = 40;
  depthBias = 0;
  fixedDepth: number | null = null;
  onArrive: (() => void) | null = null;
  bob = 0;
  alpha = 1;

  constructor(
    private scene: Phaser.Scene,
    look: CharacterLook,
    x: number,
    y: number,
    dir: CharDir = 'down',
  ) {
    this.texKey = ensureCharacter(scene, look);
    this.x = x;
    this.y = y;
    const sh = frameRef('shadow');
    this.shadow = scene.add.image(x, y, sh.key, sh.frame).setOrigin(0.5, 0.5);
    this.sprite = scene.add.sprite(x, y, this.texKey, frameIndex(dir, 'stand')).setOrigin(0.5, 1);
    this.face(dir);
    this.sync();
  }

  setLook(look: CharacterLook): void {
    const k = ensureCharacter(this.scene, look);
    if (k === this.texKey) return;
    this.texKey = k;
    this.sprite.anims.stop();
    this.sprite.setTexture(k, frameIndex(this.dir, this.sitting ? 'sit' : 'stand'));
    if (this.moving) this.sprite.play(`${k}:walk:${this.dir}`, true);
  }

  face(dir: CharDir): void {
    this.dir = dir;
    if (!this.moving) this.sprite.setFrame(frameIndex(dir, this.sitting ? 'sit' : 'stand'));
  }

  setSitting(sit: boolean, dir?: CharDir): void {
    this.sitting = sit;
    if (dir) this.dir = dir;
    this.moving = false;
    this.sprite.anims.stop();
    this.sprite.setFrame(frameIndex(this.dir, sit ? 'sit' : 'stand'));
  }

  setMoving(moving: boolean, dir: CharDir): void {
    if (moving) {
      this.sitting = false;
      const key = `${this.texKey}:walk:${dir}`;
      if (!this.moving || this.dir !== dir || this.sprite.anims.currentAnim?.key !== key) this.sprite.play(key, true);
    } else if (this.moving) {
      this.sprite.anims.stop();
      this.sprite.setFrame(frameIndex(dir, 'stand'));
    }
    this.moving = moving;
    this.dir = dir;
  }

  setPos(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.sync();
  }

  walkPath(path: Pt[], speed: number, onArrive: (() => void) | null = null): void {
    this.path = path.slice();
    this.speed = speed;
    this.onArrive = onArrive;
    if (this.path.length === 0 && onArrive) onArrive();
  }

  stop(): void {
    this.path = [];
    this.setMoving(false, this.dir);
  }

  /** Advance along the current path. */
  update(dtMs: number, now: number): void {
    if (this.path.length > 0) {
      const target = this.path[0];
      const tx = target.x * 16 + 8;
      const ty = target.y * 16 + 14;
      const dx = tx - this.x;
      const dy = ty - this.y;
      const dist = Math.hypot(dx, dy);
      const step = (this.speed * dtMs) / 1000;
      const dir: CharDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      if (dist <= step) {
        this.x = tx;
        this.y = ty;
        this.path.shift();
        if (this.path.length === 0) {
          this.setMoving(false, dir);
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        this.setMoving(true, dir);
      }
    }
    if (this.emote && now > this.emoteUntil) {
      this.emote.destroy();
      this.emote = null;
    }
    if (this.bubble && now > this.bubbleUntil) {
      this.bubble.destroy();
      this.bubble = null;
    }
    this.sync();
  }

  sync(): void {
    const yy = Math.round(this.y + this.bob);
    this.sprite.setPosition(Math.round(this.x), yy + (this.sitting ? 2 : 0));
    this.shadow.setPosition(Math.round(this.x), Math.round(this.y) - 1);
    const d = this.fixedDepth ?? this.y + this.depthBias;
    this.sprite.setDepth(d);
    this.shadow.setDepth(d - 0.5);
    this.shadow.setVisible(!this.sitting);
    this.sprite.setAlpha(this.alpha);
    this.shadow.setAlpha(this.alpha);
    if (this.label) this.label.setPosition(Math.round(this.x), Math.round(this.y) - 34);
    const bx = Math.round(this.x + this.bubbleDx);
    if (this.emote) this.emote.setPosition(bx, Math.round(this.y) - 34 - (this.label ? 6 : 0));
    if (this.bubble) this.bubble.setPosition(bx, Math.round(this.y) - 35 - (this.label ? 7 : 0) - (this.emote ? 14 : 0));
  }

  /** Short speech bubble above the head. */
  say(text: string, ms: number, now: number): void {
    if (!this.bubble) {
      this.bubble = this.scene.add
        .text(this.x, this.y - 36, text, {
          fontFamily: WORLD_FONT,
          fontSize: '6px',
          color: '#241b30',
          backgroundColor: '#f4f1eaee',
          padding: { x: 3, y: 2 },
          resolution: TEXT_RES,
          wordWrap: { width: 120, useAdvancedWrap: true },
          align: 'center',
        })
        .setOrigin(0.5, 1)
        .setDepth(LABEL_DEPTH + 3);
      smoothText(this.bubble);
    } else this.bubble.setText(text);
    this.bubbleUntil = now + ms;
    this.sync();
  }

  setLabel(text: string | null, color = '#f4f1ea'): void {
    if (!text) {
      this.label?.destroy();
      this.label = null;
      return;
    }
    if (!this.label) {
      this.label = this.scene.add
        .text(this.x, this.y - 34, text, {
          fontFamily: WORLD_FONT,
          fontSize: '6px',
          color,
          stroke: '#120d1f',
          strokeThickness: 2,
          resolution: TEXT_RES,
        })
        .setOrigin(0.5, 1)
        .setDepth(LABEL_DEPTH);
      smoothText(this.label);
    } else {
      this.label.setText(text).setColor(color);
    }
    this.sync();
  }

  showEmote(e: string, ms: number, now: number): void {
    const ref = frameRef(`emote:${e}`);
    if (!this.emote) this.emote = this.scene.add.image(this.x, this.y - 34, ref.key, ref.frame).setOrigin(0.5, 1).setDepth(LABEL_DEPTH + 1);
    else this.emote.setTexture(ref.key, ref.frame);
    this.emoteUntil = now + ms;
    this.sync();
  }

  bounds(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(this.x - 7, this.y - 28, 14, 28);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.label?.destroy();
    this.emote?.destroy();
    this.bubble?.destroy();
  }
}

/** Text is rendered at high resolution and downsampled smoothly even in pixel-art mode. */
/** Text is drawn with the pixel font at its native size; keep its pixels hard when the camera scales it. */
export function smoothText(t: Phaser.GameObjects.Text): void {
  t.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
}
