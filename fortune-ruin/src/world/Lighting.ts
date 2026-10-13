import Phaser from 'phaser';

export interface LightSource {
  x: number;
  y: number;
  r: number;
  color: number;
  /** lit even in daytime (interior lamps, neon) */
  always?: boolean;
  flicker?: number;
  /** erase strength 0..1 (default 0.95) */
  strength?: number;
}

/** A texture frame whose opaque pixels shine through the darkness (lit windows, neon). */
export interface Emissive {
  key: string;
  frame: string;
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
}

export const DARK_DEPTH = 150000;
export const GLOW_DEPTH = 150001;

interface FrameSrc {
  img: CanvasImageSource;
  sx: number;
  sy: number;
  w: number;
  h: number;
}

let seq = 0;

/**
 * Darkness overlay drawn on a small 2D canvas at world resolution each frame:
 * fill with the ambient colour, then cut light pools and emissive pixels out
 * with `destination-out`, and upload it as a texture. A pool of additive
 * images adds coloured glow on top.
 */
export class Lighting {
  private key: string;
  private tex: Phaser.Textures.CanvasTexture | null = null;
  private img: Phaser.GameObjects.Image | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private light: CanvasImageSource;
  private frames = new Map<string, FrameSrc | null>();
  private glows: Phaser.GameObjects.Image[] = [];
  private w = 0;
  private h = 0;

  constructor(private scene: Phaser.Scene) {
    this.key = `__darkness${++seq}`;
    this.light = scene.textures.get('light').getSourceImage() as CanvasImageSource;
  }

  private ensureSize(w: number, h: number): void {
    const W = Math.ceil(w) + 4;
    const H = Math.ceil(h) + 4;
    if (W === this.w && H === this.h && this.tex) return;
    this.w = W;
    this.h = H;
    this.img?.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    this.tex = this.scene.textures.createCanvas(this.key, W, H)!;
    this.ctx = this.tex.getContext();
    this.img = this.scene.add.image(0, 0, this.key).setOrigin(0, 0).setDepth(DARK_DEPTH);
  }

  private frameSrc(key: string, frame: string): FrameSrc | null {
    const k = `${key}|${frame}`;
    if (this.frames.has(k)) return this.frames.get(k)!;
    let src: FrameSrc | null = null;
    const f = this.scene.textures.getFrame(key, frame);
    if (f) src = { img: f.source.image as CanvasImageSource, sx: f.cutX, sy: f.cutY, w: f.cutWidth, h: f.cutHeight };
    this.frames.set(k, src);
    return src;
  }

  /**
   * @param darkness 0 = no overlay, 1 = full darkness
   * @param glowStrength 0..1 multiplier for coloured glows
   */
  render(cam: Phaser.Cameras.Scene2D.Camera, darkness: number, color: number, lights: LightSource[], glowStrength: number, time: number, emissive: Emissive[] = []): void {
    const view = cam.worldView;
    this.ensureSize(view.width, view.height);
    const ox = Math.floor(view.x) - 2;
    const oy = Math.floor(view.y) - 2;
    const img = this.img!;
    const ctx = this.ctx!;
    img.setPosition(ox, oy);
    const visible = (x: number, y: number, r: number) => !(x + r < view.x || x - r > view.right || y + r < view.y || y - r > view.bottom);
    if (darkness <= 0.01) {
      img.setVisible(false);
    } else {
      img.setVisible(true);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.fillStyle = `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${Math.min(0.92, darkness)})`;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = 'destination-out';
      for (const l of lights) {
        if (!l.always && darkness < 0.05) continue;
        if (!visible(l.x, l.y, l.r)) continue;
        const flick = l.flicker ? 1 + Math.sin(time / 90 + l.x) * l.flicker : 1;
        const d = l.r * 2 * flick;
        ctx.globalAlpha = l.strength ?? 0.86;
        ctx.drawImage(this.light, l.x - ox - d / 2, l.y - oy - d / 2, d, d);
      }
      for (const e of emissive) {
        if (e.alpha <= 0.02) continue;
        if (e.x + e.w < view.x || e.x > view.right || e.y + e.h < view.y || e.y > view.bottom) continue;
        const f = this.frameSrc(e.key, e.frame);
        if (!f) continue;
        ctx.globalAlpha = Math.min(1, e.alpha);
        ctx.drawImage(f.img, f.sx, f.sy, f.w, f.h, Math.round(e.x - ox), Math.round(e.y - oy), f.w, f.h);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      this.tex!.refresh();
    }
    // coloured glows
    let glowIdx = 0;
    const g = glowStrength * Math.min(1, darkness * 1.6 + 0.15);
    if (g > 0.02) {
      for (const l of lights) {
        if (!visible(l.x, l.y, l.r)) continue;
        if (l.color === 0xffffff) continue;
        if (!l.always && darkness < 0.05) continue;
        let im = this.glows[glowIdx];
        if (!im) {
          im = this.scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(GLOW_DEPTH);
          this.glows.push(im);
        }
        im.setVisible(true).setPosition(l.x, l.y).setTint(l.color).setScale((l.r * 1.1) / 64).setAlpha(0.32 * g);
        glowIdx++;
        if (glowIdx > 90) break;
      }
    }
    for (let i = glowIdx; i < this.glows.length; i++) this.glows[i].setVisible(false);
  }

  destroy(): void {
    this.img?.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    for (const g of this.glows) g.destroy();
    this.glows = [];
    this.frames.clear();
  }
}

export function hexColor(s: string): number {
  return parseInt(s.replace('#', ''), 16);
}
