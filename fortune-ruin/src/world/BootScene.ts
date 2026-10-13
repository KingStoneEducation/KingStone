import Phaser from 'phaser';
import { registerTextures } from './textures';
import { store } from '../ui/store';

/** Generates every procedural texture, then shows the city behind the main menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const { width, height } = this.scale;
    const t = this.add
      .text(width / 2, height / 2, '正在绘制灰港……', {
        fontFamily: '"PingFang SC","Microsoft YaHei","Noto Sans SC","WenQuanYi Zen Hei",sans-serif',
        fontSize: '18px',
        color: '#e8dcc0',
      })
      .setOrigin(0.5);
    // let the loading text render once before the heavy synchronous work
    this.time.delayedCall(40, () => {
      const t0 = performance.now();
      registerTextures(this);
      const ms = Math.round(performance.now() - t0);
      if (import.meta.env.DEV) console.info(`[boot] textures generated in ${ms} ms`);
      t.destroy();
      store.screen = 'menu';
      store.notify();
      this.scene.start('world', { attract: true });
    });
  }
}
