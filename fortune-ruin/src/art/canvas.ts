/** Low-level pixel drawing helpers on 2D canvases (no anti-aliasing). */

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function px(ctx: Ctx, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

export function hline(ctx: Ctx, x: number, y: number, w: number, color: string): void {
  rect(ctx, x, y, w, 1, color);
}

export function vline(ctx: Ctx, x: number, y: number, h: number, color: string): void {
  rect(ctx, x, y, 1, h, color);
}

export function strokeRect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  hline(ctx, x, y, w, color);
  hline(ctx, x, y + h - 1, w, color);
  vline(ctx, x, y, h, color);
  vline(ctx, x + w - 1, y, h, color);
}

/** Filled rectangle with 1px rounded corners removed. */
export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, r = 1): void {
  if (r <= 0) return rect(ctx, x, y, w, h, color);
  rect(ctx, x + r, y, w - 2 * r, h, color);
  rect(ctx, x, y + r, w, h - 2 * r, color);
  if (r >= 2) {
    rect(ctx, x + 1, y + 1, w - 2, h - 2, color);
  }
}

/** Pixel-perfect filled ellipse. */
export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  for (let y = -ry; y <= ry; y++) {
    const t = 1 - (y * y) / (ry * ry + 0.0001);
    if (t < 0) continue;
    const half = Math.round(rx * Math.sqrt(t));
    ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
  }
}

export function circle(ctx: Ctx, cx: number, cy: number, r: number, color: string): void {
  ellipse(ctx, cx, cy, r, r, color);
}

export function ring(ctx: Ctx, cx: number, cy: number, r: number, color: string): void {
  ctx.fillStyle = color;
  for (let a = 0; a < 360; a += 2) {
    const x = Math.round(cx + r * Math.cos((a * Math.PI) / 180));
    const y = Math.round(cy + r * Math.sin((a * Math.PI) / 180));
    ctx.fillRect(x, y, 1, 1);
  }
}

// ------------------------------------------------------------------ color math

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Darken (amount < 0) or lighten (amount > 0), -1..1. Shifts hue slightly toward purple/yellow like hand-picked ramps. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amount >= 0) {
    return rgbToHex(r + (255 - r) * amount, g + (245 - g) * amount, b + (220 - b) * amount);
  }
  const k = 1 + amount;
  return rgbToHex(r * k + 10 * -amount, g * k, b * k + 22 * -amount);
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ------------------------------------------------------------------ deterministic noise

export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Sprinkle noise pixels of `color` with probability p in an area. */
export function speckle(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, p: number, seed = 0): void {
  ctx.fillStyle = color;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (hash2(x + i, y + j, seed) < p) ctx.fillRect(x + i, y + j, 1, 1);
}

/** Checker dither between two colors. */
export function dither(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, phase = 0): void {
  ctx.fillStyle = color;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if ((i + j + phase) % 2 === 0) ctx.fillRect(x + i, y + j, 1, 1);
}

/** Simple 3/4-view box: a lighter top face above a darker front face, outlined. */
export function box(ctx: Ctx, x: number, y: number, w: number, topH: number, frontH: number, top: string, front: string, outline: string | null = '#1b1626'): void {
  rect(ctx, x, y, w, topH, top);
  rect(ctx, x, y + topH, w, frontH, front);
  hline(ctx, x, y + topH, w, shade(front, 0.18));
  if (outline) {
    strokeRect(ctx, x, y, w, topH + frontH, outline);
  }
}

export function shadowEllipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha = 0.28): void {
  ellipse(ctx, cx, cy, rx, ry, `rgba(10,6,20,${alpha})`);
}
