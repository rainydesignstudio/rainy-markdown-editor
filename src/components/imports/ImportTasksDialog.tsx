'use client';
import {useUITranslation} from '../global/UILocaleProvider';
import {ContentIcon} from '../global/ContentIcon';
import {importPresentation} from '../../lib/imports/presentation';
import type {PendingMarkdownImport} from '../../hooks/imports/useMarkdownImport';

export function ImportProgressButton({ job, onClick }: { job: PendingMarkdownImport | null; onClick: () => void }) {
  const { t } = useUITranslation('messages');
  if (!job || !job.task.resources.length && job.taskSaved && !job.issues?.length) return null;
  const {task}=job,status=importPresentation(job);
  const count = task.resources.filter(resource => resource.state === 'complete').length;
  return <button type="button" className="status-copy inline-flex items-center gap-2 underline underline-offset-2" data-tone={status.kind==='complete'?'success':'warning'} onClick={onClick} aria-label={t('imports.openTasks')}>
    <ContentIcon name={status.kind==='complete'?'check':status.kind==='running'?'download':'warning'}/>
    {t(!job.taskSaved?'imports.taskNotSaved':status.running?'imports.progress':status.kind==='complete'?'imports.resourcesFinished':'imports.resourcesPaused', { count, total: task.resources.length })}
  </button>;
}
