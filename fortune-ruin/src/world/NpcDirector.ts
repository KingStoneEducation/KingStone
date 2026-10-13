import type Phaser from 'phaser';
import type { GameCore } from '../core/GameCore';
import { NPCS, NPC_BY_ID } from '../data/npcs';
import { hashString } from '../core/rng';
import { CharacterSprite } from './CharacterSprite';
import { findPath, type Pt } from './pathfinding';
import type { MapData, SpotDef } from './maps/types';
import { locationAnchor } from './maps/cityLayout';
import type { CharDir } from '../art/characters';

export interface WorldHost {
  /** the Phaser scene NPC sprites are added to */
  hostScene: Phaser.Scene;
  map: MapData;
  core: GameCore;
  /** entry tile of the current interior (where people come in) */
  entryTile(): Pt;
  /** seat position for a named NPC playing at a casino table */
  seatFor(npcId: string): { x: number; y: number; dir: CharDir; depth: number } | null;
  playerPos(): { x: number; y: number };
}

interface Traveller {
  sprite: CharacterSprite;
  path: Pt[];
  depart: number;
  arrive: number;
  lengths: number[];
  total: number;
}

const WALK_SPEED = 38;

function tilePx(p: Pt): { x: number; y: number } {
  return { x: p.x * 16 + 8, y: p.y * 16 + 14 };
}

/** Keeps named NPC sprites in sync with the simulation (presence, spots, travel). */
export class NpcDirector {
  readonly sprites = new Map<string, CharacterSprite>();
  private leaving = new Set<string>();
  private targetSpot = new Map<string, string | null>();
  private travellers = new Map<string, Traveller>();
  private idleAt = new Map<string, number>();

  constructor(private host: WorldHost) {}

  private get core() {
    return this.host.core;
  }

  private spotFor(npcId: string, spot: string | null): SpotDef {
    const m = this.host.map;
    if (spot && m.spots[spot]) return m.spots[spot];
    // deterministic fallback somewhere walkable near the middle
    const h = hashString(npcId + m.id);
    for (let i = 0; i < 200; i++) {
      const x = 2 + ((h + i * 7919) % Math.max(1, m.w - 4));
      const y = 3 + ((h >>> 8) + i * 104729) % Math.max(1, m.h - 5);
      if (!m.blocked[y * m.w + x]) return { x, y, face: 'down' };
    }
    const e = this.host.entryTile();
    return { x: e.x, y: e.y, face: 'up' };
  }

  private place(id: string, sprite: CharacterSprite, spot: string | null): void {
    const seat = this.host.map.id === 'casino' ? this.host.seatFor(id) : null;
    if (seat) {
      sprite.setPos(seat.x, seat.y);
      sprite.fixedDepth = seat.depth;
      sprite.setSitting(true, seat.dir);
      return;
    }
    sprite.fixedDepth = null;
    const s = this.spotFor(id, spot);
    const p = tilePx(s);
    sprite.setPos(p.x, p.y);
    if (s.sit) sprite.setSitting(true, s.face);
    else {
      sprite.setSitting(false);
      sprite.face(s.face);
    }
  }

  build(): void {
    this.clear();
    const loc = this.host.map.id;
    for (const rt of this.core.npcs.npcsAt(loc)) {
      const def = NPC_BY_ID[rt.id];
      const s = new CharacterSprite(this.host.hostScene, def.look, 0, 0, 'down');
      this.sprites.set(rt.id, s);
      this.targetSpot.set(rt.id, rt.spot);
      this.place(rt.id, s, rt.spot);
    }
  }

  clear(): void {
    for (const s of this.sprites.values()) s.destroy();
    for (const t of this.travellers.values()) t.sprite.destroy();
    this.sprites.clear();
    this.travellers.clear();
    this.leaving.clear();
    this.targetSpot.clear();
  }

