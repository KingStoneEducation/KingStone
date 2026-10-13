import Phaser from 'phaser';
import { AtlasBuilder } from '../art/atlas';
import { buildTileset } from '../art/tiles';
import { buildPropImages, CAR_COLORS, carImage } from '../art/props';
import { drawBuilding } from '../art/buildings';
import { BUILDINGS } from './maps/cityLayout';
import { buildCharacterSheet, CHAR_H, CHAR_W, DIRS, randomLook } from '../art/characters';
import { circle, ellipse, makeCanvas, px, rect, strokeRect } from '../art/canvas';
import { P } from '../art/palette';
import { drawText } from '../art/font';
import type { CharacterLook } from '../data/npcs';

export const atlas = new AtlasBuilder('atlas');
let registered = false;

export const EMOTES = ['!', '!!', '?', '♪', '…', '💢', '♥', '$', 'z', '★'] as const;

function emoteCanvas(e: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(13, 14);
  rect(ctx, 1, 0, 11, 11, '#f4f1ea');
  rect(ctx, 0, 1, 13, 9, '#f4f1ea');
  rect(ctx, 5, 11, 3, 1, '#f4f1ea');
  px(ctx, 6, 12, '#f4f1ea');
  const ink = e === '💢' ? '#d4202f' : e === '♥' ? '#e04a7a' : e === '$' ? '#2c8a4e' : e === '★' ? '#d9a020' : '#241b30';
  switch (e) {
    case '!':
      rect(ctx, 6, 2, 2, 5, ink);
      rect(ctx, 6, 8, 2, 1, ink);
      break;
    case '!!':
      rect(ctx, 4, 2, 2, 5, ink);
      rect(ctx, 4, 8, 2, 1, ink);
      rect(ctx, 8, 2, 2, 5, ink);
      rect(ctx, 8, 8, 2, 1, ink);
      break;
    case '?':
      drawText(ctx, '?', 4, 2, ink, '3x5');
      break;
    case '♪':
      rect(ctx, 7, 2, 1, 6, ink);
      rect(ctx, 7, 2, 3, 1, ink);
      rect(ctx, 5, 7, 3, 2, ink);
      break;
    case '…':
      for (const x of [3, 6, 9]) px(ctx, x, 6, ink);
      break;
    case '💢':
      for (const [x, y] of [[4, 3], [5, 4], [8, 3], [7, 4], [4, 7], [5, 6], [8, 7], [7, 6]]) px(ctx, x, y, ink);
      break;
    case '♥':
      rect(ctx, 4, 3, 2, 2, ink);
      rect(ctx, 7, 3, 2, 2, ink);
      rect(ctx, 3, 4, 7, 2, ink);
      rect(ctx, 4, 6, 5, 1, ink);
      rect(ctx, 5, 7, 3, 1, ink);
      px(ctx, 6, 8, ink);
      break;
    case '$':
      drawText(ctx, '$', 4, 1, ink, '5x7');
      break;
    case 'z':
      drawText(ctx, 'Z', 5, 2, '#4a6ab8', '3x5');
      break;
    case '★':
      drawText(ctx, '*', 4, 1, ink, '5x7');
      break;
  }
  strokeRect(ctx, 0, 0, 0, 0, '#000');
  return canvas;
}

function gradientCanvas(size: number, inner: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, inner.replace(/[\d.]+\)$/, '0.55)'));
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** Builds every procedural texture once (tiles, props, buildings, effects). */
export function registerTextures(scene: Phaser.Scene): void {
  if (registered && scene.textures.exists('tiles')) return;
  const tiles = buildTileset();
  if (scene.textures.exists('tiles')) scene.textures.remove('tiles');
  scene.textures.addCanvas('tiles', tiles)!.setFilter(Phaser.Textures.FilterMode.NEAREST);

  buildPropImages((name, c) => atlas.add(name, c));
  for (const b of BUILDINGS) {
    const art = drawBuilding(b);
    atlas.add(`bld:${b.id}`, art.day);
    atlas.add(`bld:${b.id}:n`, art.night);
  }
  CAR_COLORS.forEach((c, i) => {
    for (const d of ['left', 'right', 'up', 'down'] as const) {
      atlas.add(`car:${i}:${d}`, carImage(c, d));
    }
  });
  for (const e of EMOTES) atlas.add(`emote:${e}`, emoteCanvas(e));
  atlas.draw('shadow', 14, 6, (ctx) => ellipse(ctx, 7, 3, 6, 2, 'rgba(10,6,20,0.32)'));
  atlas.draw('pixel', 2, 2, (ctx) => rect(ctx, 0, 0, 2, 2, '#ffffff'));
  atlas.draw('marker', 10, 8, (ctx) => {
    for (let i = 0; i < 4; i++) rect(ctx, 1 + i, i, 8 - i * 2, 1, '#ffe45c');
    rect(ctx, 4, 4, 2, 2, '#ffe45c');
  });
  atlas.draw('target_ring', 16, 10, (ctx) => {
    ellipse(ctx, 8, 5, 7, 4, 'rgba(255,228,92,0.8)');
    ellipse(ctx, 8, 5, 5, 2, 'rgba(0,0,0,0)');
    ctx.clearRect(4, 4, 8, 3);
  });
  atlas.draw('chip_small', 6, 6, (ctx) => {
    circle(ctx, 3, 3, 3, '#c2283a');
    px(ctx, 3, 3, '#f4f1ea');
  });
  atlas.draw('rain', 2, 6, (ctx) => rect(ctx, 0, 0, 1, 6, 'rgba(180,200,255,0.55)'));
  atlas.register(scene);

  for (const [key, size, inner] of [
    ['light', 128, 'rgba(255,255,255,1)'],
    ['glow', 64, 'rgba(255,255,255,0.9)'],
  ] as const) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, gradientCanvas(size, inner));
  }
  void P;
  registered = true;
}

export function frameRef(name: string): { key: string; frame: string } {
  return atlas.ref(name);
}

const charKeys = new Set<string>();

function lookKey(look: CharacterLook): string {
  return [look.skin, look.hair, look.hairColor, look.top, look.topShade, look.bottom, look.shoes, look.accent ?? '', look.style, look.glasses ? 1 : 0, look.beard ? 1 : 0, look.body].join('|');
}

/** Creates (once) a 16-frame spritesheet + walk animations for a look; returns the texture key. */
export function ensureCharacter(scene: Phaser.Scene, look: CharacterLook): string {
  const key = `char:${lookKey(look)}`;
  if (charKeys.has(key) && scene.textures.exists(key)) return key;
  const sheet = buildCharacterSheet(look);
  const tex = scene.textures.addCanvas(key, sheet)!;
  for (let i = 0; i < 16; i++) tex.add(i, 0, i * CHAR_W, 0, CHAR_W, CHAR_H);
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  DIRS.forEach((d, di) => {
    const ak = `${key}:walk:${d}`;
    if (!scene.anims.exists(ak)) {
      scene.anims.create({
        key: ak,
        frames: [1, 0, 2, 0].map((p) => ({ key, frame: di * 4 + p })),
        frameRate: 8,
        repeat: -1,
      });
    }
  });
  charKeys.add(key);
  return key;
}

export function anonLook(seed: number, fancy?: number): CharacterLook {
  return randomLook(seed, { fancy });
}
