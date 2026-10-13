import { P } from './palette';
import { dither, hash2, hline, makeCanvas, px, rect, shade, speckle, vline, type Ctx } from './canvas';

export const TILE = 16;
const COLS = 32;

type Draw = (ctx: Ctx, x: number, y: number) => void;

function grass(seed: number, flowers = false): Draw {
  return (ctx, x, y) => {
    rect(ctx, x, y, 16, 16, P.grass);
    speckle(ctx, x, y, 16, 16, P.grassDark, 0.13, seed);
    speckle(ctx, x, y, 16, 16, P.grassLight, 0.09, seed + 7);
    for (let i = 0; i < 5; i++) {
      const bx = x + Math.floor(hash2(i, seed, 3) * 15);
      const by = y + Math.floor(hash2(seed, i, 5) * 14);
      vline(ctx, bx, by, 2, P.grassBright);
    }
    if (flowers) {
      const cols = ['#f4f1ea', '#ffd34d', '#ff8fb8', '#b9a4ff'];
      for (let i = 0; i < 4; i++) {
        const fx = x + 2 + Math.floor(hash2(i, seed, 11) * 12);
        const fy = y + 2 + Math.floor(hash2(seed, i, 13) * 12);
        const c = cols[Math.floor(hash2(i, i, seed) * cols.length)];
        px(ctx, fx, fy - 1, c);
        px(ctx, fx - 1, fy, c);
        px(ctx, fx + 1, fy, c);
        px(ctx, fx, fy + 1, c);
        px(ctx, fx, fy, '#ffe68a');
      }
    }
  };
}

function pavers(base: string, dark: string, light: string, size: number, seed: number): Draw {
  return (ctx, x, y) => {
    rect(ctx, x, y, 16, 16, base);
    speckle(ctx, x, y, 16, 16, dark, 0.05, seed);
    for (let j = 0; j < 16; j += size) {
      for (let i = 0; i < 16; i += size) {
        hline(ctx, x + i, y + j, size, dark);
        vline(ctx, x + i, y + j, size, dark);
        hline(ctx, x + i + 1, y + j + 1, size - 2, light);
        if (hash2(x + i, y + j, seed) < 0.25) rect(ctx, x + i + 1, y + j + 1, size - 1, size - 1, shade(base, -0.05));
      }
    }
  };
}

function asphalt(seed: number): Draw {
  return (ctx, x, y) => {
    rect(ctx, x, y, 16, 16, P.asphalt);
    speckle(ctx, x, y, 16, 16, P.asphaltDark, 0.12, seed);
    speckle(ctx, x, y, 16, 16, P.asphaltLight, 0.07, seed + 3);
  };
}

function water(frame: number): Draw {
  return (ctx, x, y) => {
    rect(ctx, x, y, 16, 16, P.water);
    speckle(ctx, x, y, 16, 16, P.waterDark, 0.1, 77);
    for (let i = 0; i < 3; i++) {
      const wy = (i * 6 + frame * 2) % 16;
      const wx = (i * 7 + frame * 3) % 12;
      hline(ctx, x + wx, y + wy, 4, P.waterLight);
      hline(ctx, x + ((wx + 8) % 13), y + ((wy + 3) % 16), 3, shade(P.waterLight, -0.15));
    }
    if (frame === 1) px(ctx, x + 11, y + 4, P.waterFoam);
    if (frame === 2) px(ctx, x + 3, y + 12, P.waterFoam);
  };
}

function planks(light: string, dark: string, seam: string, horizontal = true, seed = 0): Draw {
  return (ctx, x, y) => {
    rect(ctx, x, y, 16, 16, light);
    for (let r = 0; r < 4; r++) {
      const yy = y + r * 4;
      const c = hash2(r, seed, 1) < 0.5 ? light : shade(light, -0.06);
      if (horizontal) {
        rect(ctx, x, yy, 16, 4, c);
        hline(ctx, x, yy + 3, 16, seam);
        const cut = Math.floor(hash2(r, seed, 2) * 12) + 2;
        vline(ctx, x + cut, yy, 3, seam);
        hline(ctx, x, yy, 16, shade(c, 0.08));
        speckle(ctx, x, yy, 16, 3, dark, 0.06, seed + r);
      } else {
        rect(ctx, x + r * 4, y, 4, 16, c);
        vline(ctx, x + r * 4 + 3, y, 16, seam);
      }
    }
  };
}

