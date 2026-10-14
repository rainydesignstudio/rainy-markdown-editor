import { DEFAULT_FORMAT_BUNDLE, compileFormatBundle, canonicalFormatJson, freezeFormatBundle, formatFingerprint, type FormatBundle, type RawFormatBundle } from './config';
import type { StylesheetEnvironment } from './styles';
import type { RawFormatter } from './config';
import { ProductError } from '../i18n/productMessages';

export type FormatSnapshot = {
  bundle: FormatBundle; id: string; generation: number; library: string | null;
  source: 'built-in' | 'library' | 'invalid'; error: string | null; officialDefault: boolean;
  loading?: boolean;
  environment?: StylesheetEnvironment;
  rawFormatter?: RawFormatter;
};
const seed = freezeFormatBundle(compileFormatBundle(DEFAULT_FORMAT_BUNDLE));
const seedHash = formatFingerprint(seed);
let generation = 0;
const initial: FormatSnapshot = Object.freeze({ bundle: seed, id: `boot:${seedHash}`, generation: 0, library: null, source: 'built-in', error: null, rawFormatter: DEFAULT_FORMAT_BUNDLE.formatter, officialDefault: true });
let current = initial;
const listeners = new Set<() => void>();
export function getFormatSnapshot(): FormatSnapshot { return current; }
const renderSnapshots = new WeakMap<HTMLElement, FormatSnapshot>();
export function bindArticleRenderSnapshot(element: HTMLElement, snapshot: FormatSnapshot) { renderSnapshots.set(element, snapshot); }
export function getArticleRenderSnapshot(element: HTMLElement): FormatSnapshot {
  const snapshot = renderSnapshots.get(element) ?? current;
  assertCurrentFormat(snapshot); return snapshot;
}
export function getInitialFormatSnapshot(): FormatSnapshot { return initial; }
export function subscribeFormatSnapshot(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function activateFormatBundle(bundle: RawFormatBundle, library: string | null, source: 'built-in' | 'library' = 'library', environment?: StylesheetEnvironment): FormatSnapshot {
  const frozen = freezeFormatBundle(compileFormatBundle(bundle)); const hash = formatFingerprint(frozen);
  const previous = current.environment;
  current = Object.freeze({ bundle: frozen, id: `${++generation}:${hash}`, generation, library, source, error: null, rawFormatter: JSON.parse(JSON.stringify(bundle.formatter)), officialDefault: canonicalFormatJson(bundle) === canonicalFormatJson(DEFAULT_FORMAT_BUNDLE), ...(environment ? { environment } : {}) });
  if (previous && previous !== environment) previous.dispose();
  listeners.forEach(listener => listener()); return current;
}
export function invalidateFormatBundle(library: string | null, error: string, options: { loading?: boolean } = {}): FormatSnapshot {
  // The known product schema keeps original assets readable; no standards are evaluated as passed.
  current.environment?.dispose();
  current = Object.freeze({ bundle: seed, id: `${++generation}:invalid`, generation, library, source: 'invalid', error, officialDefault: false, ...(options.loading ? { loading: true } : {}) });
  listeners.forEach(listener => listener()); return current;
}
export function assertFormatReady(snapshot = current): void { if (snapshot.error) throw new Error(snapshot.error); }
export function assertCurrentFormat(snapshot: FormatSnapshot): void { if (snapshot.id !== current.id) throw new ProductError('runtime.formatChanged'); }
export function formatRule(id: string) { return current.bundle.validator.rules.find(rule => rule.id === id && rule.enabled); }
export function formatSupportRule(id: string) { return current.bundle.support.rules.find(rule => rule.id === id); }
