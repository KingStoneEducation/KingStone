import type Phaser from 'phaser';
import type { GameCore } from '../core/GameCore';
import { NPCS, NPC_BY_ID } from '../data/npcs';
import { hashString } from '../core/rng';
import { CharacterSprite } from './CharacterSprite';
import { findPath, type Pt } from './pathfinding';
import type { MapData, SpotDef } from './maps/types';
import { FERRY_PIER, locationAnchor } from './maps/cityLayout';
import { ISLE, ISLE_PIER, isleAnchor, onIsle } from './maps/isleLayout';
import { FERRY_LATE } from '../systems/IsleSystem';
import type { CharDir } from '../art/characters';
import type { Encounter, NpcRuntime } from '../core/state';

type Trip = NonNullable<NpcRuntime['travel']>;
import { encounterLines, type EncounterBeat } from './encounterLines';

export interface WorldHost {
  /** the Phaser scene NPC sprites are added to */
  hostScene: Phaser.Scene;
  map: MapData;
  core: GameCore;
  /** entry tile of the current interior (where people come in) */
  entryTile(): Pt;
  /** where someone heading for (x, y) comes in: that part of the map's entry (the casino's upper floor has its lift) */
  regionEntry(x: number, y: number): Pt;
  /** seat position for a named NPC playing at a casino table */
  seatFor(npcId: string): { x: number; y: number; dir: CharDir; depth: number } | null;
  playerPos(): { x: number; y: number };
}

interface Traveller {
  sprite: CharacterSprite;
  path: Pt[];
  depart: number;
  arrive: number;
  /** after the walk: standing at the end of it until then (waiting on the pier for the ferry) */
  until: number;
  lengths: number[];
  total: number;
}

const WALK_SPEED = 38;
/** ms between conversation beats */
const BEAT_MS = 2600;
/** how close (px) the player must be to overhear */
const EARSHOT = 80;

interface Staging {
  enc: Encounter;
  /** who walked over (walks back afterwards) */
  walker: string | null;
  ready: boolean;
  beats: EncounterBeat[];
  idx: number;
  next: number;
}

function tilePx(p: Pt): { x: number; y: number } {
  return { x: p.x * 16 + 8, y: p.y * 16 + 14 };
}

/** Where someone waits on a ferry pier for the boat (one of a few places, so not everyone on one tile). */
function pierWait(id: string, side: 'city' | 'isle'): Pt {
  const w = side === 'city' ? FERRY_PIER.wait : ISLE_PIER.wait;
  return w[hashString(id) % w.length];
}

/** Keeps named NPC sprites in sync with the simulation (presence, spots, travel). */
export class NpcDirector {
  readonly sprites = new Map<string, CharacterSprite>();
  private leaving = new Set<string>();
  private targetSpot = new Map<string, string | null>();
  private travellers = new Map<string, Traveller>();
  private idleAt = new Map<string, number>();
  private staged = new Map<number, Staging>();
  /** NPCs standing away from their spot because they walked over to talk */
  private displaced = new Set<string>();
  /** NPCs currently facing someone in conversation (no idle fidgeting) */
  private talking = new Set<string>();
  /** NPCs talking with the player: they do not move at all */
  private engaged = new Set<string>();
  /** when someone stopped by the player goes back to where they were heading (game minutes) */
  private returnAt = new Map<string, number>();
  /** where each traveller set out from (to bring them in through the right door when they arrive) */
  private cameFrom = new Map<string, string | null>();

  constructor(private host: WorldHost) {}

  private get core() {
    return this.host.core;
  }

  private spotFor(npcId: string, spot: string | null): SpotDef {
    const m = this.host.map;
    if (spot && m.spots[spot]) return m.spots[spot];
    // deterministic fallback somewhere walkable near the middle (of the part of the map people walk in to)
    const h = hashString(npcId + m.id);
    const e = this.host.entryTile();
    const r = m.regions?.find((g) => e.x >= g.x && e.x < g.x + g.w && e.y >= g.y && e.y < g.y + g.h);
    const x0 = r ? r.x : 0;
    const y0 = r ? r.y : 0;
    const w = r ? r.w : m.w;
    const hh = r ? r.h : m.h;
    for (let i = 0; i < 200; i++) {
      const x = x0 + 2 + ((h + i * 7919) % Math.max(1, w - 4));
      const y = y0 + 3 + (((h >>> 8) + i * 104729) % Math.max(1, hh - 5));
      if (!m.blocked[y * m.w + x]) return { x, y, face: 'down' };
    }
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
    this.staged.clear();
    this.displaced.clear();
    this.talking.clear();
    this.engaged.clear();
    this.returnAt.clear();
  }

