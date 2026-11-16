import { productCause, type ProductMessageValue } from './i18n/productMessages';
import { createVerifiedResourceCache } from './verifiedResourceCache';
import manifest from '../../resources/font-sources.json' with { type: 'json' };
import { fontFileRequest, fontLicenseRequest, getFontSource, subscribeFontSource, type FontFileRequest, type FontSourceId } from './fontSources';

export type FontPreloadState = {
  phase: 'idle' | 'downloading' | 'verifying' | 'preparing' | 'complete' | 'failed' | 'cancelled';
  runId?: number;
  source: FontSourceId | null;
  loaded: number;
  verified: number;
  total: number;
  percent: number | null;
  current: string;
  completedAt: number | null;
  issue: ProductMessageValue | null;
};
const idle: FontPreloadState = { phase: 'idle', runId: 0, source: null, loaded: 0, verified: 0, total: 0, percent: null, current: '', completedAt: null, issue: null };
let state = idle;
let nextRunId = 0;
const listeners = new Set<() => void>();
// Page-memory only. Consumers receive copies; neither a user directory nor persistent storage is touched.
const resourceCache = createVerifiedResourceCache();
let active: { controller: AbortController; source: FontSourceId; promise: Promise<void> } | null = null;
let sourceSubscription: (() => void) | null = null;
export const getFontPreloadState = () => state;
export const getServerFontPreloadState = () => idle;
export function subscribeFontPreload(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(next: FontPreloadState) { state = Object.freeze(next); listeners.forEach(listener => listener()); }

/** Nonblocking cache lookup for future authorized library initialization. A miss keeps the existing fetch path. */
export function readPreloadedFontFile(file: FontFileRequest, source = getFontSource()): ArrayBuffer | null {
  return resourceCache.read(file, source);
}
/** Join an existing preload without starting one. Cancelling this consumer leaves shared work running. */
export function consumePreloadedFontFile(file: FontFileRequest, source = getFontSource(), signal?: AbortSignal): Promise<ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const finish = (bytes: ArrayBuffer | null, cancelled = false) => {
      unsubscribe(); signal?.removeEventListener('abort', check);
      if (cancelled) reject(new DOMException('Font preload consumer cancelled', 'AbortError'));
      else resolve(bytes);
    };
    const check = () => {
      if (signal?.aborted || getFontSource() !== source) { finish(null, true); return; }
      const bytes = readPreloadedFontFile(file, source);
      if (bytes) finish(bytes);
      else if (active?.source !== source || ['complete', 'failed', 'cancelled'].includes(state.phase)) finish(null);
    };
    unsubscribe = subscribeFontPreload(check);
    signal?.addEventListener('abort', check, { once: true });
    check();
  });
}
export function cancelFontPreload() {
  if (!active) return;
  active.controller.abort(); active = null;
  publish({ ...state, phase: 'cancelled', completedAt: null });
}

export function loadPreparedFontFile(file: FontFileRequest, source: FontSourceId, signal?: AbortSignal): Promise<ArrayBuffer> {
  return resourceCache.load(file, source, signal);
}

/** Starts after language confirmation, independently of the visual landing animation. */
export function preloadFonts(retry = false): Promise<void> {
  const source = getFontSource();
  if (!retry && active?.source === source && !active.controller.signal.aborted) return active.promise;
  if (state.source === source && (state.phase === 'complete' || (!retry && (state.phase === 'failed' || state.phase === 'cancelled')))) return Promise.resolve();
  active?.controller.abort();
  if (!sourceSubscription) sourceSubscription = subscribeFontSource(() => { if (getFontSource() !== state.source) void preloadFonts(true); });
  const controller = new AbortController();
  const files = manifest.fonts.flatMap(asset => [fontFileRequest(asset, source), fontLicenseRequest(asset)]).map(file => ({ file, scope: source }));
  const total = files.every(item => Number.isFinite(item.file.size) && item.file.size > 0) ? files.reduce((sum, item) => sum + item.file.size, 0) : 0;
  const progress = files.map(() => ({ loaded: 0, verified: 0 }));
  const job = { controller, source, promise: Promise.resolve() }; active = job;
  publish({ ...idle, phase: 'downloading', runId: ++nextRunId, source, total, percent: total ? 0 : null });
  const currentJob = () => active === job && !controller.signal.aborted && getFontSource() === source;
  const report = (index: number, phase: FontPreloadState['phase']) => {
    if (!currentJob()) return;
    const loaded = progress.reduce((sum, item) => sum + item.loaded, 0), verified = progress.reduce((sum, item) => sum + item.verified, 0);
    publish({ ...state, phase, current: files[index].file.name, loaded, verified, percent: total ? Math.min(99, Math.floor(loaded / total * 100)) : null });
  };
  job.promise = (async () => {
    let failed = false;
    await Promise.allSettled(files.map(async ({ file, scope }, index) => {
      try {
        await resourceCache.load(file, scope, controller.signal, value => { progress[index].loaded = value.loaded; report(index, value.phase); });
        if (!currentJob() || failed) return;
        progress[index] = { loaded: file.size, verified: file.size }; report(index, 'verifying');
      } catch (error) {
        if (!currentJob() || failed) return;
        failed = true;
        publish({ ...state, phase: 'failed', current: file.name, completedAt: null, issue: productCause(error) });
        controller.abort();
      }
    }));
    if (!currentJob() || failed) return;
    publish({ ...state, phase: 'complete', loaded: total, verified: total, percent: 100, current: '', completedAt: Date.now() });
  })().finally(() => { if (active === job) active = null; });
  return job.promise;
}
