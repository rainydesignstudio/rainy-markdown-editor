import { ProductError, productJoin, productReference, productText } from "../i18n/productMessages";
import postcss from 'postcss';
import { validateRendererPackage, rendererPolicy, PACKAGE_LIMITS, type RendererPackage } from './package';
import { awaitPackagePreview, assertPackageCss, packageInputFor, packageResourcePath } from './packageRendering';
import { canonicalFormatJson, compileFormatBundle, DEFAULT_FORMAT_BUNDLE, type FormatFormatter, type RawFormatter } from './config';
import { getFormatSnapshot, type FormatSnapshot } from './runtime';
import { contentHash, normalizeLibraryPath, readLibraryFile, loadStylesheetEnvironment, assertPortableStyles, STYLE_LIMITS, type CssAsset } from './styles';
import { parseArticle } from '../frontMatter';
import type { ThemeConfig } from '../types';
import { TAILWIND_COMPILER_VERSION } from '../tailwind-assets';
import { ALGORITHM_LIMITS, DEFAULT_ALGORITHMS, validateAlgorithmPackage } from './algorithms';
import type { AlgorithmPackage } from './algorithmTypes';
import { DEFAULT_LIBRARY_CONFIGURATION, validateResolvedLibraryConfiguration, assertConfigurationCompatible, type ResolvedLibraryConfiguration } from './libraryConfiguration';

