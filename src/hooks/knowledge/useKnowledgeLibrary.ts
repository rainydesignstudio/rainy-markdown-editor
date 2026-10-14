'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { queryDirectoryReadWritePermission } from '../../lib/directoryBookmark';
import { ProductError, productErrorMessage } from '../../lib/i18n/productMessages';
import { connectKnowledgeSource, restoreKnowledgeSource, type KnowledgeConnection } from '../../lib/knowledge/source';
import { createKnowledgeWorker, type KnowledgeWorkerClient } from '../../lib/knowledge/workerClient';
import { rebuildKnowledgeIndex, searchKnowledgeIndex, type KnowledgeIndexProgress } from '../../lib/knowledge/indexing';
import { readKnowledgeIndex } from '../../lib/knowledge/store';
import { fileTitle, type KnowledgeManifest, type KnowledgeSearchHit } from '../../lib/knowledge/model';
import { downloadArticleBlob } from '../../lib/articleExport';

type Issue = ReturnType<typeof productErrorMessage> | null;
export type KnowledgeOpenDocument = { path: string; title: string; text: string; line: number; truncated: boolean; changed: boolean; modified: number; size: number };
const cancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError' || error instanceof ProductError && ['knowledge.changed', 'knowledge.indexCancelled'].includes(error.messageKey);
const permissionOrBindingChanged = (error: unknown) => error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name) || error instanceof ProductError && ['knowledge.readRequired', 'knowledge.writableLibraryRequired', 'knowledge.overlappingRoots', 'knowledge.invalidBinding', 'knowledge.indexSourceChanged'].includes(error.messageKey);

