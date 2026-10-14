import Phaser from 'phaser';
import type { GameCore } from '../core/GameCore';
import { store, type AuctionTab, type BeachTab, type CharityTab, type MarinaTab, type PawnTab } from '../ui/store';
import { buildCityMap, type CityMap } from './maps/city';
import { buildIsleMap } from './maps/isle';
import { ISLE_DISTRICTS } from './maps/isleLayout';
import { interiorMap } from './maps/interiors';
import { ownShopMap } from './maps/ownShop';
import { BIZ_TYPES } from '../data/business';
import { CASINO_TABLES, casinoArea, type CasinoArea } from './maps/casinoMap';
import { regionAt, type Door, type Face, type Interactable, type InteractKind, type MapData, type MapRegion, type PlacedProp, type StaffWhen } from './maps/types';
import { BUILDING_BY_ID, BUS_STOPS, CITY_SPOTS, LOCATION_BUILDING, MARINA } from './maps/cityLayout';
import { PROPS, propFrameName, type PropDef } from '../art/props';
import { TILE_INDEX, displayTile, tileIndex } from '../art/tiles';
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
import { sfx } from '../audio/Audio';
import { nightMarketOpen } from '../systems/OldTownSystem';
import { pieceCanvas } from '../art/artworks';
import type { TripKind } from '../systems/MarinaSystem';
import { FISHING, boatsIn, type FareClass } from '../systems/IsleSystem';
import { Actions, type ActionHost, type Pose, type PoseName, type PropBox } from './actions';

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
  elevator: '乘电梯',
  concierge: '礼宾服务',
  view: '眺望',
  pawn: '典当 / 赎当',
  charity: '领饭',
  labor: '应工',
  fortune: '看相（20 G）',
  auction: '拍卖会',
  marina: '游艇会',
  isle: '查看',
};

/** Where people stand on each boat's deck (image pixels): the deck line and the spots along it, the first one yours. */
const DECKS: Record<string, { y: number; xs: number[] }> = {
  tour_boat: { y: 22, xs: [36, 28, 44, 20, 52, 14, 60, 32, 48] },
  yacht_club: { y: 37, xs: [12, 44, 50, 18, 38] },
  yacht_seagull: { y: 37, xs: [12, 44, 50, 18, 38, 24, 54, 8, 32] },
  yacht_aurora: { y: 25, xs: [10, 82, 22, 72, 64, 30, 88, 40, 56] },
  ferry: { y: 33, xs: [40, 24, 56, 72, 88] },
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
  { name: '灰港游艇会', x0: 107, y0: 39, x1: 119, y1: 58 },
  { name: '渡轮码头', x0: 107, y0: 59, x1: 119, y1: 70 },
  { name: '河滨步道', x0: 104, y0: 26, x1: 119, y1: 89 },
];

function districtAt(x: number, y: number, map = 'city'): string {
  const list = map === 'isle' ? ISLE_DISTRICTS : DISTRICTS;
  for (const d of list) if (x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1) return d.name;
  return map === 'isle' ? '白石湾' : '灰港';
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
  /** a stall that opens and shuts with the clock instead of animating, or a boat that comes and goes */
  when?: StaffWhen;
  placed: PlacedProp;
  /** where the image sits when the prop is in its place (boats sail away from it) */
  x0: number;
  /** shown now (null until the first frame decides) */
  shown: boolean | null;
  /** a boat on its way out or in: the clock does not show or hide it meanwhile */
  sailing: boolean;
}

interface NightView {
  img: Phaser.GameObjects.Image;
  em: Emissive | null;
  /** fraction of windows that stay lit late at night */
  lateFactor: number;
  /** a window: shows night only when it is dark outside, even indoors */
  daylit?: boolean;
}

interface StaffView {
  sprite: CharacterSprite;
  role: string;
  label: string;
  x: number;
  y: number;
  when?: StaffWhen;
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
  /** walk aboard at the marina and go out on the water */
  sail(kind: TripKind, method?: 'cash' | 'card'): Promise<void>;
  /** take the ferry across the bay */
  ferry(cls: FareClass, method?: 'cash' | 'card'): Promise<void>;
  /** go to sleep for this many hours (in the bed you just used, if you are by it) */
  sleep(hours: number): Promise<void>;
  /** let a stepped stretch of time (a shift, a swim) run on the clock, then hand over its result */
  timelapse<T>(steps: Generator<number, T, void>, done: (r: T) => void, pose?: PoseName): Promise<void>;
}

export class WorldScene extends Phaser.Scene implements WorldHost, WorldApi {
  core!: GameCore;
  map!: MapData;
  private attract = false;
  private cityCache: CityMap | null = null;
  private isleCache: CityMap | null = null;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private tilemaps: Phaser.Tilemaps.Tilemap[] = [];
  private ground: Phaser.Tilemaps.TilemapLayer | null = null;
  /** floor shadows (see shading.ts) and the daylight part that fades at night */
  private shadeImgs: Phaser.GameObjects.Image[] = [];
  private sunShade: Phaser.GameObjects.Image | null = null;
  private props: PropView[] = [];
  private nights: NightView[] = [];
  private staticLights: LightSource[] = [];
  /** easels in the ballroom and the lot each one shows */
  private easels: { img: Phaser.GameObjects.Image | null; lot: number | 'live'; x: number; y: number; depth: number; key: string | null }[] = [];
  /** lights of stalls that are only lit while they are open */
  private timedLights: { light: LightSource; when: StaffWhen }[] = [];
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
  /** the part of the map the camera is limited to */
  private regionId: string | null = null;
  /** temporary images of a lift ride in progress */
  private liftParts: Phaser.GameObjects.GameObject[] = [];
  private pendingLight: { darkness: number; color: number; lights: LightSource[]; glow: number; time: number } | null = null;
  /** the small animations of everyday things (see actions.ts) */
  private actions: Actions = new Actions(this.actionHost());
  /** the bed the player last lay down on, to sleep in it */
  private bed: Interactable | null = null;

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
    this.endLiftParts();
    if (store.lift) store.lift = null;
    this.core?.paused.delete('transition');
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

  /** Where someone walking to (x, y) comes in: the entry of that part of the map. */
  regionEntry(x: number, y: number): Pt {
    const r = regionAt(this.map, x, y);
    return r ? { x: r.entry.x, y: r.entry.y } : this.entryTile();
  }

