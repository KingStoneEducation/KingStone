import Phaser from 'phaser';
import { GLOW_DEPTH } from './Lighting';
import { frameRef } from './textures';
import type { Conditions } from '../systems/WeatherSystem';

/** Where the player is, as far as the weather goes: under the sky, under a roof with windows, or where no window is. */
export type Exposure = 'out' | 'in' | 'sealed';

const RAIN_DEPTH = GLOW_DEPTH + 2;
const FLASH_DEPTH = GLOW_DEPTH + 4;
/** the view at the usual zoom, for scaling the number of drops to what is on screen */
const VIEW_AREA = 432 * 248;

interface Drop {
  img: Phaser.GameObjects.Image;
  /** position in the camera's view */
  x: number;
  y: number;
  /** where in the view it lands */
  land: number;
  speed: number;
}

interface Splash {
  img: Phaser.GameObjects.Image;
  born: number;
}

interface Bank {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  v: number;
}

/**
 * The weather over the world: rain falling through the camera's view and splashing where it
 * lands (straight down in a shower, slanting in a downpour, driven sideways in a storm), fog
 * lying over everything with banks of it drifting across, and lightning. All of it outdoors;
 * under a roof only the lightning, faintly, through the windows; nothing where there are none.
 */
export class WeatherFx {
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private spare: Phaser.GameObjects.Image[] = [];
  private banks: Bank[] = [];
  private fogFill: Phaser.GameObjects.Rectangle;
  private flash: Phaser.GameObjects.Rectangle;
  private flashAt = -1e9;
  private flashScale = 1;
  private nextBolt = -1;
  private seed = 1;
  private streak = '';

  constructor(
    private scene: Phaser.Scene,
    private exposure: () => Exposure,
    private thunder: (strength: number, delayMs: number, muffled: boolean) => void,
  ) {
    this.fogFill = scene.add.rectangle(0, 0, 8, 8, 0xc8ccd4, 0).setOrigin(0, 0).setDepth(RAIN_DEPTH - 1).setVisible(false);
    this.flash = scene.add.rectangle(0, 0, 8, 8, 0xeef2ff, 0).setOrigin(0, 0).setDepth(FLASH_DEPTH).setVisible(false);
  }

  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** How many drops are in the air (for the play-tests). */
  dropCount(): number {
    return this.drops.length;
  }

  /** Whether the last lightning is still lighting the sky. */
  flashing(time: number): boolean {
    return time - this.flashAt < 420;
  }

  update(dt: number, time: number, c: Conditions, darkness: number): void {
    const v = this.scene.cameras.main.worldView;
    const ex = this.exposure();
    this.updateRain(dt, time, v, ex === 'out' ? c : null, darkness);
    this.updateFog(dt, v, ex === 'out' ? c.fog : 0, darkness);
    this.updateLightning(time, v, ex, c.storm);
  }

  // ------------------------------------------------------------------ rain

  private updateRain(dt: number, time: number, v: Phaser.Geom.Rectangle, c: Conditions | null, darkness: number): void {
    const raining = !!c && c.raining;
    const per = raining ? (c!.storm ? 260 : 36 + 170 * c!.intensity) : 0;
    const want = Math.round((per * (v.width * v.height)) / VIEW_AREA);
    const streak = !c ? 'rain' : c.storm ? 'rain_storm' : c.intensity > 0.7 ? 'rain_slant' : 'rain';
    // drops per pixel of fall: straight down, a slant, or driven by the wind
    const drift = streak === 'rain_storm' ? -0.42 : streak === 'rain_slant' ? -0.2 : -0.05;
    if (streak !== this.streak) {
      this.streak = streak;
      const ref = frameRef(`fx:${streak}`);
      for (const d of this.drops) d.img.setTexture(ref.key, ref.frame);
    }
    while (this.drops.length < want) this.drops.push(this.newDrop(v, true));
    while (this.drops.length > want) this.drops.pop()!.img.destroy();
    const alpha = 0.85 - 0.45 * darkness;
    for (const d of this.drops) {
      const step = (d.speed * dt) / 1000;
      d.y += step;
      d.x += step * drift;
      if (d.y >= d.land) {
        if (this.rnd() < 0.55) this.splash(v.x + d.x, v.y + d.land, time, alpha);
        this.reset(d, v, false);
      }
      d.img.setPosition(Math.round(v.x + d.x), Math.round(v.y + d.y)).setAlpha(alpha);
    }
    this.splashes = this.splashes.filter((s) => {
      const age = time - s.born;
      if (age > 170) {
        s.img.setVisible(false);
        this.spare.push(s.img);
        return false;
      }
      s.img.setAlpha(alpha * (1 - age / 170));
      return true;
    });
  }