  /** Reconcile sprites with simulation state; animate arrivals, departures and spot changes. */
  update(dt: number, now: number, nowF: number): void {
    const loc = this.host.map.id;
    const core = this.core;
    for (const def of NPCS) {
      const rt = core.state.npcs[def.id];
      const here = rt.location === loc && !rt.travel;
      const sprite = this.sprites.get(def.id);
      if (here && !sprite) {
        // arrival: walk in from the entrance
        const s = new CharacterSprite(this.host.hostScene, def.look, 0, 0, 'up');
        this.sprites.set(def.id, s);
        this.targetSpot.set(def.id, rt.spot);
        const seat = loc === 'casino' ? this.host.seatFor(def.id) : null;
        const spot = this.spotFor(def.id, rt.spot);
        const startTile = loc === 'city' ? this.cityAnchorTile(rt.travel?.from ?? null, def.district) ?? { x: spot.x, y: spot.y } : this.host.entryTile();
        const p = tilePx(startTile);
        s.setPos(p.x, p.y);
        const goal = seat ? { x: Math.floor(seat.x / 16), y: Math.floor(seat.y / 16) } : { x: spot.x, y: spot.y };
        const path = findPath(this.host.map, startTile.x, startTile.y, goal.x, goal.y, loc === 'city') ?? [];
        s.walkPath(path, WALK_SPEED, () => this.place(def.id, s, rt.spot));
        continue;
      }
      if (!here && sprite && !this.leaving.has(def.id)) {
        // departure: walk out, then vanish
        this.leaving.add(def.id);
        sprite.fixedDepth = null;
        sprite.setSitting(false);
        const exit = loc === 'city' ? this.cityAnchorTile(rt.travel?.to ?? null, def.district) : this.host.entryTile();
        const from = { x: Math.floor(sprite.x / 16), y: Math.floor(sprite.y / 16) };
        const path = exit ? findPath(this.host.map, from.x, from.y, exit.x, exit.y, loc === 'city') ?? [] : [];
        sprite.walkPath(path.slice(0, loc === 'city' ? 14 : 80), WALK_SPEED + 8, () => {
          sprite.destroy();
          this.sprites.delete(def.id);
          this.leaving.delete(def.id);
        });
        continue;
      }
      if (here && sprite && !this.leaving.has(def.id)) {
        const want = rt.spot;
        if (this.targetSpot.get(def.id) !== want && sprite.path.length === 0) {
          this.targetSpot.set(def.id, want);
          const spot = this.spotFor(def.id, want);
          const from = { x: Math.floor(sprite.x / 16), y: Math.floor(sprite.y / 16) };
          sprite.fixedDepth = null;
          sprite.setSitting(false);
          const path = findPath(this.host.map, from.x, from.y, spot.x, spot.y, loc === 'city') ?? [];
          sprite.walkPath(path, WALK_SPEED, () => this.place(def.id, sprite, want));
        }
        this.idle(def.id, sprite, rt.activity, now);
      }
    }
    for (const s of this.sprites.values()) s.update(dt, now);
    if (loc === 'city') this.updateTravellers(dt, now, nowF);
    this.updateLabels();
  }

  private idle(id: string, s: CharacterSprite, activity: string, now: number): void {
    if (s.path.length > 0 || s.fixedDepth !== null) return;
    const next = this.idleAt.get(id) ?? 0;
    if (now < next) return;
    this.idleAt.set(id, now + 3500 + (hashString(id + now) % 4000));
    if (activity === 'busk') s.showEmote('♪', 1800, now);
    else if (activity === 'drink' && hashString(id + now) % 3 === 0) s.showEmote('♪', 1200, now);
    else if (activity === 'work' && hashString(id + now) % 5 === 0) s.face((['down', 'left', 'right'] as CharDir[])[hashString(id + String(now)) % 3]);
    else if (activity === 'exercise' && !s.sitting) {
      const tx = Math.floor(s.x / 16) + ((hashString(id + now) % 5) - 2);
      const ty = Math.floor(s.y / 16) + ((hashString(now + id) % 3) - 1);
      const path = findPath(this.host.map, Math.floor(s.x / 16), Math.floor(s.y / 16), tx, ty, false, 400);
      if (path) s.walkPath(path, 52);
    } else if (!s.sitting && hashString(id + now) % 4 === 0) {
      s.face((['down', 'left', 'right', 'up'] as CharDir[])[hashString(String(now) + id) % 4]);
    }
  }

  private cityAnchorTile(loc: string | null, district: string): Pt | null {
    const a = locationAnchor(loc, null, district);
    return { x: a.x, y: a.y + (loc && loc !== 'city' ? 1 : 0) };
  }

