'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { queryDirectoryReadWritePermission } from '../../lib/directoryBookmark';
import { ProductError, productErrorMessage } from '../../lib/i18n/productMessages';
import { addKnowledgeSource, reconnectKnowledgeSource, restoreKnowledgeSource, readKnowledgeBindings, updateKnowledgeSource, disconnectKnowledgeSource, type KnowledgeRegistration, type KnowledgeConnection } from '../../lib/knowledge/source';
import { createKnowledgeWorker, type KnowledgeWorkerClient } from '../../lib/knowledge/workerClient';
import { rebuildKnowledgeIndex, searchKnowledgeIndex, type KnowledgeIndexProgress } from '../../lib/knowledge/indexing';
import { readKnowledgeIndex, readKnowledgeIndexStates } from '../../lib/knowledge/store';
import { fileTitle, type KnowledgeManifest, type KnowledgeSearchHit } from '../../lib/knowledge/model';
import { downloadArticleBlob } from '../../lib/articleExport';

type Issue = ReturnType<typeof productErrorMessage> | null;
export type KnowledgeOpenDocument = { sourceId: string; sourceName?: string; path: string; title: string; text: string; line: number; fragment?: string; truncated: boolean; changed: boolean; modified: number; size: number };
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
  const [bindings, setBindings] = useState<KnowledgeRegistration[]>([]), [indexed, setIndexed] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null), selectedRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(Boolean(root)), [busy, setBusy] = useState<'connecting' | 'permission' | 'indexing' | 'reading' | null>(null);
  const [issue, setIssue] = useState<Issue>(null), [progress, setProgress] = useState<KnowledgeIndexProgress | null>(null);
  const [query, setQuery] = useState(''), [searching, setSearching] = useState(false);
  const [scope, setScope] = useState('all');
  const [filters, setFilters] = useState({ phrase: '', exclude: '', title: '', path: '' });
  const searchQuery = useMemo(() => ({ text: query, ...filters }), [query, filters]);
  const searchActive = Object.values(searchQuery).some(value => value.trim());
  const [results, setResults] = useState<{ hits: KnowledgeSearchHit[]; total: number; truncated: boolean; incomplete: boolean; problems: { sourceId: string; name: string; reason: 'unavailable' | 'indexMissing' | 'partial' | 'error'; issue?: KnowledgeConnection['issue'] }[] } | null>(null);
  const [document, setDocument] = useState<KnowledgeOpenDocument | null>(null), [reading, setReading] = useState(false);
  const loadedDocument = useRef<{ source: NonNullable<KnowledgeConnection['source']>; value: KnowledgeOpenDocument } | null>(null);
  const current = useCallback((token: number) => epoch.current === token && rootRef.current === root && currentRef.current(), [root]);
  const worker = useCallback(() => { if (!workerRef.current || workerRef.current.closed) workerRef.current = createKnowledgeWorker(); return workerRef.current; }, []);
  const stop = useCallback(() => { taskRef.current?.abort(); readRef.current?.abort(); queryRef.current?.abort(); workerRef.current?.dispose(); workerRef.current = null; scanWorkerRef.current?.dispose(); scanWorkerRef.current = null; }, []);
  const clearDocument = useCallback(() => { readRef.current?.abort(); loadedDocument.current = null; setDocument(null); setReading(false); }, []);

  const load = useCallback(async (token: number, sourceId: string | null = selectedRef.current, readFiles = false) => {
    if (!root) return;
    if (await queryDirectoryReadWritePermission(root) !== 'granted') { if (current(token)) setConnection({ status: 'library-unavailable', binding: null, source: null }); return; }
    const entries = await readKnowledgeBindings(root); if (!current(token)) return;
    setBindings(entries); setScope(value => value === 'all' || entries.some(item => item.sourceId === value) ? value : 'all');
    const states = await readKnowledgeIndexStates(root, entries, () => current(token), worker);
    if (!current(token)) return; setIndexed(states);
    const id = sourceId && entries.some(item => item.sourceId === sourceId) ? sourceId : null;
    selectedRef.current = id; setSelectedId(id);
    if (!id) { setConnection({ status: 'unbound', binding: null, source: null }); return; }
    const restored = await restoreKnowledgeSource(root, undefined, () => current(token), id);
    if (!current(token)) return;
    setConnection(restored); connectionRef.current = restored;
    setManifest(null); manifestRef.current = null;
    if (restored.status === 'ready' && restored.source) {
      const abort = new AbortController(); taskRef.current = abort;
      setProgress({ phase: 'indexing', total: 1, scanned: 0, parsed: 0, reused: 0 });
      let loaded = await readKnowledgeIndex(root, restored.source, worker(), abort.signal);
      if (!loaded && readFiles) {
        const isolated = createKnowledgeWorker(); scanWorkerRef.current = isolated;
        try { loaded = await rebuildKnowledgeIndex(root, restored.source, { signal: abort.signal, worker: isolated, onProgress: value => { if (current(token)) setProgress(value); } }); }
        finally { isolated.dispose(); if (scanWorkerRef.current === isolated) scanWorkerRef.current = null; }
      }
      if (current(token) && !abort.signal.aborted) { setManifest(loaded); manifestRef.current = loaded; setIndexed(value => ({ ...value, [id]: loaded?.status === 'ready' })); setProgress(null); }
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
    setBusy(null); setLoading(Boolean(root)); selectedRef.current = null; setSelectedId(null); setBindings([]); setIndexed({}); setConnection(null); setManifest(null); setIssue(null); setProgress(null); setQuery(''); setScope('all'); setFilters({ phrase: '', exclude: '', title: '', path: '' }); setResults(null); clearDocument();
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

  const connect = useCallback(async (action: 'add' | 'relocate' | 'replace' = 'add') => {
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
      const linked = action === 'relocate' ? await reconnectKnowledgeSource(root, selected, undefined, () => current(token), selectedRef.current ?? undefined) : await addKnowledgeSource(root, selected, undefined, () => current(token), action === 'replace' ? selectedRef.current ?? undefined : undefined);
      selectedRef.current = linked.binding.sourceId; setSelectedId(linked.binding.sourceId); setConnection(null); connectionRef.current = null; setManifest(null); manifestRef.current = null; setBusy('reading'); setLoading(true);
      await load(token, linked.binding.sourceId, true);
    } catch (error) {
      if (current(token)) {
        if (!cancelled(error)) setIssue(productErrorMessage(error));
        if (permissionOrBindingChanged(error)) await reload();
        else if (switched) await load(token).catch(() => {});
      }
    } finally { if (current(token)) { busyRef.current = false; setBusy(null); setLoading(false); } }
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
      if (current(token)) { setManifest(updated); manifestRef.current = updated; setIndexed(value => ({ ...value, [active.source!.binding.sourceId]: updated.status === 'ready' })); }
    } catch (error) { if (current(token) && !cancelled(error)) { setIssue(productErrorMessage(error)); if (permissionOrBindingChanged(error)) await reload(); } }
    finally { isolated?.dispose(); if (scanWorkerRef.current === isolated) scanWorkerRef.current = null; if (current(token)) { busyRef.current = false; setBusy(null); taskRef.current = null; } }
  }, [root, current, reload]);

  useEffect(() => {
    queryRef.current?.abort(); setResults(null); setSearching(false);
    const token = epoch.current;
    if (!root || !searchActive || !bindings.length) return;
    const abort = new AbortController(); queryRef.current = abort; setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        let hits: KnowledgeSearchHit[] = [], total = 0;
        const problems: NonNullable<typeof results>['problems'] = [];
        const targets = bindings.filter(item => scope === 'all' || item.sourceId === scope);
        for (const binding of targets) {
          if (abort.signal.aborted || !current(token)) return;
          try {
            const connection = await restoreKnowledgeSource(root, undefined, () => current(token) && !abort.signal.aborted, binding.sourceId);
            if (abort.signal.aborted || !current(token)) return;
            if (connection.status !== 'ready' || !connection.source) { problems.push({ ...binding, reason: 'unavailable', issue: connection.issue }); continue; }
            const index = await readKnowledgeIndex(root, connection.source, worker(), abort.signal);
            if (!index) { problems.push({ ...binding, reason: 'indexMissing' }); continue; }
            const result = await searchKnowledgeIndex(root, connection.source, index, searchQuery, worker(), abort.signal);
            if (abort.signal.aborted || !current(token)) return;
            total += result.total;
            hits = await worker().request('rank', [[...hits, ...result.hits.map(hit => ({ ...hit, sourceId: binding.sourceId, sourceName: binding.name }))]], abort.signal);
            if (index.status === 'partial') problems.push({ ...binding, reason: 'partial' });
          } catch (error) {
            if (abort.signal.aborted || !current(token)) return;
            problems.push({ ...binding, reason: 'error', issue: productErrorMessage(error) });
          }
        }
        if (current(token) && !abort.signal.aborted) setResults({ hits, total, truncated: total > hits.length, incomplete: !targets.length || problems.length > 0, problems });
      })().catch(error => { if (current(token) && !abort.signal.aborted) setIssue(productErrorMessage(error)); })
        .finally(() => { if (current(token) && !abort.signal.aborted) setSearching(false); });
    }, 200);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [root, searchQuery, searchActive, scope, bindings, indexed, current, worker]);

  const open = useCallback(async (path: string, line = 1, fragment?: string, sourceId = selectedRef.current) => {
    const token = epoch.current;
    let active = connectionRef.current;
    if (!root || !current(token)) return;
    if (fragment && active?.binding?.sourceId === sourceId && loadedDocument.current?.source === active?.source && loadedDocument.current.value.path === path) {
      readRef.current?.abort();
      const value = { ...loadedDocument.current.value, line, fragment };
      loadedDocument.current = { source: active.source!, value };
      setDocument(value); setReading(false); setIssue(null); return;
    }
    readRef.current?.abort(); const abort = new AbortController(); readRef.current = abort;
    loadedDocument.current = null; setReading(true); setIssue(null); setDocument(null);
    try {
      if (!sourceId || !bindings.some(item => item.sourceId === sourceId)) throw new ProductError('knowledge.indexSourceChanged');
      if (!active || active.binding?.sourceId !== sourceId || active.status !== 'ready') {
        // The connection outlives this read; a later read must not invalidate its source.
        active = await restoreKnowledgeSource(root, undefined, () => current(token), sourceId);
        if (!current(token) || abort.signal.aborted) return;
        selectedRef.current = sourceId; setSelectedId(sourceId); setConnection(active); connectionRef.current = active;
        setManifest(null); manifestRef.current = null;
        if (active.status === 'ready' && active.source) {
          const index = await readKnowledgeIndex(root, active.source, worker(), abort.signal);
          if (!current(token) || abort.signal.aborted) return;
          setManifest(index); manifestRef.current = index;
        }
      }
      if (active.status !== 'ready' || !active.source) throw new ProductError('knowledge.readRequired');
      const file = await active.source.readFile(path); if (!current(token) || abort.signal.aborted) return;
      const content = await worker().request('readText', [file], abort.signal), metadata = manifestRef.current?.documents.find(doc => doc.path === path);
      if (current(token) && !abort.signal.aborted) {
        const value = { sourceId, sourceName: active.binding?.name, path, title: metadata?.title ?? fileTitle(path), text: content.text, truncated: content.truncated, line, fragment, modified: file.lastModified, size: file.size, changed: Boolean(metadata && (metadata.modified !== file.lastModified || metadata.size !== file.size)) };
        loadedDocument.current = { source: active.source, value }; setDocument(value);
      }
    } catch (error) { if (current(token) && !abort.signal.aborted) setIssue(productErrorMessage(error)); }
    finally { if (current(token) && !abort.signal.aborted) setReading(false); }
  }, [root, bindings, current, worker]);

  const download = useCallback(async (path: string) => {
    const active = connectionRef.current, token = epoch.current;
    if (active?.status !== 'ready' || !active.source) return;
    try { const file = await active.source.readFile(path); if (current(token)) downloadArticleBlob(file, file.name); }
    catch (error) { if (current(token)) { setIssue(productErrorMessage(error)); if (permissionOrBindingChanged(error)) await reload(); } }
  }, [current, reload]);

  const select = useCallback(async (id: string) => {
    if (!root) return;
    const token = ++epoch.current; stop(); clearDocument(); setResults(null); setIssue(null); setProgress(null); setManifest(null); manifestRef.current = null;
    selectedRef.current = id; setSelectedId(id); setConnection(null); connectionRef.current = null; busyRef.current = true; setBusy('reading'); setLoading(true);
    try { await load(token, id, true); } catch (error) { if (current(token) && !cancelled(error)) setIssue(productErrorMessage(error)); }
    finally { if (current(token)) { busyRef.current = false; setBusy(null); setLoading(false); taskRef.current = null; } }
  }, [root, stop, clearDocument, load, current]);
  const edit = useCallback(async (input: { name: string; directory: string } | null) => {
    if (!root || !selectedRef.current || busyRef.current) return false;
    const id = selectedRef.current, token = epoch.current; busyRef.current = true; setBusy('connecting'); setIssue(null);
    try {
      if (input) await updateKnowledgeSource(root, id, input, () => current(token)); else await disconnectKnowledgeSource(root, id, () => current(token));
      await reload(); return true;
    } catch (error) { if (current(token)) setIssue(productErrorMessage(error)); return false; }
    finally { if (current(token)) { busyRef.current = false; setBusy(null); } }
  }, [root, current, reload]);
  const cancel = () => {
    if (loading || busy === 'reading') { ++epoch.current; stop(); busyRef.current = false; setBusy(null); setLoading(false); setProgress(null); clearDocument(); setManifest(null); manifestRef.current = null; setConnection(null); }
    else taskRef.current?.abort();
  };
  return { connection, bindings, indexed, selectedId, select, edit, clearDocument, manifest, loading, busy, issue, progress, scope, setScope, query, setQuery, filters, setFilters, searchActive, results, searching, document, reading, connect, authorize, scan, cancel, open, download, reload };
}
