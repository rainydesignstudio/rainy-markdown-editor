import { DEFAULT_FORMAT_BUNDLE, enabledFormatRules, compileFormatBundle, canonicalFormatJson, freezeFormatBundle, formatFingerprint, type FormatBundle, type RawFormatBundle } from './config';
import type { StylesheetEnvironment } from './styles';
import type { RawFormatter } from './config';
import { ProductError } from '../i18n/productMessages';
import { assertAlgorithmCapabilities, DEFAULT_ALGORITHMS } from './algorithms';
import type { AlgorithmPackage } from './algorithmTypes';
import { DEFAULT_LIBRARY_CONFIGURATION, resolveLibraryConfiguration, assertConfigurationCompatible, type LibraryConfiguration, type ResolvedLibraryConfiguration } from './libraryConfiguration';

export type FormatSnapshot = {
  bundle: FormatBundle; id: string; generation: number; library: string | null;
  source: 'built-in' | 'library' | 'invalid'; error: string | null; officialDefault: boolean;
  loading?: boolean;
  environment?: StylesheetEnvironment;
  rawFormatter?: RawFormatter;
  algorithms: AlgorithmPackage;
  algorithmSource: 'built-in' | 'library' | 'legacy';
  configuration?: ResolvedLibraryConfiguration;
};
const seed = freezeFormatBundle(compileFormatBundle(DEFAULT_FORMAT_BUNDLE));
const seedHash = formatFingerprint(seed);
let generation = 0;
const initial: FormatSnapshot = Object.freeze({ bundle: seed, id: `boot:${seedHash}:${DEFAULT_ALGORITHMS.fingerprint}`, generation: 0, library: null, source: 'built-in', error: null, rawFormatter: DEFAULT_FORMAT_BUNDLE.formatter, officialDefault: true, algorithms: DEFAULT_ALGORITHMS, algorithmSource: 'built-in', configuration: DEFAULT_LIBRARY_CONFIGURATION });
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
export function activateFormatBundle(bundle: RawFormatBundle, library: string | null, source: 'built-in' | 'library' = 'library', environment?: StylesheetEnvironment, algorithms = DEFAULT_ALGORITHMS, algorithmSource: FormatSnapshot['algorithmSource'] = source === 'library' ? 'legacy' : 'built-in', configuration?: LibraryConfiguration): FormatSnapshot {
  const frozen = freezeFormatBundle(compileFormatBundle(bundle));
  const resolved = freezeFormatBundle(resolveLibraryConfiguration(bundle, configuration));
  assertConfigurationCompatible({ bundle: frozen, configuration: resolved });
  const hash = formatFingerprint({ bundle: frozen, configuration: resolved });
  assertAlgorithmCapabilities(algorithms, frozen);
  const previous = current.environment;
  // Explicit true and older absent flags denote the same default policy.
  const { enabled, ...meta } = bundle.validator.meta;
  const comparable = { ...bundle,
    validator: { ...bundle.validator, meta: enabled === true ? meta : bundle.validator.meta, product: { ...bundle.validator.product, theme: {
      ...bundle.validator.product.theme, darkTokens: bundle.validator.product.theme.darkTokens ?? { allowPartial: true, fallback: 'light' },
    } } },
    formatter: { ...bundle.formatter, steps: bundle.formatter.steps.map(step => step.operator === 'preview.dark-mode' ? { ...step, parameters: {
      ...step.parameters, mode: step.parameters.mode ?? (step.parameters.transform === 'preserve' ? 'tokens' : 'algorithm'),
    } } : step) },
  };
  current = Object.freeze({ bundle: frozen, configuration: resolved, id: `${++generation}:${hash}:${algorithms.fingerprint}`, generation, library, source, error: null, rawFormatter: JSON.parse(JSON.stringify(bundle.formatter)), algorithms: freezeFormatBundle(algorithms), algorithmSource, officialDefault: canonicalFormatJson(comparable) === canonicalFormatJson(DEFAULT_FORMAT_BUNDLE) && canonicalFormatJson(resolved) === canonicalFormatJson(DEFAULT_LIBRARY_CONFIGURATION) && algorithms.fingerprint === DEFAULT_ALGORITHMS.fingerprint, ...(environment ? { environment } : {}) });
  if (previous && previous !== environment) previous.dispose();
  listeners.forEach(listener => listener()); return current;
}
export function invalidateFormatBundle(library: string | null, error: string, options: { loading?: boolean } = {}): FormatSnapshot {
  // The known product schema keeps original assets readable; no standards are evaluated as passed.
  current.environment?.dispose();
  current = Object.freeze({ bundle: seed, configuration: DEFAULT_LIBRARY_CONFIGURATION, id: `${++generation}:invalid`, generation, library, source: 'invalid', error, officialDefault: false, algorithms: DEFAULT_ALGORITHMS, algorithmSource: 'built-in', ...(options.loading ? { loading: true } : {}) });
  listeners.forEach(listener => listener()); return current;
}
export function assertFormatReady(snapshot = current): void { if (snapshot.error) throw new Error(snapshot.error); }
export function assertCurrentFormat(snapshot: FormatSnapshot): void { if (snapshot.id !== current.id) throw new ProductError('runtime.formatChanged'); }
export function formatRule(id: string) { return enabledFormatRules(current.bundle).find(rule => rule.id === id); }
export function formatSupportRule(id: string) { return current.bundle.support.rules.find(rule => rule.id === id); }
