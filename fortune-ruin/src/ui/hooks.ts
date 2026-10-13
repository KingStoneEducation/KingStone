import { useEffect, useSyncExternalStore } from 'react';
import { store } from './store';
import type { GameCore } from '../core/GameCore';

/** Re-render whenever the UI store or the simulation changes. */
export function useStore(): typeof store {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}

/** The running simulation (only valid on the game screen). */
export function useCore(): GameCore {
  useStore();
  if (!store.core) throw new Error('no game in progress');
  return store.core;
}

/** Window-level key handler that ignores typing in form fields. */
export function useKey(handler: (e: KeyboardEvent) => void, deps: unknown[]): void {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      handler(e);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
