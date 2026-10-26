'use client';
import { useEffect, useRef, useState } from 'react';
import { restoreKnowledgeSource } from '../../lib/knowledge/source';
import { chooseMarkdownImport, restoreLocalImportSource, knowledgeImportSource, type ReadonlyImportSource } from '../../lib/imports/source';
import { createMarkdownImport } from '../../lib/imports/create';
import { createArticleMutationQueue } from '../../lib/articleMutationQueue';
import { ProductError, productCause, productErrorMessage, productJoin, productLabel, productReference, productText, type ProductMessageFields } from '../../lib/i18n/productMessages';
import type { StoredArticle, ThemeConfig } from '../../lib/types';
import type { ImportTask, ImportResource } from '../../lib/imports/model';
import { beginResourceSession, publishResourceTasks } from '../../lib/resources/state';
import { runImportResources } from '../../lib/imports/runner';
import { createImportTaskRecord, importRecordGuard, loadImportTaskRecords, saveImportTaskRecord } from '../../lib/imports/store';
import { chooseImportReplacement, unavailableImportSource } from '../../lib/imports/recovery';

type Request = { id: number; root: FileSystemDirectoryHandle; session: number; mode: 'local' | 'knowledge'; source: ReadonlyImportSource | null };
export type PendingMarkdownImport = { root: FileSystemDirectoryHandle; session: number; source: ReadonlyImportSource | null; task: ImportTask; taskSaved: boolean };
type Bridge = {
  root: FileSystemDirectoryHandle | null; session: number;
  isCurrent: (root: FileSystemDirectoryHandle, session: number) => boolean;
  protect: (action: { label: string; run: () => void | Promise<void> }) => void;
  queue: ReturnType<typeof createArticleMutationQueue>;
  onCreated: (stored: StoredArticle, root: FileSystemDirectoryHandle) => Promise<boolean>;
  setStatus: (status: { label: string; tone: 'neutral' | 'success' | 'warning' | 'error' }) => void;
  canWriteArticle: (root: FileSystemDirectoryHandle, articleId: string) => boolean;
  onResource: (root: FileSystemDirectoryHandle, articleId: string, resource: ImportResource) => void;
  onTaskFinished: (root: FileSystemDirectoryHandle) => void;
};

