import { describe, expect, it } from 'vitest';
import { buildCityMap } from '../src/world/maps/city';
import { allInteriorIds, interiorMap } from '../src/world/maps/interiors';
import { FEET, gateSide, reachable } from '../src/world/gates';
import type { Interactable, MapData } from '../src/world/maps/types';

const MAPS: MapData[] = [buildCityMap(), ...allInteriorIds().map((id) => interiorMap(id))];

const free = (m: MapData, x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.blocked[y * m.w + x] === 0;

function gates(m: MapData): { it: Interactable; inside: { x: number; y: number }; outside: { x: number; y: number } }[] {
  return m.interactables
    .filter((it) => it.interact.kind === 'gate')
    .map((it) => {
      const [ix, iy] = String(it.interact.data?.inside).split(',').map(Number);
      const [ox, oy] = String(it.interact.data?.outside).split(',').map(Number);
      return { it, inside: { x: ix, y: iy }, outside: { x: ox, y: oy } };
    });
}

/** Lifts: standing in front of one takes you to the tile in front of the other. */
function lifts(m: MapData): { front: { x: number; y: number }; to: { x: number; y: number } }[] {
  return m.interactables
    .filter((it) => it.interact.kind === 'elevator')
    .map((it) => {
      const [tx, ty] = String(it.interact.data?.to).split(',').map(Number);
      return { front: { x: it.x, y: it.y + it.h }, to: { x: tx, y: ty } };
    });
}

/** Everything the player can walk to from where they arrive, through doors', gates' and lifts' own rules. */
function accessible(m: MapData): Uint8Array {
  const start = m.spawns.entry ?? m.spawns.start;
  const acc = reachable(m, start.x, start.y);
  for (let changed = true; changed; ) {
    changed = false;
    for (const g of gates(m)) {
      const out = acc[g.outside.y * m.w + g.outside.x];
      const ins = acc[g.inside.y * m.w + g.inside.x];
      if (out && !ins) {
        reachable(m, g.inside.x, g.inside.y).forEach((v, i) => v && (acc[i] = 1));
        changed = true;
      }
    }
    for (const l of lifts(m)) {
      if (acc[l.front.y * m.w + l.front.x] && !acc[l.to.y * m.w + l.to.x]) {
        reachable(m, l.to.x, l.to.y).forEach((v, i) => v && (acc[i] = 1));
        changed = true;
      }
    }
  }
  return acc;
}

/** Same rule as the player's movement: does the feet box at (px, py) overlap a blocked tile? */
function boxBlocked(m: MapData, px: number, py: number): boolean {
  const corners = [
    [px - FEET.halfW, py - FEET.top],
    [px + FEET.halfW, py - FEET.top],
    [px - FEET.halfW, py - FEET.bottom],
    [px + FEET.halfW, py - FEET.bottom],
  ];
  return corners.some(([x, y]) => !free(m, Math.floor(x / 16), Math.floor(y / 16)));
}

describe('maps: nobody gets stuck', () => {
  for (const m of MAPS) {
    describe(m.id, () => {
      it('the arrival point is walkable and an exit can be reached from it', () => {
        const start = m.spawns.entry ?? m.spawns.start;
        expect(start, 'no entry/start spawn').toBeTruthy();
        expect(free(m, start.x, start.y)).toBe(true);
        const acc = accessible(m);
        if (m.id !== 'city') {
          const exits = m.doors.filter((d) => d.target === 'city');
          expect(exits.length).toBeGreaterThan(0);
          expect(exits.some((d) => acc[d.y * m.w + d.x] === 1), 'exit door unreachable').toBe(true);
        } else {
          for (const d of m.doors) {
            const tiles = Array.from({ length: d.w }, (_, i) => d.y * m.w + d.x + i);
            expect(tiles.some((i) => acc[i] === 1), `door to ${d.target} unreachable`).toBe(true);
          }
        }
      });

      it('every named spawn is on a walkable tile', () => {
        for (const [name, s] of Object.entries(m.spawns)) expect(free(m, s.x, s.y), `${name} at ${s.x},${s.y}`).toBe(true);
      });

      it('every interactive object can be reached', () => {
        const acc = accessible(m);
        const near = (x: number, y: number) =>
          [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;
            return nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && acc[ny * m.w + nx] === 1;
          });
        for (const it of m.interactables) {
          let ok = false;
          for (let j = it.y; j < it.y + it.h && !ok; j++) for (let i = it.x; i < it.x + it.w && !ok; i++) ok = near(i, j);
          expect(ok, `${it.id} (${it.interact.label}) at ${it.x},${it.y}`).toBe(true);
        }
      });

      it('every lift leads to the front of another lift, and back', () => {
        const ls = lifts(m);
        for (const l of ls) {
          expect(free(m, l.front.x, l.front.y), `lift front ${l.front.x},${l.front.y}`).toBe(true);
          expect(free(m, l.to.x, l.to.y), `lift destination ${l.to.x},${l.to.y}`).toBe(true);
          const back = ls.find((o) => o.front.x === l.to.x && o.front.y === l.to.y);
          expect(back, `lift to ${l.to.x},${l.to.y} has a lift there`).toBeTruthy();
          expect(back!.to).toEqual(l.front);
        }
      });

      it('every gated area can be entered and left again', () => {
        for (const g of gates(m)) {
          const name = g.it.interact.label;
          expect(free(m, g.inside.x, g.inside.y), `${name}: inside tile`).toBe(true);
          expect(free(m, g.outside.x, g.outside.y), `${name}: outside tile`).toBe(true);
          for (let j = g.it.y; j < g.it.y + g.it.h; j++) for (let i = g.it.x; i < g.it.x + g.it.w; i++) expect(free(m, i, j), `${name}: gate tile ${i},${j} must be closed`).toBe(false);
          // the gate is the only way through
          expect(reachable(m, g.inside.x, g.inside.y)[g.outside.y * m.w + g.outside.x], `${name}: walk-around`).toBe(0);
          // whatever spot the player walks up to the gate from, the game knows which side they are on
          for (const [from, side] of [[g.inside, 'inside'], [g.outside, 'outside']] as const) {
            const ax = Math.sign((side === 'inside' ? g.outside.x : g.inside.x) - from.x);
            const ay = Math.sign((side === 'inside' ? g.outside.y : g.inside.y) - from.y);
            for (let lateral = -6; lateral <= 6; lateral += 3) {
              let px = from.x * 16 + 8 + (ay !== 0 ? lateral : 0);
              let py = from.y * 16 + 14 + (ax !== 0 ? lateral : 0);
              if (boxBlocked(m, px, py)) continue;
              expect(gateSide(g, px, py), `${name}: standing on the ${side} tile`).toBe(side);
              // walk into the gate until the hit-box stops us
              for (let step = 0; step < 64 && !boxBlocked(m, px + ax * 0.25, py + ay * 0.25); step++) {
                px += ax * 0.25;
                py += ay * 0.25;
              }
              expect(gateSide(g, px, py), `${name}: pressed against the gate from the ${side} (${px.toFixed(2)},${py.toFixed(2)})`).toBe(side);
            }
          }
        }
      });
    });
  }
});