  private region(): MapRegion | null {
    if (!this.player || !this.map?.regions) return null;
    return regionAt(this.map, Math.floor(this.player.x / 16), Math.floor((this.player.y - 3) / 16));
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
    this.actions.clear();
    this.bed = null;
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
    this.timedLights = [];
    this.easels = [];
    this.emissives = [];
    this.focus = null;
    this.arriveAction = null;
    this.benchSit = false;
    store.setPrompt(null);
  }

  private loadMap(id: string, spawn: string | null, tile?: Pt, face?: Face): void {
    this.clearMap();
    const map =
      id === 'city'
        ? (this.cityCache ??= buildCityMap())
        : id === 'isle'
          ? (this.isleCache ??= buildIsleMap())
          : id === 'own_shop'
            ? ownShopMap(this.core?.state.business ?? null)
            : interiorMap(id);
    this.map = map;
    this.buildTiles(map);
    this.buildShade(map);
    this.buildProps(map);
    if (!this.attract && this.core.isAtHome()) this.hangCollection(map);
    if (map.outdoor) this.buildBuildings(map);
    this.buildStaff(map);
    if (!this.attract) {
      const pos = this.resolveSpawn(map, spawn, tile, face);
      this.player = new CharacterSprite(this, playerLook(this.core), pos.x * 16 + 8, pos.y * 16 + 14, pos.face);
      this.player.depthBias = 0.2;
    }
    // street life: traffic and passers-by in Greyhaven, people strolling on the island (no cars there)
    if (map.id === 'city' || map.id === 'isle') this.city = new CityLife(this, map as CityMap, () => this.playerPos());
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
      const view: PropView = { img, night: null, em: null, def: d, refs, nightRefs: [], rate: 200, phase: (p.x * 31 + p.y * 17) % 7, frame: 0, when: p.when, placed: p, x0: x, shown: null, sailing: false };
      if (p.id === 'tour_boat' || p.id.startsWith('yacht')) view.rate = 900;
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
        this.nights.push({ img: nimg, em: view.em, lateFactor: 1, daylit: !!d.daylit });
      }
      if (d.light) {
        const lx = p.flipX ? d.w - d.light.x : d.light.x;
        const light: LightSource = {
          x: x + lx,
          y: y + d.light.y,
          r: d.light.r,
          color: hexColor(d.light.color),
          always: d.light.always || !map.outdoor,
          flicker: p.id.startsWith('neon') ? 0.04 : undefined,
        };
        if (p.when) this.timedLights.push({ light, when: p.when });
        else this.staticLights.push(light);
      }
      this.props.push(view);
      if (p.id === 'easel' && p.interact?.data?.lot !== undefined && !this.attract) {
        const lot = p.interact.data.lot;
        this.easels.push({ img: null, lot: lot === 'live' ? 'live' : Number(lot), x: x + 2, y: y + 3, depth: depth + 0.01, key: null });
      }
    }
    this.refreshEasels();
  }

  /** The paintings the player owns hang on the walls at home, where there is room between the windows. */
  private hangCollection(map: MapData): void {
    const pieces = (this.core.state.auction?.collection ?? []).filter((p) => p.kind === 'painting' && p.consigned === undefined);
    if (!pieces.length) return;
    const walls = new Set(Object.entries(TILE_INDEX).filter(([n]) => n.startsWith('wall_')).map(([, i]) => i));
    const wall = (x: number, y: number) => walls.has(map.ground[y * map.w + x]);
    // wall pixels already taken by windows, clocks and other decals on the back wall
    const busy: [number, number][] = [];
    for (const p of map.props) {
      const d = PROPS[p.id];
      if (!d || p.y > 1) continue;
      const x = Math.round(p.x * 16 + (Math.max(1, d.foot.w) * 16 - d.w) / 2 + (p.ox ?? 0));
      busy.push([x - 4, x + d.w + 4]);
    }
    const spots: number[] = [];
    for (let tx = 1; tx + 1 < map.w - 1 && spots.length < Math.min(6, pieces.length); tx++) {
      // a frame spans two tiles of wall face with floor below both
      if (!wall(tx, 1) || !wall(tx + 1, 1) || wall(tx, 2) || wall(tx + 1, 2)) continue;
      const x0 = tx * 16 + 2;
      if (busy.some(([a, b]) => x0 < b && x0 + 28 > a)) continue;
      spots.push(tx);
      busy.push([x0 - 10, x0 + 38]);
    }
    spots.forEach((tx, i) => {
      const p = pieces[i];
      const key = `art:${p.seed}:s`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, pieceCanvas(p, true));
      this.objects.push(this.add.image(tx * 16 + 2, 5, key).setOrigin(0, 0).setDepth(-799.5));
    });
  }

  /** Put this week's lots on the ballroom easels (sold lots come down; the display shows the lot on the block). */
  private refreshEasels(): void {
    if (!this.easels.length || !this.core) return;
    const lots = this.core.auction.catalogue();
    const live = this.core.state.auction?.live;
    for (const e of this.easels) {
      const lot = e.lot === 'live' ? lots[live ? live.lot : lots.findIndex((l) => l.status === 'open')] : lots[e.lot];
      const piece = lot && (e.lot === 'live' || lot.status === 'open') ? lot.piece : null;
      const key = piece ? `art:${piece.seed}:s` : null;
      if (key === e.key) continue;
      e.img?.destroy();
      e.img = null;
      e.key = key;
      if (!piece || !key) continue;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, pieceCanvas(piece, true));
      e.img = this.add.image(e.x, e.y, key).setOrigin(0, 0).setDepth(e.depth);
      this.objects.push(e.img);
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
      this.staff.push({ sprite, role: s.role, label: s.label, x: s.x, y: s.y, when: s.when });
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
    // a map in several parts (the casino's two floors): keep the camera inside the player's part
    const r = this.region();
    this.regionId = r?.id ?? null;
    const ox = r ? r.x * 16 : 0;
    const oy = r ? r.y * 16 : 0;
    const W = (r ? r.w : this.map.w) * 16;
    const H = (r ? r.h : this.map.h) * 16;
    const vw = this.scale.width / z;
    const vh = this.scale.height / z;
    const bx = ox + (W < vw ? (W - vw) / 2 : 0);
    const by = oy + (H < vh ? (H - vh) / 2 : 0);
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
    if (this.map.regions && !this.transitioning && (this.region()?.id ?? null) !== this.regionId) this.layoutCamera();
    if (this.player.path.length > 0) this.checkDoor(this.player.dir);
    this.npcDir?.update(dt, time, core.nowFloat());
    this.city?.update(dt, time, toDate(core.now()).hour);
    this.floor?.update(dt, time);
    this.animate(time);
    if (time > this.staffCheckAt) {
      this.staffCheckAt = time + 500;
      this.updateStaffVisibility();
      this.refreshEasels();
    }
    if (!this.tableKey) this.updateFocus(time);
    this.updateLighting(time, core.nowFloat());
    this.syncState();
    if (time > this.spotCheckAt) {
      this.spotCheckAt = time + 1000;
      this.checkSpots();
      // not from the deck of a boat coming in: the banner waits until you step ashore
      if (!this.transitioning) this.updateDistrict();
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
      if (v.when && !v.def.shut && !v.sailing) {
        const on = this.whenActive(v.when);
        if (on !== v.shown) this.setShown(v, on);
      }
      if (v.refs.length < 2) continue;
      const f = v.def.shut ? (this.whenActive(v.when) ? 0 : 1) : Math.floor(time / v.rate + v.phase) % v.refs.length;
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
    const ambient = this.region()?.ambient ?? m.ambient;
    const amb = ambient.night + (ambient.day - ambient.night) * dl;
    const darkness = 1 - amb;
    const night = this.nightFactor(t);
    this.sunShade?.setAlpha(m.outdoor ? 1 - night : clamp01((dl - 0.3) / 0.45));
    const hour = toDate(Math.floor(t)).hour;
    const late = m.outdoor && hour >= 1 && hour < 6;
    const dark = clamp01((0.72 - dl) / 0.45);
    for (const n of this.nights) {
      const a = n.daylit ? dark : night * (late ? n.lateFactor : 1);
      n.img.setAlpha(a);
      if (n.em) n.em.alpha = a;
    }
    for (const v of this.props) if (v.em && v.night) v.em.alpha = v.night.visible ? v.night.alpha : 0;
    const lights = this.staticLights.slice();
    for (const t of this.timedLights) if (this.whenActive(t.when)) lights.push(t.light);
    if (this.city) lights.push(...this.city.lights(night > 0.3));
    if (this.player && darkness > 0.25) {
      this.playerLight.x = this.player.x;
      this.playerLight.y = this.player.y - 10;
      this.playerLight.r = 26;
      lights.push(this.playerLight);
    }
    this.pendingLight = { darkness, color: ambient.color, lights, glow: m.outdoor ? night : 1, time };
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
    for (const v of this.props) if (v.em && v.night) v.em.alpha = v.night.visible ? v.night.alpha : 0;
    const lights = this.staticLights.concat(this.city?.lights(true) ?? []);
    this.lighting.render(cam, 0.72, this.map.ambient.color, lights, 1, time, this.emissives);
  }

  /** Whether something that keeps hours (Saturday night upstairs, the night market) is on right now. */
  private whenActive(when: StaffWhen | undefined): boolean {
    if (!when) return true;
    // the title screen's city: everything open, nobody's own boat in the berth
    if (this.attract) return when !== 'own_seagull' && when !== 'own_aurora';
    const owned = this.core.state.marina?.owned ?? null;
    switch (when) {
      case 'sky_night':
        return this.core.sky.isSkyNight();
      case 'night_market':
        return nightMarketOpen(this.core.now());
      case 'tour_in':
        return !this.core.marina.tourBoatOut();
      case 'tour_boarding':
        return !!this.core.marina.boardingCruise();
      case 'own_seagull':
        return owned === 'seagull';
      case 'own_aurora':
        return owned === 'aurora';
      case 'no_yacht':
        return owned === null;
      case 'ferry_city':
        return this.core.isle.ferryAt('city');
      case 'ferry_isle':
        return this.core.isle.ferryAt('isle');
      case 'boats_in':
        return boatsIn(this.core.now());
      case 'fishing_hire': {
        const d = toDate(this.core.now());
        return d.weekday !== 6 && d.minuteOfDay >= FISHING.from && d.minuteOfDay <= FISHING.until;
      }
      case 'fish_market':
        return this.core.isle.marketOpen();
      case 'shack':
        return this.core.isle.shackOpen();
      case 'lifeguard':
        return this.core.isle.lifeguardOn();
      case 'resort_day': {
        const m = toDate(this.core.now()).minuteOfDay;
        return m >= 7 * 60 && m < 22 * 60;
      }
    }
  }

  private showProp(v: PropView, on: boolean): void {
    v.shown = on;
    v.img.setVisible(on);
    v.night?.setVisible(on);
  }

  /** Put a boat's images (and whoever stands on its deck) at x. */
  private moveBoat(v: PropView, x: number, riders: { s: CharacterSprite; dx: number }[]): void {
    const xi = Math.round(x);
    v.img.x = xi;
    if (v.night) v.night.x = xi;
    if (v.em) v.em.x = xi;
    for (const r of riders) r.s.x = xi + r.dx;
  }

  private sailBoat(v: PropView, to: number, ms: number, ease: string, riders: { s: CharacterSprite; dx: number }[]): Promise<void> {
    const proxy = { x: v.img.x };
    return new Promise((res) =>
      this.tweens.add({ targets: proxy, x: to, duration: ms, ease, onUpdate: () => this.moveBoat(v, proxy.x, riders), onComplete: () => res() }),
    );
  }

  /** The clock shows or hides a prop; the tour boat casts off and comes back in when the player is there to see it. */
  private setShown(v: PropView, on: boolean): void {
    const first = v.shown === null;
    const p = this.player;
    const near = !!p && Math.abs(p.x - v.x0) < 420 && Math.abs(p.y - v.img.y) < 280;
    const boat = v.when === 'tour_in' || v.when === 'ferry_city' || v.when === 'ferry_isle' || v.when === 'boats_in';
    if (first || !near || !boat) {
      this.showProp(v, on);
      return;
    }
    v.sailing = true;
    v.shown = on;
    const away = v.x0 + (this.map.w * 16 - v.x0) + 40;
    if (on) {
      this.showProp(v, true);
      this.moveBoat(v, away, []);
      void this.sailBoat(v, v.x0, 3200, 'Sine.easeOut', []).then(() => (v.sailing = false));
    } else {
      sfx('horn');
      void this.sailBoat(v, away, 3600, 'Sine.easeIn', []).then(() => {
        this.showProp(v, false);
        this.moveBoat(v, v.x0, []);
        v.sailing = false;
      });
    }
  }

  private updateStaffVisibility(): void {
    const sprites = this.npcDir ? [...this.npcDir.sprites.values()] : [];
    for (const s of this.staff) {
      const sx = s.x * 16 + 8;
      const sy = s.y * 16 + 14;
      const covered = sprites.some((n) => Math.abs(n.x - sx) < 10 && Math.abs(n.y - sy) < 10);
      const away = !!s.when && !this.whenActive(s.when);
      s.sprite.sprite.setVisible(!covered && !away);
      s.sprite.shadow.setVisible(!covered && !away);
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
    if ((this.map.id !== 'city' && this.map.id !== 'isle') || !this.player) return;
    const d = districtAt(Math.floor(this.player.x / 16), Math.floor(this.player.y / 16), this.map.id);
    if (d !== this.district) {
      const first = this.district === '';
      this.district = d;
      if (!first) store.banner(d, this.map.id === 'isle' ? '白石湾 · Whitestone Bay' : '灰港 · Greyhaven');
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
    if (d.target === 'city' || d.target === 'isle') {
      this.travel(d.target, d.spawn);
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
    if (to === 'city' || to === 'isle') {
      this.updateDistrict();
      const home = to === 'isle' ? '白石湾 · Whitestone Bay' : '灰港 · Greyhaven';
      store.banner(this.district || (to === 'isle' ? '白石湾' : '灰港'), from && from !== 'city' && from !== 'isle' ? `离开${LOCATIONS[from]?.name ?? ''}` : home);
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
      if (x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h) {
        // a boat that is out (or not yours yet) cannot be used
        const present = it.interact.data?.present as StaffWhen | undefined;
        if (present && !this.whenActive(present)) continue;
        return it;
      }
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
    } else if (k === 'concierge') {
      const tab = it.interact.data?.tab;
      verb = tab === 'spa' ? '预约水疗' : tab === 'store' ? '兑换礼品' : '礼宾服务';
    } else if (k === 'charity') {
      const tab = it.interact.data?.tab;
      verb = tab === 'volunteer' ? '报名做义工' : tab === 'donate' ? '捐款' : '领一份饭';
    } else if (k === 'auction') {
      const d = it.interact.data ?? {};
      verb = typeof d.lot === 'number' ? '看拍品' : d.tab === 'live' ? '拍卖会' : '看图录';
    } else if (k === 'pawn') {
      verb = it.interact.data?.tab === 'shelf' ? '看二手货' : '典当 / 赎当';
    } else if (k === 'elevator') {
      verb = it.interact.data?.floor === 'sky' ? '上楼' : '下楼';
    } else if (k === 'isle') {
      const act = it.interact.data?.act;
      const isle = this.core.isle;
      verb =
        act === 'ferry'
          ? isle.boarding() !== null
            ? '买票上船'
            : '看时刻表'
          : act === 'beach'
            ? '租躺椅 / 游泳'
            : act === 'swim'
              ? '下海游泳'
              : act === 'fishing'
                ? '跟船出海'
                : act === 'lighthouse'
                  ? '眺望'
                  : act === 'lodging'
                    ? '入住 / 前台'
                    : act === 'breakfast'
                      ? '吃早餐'
                      : act === 'pool'
                        ? '下水游泳'
                        : act === 'private'
                          ? '躺一会儿'
                          : '查看';
    } else if (k === 'marina') {
      const d = it.interact.data ?? {};
      const m = this.core.marina;
      const booked = this.core.state.marina?.booking;
      if (d.boat === 'tour') verb = m.boardingCruise() ? '买票上船' : '看时刻表';
      else if (d.boat === 'club') verb = booked?.kind === 'charter' && !m.canSail() ? '登船出海' : '包船出海';
      else if (d.boat === 'own') verb = booked?.kind === 'own' && !m.canSail() ? '登船出海' : '上船';
      else if (d.present === 'no_yacht') verb = '看看';
      else verb = '游船 / 包船 / 游艇';
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
        this.bed = it;
        store.openModal({ type: 'sleep' });
        break;
      case 'kitchen':
        void this.actions.kitchen(it, () => store.openModal({ type: 'kitchen' }));
        break;
      case 'wardrobe':
      case 'mirror':
        void this.actions.dressed(() => store.openModal({ type: 'wardrobe' }));
        break;
      case 'computer':
        void this.actions.computer(it, () => store.openModal({ type: 'computer' }));
        break;
      case 'shop':
      case 'order': {
        // stalls and counters that keep hours (the night market, the fish market, the beach shack)
        const when = d.when as StaffWhen | undefined;
        if (when && !this.whenActive(when)) {
          store.openModal({ type: 'text', title: it.interact.label, text: String(d.closed ?? '摊子用油布盖着，还没摆出来。夜市每天 18:00 开张，周五、周六开到凌晨两点。') });
          break;
        }
        const consume = it.interact.kind === 'order';
        void this.actions.served(it, consume, () => store.openModal({ type: 'shop', shopId: String(d.shop), consume }));
        break;
      }
      case 'table':
        this.sitAtTable(String(d.table));
        break;
      case 'cashier':
        void this.actions.cage(it, () => store.openModal({ type: 'cashier' }));
        break;
      case 'atm':
        void this.actions.atm(it, () => store.openModal({ type: 'atm', where: (String(d.where ?? 'street') as 'branch' | 'street' | 'casino') }));
        break;
      case 'teller':
        void this.actions.greet(it, d.loans ? '请坐，贷款的事慢慢谈。' : '您好，请问办理什么业务？', () => store.openModal({ type: 'bank', tab: d.loans ? 'loans' : 'account' }));
        break;
      case 'work':
        store.openModal({ type: 'work', jobId: String(d.job) });
        break;
      case 'bus':
        store.openModal({ type: 'bus', stop: String(d.stop) });
        break;
      case 'read':
        void this.actions.read(() => store.openModal({ type: 'read' }));
        break;
      case 'tv':
      case 'piano':
      case 'exercise': {
        const kind = it.interact.kind;
        const r = core.player.leisure(kind);
        if (!r.ok) {
          store.toast(r.text, 'warn');
          break;
        }
        const shown = kind === 'tv' ? this.actions.tv(it) : kind === 'piano' ? this.actions.piano(it) : this.actions.court();
        void shown.then(() => store.toast(r.text, 'good'));
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
      case 'elevator':
        void this.rideLift(it);
        break;
      case 'concierge':
        store.openModal({ type: 'concierge', tab: (String(d.tab ?? 'suite') as 'suite' | 'spa' | 'store') });
        break;
      case 'view': {
        const r = core.player.leisure('view');
        if (!r.ok) store.toast(r.text, 'warn');
        else void this.actions.view(it).then(() => store.toast(r.text, 'good'));
        break;
      }
      case 'business':
        if (d.action === 'work') {
          const r = core.business.workShift();
          store.toast(r.ok ? r.message : r.error, r.ok ? 'good' : 'warn');
        } else store.openPanel('business');
        break;
      case 'pawn':
        store.openModal({ type: 'pawn', tab: String(d.tab ?? 'pawn') as PawnTab });
        break;
      case 'charity':
        store.openModal({ type: 'charity', tab: String(d.tab ?? 'meal') as CharityTab });
        break;
      case 'labor':
        store.openModal({ type: 'labor' });
        break;
      case 'fortune':
        if (!nightMarketOpen(core.now())) {
          store.openModal({ type: 'text', title: it.interact.label, text: '桌子收起来了，布幡卷在杆子上。看相先生只在夜市开张的时候来。' });
          break;
        }
        store.openModal({ type: 'fortune' });
        break;
      case 'auction':
        store.openModal({ type: 'auction', tab: String(d.tab ?? 'catalogue') as AuctionTab, lot: typeof d.lot === 'number' ? d.lot : undefined });
        break;
      case 'marina':
        store.openModal({ type: 'marina', tab: String(d.tab ?? 'cruise') as MarinaTab });
        break;
      case 'isle': {
        const act = String(d.act ?? '');
        if (act === 'ferry') store.openModal({ type: 'ferry' });
        else if (act === 'beach' || act === 'swim' || act === 'pool' || act === 'private') {
          const tab: BeachTab = act === 'beach' ? 'lounger' : act;
          store.openModal({ type: 'beach', tab });
        } else if (act === 'fishing') store.openModal({ type: 'fishing' });
        else if (act === 'lodging') store.openModal({ type: 'lodging', place: d.place === 'resort' ? 'resort' : 'guesthouse' });
        else if (act === 'breakfast') {
          const r = core.isle.breakfast();
          store.toast(r.ok ? r.message : r.error, r.ok ? 'good' : 'warn');
        } else if (act === 'lighthouse') {
          const r = core.isle.lighthouse();
          store.openModal({ type: 'text', title: it.interact.label, text: r.ok ? r.message : r.error });
        }
        break;
      }
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
      if (area === 'suite') {
        if (!this.core.sky.suiteGuest()) err = '读卡器亮起红灯。1201 是住客的房间，入住手续在礼宾台办理。';
      } else if (area === 'office') {
        const victor = this.core.social.rel('victor');
        const invited = Number(this.core.state.player.flags.officeInviteUntil ?? -1) >= this.core.today();
        if (!invited && !(victor.met && victor.familiarity >= 35 && this.core.casino.tierAtLeast('platinum'))) err = '保安拦住了你：「经理办公室，非请勿入。」';
      } else if (area === 'resort') {
        err = this.core.isle.resortAccess();
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
    if (going && (area === 'suite' || (area === 'resort' && this.map.id !== 'isle'))) sfx('door');
    if (going && area === 'resort') store.banner(this.map.id === 'isle' ? '泳池与住客海滩' : '客房区', '白石湾度假酒店 · 住客专享');
    else if (going) store.banner(area === 'vip' ? 'VIP 私人厅' : area === 'high' ? '高额投注区' : area === 'suite' ? '1201 套房' : '经理办公室', area === 'vip' ? '仅限受邀贵宾' : area === 'high' ? 'High Limit Salon' : area === 'suite' ? '天穹层' : '');
  }

  // ------------------------------------------------------------------ the members' lift

  private wait(ms: number): Promise<void> {
    return new Promise((res) => this.time.delayedCall(ms, () => res()));
  }

  private tweenTo(target: object, props: Record<string, number>, ms: number): Promise<void> {
    return new Promise((res) => this.tweens.add({ targets: target, ...props, duration: ms, ease: 'Sine.easeInOut', onComplete: () => res() }));
  }

  private endLiftParts(): void {
    for (const o of this.liftParts) o.destroy();
    this.liftParts = [];
    if (this.player) {
      this.player.sprite.clearMask(true);
      this.player.shadow.clearMask(true);
    }
  }

  /** The car behind a lift's doors: the inside, two sliding doors, and the mask that keeps them in the frame. */
  private liftCar(it: Interactable): { doorL: Phaser.GameObjects.Image; doorR: Phaser.GameObjects.Image; x0: number; y0: number; mask: Phaser.Display.Masks.GeometryMask; below: Phaser.Display.Masks.GeometryMask } {
    const x0 = it.x * 16;
    const y0 = (it.y + 1) * 16 - 32;
    const cabRef = frameRef(propFrameName('lift_cab', 0));
    const lRef = frameRef(propFrameName('lift_door_l', 0));
    const rRef = frameRef(propFrameName('lift_door_r', 0));
    const cab = this.add.image(x0 + 4, y0 + 10, cabRef.key, cabRef.frame).setOrigin(0, 0).setDepth(-790);
    const shape = this.make.graphics({}, false);
    shape.fillStyle(0xffffff);
    shape.fillRect(x0 + 4, y0 + 10, 24, 22);
    const mask = shape.createGeometryMask();
    // the player inside is hidden above the door frame but whole once out in the room
    const shape2 = this.make.graphics({}, false);
    shape2.fillStyle(0xffffff);
    shape2.fillRect(x0 + 4, y0 + 10, 24, 22);
    shape2.fillRect(x0 - 32, y0 + 32, 96, 96);
    const below = shape2.createGeometryMask();
    const doorL = this.add.image(x0 + 4, y0 + 11, lRef.key, lRef.frame).setOrigin(0, 0).setDepth(-780).setMask(mask);
    const doorR = this.add.image(x0 + 16, y0 + 11, rRef.key, rRef.frame).setOrigin(0, 0).setDepth(-780).setMask(mask);
    this.liftParts.push(cab, doorL, doorR, shape, shape2);
    return { doorL, doorR, x0, y0, mask, below };
  }

  /**
   * Ride the members' lift: walk up, the doors open, step in, they close; the
   * floor display counts while the screen is dark; the doors open on the other
   * floor and you step out. One minute of game time.
   */
  private async rideLift(it: Interactable): Promise<void> {
    if (this.transitioning || !this.player) return;
    const d = it.interact.data ?? {};
    const up = d.floor === 'sky';
    if (up) {
      const err = this.core.sky.access();
      if (err) {
        const att = this.staff.find((s) => s.role === 'lift' && Math.abs(s.x - it.x) < 4 && Math.abs(s.y - it.y) < 6);
        att?.sprite.say('抱歉，天穹层只对会员和住客开放。', 2600, this.time.now);
        sfx('deny');
        // a room upstairs is the way in for everyone else
        store.openModal({ type: 'concierge', tab: 'suite', lobby: true });
        return;
      }
    }
    const [tx, ty] = String(d.to).split(',').map(Number);
    const dest = this.map.interactables.find((o) => o.interact.kind === 'elevator' && o !== it && o.x === tx && o.y === ty - 1);
    if (!dest) return;
    const p = this.player;
    const scene = this.scene;
    this.transitioning = true;
    this.core.paused.add('transition');
    this.setFocus(null);
    this.marker?.setVisible(false);
    p.stop();
    p.path = [];
    this.arriveAction = null;
    if (this.benchSit) this.standUpFromBench();
    const a = this.liftCar(it);
    const cx = a.x0 + 16;
    // to the doors
    const front = (it.y + 1) * 16 + 14;
    if (Math.abs(p.x - cx) > 1 || Math.abs(p.y - front) > 1) {
      p.setMoving(true, Math.abs(p.x - cx) > Math.abs(p.y - front) ? (p.x < cx ? 'right' : 'left') : 'up');
      await this.tweenTo(p, { x: cx, y: front }, 260);
    }
    p.setMoving(false, 'up');
    p.face('up');
    sfx('ding');
    await this.wait(160);
    sfx('slide');
    await Promise.all([this.tweenTo(a.doorL, { x: a.x0 + 4 - 11 }, 420), this.tweenTo(a.doorR, { x: a.x0 + 16 + 11 }, 420)]);
    // step in
    p.sprite.setMask(a.below);
    p.shadow.setMask(a.below);
    p.setMoving(true, 'up');
    await this.tweenTo(p, { y: it.y * 16 + 14 }, 420);
    p.setMoving(false, 'down');
    p.face('down');
    a.doorL.setDepth(LABEL_DEPTH - 10);
    a.doorR.setDepth(LABEL_DEPTH - 10);
    await this.wait(120);
    sfx('slide');
    await Promise.all([this.tweenTo(a.doorL, { x: a.x0 + 4 }, 420), this.tweenTo(a.doorR, { x: a.x0 + 16 }, 420)]);
    if (!scene.isActive()) return;
    // the ride
    const cam = this.cameras.main;
    cam.fadeOut(300, 8, 6, 14);
    await this.wait(320);
    sfx('lift');
    const floors = up ? ['1', '2', '3', '5', '8', '10', '11', '12'] : ['12', '11', '9', '6', '4', '2', '1'];
    for (const f of floors) {
      store.lift = { floor: f, up };
      store.notify();
      await this.wait(170);
    }
    this.core.advance(1, 'idle');
    this.endLiftParts();
    const b = this.liftCar(dest);
    const bx = b.x0 + 16;
    b.doorL.setDepth(LABEL_DEPTH - 10);
    b.doorR.setDepth(LABEL_DEPTH - 10);
    p.sprite.setMask(b.below);
    p.shadow.setMask(b.below);
    p.setPos(bx, dest.y * 16 + 14);
    p.face('down');
    this.layoutCamera();
    cam.centerOn(p.x, p.y - 12);
    await this.wait(250);
    store.lift = null;
    store.notify();
    cam.fadeIn(320, 8, 6, 14);
    sfx('ding');
    await this.wait(360);
    sfx('slide');
    await Promise.all([this.tweenTo(b.doorL, { x: b.x0 + 4 - 11 }, 420), this.tweenTo(b.doorR, { x: b.x0 + 16 + 11 }, 420)]);
    p.setMoving(true, 'down');
    await this.tweenTo(p, { y: (dest.y + 1) * 16 + 14 }, 420);
    p.setMoving(false, 'down');
    p.sprite.clearMask(false);
    p.shadow.clearMask(false);
    b.doorL.setDepth(-780);
    b.doorR.setDepth(-780);
    store.banner(up ? '天穹层' : '灰港大赌场', up ? (this.core.sky.isSkyNight() ? '天穹之夜 · 现场爵士' : '会员楼层 · 12F') : '大厅');
    for (const id of this.core.social.presentNpcs(10)) this.core.social.observePlayer(id);
    this.core.paused.delete('transition');
    this.transitioning = false;
    sfx('slide');
    await Promise.all([this.tweenTo(b.doorL, { x: b.x0 + 4 }, 420), this.tweenTo(b.doorR, { x: b.x0 + 16 }, 420)]);
    this.endLiftParts();
  }

  // ------------------------------------------------------------------ the marina

  /** The boat a trip of this kind leaves on, as it lies in its berth. */
  private boatView(kind: TripKind): PropView | null {
    const booked = this.core.state.marina?.booking?.kind;
    const key = kind === 'cruise' ? 'tour' : kind === 'charter' || booked === 'charter' ? 'club' : 'own';
    return this.props.find((v) => v.placed.interact?.data?.boat === key && v.shown !== false) ?? null;
  }

  private walkSpriteTo(s: CharacterSprite, tile: Pt): Promise<void> {
    const from = { x: Math.floor(s.x / 16), y: Math.floor((s.y - 3) / 16) };
    const path = findPath(this.map, from.x, from.y, tile.x, tile.y, false) ?? [tile];
    return new Promise((res) => s.walkPath(path, WALK_SPEED, () => res()));
  }

  private untilModalClosed(): Promise<void> {
    return new Promise((res) => {
      const check = () => (store.modal ? this.time.delayedCall(150, check) : res());
      check();
    });
  }

  /**
   * Going out on the water: walk to the boat, step aboard (friends who were
   * waiting on the pier come aboard too), the horn, and she pulls away from
   * the pontoon and out of sight. The trip itself passes while the postcards
   * are on screen; then the boat comes back in and everyone steps off.
   */
  async sail(kind: TripKind, method: 'cash' | 'card' = 'cash'): Promise<void> {
    if (this.transitioning || !this.player || this.map.id !== 'city' || !this.npcDir) return;
    const core = this.core;
    const err = core.marina.boardCheck(kind, method);
    if (err) {
      store.toast(err, 'warn');
      sfx('deny');
      return;
    }
    const v = this.boatView(kind);
    const deck = v ? DECKS[v.def.id] : null;
    store.closeAll();
    const p = this.player;
    const scene = this.scene;
    this.transitioning = true;
    core.paused.add('transition');
    this.setFocus(null);
    this.marker?.setVisible(false);
    p.stop();
    p.path = [];
    this.arriveAction = null;
    if (this.benchSit) this.standUpFromBench();
    const guestIds = kind === 'cruise' ? [] : core.marina.waiting();
    const guests = this.npcDir.board(guestIds);
    const riders: { s: CharacterSprite; dx: number }[] = [];
    const cam = this.cameras.main;
    const away = v ? v.x0 + (this.map.w * 16 - v.x0) + 40 : 0;
    const gang = v ? { x: MARINA.x1, y: v.placed.y } : null;
    if (v && deck && gang) {
      v.sailing = true;
      const board = async (s: CharacterSprite, i: number) => {
        await Promise.race([this.walkSpriteTo(s, gang), this.wait(i === 0 ? 7000 : 5000)]);
        s.stop();
        const dx = deck.xs[i % deck.xs.length];
        s.fixedDepth = v.img.depth + 0.05 + i * 0.001;
        s.noShadow = true;
        s.setMoving(true, 'right');
        await this.tweenTo(s, { x: v.img.x + dx, y: v.img.y + deck.y }, 380);
        s.setMoving(false, 'down');
        s.face('down');
        riders.push({ s, dx });
      };
      await board(p, 0);
      sfx('click');
      await Promise.all(guests.map((g, i) => this.wait(i * 260).then(() => board(g, i + 1))));
      if (!scene.isActive()) return;
      await this.wait(300);
      sfx('horn');
      await this.wait(700);
      await this.sailBoat(v, away, 3400, 'Sine.easeIn', riders);
    }
    cam.fadeOut(420, 8, 6, 14);
    await this.wait(460);
    if (!scene.isActive()) return;
    const r = core.marina.sail(kind, method);
    if (r.ok) {
      store.openModal({ type: 'cruise', report: r.report });
      await this.untilModalClosed();
      if (!scene.isActive()) return;
    } else store.toast(r.error, 'warn');
    cam.fadeIn(520, 8, 6, 14);
    if (v && gang) {
      await this.sailBoat(v, v.x0, 3000, 'Sine.easeOut', riders);
      await this.wait(250);
      // step off, one after the other
      for (const rd of riders) {
        rd.s.setMoving(true, 'left');
        await this.tweenTo(rd.s, { x: gang.x * 16 + 8, y: gang.y * 16 + 14 }, 320);
        rd.s.setMoving(false, 'left');
        rd.s.fixedDepth = null;
        rd.s.noShadow = false;
        if (rd.s === p) {
          // across the pontoon, out of the way of those still coming off
          p.setMoving(true, 'left');
          await this.tweenTo(p, { x: MARINA.x0 * 16 + 8 }, 760);
          p.setMoving(false, 'right');
          p.face('right');
        }
      }
      v.sailing = false;
    }
    this.npcDir?.disembark(guestIds);
    for (const id of guestIds) this.core.social.observePlayer(id);
    core.paused.delete('transition');
    this.transitioning = false;
  }

  // ------------------------------------------------------------------ the ferry

  private ferryView(): PropView | null {
    return this.props.find((v) => v.def.id === 'ferry') ?? null;
  }

  /**
   * Across the bay: walk out to the end of the pier and step aboard, the
   * horn, and she pulls away and out of sight; the crossing passes over a
   * postcard of where you are going; then the other map, the ferry coming in
   * with you on deck, and you step off onto the pier.
   */
  async sleep(hours: number): Promise<void> {
    const p = this.player;
    const bed = this.bed;
    // lie down in the bed you just went to, if you are still by it
    const near = !!p && !!bed && Math.abs(p.x - (bed.x + bed.w / 2) * 16) <= (bed.w / 2 + 1.5) * 16 && Math.abs(p.y - (bed.y + bed.h / 2) * 16) <= (bed.h / 2 + 1.5) * 16;
    await this.actions.sleep(near ? bed : null, hours);
  }

  timelapse<T>(steps: Generator<number, T, void>, done: (r: T) => void, pose?: PoseName): Promise<void> {
    return this.actions.timelapse(steps, done, this.resolvePose(pose));
  }

  /** Where that pose happens: the lounger nearest you, the sea off the beach below you, the pool. */
  private resolvePose(pose?: PoseName): Pose {
    const p = this.player;
    if (!pose || !p) return null;
    if (pose === 'away') return { kind: 'away' };
    if (pose === 'lie') {
      let best: PropBox | null = null;
      let bd = 140;
      for (const v of this.props) {
        if (v.placed.id !== 'lounger' && v.placed.id !== 'lounger_teak') continue;
        const d = Math.hypot(v.img.x + v.def.w / 2 - p.x, v.img.y + v.def.h / 2 - p.y);
        if (d < bd) {
          bd = d;
          best = { x: v.img.x, y: v.img.y, w: v.def.w, h: v.def.h, id: v.placed.id, depth: v.img.depth };
        }
      }
      return best ? { kind: 'lie', at: best } : null;
    }
    const water = this.map.interactables.find((i) => i.id === (pose === 'sea' ? 'isle_swim' : 'isle_pool'));
    if (!water) return null;
    const x = Math.max(water.x + 1, Math.min(water.x + water.w - 2, p.x / 16)) * 16;
    // a little way out from the shore below you, or across the middle of the pool
    return pose === 'sea' ? { kind: 'swim', x, y: (water.y + 2) * 16 + 8, lane: 28 } : { kind: 'swim', x, y: (water.y + 2) * 16 + 10, lane: 40 };
  }

  private actionHost(): ActionHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scene = this;
    return {
      scene: this,
      get core() {
        return scene.core;
      },
      player: () => scene.player,
      playerLook: () => playerLook(scene.core),
      boxOf: (it) => scene.propBox(it),
      propNear: (id, x, y, r) => {
        let best: PropBox | null = null;
        let bd = r;
        for (const v of scene.props) {
          if (v.placed.id !== id) continue;
          const d = Math.hypot(v.img.x + v.def.w / 2 - x, v.img.y + v.def.h / 2 - y);
          if (d < bd) {
            bd = d;
            best = { x: v.img.x, y: v.img.y, w: v.def.w, h: v.def.h, id: v.placed.id, depth: v.img.depth };
          }
        }
        return best;
      },
      clerkNear: (x, y, r) => {
        let best: CharacterSprite | null = null;
        let bd = r;
        const look = (s: CharacterSprite) => {
          const d = Math.hypot(s.x - x, s.y - 8 - y);
          if (d < bd) {
            bd = d;
            best = s;
          }
        };
        for (const st of scene.staff) if (st.sprite.sprite.visible) look(st.sprite);
        // a named NPC working the counter (Ben at his bakery, the bartender on shift)
        if (scene.npcDir) for (const [id, s] of scene.npcDir.sprites) if (scene.core.state.npcs[id]?.activity === 'work') look(s);
        return best;
      },
      hold: (on) => {
        if (on) {
          if (scene.transitioning) return false;
          scene.transitioning = true;
          scene.core.paused.add('transition');
          scene.setFocus(null);
          scene.marker?.setVisible(false);
          scene.player?.stop();
          return true;
        }
        scene.core.paused.delete('transition');
        scene.transitioning = false;
        return true;
      },
      mapId: () => scene.map.id,
      untilModalClosed: () => scene.untilModalClosed(),
      toast: (text, kind) => store.toast(text, kind),
    };
  }

  /** Where the picture of the prop behind an interactable sits (or its tiles, for areas like the court). */
  private propBox(it: Interactable): PropBox {
    const v = this.props.find((pv) => pv.placed.interact === it.interact);
    if (v) return { x: v.img.x, y: v.img.y, w: v.def.w, h: v.def.h, id: v.placed.id, depth: v.img.depth };
    return { x: it.x * 16, y: it.y * 16 - 8, w: it.w * 16, h: it.h * 16 + 8, id: null, depth: (it.y + it.h) * 16 - 1 };
  }

  async ferry(cls: FareClass, method: 'cash' | 'card' = 'cash'): Promise<void> {
    if (this.transitioning || !this.player || (this.map.id !== 'city' && this.map.id !== 'isle')) return;
    const core = this.core;
    const err = core.isle.boardCheck(cls, method);
    if (err) {
      store.toast(err, 'warn');
      sfx('deny');
      return;
    }
    const fromSide = core.isle.side();
    const dest: 'city' | 'isle' = fromSide === 'city' ? 'isle' : 'city';
    const deck = DECKS.ferry;
    const v = this.ferryView();
    store.closeAll();
    const p = this.player;
    const scene = this.scene;
    this.transitioning = true;
    core.paused.add('transition');
    this.setFocus(null);
    this.marker?.setVisible(false);
    p.stop();
    p.path = [];
    this.arriveAction = null;
    if (this.benchSit) this.standUpFromBench();
    const cam = this.cameras.main;
    const board = this.map.spawns.ferry ?? null;
    if (v && board && v.shown !== false) {
      v.sailing = true;
      await Promise.race([this.walkSpriteTo(p, board), this.wait(7000)]);
      p.stop();
      p.fixedDepth = v.img.depth + 0.05;
      p.noShadow = true;
      p.setMoving(true, 'right');
      await this.tweenTo(p, { x: v.img.x + deck.xs[0], y: v.img.y + deck.y }, 380);
      p.setMoving(false, 'down');
      p.face('down');
      await this.wait(300);
      sfx('horn');
      await this.wait(700);
      await this.sailBoat(v, v.x0 + (this.map.w * 16 - v.x0) + 40, 3600, 'Sine.easeIn', [{ s: p, dx: deck.xs[0] }]);
    }
    cam.fadeOut(420, 8, 6, 14);
    await this.wait(460);
    if (!scene.isActive()) return;
    const r = core.isle.cross(cls, method);
    if (!r.ok) {
      // nothing happened: back on the pier
      store.toast(r.error, 'warn');
      if (v) {
        this.moveBoat(v, v.x0, []);
        v.sailing = false;
      }
      p.fixedDepth = null;
      p.noShadow = false;
      if (board) p.setPos(board.x * 16 + 8, board.y * 16 + 14);
      cam.fadeIn(420, 8, 6, 14);
      core.paused.delete('transition');
      this.transitioning = false;
      return;
    }
    store.openModal({ type: 'crossing', report: r.report });
    await this.untilModalClosed();
    if (!scene.isActive()) return;
    // the other side of the bay
    const from = this.map.id;
    core.setLocation(dest, -1, -1);
    this.loadMap(dest, 'ferry');
    this.syncState();
    const v2 = this.ferryView();
    const p2 = this.player!;
    const land = this.map.spawns.ferry;
    if (v2 && land) {
      v2.sailing = true;
      this.showProp(v2, true);
      const riders = [{ s: p2, dx: deck.xs[0] }];
      p2.fixedDepth = v2.img.depth + 0.05;
      p2.noShadow = true;
      p2.setPos(v2.img.x + deck.xs[0], v2.img.y + deck.y);
      this.moveBoat(v2, v2.x0 + (this.map.w * 16 - v2.x0) + 40, riders);
      cam.centerOn(p2.x, p2.y - 12);
      cam.fadeIn(520, 8, 6, 14);
      await this.sailBoat(v2, v2.x0, 3200, 'Sine.easeOut', riders);
      await this.wait(250);
      p2.setMoving(true, 'left');
      await this.tweenTo(p2, { x: land.x * 16 + 8, y: land.y * 16 + 14 }, 380);
      p2.setMoving(false, 'left');
      p2.face('down');
      p2.fixedDepth = null;
      p2.noShadow = false;
      v2.sailing = false;
    } else cam.fadeIn(520, 8, 6, 14);
    this.syncState();
    this.onArrive(from, dest);
    core.paused.delete('transition');
    this.transitioning = false;
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
