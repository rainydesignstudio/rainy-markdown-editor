import { ProductError, productReference, productCause, type ProductMessageValue } from '../i18n/productMessages';
import { bool, choice, mapping, number, shape, text, type Guard } from './contracts';
import { validateRendererDeclaration, rendererUsesLibraryPaths, type RendererDeclaration } from './packageContract';
import { resourcePolicyGuards, type ResourcePolicy } from './resourcePaths';

export const LIBRARY_CAPABILITIES = ['articleTheme', 'previewMode', 'algorithm', 'copyRichText', 'exportPackage', 'exportMarkdown', 'exportBody', 'exportPng', 'exportPdf'] as const;
export type LibraryCapability = typeof LIBRARY_CAPABILITIES[number];
export const EXPORT_CAPABILITIES = { package: 'exportPackage', markdown: 'exportMarkdown', body: 'exportBody', png: 'exportPng', pdf: 'exportPdf' } as const;
export type CapabilityDeclaration = { enabled: boolean; reason?: string };
export type CapabilityDeclarations = Partial<Record<LibraryCapability, CapabilityDeclaration>>;
export type LibraryRendering = { styleAuthority?: 'theme' | 'library'; previewMode?: 'user' | 'light' | 'dark'; previewWidth?: 'default' | 'available' };
export type ConfigurationMetadata = { capabilities?: CapabilityDeclarations; rendering?: LibraryRendering };
export type LibraryConfiguration = ConfigurationMetadata & ResourcePolicy & { schemaVersion: 1; meta: { id: string }; renderer?: RendererDeclaration };
export type ResolvedLibraryConfiguration = ResourcePolicy & {
  rendering: { styleAuthority: 'theme' | 'library'; previewMode: 'user' | 'light' | 'dark'; previewWidth?: 'default' | 'available' };
  capabilities: Record<LibraryCapability, CapabilityDeclaration>;
};

export const capabilityDeclarationsGuard = mapping(shape({ enabled: bool }, { reason: text }), choice(...LIBRARY_CAPABILITIES));
export const libraryRenderingGuard = shape({}, { styleAuthority: choice('theme', 'library'), previewMode: choice('user', 'light', 'dark'), previewWidth: choice('default', 'available') });
export const configurationMetadataGuards: Record<string, Guard> = { capabilities: capabilityDeclarationsGuard, rendering: libraryRenderingGuard };

export function validateLibraryConfiguration(value: unknown): LibraryConfiguration {
  const policy = value as LibraryConfiguration;
  shape({ schemaVersion: number(1, 1, true), meta: shape({ id: text }) }, { ...configurationMetadataGuards, ...resourcePolicyGuards, renderer: (renderer, at) => { validateRendererDeclaration(renderer, at, policy); } })(value, 'config.json');
  if (policy.renderer && rendererUsesLibraryPaths(policy.renderer) && policy.capabilities?.exportMarkdown?.enabled === false) throw new ProductError('libraryContract.markdown');
  if (Object.keys(policy.resources?.aliases ?? {}).length && (!policy.renderer || !rendererUsesLibraryPaths(policy.renderer))) throw new ProductError('libraryContract.aliasProtocol');
  return value as LibraryConfiguration;
}

export function resolveLibraryConfiguration(input: {
  support: { meta: { id: string } & ConfigurationMetadata };
  validator: { meta: { id: string } & ConfigurationMetadata };
  formatter: { meta: { id: string } & ConfigurationMetadata };
}, configuration?: LibraryConfiguration): ResolvedLibraryConfiguration {
  if (configuration) {
    validateLibraryConfiguration(configuration);
    if (configuration.meta.id !== input.support.meta.id) throw new ProductError('libraryConfiguration.identity');
  }
  // Metadata restrictions cannot be loosened by the optional application file.
  // Rendering declarations must agree; unlike booleans, conflicting renderers cannot be intersected.
  const declarations = [input.support.meta, input.validator.meta, input.formatter.meta, ...(configuration ? [configuration] : [])];
  const rendering: ResolvedLibraryConfiguration['rendering'] = { styleAuthority: 'theme', previewMode: 'user' };
  for (const key of ['styleAuthority', 'previewMode', 'previewWidth'] as const) {
    const values = declarations.flatMap(item => item.rendering?.[key] === undefined ? [] : [item.rendering[key]]);
    if (new Set(values).size > 1) throw new ProductError('libraryConfiguration.conflict', { field: key });
    if (values.length) Object.assign(rendering, { [key]: values[0] });
  }
  const capabilities = Object.fromEntries(LIBRARY_CAPABILITIES.map(key => {
    const denied = declarations.map(item => item.capabilities?.[key]).filter((item): item is CapabilityDeclaration => item?.enabled === false);
    const reason = [...denied].reverse().find(item => item.reason)?.reason;
    return [key, denied.length ? { enabled: false, ...(reason ? { reason } : {}) } : { enabled: true }];
  })) as ResolvedLibraryConfiguration['capabilities'];
  if (rendering.styleAuthority === 'library') capabilities.articleTheme = { enabled: false, ...(!capabilities.articleTheme.enabled && capabilities.articleTheme.reason ? { reason: capabilities.articleTheme.reason } : {}) };
  if (rendering.previewMode !== 'user') capabilities.previewMode = { enabled: false, ...(!capabilities.previewMode.enabled && capabilities.previewMode.reason ? { reason: capabilities.previewMode.reason } : {}) };
  if (configuration?.renderer && rendererUsesLibraryPaths(configuration.renderer)) capabilities.exportMarkdown = { enabled: true };
  return { rendering, capabilities, ...(configuration?.validation ? { validation: configuration.validation } : {}), ...(configuration?.resources ? { resources: configuration.resources } : {}) };
}

