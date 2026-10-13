import Phaser from 'phaser';
import type { GameCore } from '../core/GameCore';
import { CharacterSprite, LABEL_DEPTH } from './CharacterSprite';
import { anonLook } from './textures';
import { CASINO_TABLES } from './maps/casinoMap';
import { PROPS } from '../art/props';
import { TABLE_BY_ID } from '../casino/tables';
import { findPath, type Pt } from './pathfinding';
import type { MapData } from './maps/types';
import type { CharDir } from '../art/characters';
import { formatG } from '../core/money';

export interface SeatPos {
  x: number;
  y: number;
  dir: CharDir;
  depth: number;
}

/** World pixel position of a seat at a casino table. */
export function seatPosition(tableId: string, seat: number): SeatPos | null {
  const t = CASINO_TABLES[tableId];
  const cfg = TABLE_BY_ID[tableId];
  if (!t || !cfg) return null;
  const def = PROPS[t.prop];
  const left = t.x * 16 + (def.foot.w * 16 - def.w) / 2;
  const top = (t.y + 1) * 16 - def.h;
  const base = (t.y + 1) * 16;
  const n = cfg.seats;
  if (t.prop === 'bj_table') {
    const a = Math.PI * (0.12 + (0.76 * seat) / Math.max(1, n - 1));
    return { x: left + 26 + Math.cos(a) * 27, y: top + 14 + Math.sin(a) * 22 + 6, dir: 'up', depth: base + 4 };
  }
  if (t.prop === 'roulette_table') {
    return { x: left + 30 + seat * 7, y: top + 40, dir: 'up', depth: base + 4 };
  }
  const a = Math.PI * (0.1 + (0.8 * seat) / Math.max(1, n - 1));
  return { x: left + 34 + Math.cos(a) * 36, y: top + 20 + Math.sin(a) * 18 + 6, dir: 'up', depth: base + 4 };
}

interface FloatText {
  obj: Phaser.GameObjects.Text;
  born: number;
}

/** Renders the living casino floor: seated gamblers, slot players, staff traffic, results. */
export class CasinoFloor {
  private patrons = new Map<string, CharacterSprite>();
  private leaving = new Set<string>();
  private slotPlayers: CharacterSprite[] = [];
  private waitress: CharacterSprite | null = null;
  private floats: FloatText[] = [];
  private nextSlotShuffle = 0;
  private offs: (() => void)[] = [];

  constructor(
    private scene: Phaser.Scene,
    private core: GameCore,
    private map: MapData,
    private entry: Pt,
  ) {
    const bus = core.bus;
    this.offs.push(
      bus.on('patron:emote', ({ id, emote, net }) => {
        const s = this.patrons.get(id) ?? null;
        const now = this.scene.time.now;
        if (s) {
          s.showEmote(emote, 1800, now);
          if (net >= 5000 && (emote === '!' || emote === '!!')) this.float(s.x, s.y - 30, `+${formatG(net)}`, '#ffe45c');
        }
      }),
      bus.on('casino:bgResult', ({ tableId, text }) => {
        const t = CASINO_TABLES[tableId];
        if (!t) return;
        const def = PROPS[t.prop];
        this.float(t.x * 16 + (def.foot.w * 16) / 2, (t.y + 1) * 16 - def.h - 4, text, '#f4f1ea');
      }),
    );
  }

  private seatOf(id: string): SeatPos | null {
    const p = this.core.state.casino.patrons.find((x) => x.id === id);
    if (!p?.seat) return null;
    const [tableId, s] = p.seat.split(':');
    return seatPosition(tableId, Number(s));
  }

  build(): void {
    for (const p of this.core.state.casino.patrons) {
      if (p.npc || !p.seat || p.state === 'gone') continue;
      const seat = this.seatOf(p.id);
      if (!seat) continue;
      const s = new CharacterSprite(this.scene, anonLook(p.look, p.seat.startsWith('bacv') || p.seat.startsWith('bjv') ? 0.95 : undefined), seat.x, seat.y, 'up');
      s.fixedDepth = seat.depth;
      s.setSitting(true, seat.dir);
      this.patrons.set(p.id, s);
    }
    this.shuffleSlotPlayers();
    const w = anonLook(77, 0.2);
    w.style = 'vest';
    w.top = '#1a1a1f';
    w.topShade = '#101014';
    w.bottom = '#1a1a1f';
    w.accent = '#f0f0f0';
    w.body = 'f';
    w.hair = 4;
    this.waitress = new CharacterSprite(this.scene, w, 48 * 16 + 8, 31 * 16 + 14, 'down');
  }

