import { PROPS } from '../../art/props';
import { tileIndex } from '../../art/tiles';

export type Face = 'down' | 'up' | 'left' | 'right';

export type InteractKind =
  | 'bed'
  | 'kitchen'
  | 'wardrobe'
  | 'computer'
  | 'shop'
  | 'order'
  | 'table'
  | 'cashier'
  | 'atm'
  | 'teller'
  | 'work'
  | 'bus'
  | 'read'
  | 'tv'
  | 'exercise'
  | 'bench'
  | 'sign'
  | 'gate'
  | 'mirror'
  | 'door'
  | 'piano'
  | 'slots'
  | 'business';

export interface Interaction {
  kind: InteractKind;
  label: string;
  data?: Record<string, string | number | boolean>;
}

export interface PlacedProp {
  id: string;
  x: number;
  y: number;
  /** pixel nudge */
  ox?: number;
  oy?: number;
  interact?: Interaction;
  flipX?: boolean;
}

export interface Door {
  x: number;
  y: number;
  w: number;
  target: string;
  spawn: string;
  label: string;
  /** where the player appears when coming out of `target` into this map */
  exitSpawn?: { x: number; y: number; face: Face };
  closedText?: string;
}

export interface SpotDef {
  x: number;
  y: number;
  face: Face;
  sit?: boolean;
}

export interface Interactable {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  interact: Interaction;
}

export interface MapData {
  id: string;
  w: number;
  h: number;
  ground: number[];
  /** -1 = none; drawn above ground (e.g. wall faces) */
  overlay: number[];
  blocked: Uint8Array;
  props: PlacedProp[];
  buildings: string[];
  doors: Door[];
  spawns: Record<string, { x: number; y: number; face: Face }>;
  spots: Record<string, SpotDef>;
  interactables: Interactable[];
  water: number[];
  /** ambient light 0..1 in daytime and at night (interiors) */
  ambient: { day: number; night: number; color: number };
  outdoor: boolean;
  /** decorative staff positions (generic clerks, guards...) */
  staff: { x: number; y: number; face: Face; look: number; label: string; role: string }[];
  /** walkable areas preferred by pedestrians */
  walkways?: Uint8Array;
}

/** Helper used by both the city and interior builders. */
export class MapBuilder {
  readonly data: MapData;

  constructor(id: string, w: number, h: number, fill: string, outdoor: boolean) {
    const t = tileIndex(fill);
    this.data = {
      id,
      w,
      h,
      ground: new Array(w * h).fill(t),
      overlay: new Array(w * h).fill(-1),
      blocked: new Uint8Array(w * h),
      props: [],
      buildings: [],
      doors: [],
      spawns: {},
      spots: {},
      interactables: [],
      water: [],
      ambient: { day: 1, night: 1, color: 0x0a0820 },
      outdoor,
      staff: [],
    };
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.data.w && y < this.data.h;
  }

  idx(x: number, y: number): number {
    return y * this.data.w + x;
  }

  set(x: number, y: number, tile: string, blocked?: boolean): void {
    if (!this.inside(x, y)) return;
    this.data.ground[this.idx(x, y)] = tileIndex(tile);
    if (blocked !== undefined) this.data.blocked[this.idx(x, y)] = blocked ? 1 : 0;
  }

  get(x: number, y: number): number {
    return this.inside(x, y) ? this.data.ground[this.idx(x, y)] : -1;
  }

  fill(x: number, y: number, w: number, h: number, tile: string | ((x: number, y: number) => string), blocked?: boolean): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, typeof tile === 'string' ? tile : tile(i, j), blocked);
  }

  block(x: number, y: number, w = 1, h = 1, v = true): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.inside(i, j)) this.data.blocked[this.idx(i, j)] = v ? 1 : 0;
  }

  isBlocked(x: number, y: number): boolean {
    return !this.inside(x, y) || this.data.blocked[this.idx(x, y)] === 1;
  }

  /** Place a prop and mark its footprint blocked. */
  prop(id: string, x: number, y: number, interact?: Interaction, opts: { ox?: number; oy?: number; noBlock?: boolean; flipX?: boolean } = {}): PlacedProp {
    const def = PROPS[id];
    if (!def) throw new Error(`unknown prop ${id}`);
    const p: PlacedProp = { id, x, y, interact, ox: opts.ox, oy: opts.oy, flipX: opts.flipX };
    this.data.props.push(p);
    if (!opts.noBlock && !def.ground && !def.wall) {
      for (let j = 0; j < def.foot.h; j++) {
        for (let i = 0; i < def.foot.w; i++) {
          const m = def.mask ? def.mask[def.mask.length - 1 - j]?.[i] ?? 1 : 1;
          if (m) this.block(x + i, y - j);
        }
      }
    }
    if (interact) {
      const fw = Math.max(1, def.foot.w);
      const fh = Math.max(1, def.foot.h);
      this.data.interactables.push({ id: `${id}@${x},${y}`, x, y: y - fh + 1, w: fw, h: fh, interact });
    }
    return p;
  }

  interactable(id: string, x: number, y: number, w: number, h: number, interact: Interaction): void {
    this.data.interactables.push({ id, x, y, w, h, interact });
  }

  spot(name: string, x: number, y: number, face: Face = 'down', sit = false): void {
    this.data.spots[name] = { x, y, face, sit };
  }

  spawn(name: string, x: number, y: number, face: Face = 'down'): void {
    this.data.spawns[name] = { x, y, face };
  }

  staff(x: number, y: number, face: Face, look: number, label: string, role: string): void {
    this.data.staff.push({ x, y, face, look, label, role });
    this.block(x, y);
  }

  /**
   * Interior walls: '#' cells become wall tiles whose appearance depends on
   * what is below them (front face lower/upper, or wall top).
   */
  applyWalls(isWall: (x: number, y: number) => boolean, style: string): void {
    const { w, h } = this.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!isWall(x, y)) continue;
        const below1 = y + 1 < h && !isWall(x, y + 1);
        const below2 = y + 2 < h && isWall(x, y + 1) && !isWall(x, y + 2);
        const part = below1 ? 'lower' : below2 ? 'upper' : 'top';
        this.set(x, y, `wall_${style}_${part}`, true);
      }
    }
  }

  finish(): MapData {
    return this.data;
  }
}

export const T = 16;
