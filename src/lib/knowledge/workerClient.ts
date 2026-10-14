import { ProductError } from '../i18n/productMessages';
import type { KnowledgeIndexEngine } from './engine';

export type KnowledgeWorkerMethods = Pick<KnowledgeIndexEngine, 'graph' | 'begin' | 'plan' | 'rank' | 'readText' | 'append' | 'flush' | 'manifest' | 'finalize' | 'search'>;
type WorkerPort = Pick<Worker, 'addEventListener' | 'removeEventListener' | 'postMessage' | 'terminate'>;
export type KnowledgeWorkerFactory = () => WorkerPort;
export function createKnowledgeWorker(factory?: KnowledgeWorkerFactory) {
  if (!factory && typeof Worker === 'undefined') throw new ProductError('knowledge.indexWorkerRequired');
  const worker = factory ? factory() : new Worker(new URL('./index.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void; cleanup: () => void }>();
  let disposed = false;
  const receive = (event: Event) => {
    const response = (event as MessageEvent).data, task = response?.protocol === 1 ? pending.get(response.id) : undefined;
    if (!task) return; pending.delete(response.id); task.cleanup();
    if (response.ok) task.resolve(response.value);
    else task.reject(response.error?.messageKey ? new ProductError(response.error.messageKey, response.error.messageParams) : new ProductError('knowledge.indexInvalid'));
  };
  const stop = (reason: Error) => {
    if (disposed) return; disposed = true;
    for (const task of pending.values()) { task.cleanup(); task.reject(reason); } pending.clear();
    worker.removeEventListener('message', receive); worker.removeEventListener('error', failed); worker.terminate();
  };
  const failed = () => stop(new ProductError('knowledge.indexWorkerFailed'));
  worker.addEventListener('message', receive); worker.addEventListener('error', failed);
  return {
    get closed() { return disposed; },
    request<K extends keyof KnowledgeWorkerMethods>(operation: K, args: Parameters<KnowledgeWorkerMethods[K]>, signal?: AbortSignal): Promise<Awaited<ReturnType<KnowledgeWorkerMethods[K]>>> {
      if (disposed) return Promise.reject(new ProductError('knowledge.changed'));
      if (signal?.aborted) return Promise.reject(new ProductError('knowledge.indexCancelled'));
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => stop(new ProductError('knowledge.indexWorkerFailed')), 30000);
        const abort = () => { const task = pending.get(id); pending.delete(id); task?.cleanup(); reject(new ProductError('knowledge.indexCancelled')); };
        signal?.addEventListener('abort', abort, { once: true });
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject, cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); } });
        try { worker.postMessage({ protocol: 1, id, operation, args }); }
        catch (error) { pending.delete(id); clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(error); }
      });
    },
    dispose() { stop(new ProductError('knowledge.changed')); },
  };
}
export type KnowledgeWorkerClient = ReturnType<typeof createKnowledgeWorker>;
