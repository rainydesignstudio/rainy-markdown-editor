'use client';

import { useLayoutEffect, useState } from 'react';

export const SIDEBAR_PREFERENCES_KEY = 'rainy-sidebar-preferences-v1';
const EVENT = 'rainy-sidebar-preferences-change';
const DEFAULTS = Object.freeze({ mainCollapsed: false, articleCollapsed: false });
export type SidebarPreferences = { mainCollapsed: boolean; articleCollapsed: boolean };
let sessionValue: SidebarPreferences | null = null;

export function readSidebarPreferences(storage: Pick<Storage, 'getItem'> | null): SidebarPreferences {
  try {
    const raw = JSON.parse(storage?.getItem(SIDEBAR_PREFERENCES_KEY) ?? '{}');
    return { mainCollapsed: typeof raw?.mainCollapsed === 'boolean' ? raw.mainCollapsed : false,
      articleCollapsed: typeof raw?.articleCollapsed === 'boolean' ? raw.articleCollapsed : false };
  } catch { return DEFAULTS; }
}
function currentPreference(): SidebarPreferences {
  if (sessionValue) return sessionValue;
  try { return readSidebarPreferences(window.localStorage); } catch { return DEFAULTS; }
}

export function useSidebarPreferences() {
  const [preferences, setPreferences] = useState<SidebarPreferences>(DEFAULTS);
  // Restore before paint, while the existing startup screen still covers the shell.
  useLayoutEffect(() => {
    const sync = () => setPreferences(currentPreference());
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== SIDEBAR_PREFERENCES_KEY && event.key !== null) return;
      sessionValue = null; sync();
    };
    sync();
    window.addEventListener(EVENT, sync); window.addEventListener('storage', syncStorage);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', syncStorage); };
  }, []);
  const toggle = (key: keyof SidebarPreferences) => {
    const previous = currentPreference();
    sessionValue = { ...previous, [key]: !previous[key] };
    setPreferences(sessionValue);
    try { window.localStorage.setItem(SIDEBAR_PREFERENCES_KEY, JSON.stringify(sessionValue)); }
    catch { /* Retain the session choice when browser storage is unavailable. */ }
    window.dispatchEvent(new CustomEvent(EVENT));
  };
  return { preferences, toggle };
}
