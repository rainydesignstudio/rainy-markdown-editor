'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast, type ToastNotice } from '../components/global/Toast';
import { beginTrashCleanup, cancelTrashCleanup, checkpointTrashCleanup, finishTrashCleanup, listArticleTrash, restoreTrashedArticle, TRASH_CLEANUP_DURATION, type ArticleTrashCleanup, type ArticleTrashListing } from '../lib/articleTrash';
import { createToastCountdown, type ToastCountdown } from '../lib/toastCountdown';
import { readTrashCleanupCheckpoint, removeTrashCleanupCheckpoint, saveTrashCleanupCheckpoint } from '../lib/trashCleanupCheckpoint';
import { ProductError, productCause, productJoin, productReference, type ProductMessageInfo } from '../lib/i18n/productMessages';

type Options = {
  root: FileSystemDirectoryHandle | null; session: number; libraryId: string | null; ready: boolean; enabled: boolean;
  isCurrent: (root: FileSystemDirectoryHandle, session: number) => boolean;
  queue: <T>(work: () => Promise<T>) => Promise<T>;
  onRestored: (root: FileSystemDirectoryHandle) => Promise<void>;
};
const empty = (): ArticleTrashListing => ({ entries: [], cleanups: [], issues: [] });
const storage = () => { try { return window.sessionStorage; } catch { return null; } };
type Runtime = { record: ArticleTrashCleanup; clock: ToastCountdown; dispose: () => void };

