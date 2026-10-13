import type { GameCore } from '../core/GameCore';
import type { DialogueView } from '../systems/DialogueEngine';
import type { EventPrompt } from '../systems/EventManager';
import type { ShiftReport } from '../systems/CareerSystem';

export type Panel = 'phone' | 'finance' | 'social' | 'map' | 'journal' | 'menu' | 'inventory' | 'stats' | 'help' | null;

export type Modal =
  | { type: 'dialogue'; view: DialogueView }
  | { type: 'shop'; shopId: string; consume?: boolean }
  | { type: 'cashier' }
  | { type: 'atm'; where: 'branch' | 'street' | 'casino' }
  | { type: 'bank'; tab?: 'account' | 'loans' | 'invest' }
  | { type: 'sleep' }
  | { type: 'kitchen' }
  | { type: 'wardrobe' }
  | { type: 'computer' }
  | { type: 'work'; jobId: string }
  | { type: 'shift'; report: ShiftReport; title: string }
  | { type: 'bus'; stop: string }
  | { type: 'read' }
  | { type: 'text'; title: string; text: string; tone?: 'info' | 'warn' | 'bad' }
  | { type: 'event'; prompt: EventPrompt }
  | { type: 'eventResult'; title: string; text: string }
  | { type: 'casino_member' }
  | { type: 'housing' }
  | { type: 'jobs' }
  | { type: 'collapse'; text: string }
  | { type: 'settings' }
  | { type: 'saves'; mode: 'save' | 'load' };

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'warn';
  t: number;
}

export interface Prompt {
  label: string;
  verb: string;
}

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  timeSpeed: number;
  zoom: number;
  showCasinoClock: boolean;
  reduceFlashing: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  musicVolume: 0.5,
  sfxVolume: 0.7,
  ambienceVolume: 0.6,
  timeSpeed: 1,
  zoom: 0,
  showCasinoClock: false,
  reduceFlashing: false,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('fortune-ruin:settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Tiny external store shared by React (via useSyncExternalStore) and the
 * Phaser scenes. Game data itself lives in GameCore; this only holds UI state.
 */
class UIStore {
  core: GameCore | null = null;
  screen: 'boot' | 'menu' | 'create' | 'game' = 'boot';
  panel: Panel = null;
  modal: Modal | null = null;
  modalStack: Modal[] = [];
  prompt: Prompt | null = null;
  toasts: Toast[] = [];
  table: { game: 'blackjack' | 'baccarat' | 'roulette' | 'slots' | 'poker'; tableId: string } | null = null;
  locationBanner: { name: string; sub: string; t: number } | null = null;
  fade = false;
  settings: Settings = loadSettings();
  private listeners = new Set<() => void>();
  private version = 0;
  private toastSeq = 0;
  private lastCoreVersion = -1;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  notify(): void {
    this.version++;
    for (const l of [...this.listeners]) l();
  }

  /** Called every animation frame; re-renders React only when the core changed. */
  pollCore(): void {
    if (this.core && this.core.version !== this.lastCoreVersion) {
      this.lastCoreVersion = this.core.version;
      this.notify();
    }
  }

  setCore(core: GameCore | null): void {
    this.core = core;
    this.panel = null;
    this.modal = null;
    this.modalStack = [];
    this.table = null;
    this.prompt = null;
    this.notify();
  }

  blocking(): boolean {
    return this.panel !== null || this.modal !== null || this.screen !== 'game' || this.fade;
  }

  private syncPause(): void {
    const c = this.core;
    if (!c) return;
    if (this.panel || this.modal) c.paused.add('ui');
    else c.paused.delete('ui');
  }

  openPanel(p: Panel): void {
    this.panel = this.panel === p ? null : p;
    this.syncPause();
    this.notify();
  }

  closePanel(): void {
    this.panel = null;
    this.syncPause();
    this.notify();
  }

  openModal(m: Modal): void {
    if (this.modal) this.modalStack.push(this.modal);
    this.modal = m;
    this.syncPause();
    this.notify();
  }

  replaceModal(m: Modal): void {
    this.modal = m;
    this.syncPause();
    this.notify();
  }

  closeModal(): void {
    this.modal = this.modalStack.pop() ?? null;
    if (this.modal === null && this.core?.dialogue.session) this.core.dialogue.end();
    this.syncPause();
    this.notify();
  }

  closeAll(): void {
    this.modal = null;
    this.modalStack = [];
    this.panel = null;
    if (this.core?.dialogue.session) this.core.dialogue.end();
    this.syncPause();
    this.notify();
  }

  setPrompt(p: Prompt | null): void {
    const same = (this.prompt?.label ?? '') === (p?.label ?? '') && (this.prompt?.verb ?? '') === (p?.verb ?? '');
    if (same) return;
    this.prompt = p;
    this.notify();
  }

  toast(text: string, tone: Toast['tone'] = 'info'): void {
    const t: Toast = { id: ++this.toastSeq, text, tone, t: Date.now() };
    this.toasts = [...this.toasts.slice(-4), t];
    this.notify();
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      this.notify();
    }, 4200);
  }

  banner(name: string, sub: string): void {
    this.locationBanner = { name, sub, t: Date.now() };
    this.notify();
    setTimeout(() => {
      if (this.locationBanner && Date.now() - this.locationBanner.t >= 2800) {
        this.locationBanner = null;
        this.notify();
      }
    }, 3000);
  }

  saveSettings(s: Partial<Settings>): void {
    this.settings = { ...this.settings, ...s };
    try {
      localStorage.setItem('fortune-ruin:settings', JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
    if (this.core) this.core.speed = this.settings.timeSpeed;
    this.notify();
  }
}

export const store = new UIStore();