  private shuffleSlotPlayers(): void {
    for (const s of this.slotPlayers) s.destroy();
    this.slotPlayers = [];
    const occ = this.core.casino.occupancy();
    let i = 0;
    for (const prop of this.map.props) {
      if (prop.interact?.kind !== 'slots') continue;
      i++;
      if (((i * 2654435761) >>> 0) % 100 >= occ * 70) continue;
      const s = new CharacterSprite(this.scene, anonLook(i * 31 + Math.floor(this.scene.time.now / 60000)), prop.x * 16 + 8, (prop.y + 1) * 16 + 12, 'up');
      s.face('up');
      this.slotPlayers.push(s);
    }
  }

  /** Seat of a named NPC playing at a table (used by the NPC director). */
  npcSeat(npcId: string): SeatPos | null {
    const p = this.core.state.casino.patrons.find((x) => x.npc === npcId && x.state !== 'gone');
    if (!p?.seat) return null;
    const [tableId, s] = p.seat.split(':');
    return seatPosition(tableId, Number(s));
  }

  update(dt: number, now: number): void {
    const alive = new Set<string>();
    for (const p of this.core.state.casino.patrons) {
      if (p.npc || !p.seat || p.state === 'gone') continue;
      alive.add(p.id);
      if (!this.patrons.has(p.id)) {
        const seat = this.seatOf(p.id);
        if (!seat) continue;
        const s = new CharacterSprite(this.scene, anonLook(p.look), this.entry.x * 16 + 8, this.entry.y * 16 + 14, 'up');
        this.patrons.set(p.id, s);
        const path = findPath(this.map, this.entry.x, this.entry.y, Math.floor(seat.x / 16), Math.floor(seat.y / 16), false) ?? [];
        s.walkPath(path, 46, () => {
          s.setPos(seat.x, seat.y);
          s.fixedDepth = seat.depth;
          s.setSitting(true, seat.dir);
        });
      }
    }
    for (const [id, s] of this.patrons) {
      if (alive.has(id) || this.leaving.has(id)) continue;
      this.leaving.add(id);
      s.fixedDepth = null;
      s.setSitting(false);
      const from = { x: Math.floor(s.x / 16), y: Math.floor(s.y / 16) + 1 };
      const path = findPath(this.map, from.x, Math.min(this.map.h - 2, from.y), this.entry.x, this.entry.y, false) ?? [];
      s.walkPath(path, 50, () => {
        s.destroy();
        this.patrons.delete(id);
        this.leaving.delete(id);
      });
    }
    for (const s of this.patrons.values()) s.update(dt, now);
    for (const s of this.slotPlayers) {
      s.update(dt, now);
      if (Math.random() < dt / 25000) s.showEmote(Math.random() < 0.15 ? '!' : '…', 1200, now);
    }
    if (now > this.nextSlotShuffle) {
      this.nextSlotShuffle = now + 90000;
      if (this.slotPlayers.length) this.shuffleSlotPlayers();
    }
    if (this.waitress) {
      if (this.waitress.path.length === 0 && Math.random() < dt / 3000) {
        const targets = Object.values(CASINO_TABLES).filter((t) => t.y > 13);
        const t = targets[Math.floor(Math.random() * targets.length)];
        const goal = Math.random() < 0.3 ? { x: 48, y: 30 } : { x: t.x + 1, y: t.y + 2 };
        const path = findPath(this.map, Math.floor(this.waitress.x / 16), Math.floor(this.waitress.y / 16), goal.x, goal.y, false, 4000);
        if (path) this.waitress.walkPath(path, 34);
      }
      this.waitress.update(dt, now);
    }
    this.floats = this.floats.filter((f) => {
      const age = now - f.born;
      f.obj.setY(f.obj.y - dt * 0.012);
      f.obj.setAlpha(Math.max(0, 1 - age / 2200));
      if (age > 2200) {
        f.obj.destroy();
        return false;
      }
      return true;
    });
  }

  float(x: number, y: number, text: string, color: string): void {
    const obj = this.scene.add
      .text(x, y, text, { fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif', fontSize: '7px', color, stroke: '#120d1f', strokeThickness: 2, resolution: 4 })
      .setOrigin(0.5, 1)
      .setDepth(LABEL_DEPTH + 2);
    this.floats.push({ obj, born: this.scene.time.now });
  }

  nearestPatron(x: number, y: number, range: number): { id: string; sprite: CharacterSprite } | null {
    let best: { id: string; sprite: CharacterSprite } | null = null;
    let bd = range;
    for (const [id, s] of this.patrons) {
      const d = Math.hypot(s.x - x, s.y - 8 - y);
      if (d < bd) {
        bd = d;
        best = { id, sprite: s };
      }
    }
    return best;
  }

  destroy(): void {
    for (const off of this.offs) off();
    for (const s of this.patrons.values()) s.destroy();
    for (const s of this.slotPlayers) s.destroy();
    this.waitress?.destroy();
    for (const f of this.floats) f.obj.destroy();
    this.patrons.clear();
    this.slotPlayers = [];
    this.floats = [];
  }
}
