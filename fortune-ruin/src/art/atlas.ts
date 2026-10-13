import type Phaser from 'phaser';
import { makeCanvas, type Ctx } from './canvas';

interface Pending {
  name: string;
  canvas: HTMLCanvasElement;
  linear?: boolean;
}

interface Placed {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAGE = 2048;
const PAD = 2;

/**
 * Packs procedurally drawn images into a few large atlas pages so the
 * renderer can batch draw calls. Images are drawn once at boot.
 */
export class AtlasBuilder {
  private pending: Pending[] = [];
  private placed = new Map<string, Placed>();
  private pages: { canvas: HTMLCanvasElement; ctx: Ctx }[] = [];
  readonly key: string;

  constructor(key = 'atlas') {
    this.key = key;
  }

  has(name: string): boolean {
    return this.pending.some((p) => p.name === name) || this.placed.has(name);
  }

  add(name: string, canvas: HTMLCanvasElement): void {
    this.pending.push({ name, canvas });
  }

  draw(name: string, w: number, h: number, fn: (ctx: Ctx) => void): void {
    const { canvas, ctx } = makeCanvas(w, h);
    fn(ctx);
    this.add(name, canvas);
  }

  size(name: string): { w: number; h: number } {
    const p = this.placed.get(name);
    if (p) return { w: p.w, h: p.h };
    const q = this.pending.find((x) => x.name === name);
    return q ? { w: q.canvas.width, h: q.canvas.height } : { w: 0, h: 0 };
  }

  /** Shelf-pack all pending images and register them as Phaser textures. */
  register(scene: Phaser.Scene): void {
    const items = [...this.pending].sort((a, b) => b.canvas.height - a.canvas.height || b.canvas.width - a.canvas.width);
    let page = -1;
    let x = 0;
    let y = 0;
    let shelfH = 0;
    const newPage = () => {
      this.pages.push(makeCanvas(PAGE, PAGE));
      page = this.pages.length - 1;
      x = 0;
      y = 0;
      shelfH = 0;
    };
    newPage();
    for (const it of items) {
      const w = it.canvas.width + PAD;
      const h = it.canvas.height + PAD;
      if (w > PAGE || h > PAGE) throw new Error(`atlas image too large: ${it.name}`);
      if (x + w > PAGE) {
        x = 0;
        y += shelfH;
        shelfH = 0;
      }
      if (y + h > PAGE) newPage();
      this.pages[page].ctx.drawImage(it.canvas, x, y);
      this.placed.set(it.name, { page, x, y, w: it.canvas.width, h: it.canvas.height });
      x += w;
      shelfH = Math.max(shelfH, h);
    }
    this.pending = [];
    this.pages.forEach((p, i) => {
      const k = `${this.key}${i}`;
      if (scene.textures.exists(k)) scene.textures.remove(k);
      const tex = scene.textures.addCanvas(k, p.canvas)!;
      for (const [name, pl] of this.placed) if (pl.page === i) tex.add(name, 0, pl.x, pl.y, pl.w, pl.h);
      tex.setFilter(1); // NEAREST
    });
  }

  /** Phaser texture key + frame name for an image. */
  ref(name: string): { key: string; frame: string } {
    const p = this.placed.get(name);
    if (!p) throw new Error(`atlas frame missing: ${name}`);
    return { key: `${this.key}${p.page}`, frame: name };
  }

  exists(name: string): boolean {
    return this.placed.has(name);
  }
}