const OWNER = 'wechat-article-editor-render';
const HASH = /^[a-f0-9]{64}$/;
export type RenderAssetReference = { hash: string; mime: string; path: string };
export type RenderRecord = {
  owner: typeof OWNER; schemaVersion: 1;
  bodyHash: string; themeHash: string; environmentHash: string;
  rawFormatter: RawFormatter; formatter: FormatFormatter;
  html: string; css: string;
  assets: RenderAssetReference[];
  algorithmHash?: string;
  rendererHash?: string;
  configuration?: ResolvedLibraryConfiguration;
};
type RenderManifest = {
  owner: typeof OWNER; schemaVersion: 1; rawFormatter: RawFormatter;
  rawFiles: Record<string, string>; policy: FormatFormatter['stylesheets'] | null;
  candidates: string[]; assets: RenderAssetReference[];
  compilerVersion: string;
  algorithms?: AlgorithmPackage;
  renderer?: RendererPackage;
  configuration?: ResolvedLibraryConfiguration;
};
export type PreparedRenderRecord = { record: RenderRecord; assets: readonly CssAsset[]; manifest: RenderManifest };
async function directory(root: FileSystemDirectoryHandle, path: string, create = false) {
  let current = root;
  for (const part of normalizeLibraryPath(path).split('/')) current = await current.getDirectoryHandle(part, { create });
  return current;
}
async function write(target: FileSystemDirectoryHandle, name: string, value: string | Blob) {
  const stream = await (await target.getFileHandle(name, { create: true })).createWritable();
  try { await stream.write(value); await stream.close(); }
  catch (error) { try { await stream.abort(); } catch { /* preserve failure */ } throw error; }
}
function missing(error: unknown): boolean { return error instanceof DOMException && error.name === 'NotFoundError'; }
function checkedFormatter(raw: RawFormatter): FormatFormatter {
  const seed = JSON.parse(JSON.stringify(DEFAULT_FORMAT_BUNDLE));
  seed.support.meta.id = raw?.meta?.id;
  seed.validator.meta.id = raw?.meta?.id;
  seed.formatter = raw;
  return compileFormatBundle(seed).formatter;
}
export function validateRenderRecord(value: unknown): RenderRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProductError("renderRecords.renderJsonMustBeAnObject");
  const record = value as RenderRecord;
  if (record.owner !== OWNER || record.schemaVersion !== 1 || !HASH.test(record.bodyHash) || !HASH.test(record.themeHash) || !HASH.test(record.environmentHash) ||
      typeof record.html !== 'string' || typeof record.css !== 'string' || !Array.isArray(record.assets) || record.assets.length > STYLE_LIMITS.assets) throw new ProductError("renderRecords.theRenderRecordProtocolIsInvalid");
  if (record.html.length + record.css.length > STYLE_LIMITS.cssBytes) throw new ProductError("renderRecords.theRenderRecordExceedsTheSizeLimit");
  if (record.algorithmHash !== undefined && !HASH.test(record.algorithmHash)) throw new ProductError('algorithms.invalidPackage');
  if (record.rendererHash !== undefined && !HASH.test(record.rendererHash)) throw new Error('Invalid render package identity');
  const formatter = checkedFormatter(record.rawFormatter);
  // Pre-mode records retain the source already determined by their validated raw
  // step. Compare its original shape without changing the stored record or hash.
  if (record.formatter?.preview?.dark?.mode === undefined && record.rawFormatter.steps.some(step =>
    step.enabled && step.operator === 'preview.dark-mode' && !Object.hasOwn(step.parameters, 'mode'))) {
    delete formatter.preview.dark.mode;
  }
  if (canonicalFormatJson(formatter) !== canonicalFormatJson(record.formatter)) throw new ProductError("renderRecords.theRenderConfigurationDoesNotMatchTheValidatedSteps");
  if (record.configuration !== undefined) {
    const configuration = validateResolvedLibraryConfiguration(record.configuration);
    assertConfigurationCompatible({ configuration, renderer: record.rendererHash, bundle: { formatter, validator: { meta: { enabled: false }, rules: [] } } });
  }
  if (record.rendererHash) assertPackageCss(record.css, { images: ['https:'], styles: ['https:'], fonts: ['https:'] }); else assertPortableStyles(record.css);
  for (const asset of record.assets) {
    if (!HASH.test(asset.hash) || typeof asset.path !== 'string' || !/^(image|font)\//.test(asset.mime) || normalizeLibraryPath(asset.path) !== asset.path) throw new ProductError("renderRecords.theRenderResourceReferenceIsInvalid");
  }
  return record;
}
export async function readRenderRecord(target: FileSystemDirectoryHandle): Promise<RenderRecord | null> {
  try {
    const file = await (await target.getFileHandle('render.json')).getFile();
    if (file.size > STYLE_LIMITS.cssBytes) throw new ProductError("renderRecords.theRenderRecordIsTooLarge");
    return validateRenderRecord(JSON.parse(await file.text()));
  } catch (error) { if (missing(error)) return null; throw error; }
}
export async function renderRecordMatches(record: RenderRecord, source: string, theme: ThemeConfig) {
  return record.bodyHash === await contentHash(parseArticle(source).body) && record.themeHash === await contentHash(canonicalFormatJson(theme));
}
export async function prepareRenderRecord(source: string, theme: ThemeConfig, element: HTMLElement, css: string, options: { snapshot?: FormatSnapshot; root?: FileSystemDirectoryHandle; articlePath?: string } = {}): Promise<PreparedRenderRecord> {
  const snapshot = options.snapshot ?? getFormatSnapshot();
  await awaitPackagePreview(element, parseArticle(source).body, theme, snapshot);
  if (snapshot.renderer && element.querySelector('[data-asset-state="error"],[data-asset-state="loading"]')) throw new ProductError('renderRecords.localImagesAreNotLoadedNoRenderRecordWasGenerated');
  if (snapshot.bundle.formatter.mermaid && element.querySelector('[data-render-state="pending"][data-render-kind="mermaid"]')) throw new ProductError('mermaid.pending');
  const environment = snapshot.environment;
  const assets: CssAsset[] = [...(environment?.assets ?? [])];
  if (snapshot.renderer) for (const asset of packageInputFor(element)?.assets ?? []) if (!assets.some(known => known.hash === asset.hash && known.path === asset.path)) assets.push(asset);
  const clone = element.cloneNode(true) as HTMLElement;
  // Storage tokens must be assigned in an inert document, without loading URLs.
  element.ownerDocument?.createElement('template').content?.append(clone);
  if (options.root) {
    if (element.querySelector('span[data-local-asset-src],span[data-local-asset-srcset]')) throw new ProductError("renderRecords.localImagesAreNotLoadedNoRenderRecordWasGenerated");
    const images = Array.from(clone.querySelectorAll<HTMLImageElement>('img[data-local-asset-src]'));
    const liveImages = Array.from(element.querySelectorAll<HTMLImageElement>('img[data-local-asset-src]'));
    for (let index = 0; index < images.length; index++) {
      const image = images[index], live = liveImages[index];
      const src = image.dataset.localAssetSrc!;
      const path = snapshot.renderer ? packageResourcePath(src, options.articlePath ?? '', snapshot) : src.startsWith('/') ? normalizeLibraryPath((snapshot.bundle.formatter.stylesheets?.publicRoot ?? 'assets') + src) : normalizeLibraryPath(src, options.articlePath);
      let asset = assets.find(item => item.path === path);
      if (!asset) {
        const blob = await readLibraryFile(options.root, path);
        const extension = path.split('.').at(-1)?.toLowerCase();
        const mime = blob.type || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' } as Record<string, string>)[extension ?? ''];
        if (!mime?.startsWith('image/')) throw new ProductError('shared.compose', { parts: productJoin([productReference("renderRecords.invalidRenderImageType"), path]) });
        asset = { path, hash: await contentHash(blob), mime, blob, url: live.getAttribute('src') ?? '' };
        assets.push(asset);
      }
      image.src = 'article-asset:' + asset.hash;
    }
  }
  if (assets.length > STYLE_LIMITS.assets || assets.reduce((sum, item) => sum + item.blob.size, 0) > STYLE_LIMITS.assetBytes) throw new ProductError("renderRecords.renderResourcesExceedTheLimit");
  let html = clone.outerHTML, storedCss = css;
  for (const asset of assets) {
    if (asset.url) {
      html = html.replaceAll(asset.url, 'article-asset:' + asset.hash);
      storedCss = storedCss.replaceAll(asset.url, 'article-asset:' + asset.hash);
    }
  }
  if (/blob:/i.test(html + storedCss)) throw new ProductError("renderRecords.temporaryResourcesRemainUnsavedNoRenderRecordWasGenerated");
  const rawFormatter = snapshot.rawFormatter ?? DEFAULT_FORMAT_BUNDLE.formatter;
  const formatter = checkedFormatter(rawFormatter);
  const refs = assets.map(({ path, hash, mime }) => ({ path, hash, mime }));
  const algorithms = await validateAlgorithmPackage(snapshot.algorithms, snapshot.configuration);
  const renderer = snapshot.renderer ? await validateRendererPackage(snapshot.renderer) : undefined;
  const configuration = snapshot.configuration && canonicalFormatJson(snapshot.configuration) !== canonicalFormatJson(DEFAULT_LIBRARY_CONFIGURATION) ? snapshot.configuration : undefined;
  const manifest: RenderManifest = { owner: OWNER, schemaVersion: 1, rawFormatter, rawFiles: { ...(environment?.rawFiles ?? {}) }, policy: environment?.policy ?? null, candidates: [...(environment?.candidates ?? [])], assets: refs, compilerVersion: TAILWIND_COMPILER_VERSION, algorithms, ...(configuration ? { configuration } : {}) };
  if (renderer) manifest.renderer = renderer;
  const environmentHash = await contentHash(canonicalFormatJson(manifest));
  return { record: { owner: OWNER, schemaVersion: 1, bodyHash: await contentHash(parseArticle(source).body), themeHash: await contentHash(canonicalFormatJson(theme)), environmentHash, rawFormatter, formatter, algorithmHash: algorithms.fingerprint, ...(renderer ? { rendererHash: renderer.fingerprint } : {}), html, css: storedCss, assets: refs, ...(configuration ? { configuration } : {}) }, assets, manifest };
}
export async function persistRenderRecord(root: FileSystemDirectoryHandle, target: FileSystemDirectoryHandle, prepared: PreparedRenderRecord) {
  const record = validateRenderRecord(prepared.record);
  if (prepared.manifest.renderer ? (await validateRendererPackage(prepared.manifest.renderer)).fingerprint !== record.rendererHash : record.rendererHash !== undefined) throw new Error('Render package manifest mismatch');
  if (prepared.manifest.algorithms) {
    const algorithms = await validateAlgorithmPackage(prepared.manifest.algorithms, record.configuration);
    if (record.algorithmHash !== algorithms.fingerprint) throw new ProductError('algorithms.hashMismatch', { path: 'render.json' });
  } else if (record.algorithmHash !== undefined) throw new ProductError('algorithms.invalidPackage');
  const objects = await directory(root, 'assets/.objects', true);
  for (const asset of prepared.assets) {
    let file: File | null = null;
    try { file = await (await objects.getFileHandle(asset.hash)).getFile(); } catch (error) { if (!missing(error)) throw error; }
    if (file && await contentHash(file) !== asset.hash) throw new ProductError('shared.compose', { parts: productJoin([productReference("renderRecords.existingRenderObjectVerificationFailed"), asset.hash]) });
    if (!file) { await write(objects, asset.hash, asset.blob); if (await contentHash(await (await objects.getFileHandle(asset.hash)).getFile()) !== asset.hash) throw new ProductError("renderRecords.renderObjectWriteVerificationFailed"); }
  }
  const version = await directory(root, 'styles/.versions/' + record.environmentHash, true);
  const manifest = canonicalFormatJson(prepared.manifest);
  if (await contentHash(manifest) !== record.environmentHash) throw new ProductError("renderRecords.renderDependencyVersionVerificationFailed");
  let existing: string | null = null;
  try { existing = await (await version.getFileHandle('manifest.json')).getFile().then(file => file.text()); } catch (error) { if (!missing(error)) throw error; }
  if (existing !== null && existing !== manifest) throw new ProductError("renderRecords.theImmutableRenderVersionIsDamagedAndWasNotOverwritten");
  if (existing === null) await write(version, 'manifest.json', manifest);
  if (await contentHash(await (await version.getFileHandle('manifest.json')).getFile().then(file => file.text())) !== record.environmentHash) throw new ProductError("renderRecords.renderManifestWriteVerificationFailed");
  await writeRenderRecord(target, record);
}
export async function writeRenderRecord(target: FileSystemDirectoryHandle, record: RenderRecord | null) {
  if (record) await write(target, 'render.json', JSON.stringify(validateRenderRecord(record)));
  else { try { await target.removeEntry('render.json'); } catch (error) { if (!missing(error)) throw error; } }
}
export async function copyRenderRecord(source: FileSystemDirectoryHandle, destination: FileSystemDirectoryHandle) {
  const record = await readRenderRecord(source);
  if (record) await writeRenderRecord(destination, record);
  return record;
}
async function readManifest(root: FileSystemDirectoryHandle, record: RenderRecord): Promise<RenderManifest> {
  const file = await readLibraryFile(root, 'styles/.versions/' + record.environmentHash + '/manifest.json');
  if (file.size > STYLE_LIMITS.cssBytes + ALGORITHM_LIMITS.totalBytes * 2 + PACKAGE_LIMITS.totalBytes * 2) throw new ProductError("renderRecords.theRenderManifestIsTooLarge");
  const text = await file.text();
  if (await contentHash(text) !== record.environmentHash) throw new ProductError("renderRecords.theHistoricalRenderVersionIsMissingOrFailedVerification");
  const manifest = JSON.parse(text) as RenderManifest;
  if (manifest.owner !== OWNER || manifest.schemaVersion !== 1 || canonicalFormatJson(manifest.rawFormatter) !== canonicalFormatJson(record.rawFormatter) ||
      canonicalFormatJson(manifest.configuration ?? DEFAULT_LIBRARY_CONFIGURATION) !== canonicalFormatJson(record.configuration ?? DEFAULT_LIBRARY_CONFIGURATION) ||
      canonicalFormatJson(manifest.assets) !== canonicalFormatJson(record.assets) || !manifest.rawFiles || !Array.isArray(manifest.candidates) || manifest.candidates.some(value => typeof value !== 'string' || value.length > 256)) throw new ProductError("renderRecords.theHistoricalDependencyManifestIsInvalid");
  return manifest;
}
export async function restoreRenderEnvironment(root: FileSystemDirectoryHandle, value: RenderRecord, live = getFormatSnapshot()): Promise<{ snapshot: FormatSnapshot; html: string; css: string; dispose: () => void }> {
  const record = validateRenderRecord(value), manifest = await readManifest(root, record);
  const renderer = manifest.renderer ? await validateRendererPackage(manifest.renderer) : undefined;
  if (renderer) assertPackageCss(record.css, renderer.declaration.permissions);
  if (renderer?.fingerprint !== record.rendererHash) throw new Error('Historical format package mismatch');
  const algorithms = manifest.algorithms ? await validateAlgorithmPackage(manifest.algorithms, record.configuration) : DEFAULT_ALGORITHMS;
  if (record.algorithmHash !== undefined && record.algorithmHash !== algorithms.fingerprint || manifest.algorithms && record.algorithmHash === undefined) throw new ProductError('algorithms.hashMismatch', { path: 'render.json' });
  const files = new Map<string, Blob>();
  let bytes = 0;
  for (const asset of record.assets) {
    const file = await readLibraryFile(root, 'assets/.objects/' + asset.hash);
    bytes += file.size;
    if (bytes > STYLE_LIMITS.assetBytes || await contentHash(file) !== asset.hash) throw new ProductError('shared.compose', { parts: productJoin([productReference("renderRecords.historicalRenderResourceIsMissingOrFailedVerification"), asset.path]) });
    files.set(asset.path, new Blob([await file.arrayBuffer()], { type: asset.mime }));
  }
  for (const [path, css] of Object.entries(manifest.rawFiles)) {
    if (typeof css !== 'string' || normalizeLibraryPath(path) !== path) throw new ProductError("renderRecords.theHistoricalCssPathIsInvalid");
    const sheet = postcss.parse(css);
    // Explicit source candidates are captured in the immutable manifest, not reread from today's library.
    sheet.walkAtRules('source', rule => { if (!/\binline\s*\(/.test(rule.params)) rule.remove(); });
    files.set(path, new Blob([sheet.toString()], { type: 'text/css' }));
  }
  const virtual = (prefix = ''): FileSystemDirectoryHandle => ({
    name: prefix, kind: 'directory',
    async getDirectoryHandle(name: string) { return virtual(prefix ? prefix + '/' + name : name); },
    async getFileHandle(name: string) {
      const path = prefix ? prefix + '/' + name : name, blob = files.get(path);
      if (!blob) throw new DOMException(productText("renderRecords.historicalResourceIsMissing") + path, 'NotFoundError');
      return { async getFile() { return new File([blob], name, { type: blob.type }); } } as FileSystemFileHandle;
    },
    async *entries() { /* no host enumeration */ },
  } as unknown as FileSystemDirectoryHandle);
  const environment = manifest.policy ? await loadStylesheetEnvironment(virtual(), manifest.policy, renderer?.declaration.protocol === 'rainy-format/2' ? { aliases: record.configuration?.resources?.aliases ?? {}, allowedPaths: [...files.keys()] } : undefined) : undefined;
  const urls: string[] = [];
  const extraAssets: CssAsset[] = [];
  let html = record.html, css = record.css;
  for (const asset of record.assets) {
    const known = environment?.assets.find(item => item.path === asset.path);
    const url = known?.url ?? URL.createObjectURL(files.get(asset.path)!);
    if (!known) { urls.push(url); extraAssets.push({ ...asset, url, blob: files.get(asset.path)! }); }
    html = html.replaceAll('article-asset:' + asset.hash, url);
    css = css.replaceAll('article-asset:' + asset.hash, url);
  }
  const dispose = () => { environment?.dispose(); urls.forEach(url => URL.revokeObjectURL(url)); };
  const snapshot: FormatSnapshot = { ...live, renderer, resources: renderer ? extraAssets : undefined, rawBundle: renderer ? rendererPolicy(renderer) : undefined, configuration: record.configuration ?? DEFAULT_LIBRARY_CONFIGURATION, rawFormatter: record.rawFormatter, bundle: { ...live.bundle, formatter: record.formatter }, algorithms, algorithmSource: manifest.algorithms ? 'library' : 'legacy', officialDefault: live.officialDefault && algorithms.fingerprint === DEFAULT_ALGORITHMS.fingerprint && canonicalFormatJson(record.rawFormatter) === canonicalFormatJson(DEFAULT_FORMAT_BUNDLE.formatter),
    ...(environment ? { environment: { ...environment, get assets() { return [...environment.assets, ...extraAssets]; }, rawFiles: manifest.rawFiles, candidates: manifest.candidates, fingerprint: record.environmentHash } } : { environment: undefined }) };
  return { snapshot, html, css, dispose };
}
export const materializeRenderRecord = restoreRenderEnvironment;
