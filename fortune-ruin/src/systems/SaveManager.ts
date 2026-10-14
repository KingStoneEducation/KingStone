import { hashString } from '../core/rng';
import { SAVE_VERSION, type GameState } from '../core/state';
import { GameCore } from '../core/GameCore';
import { formatDateTime } from '../core/calendar';
import { formatG } from '../core/money';
import { LOCATIONS } from '../data/locations';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type SlotId = (typeof SLOTS)[number];

const KEY = (slot: string) => `fortune-ruin:save:${slot}`;

export interface SaveSummary {
  slot: string;
  label: string;
  savedReal: number;
  gameTime: string;
  name: string;
  netWorth: string;
  location: string;
  playHours: number;
}

interface Envelope {
  format: 'fortune-ruin-save';
  version: number;
  checksum: number;
  summary: SaveSummary;
  data: GameState;
}

export class SaveError extends Error {}

/** Upgrades older save data to the current schema. */
export function migrate(state: GameState): GameState {
  const s = state as GameState & { [k: string]: unknown };
  if (!s.meta || typeof s.meta.version !== 'number') throw new SaveError('存档缺少版本信息');
  if (s.meta.version > SAVE_VERSION) throw new SaveError('存档来自更新版本的游戏');
  // defensive defaults for fields added after v1
  s.casino.paidRounds ??= {};
  s.casino.activeTable ??= null;
  s.casino.invites ??= { highLimit: -1, vip: -1, sky: -1 };
  s.casino.invites.sky ??= -1;
  s.casino.sky ??= { suiteFrom: -1, suiteUntil: -1, suiteCompWeek: -1, spaFreeDay: -1, nights: 0, treatments: 0, limoRides: 0, redeemed: 0 };
  for (const rt of Object.values(s.npcs)) rt.overrides ??= [];
  s.social.encounters ??= [];
  s.social.encSeq ??= 0;
  s.social.pairDay ??= {};
  s.stories ??= { active: [], done: [], ended: {} };
  s.economy.stakes ??= [];
  s.meta.version = SAVE_VERSION;
  return s;
}

export function serialize(core: GameCore, slot: string, label?: string): string {
  core.syncRng();
  core.state.meta.savedReal = Date.now();
  core.state.meta.saveLabel = label ?? core.state.meta.saveLabel;
  const json = JSON.stringify(core.state);
  const env: Envelope = {
    format: 'fortune-ruin-save',
    version: SAVE_VERSION,
    checksum: hashString(json),
    summary: summarize(core, slot, label),
    data: JSON.parse(json),
  };
  return JSON.stringify(env);
}

export function summarize(core: GameCore, slot: string, label?: string): SaveSummary {
  return {
    slot,
    label: label ?? '',
    savedReal: Date.now(),
    gameTime: formatDateTime(core.now(), true),
    name: core.state.player.name,
    netWorth: formatG(core.economy.netWorth()),
    location: LOCATIONS[core.state.world.location]?.name ?? core.state.world.location,
    playHours: Math.round((core.state.meta.playMs / 3600000) * 10) / 10,
  };
}

export function deserialize(text: string): GameState {
  let env: Envelope;
  try {
    env = JSON.parse(text);
  } catch {
    throw new SaveError('存档文件已损坏（无法解析）');
  }
  if (env.format !== 'fortune-ruin-save' || !env.data) throw new SaveError('不是《夜色筹码》的存档文件');
  const json = JSON.stringify(env.data);
  if (hashString(json) !== env.checksum) throw new SaveError('存档校验失败，文件可能已被修改或损坏');
  return migrate(env.data);
}

export class SaveManager {
  constructor(private storage: StorageLike) {}

  save(core: GameCore, slot: string, label?: string): SaveSummary {
    const text = serialize(core, slot, label);
    try {
      this.storage.setItem(KEY(slot), text);
    } catch (e) {
      throw new SaveError(`保存失败：${(e as Error).message}`);
    }
    return (JSON.parse(text) as Envelope).summary;
  }

  load(slot: string): GameCore {
    const text = this.storage.getItem(KEY(slot));
    if (!text) throw new SaveError('该存档位为空');
    return new GameCore(deserialize(text));
  }

  has(slot: string): boolean {
    return this.storage.getItem(KEY(slot)) !== null;
  }

  list(): (SaveSummary | null)[] {
    return SLOTS.map((slot) => {
      const text = this.storage.getItem(KEY(slot));
      if (!text) return null;
      try {
        return (JSON.parse(text) as Envelope).summary;
      } catch {
        return null;
      }
    });
  }

  remove(slot: string): void {
    this.storage.removeItem(KEY(slot));
  }

  exportText(slot: string): string | null {
    return this.storage.getItem(KEY(slot));
  }

  importText(slot: string, text: string): SaveSummary {
    deserialize(text); // validates
    this.storage.setItem(KEY(slot), text);
    return (JSON.parse(text) as Envelope).summary;
  }
}
