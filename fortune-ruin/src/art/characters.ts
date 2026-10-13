import { P } from './palette';
import { makeCanvas, shade, type Ctx } from './canvas';
import type { CharacterLook } from '../data/npcs';

export type CharDir = 'down' | 'left' | 'right' | 'up';
export type CharPose = 'stand' | 'walkA' | 'walkB' | 'sit';
export const CHAR_W = 16;
export const CHAR_H = 32;
export const DIRS: CharDir[] = ['down', 'left', 'right', 'up'];
export const POSES: CharPose[] = ['stand', 'walkA', 'walkB', 'sit'];

export function frameIndex(dir: CharDir, pose: CharPose): number {
  return DIRS.indexOf(dir) * 4 + POSES.indexOf(pose);
}

interface Colors {
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  hairHi: string;
  top: string;
  topShade: string;
  topHi: string;
  bottom: string;
  bottomShade: string;
  shoes: string;
  accent: string;
}

class Painter {
  constructor(private ctx: Ctx, private ox: number, private oy: number) {}
  r(x: number, y: number, w: number, h: number, c: string): void {
    if (w <= 0 || h <= 0) return;
    this.ctx.fillStyle = c;
    this.ctx.fillRect(this.ox + x, this.oy + y, w, h);
  }
  p(x: number, y: number, c: string): void {
    this.r(x, y, 1, 1, c);
  }
  clear(x: number, y: number): void {
    this.ctx.clearRect(this.ox + x, this.oy + y, 1, 1);
  }
}

function colorsFor(look: CharacterLook): Colors {
  const skin = P.skin[Math.max(0, Math.min(P.skin.length - 1, look.skin))];
  return {
    skin,
    skinShade: shade(skin, -0.16),
    hair: look.hairColor,
    hairShade: shade(look.hairColor, -0.28),
    hairHi: shade(look.hairColor, 0.28),
    top: look.top,
    topShade: look.topShade,
    topHi: shade(look.top, 0.14),
    bottom: look.bottom,
    bottomShade: shade(look.bottom, -0.22),
    shoes: look.shoes,
    accent: look.accent ?? '#eeeeee',
  };
}

// ------------------------------------------------------------------ front

function legsFront(p: Painter, c: Colors, look: CharacterLook, pose: CharPose): void {
  if (pose === 'sit') {
    if (look.style !== 'gown') p.r(4, 25, 8, 2, c.bottom);
    return;
  }
  const lL = pose === 'walkA' ? 1 : 0;
  const lR = pose === 'walkB' ? 1 : 0;
  if (look.style === 'gown') {
    p.r(4, 23, 8, 1, c.top);
    p.r(3, 24, 10, 3, c.top);
    p.r(2, 27, 12, 4, c.top);
    p.r(10, 24, 3, 7, c.topShade);
    p.r(2, 30, 12, 1, c.topShade);
    p.r(4 + lL, 30, 2, 1, c.shoes);
    return;
  }
  if (look.style === 'dress') {
    p.r(5, 27, 2, 2 - lL, c.skin);
    p.r(9, 27, 2, 2 - lR, c.skin);
    p.r(4, 29 - lL, 3, 2, c.shoes);
    p.r(9, 29 - lR, 3, 2, c.shoes);
    p.r(4, 23, 8, 1, c.bottom);
    p.r(3, 24, 10, 3, c.bottom);
    p.r(10, 24, 3, 3, shade(c.bottom, -0.2));
    p.r(3, 26, 10, 1, shade(c.bottom, -0.15));
    return;
  }
  p.r(5, 25, 3, 4 - lL, c.bottom);
  p.r(8, 25, 3, 4 - lR, c.bottom);
  p.r(7, 25, 1, 4 - lL, c.bottomShade);
  p.r(10, 25, 1, 4 - lR, c.bottomShade);
  p.r(4, 29 - lL, 4, 2, c.shoes);
  p.r(8, 29 - lR, 4, 2, c.shoes);
  p.r(4, 29 - lL, 4, 1, shade(c.shoes, 0.2));
  p.r(8, 29 - lR, 4, 1, shade(c.shoes, 0.2));
}

