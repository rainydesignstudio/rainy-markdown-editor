'use client';
import { useEffect, useState } from 'react';
import { useUITranslation, useUILocale } from '../global/UILocaleProvider';
import { formatUINumber } from '../../lib/i18n/formatters';
import { formatProductMessage, type ProductMessageFields } from '../../lib/i18n/productMessages';
import type { ImportTask } from '../../lib/imports/model';
import { ButtonBar } from '../global/ButtonBar';
import { DialogFrame, DialogHeader, DialogFooter, DialogActions, DialogButton } from '../global/DialogFrame';

export function ImportProgressButton({ task, onClick }: { task: ImportTask | null; onClick: () => void }) {
  const { t } = useUITranslation('messages');
  if (!task?.resources.length) return null;
  const count = task.resources.filter(resource => resource.state === 'complete').length;
  return <button type="button" className="status-copy underline underline-offset-2" data-tone={task.state === 'complete' ? 'success' : 'warning'} onClick={onClick} aria-label={t('imports.openTasks')}>
    {t(task.state === 'running' || task.state === 'pending' ? 'imports.progress' : task.state === 'complete' ? 'imports.resourcesFinished' : 'imports.resourcesPaused', { count, total: task.resources.length })}
  </button>;
}

export function ImportTasksDialog({ tasks, selectedId, busy, issues, onSelect, onRetry, onPause, onCancel, onChooseSource, onChooseDirectory, onReplace, onClose }: {
  tasks: ImportTask[]; selectedId: string | null; busy: boolean; issues: Array<ProductMessageFields | { message: string }>;
  onSelect: (id: string) => void; onRetry: (id: string) => void; onPause: (id: string) => void; onCancel: (id: string) => void;
  onChooseSource: (id: string) => void; onChooseDirectory: (id: string) => void; onReplace: (id: string, resourceId: string) => void; onClose: () => void;
}) {
  const { t } = useUITranslation('messages'), { locale } = useUILocale();
  const selected = tasks.find(task => task.id === selectedId) ?? tasks[0], [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [selected?.id]);
  const running = selected?.state === 'running' || selected?.state === 'pending', resources = selected?.resources ?? [], pages = Math.max(1, Math.ceil(resources.length / 20));
  return <DialogFrame large wide titleId="import-tasks-title" descriptionId="import-tasks-description" onClose={onClose} dismissible={!busy}>
    <DialogHeader titleId="import-tasks-title" eyebrow={t('imports.eyebrow')} title={t('imports.tasksTitle')} onClose={onClose} closeDisabled={busy} />
    <div className="dialog-content min-h-0 flex-1 content-start overflow-x-clip overflow-y-auto" aria-busy={busy}>
      <p id="import-tasks-description" className="text-sm text-muted">{t('imports.tasksHelp')}</p>
      {issues.map((issue, index) => <p key={index} role="alert" className="status-copy" data-tone="warning">{formatProductMessage(issue, t)}</p>)}
      {selected ? <>
        <label className="field-stack" htmlFor="import-task-select"><span className="field-label">{t('imports.taskLabel')}</span><select id="import-task-select" className="field" value={selected.id} disabled={busy} onChange={event => onSelect(event.target.value)}>{tasks.map(task => <option key={task.id} value={task.id}>{task.target.folder} · {t('imports.states.' + task.state)}</option>)}</select></label>
        <div className="grid min-w-0 gap-2 rounded-lg border border-line bg-list/50 p-4"><p className="break-all text-sm text-primary">{selected.target.articleId}</p><p className="break-all text-xs text-muted">{selected.source.name} · {t('imports.states.' + selected.state)}</p><p className="text-xs text-secondary">{t('imports.progressCount', { count: resources.filter(resource => resource.state === 'complete').length, total: resources.length })}</p></div>
        <ButtonBar label={t('imports.tasksTitle')}>
          <DialogButton disabled={busy || running || selected.state === 'complete'} onClick={() => onRetry(selected.id)}>{t('imports.retry')}</DialogButton>
          <DialogButton disabled={busy || !running} onClick={() => onPause(selected.id)}>{t('imports.pause')}</DialogButton>
          <DialogButton disabled={busy || ['complete', 'cancelled'].includes(selected.state)} onClick={() => onCancel(selected.id)}>{t('imports.cancelTask')}</DialogButton>
          <DialogButton disabled={busy || running} onClick={() => onChooseSource(selected.id)}>{t('imports.reselectSource')}</DialogButton>
          <DialogButton disabled={busy || running} onClick={() => onChooseDirectory(selected.id)}>{t('imports.chooseDirectory')}</DialogButton>
        </ButtonBar>
        <ul className="grid min-w-0 gap-3" aria-label={t('imports.resourcesLabel')}>
          {resources.slice(page * 20, (page + 1) * 20).map(resource => <li key={resource.id} className="grid min-w-0 gap-2 rounded-lg border border-line p-3">
            <p className="break-all text-sm text-primary">{resource.fileName}</p><p className="break-all text-xs text-muted">{resource.source}</p>
            {resource.replacement ? <p className="break-all text-xs text-secondary">{t('imports.replacement', { name: resource.replacement.name })}</p> : null}
            <p className="text-xs text-secondary">{t('imports.states.' + resource.state)} · {t('imports.bytes', { size: formatUINumber(resource.receivedBytes, locale) })}</p>
            {resource.error ? <p className="status-copy" data-tone="error">{formatProductMessage(resource.error, t)}</p> : null}
            {resource.state !== 'complete' ? <ButtonBar label={resource.fileName}><DialogButton disabled={busy || running} onClick={() => onReplace(selected.id, resource.id)}>{t('imports.replaceLocal')}</DialogButton></ButtonBar> : null}
          </li>)}
        </ul>
        {pages > 1 ? <ButtonBar label={t('imports.pages')}><DialogButton disabled={page === 0} onClick={() => setPage(value => value - 1)}>{t('imports.previous')}</DialogButton><span className="text-xs text-muted">{page + 1} / {pages}</span><DialogButton disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)}>{t('imports.next')}</DialogButton></ButtonBar> : null}
        {selected.diagnostics.length ? <p className="status-copy" data-tone="warning">{t('imports.referenceNotice')}</p> : null}
      </> : <p className="text-sm text-muted">{t('imports.noTasks')}</p>}
    </div>
    <DialogFooter><DialogActions><DialogButton disabled={busy} onClick={onClose}>{t('common:actions.close')}</DialogButton></DialogActions></DialogFooter>
  </DialogFrame>;
}
