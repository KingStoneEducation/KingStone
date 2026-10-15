import Phaser from 'phaser';
import { GLOW_DEPTH } from './Lighting';
import { BUILDING_OFFSET, frameRef } from './textures';
import { BUILDING_BY_ID } from './maps/cityLayout';
import type { MapData } from './maps/types';
import { puddleSpots, snowRoof, snowSteps, type Puddle, type SnowLayers } from './groundWeather';
import { PROPS } from '../art/props';
import { roofHeight } from '../art/buildings';
import type { Conditions } from '../systems/WeatherSystem';

/** Where the player is, as far as the weather goes: under the sky, under a roof with windows, or where no window is. */
export type Exposure = 'out' | 'in' | 'sealed';

const RAIN_DEPTH = GLOW_DEPTH + 2;
const FLASH_DEPTH = GLOW_DEPTH + 4;
/** on the ground, under the shadows (so the buildings and trees still throw them on the snow) */
const SNOW_DEPTH = -905;
const PUDDLE_DEPTH = -904;
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

interface Flake {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  land: number;
  speed: number;
  /** the bigger flakes fall a little faster */
  big: boolean;
  /** where in its side-to-side sway it is, and how far it sways */
  phase: number;
  sway: number;
}

interface PuddleView {
  img: Phaser.GameObjects.Image;
  p: Puddle;
}

/** One pane of an indoor window, between the frame and the glazing bars (world pixels). */
interface Pane {
  x: number;
  y: number;
  w: number;
  h: number;
  /** the bottom row of panes, where snow gathers on the sill */
  low: boolean;
  seed: number;
}

/** 0..1 noise from three numbers, for things on the glass that need to look random but hold still. */
function h3(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 1440662683) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

let snowSeq = 0;

/**
 * The weather over the world: rain falling through the camera's view and splashing where it
 * lands (straight down in a shower, slanting in a downpour, driven sideways in a storm), snow
 * drifting down, fog lying over everything with banks of it drifting across, and lightning.
 * On the ground: snow lying (and on the roofs), melting away after; puddles on the paving
 * while it rains and for a few hours after, with rings spreading in them while it still does.
 * Under a roof: the rain running down the window glass, or snow going past it, and the
 * lightning, faintly; nothing where there are no windows.
 */
export class WeatherFx {
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private spare: Phaser.GameObjects.Image[] = [];
  private banks: Bank[] = [];
  private flakes: Flake[] = [];
  private map: MapData | null = null;
  /** the snow on the ground (the first of it, then the rest) and on the roofs */
  private snowLayers: Phaser.GameObjects.Image[] = [];
  private snowKeys: string[] = [];
  /** the snow being drawn, a little each frame */
  private snowJob: Generator<void, SnowLayers, void> | null = null;
  /** the first frame on this map (the change of scene hides any work done in it) */
  private arrived = true;
  private roofs: Phaser.GameObjects.Image[] = [];
  private puddleSpots: Puddle[] = [];
  private puddles: PuddleView[] = [];
  private puddleAlpha = -1;
  private inView: PuddleView[] = [];
  private inViewAt = -1e9;
  private ripples: Splash[] = [];
  private rippleSpare: Phaser.GameObjects.Image[] = [];
  private rippleDue = 0;
  private panes: Pane[] = [];
  private glass: Phaser.GameObjects.Graphics | null = null;
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

  /** What is showing on the ground and the glass (for the play-tests). */
  groundState(): { flakes: number; snow: number; full: number; roofs: number; puddles: number; puddleAlpha: number; ripples: number; panes: number } {
    return {
      flakes: this.flakes.length,
      snow: this.snowLayers[0]?.visible ? this.snowLayers[0].alpha : 0,
      full: this.snowLayers[1]?.visible ? this.snowLayers[1].alpha : 0,
      roofs: this.roofs.filter((r) => r.visible).length,
      puddles: this.puddles.filter((p) => p.img.visible).length,
      puddleAlpha: Math.max(0, this.puddleAlpha),
      ripples: this.ripples.length,
      panes: this.panes.length,
    };
  }