  /** The player starts talking with this NPC: stop, and drop any other conversation. */
  engage(id: string): void {
    this.engaged.add(id);
    this.returnAt.delete(id);
    const s = this.sprites.get(id);
    if (s?.path.length) s.stop();
    for (const st of this.staged.values()) if (st.enc.a === id || st.enc.b === id) st.idx = st.beats.length;
  }

  /** The conversation is over; after a short while they carry on with what they were doing. */
  disengage(id: string): void {
    this.engaged.delete(id);
    const s = this.sprites.get(id);
    const rt = this.core.state.npcs[id];
    if (!s || !rt || rt.travel || s.fixedDepth !== null) return;
    const p = tilePx(this.spotFor(id, rt.spot));
    if (Math.hypot(s.x - p.x, s.y - p.y) > 20) {
      this.displaced.add(id);
      this.returnAt.set(id, Number(rt.flags.talkHoldUntil ?? this.core.now()));
    }
  }

  /** Friends going aboard with the player: they stop where they are and take no orders from the schedule until they are back. */
  board(ids: string[]): CharacterSprite[] {
    const out: CharacterSprite[] = [];
    for (const id of ids) {
      const s = this.sprites.get(id);
      if (!s || this.leaving.has(id)) continue;
      this.engage(id);
      s.fixedDepth = null;
      s.setSitting(false);
      out.push(s);
    }
    return out;
  }

  /** Back on the pier: they go to wherever the simulation has them now (lingering on the pontoon, then off home). */
  disembark(ids: string[]): void {
    for (const id of ids) {
      this.engaged.delete(id);
      this.displaced.delete(id);
      this.returnAt.delete(id);
      // a spot that differs from the remembered one makes them walk there on the next update
      this.targetSpot.set(id, null);
    }
  }

  /** The tile outside this map's door into a location (on the island: the diner, the guesthouse, the resort). */
  private doorTo(loc: string | null | undefined): Pt | null {
    if (!loc || this.host.map.id === 'city') return null;
    const d = this.host.map.doors.find((x) => x.target === loc);
    return d ? { x: d.x + Math.floor((d.w - 1) / 2), y: d.y + (this.host.map.outdoor ? 1 : -1) } : null;
  }