function torsoFront(p: Painter, c: Colors, look: CharacterLook, pose: CharPose, back: boolean): void {
  const swingL = pose === 'walkA' ? 1 : pose === 'walkB' ? -1 : 0;
  const swingR = -swingL;
  const sit = pose === 'sit';
  const sleeve = look.style === 'vest' || look.style === 'apron' ? c.accent : c.top;
  const sleeveShade = look.style === 'vest' || look.style === 'apron' ? shade(c.accent, -0.15) : c.topShade;
  const shortSleeve = look.style === 'tee' || look.style === 'dress' || look.style === 'gown';
  // torso
  const base = look.style === 'apron' ? c.accent : c.top;
  p.r(4, 17, 8, 8, base);
  p.r(11, 17, 1, 8, look.style === 'apron' ? shade(c.accent, -0.15) : c.topShade);
  p.r(4, 24, 8, 1, look.style === 'apron' ? shade(c.accent, -0.15) : c.topShade);
  p.r(5, 17, 6, 1, look.style === 'apron' ? shade(c.accent, 0.1) : c.topHi);
  // arms (with swing) and hands
  const armTop = 17;
  const armLenL = sit ? 5 : 6 - (swingL > 0 ? 1 : 0);
  const armLenR = sit ? 5 : 6 - (swingR > 0 ? 1 : 0);
  if (shortSleeve) {
    p.r(2, armTop, 2, 2, sleeve);
    p.r(12, armTop, 2, 2, sleeve);
    p.r(2, armTop + 2, 2, armLenL - 2, c.skin);
    p.r(12, armTop + 2, 2, armLenR - 2, c.skin);
  } else {
    p.r(2, armTop, 2, armLenL, sleeve);
    p.r(12, armTop, 2, armLenR, sleeve);
    p.r(13, armTop, 1, armLenR, sleeveShade);
  }
  p.r(2, armTop + armLenL, 2, 2, c.skin);
  p.r(12, armTop + armLenR, 2, 2, c.skin);
  p.p(3, armTop + armLenL + 1, c.skinShade);
  p.p(13, armTop + armLenR + 1, c.skinShade);
  if (back) {
    if (look.style === 'hoodie') p.r(5, 17, 6, 2, c.topShade);
    if (look.style === 'apron') {
      p.r(7, 18, 2, 1, c.top);
      p.r(5, 22, 6, 1, c.top);
    }
    return;
  }
  // style details on the front
  switch (look.style) {
    case 'tee':
      p.r(6, 17, 4, 1, c.skin);
      p.p(7, 18, c.skin);
      p.p(8, 18, c.skin);
      break;
    case 'shirt':
      p.r(6, 17, 1, 1, '#f2f2f2');
      p.r(9, 17, 1, 1, '#f2f2f2');
      p.p(7, 17, c.skin);
      p.p(8, 17, c.skin);
      for (let y = 19; y < 25; y += 2) p.p(8, y, c.topShade);
      if (look.accent) {
        p.r(7, 18, 2, 1, look.accent);
        p.r(7, 19, 2, 3, look.accent);
        p.p(8, 21, shade(look.accent, -0.25));
      }
      break;
    case 'suit':
    case 'uniform':
      p.r(7, 17, 2, 4, '#f0efe9');
      p.p(6, 17, '#f0efe9');
      p.p(9, 17, '#f0efe9');
      p.r(7, 18, 2, 4, look.accent && look.accent !== '#2a2a2f' ? look.accent : '#3a2a3a');
      p.p(7, 18, shade(look.accent ?? '#3a2a3a', 0.2));
      p.p(6, 18, c.topHi);
      p.p(9, 18, c.topHi);
      p.p(6, 22, shade(c.top, 0.25));
      p.p(6, 23, shade(c.top, 0.25));
      if (look.style === 'uniform') p.p(10, 19, P.gold);
      break;
    case 'jacket':
      p.r(7, 17, 2, 8, look.accent ?? '#e8e2d0');
      p.r(6, 17, 1, 8, c.topHi);
      p.r(9, 17, 1, 8, c.topShade);
      break;
    case 'vest':
      p.r(4, 18, 3, 7, c.top);
      p.r(9, 18, 3, 7, c.top);
      p.r(7, 18, 2, 7, c.accent);
      p.r(6, 17, 4, 1, '#b8202f');
      p.p(7, 17, shade('#b8202f', 0.3));
      break;
    case 'apron':
      p.r(5, 19, 6, 8, c.top);
      p.r(5, 18, 1, 1, c.top);
      p.r(10, 18, 1, 1, c.top);
      p.r(10, 19, 1, 8, c.topShade);
      p.r(6, 22, 4, 1, shade(c.top, 0.15));
      break;
    case 'hoodie':
      p.r(4, 17, 8, 1, c.topShade);
      p.p(6, 18, '#e8e8e8');
      p.p(9, 18, '#e8e8e8');
      p.r(5, 22, 6, 1, c.topShade);
      break;
    case 'dress':
      p.r(6, 17, 4, 1, c.skin);
      p.r(4, 22, 8, 1, shade(c.top, -0.15));
      break;
    case 'gown':
      p.r(5, 17, 6, 1, c.skin);
      p.r(6, 18, 4, 1, c.skin);
      if (look.accent) {
        p.p(7, 18, look.accent);
        p.p(8, 18, look.accent);
      }
      break;
  }
}