  private newDrop(v: Phaser.Geom.Rectangle, scatter: boolean): Drop {
    const ref = frameRef(`fx:${this.streak || 'rain'}`);
    const img = this.scene.add.image(0, 0, ref.key, ref.frame).setOrigin(0.5, 1).setDepth(RAIN_DEPTH);
    const d: Drop = { img, x: 0, y: 0, land: 0, speed: 0 };
    this.reset(d, v, scatter);
    return d;
  }

  private reset(d: Drop, v: Phaser.Geom.Rectangle, scatter: boolean): void {
    d.speed = 230 + this.rnd() * 110;
    d.land = v.height * (0.08 + this.rnd() * 0.97);
    // the wind carries them leftwards: start a little to the right of the view
    d.x = -10 + this.rnd() * (v.width + 70);
    d.y = scatter ? this.rnd() * d.land : -4 - this.rnd() * 30;
  }

  private splash(x: number, y: number, time: number, alpha: number): void {
    if (this.splashes.length > 90) return;
    let img = this.spare.pop();
    if (!img) {
      const ref = frameRef('fx:splash');
      img = this.scene.add.image(0, 0, ref.key, ref.frame).setOrigin(0.5, 1).setDepth(RAIN_DEPTH);
    }
    img.setVisible(true).setPosition(Math.round(x), Math.round(y) + 1).setAlpha(alpha);
    this.splashes.push({ img, born: time });
  }

  // ------------------------------------------------------------------ fog

  private updateFog(dt: number, v: Phaser.Geom.Rectangle, fog: number, darkness: number): void {
    if (fog <= 0.02) {
      if (this.fogFill.visible) this.fogFill.setVisible(false);
      for (const b of this.banks) b.img.setVisible(false);
      return;
    }
    // pale by day, a dull blue-grey at night
    const day = 1 - darkness;
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0x5a6274), Phaser.Display.Color.ValueToColor(0xd2d6dc), 100, Math.round(day * 100));
    const color = Phaser.Display.Color.GetColor(col.r, col.g, col.b);
    this.fogFill.setVisible(true).setPosition(v.x - 2, v.y - 2).setSize(v.width + 4, v.height + 4).setFillStyle(color, fog * (0.22 + 0.16 * day));
    if (this.banks.length === 0) {
      for (let i = 0; i < 6; i++) {
        const img = this.scene.add.image(0, 0, 'glow').setDepth(RAIN_DEPTH - 0.5);
        this.banks.push({ img, x: this.rnd() * v.width, y: this.rnd() * v.height, v: 3 + this.rnd() * 6 });
      }
    }
    for (const b of this.banks) {
      b.x += (b.v * dt) / 1000;
      if (b.x > v.width + 160) {
        b.x = -160;
        b.y = this.rnd() * v.height;
      }
      b.img
        .setVisible(true)
        .setPosition(Math.round(v.x + b.x), Math.round(v.y + b.y))
        .setScale(5.2, 1.5)
        .setTint(color)
        .setAlpha(fog * (0.3 + 0.18 * day));
    }
  }

  // ------------------------------------------------------------------ lightning

  private updateLightning(time: number, v: Phaser.Geom.Rectangle, ex: Exposure, storm: boolean): void {
    if (!storm || ex === 'sealed') {
      this.nextBolt = -1;
      if (this.flash.visible) this.flash.setVisible(false);
      return;
    }
    if (this.nextBolt < 0) this.nextBolt = time + 3000 + this.rnd() * 9000;
    if (time >= this.nextBolt) {
      this.flashAt = time;
      this.flashScale = ex === 'out' ? 1 : 0.2;
      this.nextBolt = time + 7000 + this.rnd() * 17000;
      // the nearer the strike, the sooner and louder the thunder
      const near = this.rnd();
      this.thunder(0.45 + near * 0.55, 400 + (1 - near) * 2600, ex !== 'out');
    }
    const age = time - this.flashAt;
    if (age > 420) {
      if (this.flash.visible) this.flash.setVisible(false);
      return;
    }
    // a bright flash, a flicker, a second flash, and it fades
    const a = age < 60 ? 0.55 : age < 110 ? 0.12 : age < 170 ? 0.42 : 0.42 * (1 - (age - 170) / 250);
    this.flash.setVisible(true).setPosition(v.x - 2, v.y - 2).setSize(v.width + 4, v.height + 4).setFillStyle(0xeef2ff, Math.max(0, a) * this.flashScale);
  }

  destroy(): void {
    for (const d of this.drops) d.img.destroy();
    for (const s of this.splashes) s.img.destroy();
    for (const s of this.spare) s.destroy();
    for (const b of this.banks) b.img.destroy();
    this.drops = [];
    this.splashes = [];
    this.spare = [];
    this.banks = [];
    this.fogFill.destroy();
    this.flash.destroy();
  }
}