function tiles8(a: string, b: string, grout: string, checker: boolean, size = 8): Draw {
  return (ctx, x, y) => {
    for (let j = 0; j < 16; j += size) {
      for (let i = 0; i < 16; i += size) {
        const c = checker ? (((i + j) / size) % 2 === 0 ? a : b) : a;
        rect(ctx, x + i, y + j, size, size, c);
        hline(ctx, x + i, y + j, size, grout);
        vline(ctx, x + i, y + j, size, grout);
        px(ctx, x + i + 1, y + j + 1, shade(c, 0.15));
      }
    }
  };
}

function carpetPattern(base: string, dark: string, motif: string, accent: string, part: number): Draw {
  // a 32×32 repeating motif split into four tiles
  return (ctx, x, y) => {
    const ox = (part % 2) * 16;
    const oy = Math.floor(part / 2) * 16;
    rect(ctx, x, y, 16, 16, base);
    dither(ctx, x, y, 16, 16, shade(base, -0.06), part);
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const gx = ox + i;
        const gy = oy + j;
        // diamond lattice
        const d1 = (gx + gy) % 32;
        const d2 = (gx - gy + 64) % 32;
        if (d1 === 0 || d2 === 0) px(ctx, x + i, y + j, dark);
        // medallion at lattice centres
        const cx = Math.abs(((gx + 16) % 32) - 16);
        const cy = Math.abs(((gy) % 32) - 16);
        const m = cx + cy;
        if (m === 4 || m === 5) px(ctx, x + i, y + j, motif);
        if (m <= 1) px(ctx, x + i, y + j, accent);
        const cx2 = Math.abs((gx % 32) - 16);
        const cy2 = Math.abs(((gy + 16) % 32) - 16);
        const m2 = cx2 + cy2;
        if (m2 === 3) px(ctx, x + i, y + j, shade(motif, -0.2));
      }
    }
  };
}

function marble(base: string, vein: string, seed: number): Draw {
  return (ctx, x, y) => {
    rect(ctx, x, y, 16, 16, base);
    speckle(ctx, x, y, 16, 16, shade(base, -0.05), 0.15, seed);
    let vx = x + Math.floor(hash2(seed, 1, 2) * 16);
    for (let j = 0; j < 16; j++) {
      px(ctx, vx, y + j, vein);
      if (hash2(j, seed, 9) < 0.4) vx += hash2(j, seed, 4) < 0.5 ? -1 : 1;
      vx = Math.max(x, Math.min(x + 15, vx));
    }
    hline(ctx, x, y, 16, shade(base, -0.12));
    vline(ctx, x, y, 16, shade(base, -0.12));
  };
}

// ------------------------------------------------------------------ walls

export interface WallStyle {
  id: string;
  color: string;
  pattern: 'stripes' | 'plain' | 'damask' | 'panel' | 'brick' | 'dots' | 'marble' | 'concrete' | 'wood';
  trim: string;
  base: string;
}

export const WALL_STYLES: WallStyle[] = [
  { id: 'cream', color: '#e3d7bd', pattern: 'stripes', trim: '#f2ead8', base: '#8a6a4a' },
  { id: 'brick', color: P.brick, pattern: 'brick', trim: '#4a2a22', base: '#3a2420' },
  { id: 'darkwood', color: '#5a3a26', pattern: 'panel', trim: '#c9a25a', base: '#3a2416' },
  { id: 'red', color: '#7a1626', pattern: 'damask', trim: P.gold, base: '#3a0c14' },
  { id: 'white', color: '#e8e8e6', pattern: 'plain', trim: '#ffffff', base: '#9aa0a8' },
  { id: 'blue', color: '#6f86a6', pattern: 'plain', trim: '#d6dde8', base: '#3e4a5e' },
  { id: 'green', color: '#2f5a44', pattern: 'stripes', trim: '#c9a25a', base: '#22362a' },
  { id: 'concrete', color: '#8c8f96', pattern: 'concrete', trim: '#a7aab0', base: '#5c5f66' },
  { id: 'pastel', color: '#b9dcc8', pattern: 'dots', trim: '#f4f1ea', base: '#7a5a3a' },
  { id: 'marble', color: '#d9d5cc', pattern: 'marble', trim: '#f4f1ea', base: '#8c8476' },
  { id: 'purple', color: '#3a1a4e', pattern: 'damask', trim: P.goldLight, base: '#1c0c26' },
  { id: 'wood', color: '#9a6a40', pattern: 'wood', trim: '#c9965f', base: '#5e3e26' },
];

