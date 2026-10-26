import { readRendererPackage, rendererPolicy, rendererFilePath, type RendererPackage } from './package';
import { ProductError, productCause, productMessage, type ProductMessageInfo } from "../i18n/productMessages";
import { DEFAULT_FORMAT_BUNDLE, canonicalFormatJson, validateFormatBundle, compileFormatBundle, packageHostBundle, freezeFormatBundle, type RawFormatBundle } from './config';
import emptySupport from '../../../resources/presets/platform/empty/format/format-support.json' with { type: 'json' };
import emptyValidator from '../../../resources/presets/platform/empty/format/validator.json' with { type: 'json' };
import emptyFormatter from '../../../resources/presets/platform/empty/format/formatter.json' with { type: 'json' };
import emptyAlgorithms from '../../../resources/presets/platform/empty/algorithms.generated.json' with { type: 'json' };
import { activateFormatBundle, invalidateFormatBundle, type FormatSnapshot } from './runtime';
import { loadStylesheetEnvironment, type StylesheetEnvironment } from './styles';
import { DEFAULT_ALGORITHMS, readLibraryAlgorithms } from './algorithms';
import type { AlgorithmPackage } from './algorithmTypes';
import { validateLibraryConfiguration, resolveLibraryConfiguration, assertConfigurationCompatible, type LibraryConfiguration } from './libraryConfiguration';