export const DEFAULT_LIBRARY_CONFIGURATION: ResolvedLibraryConfiguration = Object.freeze({
  rendering: Object.freeze({ styleAuthority: 'theme', previewMode: 'user' }),
  capabilities: Object.freeze(Object.fromEntries(LIBRARY_CAPABILITIES.map(key => [key, Object.freeze({ enabled: true })])) as ResolvedLibraryConfiguration['capabilities']),
});

export function validateResolvedLibraryConfiguration(value: unknown): ResolvedLibraryConfiguration {
  const capabilityFields = Object.fromEntries(LIBRARY_CAPABILITIES.map(key => [key, shape({ enabled: bool }, { reason: text })]));
  shape({ rendering: shape({ styleAuthority: choice('theme', 'library'), previewMode: choice('user', 'light', 'dark') }, { previewWidth: choice('default', 'available') }), capabilities: shape(capabilityFields) }, resourcePolicyGuards)(value, 'render.configuration');
  const result = value as ResolvedLibraryConfiguration;
  if (result.rendering.styleAuthority === 'library' && result.capabilities.articleTheme.enabled || result.rendering.previewMode !== 'user' && result.capabilities.previewMode.enabled) throw new ProductError('libraryConfiguration.conflict', { field: 'render.configuration' });
  return result;
}

type ConfigurationSnapshot = { issue?: unknown; renderer?: unknown; configuration?: ResolvedLibraryConfiguration; error?: string | null; bundle?: { formatter: { stylesheets?: unknown; preview: { dark: { mode?: string; transform: string } } }; validator: { meta: { enabled?: boolean }; rules: { enabled: boolean; operator: string }[] } } };
export function assertConfigurationCompatible(snapshot: ConfigurationSnapshot): void {
  const policy = snapshot.configuration ?? DEFAULT_LIBRARY_CONFIGURATION;
  if (!snapshot.renderer && policy.rendering.styleAuthority === 'library' && !snapshot.bundle?.formatter.stylesheets) throw new ProductError('libraryConfiguration.stylesheetsRequired');
  if (!policy.capabilities.algorithm.enabled && snapshot.bundle) {
    const formatter = snapshot.bundle.formatter;
    const automatic = (formatter.preview.dark.mode ?? (formatter.preview.dark.transform === 'preserve' ? 'tokens' : 'algorithm')) === 'algorithm';
    const required = snapshot.bundle.validator.meta.enabled !== false && snapshot.bundle.validator.rules.some(rule => rule.enabled && rule.operator.startsWith('official.dark-'));
    if (automatic || required) throw new ProductError('libraryConfiguration.algorithmRequired');
  }
}

export function libraryCapability(snapshot: ConfigurationSnapshot, key: LibraryCapability): { enabled: boolean; reason: ProductMessageValue } {
  // Source recovery does not execute a broken renderer.
  if (key === 'exportMarkdown' && snapshot.error) return { enabled: true, reason: null };
  if (snapshot.error) return { enabled: false, reason: productCause(snapshot.issue ?? snapshot.error) };
  const policy = snapshot.configuration ?? DEFAULT_LIBRARY_CONFIGURATION;
  const entry = policy.capabilities[key];
  return { enabled: entry.enabled, reason: entry.enabled ? null : entry.reason ?? productReference(key === 'articleTheme' && policy.rendering.styleAuthority === 'library' ? 'libraryConfiguration.libraryStyles' : key === 'previewMode' && policy.rendering.previewMode !== 'user' ? 'libraryConfiguration.fixedPreview' : 'libraryConfiguration.disabled') };
}

export function assertLibraryCapability(snapshot: ConfigurationSnapshot, key: LibraryCapability): void {
  const state = libraryCapability(snapshot, key);
  if (!state.enabled) throw new ProductError('libraryConfiguration.actionDisabled', { action: productReference('libraryConfiguration.actions.' + key), reason: state.reason });
}