function wallPattern(ctx: Ctx, s: WallStyle, x: number, y: number, h: number, yOffset: number): void {
  rect(ctx, x, y, 16, h, s.color);
  const dk = shade(s.color, -0.12);
  const lt = shade(s.color, 0.1);
  switch (s.pattern) {
    case 'stripes':
      for (let i = 0; i < 16; i += 4) vline(ctx, x + i, y, h, dk);
      break;
    case 'damask':
      for (let j = 0; j < h; j++) {
        const gy = j + yOffset;
        for (let i = 0; i < 16; i++) {
          const m = Math.abs((i % 8) - 4) + Math.abs((gy % 8) - 4);
          if (m === 3) px(ctx, x + i, y + j, shade(s.trim, -0.3));
        }
      }
      break;
    case 'panel':
      for (let i = 0; i < 16; i += 8) {
        vline(ctx, x + i, y, h, shade(s.color, -0.25));
        vline(ctx, x + i + 1, y, h, lt);
      }
      speckle(ctx, x, y, 16, h, dk, 0.08, 4);
      break;
    case 'brick':
      for (let j = 0; j < h; j += 4) {
        const off = ((j + yOffset) / 4) % 2 === 0 ? 0 : 4;
        hline(ctx, x, y + j, 16, P.mortar);
        for (let i = off; i < 16; i += 8) vline(ctx, x + i, y + j, 4, P.mortar);
        speckle(ctx, x, y + j + 1, 16, 3, P.brickLight, 0.1, j);
      }
      break;
    case 'dots':
      for (let j = 2; j < h; j += 5) for (let i = (j % 2) * 2 + 1; i < 16; i += 5) px(ctx, x + i, y + j, lt);
      break;
    case 'marble':
      speckle(ctx, x, y, 16, h, dk, 0.1, 9);
      break;
    case 'concrete':
      speckle(ctx, x, y, 16, h, dk, 0.12, 3);
      vline(ctx, x + 15, y, h, dk);
      break;
    case 'wood':
      for (let i = 0; i < 16; i += 4) vline(ctx, x + i, y, h, dk);
      speckle(ctx, x, y, 16, h, lt, 0.05, 2);
      break;
    case 'plain':
      speckle(ctx, x, y, 16, h, dk, 0.03, 1);
      break;
  }
}

function wallTop(s: WallStyle): Draw {
  return (ctx, x, y) => {
    const c = shade(s.base, -0.35);
    rect(ctx, x, y, 16, 16, c);
    speckle(ctx, x, y, 16, 16, shade(c, 0.12), 0.08, 5);
    hline(ctx, x, y + 15, 16, shade(c, 0.25));
  };
}

function wallUpper(s: WallStyle): Draw {
  return (ctx, x, y) => {
    wallPattern(ctx, s, x, y, 16, 0);
    rect(ctx, x, y, 16, 2, shade(s.base, -0.35));
    hline(ctx, x, y + 2, 16, s.trim);
    hline(ctx, x, y + 3, 16, shade(s.trim, -0.3));
  };
}

function wallLower(s: WallStyle): Draw {
  return (ctx, x, y) => {
    wallPattern(ctx, s, x, y, 16, 16);
    rect(ctx, x, y + 11, 16, 5, s.base);
    hline(ctx, x, y + 11, 16, shade(s.base, 0.3));
    hline(ctx, x, y + 15, 16, shade(s.base, -0.3));
  };
}

// ------------------------------------------------------------------ registry

const DEFS: [string, Draw][] = [];
const def = (name: string, d: Draw) => DEFS.push([name, d]);

