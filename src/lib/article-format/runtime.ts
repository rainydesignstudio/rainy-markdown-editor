import { DEFAULT_FORMAT_BUNDLE, enabledFormatRules, compileFormatBundle, packageHostBundle, canonicalFormatJson, freezeFormatBundle, formatFingerprint, type FormatBundle, type RawFormatBundle } from './config';
import type { CssAsset, StylesheetEnvironment } from './styles';
import type { RawFormatter } from './config';
import { ProductError, productErrorMessage, isProductMessage } from '../i18n/productMessages';
import { assertAlgorithmCapabilities, DEFAULT_ALGORITHMS } from './algorithms';
import type { AlgorithmPackage } from './algorithmTypes';
import type { RendererPackage } from './packageContract';
import { DEFAULT_LIBRARY_CONFIGURATION, resolveLibraryConfiguration, assertConfigurationCompatible, type LibraryConfiguration, type ResolvedLibraryConfiguration } from './libraryConfiguration';

export type FormatSnapshot = {
  bundle: FormatBundle; id: string; generation: number; library: string | null;
  source: 'built-in' | 'library' | 'invalid'; error: string | null; officialDefault: boolean;
  loading?: boolean; issue?: ReturnType<typeof productErrorMessage>;
  environment?: StylesheetEnvironment;
  resources?: readonly CssAsset[];
  rawFormatter?: RawFormatter;
  algorithms: AlgorithmPackage;
  algorithmSource: 'built-in' | 'library' | 'legacy';
  configuration?: ResolvedLibraryConfiguration;
  renderer?: RendererPackage;
  rawBundle?: RawFormatBundle;
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
export function activateFormatBundle(bundle: RawFormatBundle, library: string | null, source: 'built-in' | 'library' = 'library', environment?: StylesheetEnvironment, algorithms = DEFAULT_ALGORITHMS, algorithmSource: FormatSnapshot['algorithmSource'] = source === 'library' ? 'legacy' : 'built-in', configuration?: LibraryConfiguration, renderer?: RendererPackage): FormatSnapshot {
  const raw = renderer ? packageHostBundle(bundle) : bundle;
  const frozen = freezeFormatBundle(compileFormatBundle(raw));
  const resolved = freezeFormatBundle(resolveLibraryConfiguration(raw, configuration));
  assertConfigurationCompatible({ bundle: frozen, configuration: resolved, renderer });
  const hash = formatFingerprint({ bundle: frozen, configuration: resolved, renderer: renderer?.fingerprint ?? null });
  assertAlgorithmCapabilities(algorithms, frozen);
  const previous = current.environment;
  // Explicit true and older absent flags denote the same default policy.
  const { enabled, ...meta } = raw.validator.meta;
  const comparable = { ...raw,
    validator: { ...raw.validator, meta: enabled === true ? meta : raw.validator.meta, product: { ...raw.validator.product, theme: {
      ...raw.validator.product.theme, darkTokens: raw.validator.product.theme.darkTokens ?? { allowPartial: true, fallback: 'light' },
    } } },
    formatter: { ...raw.formatter, steps: raw.formatter.steps.map(step => step.operator === 'preview.dark-mode' ? { ...step, parameters: {
      ...step.parameters, mode: step.parameters.mode ?? (step.parameters.transform === 'preserve' ? 'tokens' : 'algorithm'),
    } } : step) },
  };
  current = Object.freeze({ bundle: frozen, configuration: resolved, ...(renderer ? { renderer: freezeFormatBundle(renderer), rawBundle: freezeFormatBundle(bundle) } : {}), id: `${++generation}:${hash}:${algorithms.fingerprint}`, generation, library, source, error: null, rawFormatter: JSON.parse(JSON.stringify(raw.formatter)), algorithms: freezeFormatBundle(algorithms), algorithmSource, officialDefault: !renderer && canonicalFormatJson(comparable) === canonicalFormatJson(DEFAULT_FORMAT_BUNDLE) && canonicalFormatJson(resolved) === canonicalFormatJson(DEFAULT_LIBRARY_CONFIGURATION) && algorithms.fingerprint === DEFAULT_ALGORITHMS.fingerprint, ...(environment ? { environment } : {}) });
  if (previous && previous !== environment) previous.dispose();
  listeners.forEach(listener => listener()); return current;
}
export function invalidateFormatBundle(library: string | null, error: unknown, options: { loading?: boolean } = {}): FormatSnapshot {
  // The known product schema keeps original assets readable; no standards are evaluated as passed.
  current.environment?.dispose();
  const issue = productErrorMessage(error);
  current = Object.freeze({ bundle: seed, configuration: DEFAULT_LIBRARY_CONFIGURATION, id: `${++generation}:invalid`, generation, library, source: 'invalid', error: issue.message, issue, officialDefault: false, algorithms: DEFAULT_ALGORITHMS, algorithmSource: 'built-in', ...(options.loading ? { loading: true } : {}) });
  listeners.forEach(listener => listener()); return current;
}
export function assertFormatReady(snapshot = current): void { if (snapshot.error) { if (isProductMessage(snapshot.issue)) throw new ProductError(snapshot.issue.messageKey, snapshot.issue.messageParams); throw new Error(snapshot.error); } }
export function assertCurrentFormat(snapshot: FormatSnapshot): void { if (snapshot.id !== current.id) throw new ProductError('runtime.formatChanged'); }
export function formatRule(id: string) { return enabledFormatRules(current.bundle).find(rule => rule.id === id); }
export function formatSupportRule(id: string) { return current.bundle.support.rules.find(rule => rule.id === id); }