/** Root-owned receipts and clocks outlive page routes; the toast only presents their undo window. */
export function useArticleTrash(options: Options) {
  const notify = useToast(), latest = useRef(options); latest.current = options;
  const [listing, setListing] = useState<ArticleTrashListing>(empty), [busyCount, setBusyCount] = useState(0);
  const busy = busyCount > 0;
  const [confirmation, setConfirmation] = useState<{ ids: string[]; root: FileSystemDirectoryHandle; session: number } | null>(null);
  const runtimes = useRef(new Map<string, Runtime>()), toastKeys = useRef(new Set<string>()), finishing = useRef(new Set<string>()), attempted = useRef(new Set<string>());
  const refreshRef = useRef<() => Promise<void>>(async () => {}), finishRef = useRef<(id: string) => Promise<void>>(async () => {}), undoRef = useRef<(id: string) => Promise<void>>(async () => {});
  const context = useCallback(() => {
    const current = latest.current, root = current.root;
    if (!root || !current.ready || !current.isCurrent(root, current.session)) throw new ProductError('trash.changed');
    return { ...current, root, guard: () => latest.current.ready && latest.current.root === root && latest.current.session === current.session && current.isCurrent(root, current.session) };
  }, []);
  const announce = useCallback((notice: ToastNotice) => { if (notice.key) toastKeys.current.add(notice.key); notify(notice); }, [notify]);
  const failure = useCallback((key: string, error: unknown) => announce({ key, label: '', tone: 'error', summary: productReference('trash.cleanupFailed'), details: productReference('trash.operationIssue', { cause: productCause(error) }), lifetime: { mode: 'manual' } }), [announce]);
  const stop = useCallback((id: string) => { runtimes.current.get(id)?.dispose(); runtimes.current.delete(id); }, []);

  const finish = useCallback(async (id: string) => {
    if (finishing.current.has(id)) return;
    const c = context(), key = `trash-cleanup:${c.libraryId}:${id}`; finishing.current.add(id); attempted.current.add(id); setBusyCount(value => value + 1);
    announce({ key, label: '', summary: productReference('trash.cleaning'), tone: 'info', lifetime: { mode: 'locked' } });
    try {
      const result = await c.queue(async () => { await checkpointTrashCleanup(c.root, id, 0, c.guard); return finishTrashCleanup(c.root, id, c.guard); });
      if (!c.guard()) return;
      stop(id); removeTrashCleanupCheckpoint(storage(), c.libraryId, id);
      announce({ key, label: '', summary: productReference(result.issues.length ? 'trash.cleanupFailed' : 'trash.cleanupComplete'), tone: result.issues.length ? 'warning' : 'success', details: result.issues.length ? productJoin(result.issues, '\n') : undefined, actions: result.issues.length ? [{ id: 'retry', label: productReference('trash.cleanupRetry'), presentation: 'icon', icon: 'reset', run: async () => { if (!c.guard()) throw new ProductError('trash.changed'); await finishRef.current(id); } }] : [] });
    } catch (error) { if (c.guard()) { stop(id); failure(key, error); } }
    finally { finishing.current.delete(id); if (c.guard()) { setBusyCount(value => Math.max(0, value - 1)); await refreshRef.current(); } }
  }, [announce, context, failure, stop]);
  finishRef.current = finish;

  const refresh = useCallback(async () => {
    let c: ReturnType<typeof context>; try { c = context(); } catch { return; }
    try {
      const next = await c.queue(() => listArticleTrash(c.root, c.guard)); if (!c.guard()) return;
      setListing(next);
      for (const id of runtimes.current.keys()) if (!next.cleanups.some(item => item.id === id)) {
        stop(id); removeTrashCleanupCheckpoint(storage(), c.libraryId, id); notify({ key: `trash-cleanup:${c.libraryId}:${id}`, dismiss: true });
      }
      for (const record of next.cleanups) {
        if (record.committing) { if (!attempted.current.has(record.id)) void finishRef.current(record.id); continue; }
        if (runtimes.current.has(record.id)) continue;
        const key = `trash-cleanup:${c.libraryId}:${record.id}`;
        const remainingMs = readTrashCleanupCheckpoint(storage(), c.libraryId, record.id, record.createdAt, record.remainingMs);
        const clock = createToastCountdown(TRASH_CLEANUP_DURATION, { remainingMs });
        let persistenceFailed = false;
        const save = () => {
          const remaining = clock.snapshot().remainingMs;
          saveTrashCleanupCheckpoint(storage(), c.libraryId, record.id, record.createdAt, remaining);
          if (!c.guard() || persistenceFailed) return;
          void c.queue(() => checkpointTrashCleanup(c.root, record.id, remaining, c.guard)).catch(error => {
            if (!c.guard() || persistenceFailed) return;
            persistenceFailed = true; clock.hold('checkpoint', true);
            announce({ key, label: '', tone: 'error', summary: productReference('trash.cleanupFailed'), details: productReference('trash.operationIssue', { cause: productCause(error) }), lifetime: { mode: 'manual' }, actions: [{ id: 'retry', label: productReference('trash.cleanupRetry'), presentation: 'icon', icon: 'reset', run: async () => { if (!c.guard()) throw new ProductError('trash.changed'); stop(record.id); await refreshRef.current(); } }] });
          });
        };
        const unsubscribe = clock.subscribe(save), elapsed = clock.onElapsed(() => { if (c.guard()) void finishRef.current(record.id); });
        runtimes.current.set(record.id, { record, clock, dispose: () => { unsubscribe(); elapsed(); clock.dispose(); } });
        announce({ key, label: '', summary: productReference('trash.cleanupReady'), details: productReference('trash.cleanupDetails', { count: record.entryIds.length }), tone: 'success', lifetime: { mode: 'auto', durationMs: TRASH_CLEANUP_DURATION, countdown: clock }, actions: [{ id: 'undo', label: productReference('trash.undoCleanup'), presentation: 'icon', icon: 'reset', run: async () => { if (!c.guard()) throw new ProductError('trash.changed'); await undoRef.current(record.id); } }] });
      }
    } catch (error) { if (c.guard()) setListing(current => ({ ...current, issues: [productReference('trash.operationIssue', { cause: productCause(error) })] })); }
  }, [announce, context, failure, notify, stop]);
  refreshRef.current = refresh;

  const undoCleanup = useCallback(async (id: string) => {
    const c = context(); setBusyCount(value => value + 1);
    try {
      await c.queue(() => cancelTrashCleanup(c.root, id, c.guard)); if (!c.guard()) return;
      stop(id); removeTrashCleanupCheckpoint(storage(), c.libraryId, id);
      announce({ key: `trash-cleanup:${c.libraryId}:${id}`, label: '', summary: productReference('trash.cleanupUndone'), tone: 'success' });
    } catch (error) { if (c.guard()) failure(`trash-cleanup:${c.libraryId}:${id}`, error); }
    finally { if (c.guard()) { setBusyCount(value => Math.max(0, value - 1)); await refresh(); } }
  }, [announce, context, failure, refresh, stop]);
  undoRef.current = undoCleanup;

  const restore = useCallback(async (ids: string[], noticeKey?: string) => {
    const c = context(), key = noticeKey ?? `trash-restore:${crypto.randomUUID()}`; setBusyCount(value => value + 1);
    announce({ key, label: '', summary: productReference('trash.restoring'), tone: 'info', lifetime: { mode: 'locked' } });
    try {
      const issues: ProductMessageInfo[] = []; let restored = 0;
      await c.queue(async () => { for (const id of ids) { try { const result = await restoreTrashedArticle(c.root, id, c.guard); restored++; issues.push(...result.issues); } catch (error) { issues.push(productReference('trash.operationIssue', { cause: productCause(error) })); } } });
      if (!c.guard()) return;
      if (restored) try { await c.onRestored(c.root); } catch (error) { issues.push(productReference('trash.indexPending', { cause: productCause(error) })); }
      if (!c.guard()) return;
      announce({ key, label: '', summary: productReference(!restored ? 'trash.restoreFailed' : issues.length ? 'trash.restorePartial' : 'trash.restoredCount', { count: restored }), details: issues.length ? productJoin(issues, '\n') : undefined, tone: !restored ? 'error' : issues.length ? 'warning' : 'success' });
    } catch (error) { if (c.guard()) failure(key, error); }
    finally { if (c.guard()) { setBusyCount(value => Math.max(0, value - 1)); await refresh(); } }
  }, [announce, context, failure, refresh]);

  const requestCleanup = useCallback((ids?: string[]) => {
    const c = context(); if (!c.enabled || busy) return;
    const reserved = new Set(listing.cleanups.flatMap(item => item.entryIds));
    const selected = listing.entries.filter(item => !reserved.has(item.id) && (!ids || ids.includes(item.id))).map(item => item.id);
    if (selected.length) setConfirmation({ ids: selected, root: c.root, session: c.session });
  }, [busy, context, listing]);
  const confirmCleanup = useCallback(async () => {
    const c = context(), request = confirmation;
    if (!request || request.root !== c.root || request.session !== c.session || !c.enabled || busy) return;
    setConfirmation(null); setBusyCount(value => value + 1);
    try { await c.queue(() => beginTrashCleanup(c.root, request.ids, c.guard)); }
    catch (error) { if (c.guard()) failure(`trash-cleanup-error:${crypto.randomUUID()}`, error); }
    finally { if (c.guard()) { setBusyCount(value => Math.max(0, value - 1)); await refresh(); } }
  }, [busy, confirmation, context, failure, refresh]);

  useEffect(() => {
    setConfirmation(null); setListing(empty()); setBusyCount(0); attempted.current.clear();
    if (options.root && options.ready) void refresh();
    const checkpoint = () => { for (const runtime of runtimes.current.values()) saveTrashCleanupCheckpoint(storage(), options.libraryId, runtime.record.id, runtime.record.createdAt, runtime.clock.snapshot().remainingMs); };
    const hide = () => { checkpoint(); for (const runtime of runtimes.current.values()) runtime.clock.hold('pagehide', true); };
    const show = () => { for (const runtime of runtimes.current.values()) runtime.clock.hold('pagehide', false); };
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
    return () => {
      window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show); checkpoint();
      for (const id of runtimes.current.keys()) stop(id);
      for (const key of toastKeys.current) notify({ key, dismiss: true }); toastKeys.current.clear();
    };
  }, [options.root, options.session, options.libraryId, options.ready, refresh, notify, stop]);
  const reserved = new Set(listing.cleanups.flatMap(item => item.entryIds));
  return { ...listing, available: listing.entries.filter(item => !reserved.has(item.id)), busy, confirmation, closeConfirmation: () => setConfirmation(null), requestCleanup, confirmCleanup, refresh, restore, undoCleanup, retryCleanup: finish, announce };
}