function headFront(p: Painter, c: Colors, look: CharacterLook): void {
  p.r(4, 6, 8, 9, c.skin);
  p.r(3, 7, 10, 7, c.skin);
  p.r(5, 15, 6, 1, c.skin);
  p.r(11, 7, 1, 7, c.skinShade);
  p.r(6, 16, 4, 1, c.skinShade);
  // ears
  p.p(2, 10, c.skinShade);
  p.p(13, 10, c.skinShade);
  // eyes
  p.r(5, 10, 1, 2, P.ink);
  p.r(10, 10, 1, 2, P.ink);
  p.p(5, 10, '#3a3050');
  p.p(10, 10, '#3a3050');
  // mouth & cheeks
  p.r(7, 13, 2, 1, shade(c.skin, -0.3));
  if (look.body === 'f') {
    p.p(4, 12, '#e8a0a0');
    p.p(11, 12, '#e8a0a0');
  }
  if (look.beard) {
    p.r(4, 12, 8, 3, c.hairShade);
    p.r(5, 15, 6, 1, c.hairShade);
    p.r(7, 13, 2, 1, shade(c.skin, -0.3));
    p.p(4, 12, c.skin);
    p.p(11, 12, c.skin);
  }
  if (look.glasses) {
    p.r(4, 9, 3, 3, '#2a2a34');
    p.r(9, 9, 3, 3, '#2a2a34');
    p.p(5, 10, '#9fd0e8');
    p.p(10, 10, '#9fd0e8');
    p.p(7, 10, '#2a2a34');
    p.p(8, 10, '#2a2a34');
  }
}