  /**
   * The map the weather is falling on: where its puddles stand, and (indoors) where its
   * windows are. The snow layers are only drawn the first time snow is lying.
   */
  setMap(map: MapData): void {
    this.map = map;
    this.arrived = true;
    this.puddleSpots = puddleSpots(map);
    this.panes = [];
    if (map.outdoor) return;
    let depth = -1e9;
    let seed = 1;
    for (const p of map.props) {
      if (p.id !== 'window' && p.id !== 'window_tall') continue;
      const d = PROPS[p.id];
      const x = Math.round(p.x * 16 + (16 - d.w) / 2 + (p.ox ?? 0));
      const y = Math.round((p.y + 1) * 16 - d.h + (p.oy ?? 0) + (d.dy ?? 0));
      // the glass inside the frame, split by the glazing bars into four
      const mx = x + Math.floor(d.w / 2);
      const my = y + Math.floor(d.h / 2);
      const cols = [
        [x + 2, mx - (x + 2)],
        [mx + 1, x + d.w - 2 - (mx + 1)],
      ];
      const rows = [
        [y + 2, my - (y + 2), false],
        [my + 1, y + d.h - 2 - (my + 1), true],
      ] as const;
      for (const [px, pw] of cols) for (const [py, ph, low] of rows) if (pw > 1 && ph > 1) this.panes.push({ x: px, y: py, w: pw, h: ph, low, seed: seed++ });
      depth = Math.max(depth, -800 + p.y + 0.1);
    }
    if (this.panes.length) this.glass = this.scene.add.graphics().setDepth(depth);
  }

  /** Whether the last lightning is still lighting the sky. */
  flashing(time: number): boolean {
    return time - this.flashAt < 420;
  }

