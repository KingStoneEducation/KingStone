import Phaser from 'phaser';
import type { GameCore } from '../core/GameCore';
import { startNewGame, type NewGameOptions } from '../core/newGame';
import { SaveManager, SaveError, type StorageLike } from '../systems/SaveManager';
import { store } from '../ui/store';

/** localStorage wrapper that degrades to memory when storage is unavailable. */
function browserStorage(): StorageLike {
  try {
    const k = '__fr_probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (key) => mem.get(key) ?? null,
      setItem: (key, v) => void mem.set(key, v),
      removeItem: (key) => void mem.delete(key),
    };
  }
}

export const saves = new SaveManager(browserStorage());

let game: Phaser.Game | null = null;
let unbind: (() => void)[] = [];

export function setGame(g: Phaser.Game): void {
  game = g;
}

export function getGame(): Phaser.Game | null {
  return game;
}

function bind(core: GameCore): void {
  for (const off of unbind) off();
  const bus = core.bus;
  unbind = [
    bus.on('toast', ({ text, tone }) => store.toast(text, tone ?? 'info')),
    bus.on('autosave', ({ reason }) => autosave(reason)),
    bus.on('event:prompt', ({ prompt }) => store.openModal({ type: 'event', prompt })),
    bus.on('player:collapse', ({ text }) => store.openModal({ type: 'collapse', text })),
    bus.on('phone:message', ({ message }) => {
      const body = message.body.length > 30 ? `${message.body.slice(0, 30)}…` : message.body;
      store.toast(`📱 ${message.fromName}：${body}`, 'info');
    }),
    bus.on('casino:tier', ({ tier }) => store.toast(`赌场会员等级变更：${tier}`, 'good')),
    bus.on('casino:watched', () => store.toast('你注意到天花板上的摄像头似乎一直对着你这张桌子……', 'warn')),
    bus.on('evicted', () => store.openModal({ type: 'text', title: '被迫搬离', text: '因长期拖欠房租，房东收回了房子。你的行李被搬到了码头边的合租公寓。', tone: 'bad' })),
  ];
}

function autosave(reason: string): void {
  const core = store.core;
  if (!core) return;
  try {
    saves.save(core, 'auto', `自动存档（${reason === 'day' ? '新的一天' : reason === 'sleep' ? '睡觉' : reason === 'home' ? '回家' : reason}）`);
  } catch (e) {
    store.toast(e instanceof SaveError ? e.message : '自动存档失败', 'bad');
  }
}

/** Enter the world with a prepared simulation. */
export function begin(core: GameCore): void {
  core.speed = store.settings.timeSpeed;
  bind(core);
  store.setCore(core);
  store.screen = 'game';
  store.notify();
  if (game) {
    for (const k of ['blackjack', 'baccarat', 'roulette', 'poker']) if (game.scene.isActive(k) || game.scene.isPaused(k)) game.scene.stop(k);
    game.scene.stop('world');
    game.scene.start('world', { attract: false });
  }
}

export function newGame(opts: NewGameOptions): void {
  const core = startNewGame(opts);
  begin(core);
  autosave('new');
  store.openModal({ type: 'intro' });
}

export function loadGame(slot: string): string | null {
  try {
    const core = saves.load(slot);
    begin(core);
    store.toast('读档成功', 'good');
    return null;
  } catch (e) {
    return e instanceof SaveError ? e.message : `读档失败：${(e as Error).message}`;
  }
}

export function saveGame(slot: string, label?: string): string | null {
  const core = store.core;
  if (!core) return '没有进行中的游戏';
  if (store.table && core.casino.roundInProgress(store.table.tableId)) return '请先打完这一手再存档';
  try {
    saves.save(core, slot, label);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function quitToMenu(): void {
  const core = store.core;
  if (core && !(store.table && core.casino.roundInProgress(store.table.tableId))) autosave('quit');
  for (const off of unbind) off();
  unbind = [];
  store.setCore(null);
  store.screen = 'menu';
  store.notify();
  if (game) {
    for (const k of ['blackjack', 'baccarat', 'roulette', 'poker']) if (game.scene.isActive(k) || game.scene.isSleeping(k)) game.scene.stop(k);
    game.scene.stop('world');
    game.scene.start('world', { attract: true });
  }
}
