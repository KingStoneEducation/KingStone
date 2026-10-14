import type { GameCore } from '../core/GameCore';
import { MINUTES_PER_DAY } from '../core/calendar';
import { hashString, Rng } from '../core/rng';
import type { Encounter, EncounterKind, NpcRuntime } from '../core/state';
import { NPCS, NPC_BY_ID } from '../data/npcs';
import { CITY_SPOTS } from '../world/maps/cityLayout';
import { ISLE_SPOTS } from '../world/maps/isleLayout';
import { MEMORY_TEXT, tieKey } from './SocialSystem';

/** How often (game minutes) the world checks who bumps into whom. */
const CHECK_EVERY = 5;
/** NPCs this far apart outdoors (tiles) are not "in the same place". */
const CITY_RANGE = 9;
/** Minimum NPC↔NPC tie for a spontaneous conversation. */
const MIN_TIE = 12;
/** Outdoors the player sees two people meet this close (tiles), about a screen away. */
const SEE_RANGE = 14;
/** The moments between other people the player remembers. */
export const PAIR_LOG_MAX = 80;

const DURATION: Record<EncounterKind, [number, number]> = {
  chat: [8, 14],
  gossip: [8, 12],
  toast: [6, 10],
  comfort: [10, 16],
  argue: [5, 9],
};

/** Deterministic roll in [0, 1) that does not disturb the world's random stream. */
function roll(key: string): number {
  return (hashString(key) % 100000) / 100000;
}

/**
 * Named NPCs who are in the same place at the same time sometimes stop and
 * talk: small talk, a toast at the bar, comfort for a friend in trouble, an
 * argument — or gossip, which is how stories about the player travel face to
 * face. Encounters change NPC↔NPC ties and moods; the world scene stages the
 * ones that happen where the player is, and the player may overhear them.
 */
export class EncounterSystem {
  constructor(private core: GameCore) {}

  private get s() {
    return this.core.state.social;
  }

  /** Conversations going on right now (optionally only at one location). */
  active(location?: string): Encounter[] {
    const now = this.core.now();
    return this.s.encounters.filter((e) => e.end > now && e.start <= now && (!location || e.location === location));
  }

  /** Started here and not long over (the world may still be playing it out). */
  recent(location: string): Encounter[] {
    const now = this.core.now();
    return this.s.encounters.filter((e) => e.location === location && e.start <= now && e.end > now - 30);
  }

  of(npcId: string): Encounter | undefined {
    return this.active().find((e) => e.a === npcId || e.b === npcId);
  }

  private available(rt: NpcRuntime): boolean {
    return !rt.travel && !!rt.location && rt.activity !== 'gamble' && rt.activity !== 'travel' && rt.activity !== 'home';
  }

