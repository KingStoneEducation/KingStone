import Phaser from 'phaser';

export interface LightSource {
  x: number;
  y: number;
  r: number;
  color: number;
  /** lit even in daytime (interior lamps, neon) */
  always?: boolean;
  flicker?: number;
}

export const DARK_DEPTH = 150000;
export const GLOW_DEPTH = 150001;

/**
 * Darkness overlay with light "holes" punched by radial gradients, plus a
 * pool of additive coloured glows. Rendered in world space over the view.
 */
export class Lighting {
  private rt: Phaser.GameObjects.RenderTexture;
  private brush: Phaser.GameObjects.Image;
  private glows: Phaser.GameObjects.Image[] = [];
  private w = 0;
  private h = 0;

  constructor(private scene: Phaser.Scene) {
    this.rt = scene.add.renderTexture(0, 0, 8, 8).setOrigin(0, 0).setDepth(DARK_DEPTH);
    this.brush = scene.make.image({ x: 0, y: 0, key: 'light', add: false }).setOrigin(0.5, 0.5);
  }

  private ensureSize(w: number, h: number): void {
    const W = Math.ceil(w) + 4;
    const H = Math.ceil(h) + 4;
    if (W !== this.w || H !== this.h) {
      this.rt.resize(W, H);
      this.w = W;
      this.h = H;
    }
  }

  /**
   * @param darkness 0 = no overlay, 1 = full darkness
   * @param glowStrength 0..1 multiplier for coloured glows
   */
  render(cam: Phaser.Cameras.Scene2D.Camera, darkness: number, color: number, lights: LightSource[], glowStrength: number, time: number): void {
    const view = cam.worldView;
    this.ensureSize(view.width, view.height);
    const ox = Math.floor(view.x) - 2;
    const oy = Math.floor(view.y) - 2;
    this.rt.setPosition(ox, oy);
    let glowIdx = 0;
    if (darkness <= 0.01) {
      this.rt.setVisible(false);
    } else {
      this.rt.setVisible(true);
      this.rt.clear();
      this.rt.fill(color, Math.min(0.92, darkness));
      for (const l of lights) {
        if (!l.always && darkness < 0.05) continue;
        if (l.x + l.r < view.x || l.x - l.r > view.right || l.y + l.r < view.y || l.y - l.r > view.bottom) continue;
        const flick = l.flicker ? 1 + Math.sin(time / 90 + l.x) * l.flicker : 1;
        this.brush.setScale(((l.r * 2) / 128) * flick);
        this.brush.setAlpha(0.95);
        this.rt.erase(this.brush, l.x - ox, l.y - oy);
      }
    }
    // coloured glows
    const g = glowStrength * Math.min(1, darkness * 1.6 + 0.15);
    if (g > 0.02) {
      for (const l of lights) {
        if (l.x + l.r < view.x || l.x - l.r > view.right || l.y + l.r < view.y || l.y - l.r > view.bottom) continue;
        if (l.color === 0xffffff) continue;
        let img = this.glows[glowIdx];
        if (!img) {
          img = this.scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(GLOW_DEPTH);
          this.glows.push(img);
        }
        img.setVisible(true).setPosition(l.x, l.y).setTint(l.color).setScale((l.r * 1.1) / 64).setAlpha(0.32 * g);
        glowIdx++;
        if (glowIdx > 90) break;
      }
    }
    for (let i = glowIdx; i < this.glows.length; i++) this.glows[i].setVisible(false);
  }

  destroy(): void {
    this.rt.destroy();
    this.brush.destroy();
    for (const g of this.glows) g.destroy();
    this.glows = [];
  }
}

export function hexColor(s: string): number {
  return parseInt(s.replace('#', ''), 16);
}
