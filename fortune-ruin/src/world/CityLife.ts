import Phaser from 'phaser';
import { CharacterSprite } from './CharacterSprite';
import { anonLook, frameRef } from './textures';
import { findPath, randomWalkable, type Pt } from './pathfinding';
import type { CityMap, Lane } from './maps/city';
import type { LightSource } from './Lighting';
import { CAR_COLORS } from '../art/props';

interface Ped {
  sprite: CharacterSprite;
  waitUntil: number;
  leaving: boolean;
}

interface Car {
  img: Phaser.GameObjects.Image;
  lane: Lane;
  pos: number;
  speed: number;
  color: number;
}

/** Ambient city life: pedestrians on the sidewalks and traffic on the roads. */
export class CityLife {
  private peds: Ped[] = [];
  private cars: Car[] = [];
  private nextCar = new Map<Lane, number>();
  private seed = 1;

  constructor(
    private scene: Phaser.Scene,
    private map: CityMap,
    private player: () => { x: number; y: number },
  ) {}

  private rnd = (): number => {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  };

  targetPeds(hour: number): number {
    if (hour < 6) return 5;
    if (hour < 9) return 14;
    if (hour < 17) return 20;
    if (hour < 22) return 22;
    return 11;
  }

  update(dt: number, now: number, hour: number): void {
    // pedestrians
    const target = this.targetPeds(hour);
    if (this.peds.filter((p) => !p.leaving).length < target && this.rnd() < 0.05) this.spawnPed(now);
    if (this.peds.filter((p) => !p.leaving).length > target + 2) {
      const p = this.peds.find((x) => !x.leaving);
      if (p) p.leaving = true;
    }
    for (const p of this.peds) {
      if (p.sprite.path.length === 0 && now > p.waitUntil) {
        if (p.leaving) {
          p.sprite.alpha -= dt / 600;
          if (p.sprite.alpha <= 0) p.sprite.alpha = 0;
        } else {
          const from = { x: Math.floor(p.sprite.x / 16), y: Math.floor(p.sprite.y / 16) };
          const to = randomWalkable(this.map, this.rnd, true);
          const path = findPath(this.map, from.x, from.y, to.x, to.y, true, 6000);
          if (path && path.length > 0) p.sprite.walkPath(path.slice(0, 60), 30 + this.rnd() * 14, () => (p.waitUntil = now + 1500 + this.rnd() * 6000));
          else p.waitUntil = now + 2000;
        }
      }
      p.sprite.update(dt, now);
    }
    this.peds = this.peds.filter((p) => {
      if (p.leaving && p.sprite.alpha <= 0) {
        p.sprite.destroy();
        return false;
      }
      return true;
    });

    // traffic
    const busy = hour >= 7 && hour < 20 ? 1 : hour >= 20 || hour < 1 ? 0.6 : 0.2;
    for (const lane of this.map.lanes) {
      const t = this.nextCar.get(lane) ?? 0;
      if (now >= t) {
        this.nextCar.set(lane, now + (2600 + this.rnd() * 6000) / busy);
        if (this.rnd() < 0.85) this.spawnCar(lane);
      }
    }
    const pl = this.player();
    for (const c of this.cars) {
      const horiz = c.lane.dir === 'left' || c.lane.dir === 'right';
      const sign = c.lane.dir === 'right' || c.lane.dir === 'down' ? 1 : -1;
      // stop for the player or the car ahead
      const px = horiz ? pl.x : pl.y;
      const pc = horiz ? pl.y : pl.x;
      const laneCenter = c.lane.fixed * 16 + 8;
      let blocked = Math.abs(pc - laneCenter) < 20 && (px - c.pos) * sign > 0 && (px - c.pos) * sign < 44;
      for (const o of this.cars) {
        if (o === c || o.lane !== c.lane) continue;
        const gap = (o.pos - c.pos) * sign;
        if (gap > 0 && gap < 52) blocked = true;
      }
      if (!blocked) c.pos += (sign * c.speed * dt) / 1000;
      if (horiz) c.img.setPosition(Math.round(c.pos), Math.round(laneCenter + 6)).setDepth(laneCenter + 10);
      else c.img.setPosition(Math.round(laneCenter), Math.round(c.pos)).setDepth(c.pos + 18);
    }
    this.cars = this.cars.filter((c) => {
      const end = c.lane.to * 16;
      const sign = c.lane.dir === 'right' || c.lane.dir === 'down' ? 1 : -1;
      if ((c.pos - end) * sign > 0) {
        c.img.destroy();
        return false;
      }
      return true;
    });
  }

  private spawnPed(now: number): void {
    const view = this.scene.cameras.main.worldView;
    let pt: Pt | null = null;
    for (let i = 0; i < 20; i++) {
      const c = randomWalkable(this.map, this.rnd, true);
      const x = c.x * 16;
      const y = c.y * 16;
      // prefer spawning just outside the view so people walk in naturally
      if (x < view.x - 16 || x > view.right + 16 || y < view.y - 16 || y > view.bottom + 16 || i > 15) {
        pt = c;
        break;
      }
    }
    if (!pt) return;
    const seed = Math.floor(this.rnd() * 100000);
    const s = new CharacterSprite(this.scene, anonLook(seed), pt.x * 16 + 8, pt.y * 16 + 14, 'down');
    this.peds.push({ sprite: s, waitUntil: now, leaving: false });
  }

  private spawnCar(lane: Lane): void {
    const color = Math.floor(this.rnd() * CAR_COLORS.length);
    const ref = frameRef(`car:${color}:${lane.dir}`);
    const img = this.scene.add.image(0, 0, ref.key, ref.frame).setOrigin(0.5, lane.dir === 'left' || lane.dir === 'right' ? 0.85 : 0.5);
    const c: Car = { img, lane, pos: lane.from * 16, speed: 62 + this.rnd() * 26, color };
    this.cars.push(c);
  }

  lights(night: boolean): LightSource[] {
    if (!night) return [];
    const out: LightSource[] = [];
    for (const c of this.cars) {
      const horiz = c.lane.dir === 'left' || c.lane.dir === 'right';
      const sign = c.lane.dir === 'right' || c.lane.dir === 'down' ? 1 : -1;
      const x = horiz ? c.img.x + sign * 30 : c.img.x;
      const y = horiz ? c.img.y - 6 : c.img.y + sign * 26;
      out.push({ x, y, r: 26, color: 0xfff0c0 });
    }
    return out;
  }

  nearestPed(x: number, y: number, range: number): CharacterSprite | null {
    let best: CharacterSprite | null = null;
    let bd = range;
    for (const p of this.peds) {
      const d = Math.hypot(p.sprite.x - x, p.sprite.y - 8 - y);
      if (d < bd) {
        bd = d;
        best = p.sprite;
      }
    }
    return best;
  }

  destroy(): void {
    for (const p of this.peds) p.sprite.destroy();
    for (const c of this.cars) c.img.destroy();
    this.peds = [];
    this.cars = [];
  }
}