  update(dt: number, time: number, c: Conditions, darkness: number): void {
    const v = this.scene.cameras.main.worldView;
    const ex = this.exposure();
    this.updateRain(dt, time, v, ex === 'out' && !c.snowing ? c : null, darkness);
    this.updateSnow(dt, time, v, ex === 'out' && c.snowing ? c : null, darkness);
    this.updateGround(dt, time, v, c);
    this.updateGlass(time, ex === 'in' ? c : null);
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

  // ------------------------------------------------------------------ snow

  private updateSnow(dt: number, time: number, v: Phaser.Geom.Rectangle, c: Conditions | null, darkness: number): void {
    const per = c ? 40 + 120 * c.intensity : 0;
    const want = Math.round((per * (v.width * v.height)) / VIEW_AREA);
    while (this.flakes.length < want) this.flakes.push(this.newFlake(v));
    while (this.flakes.length > want) this.flakes.pop()!.img.destroy();
    // snow still shows white at night, under the lamps
    const alpha = 0.95 - 0.3 * darkness;
    const t = time / 1000;
    for (const f of this.flakes) {
      const step = (f.speed * dt) / 1000;
      f.y += step;
      // a breath of wind off the sea
      f.x -= step * 0.18;
      if (f.y >= f.land) this.resetFlake(f, v, false);
      const sway = Math.sin(t * 1.3 + f.phase) * f.sway;
      const settle = Math.min(1, (f.land - f.y) / 10 + 0.25);
      f.img.setPosition(Math.round(v.x + f.x + sway), Math.round(v.y + f.y)).setAlpha(alpha * settle);
    }
  }

  private newFlake(v: Phaser.Geom.Rectangle): Flake {
    const big = this.rnd() < 0.35;
    const ref = frameRef(big ? 'fx:flake' : 'fx:flake_s');
    const img = this.scene.add.image(0, 0, ref.key, ref.frame).setOrigin(0.5, 0.5).setDepth(RAIN_DEPTH);
    const f: Flake = { img, x: 0, y: 0, land: 0, speed: 0, big, phase: 0, sway: 0 };
    this.resetFlake(f, v, true);
    return f;
  }

  private resetFlake(f: Flake, v: Phaser.Geom.Rectangle, scatter: boolean): void {
    f.speed = 18 + this.rnd() * 24 + (f.big ? 8 : 0);
    f.land = v.height * (0.05 + this.rnd() * 1.0);
    f.x = -10 + this.rnd() * (v.width + 40);
    f.y = scatter ? this.rnd() * f.land : -4 - this.rnd() * 20;
    f.phase = this.rnd() * Math.PI * 2;
    f.sway = 2 + this.rnd() * 4;
  }

  // ------------------------------------------------------------------ on the ground

  private updateGround(dt: number, time: number, v: Phaser.Geom.Rectangle, c: Conditions): void {
    const m = this.map;
    if (!m || !m.outdoor) return;
    const cover = c.snowCover;
    // drawn as soon as it starts to snow, a few milliseconds a frame; all at once on arriving somewhere it already lies
    if (this.snowLayers.length === 0 && (cover > 0.005 || c.snowing)) {
      this.snowJob ??= snowSteps(m);
      const start = performance.now();
      for (;;) {
        const r = this.snowJob.next();
        if (r.done) {
          this.laySnow(m, r.value);
          this.snowJob = null;
          break;
        }
        if (!this.arrived && performance.now() - start > 4) break;
      }
    }
    this.arrived = false;
    if (this.snowLayers.length) {
      const [patch, full] = this.snowLayers;
      // the first of it settles in patches; the rest fills in once it has been coming down a while
      patch.setVisible(cover > 0.005).setAlpha(Math.min(1, cover / 0.45));
      full.setVisible(cover > 0.4).setAlpha(clamp01((cover - 0.4) / 0.6));
      // the roofs are colder than the street: they whiten first
      const ra = Math.min(1, cover / 0.3) * 0.96;
      for (const r of this.roofs) r.setVisible(ra > 0.01).setAlpha(ra);
    }
    // puddles while it rains and for a while after, and in the slush when snow melts; none under the snow
    const a = 0.72 * c.wet * (1 - Math.min(1, cover * 2.5));
    if (a > 0.01 && this.puddles.length === 0) {
      for (const p of this.puddleSpots) {
        const ref = frameRef(`fx:puddle${p.size}`);
        const img = this.scene.add.image(p.x, p.y, ref.key, ref.frame).setOrigin(0.5, 0.5).setDepth(PUDDLE_DEPTH).setVisible(false);
        this.puddles.push({ img, p });
      }
    }
    const shown = a > 0.01 ? Math.round(a * 50) / 50 : 0;
    if (shown !== this.puddleAlpha) {
      this.puddleAlpha = shown;
      for (const pv of this.puddles) pv.img.setVisible(shown > 0).setAlpha(shown);
    }
    this.updateRipples(dt, time, v, shown > 0.15 && c.raining && !c.snowing ? c.intensity : 0, shown);
  }

  private laySnow(m: MapData, layers: SnowLayers): void {
    const n = ++snowSeq;
    for (const [name, canvas] of [['patch', layers.patch], ['full', layers.full]] as const) {
      const key = `snow:${m.id}:${name}:${n}`;
      this.scene.textures.addCanvas(key, canvas)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.snowKeys.push(key);
      this.snowLayers.push(this.scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(SNOW_DEPTH).setVisible(false));
    }
    for (const id of m.buildings) {
      const bd = BUILDING_BY_ID[id];
      if (!bd) continue;
      // each roof is whitened once and kept: the buildings never change
      const key = `snowroof:${id}`;
      if (!this.scene.textures.exists(key)) {
        const ref = frameRef(`bld:${id}`);
        const fr = this.scene.textures.getFrame(ref.key, ref.frame);
        const canvas = snowRoof(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY, fr.width, roofHeight(bd));
        this.scene.textures.addCanvas(key, canvas)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
      const img = this.scene.add
        .image(bd.x * 16, bd.y * 16 + (BUILDING_OFFSET[id] ?? 0), key)
        .setOrigin(0, 0)
        .setDepth((bd.y + bd.h) * 16 - 2 + 0.01)
        .setVisible(false);
      this.roofs.push(img);
    }
  }

  /** Rings spreading in the puddles that are on screen, more of them the harder it rains. */
  private updateRipples(dt: number, time: number, v: Phaser.Geom.Rectangle, rate: number, alpha: number): void {
    if (rate > 0 && this.puddles.length) {
      if (time - this.inViewAt > 500) {
        this.inViewAt = time;
        this.inView = this.puddles.filter((pv) => pv.p.x > v.x - 12 && pv.p.x < v.right + 12 && pv.p.y > v.y - 6 && pv.p.y < v.bottom + 6);
      }
      if (this.inView.length) {
        this.rippleDue += (dt / 1000) * this.inView.length * (0.5 + 2.5 * rate);
        while (this.rippleDue >= 1) {
          this.rippleDue -= 1;
          if (this.ripples.length > 60) break;
          const pv = this.inView[Math.floor(this.rnd() * this.inView.length)];
          const spread = [3, 5, 8][pv.p.size];
          let img = this.rippleSpare.pop();
          if (!img) {
            const ref = frameRef('fx:drip_ring');
            img = this.scene.add.image(0, 0, ref.key, ref.frame).setOrigin(0.5, 0.5).setDepth(PUDDLE_DEPTH + 0.5);
          }
          img.setVisible(true).setPosition(Math.round(pv.p.x + (this.rnd() - 0.5) * spread * 2), Math.round(pv.p.y + (this.rnd() - 0.5) * 2));
          this.ripples.push({ img, born: time });
        }
      }
    } else this.rippleDue = 0;
    this.ripples = this.ripples.filter((r) => {
      const age = time - r.born;
      if (age > 600) {
        r.img.setVisible(false);
        this.rippleSpare.push(r.img);
        return false;
      }
      const k = age / 600;
      r.img.setScale(0.45 + k, 0.45 + k).setAlpha((1 - k) * Math.min(1, alpha * 1.6));
      return true;
    });
  }

  // ------------------------------------------------------------------ indoor windows

  /** The weather seen through the windows: drops beading and running down the glass, or snow going past. */
  private updateGlass(time: number, c: Conditions | null): void {
    const g = this.glass;
    if (!g) return;
    g.clear();
    if (!c) return;
    const t = time / 1000;
    for (const p of this.panes) {
      // a grey sky outside
      if (c.overcast > 0.05) g.fillStyle(0x5a6476, 0.38 * c.overcast).fillRect(p.x, p.y, p.w, p.h);
      if (c.raining && !c.snowing) {
        const beads = 2 + Math.round(4 * c.intensity) + (c.storm ? 3 : 0);
        for (let k = 0; k < beads; k++) {
          // each bead sits a few seconds, then runs off and another forms somewhere else
          const life = 3 + h3(p.seed, k, 7) * 4;
          const epoch = Math.floor(t / life + h3(p.seed, k, 11));
          const bx = p.x + Math.floor(h3(p.seed, k, epoch) * p.w);
          const by = p.y + Math.floor(h3(p.seed, k + 50, epoch) * p.h);
          g.fillStyle(0xdce8f6, 0.7).fillRect(bx, by, 1, 1);
        }
        const runs = 1 + Math.round(2 * c.intensity) + (c.storm ? 1 : 0);
        for (let k = 0; k < runs; k++) {
          const speed = 3 + h3(p.seed, k, 13) * 6;
          const span = p.h + 6;
          const along = t * speed + h3(p.seed, k, 17) * 100;
          const lap = Math.floor(along / span);
          const head = (along % span) - 3;
          const rx = p.x + Math.floor(h3(p.seed, k + 90, lap) * p.w);
          const top = Math.max(0, Math.round(head) - 4);
          const bottom = Math.min(p.h - 1, Math.round(head));
          if (bottom >= top) g.fillStyle(0xcfdcec, 0.45).fillRect(rx, p.y + top, 1, bottom - top + 1);
          if (head >= 0 && head < p.h) g.fillStyle(0xe8f0fa, 0.85).fillRect(rx, p.y + Math.round(head), 1, 1);
        }
      } else if (c.snowing) {
        const flakes = 1 + Math.round(2 * c.intensity);
        for (let k = 0; k < flakes; k++) {
          const speed = 6 + h3(p.seed, k, 19) * 6;
          const fy = (t * speed + h3(p.seed, k, 23) * 50) % p.h;
          const fx = (((h3(p.seed, k, 29) * p.w + Math.sin(t * 1.5 + k * 2) * 2) % p.w) + p.w) % p.w;
          g.fillStyle(0xf4f8ff, 0.9).fillRect(p.x + Math.floor(fx), p.y + Math.floor(fy), 1, 1);
        }
      }
      // snow gathered on the sill outside
      if (p.low && c.snowCover > 0.15) {
        g.fillStyle(0xf2f6fc, Math.min(1, c.snowCover * 1.5)).fillRect(p.x, p.y + p.h - 1, p.w, 1);
        if (c.snowCover > 0.6) for (let i = 0; i < p.w; i++) if (h3(p.seed, i, 31) < 0.5) g.fillRect(p.x + i, p.y + p.h - 2, 1, 1);
      }
    }
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
    for (const f of this.flakes) f.img.destroy();
    for (const p of this.puddles) p.img.destroy();
    for (const r of this.ripples) r.img.destroy();
    for (const r of this.rippleSpare) r.destroy();
    for (const img of [...this.snowLayers, ...this.roofs]) img.destroy();
    // the ground's snow goes with the map; the whitened roofs are kept for next time
    for (const key of this.snowKeys) if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.glass?.destroy();
    this.snowJob = null;
    this.drops = [];
    this.splashes = [];
    this.spare = [];
    this.banks = [];
    this.flakes = [];
    this.puddles = [];
    this.ripples = [];
    this.rippleSpare = [];
    this.snowLayers = [];
    this.snowKeys = [];
    this.roofs = [];
    this.inView = [];
    this.panes = [];
    this.glass = null;
    this.map = null;
    this.fogFill.destroy();
    this.flash.destroy();
  }
}