export const FORMAT_FILES = ['format-support.json', 'validator.json', 'formatter.json'] as const;
// Explicit public catalog: private sibling presets are never discovered or bundled.
export const PUBLIC_PLATFORM_PRESETS = [
  { id: 'wechat-article', contentSeed: 'rich', bundle: DEFAULT_FORMAT_BUNDLE, algorithms: DEFAULT_ALGORITHMS },
  { id: 'empty', contentSeed: 'markdown', bundle: freezeFormatBundle({ support: emptySupport, validator: emptyValidator, formatter: emptyFormatter }) as RawFormatBundle, algorithms: freezeFormatBundle(emptyAlgorithms as AlgorithmPackage) },
] as const;
export type PlatformPresetId = (typeof PUBLIC_PLATFORM_PRESETS)[number]['id'];
export const DEFAULT_PLATFORM_PRESET_ID = PUBLIC_PLATFORM_PRESETS[0].id;
export function getPublicPlatformPreset(id: string) {
  const preset = PUBLIC_PLATFORM_PRESETS.find(preset => preset.id === id);
  if (!preset) throw new ProductError('library.unknownPlatformPreset', { id });
  return preset;
}
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
export type FormatLibraryResult = { bundle: RawFormatBundle | null; source: 'built-in' | 'library' | 'invalid'; message: string | null; configuration?: LibraryConfiguration } & Partial<ProductMessageInfo>;
export async function readLibraryFormat(root: FileSystemDirectoryHandle): Promise<FormatLibraryResult> {
  let directory: FileSystemDirectoryHandle;
  try { directory = await root.getDirectoryHandle('format'); }
  catch (error) { if (missing(error)) return { bundle: DEFAULT_FORMAT_BUNDLE, source: 'built-in', ...productMessage("library.theLibraryHasNoFormatDirectoryTheBuiltInDefaultConfigurationIs") }; throw error; }
  let configuration: LibraryConfiguration | undefined;
  try {
    const file = await (await directory.getFileHandle('config.json')).getFile();
    if (file.size > 1_000_000) throw new ProductError('library.exceedsTheSizeLimit', { name: 'config.json' });
    configuration = validateLibraryConfiguration(JSON.parse(await file.text()));
  } catch (error) {
    if (!missing(error)) return { bundle: null, source: 'invalid', ...productMessage('library.theLibraryFormatConfigurationIsUnavailable', { cause: productCause(error) }) };
  }
  const texts: (string | null)[] = [];
  for (const name of FORMAT_FILES) {
    try { const file = await (await directory.getFileHandle(name)).getFile(); if (file.size > 1_000_000) throw new ProductError("library.exceedsTheSizeLimit", { "name": name }); texts.push(await file.text()); }
    catch (error) { if (missing(error)) texts.push(null); else throw error; }
  }
  if (texts.every(value => value === null)) {
    if (configuration) return { bundle: null, source: 'invalid', ...productMessage('library.theFormatTrioIsIncompleteMissingRepairOrMigrateItFirstDefault', { details: FORMAT_FILES.join('、') }) };
    try {
      await directory.getDirectoryHandle('algorithms');
      return { bundle: null, source: 'invalid', ...productMessage("library.theFormatTrioIsIncompleteMissingRepairOrMigrateItFirstDefault", { details: FORMAT_FILES.join('、') }) };
    } catch (error) { if (!missing(error)) throw error; }
    return { bundle: DEFAULT_FORMAT_BUNDLE, source: 'built-in', ...productMessage("library.theFormatDirectoryIsEmptyTheBuiltInDefaultConfigurationIsBeing") };
  }
  if (texts.some(value => value === null)) return { bundle: null, source: 'invalid', ...productMessage("library.theFormatTrioIsIncompleteMissingRepairOrMigrateItFirstDefault", { "details": FORMAT_FILES.filter((_, i) => texts[i] === null).join('、') }) };
  try {
    const [support, validator, formatter] = texts.map(value => JSON.parse(value!));
    const raw = { support, validator, formatter };
    const bundle = configuration?.renderer ? (packageHostBundle(raw), raw) : validateFormatBundle(raw);
    const hostBundle = configuration?.renderer ? packageHostBundle(bundle) : bundle;
    const resolved = resolveLibraryConfiguration(hostBundle, configuration);
    assertConfigurationCompatible({ bundle: compileFormatBundle(hostBundle), configuration: resolved, renderer: configuration?.renderer });
    return { bundle, source: 'library', message: null, ...(configuration ? { configuration } : {}) };
  } catch (error) { return { bundle: null, source: 'invalid', ...productMessage("library.theLibraryFormatConfigurationIsUnavailable", { "cause": productCause(error) }) }; }
}
export async function activateLibraryFormat(root: FileSystemDirectoryHandle, isCurrent: () => boolean): Promise<{ snapshot: FormatSnapshot | null; message: string | null }> {
  const result = await readLibraryFormat(root);
  if (!isCurrent()) return { snapshot: null, message: null };
  let environment: StylesheetEnvironment | undefined;
  let algorithms: AlgorithmPackage = DEFAULT_ALGORITHMS;
  let algorithmSource: FormatSnapshot['algorithmSource'] = 'built-in';
  let message = result.message;
  let renderer: RendererPackage | undefined;
  if (result.bundle) {
    try {
      const compiled = compileFormatBundle(result.configuration?.renderer ? packageHostBundle(result.bundle) : result.bundle);
      if (result.configuration?.renderer) {
        algorithms = freezeFormatBundle(emptyAlgorithms as AlgorithmPackage); algorithmSource = 'library';
      } else if (result.source === 'library') {
        const loaded = await readLibraryAlgorithms(root, compiled, result.configuration);
        algorithms = loaded.algorithms; algorithmSource = loaded.source;
        message = [message, loaded.message].filter(Boolean).join('；') || null;
      }
      if (!isCurrent()) return { snapshot: null, message: null };
      if (result.configuration?.renderer) {
        renderer = await readRendererPackage(root, result.configuration.renderer, result.configuration);
        if (canonicalFormatJson(rendererPolicy(renderer)) !== canonicalFormatJson(result.bundle)) throw new Error('Format policies changed while loading');
        const latest = await (await (await root.getDirectoryHandle('format')).getFileHandle('config.json')).getFile();
        if (canonicalFormatJson(validateLibraryConfiguration(JSON.parse(await latest.text()))) !== canonicalFormatJson(result.configuration)) throw new ProductError('libraryCss.changed');
      }
      const policy = compiled.formatter.stylesheets;
      if (policy) environment = await loadStylesheetEnvironment(root, policy);
    } catch (error) {
      if (!isCurrent()) return { snapshot: null, message: null };
      const message = error instanceof Error ? error.message : String(error);
      return { snapshot: invalidateFormatBundle(root.name, error), message };
    }
  }
  if (!isCurrent()) { environment?.dispose(); return { snapshot: null, message: null }; }
  const snapshot = result.bundle ? activateFormatBundle(result.bundle, root.name, result.source === 'library' ? 'library' : 'built-in', environment, algorithms, algorithmSource, result.configuration, renderer) : invalidateFormatBundle(root.name, result);
  return { snapshot, message };
}
export async function initializeLibraryFormat(root: FileSystemDirectoryHandle, presetId: string = DEFAULT_PLATFORM_PRESET_ID): Promise<void> {
  const preset = getPublicPlatformPreset(presetId);
  // Initialization is additive. Existing or partial configurations require an explicit repair.
  const directory = await root.getDirectoryHandle('format', { create: true });
  try { await directory.getFileHandle('config.json'); return; } catch (error) { if (!missing(error)) throw error; }
  for (const name of FORMAT_FILES) {
    try { await directory.getFileHandle(name); return; } catch (error) { if (!missing(error)) throw error; }
  }
  try { await directory.getDirectoryHandle('algorithms'); throw new ProductError('algorithms.existingDirectory'); }
  catch (error) { if (!missing(error)) throw error; }
  const catalog = (await import('../../../resources/presets/platform/renderers.generated.json', { with: { type: 'json' } })).default;
  const renderer = catalog[preset.id];
  for (const [path, source] of Object.entries(renderer.files)) {
    let target = root; const parts = rendererFilePath(renderer.declaration as RendererPackage['declaration'], path).split('/');
    for (const part of parts.slice(0, -1)) target = await target.getDirectoryHandle(part, { create: true });
    const stream = await (await target.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
    try { await stream.write(source); await stream.close(); } catch (error) { try { await stream.abort(); } catch { /* original error */ } throw error; }
  }
  const stream = await (await directory.getFileHandle('config.json', { create: true })).createWritable();
  try { await stream.write(JSON.stringify({ schemaVersion: 1, meta: { id: preset.bundle.support.meta.id }, validation: { verifySha256: true }, resources: { aliases: { '@styles/': 'styles/', '@assets/': 'assets/' } }, renderer: renderer.declaration }, null, 2) + '\n'); await stream.close(); }
  catch (error) { try { await stream.abort(); } catch { /* original error */ } throw error; }
}