  /** Whether two NPCs at the same location are actually close enough to meet. */
  private near(a: NpcRuntime, b: NpcRuntime): boolean {
    const spots = a.location === 'city' ? CITY_SPOTS : a.location === 'isle' ? ISLE_SPOTS : null;
    if (!spots) return true;
    const pa = a.spot ? spots[a.spot] : null;
    const pb = b.spot ? spots[b.spot] : null;
    if (!pa || !pb) return false;
    return Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y) <= CITY_RANGE;
  }

  tick(t: number): void {
    if (t % CHECK_EVERY !== 0) return;
    // finished conversations are kept briefly for the world scene, then dropped
    if (this.s.encounters.length) this.s.encounters = this.s.encounters.filter((e) => e.end > t - 30);
    const busy = new Set<string>();
    for (const e of this.s.encounters) {
      if (e.end > t) {
        busy.add(e.a);
        busy.add(e.b);
      }
    }
    const byLoc = new Map<string, NpcRuntime[]>();
    for (const def of NPCS) {
      const rt = this.core.state.npcs[def.id];
      if (!rt || busy.has(def.id) || !this.available(rt)) continue;
      const list = byLoc.get(rt.location!) ?? [];
      list.push(rt);
      byLoc.set(rt.location!, list);
    }
    const day = Math.floor(t / MINUTES_PER_DAY);
    for (const [loc, list] of byLoc) {
      if (list.length < 2) continue;
      let started = false;
      for (let i = 0; i < list.length && !started; i++) {
        for (let j = i + 1; j < list.length && !started; j++) {
          const x = list[i];
          const y = list[j];
          const key = tieKey(x.id, y.id);
          if (this.s.pairDay[key] === day) continue;
          const tie = this.core.social.tie(x.id, y.id);
          if (tie < MIN_TIE || !this.near(x, y)) continue;
          const dx = NPC_BY_ID[x.id].traits;
          const dy = NPC_BY_ID[y.id].traits;
          let p = 0.05 * (0.4 + (dx.sociability + dy.sociability) / 2) * (0.4 + tie / 100);
          if (x.activity === 'work' || y.activity === 'work') p *= 0.5;
          if (roll(`${key}|${t}`) >= p) continue;
          this.start(x.id, y.id, loc, t);
          started = true;
        }
      }
    }
  }

  /** Decide what the two talk about, apply the consequences and announce it. */
  start(xId: string, yId: string, location: string, t = this.core.now(), forced?: EncounterKind): Encounter {
    const social = this.core.social;
    const key = tieKey(xId, yId);
    const seed = `${key}|${t}|kind`;
    const rx = this.core.state.npcs[xId];
    const ry = this.core.state.npcs[yId];
    const tx = NPC_BY_ID[xId].traits;
    const ty = NPC_BY_ID[yId].traits;
    const tie = social.tie(xId, yId);
    // the more sociable one usually starts
    let a = tx.sociability >= ty.sociability ? xId : yId;
    let b = a === xId ? yId : xId;
    let kind: EncounterKind = 'chat';
    // a fresh story about the player is the best conversation starter of all
    const storyX = social.storyFor(xId, yId);
    const storyY = social.storyFor(yId, xId);
    const teller = storyX && storyY ? (tx.gossip >= ty.gossip ? xId : yId) : storyX ? xId : storyY ? yId : null;
    const inCrisis = (id: string) => !!this.core.state.npcs[id]?.flags.inCrisis;
    if (forced) {
      kind = forced;
      if (forced === 'gossip' && teller) a = teller;
    } else if (teller && roll(`${seed}|g`) < NPC_BY_ID[teller].traits.gossip * 0.9) {
      kind = 'gossip';
      a = teller;
    } else if ((inCrisis(xId) || inCrisis(yId)) && tie >= 30) {
      const sufferer = inCrisis(xId) ? xId : yId;
      const friend = sufferer === xId ? yId : xId;
      if (NPC_BY_ID[friend].traits.empathy >= 0.45) {
        kind = 'comfort';
        a = friend;
      } else if (NPC_BY_ID[friend].traits.temper >= 0.55 && roll(`${seed}|c`) < 0.4) {
        kind = 'argue';
        a = friend;
      }
    } else if (tie < 35 && (tx.temper + ty.temper) / 2 > 0.5 && roll(`${seed}|a`) < 0.3) {
      kind = 'argue';
      a = tx.temper >= ty.temper ? xId : yId;
    } else if (rx.activity === 'drink' && ry.activity === 'drink') {
      kind = 'toast';
    }
    b = a === xId ? yId : xId;
    const [lo, hi] = DURATION[kind];
    const minutes = lo + Math.floor(roll(`${seed}|d`) * (hi - lo + 1));
    const e: Encounter = { id: ++this.s.encSeq, a, b, kind, location, start: t, end: t + minutes };
    this.s.pairDay[key] = Math.floor(t / MINUTES_PER_DAY);
    const ra = this.core.state.npcs[a];
    const rb = this.core.state.npcs[b];
    switch (kind) {
      case 'gossip': {
        const story = social.storyFor(a, b);
        if (story) {
          const heard = social.tellStory(story, b, new Rng(`${seed}|retell`));
          e.memory = story.id;
          e.topic = (MEMORY_TEXT[story.kind] ?? (() => '的事'))(heard ?? story);
        }
        social.adjustTie(a, b, 1);
        break;
      }
      case 'chat':
        social.adjustTie(a, b, 1.5);
        break;
      case 'toast':
        social.adjustTie(a, b, 2);
        ra.mood = Math.min(100, ra.mood + 3);
        rb.mood = Math.min(100, rb.mood + 3);
        break;
      case 'comfort':
        social.adjustTie(a, b, 3);
        rb.mood = Math.min(100, rb.mood + 6);
        rb.stress = Math.max(0, rb.stress - 4);
        break;
      case 'argue':
        social.adjustTie(a, b, -4);
        ra.mood = Math.max(-100, ra.mood - 6);
        rb.mood = Math.max(-100, rb.mood - 6);
        ra.stress = Math.min(100, ra.stress + 5);
        rb.stress = Math.min(100, rb.stress + 5);
        break;
    }
    this.s.encounters.push(e);
    if (this.playerSees(e)) this.saw(e);
    this.core.bus.emit('npc:encounter', { encounter: e });
    this.core.touch();
    return e;
  }

  /** Is the player there to see it: in the same room, or outdoors within sight of where it happens? */
  playerSees(e: Encounter): boolean {
    const w = this.core.state.world;
    if (w.location !== e.location) return false;
    const spots = e.location === 'city' ? CITY_SPOTS : e.location === 'isle' ? ISLE_SPOTS : null;
    if (!spots) return true;
    // the two are together: where either of them stands will do
    return [e.a, e.b].some((id) => {
      const spot = this.core.state.npcs[id]?.spot;
      const p = spot ? spots[spot] : null;
      return !!p && Math.abs(p.x - w.x) + Math.abs(p.y - w.y) <= SEE_RANGE;
    });
  }

  /** Remember having seen these two together: who, where, what they were doing, how close they seemed. */
  saw(e: Encounter): void {
    const key = tieKey(e.a, e.b);
    const seen = (this.s.seenPairs ??= {});
    const prev = seen[key];
    seen[key] = { day: Math.floor(e.start / MINUTES_PER_DAY), kind: e.kind, by: e.a, location: e.location, tie: this.core.social.tie(e.a, e.b), times: (prev?.times ?? 0) + 1 };
    const log = (this.s.pairLog ??= []);
    log.push({ a: e.a, b: e.b, kind: e.kind, t: e.start, location: e.location });
    if (log.length > PAIR_LOG_MAX) log.splice(0, log.length - PAIR_LOG_MAX);
  }

  /**
   * The player was close enough to hear. Gossip about them goes into the
   * journal (and stings a little); an argument is noted. Happens once.
   */
  overhear(id: number): Encounter | null {
    const e = this.s.encounters.find((x) => x.id === id);
    if (!e || e.overheard) return null;
    e.overheard = true;
    const name = (npc: string) => (this.core.state.social.rel[npc]?.knowsName ? NPC_BY_ID[npc].name : '一个你不认识的人');
    if (e.kind === 'gossip' && e.topic) {
      this.core.journal.add('social', `你无意中听见${name(e.a)}在跟${name(e.b)}讲你的事：「听说${this.core.state.player.name}${e.topic}……」消息就是这样传开的。`, true);
      this.core.player.change('stress', 3);
      this.core.toast(`你听见${name(e.a)}在议论你……`, 'warn');
    } else if (e.kind === 'argue') {
      this.core.journal.add('social', `${name(e.a)}和${name(e.b)}吵了起来。`);
    }
    this.core.touch();
    return e;
  }
}
