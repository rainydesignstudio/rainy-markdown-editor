import { ProductError, productCause, productMessage } from "../i18n/productMessages";
import { DEFAULT_FORMAT_BUNDLE, validateFormatBundle, compileFormatBundle, type RawFormatBundle } from './config';
import { activateFormatBundle, invalidateFormatBundle, type FormatSnapshot } from './runtime';
import { loadStylesheetEnvironment, type StylesheetEnvironment } from './styles';
import { DEFAULT_ALGORITHMS, initializeLibraryAlgorithms, readLibraryAlgorithms } from './algorithms';
import type { AlgorithmPackage } from './algorithmTypes';
import { validateLibraryConfiguration, resolveLibraryConfiguration, assertConfigurationCompatible, type LibraryConfiguration } from './libraryConfiguration';

export const FORMAT_FILES = ['format-support.json', 'validator.json', 'formatter.json'] as const;
// Explicit public catalog: private sibling presets are never discovered or bundled.
export const PUBLIC_PLATFORM_PRESETS = [{ id: 'wechat-article', bundle: DEFAULT_FORMAT_BUNDLE, algorithms: DEFAULT_ALGORITHMS }] as const;
export type PlatformPresetId = (typeof PUBLIC_PLATFORM_PRESETS)[number]['id'];
export const DEFAULT_PLATFORM_PRESET_ID = PUBLIC_PLATFORM_PRESETS[0].id;
export function getPublicPlatformPreset(id: string) {
  const preset = PUBLIC_PLATFORM_PRESETS.find(preset => preset.id === id);
  if (!preset) throw new ProductError('library.unknownPlatformPreset', { id });
  return preset;
}
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
export type FormatLibraryResult = { bundle: RawFormatBundle | null; source: 'built-in' | 'library' | 'invalid'; message: string | null; configuration?: LibraryConfiguration };
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
    const bundle = validateFormatBundle({ support, validator, formatter });
    const resolved = resolveLibraryConfiguration(bundle, configuration);
    assertConfigurationCompatible({ bundle: compileFormatBundle(bundle), configuration: resolved });
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
  if (result.bundle) {
    try {
      const compiled = compileFormatBundle(result.bundle);
      if (result.source === 'library') {
        const loaded = await readLibraryAlgorithms(root, compiled);
        algorithms = loaded.algorithms; algorithmSource = loaded.source;
        message = [message, loaded.message].filter(Boolean).join('；') || null;
      }
      if (!isCurrent()) return { snapshot: null, message: null };
      const policy = compiled.formatter.stylesheets;
      if (policy) environment = await loadStylesheetEnvironment(root, policy);
    } catch (error) {
      if (!isCurrent()) return { snapshot: null, message: null };
      const message = error instanceof Error ? error.message : String(error);
      return { snapshot: invalidateFormatBundle(root.name, message), message };
    }
  }
  if (!isCurrent()) { environment?.dispose(); return { snapshot: null, message: null }; }
  const snapshot = result.bundle ? activateFormatBundle(result.bundle, root.name, result.source === 'library' ? 'library' : 'built-in', environment, algorithms, algorithmSource, result.configuration) : invalidateFormatBundle(root.name, result.message!);
  return { snapshot, message };
}
export async function initializeLibraryFormat(root: FileSystemDirectoryHandle, presetId: string = DEFAULT_PLATFORM_PRESET_ID): Promise<void> {
  const preset = getPublicPlatformPreset(presetId);
  // Initialization is additive. Existing or partial configurations require an explicit repair.
  const directory = await root.getDirectoryHandle('format', { create: true });
  for (const name of FORMAT_FILES) {
    try { await directory.getFileHandle(name); return; } catch (error) { if (!missing(error)) throw error; }
  }
  try { await directory.getDirectoryHandle('algorithms'); throw new ProductError('algorithms.existingDirectory'); }
  catch (error) { if (!missing(error)) throw error; }
  const values = [preset.bundle.support, preset.bundle.validator, preset.bundle.formatter];
  for (let i = 0; i < FORMAT_FILES.length; i++) {
    const handle = await directory.getFileHandle(FORMAT_FILES[i], { create: true });
    const writable = await handle.createWritable();
    try { await writable.write(JSON.stringify(values[i], null, 2) + '\n'); await writable.close(); }
    catch (error) { try { await writable.abort(); } catch { /* retain original failure */ } throw error; }
  }
  await initializeLibraryAlgorithms(root, preset.algorithms);
}
