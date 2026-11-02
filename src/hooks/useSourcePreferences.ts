'use client';

import { useSyncExternalStore } from 'react';

export const SOURCE_PREFERENCES_KEY = 'rainy-source-preferences-v1';
export const DEFAULT_SOURCE_PREFERENCES = Object.freeze({ wrap: true, highlight: true });
export type SourcePreferences = { wrap: boolean; highlight: boolean };
let current: SourcePreferences | null = null;
const listeners = new Set<() => void>();
function storage(): Storage | null { try { return window.localStorage; } catch { return null; } }
export function readSourcePreferences(local: Pick<Storage, 'getItem'> | null): SourcePreferences {
  try {
    const raw = JSON.parse(local?.getItem(SOURCE_PREFERENCES_KEY) ?? '{}');
    return Object.freeze({ wrap: typeof raw?.wrap === 'boolean' ? raw.wrap : true, highlight: typeof raw?.highlight === 'boolean' ? raw.highlight : true });
  } catch { return DEFAULT_SOURCE_PREFERENCES; }
}
export function getSourcePreferences(): SourcePreferences { return current ??= readSourcePreferences(storage()); }
function refresh(event?: StorageEvent) {
  if (event && event.key !== SOURCE_PREFERENCES_KEY && event.key !== null) return;
  const local = storage();
  if (!local) return;
  let raw: string | null;
  try { raw = local.getItem(SOURCE_PREFERENCES_KEY); } catch { return; }
  const next = readSourcePreferences({ getItem: () => raw });
  if (current?.wrap === next.wrap && current?.highlight === next.highlight) return;
  current = next; listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener('storage', refresh);
  listeners.add(listener); refresh();
  return () => { listeners.delete(listener); if (!listeners.size) window.removeEventListener('storage', refresh); };
}
export function setSourcePreference(key: keyof SourcePreferences, value: boolean) {
  current = Object.freeze({ ...getSourcePreferences(), [key]: value });
  try { storage()?.setItem(SOURCE_PREFERENCES_KEY, JSON.stringify(current)); } catch { /* Keep the session choice if persistence is unavailable. */ }
  listeners.forEach(listener => listener());
}
export function useSourcePreferences() {
  const preferences = useSyncExternalStore(subscribe, getSourcePreferences, () => DEFAULT_SOURCE_PREFERENCES);
  return { preferences, toggle: (key: keyof SourcePreferences) => setSourcePreference(key, !getSourcePreferences()[key]) };
}
