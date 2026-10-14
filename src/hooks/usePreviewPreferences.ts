'use client';

import { useSyncExternalStore } from 'react';

export const PREVIEW_PREFERENCES_KEY = 'rainy-preview-preferences-v1';
export const DEFAULT_PREVIEW_PREFERENCES = Object.freeze({ scrollSync: false, saveReport: true, saveOnly: false });
export type PreviewPreferences = { [Key in keyof typeof DEFAULT_PREVIEW_PREFERENCES]: boolean };
let current: PreviewPreferences | null = null;
const listeners = new Set<() => void>();

export function readPreviewPreferences(storage: Pick<Storage, 'getItem'> | null): PreviewPreferences {
  try {
    const raw = JSON.parse(storage?.getItem(PREVIEW_PREFERENCES_KEY) ?? '{}');
    return Object.freeze(Object.fromEntries(Object.entries(DEFAULT_PREVIEW_PREFERENCES).map(([key, fallback]) => [key, typeof raw?.[key] === 'boolean' ? raw[key] : fallback])) as PreviewPreferences);
  } catch { return DEFAULT_PREVIEW_PREFERENCES; }
}
function storage(): Storage | null { try { return window.localStorage; } catch { return null; } }
export function getPreviewPreferences(): PreviewPreferences { return current ??= readPreviewPreferences(storage()); }
function refresh(event?: StorageEvent) {
  if (event && event.key !== PREVIEW_PREFERENCES_KEY && event.key !== null) return;
  const local = storage();
  if (!local) return;
  let raw: string | null;
  try { raw = local.getItem(PREVIEW_PREFERENCES_KEY); } catch { return; }
  const next = readPreviewPreferences({ getItem: () => raw });
  if (current && Object.keys(next).every(key => next[key as keyof PreviewPreferences] === current![key as keyof PreviewPreferences])) return;
  current = next; listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener('storage', refresh);
  listeners.add(listener); refresh();
  return () => { listeners.delete(listener); if (!listeners.size) window.removeEventListener('storage', refresh); };
}
export function setPreviewPreference(key: keyof PreviewPreferences, value: boolean): void {
  current = Object.freeze({ ...getPreviewPreferences(), [key]: value });
  try { storage()?.setItem(PREVIEW_PREFERENCES_KEY, JSON.stringify(current)); } catch { /* Keep the session choice when persistence fails. */ }
  listeners.forEach(listener => listener());
}
export function usePreviewPreferences() {
  const preferences = useSyncExternalStore(subscribe, getPreviewPreferences, () => DEFAULT_PREVIEW_PREFERENCES);
  return { preferences, toggle: (key: keyof PreviewPreferences) => setPreviewPreference(key, !getPreviewPreferences()[key]) };
}