function hairFront(p: Painter, c: Colors, style: number): void {
  const h = c.hair;
  const cap = () => {
    p.r(4, 4, 8, 1, h);
    p.r(3, 5, 10, 3, h);
    p.r(3, 8, 1, 3, h);
    p.r(12, 8, 1, 3, h);
    p.r(5, 5, 3, 1, c.hairHi);
  };
  switch (style) {
    case 0:
      cap();
      p.r(4, 8, 4, 1, h);
      p.r(9, 8, 3, 1, h);
      break;
    case 1:
      cap();
      p.r(3, 8, 7, 1, h);
      p.r(3, 9, 3, 1, h);
      p.p(9, 8, c.hairShade);
      break;
    case 2:
      cap();
      p.r(4, 8, 3, 1, h);
      p.r(9, 8, 3, 1, h);
      p.r(2, 7, 2, 14, h);
      p.r(12, 7, 2, 14, h);
      p.r(3, 8, 1, 12, c.hairShade);
      p.r(12, 8, 1, 12, c.hairShade);
      break;
    case 3:
      cap();
      p.r(3, 8, 10, 1, h);
      p.r(4, 9, 2, 1, h);
      p.r(10, 9, 2, 1, h);
      p.r(2, 7, 2, 8, h);
      p.r(12, 7, 2, 8, h);
      p.r(2, 14, 2, 1, c.hairShade);
      p.r(12, 14, 2, 1, c.hairShade);
      break;
    case 4:
      cap();
      p.r(3, 8, 2, 1, h);
      p.r(11, 8, 2, 1, h);
      p.r(13, 8, 1, 6, h);
      p.p(13, 8, c.hairShade);
      break;
    case 5:
      p.r(3, 5, 10, 3, h);
      p.r(4, 4, 8, 1, h);
      p.r(3, 8, 1, 2, h);
      p.r(12, 8, 1, 2, h);
      p.r(5, 1, 6, 3, h);
      p.r(6, 0, 4, 1, h);
      p.r(6, 1, 2, 1, c.hairHi);
      p.r(5, 3, 6, 1, c.hairShade);
      break;
    case 6:
      p.r(3, 2, 10, 1, h);
      p.r(2, 3, 12, 5, h);
      p.r(2, 8, 2, 4, h);
      p.r(12, 8, 2, 4, h);
      for (let x = 3; x < 13; x += 2) p.p(x, 8, h);
      for (const [x, y] of [[4, 3], [7, 4], [10, 3], [5, 6], [9, 6], [12, 5], [3, 5]]) p.p(x, y, shade(h, 0.1));
      for (const [x, y] of [[6, 5], [11, 4], [8, 7], [3, 7], [12, 9]]) p.p(x, y, c.hairShade);
      break;
    case 7:
      p.r(4, 4, 8, 2, h);
      p.r(3, 5, 10, 1, h);
      p.r(3, 6, 1, 3, h);
      p.r(12, 6, 1, 3, h);
      p.r(5, 4, 2, 1, c.hairHi);
      break;
    case 8:
      p.r(4, 4, 8, 1, h);
      p.r(3, 5, 10, 3, h);
      p.r(3, 8, 1, 2, h);
      p.r(12, 8, 1, 2, h);
      p.r(4, 5, 6, 1, c.hairHi);
      p.r(5, 6, 4, 1, c.hairHi);
      break;
    case 9:
    default:
      cap();
      p.r(3, 8, 5, 1, h);
      p.r(10, 8, 2, 1, h);
      for (let y = 7; y < 22; y++) {
        const w = (Math.floor((y - 7) / 3) % 2) === 0 ? 3 : 2;
        p.r(4 - w, y, w, 1, h);
        p.r(12, y, w, 1, h);
      }
      p.r(3, 9, 1, 12, c.hairShade);
      p.r(12, 9, 1, 12, c.hairShade);
      break;
  }
}

function hairBack(p: Painter, c: Colors, style: number): void {
  const h = c.hair;
  p.r(4, 4, 8, 1, h);
  p.r(3, 5, 10, 10, h);
  p.r(4, 15, 8, 1, h);
  p.r(5, 5, 3, 1, c.hairHi);
  p.r(11, 6, 1, 8, c.hairShade);
  switch (style) {
    case 2:
      p.r(3, 15, 10, 5, h);
      p.r(4, 20, 8, 1, h);
      p.r(7, 8, 1, 12, c.hairShade);
      break;
    case 3:
      p.r(2, 7, 12, 8, h);
      p.r(2, 14, 12, 1, c.hairShade);
      break;
    case 4:
      p.r(7, 15, 2, 6, h);
      p.r(7, 14, 2, 1, '#c8b16a');
      p.p(8, 20, c.hairShade);
      break;
    case 5:
      p.r(5, 1, 6, 4, h);
      p.r(6, 0, 4, 1, h);
      p.r(5, 4, 6, 1, c.hairShade);
      break;
    case 6:
      p.r(2, 3, 12, 11, h);
      for (const [x, y] of [[4, 4], [8, 5], [11, 7], [5, 9], [9, 11], [3, 12]]) p.p(x, y, shade(h, 0.1));
      break;
    case 7:
      p.r(4, 13, 8, 2, shade(h, 0.1));
      break;
    case 9:
      p.r(2, 15, 12, 6, h);
      p.r(3, 21, 10, 1, h);
      for (let y = 15; y < 21; y += 3) {
        p.p(2, y, c.hairShade);
        p.p(13, y + 1, c.hairShade);
      }
      break;
  }
}

// ------------------------------------------------------------------ side (left-facing)