export function useKnowledgeLibrary(root: FileSystemDirectoryHandle | null, sessionKey: number, isRootCurrent: () => boolean) {
  const rootRef = useRef(root); rootRef.current = root;
  const currentRef = useRef(isRootCurrent); currentRef.current = isRootCurrent;
  const epoch = useRef(0), busyRef = useRef(false), workerRef = useRef<KnowledgeWorkerClient | null>(null);
  const scanWorkerRef = useRef<KnowledgeWorkerClient | null>(null);
  const taskRef = useRef<AbortController | null>(null), readRef = useRef<AbortController | null>(null), queryRef = useRef<AbortController | null>(null);
  const [connection, setConnection] = useState<KnowledgeConnection | null>(null), connectionRef = useRef(connection); connectionRef.current = connection;
  const [manifest, setManifest] = useState<KnowledgeManifest | null>(null), manifestRef = useRef(manifest); manifestRef.current = manifest;
  const [loading, setLoading] = useState(Boolean(root)), [busy, setBusy] = useState<'connecting' | 'permission' | 'indexing' | null>(null);
  const [issue, setIssue] = useState<Issue>(null), [progress, setProgress] = useState<KnowledgeIndexProgress | null>(null);
  const [query, setQuery] = useState(''), [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ hits: KnowledgeSearchHit[]; total: number; truncated: boolean } | null>(null);
  const [document, setDocument] = useState<KnowledgeOpenDocument | null>(null), [reading, setReading] = useState(false);
  const current = useCallback((token: number) => epoch.current === token && rootRef.current === root && currentRef.current(), [root]);
  const worker = useCallback(() => { if (!workerRef.current || workerRef.current.closed) workerRef.current = createKnowledgeWorker(); return workerRef.current; }, []);
  const stop = useCallback(() => { taskRef.current?.abort(); readRef.current?.abort(); queryRef.current?.abort(); workerRef.current?.dispose(); workerRef.current = null; scanWorkerRef.current?.dispose(); scanWorkerRef.current = null; }, []);
  const clearDocument = useCallback(() => { readRef.current?.abort(); setDocument(null); setReading(false); }, []);

  const load = useCallback(async (token: number) => {
    if (!root) return;
    const restored = await restoreKnowledgeSource(root, undefined, () => current(token));
    if (!current(token)) return;
    setConnection(restored); connectionRef.current = restored;
    setManifest(null); manifestRef.current = null;
    if (restored.status === 'ready' && restored.source) {
      try {
        const loaded = await readKnowledgeIndex(root, restored.source, worker());
        if (current(token)) { setManifest(loaded); manifestRef.current = loaded; }
      } catch (error) { if (current(token) && !cancelled(error)) setIssue(productErrorMessage(error)); }
    }
  }, [root, current, worker]);
  const reload = useCallback(async () => {
    const token = ++epoch.current; stop(); clearDocument(); setManifest(null); manifestRef.current = null; setResults(null);
    busyRef.current = false; setBusy(null); setLoading(true);
    try { await load(token); } catch (error) { if (current(token)) setIssue(productErrorMessage(error)); }
    finally { if (current(token)) setLoading(false); }
  }, [stop, clearDocument, load, current]);

  useEffect(() => {
    const token = ++epoch.current; stop(); busyRef.current = false;
    setBusy(null); setLoading(Boolean(root)); setConnection(null); setManifest(null); setIssue(null); setProgress(null); setQuery(''); setResults(null); clearDocument();
    if (root) void load(token).catch(error => { if (current(token) && !cancelled(error)) setIssue(productErrorMessage(error)); }).finally(() => { if (current(token)) setLoading(false); });
    return () => { epoch.current++; stop(); };
  }, [root, sessionKey, load, current, stop, clearDocument]);

  useEffect(() => {
    const token = epoch.current;
    const focus = () => {
      const active = connectionRef.current;
      if (!root || !active?.source || active.status !== 'ready' || busyRef.current) return;
      void active.source.assertCurrent().catch(error => {
        if (!current(token)) return;
        setIssue(productErrorMessage(error)); void reload();
      });
    };
    window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus);
  }, [root, connection?.source, current, reload]);

  const connect = useCallback(async () => {
    if (!root || busyRef.current) return;
    busyRef.current = true; setBusy('connecting'); setIssue(null);
    let token = epoch.current;
    let switched = false;
    try {
      if (await queryDirectoryReadWritePermission(root) !== 'granted') throw new ProductError('knowledge.writableLibraryRequired');
      if (!current(token)) return;
      const picker = (window as Window & { showDirectoryPicker?: (options: { mode: 'read'; id: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      if (!picker) throw new ProductError('knowledge.browserUnsupported');
      const selected = await picker.call(window, { mode: 'read', id: 'rainy-knowledge-source' });
      if (!current(token)) return;
      token = ++epoch.current; switched = true; stop(); clearDocument(); setResults(null);
      await connectKnowledgeSource(root, selected, undefined, () => current(token));
      await load(token);
    } catch (error) {
      if (current(token)) {
        if (!cancelled(error)) setIssue(productErrorMessage(error));
        if (permissionOrBindingChanged(error)) await reload();
        else if (switched) await load(token).catch(() => {});
      }
    } finally { if (current(token)) { busyRef.current = false; setBusy(null); } }
  }, [root, current, stop, clearDocument, load, reload]);

  const authorize = useCallback(async () => {
    const active = connectionRef.current, token = epoch.current;
    if (!active?.source || busyRef.current) return;
    busyRef.current = true; setBusy('permission'); setIssue(null);
    try { if (!await active.source.requestReadPermission()) throw new ProductError('knowledge.readRequired'); await load(token); }
    catch (error) { if (current(token)) { setIssue(productErrorMessage(error)); if (permissionOrBindingChanged(error)) await reload(); } }
    finally { if (current(token)) { busyRef.current = false; setBusy(null); } }
  }, [current, load, reload]);

  const scan = useCallback(async (force = false) => {
    const active = connectionRef.current, token = epoch.current;
    if (!root || active?.status !== 'ready' || !active.source || busyRef.current) return;
    busyRef.current = true; setBusy('indexing'); setIssue(null);
    const abort = new AbortController(); taskRef.current = abort;
    let isolated: KnowledgeWorkerClient | null = null;
    try {
      isolated = createKnowledgeWorker(); scanWorkerRef.current = isolated;
      const updated = await rebuildKnowledgeIndex(root, active.source, { force, signal: abort.signal, worker: isolated, onProgress: value => { if (current(token)) setProgress(value); } });
      if (current(token)) { setManifest(updated); manifestRef.current = updated; }
    } catch (error) { if (current(token)) { setIssue(productErrorMessage(error)); if (permissionOrBindingChanged(error)) await reload(); } }
    finally { isolated?.dispose(); if (scanWorkerRef.current === isolated) scanWorkerRef.current = null; if (current(token)) { busyRef.current = false; setBusy(null); taskRef.current = null; } }
  }, [root, current, reload]);

  useEffect(() => {
    queryRef.current?.abort(); setResults(null); setSearching(false);
    const active = connectionRef.current, token = epoch.current;
    if (!root || !query.trim() || !manifest || active?.status !== 'ready' || !active.source) return;
    setSearching(true);
    const abort = new AbortController(); queryRef.current = abort;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void searchKnowledgeIndex(root, active.source!, manifest, query, worker(), abort.signal).then(value => { if (current(token) && !abort.signal.aborted) setResults(value); })
        .catch(error => { if (current(token) && !abort.signal.aborted) { setIssue(productErrorMessage(error)); if (permissionOrBindingChanged(error)) void reload(); } })
        .finally(() => { if (current(token) && !abort.signal.aborted) setSearching(false); });
    }, 200);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [root, query, manifest, connection?.status, connection?.binding?.sourceId, current, worker, reload]);

  const open = useCallback(async (path: string, line = 1) => {
    const active = connectionRef.current, token = epoch.current;
    if (active?.status !== 'ready' || !active.source) return;
    readRef.current?.abort(); const abort = new AbortController(); readRef.current = abort;
    setReading(true); setIssue(null); setDocument(null);
    try {
      const file = await active.source.readFile(path); if (!current(token) || abort.signal.aborted) return;
      const content = await worker().request('readText', [file], abort.signal), metadata = manifestRef.current?.documents.find(doc => doc.path === path);
      if (current(token) && !abort.signal.aborted) setDocument({ path, title: metadata?.title ?? fileTitle(path), text: content.text, truncated: content.truncated, line, modified: file.lastModified, size: file.size, changed: Boolean(metadata && (metadata.modified !== file.lastModified || metadata.size !== file.size)) });
    } catch (error) { if (current(token) && !abort.signal.aborted) { setIssue(productErrorMessage(error)); if (permissionOrBindingChanged(error)) await reload(); } }
    finally { if (current(token) && !abort.signal.aborted) setReading(false); }
  }, [current, worker, reload]);

  const download = useCallback(async (path: string) => {
    const active = connectionRef.current, token = epoch.current;
    if (active?.status !== 'ready' || !active.source) return;
    try { const file = await active.source.readFile(path); if (current(token)) downloadArticleBlob(file, file.name); }
    catch (error) { if (current(token)) { setIssue(productErrorMessage(error)); if (permissionOrBindingChanged(error)) await reload(); } }
  }, [current, reload]);

  return { connection, manifest, loading, busy, issue, progress, query, setQuery, results, searching, document, reading, connect, authorize, scan, cancel: () => taskRef.current?.abort(), open, download, reload };
}
