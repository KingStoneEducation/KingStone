import Phaser from 'phaser';
import type { GameCore } from '../core/GameCore';
import { store } from '../ui/store';
import { buildCityMap, type CityMap } from './maps/city';
import { interiorMap } from './maps/interiors';
import { ownShopMap } from './maps/ownShop';
import { BIZ_TYPES } from '../data/business';
import { CASINO_TABLES, casinoArea, type CasinoArea } from './maps/casinoMap';
import type { Door, Face, Interactable, InteractKind, MapData } from './maps/types';
import { BUILDING_BY_ID, BUS_STOPS, CITY_SPOTS, LOCATION_BUILDING } from './maps/cityLayout';
import { PROPS, propFrameName, type PropDef } from '../art/props';
import { displayTile, tileIndex } from '../art/tiles';
import { buildShading } from './shading';
import type { CharDir } from '../art/characters';
import { CharacterSprite, LABEL_DEPTH } from './CharacterSprite';
import { Lighting, hexColor, type Emissive, type LightSource } from './Lighting';
import { NpcDirector, type WorldHost } from './NpcDirector';
import { CityLife } from './CityLife';
import { CasinoFloor, seatPosition } from './CasinoFloor';
import { findPath, type Pt } from './pathfinding';
import { entryRefusal } from './access';
import { FEET, gateSide } from './gates';
import { BUILDING_OFFSET, frameRef } from './textures';
import { playerLook, staffLook } from './looks';
import { daylight, toDate } from '../core/calendar';
import { LOCATIONS, hoursText, isOpen } from '../data/locations';
import { HOMES } from '../data/housing';
import { NPC_BY_ID } from '../data/npcs';
import { TABLE_BY_ID, type TableConfig } from '../casino/tables';
import { formatG } from '../core/money';
import { patronLine, pedestrianLine, staffLine } from './ambientLines';

