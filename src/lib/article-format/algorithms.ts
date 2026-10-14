import defaults from '../../../resources/presets/platform/wechat-article/algorithms.generated.json' with { type: 'json' };
import { ProductError, productText } from '../i18n/productMessages';
import { array, bool, libraryPath, number, shape, strings, text } from './contracts';
import { enabledFormatRules, canonicalFormatJson, freezeFormatBundle, type FormatBundle } from './config';
import type { AlgorithmManifest, AlgorithmPackage } from './algorithmTypes';

export const ALGORITHM_LIMITS = Object.freeze({ components: 16, scripts: 32, fileBytes: 1024 * 1024, totalBytes: 4 * 1024 * 1024, manifestBytes: 128 * 1024 });
const HASH = /^[a-f0-9]{64}$/;
const identifier = (value: unknown, path: string) => { text(value, path); if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(String(value))) throw new ProductError('algorithms.invalidManifest', { path }); };
const hash = (value: unknown, path: string) => { if (typeof value !== 'string' || !HASH.test(value)) throw new ProductError('algorithms.invalidManifest', { path }); };
const file = shape({ path: libraryPath, sha256: hash });
export const DEFAULT_ALGORITHMS = freezeFormatBundle(defaults as AlgorithmPackage);

export async function algorithmHash(value: string | Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : await value.arrayBuffer());
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export function validateAlgorithmManifest(value: unknown): AlgorithmManifest {
  shape({ schemaVersion: number(1, 1, true), components: array(shape({ id: identifier, version: text, scripts: array(file, 1), license: file, capabilities: shape({ transform: bool, validators: strings }) })) })(value, 'algorithms');
  const manifest = value as AlgorithmManifest;
  if (manifest.components.length > ALGORITHM_LIMITS.components || manifest.components.reduce((count, item) => count + item.scripts.length, 0) > ALGORITHM_LIMITS.scripts || new Set(manifest.components.map(item => item.id)).size !== manifest.components.length) throw new ProductError('algorithms.invalidManifest', { path: 'components' });
  const references = new Map<string, string>();
  for (const component of manifest.components) {
    if (component.version.length > 128 || new Set(component.capabilities.validators).size !== component.capabilities.validators.length) throw new ProductError('algorithms.invalidManifest', { path: component.id });
    for (const item of [...component.scripts, component.license]) {
      if (references.has(item.path) && references.get(item.path) !== item.sha256) throw new ProductError('algorithms.invalidManifest', { path: item.path });
      references.set(item.path, item.sha256);
    }
  }
  return manifest;
}
export async function validateAlgorithmPackage(value: unknown): Promise<AlgorithmPackage> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProductError('algorithms.invalidPackage');
  const data = value as AlgorithmPackage;
  const manifest = validateAlgorithmManifest(data.manifest);
  if (!data.files || typeof data.files !== 'object' || Array.isArray(data.files)) throw new ProductError('algorithms.invalidPackage');
  const wanted = new Map(manifest.components.flatMap(component => [...component.scripts, component.license]).map(file => [file.path, file.sha256]));
  if (Object.keys(data.files).length !== wanted.size) throw new ProductError('algorithms.invalidPackage');
  let total = 0;
  for (const [path, expected] of wanted) {
    const code = data.files[path];
    if (typeof code !== 'string') throw new ProductError('algorithms.invalidPackage');
    const size = new TextEncoder().encode(code).byteLength; total += size;
    if (size > ALGORITHM_LIMITS.fileBytes || total > ALGORITHM_LIMITS.totalBytes) throw new ProductError('algorithms.sizeLimit');
    if (await algorithmHash(code) !== expected) throw new ProductError('algorithms.hashMismatch', { path });
  }
  const fingerprint = await algorithmHash(canonicalFormatJson({ manifest, files: data.files }));
  if (data.fingerprint !== fingerprint) throw new ProductError('algorithms.hashMismatch', { path: 'package' });
  return freezeFormatBundle({ manifest, files: data.files, fingerprint });
}
export function assertAlgorithmCapabilities(data: AlgorithmPackage, bundle: FormatBundle): void {
  const id = bundle.formatter.preview.dark.transform;
  if (id === 'preserve') return;
  const component = data.manifest.components.find(item => item.id === id);
  if (!component?.capabilities.transform) throw new ProductError('algorithms.capabilityMissing', { id });
  const required = enabledFormatRules(bundle).filter(rule => rule.operator.startsWith('official.dark-')).map(rule => rule.operator);
  for (const operator of required) if (!component.capabilities.validators.includes(operator)) throw new ProductError('algorithms.capabilityMissing', { id: operator });
}
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
export async function readLibraryAlgorithms(root: FileSystemDirectoryHandle, bundle: FormatBundle): Promise<{ algorithms: AlgorithmPackage; source: 'library' | 'legacy'; message: string | null }> {
  let directory: FileSystemDirectoryHandle;
  try { directory = await (await root.getDirectoryHandle('format')).getDirectoryHandle('algorithms'); }
  catch (error) {
    if (!missing(error)) throw error;
    assertAlgorithmCapabilities(DEFAULT_ALGORITHMS, bundle);
    return { algorithms: DEFAULT_ALGORITHMS, source: 'legacy', message: bundle.formatter.preview.dark.transform === 'preserve' ? null : productText('algorithms.legacyFallback') };
  }
  // A present but incomplete directory is an error, never an implicit fallback.
  const manifestFile = await (await directory.getFileHandle('manifest.json')).getFile();
  if (manifestFile.size > ALGORITHM_LIMITS.manifestBytes) throw new ProductError('algorithms.sizeLimit');
  const manifest = validateAlgorithmManifest(JSON.parse(await manifestFile.text()));
  const files: Record<string, string> = {}; let total = 0;
  for (const reference of manifest.components.flatMap(component => [...component.scripts, component.license])) {
    if (Object.hasOwn(files, reference.path)) continue;
    let target = directory;
    const parts = reference.path.split('/');
    for (const part of parts.slice(0, -1)) target = await target.getDirectoryHandle(part);
    const file = await (await target.getFileHandle(parts.at(-1)!)).getFile();
    total += file.size;
    if (file.size > ALGORITHM_LIMITS.fileBytes || total > ALGORITHM_LIMITS.totalBytes) throw new ProductError('algorithms.sizeLimit');
    if (await algorithmHash(file) !== reference.sha256) throw new ProductError('algorithms.hashMismatch', { path: reference.path });
    files[reference.path] = await file.text();
  }
  const fingerprint = await algorithmHash(canonicalFormatJson({ manifest, files }));
  const algorithms = await validateAlgorithmPackage({ manifest, files, fingerprint });
  assertAlgorithmCapabilities(algorithms, bundle);
  return { algorithms, source: 'library', message: null };
}
export async function initializeLibraryAlgorithms(root: FileSystemDirectoryHandle, data = DEFAULT_ALGORITHMS): Promise<void> {
  const verified = await validateAlgorithmPackage(data);
  const format = await root.getDirectoryHandle('format', { create: true });
  try { await format.getDirectoryHandle('algorithms'); throw new ProductError('algorithms.existingDirectory'); }
  catch (error) { if (!missing(error)) throw error; }
  const directory = await format.getDirectoryHandle('algorithms', { create: true });
  for (const [path, content] of Object.entries(verified.files)) {
    let target = directory; const parts = path.split('/');
    for (const part of parts.slice(0, -1)) target = await target.getDirectoryHandle(part, { create: true });
    const stream = await (await target.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
    try { await stream.write(content); await stream.close(); } catch (error) { try { await stream.abort(); } catch { /* preserve write failure */ } throw error; }
  }
  const stream = await (await directory.getFileHandle('manifest.json', { create: true })).createWritable();
  try { await stream.write(JSON.stringify(verified.manifest, null, 2) + '\n'); await stream.close(); } catch (error) { try { await stream.abort(); } catch { /* preserve write failure */ } throw error; }
}
