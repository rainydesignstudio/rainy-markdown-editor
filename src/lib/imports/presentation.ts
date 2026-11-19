import type { ImportTask } from './model';
import type { ProductMessageFields } from '../i18n/productMessages';

type Job = { task: ImportTask; taskSaved: boolean; source: unknown | null; issues?: Array<ProductMessageFields | { message: string }> };

export function importPresentation(job: Job) {
  const { task } = job;
  const completed = task.resources.filter(resource => resource.state === 'complete').length;
  const remaining = task.resources.length - completed;
  const issue = job.issues?.[0] ?? task.resources.find(resource => resource.error)?.error;
  const running = job.taskSaved && Boolean(job.source) && (task.state === 'running' || task.state === 'pending');
  const kind = !job.taskSaved ? 'attention'
    : task.state === 'cancelled' ? 'stopped'
    : running ? 'running'
    : task.state === 'complete' && !issue ? 'complete' : 'attention';
  const status = !job.taskSaved ? 'recordPending' : kind === 'running' ? 'running'
    : kind === 'complete' ? 'imported' : kind === 'stopped' ? 'stopped'
    : remaining ? 'resourcesPending' : 'reviewRequired';
  return { kind, status, completed, remaining, issue, running,
    hasDetails: task.resources.length > 0 || task.diagnostics.length > 0 || Boolean(issue) || !job.taskSaved } as const;
}