  /** NPCs crossing town are drawn along a walkway path, timed by the simulation. */
  private updateTravellers(dt: number, now: number, nowF: number): void {
    const core = this.core;
    const active = new Set<string>();
    for (const rt of core.npcs.travelling()) {
      if (!rt.travel) continue;
      active.add(rt.id);
      const def = NPC_BY_ID[rt.id];
      let t = this.travellers.get(rt.id);
      if (!t || t.depart !== rt.travel.depart) {
        t?.sprite.destroy();
        const fromLoc = rt.travel.from;
        const toLoc = rt.travel.to;
        const a = locationAnchor(fromLoc, fromLoc === 'city' ? rt.spot : null, def.district);
        const b = locationAnchor(toLoc, null, def.district);
        const start = { x: a.x, y: a.y + (fromLoc && fromLoc !== 'city' ? 1 : 0) };
        const end = { x: b.x, y: b.y + (toLoc && toLoc !== 'city' ? 1 : 0) };
        const path = [start, ...(findPath(this.host.map, start.x, start.y, end.x, end.y, true, 20000) ?? [end])];
        const lengths: number[] = [0];
        for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y));
        const sprite = new CharacterSprite(this.host.hostScene, def.look, start.x * 16 + 8, start.y * 16 + 14, 'down');
        t = { sprite, path, depart: rt.travel.depart, arrive: rt.travel.arrive, lengths, total: lengths[lengths.length - 1] };
        this.travellers.set(rt.id, t);
      }
      const f = Math.max(0, Math.min(1, (nowF - t.depart) / Math.max(1, t.arrive - t.depart)));
      const dist = f * t.total;
      let i = 1;
      while (i < t.lengths.length - 1 && t.lengths[i] < dist) i++;
      const a = t.path[i - 1] ?? t.path[0];
      const b = t.path[i] ?? a;
      const seg = Math.max(0.0001, t.lengths[i] - t.lengths[i - 1]);
      const u = Math.max(0, Math.min(1, (dist - t.lengths[i - 1]) / seg));
      const tx = (a.x + (b.x - a.x) * u) * 16 + 8;
      const ty = (a.y + (b.y - a.y) * u) * 16 + 14;
      const dx = tx - t.sprite.x;
      const dy = ty - t.sprite.y;
      const moving = Math.abs(dx) + Math.abs(dy) > 0.05;
      const dir: CharDir = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? (b.x > a.x ? 'right' : 'left') : b.y > a.y ? 'down' : 'up';
      // smooth toward the timed position
      const k = Math.min(1, dt / 120);
      t.sprite.setPos(t.sprite.x + dx * k, t.sprite.y + dy * k);
      t.sprite.setMoving(moving && f < 1, dir);
      t.sprite.alpha = f > 0.97 ? Math.max(0, (1 - f) / 0.03) : f < 0.03 ? f / 0.03 : 1;
      t.sprite.update(dt, now);
    }
    for (const [id, t] of this.travellers) {
      if (!active.has(id)) {
        t.sprite.destroy();
        this.travellers.delete(id);
      }
    }
  }

  private updateLabels(): void {
    const p = this.host.playerPos();
    const all: [string, CharacterSprite][] = [...this.sprites.entries(), ...[...this.travellers.entries()].map(([k, v]) => [k, v.sprite] as [string, CharacterSprite])];
    for (const [id, s] of all) {
      const near = Math.hypot(s.x - p.x, s.y - p.y) < 56;
      const rel = this.core.state.social.rel[id];
      if (near) s.setLabel(rel?.knowsName ? NPC_BY_ID[id].name : '？', rel?.status === 'friend' || rel?.status === 'close' ? '#ffe9a8' : '#f4f1ea');
      else s.setLabel(null);
    }
  }

  /** Nearest named NPC (in the current location) within range, for interaction. */
  nearest(x: number, y: number, range: number): { id: string; sprite: CharacterSprite } | null {
    let best: { id: string; sprite: CharacterSprite } | null = null;
    let bd = range;
    for (const [id, s] of this.sprites) {
      if (this.leaving.has(id)) continue;
      const d = Math.hypot(s.x - x, s.y - 8 - y);
      if (d < bd) {
        bd = d;
        best = { id, sprite: s };
      }
    }
    for (const [id, t] of this.travellers) {
      const d = Math.hypot(t.sprite.x - x, t.sprite.y - 8 - y);
      if (d < bd) {
        bd = d;
        best = { id, sprite: t.sprite };
      }
    }
    return best;
  }

  emote(id: string, e: string, now: number): void {
    this.sprites.get(id)?.showEmote(e, 2000, now);
  }
}