function legsSide(p: Painter, c: Colors, look: CharacterLook, pose: CharPose): void {
  if (pose === 'sit') {
    if (look.style !== 'gown') p.r(4, 24, 7, 3, c.bottom);
    p.r(3, 26, 3, 2, c.shoes);
    return;
  }
  if (look.style === 'gown') {
    p.r(4, 23, 7, 1, c.top);
    p.r(3, 24, 9, 3, c.top);
    p.r(2, 27, 11, 4, c.top);
    p.r(9, 24, 3, 7, c.topShade);
    p.r(2, 30, 3, 1, c.shoes);
    return;
  }
  const legColor = look.style === 'dress' ? c.skin : c.bottom;
  const legBack = look.style === 'dress' ? c.skinShade : c.bottomShade;
  if (pose === 'stand') {
    p.r(6, 25, 4, 4, legColor);
    p.r(8, 25, 2, 4, legBack);
    p.r(5, 29, 5, 2, c.shoes);
    p.r(5, 29, 5, 1, shade(c.shoes, 0.2));
  } else {
    const front = pose === 'walkA';
    p.r(8, 25, 3, 3, front ? legBack : legColor);
    p.r(8, 28, 4, 2, shade(c.shoes, front ? -0.15 : 0));
    p.r(4, 25, 3, 4, front ? legColor : legBack);
    p.r(3, 29, 4, 2, shade(c.shoes, front ? 0 : -0.15));
    p.r(3, 29, 4, 1, shade(c.shoes, 0.2));
  }
  if (look.style === 'dress') {
    p.r(4, 23, 7, 1, c.bottom);
    p.r(3, 24, 9, 3, c.bottom);
    p.r(9, 24, 3, 3, shade(c.bottom, -0.2));
  }
}

function torsoSide(p: Painter, c: Colors, look: CharacterLook, pose: CharPose): void {
  const base = look.style === 'apron' ? c.accent : c.top;
  p.r(5, 17, 6, 8, base);
  p.r(10, 17, 1, 8, look.style === 'apron' ? shade(c.accent, -0.15) : c.topShade);
  p.r(5, 24, 6, 1, look.style === 'apron' ? shade(c.accent, -0.15) : c.topShade);
  switch (look.style) {
    case 'suit':
    case 'uniform':
      p.r(5, 17, 1, 3, '#f0efe9');
      p.p(5, 18, look.accent ?? '#3a2a3a');
      break;
    case 'shirt':
      p.p(5, 17, '#f2f2f2');
      if (look.accent) p.r(5, 18, 1, 3, look.accent);
      break;
    case 'vest':
      p.r(5, 17, 2, 8, c.accent);
      p.r(7, 18, 4, 7, c.top);
      p.p(5, 17, '#b8202f');
      break;
    case 'apron':
      p.r(4, 18, 2, 9, c.top);
      p.p(6, 18, c.top);
      break;
    case 'jacket':
      p.r(5, 17, 1, 8, look.accent ?? '#e8e2d0');
      break;
    case 'hoodie':
      p.r(8, 16, 3, 2, c.topShade);
      break;
    case 'gown':
    case 'dress':
      p.r(5, 17, 2, 1, c.skin);
      break;
  }
  const short = look.style === 'tee' || look.style === 'dress' || look.style === 'gown';
  const sleeve = look.style === 'vest' || look.style === 'apron' ? c.accent : c.top;
  let ax = 7;
  let hx = 7;
  let hy = 23;
  let len = 6;
  if (pose === 'walkA') {
    ax = 6;
    hx = 5;
    hy = 22;
    len = 5;
  } else if (pose === 'walkB') {
    ax = 8;
    hx = 9;
    hy = 22;
    len = 5;
  } else if (pose === 'sit') {
    ax = 6;
    hx = 4;
    hy = 21;
    len = 4;
  }
  if (short) {
    p.r(ax, 17, 2, 2, sleeve);
    p.r(ax, 19, 2, len - 2, c.skin);
  } else {
    p.r(ax, 17, 2, len, sleeve);
    p.r(ax + 1, 17, 1, len, shade(sleeve, -0.12));
  }
  p.r(hx, hy, 2, 2, c.skin);
}

