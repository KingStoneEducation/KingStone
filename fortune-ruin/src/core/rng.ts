/**
 * Seedable, serializable PRNG (xoshiro128**).
 *
 * Every random outcome in the game (card shuffles, roulette spins, NPC
 * behaviour, world events) flows through an `Rng` instance whose full state
 * can be saved and restored, so any run is reproducible from a seed.
 * Nothing in the game reads player state to bias these numbers.
 */

export type RngState = [number, number, number, number];

function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let z = a;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** FNV-1a string hash, used to derive seeds from labels. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export class Rng {
  private s: RngState;

  constructor(seed: number | string | RngState) {
    if (Array.isArray(seed)) {
      this.s = [seed[0] >>> 0, seed[1] >>> 0, seed[2] >>> 0, seed[3] >>> 0];
    } else {
      const n = typeof seed === 'string' ? hashString(seed) : seed;
      const sm = splitmix32(n);
      this.s = [sm(), sm(), sm(), sm()];
    }
    if ((this.s[0] | this.s[1] | this.s[2] | this.s[3]) === 0) this.s[0] = 1;
  }

  /** Next raw unsigned 32-bit integer. */
  nextU32(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11);
    return result;
  }

  /** Uniform float in [0, 1) with 32 bits of precision. */
  float(): number {
    return this.nextU32() / 4294967296;
  }

  /** Unbiased integer in [min, max] (inclusive) via rejection sampling. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new Error(`Rng.int: invalid range [${min}, ${max}]`);
    }
    const range = max - min + 1;
    if (range > 4294967296) throw new Error('Rng.int: range too large');
    if (range === 4294967296) return min + this.nextU32();
    const limit = 4294967296 - (4294967296 % range);
    let x = this.nextU32();
    while (x >= limit) x = this.nextU32();
    return min + (x % range);
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.float() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array');
    return arr[this.int(0, arr.length - 1)];
  }

  /** Weighted pick; weights must be >= 0 and not all zero. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) throw new Error('Rng.weighted: all weights are zero');
    let r = this.float() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  /** In-place Fisher–Yates shuffle. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /** Normally distributed sample (Box–Muller). */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    while (u === 0) u = this.float();
    const v = this.float();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  getState(): RngState {
    return [this.s[0], this.s[1], this.s[2], this.s[3]];
  }

  setState(state: RngState): void {
    this.s = [state[0] >>> 0, state[1] >>> 0, state[2] >>> 0, state[3] >>> 0];
  }

  /** Derive an independent child stream; does not disturb this stream's sequence beyond one draw. */
  fork(label: string): Rng {
    const a = this.nextU32();
    return new Rng((a ^ hashString(label)) >>> 0);
  }
}