export function useMarkdownImport(bridge: Bridge) {
  const latest = useRef(bridge); latest.current = bridge;
  const [request, setRequest] = useState<Request | null>(null), requestRef = useRef<Request | null>(null);
  const [busy, setBusy] = useState(false), busyRef = useRef(false), serial = useRef(0);
  const [feedback, setFeedback] = useState<ProductMessageFields | { message: string } | null>(null);
  const [pending, setPending] = useState<PendingMarkdownImport[]>([]);
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const [tasksOpen, setTasksOpen] = useState(false), [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const tasksScope = useRef<{ root: FileSystemDirectoryHandle | null; session: number } | null>(null);
  const [taskBusy, setTaskBusy] = useState(false), taskBusyRef = useRef(false);
  const [taskIssues, setTaskIssues] = useState<Array<ProductMessageFields | { message: string }>>([]);
  const running = useRef<{ id: string; abort: AbortController } | null>(null);
  const replace = (next: Request | null) => { requestRef.current = next; setRequest(next); };
  const alive = (scope: Pick<Request, 'root' | 'session'>) => latest.current.isCurrent(scope.root, scope.session);
  useEffect(() => {
    if (requestRef.current && !alive(requestRef.current)) replace(null);
    setPending(items => items.filter(item => alive(item)));
  }, [bridge.root, bridge.session]);
  useEffect(() => {
    setTasksOpen(false); setSelectedTaskId(null); setTaskIssues([]);
    if (!bridge.root) return;
    beginResourceSession(bridge.root, bridge.session);
    const scope = { root: bridge.root, session: bridge.session }; let cancelled = false;
    void loadImportTaskRecords(scope.root, () => !cancelled && alive(scope)).then(result => {
      if (cancelled || !alive(scope)) return;
      setTaskIssues(result.issues);
      publishResourceTasks(scope.root, [...result.tasks, ...pendingRef.current.filter(item => alive(item)).map(item => item.task)]);
      setPending(items => [...items.filter(item => alive(item)), ...result.tasks.filter(task => !items.some(item => alive(item) && item.task.id === task.id)).map(task => ({ ...scope, source: null, task, taskSaved: true }))]);
    }).catch(error => { if (!cancelled && alive(scope)) setTaskIssues([productErrorMessage(error)]); });
    return () => { cancelled = true; };
  }, [bridge.root, bridge.session]);
  useEffect(() => { if (bridge.root) publishResourceTasks(bridge.root, pending.filter(item => alive(item)).map(item => item.task), false); }, [pending, bridge.root, bridge.session]);
  useEffect(() => () => { running.current?.abort.abort(new ProductError('imports.changed')); running.current = null; }, [bridge.root, bridge.session]);
  useEffect(() => {
    if (running.current) return;
    const job = pending.find(item => item.source && item.taskSaved && item.task.state === 'pending' && alive(item));
    if (!job) return;
    const active = { id: job.task.id, abort: new AbortController() }; running.current = active;
    const current = () => alive(job) && latest.current.canWriteArticle(job.root, job.task.target.articleId);
    void runImportResources(job.root, job.source!, job.task, current, {
      signal: active.abort.signal,
      onChange: task => { if (alive(job)) setPending(items => items.map(item => item.task.id === task.id ? { ...item, task } : item)); },
      onResource: resource => { if (current()) latest.current.onResource(job.root, job.task.target.articleId, resource); },
    }).then(({ task, diskError }) => {
      if (!alive(job)) return;
      if (diskError) setTaskIssues([diskError]);
      latest.current.onTaskFinished(job.root);
    }).catch(error => { if (alive(job)) latest.current.setStatus({ label: productText('imports.resourcesFailed', { cause: productCause(error) }), tone: 'error' }); })
      .finally(() => { if (running.current === active) { running.current = null; setPending(items => [...items]); } });
  }, [pending, bridge.root, bridge.session]);
  const close = () => { if (!busyRef.current) replace(null); };
  const open = (mode: Request['mode'], path?: string, sourceId?: string) => {
    if (!bridge.root || busyRef.current) return;
    const scope = { root: bridge.root, session: bridge.session };
    bridge.protect({ label: productText('imports.importAction'), run: async () => {
      if (!alive(scope)) return;
      const next: Request = { ...scope, id: ++serial.current, mode, source: null }; replace(next); setFeedback(null);
      if (mode !== 'knowledge') return;
      busyRef.current = true; setBusy(true);
      try {
        const restored = await restoreKnowledgeSource(scope.root, undefined, () => alive(scope), sourceId);
        if (restored.status !== 'ready' || !restored.source || restored.binding?.sourceId !== sourceId || !path) throw new ProductError('imports.sourceRequired');
        const source = await knowledgeImportSource(restored.source, path);
        if (requestRef.current === next && alive(scope)) replace({ ...next, source });
      } catch (error) { if (requestRef.current === next && alive(scope)) setFeedback(productErrorMessage(error)); }
      finally { busyRef.current = false; setBusy(false); }
    } });
  };
  const chooseFile = async () => {
    const current = requestRef.current; if (!current || busyRef.current) return;
    busyRef.current = true; setBusy(true); setFeedback(null);
    try {
      const source = await chooseMarkdownImport(() => alive(current));
      if (source && requestRef.current === current && alive(current)) replace({ ...current, source });
    } catch (error) { if (requestRef.current === current && alive(current)) setFeedback(productErrorMessage(error)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const chooseDirectory = async () => {
    const current = requestRef.current; if (!current?.source?.chooseDirectory || busyRef.current) return;
    busyRef.current = true; setBusy(true); setFeedback(null);
    try {
      const source = await current.source.chooseDirectory();
      if (source && requestRef.current === current && alive(current)) replace({ ...current, source });
    } catch (error) { if (requestRef.current === current && alive(current)) setFeedback(productErrorMessage(error)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const confirm = async (theme: ThemeConfig) => {
    const current = requestRef.current; if (!current?.source || busyRef.current) return;
    const source = current.source, selectedTheme = structuredClone(theme);
    busyRef.current = true; setBusy(true); setFeedback(null);
    try {
      const created = await bridge.queue.run(() => createMarkdownImport(current.root, source, selectedTheme, () => requestRef.current === current && alive(current)));
      if (!alive(current)) return;
      try { if (created.taskSaved) await source.remember?.(created.task.id, current.root); }
      catch { created.taskIssue = productErrorMessage(new ProductError('imports.bookmarkFailed')); }
      setPending(items => [...items, { root: current.root, session: current.session, source, task: created.task, taskSaved: created.taskSaved }]);
      replace(null);
      if (!await latest.current.onCreated(created.result.article, current.root) || !alive(current)) return;
      const warnings = created.result.indexError || created.taskIssue || created.task.diagnostics.length > 0;
      latest.current.setStatus({ ...productLabel('shared.compose', { parts: productJoin([
        productReference('imports.created', { title: created.result.article.parse.metadata.title }),
        ...(created.taskSaved ? [] : [productReference('imports.taskNotSaved')]),
        ...(created.result.indexError ? [created.result.indexError] : []),
        ...(created.taskIssue ? ['messageKey' in created.taskIssue ? created.taskIssue : created.taskIssue.message] : []),
        ...(created.task.diagnostics.length ? [productReference('imports.referenceNotice')] : []),
      ], '；') }), tone: warnings || created.task.resources.length ? 'warning' : 'success' });
    } catch (error) { if (requestRef.current === current && alive(current)) setFeedback(productErrorMessage(error)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const openTasks = (articleId?: string) => { tasksScope.current = { root: bridge.root, session: bridge.session }; setSelectedTaskId(pendingRef.current.find(item => alive(item) && (!articleId || item.task.target.articleId === articleId))?.task.id ?? null); setTasksOpen(true); };
  const taskAction = async (id: string, action: (job: PendingMarkdownImport) => Promise<void>) => {
    const job = pendingRef.current.find(item => item.task.id === id && alive(item)); if (!job || taskBusyRef.current) return;
    taskBusyRef.current = true; setTaskBusy(true); setTaskIssues([]);
    try { await action(job); } catch (error) { if (alive(job)) setTaskIssues([productErrorMessage(error)]); }
    finally { taskBusyRef.current = false; setTaskBusy(false); }
  };
  const resolveSource = async (job: PendingMarkdownImport) => {
    if (job.source) { await job.source.assertCurrent(); return job.source; }
    const local = await restoreLocalImportSource(job.task.id, job.root, job.task.source, () => alive(job), true);
    if (local) return local;
    if (job.task.source.kind === 'knowledge') {
      const restored = await restoreKnowledgeSource(job.root, undefined, () => alive(job), job.task.source.sourceId);
      if (restored.binding?.sourceId !== job.task.source.sourceId) throw new ProductError('imports.sourceRequired');
      if (restored.status === 'needs-permission' && restored.source) await restored.source.requestReadPermission();
      if (restored.source) { const source = await knowledgeImportSource(restored.source, job.task.source.path); if (source.origin.hash !== job.task.source.hash) throw new ProductError('imports.sourceChanged'); return source; }
    }
    return unavailableImportSource(job.task, () => alive(job));
  };
  const queueRetry = async (job: PendingMarkdownImport, source: ReadonlyImportSource, onlyResource?: string, replacement?: { name: string; size: number; modified: number }) => {
    if (!alive(job) || running.current?.id === job.task.id) return;
    const task = structuredClone(job.task); task.state = 'pending';
    for (const resource of task.resources) if (resource.state !== 'complete' && (!onlyResource || resource.id === onlyResource)) { resource.state = 'pending'; resource.receivedBytes = 0; delete resource.error; }
    if (onlyResource && replacement) task.resources.find(resource => resource.id === onlyResource)!.replacement = replacement;
    const guard = importRecordGuard(job.root, () => alive(job));
    if (job.taskSaved) await saveImportTaskRecord(job.root, task, guard); else await createImportTaskRecord(job.root, task, guard);
    if (!alive(job)) return;
    setPending(items => items.map(item => item.task.id === job.task.id ? { ...item, source, task, taskSaved: true } : item));
  };
  const retryTask = (id: string) => taskAction(id, async job => { await queueRetry(job, await resolveSource(job)); });
  const chooseTaskSource = (id: string) => taskAction(id, async job => {
    const source = await chooseMarkdownImport(() => alive(job)); if (!source) return;
    if (source.origin.hash !== job.task.source.hash) throw new ProductError('imports.sourceChanged');
    await source.remember?.(job.task.id, job.root); if (!alive(job)) return;
    setPending(items => items.map(item => item.task.id === id ? { ...item, source } : item));
  });
  const chooseTaskDirectory = (id: string) => taskAction(id, async job => {
    const source = await resolveSource(job); if (!source.chooseDirectory) throw new ProductError('imports.sourceRequired');
    const chosen = await source.chooseDirectory(); if (!chosen) return; await chosen.remember?.(job.task.id, job.root);
    if (alive(job)) setPending(items => items.map(item => item.task.id === id ? { ...item, source: chosen } : item));
  });
  const replaceResource = (id: string, resourceId: string) => taskAction(id, async job => {
    const resource = job.task.resources.find(item => item.id === resourceId); if (!resource || resource.state === 'complete') return;
    const replacement = await chooseImportReplacement(job.root, job.task, resource, () => alive(job));
    if (replacement) await queueRetry(job, job.source ?? unavailableImportSource(job.task, () => alive(job)), resourceId, replacement);
  });
  const stopTask = (id: string, cancel: boolean) => {
    const job = pendingRef.current.find(item => item.task.id === id && alive(item)); if (!job) return;
    if (running.current?.id === id) { running.current.abort.abort(new ProductError(cancel ? 'imports.cancelled' : 'imports.paused')); return; }
    const task = structuredClone(job.task); task.state = cancel ? 'cancelled' : 'paused';
    for (const resource of task.resources) if (resource.state !== 'complete') resource.state = cancel ? 'cancelled' : 'pending';
    setPending(items => items.map(item => item.task.id === id ? { ...item, task } : item));
    if (job.taskSaved) void saveImportTaskRecord(job.root, task, importRecordGuard(job.root, () => alive(job))).catch(error => { if (alive(job)) setTaskIssues([productErrorMessage(error)]); });
  };
  const cancelArticle = (root: FileSystemDirectoryHandle, articleId: string) => {
    for (const job of pendingRef.current) if (job.root === root && job.task.target.articleId === articleId && !['complete', 'cancelled'].includes(job.task.state)) {
      stopTask(job.task.id, true);
      const task = structuredClone(job.task); task.state = 'cancelled';
      for (const resource of task.resources) if (resource.state !== 'complete') resource.state = 'cancelled';
      setPending(items => items.map(item => item.task.id === task.id ? { ...item, task } : item));
      if (job.taskSaved) void saveImportTaskRecord(root, task, importRecordGuard(root, () => alive(job))).catch(error => { if (alive(job)) setTaskIssues([productErrorMessage(error)]); });
    }
  };
  return { request, busy, feedback, pending: pending.filter(item => alive(item)), setPending, close, chooseFile, chooseDirectory, confirm, open: () => open('local'), openKnowledge: (path: string, sourceId: string) => open('knowledge', path, sourceId),
    tasksOpen: tasksOpen && tasksScope.current?.root === bridge.root && tasksScope.current.session === bridge.session, selectedTaskId, setSelectedTaskId, taskBusy, taskIssues, openTasks, closeTasks: () => { if (!taskBusyRef.current) setTasksOpen(false); }, retryTask, chooseTaskSource, chooseTaskDirectory, replaceResource,
    pauseTask: (id: string) => stopTask(id, false), cancelTask: (id: string) => stopTask(id, true), cancelArticle,
    articleFolderIsBusy: (root: FileSystemDirectoryHandle, id: string) => pendingRef.current.some(job => job.root === root && job.task.target.articleId === id && !['complete', 'cancelled'].includes(job.task.state)),
    articleFolderMoved: (root: FileSystemDirectoryHandle, id: string, folder: string) => setPending(items => items.map(job => job.root === root && job.task.target.articleId === id ? { ...job, task: { ...job.task, target: { ...job.task.target, folder, articleId: `${job.task.target.month}/${folder}` } } } : job)),
  };
}