def('empty', (ctx, x, y) => rect(ctx, x, y, 16, 16, '#000000'));
for (let i = 0; i < 4; i++) def(`grass${i}`, grass(i * 13 + 1));
def('grass_flowers', grass(91, true));
def('grass_flowers2', grass(57, true));
def('sidewalk', pavers(P.sidewalk, P.sidewalkDark, P.sidewalkLight, 8, 1));
def('sidewalk2', pavers(P.sidewalk, P.sidewalkDark, P.sidewalkLight, 8, 2));
def('curb_s', (ctx, x, y) => {
  pavers(P.sidewalk, P.sidewalkDark, P.sidewalkLight, 8, 3)(ctx, x, y);
  rect(ctx, x, y + 13, 16, 3, P.curb);
  hline(ctx, x, y + 13, 16, P.sidewalkLight);
  hline(ctx, x, y + 15, 16, shade(P.curb, -0.3));
});
def('curb_n', (ctx, x, y) => {
  pavers(P.sidewalk, P.sidewalkDark, P.sidewalkLight, 8, 4)(ctx, x, y);
  rect(ctx, x, y, 16, 3, P.curb);
  hline(ctx, x, y + 2, 16, shade(P.curb, -0.25));
});
def('curb_e', (ctx, x, y) => {
  pavers(P.sidewalk, P.sidewalkDark, P.sidewalkLight, 8, 5)(ctx, x, y);
  rect(ctx, x + 13, y, 3, 16, P.curb);
  vline(ctx, x + 15, y, 16, shade(P.curb, -0.3));
});
def('curb_w', (ctx, x, y) => {
  pavers(P.sidewalk, P.sidewalkDark, P.sidewalkLight, 8, 6)(ctx, x, y);
  rect(ctx, x, y, 3, 16, P.curb);
  vline(ctx, x, y, 16, shade(P.curb, -0.3));
});
def('road', asphalt(1));
def('road2', asphalt(2));
def('road_line_h', (ctx, x, y) => {
  asphalt(3)(ctx, x, y);
  rect(ctx, x + 3, y + 15, 10, 1, P.lineYellow);
});
def('road_line_v', (ctx, x, y) => {
  asphalt(4)(ctx, x, y);
  rect(ctx, x + 15, y + 3, 1, 10, P.lineYellow);
});
def('road_edge_n', (ctx, x, y) => {
  asphalt(5)(ctx, x, y);
  hline(ctx, x, y + 1, 16, shade(P.lineWhite, -0.3));
});
def('road_edge_s', (ctx, x, y) => {
  asphalt(6)(ctx, x, y);
  hline(ctx, x, y + 14, 16, shade(P.lineWhite, -0.3));
});
def('crosswalk_h', (ctx, x, y) => {
  asphalt(7)(ctx, x, y);
  rect(ctx, x + 1, y, 5, 16, P.lineWhite);
  rect(ctx, x + 9, y, 5, 16, P.lineWhite);
  speckle(ctx, x, y, 16, 16, shade(P.lineWhite, -0.25), 0.08, 8);
});
def('crosswalk_v', (ctx, x, y) => {
  asphalt(8)(ctx, x, y);
  rect(ctx, x, y + 1, 16, 5, P.lineWhite);
  rect(ctx, x, y + 9, 16, 5, P.lineWhite);
  speckle(ctx, x, y, 16, 16, shade(P.lineWhite, -0.25), 0.08, 9);
});
def('parking', (ctx, x, y) => {
  asphalt(9)(ctx, x, y);
  vline(ctx, x, y + 2, 13, P.lineWhite);
});
def('plaza', pavers(P.plaza, P.plazaDark, P.plazaLight, 8, 11));
def('plaza2', (ctx, x, y) => {
  pavers(P.plaza, P.plazaDark, P.plazaLight, 8, 12)(ctx, x, y);
  rect(ctx, x + 4, y + 4, 8, 8, shade(P.plaza, -0.08));
  rect(ctx, x + 6, y + 6, 4, 4, shade(P.plaza, 0.1));
});
def('plaza_fancy', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, '#b9ad9a');
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const m = Math.abs(i - 7.5) + Math.abs(j - 7.5);
    if (m > 6.5 && m < 8) px(ctx, x + i, y + j, '#8f8370');
    if (m < 2) px(ctx, x + i, y + j, P.goldDark);
  }
  hline(ctx, x, y, 16, '#cfc4b2');
});
def('path', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, P.dirt);
  speckle(ctx, x, y, 16, 16, P.dirtDark, 0.15, 21);
  speckle(ctx, x, y, 16, 16, P.dirtLight, 0.1, 22);
  speckle(ctx, x, y, 16, 16, '#b8b0a0', 0.02, 23);
});
for (let f = 0; f < 3; f++) def(`water${f}`, water(f));
def('shore_n', (ctx, x, y) => {
  water(0)(ctx, x, y);
  rect(ctx, x, y, 16, 3, P.sand);
  hline(ctx, x, y + 3, 16, P.waterFoam);
  speckle(ctx, x, y + 4, 16, 2, P.waterFoam, 0.4, 3);
});
def('sand', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, P.sand);
  speckle(ctx, x, y, 16, 16, shade(P.sand, -0.1), 0.14, 31);
  speckle(ctx, x, y, 16, 16, shade(P.sand, 0.1), 0.08, 32);
});
def('dock', planks('#8a6a4a', '#5e4630', '#4a3624', true, 3));
def('court', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, '#3f6f8a');
  speckle(ctx, x, y, 16, 16, '#36607a', 0.1, 41);
});
def('court_orange', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, '#b8643c');
  speckle(ctx, x, y, 16, 16, '#a35632', 0.1, 42);
});
def('runner_l', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, P.casinoRed);
  speckle(ctx, x, y, 16, 16, P.casinoRedDark, 0.12, 51);
  rect(ctx, x, y, 2, 16, P.gold);
  vline(ctx, x + 3, y, 16, P.goldDark);
});
def('runner_c', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, P.casinoRed);
  speckle(ctx, x, y, 16, 16, P.casinoRedDark, 0.12, 52);
});
def('runner_r', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, P.casinoRed);
  speckle(ctx, x, y, 16, 16, P.casinoRedDark, 0.12, 53);
  rect(ctx, x + 14, y, 2, 16, P.gold);
  vline(ctx, x + 12, y, 16, P.goldDark);
});
def('hedge', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, '#2f5e2c');
  for (let i = 0; i < 9; i++) {
    const cx = x + 1 + Math.floor(hash2(i, 4, 61) * 14);
    const cy = y + 1 + Math.floor(hash2(4, i, 62) * 13);
    rect(ctx, cx, cy, 3, 2, '#3f7a38');
    px(ctx, cx + 1, cy, '#5c9a4a');
  }
  hline(ctx, x, y + 15, 16, '#21401f');
});
def('stone_wall', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, '#8a8580');
  for (let j = 0; j < 16; j += 5) {
    hline(ctx, x, y + j, 16, '#5e5a56');
    for (let i = (j / 5) % 2 ? 3 : 7; i < 16; i += 8) vline(ctx, x + i, y + j, 5, '#5e5a56');
  }
  speckle(ctx, x, y, 16, 16, '#a19c96', 0.1, 63);
});
def('garden', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, '#5a3e2a');
  speckle(ctx, x, y, 16, 16, '#4a3222', 0.2, 71);
  const cols = ['#e04a5a', '#f2c94c', '#f4f1ea', '#b46bff'];
  for (let i = 0; i < 5; i++) {
    const fx = x + 2 + ((i * 5) % 12);
    const fy = y + 3 + ((i * 7) % 10);
    rect(ctx, fx, fy, 1, 3, '#3f7a38');
    px(ctx, fx - 1, fy + 1, '#4f9142');
    px(ctx, fx, fy - 1, cols[i % cols.length]);
  }
});
def('rail', (ctx, x, y) => {
  pavers(P.plaza, P.plazaDark, P.plazaLight, 8, 13)(ctx, x, y);
  rect(ctx, x, y + 9, 16, 2, '#5e6470');
  hline(ctx, x, y + 9, 16, '#9aa2b0');
  for (let i = 1; i < 16; i += 5) rect(ctx, x + i, y + 9, 1, 6, '#4a505c');
});
// interior floors
def('wood_light', planks(P.woodPale, P.wood, shade(P.wood, -0.2), true, 81));
def('wood_mid', planks(P.woodLight, P.wood, P.woodDark, true, 82));
def('wood_dark', planks('#5a3a26', '#3a2416', '#2a1a10', true, 83));
def('parquet', (ctx, x, y) => {
  for (let j = 0; j < 16; j += 4) for (let i = 0; i < 16; i += 8) {
    const alt = ((i + j) / 4) % 2 === 0;
    rect(ctx, x + i, y + j, 8, 4, alt ? '#a8703f' : '#94603a');
    hline(ctx, x + i, y + j, 8, '#6a4428');
    vline(ctx, x + i, y + j, 4, '#6a4428');
  }
});
def('tile_white', tiles8('#e8e6e0', '#e8e6e0', '#c4c0b8', false));
def('tile_checker', tiles8('#e8e6e0', '#2a2730', '#9a968e', true));
def('tile_beige', tiles8('#d8ccb4', '#d8ccb4', '#b4a68c', false));
def('tile_blue', tiles8('#9cc6dc', '#9cc6dc', '#7aa4ba', false, 4));
def('tile_kitchen', tiles8('#e9dcc0', '#c4704a', '#a89c84', true, 4));
for (let i = 0; i < 4; i++) def(`carpet_casino${i}`, carpetPattern(P.carpetRed, P.carpetRedDark, P.goldDark, P.gold, i));
for (let i = 0; i < 4; i++) def(`carpet_vip${i}`, carpetPattern(P.carpetPurple, '#2a1238', P.goldDark, P.goldLight, i));
def('carpet_blue', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, P.carpetBlue);
  speckle(ctx, x, y, 16, 16, shade(P.carpetBlue, -0.1), 0.2, 91);
  speckle(ctx, x, y, 16, 16, shade(P.carpetBlue, 0.1), 0.06, 92);
});
def('carpet_green', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, P.carpetGreen);
  dither(ctx, x, y, 16, 16, shade(P.carpetGreen, -0.08));
  for (let i = 0; i < 16; i += 8) for (let j = 0; j < 16; j += 8) px(ctx, x + i + 3, y + j + 3, P.goldDark);
});
def('carpet_beige', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, '#c9b896');
  speckle(ctx, x, y, 16, 16, '#b8a682', 0.2, 93);
});
def('carpet_grey', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, '#6e6a72');
  speckle(ctx, x, y, 16, 16, '#5e5a62', 0.2, 94);
  speckle(ctx, x, y, 16, 16, '#7e7a82', 0.08, 95);
});
def('marble', marble('#e6e2da', '#b8b2a6', 101));
def('marble2', marble('#e6e2da', '#c4beb2', 102));
def('marble_dark', marble('#2a2730', '#5a5562', 103));
def('concrete', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, '#8a8a88');
  speckle(ctx, x, y, 16, 16, '#7a7a78', 0.18, 111);
  speckle(ctx, x, y, 16, 16, '#9a9a98', 0.08, 112);
  if (hash2(1, 2, 3) < 0.5) hline(ctx, x + 3, y + 9, 5, '#6a6a68');
});
def('mat', (ctx, x, y) => {
  rect(ctx, x, y, 16, 16, '#5a4636');
  rect(ctx, x + 2, y + 3, 12, 10, '#7a5a3e');
  speckle(ctx, x + 2, y + 3, 12, 10, '#6a4e36', 0.3, 121);
  rect(ctx, x + 4, y + 6, 8, 4, '#8a6a48');
});
for (const s of WALL_STYLES) {
  def(`wall_${s.id}_top`, wallTop(s));
  def(`wall_${s.id}_upper`, wallUpper(s));
  def(`wall_${s.id}_lower`, wallLower(s));
}

export const TILE_INDEX: Record<string, number> = Object.fromEntries(DEFS.map(([n], i) => [n, i]));

export function tileIndex(name: string): number {
  const i = TILE_INDEX[name];
  if (i === undefined) throw new Error(`unknown tile ${name}`);
  return i;
}

export function buildTileset(): HTMLCanvasElement {
  const rows = Math.ceil(DEFS.length / COLS);
  const { canvas, ctx } = makeCanvas(COLS * TILE, rows * TILE);
  DEFS.forEach(([, draw], i) => {
    const x = (i % COLS) * TILE;
    const y = Math.floor(i / COLS) * TILE;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, TILE, TILE);
    ctx.clip();
    draw(ctx, x, y);
    ctx.restore();
  });
  return canvas;
}

export const TILESET_COLUMNS = COLS;