function headSide(p: Painter, c: Colors, look: CharacterLook): void {
  p.r(4, 6, 8, 9, c.skin);
  p.r(5, 15, 5, 1, c.skin);
  p.p(3, 11, c.skin);
  p.r(7, 16, 3, 1, c.skinShade);
  p.r(5, 10, 1, 2, P.ink);
  p.r(4, 13, 2, 1, shade(c.skin, -0.3));
  p.p(9, 10, c.skinShade);
  p.p(9, 11, c.skinShade);
  if (look.beard) {
    p.r(4, 12, 6, 3, c.hairShade);
    p.r(5, 15, 4, 1, c.hairShade);
    p.r(4, 13, 2, 1, shade(c.skin, -0.3));
  }
  if (look.glasses) {
    p.r(3, 9, 4, 3, '#2a2a34');
    p.p(5, 10, '#9fd0e8');
    p.p(4, 10, '#9fd0e8');
    p.r(7, 9, 3, 1, '#2a2a34');
  }
}

function hairSide(p: Painter, c: Colors, style: number): void {
  const h = c.hair;
  const base = () => {
    p.r(5, 3, 6, 1, h);
    p.r(4, 4, 8, 3, h);
    p.r(8, 7, 4, 6, h);
    p.r(5, 4, 3, 1, c.hairHi);
  };
  switch (style) {
    case 0:
      base();
      p.r(4, 7, 2, 1, h);
      p.r(10, 13, 2, 1, h);
      break;
    case 1:
      base();
      p.r(4, 7, 3, 2, h);
      break;
    case 2:
      base();
      p.r(4, 7, 2, 1, h);
      p.r(9, 7, 4, 14, h);
      p.r(12, 8, 1, 12, c.hairShade);
      break;
    case 3:
      base();
      p.r(4, 7, 3, 2, h);
      p.r(8, 7, 5, 8, h);
      p.r(8, 14, 5, 1, c.hairShade);
      break;
    case 4:
      base();
      p.r(4, 7, 2, 1, h);
      p.r(12, 7, 2, 7, h);
      p.p(12, 7, '#c8b16a');
      break;
    case 5:
      p.r(4, 4, 8, 3, h);
      p.r(8, 7, 4, 5, h);
      p.r(9, 1, 4, 4, h);
      p.r(10, 0, 2, 1, h);
      p.r(9, 4, 4, 1, c.hairShade);
      break;
    case 6:
      p.r(4, 2, 8, 1, h);
      p.r(3, 3, 10, 5, h);
      p.r(8, 8, 5, 6, h);
      p.r(3, 8, 2, 1, h);
      for (const [x, y] of [[4, 4], [7, 3], [10, 5], [9, 9], [11, 11]]) p.p(x, y, shade(h, 0.1));
      break;
    case 7:
      p.r(5, 4, 6, 2, h);
      p.r(9, 6, 3, 6, h);
      p.r(5, 4, 2, 1, c.hairHi);
      break;
    case 8:
      p.r(5, 3, 6, 1, h);
      p.r(4, 4, 8, 3, h);
      p.r(8, 7, 4, 5, h);
      p.r(4, 4, 5, 1, c.hairHi);
      break;
    case 9:
    default:
      base();
      p.r(4, 7, 2, 2, h);
      for (let y = 7; y < 22; y++) {
        const w = (Math.floor((y - 7) / 3) % 2) === 0 ? 5 : 4;
        p.r(8, y, w, 1, h);
      }
      p.r(12, 8, 1, 12, c.hairShade);
      break;
  }
}

// ------------------------------------------------------------------ frames

function drawLeft(ctx: Ctx, ox: number, oy: number, look: CharacterLook, pose: CharPose): void {
  const p = new Painter(ctx, ox, oy);
  const c = colorsFor(look);
  legsSide(p, c, look, pose);
  torsoSide(p, c, look, pose);
  headSide(p, c, look);
  hairSide(p, c, look.hair);
}