const DIR_VEC: Record<CharDir, { x: number; y: number }> = {
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE: Record<CharDir, CharDir> = { down: 'up', up: 'down', left: 'right', right: 'left' };

const VERBS: Record<InteractKind, string> = {
  bed: '休息 / 睡觉',
  kitchen: '做饭 / 吃东西',
  wardrobe: '换衣服',
  computer: '使用电脑',
  shop: '购物',
  order: '点单',
  table: '入座',
  cashier: '兑换筹码',
  atm: '使用 ATM',
  teller: '办理业务',
  work: '上班',
  bus: '乘坐公交',
  read: '看书',
  tv: '看电视',
  exercise: '运动',
  bench: '坐一会儿',
  sign: '查看',
  gate: '通过',
  mirror: '照镜子 / 换装',
  door: '进入',
  piano: '弹钢琴',
  slots: '查看',
  business: '打理生意',
};

const WALK_SPEED = 58;
const RUN_SPEED = 96;

const DISTRICTS: { name: string; x0: number; y0: number; x1: number; y1: number }[] = [
  { name: '赌场广场', x0: 86, y0: 17, x1: 107, y1: 26 },
  { name: '山丘富人区', x0: 0, y0: 0, x1: 51, y1: 25 },
  { name: '市中心 · 北区', x0: 52, y0: 0, x1: 107, y1: 25 },
  { name: '海港大道', x0: 0, y0: 26, x1: 107, y1: 33 },
  { name: '集市街', x0: 0, y0: 34, x1: 52, y1: 55 },
  { name: '联合广场', x0: 53, y0: 34, x1: 103, y1: 55 },
  { name: '码头街', x0: 0, y0: 56, x1: 107, y1: 63 },
  { name: '老城区', x0: 0, y0: 64, x1: 52, y1: 78 },
  { name: '旧码头', x0: 0, y0: 79, x1: 52, y1: 89 },
  { name: '河滨公园', x0: 53, y0: 64, x1: 103, y1: 89 },
  { name: '河滨步道', x0: 104, y0: 26, x1: 119, y1: 89 },
];

function districtAt(x: number, y: number): string {
  for (const d of DISTRICTS) if (x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1) return d.name;
  return '灰港';
}

function inputFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function tableLimits(cfg: TableConfig): string {
  const r = cfg.rules as Record<string, unknown>;
  if (cfg.game === 'poker') return `买入 ${formatG(Number(r.minBuyIn))}–${formatG(Number(r.maxBuyIn))}`;
  const min = (r.minBet ?? r.minTotal) as number | undefined;
  const max = (r.maxBet ?? r.maxOutside) as number | undefined;
  return min !== undefined && max !== undefined ? `${formatG(min)}–${formatG(max)}` : '';
}

interface PropView {
  img: Phaser.GameObjects.Image;
  night: Phaser.GameObjects.Image | null;
  em: Emissive | null;
  def: PropDef;
  refs: { key: string; frame: string }[];
  nightRefs: { key: string; frame: string }[];
  rate: number;
  phase: number;
  frame: number;
}

interface NightView {
  img: Phaser.GameObjects.Image;
  em: Emissive | null;
  /** fraction of windows that stay lit late at night */
  lateFactor: number;
}

interface StaffView {
  sprite: CharacterSprite;
  role: string;
  label: string;
  x: number;
  y: number;
}

type Focus =
  | { kind: 'npc'; id: string; sprite: CharacterSprite; label: string; verb: string }
  | { kind: 'interact'; it: Interactable; label: string; verb: string }
  | { kind: 'door'; door: Door; label: string; verb: string }
  | { kind: 'staff'; staff: StaffView; label: string; verb: string }
  | { kind: 'patron'; id: string; sprite: CharacterSprite; label: string; verb: string }
  | { kind: 'ped'; sprite: CharacterSprite; label: string; verb: string };

/** Public surface used by the React UI. */
export interface WorldApi {
  teleport(location: string, spawn: string | null, tile?: Pt): void;
  refreshPlayerLook(): void;
  leaveTable(): boolean;
  openTable(tableId: string): void;
  /** the casino room the player is standing in (null outside the casino) */
  casinoArea(): CasinoArea | null;
}

export class WorldScene extends Phaser.Scene implements WorldHost, WorldApi {
  core!: GameCore;
  map!: MapData;
  private attract = false;
  private cityCache: CityMap | null = null;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private tilemaps: Phaser.Tilemaps.Tilemap[] = [];
  private ground: Phaser.Tilemaps.TilemapLayer | null = null;
  /** floor shadows (see shading.ts) and the daylight part that fades at night */
  private shadeImgs: Phaser.GameObjects.Image[] = [];
  private sunShade: Phaser.GameObjects.Image | null = null;
  private props: PropView[] = [];
  private nights: NightView[] = [];
  private staticLights: LightSource[] = [];
  private emissives: Emissive[] = [];
  private staff: StaffView[] = [];
  private lighting!: Lighting;
  private npcDir: NpcDirector | null = null;
  private city: CityLife | null = null;
  private floor: CasinoFloor | null = null;
  player: CharacterSprite | null = null;
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'SHIFT', Phaser.Input.Keyboard.Key>;
  private focus: Focus | null = null;
  private marker: Phaser.GameObjects.Image | null = null;
  private ring: Phaser.GameObjects.Image | null = null;
  private ringUntil = 0;
  private arriveAction: (() => void) | null = null;
  private transitioning = false;
  private waterTiles: number[] = [];
  private waterFrame = 0;
  private waterAt = 0;
  private offs: (() => void)[] = [];
  private district = '';
  private spotCheckAt = 0;
  private staffCheckAt = 0;
  private benchSit = false;
  private attractT = 0;
  private tableKey: string | null = null;
  private playerLight: LightSource = { x: 0, y: 0, r: 30, color: 0xffffff, always: true, strength: 0.55 };
  private pendingLight: { darkness: number; color: number; lights: LightSource[]; glow: number; time: number } | null = null;

  constructor() {
    super('world');
  }

  init(data: { attract?: boolean }): void {
    this.attract = !!data?.attract;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b0912');
    this.lighting = new Lighting(this);
    this.waterTiles = ['water0', 'water1', 'water2'].map(tileIndex);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT', false) as WorldScene['keys'];
    this.input.keyboard!.on('keydown', this.onKey, this);
    this.input.on('pointerdown', this.onPointer, this);
    this.scale.on('resize', this.layoutCamera, this);
    this.cameras.main.on(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE, this.flushLighting);
    this.events.once('shutdown', () => this.shutdown());
    const mref = frameRef('marker');
    this.marker = this.add.image(0, 0, mref.key, mref.frame).setOrigin(0.5, 1).setDepth(LABEL_DEPTH + 5).setVisible(false);
    const rref = frameRef('target_ring');
    this.ring = this.add.image(0, 0, rref.key, rref.frame).setOrigin(0.5, 0.5).setDepth(-500).setVisible(false);

    if (this.attract) {
      this.loadMap('city', null);
      return;
    }
    this.core = store.core!;
    store.world = this;
    const bus = this.core.bus;
    this.offs.push(
      bus.on('world:teleport', ({ location, spawn }) => this.teleport(location, spawn)),
      bus.on('appearance', () => this.refreshPlayerLook()),
      bus.on('casino:backoff', () => this.guardApproach()),
      bus.on('dialogue:start', ({ npc }) => this.npcDir?.engage(npc)),
      bus.on('dialogue:end', ({ npc }) => this.npcDir?.disengage(npc)),
    );
    const w = this.core.state.world;
    const home = HOMES[this.core.state.housing.homeId]?.location;
    const spawn = w.x >= 0 ? null : w.location === home ? 'bed' : null;
    this.loadMap(w.location, spawn, w.x >= 0 ? { x: w.x, y: w.y } : undefined, w.facing as Face);
    this.onArrive(null, w.location);
    // resume a table that was open when the game was saved
    const active = this.core.state.casino.activeTable;
    if (active && w.location === 'casino') this.time.delayedCall(50, () => this.openTable(active));
  }

  private shutdown(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.clearMap();
    this.lighting?.destroy();
    this.input.keyboard?.off('keydown', this.onKey, this);
    this.input.off('pointerdown', this.onPointer, this);
    this.scale.off('resize', this.layoutCamera, this);
    this.cameras.main?.off(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE, this.flushLighting);
    if (store.world === this) store.world = null;
  }

  // ------------------------------------------------------------------ WorldHost

  get hostScene(): Phaser.Scene {
    return this;
  }

  entryTile(): Pt {
    const e = this.map.spawns.entry ?? this.map.spawns.start;
    return e ? { x: e.x, y: e.y } : { x: 1, y: 1 };
  }

  seatFor(npcId: string): { x: number; y: number; dir: CharDir; depth: number } | null {
    return this.floor?.npcSeat(npcId) ?? null;
  }

  casinoArea(): CasinoArea | null {
    if (this.map?.id !== 'casino' || !this.player) return null;
    return casinoArea(Math.floor(this.player.x / 16), Math.floor((this.player.y - 3) / 16));
  }

  playerPos(): { x: number; y: number } {
    if (this.player) return { x: this.player.x, y: this.player.y };
    const c = this.cameras.main;
    return { x: c.midPoint.x, y: c.midPoint.y };
  }

  // ------------------------------------------------------------------ map building

  private clearMap(): void {
    this.npcDir?.clear();
    this.npcDir = null;
    this.city?.destroy();
    this.city = null;
    this.floor?.destroy();
    this.floor = null;
    for (const s of this.staff) s.sprite.destroy();
    this.staff = [];
    this.player?.destroy();
    this.player = null;
    for (const o of this.objects) o.destroy();
    this.objects = [];
    for (const t of this.tilemaps) t.destroy();
    this.tilemaps = [];
    this.ground = null;
    for (const img of this.shadeImgs) {
      const key = img.texture.key;
      img.destroy();
      if (this.textures.exists(key)) this.textures.remove(key);
    }
    this.shadeImgs = [];
    this.sunShade = null;
    this.props = [];
    this.nights = [];
    this.staticLights = [];
    this.emissives = [];
    this.focus = null;
    this.arriveAction = null;
    this.benchSit = false;
    store.setPrompt(null);
  }

  private loadMap(id: string, spawn: string | null, tile?: Pt, face?: Face): void {
    this.clearMap();
    const map = id === 'city' ? (this.cityCache ??= buildCityMap()) : id === 'own_shop' ? ownShopMap(this.core?.state.business ?? null) : interiorMap(id);
    this.map = map;
    this.buildTiles(map);
    this.buildShade(map);
    this.buildProps(map);
    if (map.outdoor) this.buildBuildings(map);
    this.buildStaff(map);
    if (!this.attract) {
      const pos = this.resolveSpawn(map, spawn, tile, face);
      this.player = new CharacterSprite(this, playerLook(this.core), pos.x * 16 + 8, pos.y * 16 + 14, pos.face);
      this.player.depthBias = 0.2;
    }
    if (map.id === 'city') this.city = new CityLife(this, map as CityMap, () => this.playerPos());
    if (!this.attract) {
      if (map.id === 'casino') {
        this.floor = new CasinoFloor(this, this.core, map, this.entryTile());
        this.floor.build();
      }
      this.npcDir = new NpcDirector(this);
      this.npcDir.build();
    }
    this.layoutCamera();
    this.district = '';
  }

  private resolveSpawn(map: MapData, spawn: string | null, tile?: Pt, face?: Face): { x: number; y: number; face: Face } {
    const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < map.w && y < map.h && !map.blocked[y * map.w + x];
    if (tile) {
      // nearest walkable tile to the requested one
      for (let r = 0; r <= 6; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (ok(tile.x + dx, tile.y + dy)) return { x: tile.x + dx, y: tile.y + dy, face: face ?? 'down' };
          }
        }
      }
    }
    if (spawn && map.spawns[spawn]) return map.spawns[spawn];
    if (map.spawns.entry) return map.spawns.entry;
    if (map.spawns.start) return map.spawns.start;
    for (let i = 0; i < map.w * map.h; i++) if (!map.blocked[i]) return { x: i % map.w, y: Math.floor(i / map.w), face: 'down' };
    return { x: 1, y: 1, face: 'down' };
  }

  private buildTiles(map: MapData): void {
    const rows = (src: number[]) => {
      const out: number[][] = [];
      for (let y = 0; y < map.h; y++) out.push(src.slice(y * map.w, (y + 1) * map.w));
      return out;
    };
    const shown = map.ground.map((t, i) => displayTile(t, i % map.w, Math.floor(i / map.w)));
    const tm = this.make.tilemap({ data: rows(shown), tileWidth: 16, tileHeight: 16 });
    const ts = tm.addTilesetImage('tiles', 'tiles', 16, 16, 0, 0)!;
    this.ground = tm.createLayer(0, ts, 0, 0)!.setDepth(-1000);
    this.tilemaps.push(tm);
    if (map.overlay.some((v) => v >= 0)) {
      const tm2 = this.make.tilemap({ data: rows(map.overlay), tileWidth: 16, tileHeight: 16 });
      const ts2 = tm2.addTilesetImage('tiles', 'tiles', 16, 16, 0, 0)!;
      tm2.createLayer(0, ts2, 0, 0)!.setDepth(-990);
      this.tilemaps.push(tm2);
    }
  }

  private shadeSeq = 0;

  private buildShade(map: MapData): void {
    const layers = buildShading(map);
    const add = (canvas: HTMLCanvasElement, name: string) => {
      const key = `shade:${name}:${map.id}:${++this.shadeSeq}`;
      this.textures.addCanvas(key, canvas)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
      const img = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-895);
      this.shadeImgs.push(img);
      return img;
    };
    add(layers.ao, 'ao');
    if (layers.sun) this.sunShade = add(layers.sun, 'sun');
  }

  private buildProps(map: MapData): void {
    for (const p of map.props) {
      const d = PROPS[p.id];
      if (!d) continue;
      const frames = d.frames ?? 1;
      const x = Math.round(p.x * 16 + (Math.max(1, d.foot.w) * 16 - d.w) / 2 + (p.ox ?? 0));
      const y = Math.round((p.y + 1) * 16 - d.h + (p.oy ?? 0) + (d.dy ?? 0));
      const refs = Array.from({ length: frames }, (_, f) => frameRef(propFrameName(p.id, f)));
      const img = this.add.image(x, y, refs[0].key, refs[0].frame).setOrigin(0, 0);
      if (p.flipX) img.setFlipX(true);
      const base = (p.y + 1) * 16;
      const depth = d.ground ? -900 : d.wall ? -800 + p.y : d.overhead ? 120000 + base : base - 1;
      img.setDepth(depth);
      this.objects.push(img);
      const view: PropView = { img, night: null, em: null, def: d, refs, nightRefs: [], rate: 200, phase: (p.x * 31 + p.y * 17) % 7, frame: 0 };
      if (p.id === 'fountain') view.rate = 170;
      else if (p.id === 'roulette_table') view.rate = 120;
      else if (p.id.startsWith('slot')) view.rate = 240 + ((p.x * 13) % 5) * 40;
      if (d.night) {
        view.nightRefs = Array.from({ length: frames }, (_, f) => frameRef(propFrameName(p.id, f, true)));
        const nimg = this.add.image(x, y, view.nightRefs[0].key, view.nightRefs[0].frame).setOrigin(0, 0).setDepth(depth + 0.02).setAlpha(0);
        if (p.flipX) nimg.setFlipX(true);
        this.objects.push(nimg);
        view.night = nimg;
        if (!p.flipX) {
          view.em = { key: view.nightRefs[0].key, frame: view.nightRefs[0].frame, x, y, w: d.w, h: d.h, alpha: 0 };
          this.emissives.push(view.em);
        }
        this.nights.push({ img: nimg, em: view.em, lateFactor: 1 });
      }
      if (d.light) {
        const lx = p.flipX ? d.w - d.light.x : d.light.x;
        this.staticLights.push({
          x: x + lx,
          y: y + d.light.y,
          r: d.light.r,
          color: hexColor(d.light.color),
          always: d.light.always || !map.outdoor,
          flicker: p.id.startsWith('neon') ? 0.04 : undefined,
        });
      }
      this.props.push(view);
    }
  }

  private buildBuildings(map: MapData): void {
    for (const id of map.buildings) {
      const bd = BUILDING_BY_ID[id];
      if (!bd) continue;
      const ref = frameRef(`bld:${id}`);
      const nref = frameRef(`bld:${id}:n`);
      const x = bd.x * 16;
      const y = bd.y * 16 + (BUILDING_OFFSET[id] ?? 0);
      const depth = (bd.y + bd.h) * 16 - 2;
      const img = this.add.image(x, y, ref.key, ref.frame).setOrigin(0, 0).setDepth(depth);
      const nimg = this.add.image(x, y, nref.key, nref.frame).setOrigin(0, 0).setDepth(depth + 0.02).setAlpha(0);
      this.objects.push(img, nimg);
      const fr = this.textures.getFrame(nref.key, nref.frame);
      const em: Emissive = { key: nref.key, frame: nref.frame, x, y, w: fr.width, h: fr.height, alpha: 0 };
      this.emissives.push(em);
      const residential = !bd.target || bd.target.startsWith('home') || bd.style === 'house' || bd.style === 'mansion';
      this.nights.push({ img: nimg, em, lateFactor: residential ? 0.35 : bd.target === 'casino' ? 1 : 0.7 });
      if (bd.door) {
        const w = bd.door.w ?? 1;
        const cx = (bd.door.x + w / 2) * 16;
        const cy = (bd.door.y + 1) * 16 + 2;
        this.staticLights.push({ x: cx, y: cy, r: id === 'casino' ? 70 : 30, color: id === 'casino' ? 0xffc870 : 0xffd9a0, strength: id === 'casino' ? 0.9 : 0.7 });
      }
      if (id === 'casino') {
        const yb = (bd.y + bd.h) * 16 - 10;
        for (let i = 0; i <= bd.w; i += 3) this.staticLights.push({ x: (bd.x + i) * 16, y: yb, r: 34, color: i % 2 === 0 ? 0xff4fa0 : 0xffd25a, flicker: 0.05 });
      }
    }
  }

  private buildStaff(map: MapData): void {
    for (const s of map.staff) {
      const sprite = new CharacterSprite(this, staffLook(s.role, s.look), s.x * 16 + 8, s.y * 16 + 14, s.face);
      this.staff.push({ sprite, role: s.role, label: s.label, x: s.x, y: s.y });
    }
    if (map.id === 'casino') {
      // relief dealer at table 1 while Natasha is off shift
      const d = CASINO_TABLES.bj1.dealer;
      const sprite = new CharacterSprite(this, staffLook('dealer', 1499), d.x * 16 + 8, d.y * 16 + 14, d.face);
      this.staff.push({ sprite, role: 'dealer', label: '荷官', x: d.x, y: d.y });
    }
  }

  // ------------------------------------------------------------------ camera

  private zoom(): number {
    const s = store.settings.zoom;
    if (s > 0) return s;
    const w = this.scale.width;
    const h = this.scale.height;
    return Math.max(2, Math.min(6, Math.round(Math.min(w / (16 * 27), h / (16 * 15.5)))));
  }

  layoutCamera(): void {
    if (!this.map) return;
    const cam = this.cameras.main;
    const z = this.zoom();
    cam.setZoom(z);
    const W = this.map.w * 16;
    const H = this.map.h * 16;
    const vw = this.scale.width / z;
    const vh = this.scale.height / z;
    const bx = W < vw ? (W - vw) / 2 : 0;
    const by = H < vh ? (H - vh) / 2 : 0;
    cam.setBounds(bx, by, Math.max(W, vw), Math.max(H, vh));
    cam.setRoundPixels(true);
    if (this.player) {
      cam.startFollow(this.player.sprite, true, 0.14, 0.14, 0, 12);
      cam.centerOn(this.player.x, this.player.y - 12);
    } else cam.stopFollow();
  }

  // ------------------------------------------------------------------ frame update

  override update(time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    if (this.attract) {
      this.updateAttract(dt, time);
      return;
    }
    if (!this.core || !this.player) return;
    const core = this.core;
    if (!this.transitioning && !this.tableKey) this.updatePlayer(dt);
    this.player.update(dt, time);
    if (this.player.path.length > 0) this.checkDoor(this.player.dir);
    this.npcDir?.update(dt, time, core.nowFloat());
    this.city?.update(dt, time, toDate(core.now()).hour);
    this.floor?.update(dt, time);
    this.animate(time);
    if (time > this.staffCheckAt) {
      this.staffCheckAt = time + 500;
      this.updateStaffVisibility();
    }
    if (!this.tableKey) this.updateFocus(time);
    this.updateLighting(time, core.nowFloat());
    this.syncState();
    if (time > this.spotCheckAt) {
      this.spotCheckAt = time + 1000;
      this.checkSpots();
      this.updateDistrict();
    }
    if (this.ring && this.ring.visible && time > this.ringUntil) this.ring.setVisible(false);
  }

  private updatePlayer(dt: number): void {
    const p = this.player!;
    const blocked = store.blocking() || this.core.paused.has('dialogue') || inputFocused();
    let vx = 0;
    let vy = 0;
    if (!blocked) {
      const k = this.keys;
      if (k.A.isDown || k.LEFT.isDown) vx -= 1;
      if (k.D.isDown || k.RIGHT.isDown) vx += 1;
      if (k.W.isDown || k.UP.isDown) vy -= 1;
      if (k.S.isDown || k.DOWN.isDown) vy += 1;
    }
    if (vx !== 0 || vy !== 0) {
      if (p.path.length) {
        p.path = [];
        p.onArrive = null;
        this.arriveAction = null;
      }
      if (this.benchSit) this.standUpFromBench();
      const len = Math.hypot(vx, vy);
      vx /= len;
      vy /= len;
      const run = this.keys.SHIFT.isDown && this.core.state.player.stats.energy > 8;
      const speed = (run ? RUN_SPEED : WALK_SPEED) * this.core.player.speedMultiplier();
      const step = (speed * dt) / 1000;
      const dir: CharDir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
      this.moveAxis(vx * step, 0);
      this.moveAxis(0, vy * step);
      p.setMoving(true, dir);
      this.core.player.activity = 'walking';
      this.checkDoor(dir);
    } else if (p.path.length === 0) {
      if (p.moving) p.setMoving(false, p.dir);
      if (this.core.player.activity === 'walking') this.core.player.activity = 'idle';
    } else {
      this.core.player.activity = 'walking';
    }
  }

  private solidAt(px: number, py: number): boolean {
    const tx = Math.floor(px / 16);
    const ty = Math.floor(py / 16);
    if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return true;
    return this.map.blocked[ty * this.map.w + tx] === 1;
  }

  /** The feet hit-box: 9 x 5 px just above the sprite's base. */
  private boxBlocked(x: number, y: number): boolean {
    const l = x - FEET.halfW;
    const r = x + FEET.halfW;
    const t = y - FEET.top;
    const b = y - FEET.bottom;
    return this.solidAt(l, t) || this.solidAt(r, t) || this.solidAt(l, b) || this.solidAt(r, b);
  }

  private moveAxis(dx: number, dy: number): void {
    const p = this.player!;
    if (dx === 0 && dy === 0) return;
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!this.boxBlocked(nx, ny)) {
      p.x = nx;
      p.y = ny;
      return;
    }
    // corner assist: slide sideways towards a nearby opening
    const mag = Math.abs(dx) + Math.abs(dy);
    for (let off = 1; off <= 7; off++) {
      for (const s of [-1, 1]) {
        const ox = dx !== 0 ? 0 : s * off;
        const oy = dx !== 0 ? s * off : 0;
        if (!this.boxBlocked(nx + ox, ny + oy) && !this.boxBlocked(p.x + Math.sign(ox) * Math.min(off, mag), p.y + Math.sign(oy) * Math.min(off, mag))) {
          p.x += Math.sign(ox) * Math.min(off, mag);
          p.y += Math.sign(oy) * Math.min(off, mag);
          return;
        }
      }
    }
  }

  private animate(time: number): void {
    for (const v of this.props) {
      if (v.refs.length < 2) continue;
      const f = Math.floor(time / v.rate + v.phase) % v.refs.length;
      if (f === v.frame) continue;
      v.frame = f;
      v.img.setTexture(v.refs[f].key, v.refs[f].frame);
      if (v.night && v.nightRefs[f]) {
        v.night.setTexture(v.nightRefs[f].key, v.nightRefs[f].frame);
        if (v.em) {
          v.em.key = v.nightRefs[f].key;
          v.em.frame = v.nightRefs[f].frame;
        }
      }
    }
    if (this.map.water.length && time > this.waterAt) {
      this.waterAt = time + 450;
      this.waterFrame++;
      const layer = this.ground;
      if (layer) {
        const w = this.map.w;
        for (const i of this.map.water) {
          const x = i % w;
          const y = (i - x) / w;
          const t = layer.getTileAt(x, y);
          if (t) t.index = this.waterTiles[(this.waterFrame + ((x * 3 + y * 5) % 3)) % 3];
        }
      }
    }
  }

  private nightFactor(t: number): number {
    if (!this.map.outdoor) return 1;
    return clamp01((0.72 - daylight(t)) / 0.45);
  }

  private updateLighting(time: number, t: number): void {
    const m = this.map;
    const dl = daylight(t);
    const amb = m.ambient.night + (m.ambient.day - m.ambient.night) * dl;
    const darkness = 1 - amb;
    const night = this.nightFactor(t);
    this.sunShade?.setAlpha(m.outdoor ? 1 - night : clamp01((dl - 0.3) / 0.45));
    const hour = toDate(Math.floor(t)).hour;
    const late = m.outdoor && hour >= 1 && hour < 6;
    for (const n of this.nights) {
      const a = night * (late ? n.lateFactor : 1);
      n.img.setAlpha(a);
      if (n.em) n.em.alpha = a;
    }
    for (const v of this.props) if (v.em && v.night) v.em.alpha = v.night.alpha;
    const lights = this.staticLights.slice();
    if (this.city) lights.push(...this.city.lights(night > 0.3));
    if (this.player && darkness > 0.25) {
      this.playerLight.x = this.player.x;
      this.playerLight.y = this.player.y - 10;
      this.playerLight.r = 26;
      lights.push(this.playerLight);
    }
    this.pendingLight = { darkness, color: m.ambient.color, lights, glow: m.outdoor ? night : 1, time };
    // rendered from the camera's FOLLOW_UPDATE so it uses this frame's view
  }

  /** Draw the light overlay for the camera position of the frame being rendered. */
  private flushLighting = (): void => {
    const p = this.pendingLight;
    if (!p || !this.lighting) return;
    this.lighting.render(this.cameras.main, p.darkness, p.color, p.lights, p.glow, p.time, this.emissives);
  };

  private updateAttract(dt: number, time: number): void {
    this.attractT += dt;
    const pts = [
      { x: 97, y: 30 },
      { x: 78, y: 48 },
      { x: 30, y: 44 },
      { x: 14, y: 70 },
      { x: 70, y: 74 },
      { x: 100, y: 52 },
    ];
    const seg = 16000;
    const tt = this.attractT / seg;
    const i = Math.floor(tt) % pts.length;
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const u0 = tt - Math.floor(tt);
    const u = u0 * u0 * (3 - 2 * u0);
    const cam = this.cameras.main;
    cam.centerOn((a.x + (b.x - a.x) * u) * 16, (a.y + (b.y - a.y) * u) * 16);
    this.city?.update(dt, time, 21);
    this.animate(time);
    for (const n of this.nights) {
      n.img.setAlpha(1);
      if (n.em) n.em.alpha = 1;
    }
    for (const v of this.props) if (v.em && v.night) v.em.alpha = v.night.alpha;
    const lights = this.staticLights.concat(this.city?.lights(true) ?? []);
    this.lighting.render(cam, 0.72, this.map.ambient.color, lights, 1, time, this.emissives);
  }

  private updateStaffVisibility(): void {
    const sprites = this.npcDir ? [...this.npcDir.sprites.values()] : [];
    for (const s of this.staff) {
      const sx = s.x * 16 + 8;
      const sy = s.y * 16 + 14;
      const covered = sprites.some((n) => Math.abs(n.x - sx) < 10 && Math.abs(n.y - sy) < 10);
      s.sprite.sprite.setVisible(!covered);
      s.sprite.shadow.setVisible(!covered);
    }
  }

  private syncState(): void {
    const p = this.player!;
    const w = this.core.state.world;
    if (w.location !== this.map.id) return;
    w.x = Math.max(0, Math.min(this.map.w - 1, Math.floor(p.x / 16)));
    w.y = Math.max(0, Math.min(this.map.h - 1, Math.floor((p.y - 2) / 16)));
    w.facing = p.dir;
  }

  private checkSpots(): void {
    if (this.map.id !== 'city' || !this.player) return;
    const px = this.player.x / 16;
    const py = this.player.y / 16;
    for (const [name, s] of Object.entries(CITY_SPOTS)) {
      if (Math.abs(s.x + 0.5 - px) < 3 && Math.abs(s.y + 0.5 - py) < 3) this.core.events.nearSpot(name);
    }
  }

  private updateDistrict(): void {
    if (this.map.id !== 'city' || !this.player) return;
    const d = districtAt(Math.floor(this.player.x / 16), Math.floor(this.player.y / 16));
    if (d !== this.district) {
      const first = this.district === '';
      this.district = d;
      if (!first) store.banner(d, '灰港 · Greyhaven');
    }
  }

  // ------------------------------------------------------------------ doors & travel

  private checkDoor(dir: CharDir): void {
    if (this.transitioning || !this.player) return;
    const p = this.player;
    const tx = Math.floor(p.x / 16);
    const ty = Math.floor((p.y - 3) / 16);
    for (const d of this.map.doors) {
      if (ty !== d.y || tx < d.x || tx >= d.x + d.w) continue;
      if (this.map.outdoor ? dir !== 'up' : dir !== 'down') continue;
      this.useDoor(d);
      return;
    }
  }

  private useDoor(d: Door): void {
    const p = this.player!;
    if (d.target === 'city') {
      this.travel('city', d.spawn);
      return;
    }
    const refusal = entryRefusal(this.core, d.target);
    if (refusal) {
      p.stop();
      p.path = [];
      this.arriveAction = null;
      const back = d.exitSpawn ?? { x: d.x, y: d.y + 1, face: 'down' as Face };
      p.setPos(back.x * 16 + 8, back.y * 16 + 14);
      p.face('down');
      store.toast(refusal, 'warn');
      return;
    }
    this.travel(d.target, d.spawn);
  }

  /** Fade out, switch map, fade in. */
  private travel(location: string, spawn: string | null, tile?: Pt, face?: Face): void {
    if (this.transitioning) return;
    this.transitioning = true;
    store.fade = true;
    store.notify();
    this.core.paused.add('transition');
    this.player?.stop();
    const cam = this.cameras.main;
    cam.fadeOut(200, 8, 6, 14);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const from = this.map.id;
      this.core.setLocation(location, -1, -1);
      this.loadMap(location, spawn, tile, face);
      this.syncState();
      this.onArrive(from, location);
      cam.fadeIn(260, 8, 6, 14);
      this.core.paused.delete('transition');
      this.transitioning = false;
      store.fade = false;
      store.notify();
    });
  }

  teleport(location: string, spawn: string | null, tile?: Pt): void {
    if (this.attract) return;
    if (this.tableKey) this.closeTableScene();
    store.closeAll();
    this.travel(location, spawn, tile);
  }

  private onArrive(from: string | null, to: string): void {
    const core = this.core;
    const loc = LOCATIONS[to];
    if (to === 'city') {
      this.updateDistrict();
      store.banner(this.district || '灰港', from ? `离开${LOCATIONS[from]?.name ?? ''}` : '灰港 · Greyhaven');
    } else if (loc) {
      const biz = to === 'own_shop' ? this.core?.state.business : null;
      const sub = biz ? (biz.phase === 'open' ? `你的${BIZ_TYPES[biz.type].name}` : '装修中') : loc.hours ? `营业时间 ${hoursText(loc)}` : loc.desc.slice(0, 26);
      store.banner(loc.name, sub);
    }
    // people already here notice you walk in
    for (const id of core.social.presentNpcs(10)) core.social.observePlayer(id);
    if (to === 'casino') {
      const cs = core.state.casino;
      if (cs.securityCheckedDay !== core.today()) {
        cs.securityCheckedDay = core.today();
        const guard = this.staff.find((s) => s.role === 'guard');
        guard?.sprite.say('晚上好，请出示会员卡。', 2600, this.time.now);
        store.toast(`安保核对了你的会员卡（${core.casino.tierInfo().name}），金属探测门亮起绿灯。`, 'info');
      }
    }
    if (core.isAtHome()) core.bus.emit('autosave', { reason: 'home' });
    core.touch();
  }

  // ------------------------------------------------------------------ interaction focus

  private interactableAt(x: number, y: number): Interactable | null {
    for (const it of this.map.interactables) {
      if (x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h) return it;
    }
    return null;
  }

  private nearbyInteractable(tx: number, ty: number, dir: CharDir): Interactable | null {
    const v = DIR_VEC[dir];
    const direct = this.interactableAt(tx + v.x, ty + v.y) ?? this.interactableAt(tx, ty);
    if (direct) return direct;
    // forgiving: diagonal neighbours in the facing direction
    const side = v.x === 0 ? [{ x: -1, y: v.y }, { x: 1, y: v.y }] : [{ x: v.x, y: -1 }, { x: v.x, y: 1 }];
    for (const s of side) {
      const it = this.interactableAt(tx + s.x, ty + s.y);
      if (it) return it;
    }
    return null;
  }

  private labelFor(it: Interactable): { label: string; verb: string } {
    const k = it.interact.kind;
    let label = it.interact.label;
    let verb = VERBS[k];
    if (k === 'table') {
      const cfg = TABLE_BY_ID[String(it.interact.data?.table)];
      if (cfg) label = `${cfg.name} · ${tableLimits(cfg)}`;
    } else if (k === 'work') {
      const job = this.core.career.job(String(it.interact.data?.job));
      verb = job ? '上班' : '查看';
    } else if (k === 'gate') {
      verb = this.isInsideGate(it) ? '离开' : '进入';
    } else if (k === 'shop' || k === 'order') {
      const loc = LOCATIONS[this.map.id];
      if (loc?.name) label = `${label}`;
    }
    return { label, verb };
  }

  private updateFocus(time: number): void {
    const p = this.player;
    if (!p || this.transitioning || store.blocking()) {
      this.setFocus(null);
      return;
    }
    const v = DIR_VEC[p.dir];
    const fx = p.x + v.x * 12;
    const fy = p.y - 8 + v.y * 12;
    const tx = Math.floor(p.x / 16);
    const ty = Math.floor((p.y - 3) / 16);
    let f: Focus | null = null;
    const npc = this.npcDir?.nearest(fx, fy, 18);
    if (npc) {
      const rel = this.core.state.social.rel[npc.id];
      const def = NPC_BY_ID[npc.id];
      const label = rel?.knowsName ? `${def.name} · ${def.occupation}` : '陌生人';
      f = { kind: 'npc', id: npc.id, sprite: npc.sprite, label, verb: '交谈' };
    }
    if (!f) {
      const it = this.nearbyInteractable(tx, ty, p.dir);
      if (it) {
        const { label, verb } = this.labelFor(it);
        f = { kind: 'interact', it, label, verb };
      }
    }
    if (!f && this.map.outdoor && p.dir === 'up') {
      const door = this.map.doors.find((d) => ty - 1 === d.y && tx >= d.x && tx < d.x + d.w);
      if (door) {
        const loc = LOCATIONS[door.target];
        const d = toDate(this.core.now());
        const open = loc ? !loc.hours || isOpen(loc, d.weekday, d.minuteOfDay) : true;
        const status = loc?.hours ? (open ? ' · 营业中' : ' · 已打烊') : '';
        f = { kind: 'door', door, label: `${loc?.name ?? door.label}${status}`, verb: '进入' };
      }
    }
    if (!f) {
      for (const s of this.staff) {
        if (!s.sprite.sprite.visible) continue;
        if (Math.hypot(s.sprite.x - fx, s.sprite.y - 8 - fy) < 16) {
          f = { kind: 'staff', staff: s, label: s.label, verb: '搭话' };
          break;
        }
      }
    }
    if (!f && this.floor) {
      const pt = this.floor.nearestPatron(fx, fy, 14);
      if (pt) f = { kind: 'patron', id: pt.id, sprite: pt.sprite, label: '赌客', verb: '搭话' };
    }
    if (!f && this.city) {
      const ped = this.city.nearestPed(fx, fy, 14);
      if (ped) f = { kind: 'ped', sprite: ped, label: '路人', verb: '搭话' };
    }
    this.setFocus(f);
    if (this.marker && f) {
      const pos = this.focusAnchor(f);
      this.marker.setVisible(true).setPosition(Math.round(pos.x), Math.round(pos.y + Math.sin(time / 180) * 1.5));
    } else this.marker?.setVisible(false);
  }

  private focusAnchor(f: Focus): { x: number; y: number } {
    switch (f.kind) {
      case 'npc':
      case 'patron':
      case 'ped':
        return { x: f.sprite.x, y: f.sprite.y - 36 };
      case 'staff':
        return { x: f.staff.sprite.x, y: f.staff.sprite.y - 36 };
      case 'door':
        return { x: (f.door.x + f.door.w / 2) * 16, y: f.door.y * 16 - 4 };
      case 'interact': {
        const it = f.it;
        return { x: (it.x + it.w / 2) * 16, y: it.y * 16 - 6 };
      }
    }
  }

  private setFocus(f: Focus | null): void {
    this.focus = f;
    store.setPrompt(f ? { label: f.label, verb: f.verb } : null);
  }

  private onKey(ev: KeyboardEvent): void {
    if (this.attract || !this.player || this.transitioning || this.tableKey) return;
    if (store.blocking() || inputFocused() || this.core.paused.has('dialogue')) return;
    if (ev.repeat) return;
    if (ev.code === 'KeyE' || ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'NumpadEnter') {
      if (this.benchSit) {
        this.standUpFromBench();
        return;
      }
      this.interact();
    }
  }

  private interact(): void {
    const f = this.focus;
    if (!f) return;
    this.player!.stop();
    switch (f.kind) {
      case 'npc':
        this.talkTo(f.id, f.sprite);
        break;
      case 'interact':
        this.use(f.it);
        break;
      case 'door':
        this.useDoor(f.door);
        break;
      case 'staff':
        f.staff.sprite.face(OPPOSITE[this.player!.dir]);
        f.staff.sprite.say(staffLine(f.staff.role, this.core), 2800, this.time.now);
        break;
      case 'patron': {
        const pt = this.core.casino.patronById(f.id);
        if (pt) f.sprite.say(patronLine(pt, this.core), 2800, this.time.now);
        break;
      }
      case 'ped':
        f.sprite.stop();
        f.sprite.face(OPPOSITE[this.player!.dir]);
        f.sprite.say(pedestrianLine(this.core, Math.floor(f.sprite.x + f.sprite.y)), 2600, this.time.now);
        break;
    }
  }

  private talkTo(id: string, sprite: CharacterSprite): void {
    const err = this.core.dialogue.canTalk(id);
    if (err) {
      store.toast(err, 'warn');
      return;
    }
    // stop and turn to the player
    if (sprite.path.length) sprite.stop();
    if (sprite.fixedDepth === null) sprite.face(OPPOSITE[this.player!.dir]);
    const refused = this.core.dialogue.refusal(id);
    if (refused) {
      sprite.say(refused, 2800, this.time.now);
      return;
    }
    const view = this.core.dialogue.start(id);
    store.openModal({ type: 'dialogue', view });
  }

  private use(it: Interactable): void {
    const d = it.interact.data ?? {};
    const core = this.core;
    switch (it.interact.kind) {
      case 'bed':
        store.openModal({ type: 'sleep' });
        break;
      case 'kitchen':
        store.openModal({ type: 'kitchen' });
        break;
      case 'wardrobe':
      case 'mirror':
        store.openModal({ type: 'wardrobe' });
        break;
      case 'computer':
        store.openModal({ type: 'computer' });
        break;
      case 'shop':
        store.openModal({ type: 'shop', shopId: String(d.shop) });
        break;
      case 'order':
        store.openModal({ type: 'shop', shopId: String(d.shop), consume: true });
        break;
      case 'table':
        this.sitAtTable(String(d.table));
        break;
      case 'cashier':
        store.openModal({ type: 'cashier' });
        break;
      case 'atm':
        store.openModal({ type: 'atm', where: (String(d.where ?? 'street') as 'branch' | 'street' | 'casino') });
        break;
      case 'teller':
        store.openModal({ type: 'bank', tab: d.loans ? 'loans' : 'account' });
        break;
      case 'work':
        store.openModal({ type: 'work', jobId: String(d.job) });
        break;
      case 'bus':
        store.openModal({ type: 'bus', stop: String(d.stop) });
        break;
      case 'read':
        store.openModal({ type: 'read' });
        break;
      case 'tv':
      case 'piano':
      case 'exercise': {
        const r = core.player.leisure(it.interact.kind);
        store.toast(r.text, r.ok ? 'good' : 'warn');
        break;
      }
      case 'bench':
        this.sitOnBench(it);
        break;
      case 'sign':
        store.openModal({ type: 'text', title: it.interact.label, text: String(d.text ?? '') });
        break;
      case 'gate':
        this.useGate(it);
        break;
      case 'slots':
        store.openModal({
          type: 'text',
          title: '老虎机',
          text: '一排闪烁的老虎机。机台旁贴着告示：「本区机台正在进行合规检测与回报率公示，暂停对外开放。」\n\n（开发说明：老虎机不在第一阶段范围内，尚未实现。可以去 21 点、百家乐和轮盘桌游戏。）',
        });
        break;
      case 'business':
        if (d.action === 'work') {
          const r = core.business.workShift();
          store.toast(r.ok ? r.message : r.error, r.ok ? 'good' : 'warn');
        } else store.openPanel('business');
        break;
      case 'door':
        break;
    }
  }

  private sitOnBench(it: Interactable): void {
    const p = this.player!;
    p.setPos(it.x * 16 + it.w * 8, it.y * 16 + 14);
    p.setSitting(true, 'down');
    p.fixedDepth = (it.y + 1) * 16 + 1;
    this.benchSit = true;
    const r = this.core.player.leisure('bench');
    store.toast(r.text, 'info');
  }

  private standUpFromBench(): void {
    const p = this.player!;
    this.benchSit = false;
    p.fixedDepth = null;
    p.setSitting(false);
    const tx = Math.floor(p.x / 16);
    const ty = Math.floor(p.y / 16);
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (!this.map.blocked[(ty + dy) * this.map.w + tx + dx]) {
        p.setPos((tx + dx) * 16 + 8, (ty + dy) * 16 + 14);
        break;
      }
    }
  }

  private gatePoints(it: Interactable): { inside: Pt; outside: Pt } {
    const d = it.interact.data ?? {};
    const [ix, iy] = String(d.inside).split(',').map(Number);
    const [ox, oy] = String(d.outside).split(',').map(Number);
    return { inside: { x: ix, y: iy }, outside: { x: ox, y: oy } };
  }

  /**
   * Which side of the gate the player is on. Measured from the middle of the
   * feet hit-box (not the sprite's base, which pokes into the gate row when
   * the player walks up to it from inside), projected onto the inside→outside
   * axis so it does not matter how far along the gate the player stands.
   */
  private isInsideGate(it: Interactable): boolean {
    const p = this.player!;
    return gateSide(this.gatePoints(it), p.x, p.y) === 'inside';
  }

  private useGate(it: Interactable): void {
    const area = String(it.interact.data?.area);
    const { inside, outside } = this.gatePoints(it);
    const p = this.player!;
    const going = !this.isInsideGate(it);
    if (going) {
      let err: string | null = null;
      if (area === 'office') {
        const victor = this.core.social.rel('victor');
        const invited = Number(this.core.state.player.flags.officeInviteUntil ?? -1) >= this.core.today();
        if (!invited && !(victor.met && victor.familiarity >= 35 && this.core.casino.tierAtLeast('platinum'))) err = '保安拦住了你：「经理办公室，非请勿入。」';
      } else err = this.core.casino.areaAccess(area as 'high' | 'vip');
      if (err) {
        store.toast(err, 'warn');
        return;
      }
    }
    const target = going ? inside : outside;
    this.cameras.main.flash(120, 10, 6, 18);
    p.setPos(target.x * 16 + 8, target.y * 16 + 14);
    p.face(going ? (target.y < outside.y ? 'up' : target.x < outside.x ? 'left' : 'right') : 'down');
    if (going) store.banner(area === 'vip' ? 'VIP 私人厅' : area === 'high' ? '高额投注区' : '经理办公室', area === 'vip' ? '仅限受邀贵宾' : area === 'high' ? 'High Limit Salon' : '');
  }

  // ------------------------------------------------------------------ casino tables

  private sitAtTable(tableId: string): void {
    const r = this.core.casino.sit(tableId);
    if (!r.ok) {
      store.toast(r.error, 'warn');
      return;
    }
    this.openTable(tableId);
  }

  openTable(tableId: string): void {
    const cfg = TABLE_BY_ID[tableId];
    if (!cfg || !this.player) return;
    if (this.core.state.casino.activeTable !== tableId) {
      const r = this.core.casino.sit(tableId);
      if (!r.ok) {
        store.toast(r.error, 'warn');
        return;
      }
    }
    const seat = this.core.casino.playerSeatIndex(tableId);
    const pos = seatPosition(tableId, Math.max(0, seat));
    if (pos) {
      this.player.setPos(pos.x, pos.y);
      this.player.fixedDepth = pos.depth;
      this.player.setSitting(true, pos.dir);
    }
    this.setFocus(null);
    this.marker?.setVisible(false);
    this.core.timeMode = 'table';
    this.core.player.activity = 'gambling';
    store.table = { game: cfg.game, tableId };
    store.notify();
    this.tableKey = cfg.game;
    this.scene.launch(cfg.game, { tableId });
    this.scene.sleep();
  }

  private closeTableScene(): void {
    if (!this.tableKey) return;
    this.scene.stop(this.tableKey);
    this.tableKey = null;
    store.table = null;
    this.core.timeMode = 'world';
    this.core.player.activity = 'idle';
    if (this.scene.isSleeping()) this.scene.wake();
    if (this.player) {
      this.player.fixedDepth = null;
      this.player.setSitting(false);
      const tx = Math.floor(this.player.x / 16);
      const ty = Math.floor(this.player.y / 16);
      for (let r = 0; r < 4; r++) {
        const cand = [{ x: tx, y: ty + r }, { x: tx - r, y: ty }, { x: tx + r, y: ty }, { x: tx, y: ty - r }];
        const free = cand.find((c) => c.x >= 0 && c.y >= 0 && c.x < this.map.w && c.y < this.map.h && !this.map.blocked[c.y * this.map.w + c.x]);
        if (free) {
          this.player.setPos(free.x * 16 + 8, free.y * 16 + 14);
          break;
        }
      }
      this.player.face('down');
    }
    store.notify();
  }

  /** Stand up from the current table (returns false when a hand is still in play). */
  leaveTable(): boolean {
    const r = this.core.casino.standUp();
    if (!r.ok) {
      store.toast(r.error, 'warn');
      return false;
    }
    this.closeTableScene();
    return true;
  }

  private guardApproach(): void {
    const guard = this.staff.find((s) => s.role === 'guard');
    guard?.sprite.say('先生/女士，经理想和您谈谈。', 3000, this.time.now);
  }

  // ------------------------------------------------------------------ mouse

  private onPointer(pointer: Phaser.Input.Pointer): void {
    if (this.attract || !this.player || this.transitioning || this.tableKey) return;
    if (store.blocking() || this.core.paused.has('dialogue')) return;
    if (pointer.rightButtonDown()) return;
    const wx = pointer.worldX;
    const wy = pointer.worldY;
    const p = this.player;
    if (this.benchSit) this.standUpFromBench();
    // a person?
    const npc = this.npcDir?.nearest(wx, wy + 4, 12);
    if (npc) {
      this.walkTo(Math.floor(npc.sprite.x / 16), Math.floor(npc.sprite.y / 16), () => {
        if (Math.hypot(npc.sprite.x - p.x, npc.sprite.y - p.y) < 40) {
          this.faceToward(npc.sprite.x, npc.sprite.y);
          this.talkTo(npc.id, npc.sprite);
        }
      });
      return;
    }
    const tx = Math.floor(wx / 16);
    const ty = Math.floor(wy / 16);
    // an object? (also accept clicks on the visible upper part of tall props)
    const it = this.interactableAt(tx, ty) ?? this.interactableAt(tx, ty + 1) ?? this.interactableAt(tx, ty + 2);
    if (it) {
      const goal = this.approachTile(it);
      if (goal) {
        this.walkTo(goal.x, goal.y, () => {
          this.faceToward((it.x + it.w / 2) * 16, (it.y + it.h / 2) * 16 + 8);
          this.use(it);
        });
      }
      return;
    }
    // a door?
    const door = this.map.doors.find((d) => ty >= d.y - 2 && ty <= d.y && tx >= d.x && tx < d.x + d.w);
    if (door) {
      const out = this.map.outdoor ? { x: door.x + Math.floor((door.w - 1) / 2), y: door.y } : { x: door.x, y: door.y };
      this.walkTo(out.x, out.y, null);
      return;
    }
    if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return;
    this.walkTo(tx, ty, null);
  }

  private approachTile(it: Interactable): Pt | null {
    const p = this.player!;
    const px = Math.floor(p.x / 16);
    const py = Math.floor(p.y / 16);
    let best: Pt | null = null;
    let bd = Infinity;
    for (let y = it.y - 1; y <= it.y + it.h; y++) {
      for (let x = it.x - 1; x <= it.x + it.w; x++) {
        const inside = x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h;
        const corner = (x === it.x - 1 || x === it.x + it.w) && (y === it.y - 1 || y === it.y + it.h);
        if (inside || corner) continue;
        if (x < 0 || y < 0 || x >= this.map.w || y >= this.map.h || this.map.blocked[y * this.map.w + x]) continue;
        // prefer standing below the object (front side)
        const d = Math.abs(x - px) + Math.abs(y - py) + (y < it.y ? 2 : 0);
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
    }
    if (!best && !this.map.blocked[it.y * this.map.w + it.x]) best = { x: it.x, y: it.y };
    return best;
  }

  private walkTo(tx: number, ty: number, action: (() => void) | null): void {
    const p = this.player!;
    const sx = Math.floor(p.x / 16);
    const sy = Math.floor(p.y / 16);
    const path = findPath(this.map, sx, sy, tx, ty, false, 9000);
    if (!path) return;
    const start = { x: sx, y: sy };
    const full = Math.hypot(p.x - (sx * 16 + 8), p.y - (sy * 16 + 14)) > 2 ? [start, ...path] : path;
    const run = this.keys.SHIFT.isDown && this.core.state.player.stats.energy > 8;
    const speed = (run ? RUN_SPEED : WALK_SPEED) * this.core.player.speedMultiplier();
    this.arriveAction = action;
    p.walkPath(full, speed, () => {
      const a = this.arriveAction;
      this.arriveAction = null;
      a?.();
    });
    const last = full[full.length - 1] ?? { x: tx, y: ty };
    if (this.ring) {
      this.ring.setVisible(true).setPosition(last.x * 16 + 8, last.y * 16 + 13);
      this.ringUntil = this.time.now + 900;
    }
  }

  private faceToward(x: number, y: number): void {
    const p = this.player!;
    const dx = x - p.x;
    const dy = y - (p.y - 8);
    p.face(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  }

  refreshPlayerLook(): void {
    if (this.player && this.core) this.player.setLook(playerLook(this.core));
  }
}

/** Where on the city map a bus stop drops the player. */
export function busStopTile(stopId: string): Pt | null {
  const s = BUS_STOPS.find((b) => b.id === stopId);
  return s ? { x: s.x, y: s.y + 1 } : null;
}

/** Door tile in the city for a location (for taxis / driving). */
export function locationDoorTile(loc: string): Pt | null {
  const b = LOCATION_BUILDING[loc];
  if (!b) return null;
  const bd = BUILDING_BY_ID[b];
  if (!bd?.door) return null;
  return { x: bd.door.x + Math.floor(((bd.door.w ?? 1) - 1) / 2), y: bd.door.y + 1 };
}