  /** Reconcile sprites with simulation state; animate arrivals, departures and spot changes. */
  update(dt: number, now: number, nowF: number): void {
    const loc = this.host.map.id;
    const core = this.core;
    for (const def of NPCS) {
      const rt = core.state.npcs[def.id];
      if (rt.travel) this.cameFrom.set(def.id, rt.travel.from);
      const here = rt.location === loc && !rt.travel;
      const sprite = this.sprites.get(def.id);
      // talking with the player: no arriving, leaving or wandering
      if (sprite && this.engaged.has(def.id)) continue;
      if (here && !sprite) {
        // arrival: walk in from the entrance
        const s = new CharacterSprite(this.host.hostScene, def.look, 0, 0, 'up');
        this.sprites.set(def.id, s);
        this.targetSpot.set(def.id, rt.spot);
        const seat = loc === 'casino' ? this.host.seatFor(def.id) : null;
        const spot = this.spotFor(def.id, rt.spot);
        const goal = seat ? { x: Math.floor(seat.x / 16), y: Math.floor(seat.y / 16) } : { x: spot.x, y: spot.y };
        // someone who just crossed town on foot carries on from where their walk ended; someone who got
        // there while time skipped ahead (a night's sleep, a shift) is simply there
        const crossed = loc === 'city' || loc === ISLE ? this.travellers.get(def.id) : undefined;
        const came = this.cameFrom.get(def.id);
        const startTile = crossed
          ? { x: Math.floor(crossed.sprite.x / 16), y: Math.floor((crossed.sprite.y - 3) / 16) }
          : loc === 'city'
            ? { x: spot.x, y: spot.y }
            : loc === ISLE && came !== undefined && !onIsle(came)
              ? { ...ISLE_PIER.board }
              : (this.doorTo(came) ?? this.host.regionEntry(goal.x, goal.y));
        this.cameFrom.delete(def.id);
        const p = tilePx(startTile);
        s.setPos(p.x, p.y);
        const path = findPath(this.host.map, startTile.x, startTile.y, goal.x, goal.y, loc === 'city') ?? [];
        s.walkPath(path, WALK_SPEED, () => this.place(def.id, s, rt.spot));
        continue;
      }
      if (!here && sprite && !this.leaving.has(def.id)) {
        // departure: walk out, then vanish
        this.leaving.add(def.id);
        sprite.fixedDepth = null;
        sprite.setSitting(false);
        // off the island: the walk down to the ferry is drawn on the clock (see updateTravellers)
        if (loc === ISLE && rt.travel && !onIsle(rt.travel.to)) {
          sprite.destroy();
          this.sprites.delete(def.id);
          this.leaving.delete(def.id);
          continue;
        }
        const from = { x: Math.floor(sprite.x / 16), y: Math.floor(sprite.y / 16) };
        const exit = loc === 'city' ? this.cityAnchorTile(rt.travel?.to ?? null, def.district) : (this.doorTo(rt.travel?.to) ?? this.host.regionEntry(from.x, from.y));
        const path = exit ? findPath(this.host.map, from.x, from.y, exit.x, exit.y, loc === 'city') ?? [] : [];
        sprite.walkPath(path.slice(0, loc === 'city' ? 14 : 80), WALK_SPEED + 8, () => {
          sprite.destroy();
          this.sprites.delete(def.id);
          this.leaving.delete(def.id);
        });
        continue;
      }
      if (here && sprite && !this.leaving.has(def.id)) {
        const back = this.returnAt.get(def.id);
        if (back !== undefined && core.now() >= back) {
          this.returnAt.delete(def.id);
          this.walkBack(def.id);
        }
        const want = rt.spot;
        if (this.targetSpot.get(def.id) !== want && sprite.path.length === 0) {
          this.targetSpot.set(def.id, want);
          this.displaced.delete(def.id);
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
    this.updateEncounters(now);
    for (const s of this.sprites.values()) s.update(dt, now);
    if (loc === 'city' || loc === ISLE) this.updateTravellers(dt, now, nowF);
    this.updateLabels();
  }

  // ------------------------------------------------------------------ NPC↔NPC conversations

  /** Seated at a gaming table or working a post: the other one comes over instead. */
  private anchored(id: string, s: CharacterSprite): boolean {
    return s.fixedDepth !== null || this.core.state.npcs[id]?.activity === 'work';
  }

  private freeTileNear(target: CharacterSprite, from: CharacterSprite, working: boolean): Pt | null {
    const m = this.host.map;
    const tx = Math.floor(target.x / 16);
    const ty = Math.floor(target.y / 16);
    const side = from.x >= target.x ? 1 : -1;
    const blocked = (x: number, y: number) => x < 0 || y < 0 || x >= m.w || y >= m.h || !!m.blocked[y * m.w + x];
    const taken = (x: number, y: number) => [...this.sprites.values()].some((o) => o !== from && Math.floor(o.x / 16) === x && Math.floor(o.y / 16) === y);
    // someone working behind a counter is talked to across it, from the customer side
    const across = working && blocked(tx, ty + 1) ? [{ x: tx, y: ty + 2 }, { x: tx + side, y: ty + 2 }, { x: tx - side, y: ty + 2 }] : [];
    for (const c of [
      ...across,
      { x: tx + side, y: ty },
      { x: tx - side, y: ty },
      { x: tx, y: ty + 1 },
      { x: tx, y: ty - 1 },
      { x: tx + side, y: ty + 1 },
      { x: tx - side, y: ty + 1 },
    ]) {
      if (blocked(c.x, c.y) || taken(c.x, c.y)) continue;
      return c;
    }
    return null;
  }

  private faceEachOther(a: CharacterSprite, b: CharacterSprite): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const horiz = Math.abs(dx) >= Math.abs(dy);
    // one above the other: the lower speaker's bubble goes to the side
    if (!horiz) (dy > 0 ? b : a).bubbleDx = 20;
    if (a.fixedDepth === null) a.face(horiz ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    if (b.fixedDepth === null) b.face(horiz ? (dx > 0 ? 'left' : 'right') : dy > 0 ? 'up' : 'down');
  }

  /** Stage conversations happening here: walk over, face each other, talk; the player may overhear. */
  private updateEncounters(now: number): void {
    const loc = this.host.map.id;
    const recent = this.core.encounters.recent(loc);
    const nowMin = this.core.now();
    const ids = new Set(recent.map((e) => e.id));
    for (const [id, st] of this.staged) {
      const done = st.idx >= st.beats.length && now >= st.next;
      if (ids.has(id) && !done) continue;
      this.staged.delete(id);
      this.talking.delete(st.enc.a);
      this.talking.delete(st.enc.b);
      for (const n of [st.enc.a, st.enc.b]) {
        const sp = this.sprites.get(n);
        if (sp) sp.bubbleDx = 0;
      }
      if (st.walker) this.walkBack(st.walker);
    }
    for (const e of recent) {
      if (this.engaged.has(e.a) || this.engaged.has(e.b)) continue;
      const sa = this.sprites.get(e.a);
      const sb = this.sprites.get(e.b);
      if (!sa || !sb || this.leaving.has(e.a) || this.leaving.has(e.b)) {
        const st = this.staged.get(e.id);
        if (st) st.idx = st.beats.length;
        continue;
      }
      let st = this.staged.get(e.id);
      if (!st) {
        // only conversations still going on start; both must have arrived
        if (e.end <= nowMin || sa.path.length || sb.path.length) continue;
        st = { enc: e, walker: null, ready: false, beats: encounterLines(e, this.core), idx: 0, next: 0 };
        this.staged.set(e.id, st);
        const walker = !this.anchored(e.a, sa) ? e.a : !this.anchored(e.b, sb) ? e.b : null;
        const ws = walker === e.a ? sa : sb;
        const ts = walker === e.a ? sb : sa;
        const dist = Math.hypot(sa.x - sb.x, sa.y - sb.y) / 16;
        if (walker && dist > 2.5) {
          const target = walker === e.a ? e.b : e.a;
          const goal = this.freeTileNear(ts, ws, this.core.state.npcs[target]?.activity === 'work');
          const path = goal ? findPath(this.host.map, Math.floor(ws.x / 16), Math.floor(ws.y / 16), goal.x, goal.y, false, 3000) : null;
          if (path && path.length <= 24) {
            ws.fixedDepth = null;
            ws.setSitting(false);
            ws.walkPath(path, WALK_SPEED);
            this.displaced.add(walker);
            st.walker = walker;
          } else if (dist > 4) st.idx = st.beats.length; // too far to talk; it happens off-stage
        } else if (dist > 4) st.idx = st.beats.length;
      }
      if (st.idx >= st.beats.length) continue;
      if (!st.ready) {
        if (sa.path.length || sb.path.length) continue;
        st.ready = true;
        this.talking.add(e.a);
        this.talking.add(e.b);
        this.faceEachOther(sa, sb);
        st.next = now + 250;
      }
      if (now >= st.next) {
        const beat = st.beats[st.idx++];
        const sp = beat.who === 'a' ? sa : sb;
        if (beat.text) sp.say(beat.text, BEAT_MS - 200, now);
        if (beat.emote) sp.showEmote(beat.emote, BEAT_MS - 600, now);
        st.next = now + (beat.text ? BEAT_MS : 1300);
      }
      if ((e.kind === 'gossip' || e.kind === 'argue') && !e.overheard) {
        const p = this.host.playerPos();
        if (Math.min(Math.hypot(sa.x - p.x, sa.y - p.y), Math.hypot(sb.x - p.x, sb.y - p.y)) < EARSHOT) this.core.encounters.overhear(e.id);
      }
    }
  }

  private walkBack(id: string): void {
    if (!this.displaced.has(id)) return;
    this.displaced.delete(id);
    const sprite = this.sprites.get(id);
    if (!sprite || this.leaving.has(id)) return;
    const rt = this.core.state.npcs[id];
    const spot = this.spotFor(id, rt.spot);
    const path = findPath(this.host.map, Math.floor(sprite.x / 16), Math.floor(sprite.y / 16), spot.x, spot.y, this.host.map.id === 'city') ?? [];
    sprite.walkPath(path, WALK_SPEED, () => this.place(id, sprite, rt.spot));
  }

  private idle(id: string, s: CharacterSprite, activity: string, now: number): void {
    if (s.path.length > 0 || s.fixedDepth !== null || this.talking.has(id) || this.displaced.has(id)) return;
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

  /**
   * The part of a trip drawn on this map, by the clock: when the walk starts and ends, and how long
   * they then stand at the end of it (on a ferry pier, waiting for the boat). Greyhaven sees walks
   * across town and to or from its ferry pier; the island sees the walks to and from its own pier
   * (walks about the village are drawn by the people themselves, door to door).
   */
  private legWindow(tr: Trip): { walkFrom: number; walkTo: number; until: number } | null {
    const fromIsle = onIsle(tr.from);
    const toIsle = onIsle(tr.to);
    if (this.host.map.id === ISLE ? fromIsle === toIsle : fromIsle && toIsle) return null;
    if (!fromIsle && !toIsle) return { walkFrom: tr.depart, walkTo: tr.arrive, until: tr.arrive };
    if (tr.pier === undefined || tr.boat === undefined || tr.land === undefined) return null;
    // setting off for the boat, or coming off it on this side
    const outbound = this.host.map.id === ISLE ? fromIsle : toIsle;
    return outbound ? { walkFrom: tr.depart, walkTo: tr.pier, until: tr.boat + FERRY_LATE } : { walkFrom: tr.land, walkTo: tr.arrive, until: tr.arrive };
  }

  /** Where that walk goes, in this map's tiles. */
  private legEnds(rt: NpcRuntime, tr: Trip): { start: Pt; end: Pt } {
    const fromIsle = onIsle(tr.from);
    const toIsle = onIsle(tr.to);
    // a walk to somewhere outdoors ends at that spot, not at their home's door
    const toSpot = this.core.npcs.target(rt.id, tr.arrive).spot;
    if (this.host.map.id === ISLE) {
      return fromIsle ? { start: isleAnchor(tr.from, rt.spot), end: pierWait(rt.id, 'isle') } : { start: { ...ISLE_PIER.board }, end: isleAnchor(tr.to, toSpot) };
    }
    const def = NPC_BY_ID[rt.id];
    const a = locationAnchor(tr.from, tr.from === 'city' ? rt.spot : null, def.district);
    const b = locationAnchor(tr.to, tr.to === 'city' ? toSpot : null, def.district);
    // off the ferry at the pier's end; to the ferry, a place on the pier to wait for her
    return {
      start: fromIsle ? { ...FERRY_PIER.board } : { x: a.x, y: a.y + (tr.from && tr.from !== 'city' ? 1 : 0) },
      end: toIsle ? pierWait(rt.id, 'city') : { x: b.x, y: b.y + (tr.to && tr.to !== 'city' ? 1 : 0) },
    };
  }

  /** NPCs crossing town (or the island, to and from the ferry) are drawn along a path, timed by the simulation. */
  private updateTravellers(dt: number, now: number, nowF: number): void {
    const core = this.core;
    const active = new Set<string>();
    for (const rt of core.npcs.travelling()) {
      const tr = rt.travel;
      if (!tr) continue;
      const leg = this.legWindow(tr);
      if (!leg || nowF < leg.walkFrom || nowF > leg.until) continue;
      const { walkFrom, walkTo, until } = leg;
      active.add(rt.id);
      const def = NPC_BY_ID[rt.id];
      let t = this.travellers.get(rt.id);
      let fresh = false;
      if (!t || t.depart !== walkFrom) {
        fresh = true;
        t?.sprite.destroy();
        const { start, end } = this.legEnds(rt, tr);
        const path = [start, ...(findPath(this.host.map, start.x, start.y, end.x, end.y, true, 20000) ?? [end])];
        const lengths: number[] = [0];
        for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y));
        const sprite = new CharacterSprite(this.host.hostScene, def.look, start.x * 16 + 8, start.y * 16 + 14, 'down');
        t = { sprite, path, depart: walkFrom, arrive: walkTo, until, lengths, total: lengths[lengths.length - 1] };
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
      // smooth toward the timed position (a new traveller appears where it should be)
      const k = fresh ? 1 : Math.min(1, dt / 120);
      t.sprite.setPos(t.sprite.x + dx * k, t.sprite.y + dy * k);
      t.sprite.setMoving(moving && f < 1, dir);
      const waiting = t.until > t.arrive;
      // waiting on the pier, facing the boat; gone when she leaves
      if (waiting && f >= 1) t.sprite.face('right');
      const fadeIn = f < 0.03 ? f / 0.03 : 1;
      const fadeOut = waiting ? Math.max(0, Math.min(1, t.until - nowF)) : f > 0.97 ? Math.max(0, (1 - f) / 0.03) : 1;
      t.sprite.alpha = Math.min(fadeIn, fadeOut);
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