export function drawCharacterFrame(ctx: Ctx, ox: number, oy: number, look: CharacterLook, dir: CharDir, pose: CharPose): void {
  const c = colorsFor(look);
  if (dir === 'left' || dir === 'right') {
    if (dir === 'left') drawLeft(ctx, ox, oy, look, pose);
    else {
      const tmp = makeCanvas(CHAR_W, CHAR_H);
      drawLeft(tmp.ctx, 0, 0, look, pose);
      ctx.save();
      ctx.translate(ox + CHAR_W, oy);
      ctx.scale(-1, 1);
      ctx.drawImage(tmp.canvas, 0, 0);
      ctx.restore();
    }
    return;
  }
  const p = new Painter(ctx, ox, oy);
  if (dir === 'down') {
    if (look.hair === 2 || look.hair === 9) {
      // long hair falls behind the shoulders
      p.r(2, 14, 12, 7, c.hairShade);
    }
    legsFront(p, c, look, pose);
    torsoFront(p, c, look, pose, false);
    headFront(p, c, look);
    hairFront(p, c, look.hair);
  } else {
    legsFront(p, c, look, pose);
    torsoFront(p, c, look, pose, true);
    // neck and head back
    p.r(6, 15, 4, 2, c.skinShade);
    hairBack(p, c, look.hair);
  }
}

/** Adds a 1px dark outline around opaque pixels of a frame. */
function outline(ctx: Ctx, ox: number, oy: number, w: number, h: number, color = P.outline): void {
  const img = ctx.getImageData(ox, oy, w, h);
  const d = img.data;
  const out = new Uint8ClampedArray(d);
  const [r, g, b] = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (opaque(x, y)) continue;
      if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) {
        const i = (y * w + x) * 4;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = 235;
      }
    }
  }
  img.data.set(out);
  ctx.putImageData(img, ox, oy);
}

/** A 16-frame horizontal sheet: 4 directions × (stand, walkA, walkB, sit). */
export function buildCharacterSheet(look: CharacterLook): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(CHAR_W * 16, CHAR_H);
  let i = 0;
  for (const dir of DIRS) {
    for (const pose of POSES) {
      const tmp = makeCanvas(CHAR_W, CHAR_H);
      drawCharacterFrame(tmp.ctx, 0, 0, look, dir, pose);
      outline(tmp.ctx, 0, 0, CHAR_W, CHAR_H);
      ctx.drawImage(tmp.canvas, i * CHAR_W, 0);
      i++;
    }
  }
  return canvas;
}

/** Deterministic random look for anonymous people (patrons, pedestrians). */
export function randomLook(seed: number, opts: { fancy?: number } = {}): CharacterLook {
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    return s / 4294967296;
  };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const female = seed % 2 === 1;
  const fancy = opts.fancy ?? rnd();
  const tops = ['#4f7fbf', '#b84a4a', '#3f8a5a', '#d9a441', '#6c5a8a', '#2b3448', '#e6e1d3', '#8a4a6a', '#3a6a7a', '#c86a3a', '#5a5a62', '#1c1c24', '#7a2a3a'];
  const bottoms = ['#2f3b52', '#3a3a42', '#5a4a3a', '#1c1c24', '#6a6a72', '#2a2f3a', '#4a3a5a'];
  const styles: CharacterLook['style'][] = fancy > 0.75 ? (female ? ['gown', 'dress', 'jacket'] : ['suit', 'jacket', 'shirt']) : female ? ['tee', 'dress', 'jacket', 'shirt', 'hoodie'] : ['tee', 'shirt', 'jacket', 'hoodie', 'suit'];
  const style = pick(styles);
  const top = pick(tops);
  return {
    skin: Math.floor(rnd() * 6),
    hair: female ? pick([2, 3, 4, 5, 9, 6]) : pick([0, 1, 6, 7, 8, 0, 1]),
    hairColor: pick(P.hair.slice(0, 9)),
    top,
    topShade: shade(top, -0.22),
    bottom: style === 'dress' || style === 'gown' ? top : pick(bottoms),
    shoes: pick(['#2a2a2e', '#4a2c20', '#d8d8d8', '#1a1a1a', '#6a3a2a']),
    accent: pick(['#b8202f', '#e8e2d0', '#2a4a8a', '#e0b13e', '#eeeeee']),
    style,
    glasses: rnd() < 0.18,
    beard: !female && rnd() < 0.25,
    body: female ? 'f' : 'm',
  };
}
