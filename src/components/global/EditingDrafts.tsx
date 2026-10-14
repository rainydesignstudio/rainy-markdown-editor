'use client';

import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type SyntheticEvent } from 'react';
import { createEditingDrafts, EMPTY_DRAFTS, type EditingDraft } from '../../lib/editingDrafts';
import { captureEditingLocation, restoreEditingLocation, type EditingLocation } from '../../lib/editingLocation';
import { useUITranslation } from './UILocaleProvider';

const DraftContext = createContext<ReturnType<typeof createEditingDrafts> | null>(null);
export function EditingDraftsProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(createEditingDrafts);
  return <DraftContext.Provider value={registry}>{children}</DraftContext.Provider>;
}
export function useEditingDraft(draft: EditingDraft | null) {
  const registry = useContext(DraftContext), slot = useId(), current = useRef(draft);
  current.current = draft;
  const resume = useCallback(() => current.current?.resume(), []);
  useLayoutEffect(() => {
    registry?.set(slot, draft ? { ...draft, resume } : null);
    return () => registry?.set(slot, null);
  }, [registry, slot, Boolean(draft), draft?.kind, draft?.objectId, draft?.root, resume]);
  return resume;
}
const noSubscription = () => () => {};
const emptySnapshot = () => EMPTY_DRAFTS;
export function useEditingDrafts() {
  const registry = useContext(DraftContext);
  return useSyncExternalStore(registry?.subscribe ?? noSubscription, registry?.getSnapshot ?? emptySnapshot, emptySnapshot);
}
export function UnsavedMark({ tag = false, className = '' }: { tag?: boolean; className?: string }) {
  const { t } = useUITranslation('dialogs');
  return tag ? <span className={`shrink-0 rounded-md border border-danger/30 bg-danger-surface px-1.5 text-2xs text-danger ${className}`}>{t('dialogs:ui.unsaved')}</span>
    : <span className={`size-1.5 shrink-0 rounded-full bg-accent ${className}`} role="img" aria-label={t('dialogs:ui.unsaved')} />;
}
export function useDraftLocation<T extends HTMLElement = HTMLDivElement>(fallbackRoot?: () => HTMLElement | null) {
  const rootRef = useRef<T | null>(null), activeRef = useRef<HTMLElement | null>(null), savedRef = useRef<EditingLocation | null>(null);
  const getRoot = () => rootRef.current ?? fallbackRoot?.() ?? null;
  const remember = (event: SyntheticEvent) => {
    if (event.target instanceof HTMLElement && event.target.matches('input,textarea,select')) {
      activeRef.current = event.target;
      savedRef.current = captureEditingLocation(getRoot(), event.target);
    }
  };
  const capture = (preferred?: HTMLElement | null) => {
    const root = getRoot(), focused = root?.ownerDocument.activeElement;
    const active = preferred && root?.contains(preferred) ? preferred : focused instanceof HTMLElement && root?.contains(focused) && focused.matches('input,textarea,select') ? focused : activeRef.current;
    if (active && root?.contains(active)) activeRef.current = active;
    const canReadCurrent = Boolean(active && root?.contains(active)) || !savedRef.current;
    const next = canReadCurrent ? captureEditingLocation(root, active) : null;
    if (next) savedRef.current = next;
    return savedRef.current;
  };
  const restore = (location = savedRef.current) => restoreEditingLocation(location, getRoot);
  return { rootRef, savedRef, capture, restore, props: { ref: rootRef, onFocusCapture: remember, onSelectCapture: remember, onScrollCapture: () => { if (activeRef.current && rootRef.current?.contains(activeRef.current)) capture(); } } };
}
