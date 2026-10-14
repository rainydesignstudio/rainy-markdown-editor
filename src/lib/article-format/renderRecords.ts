import postcss from 'postcss';
import { canonicalFormatJson, compileFormatBundle, DEFAULT_FORMAT_BUNDLE, type FormatFormatter, type RawFormatter } from './config';
import { getFormatSnapshot, type FormatSnapshot } from './runtime';
import { contentHash, normalizeLibraryPath, readLibraryFile, loadStylesheetEnvironment, assertPortableStyles, STYLE_LIMITS, type CssAsset } from './styles';
import { parseArticle } from '../frontMatter';
import type { ThemeConfig } from '../types';
import { TAILWIND_COMPILER_VERSION } from '../tailwind-assets';

const OWNER = 'wechat-article-editor-render';
const HASH = /^[a-f0-9]{64}$/;
export type RenderAssetReference = { hash: string; mime: string; path: string };
export type RenderRecord = {
  owner: typeof OWNER; schemaVersion: 1;
  bodyHash: string; themeHash: string; environmentHash: string;
  rawFormatter: RawFormatter; formatter: FormatFormatter;
  html: string; css: string;
  assets: RenderAssetReference[];
};
type RenderManifest = {
  owner: typeof OWNER; schemaVersion: 1; rawFormatter: RawFormatter;
  rawFiles: Record<string, string>; policy: FormatFormatter['stylesheets'] | null;
  candidates: string[]; assets: RenderAssetReference[];
  compilerVersion: string;
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('render.json必须是对象。');
  const record = value as RenderRecord;
  if (record.owner !== OWNER || record.schemaVersion !== 1 || !HASH.test(record.bodyHash) || !HASH.test(record.themeHash) || !HASH.test(record.environmentHash) ||
      typeof record.html !== 'string' || typeof record.css !== 'string' || !Array.isArray(record.assets) || record.assets.length > STYLE_LIMITS.assets) throw new Error('渲染记录协议无效。');
  if (record.html.length + record.css.length > STYLE_LIMITS.cssBytes) throw new Error('渲染记录超过大小上限。');
  if (canonicalFormatJson(checkedFormatter(record.rawFormatter)) !== canonicalFormatJson(record.formatter)) throw new Error('渲染配置与已校验步骤不一致。');
  assertPortableStyles(record.css);
  for (const asset of record.assets) {
    if (!HASH.test(asset.hash) || typeof asset.path !== 'string' || !/^(image|font)\//.test(asset.mime) || normalizeLibraryPath(asset.path) !== asset.path) throw new Error('渲染资源引用无效。');
  }
  return record;
}
export async function readRenderRecord(target: FileSystemDirectoryHandle): Promise<RenderRecord | null> {
  try {
    const file = await (await target.getFileHandle('render.json')).getFile();
    if (file.size > STYLE_LIMITS.cssBytes) throw new Error('渲染记录过大。');
    return validateRenderRecord(JSON.parse(await file.text()));
  } catch (error) { if (missing(error)) return null; throw error; }
}
export async function renderRecordMatches(record: RenderRecord, source: string, theme: ThemeConfig) {
  return record.bodyHash === await contentHash(parseArticle(source).body) && record.themeHash === await contentHash(canonicalFormatJson(theme));
}
export async function prepareRenderRecord(source: string, theme: ThemeConfig, element: HTMLElement, css: string, options: { snapshot?: FormatSnapshot; root?: FileSystemDirectoryHandle; articlePath?: string } = {}): Promise<PreparedRenderRecord> {
  const snapshot = options.snapshot ?? getFormatSnapshot();
  const environment = snapshot.environment;
  const assets: CssAsset[] = [...(environment?.assets ?? [])];
  const clone = element.cloneNode(true) as HTMLElement;
  if (options.root) {
    if (element.querySelector('span[data-local-asset-src],span[data-local-asset-srcset]')) throw new Error('本地图片未载入，渲染记录未生成。');
    const images = Array.from(clone.querySelectorAll<HTMLImageElement>('img[data-local-asset-src]'));
    const liveImages = Array.from(element.querySelectorAll<HTMLImageElement>('img[data-local-asset-src]'));
    for (let index = 0; index < images.length; index++) {
      const image = images[index], live = liveImages[index];
      const src = image.dataset.localAssetSrc!;
      const path = src.startsWith('/') ? normalizeLibraryPath((snapshot.bundle.formatter.stylesheets?.publicRoot ?? 'assets') + src) : normalizeLibraryPath(src, options.articlePath);
      let asset = assets.find(item => item.path === path);
      if (!asset) {
        const blob = await readLibraryFile(options.root, path);
        const extension = path.split('.').at(-1)?.toLowerCase();
        const mime = blob.type || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' } as Record<string, string>)[extension ?? ''];
        if (!mime?.startsWith('image/')) throw new Error('渲染图片类型无效：' + path);
        asset = { path, hash: await contentHash(blob), mime, blob, url: live.getAttribute('src') ?? '' };
        assets.push(asset);
      }
      image.src = 'article-asset:' + asset.hash;
    }
  }
  if (assets.length > STYLE_LIMITS.assets || assets.reduce((sum, item) => sum + item.blob.size, 0) > STYLE_LIMITS.assetBytes) throw new Error('渲染资源超过上限。');
  let html = clone.outerHTML, storedCss = css;
  for (const asset of assets) {
    if (asset.url) {
      html = html.replaceAll(asset.url, 'article-asset:' + asset.hash);
      storedCss = storedCss.replaceAll(asset.url, 'article-asset:' + asset.hash);
    }
  }
  if (/blob:/i.test(html + storedCss)) throw new Error('仍有未留存的临时资源，渲染记录未生成。');
  const rawFormatter = snapshot.rawFormatter ?? DEFAULT_FORMAT_BUNDLE.formatter;
  const formatter = checkedFormatter(rawFormatter);
  const refs = assets.map(({ path, hash, mime }) => ({ path, hash, mime }));
  const manifest: RenderManifest = { owner: OWNER, schemaVersion: 1, rawFormatter, rawFiles: { ...(environment?.rawFiles ?? {}) }, policy: environment?.policy ?? null, candidates: [...(environment?.candidates ?? [])], assets: refs, compilerVersion: TAILWIND_COMPILER_VERSION };
  const environmentHash = await contentHash(canonicalFormatJson(manifest));
  return { record: { owner: OWNER, schemaVersion: 1, bodyHash: await contentHash(parseArticle(source).body), themeHash: await contentHash(canonicalFormatJson(theme)), environmentHash, rawFormatter, formatter, html, css: storedCss, assets: refs }, assets, manifest };
}
export async function persistRenderRecord(root: FileSystemDirectoryHandle, target: FileSystemDirectoryHandle, prepared: PreparedRenderRecord) {
  const record = validateRenderRecord(prepared.record);
  const objects = await directory(root, 'assets/.objects', true);
  for (const asset of prepared.assets) {
    let file: File | null = null;
    try { file = await (await objects.getFileHandle(asset.hash)).getFile(); } catch (error) { if (!missing(error)) throw error; }
    if (file && await contentHash(file) !== asset.hash) throw new Error('已有渲染对象校验失败：' + asset.hash);
    if (!file) { await write(objects, asset.hash, asset.blob); if (await contentHash(await (await objects.getFileHandle(asset.hash)).getFile()) !== asset.hash) throw new Error('渲染对象写入校验失败。'); }
  }
  const version = await directory(root, 'styles/.versions/' + record.environmentHash, true);
  const manifest = canonicalFormatJson(prepared.manifest);
  if (await contentHash(manifest) !== record.environmentHash) throw new Error('渲染依赖版本校验失败。');
  let existing: string | null = null;
  try { existing = await (await version.getFileHandle('manifest.json')).getFile().then(file => file.text()); } catch (error) { if (!missing(error)) throw error; }
  if (existing !== null && existing !== manifest) throw new Error('不可变渲染版本已损坏，未覆盖。');
  if (existing === null) await write(version, 'manifest.json', manifest);
  if (await contentHash(await (await version.getFileHandle('manifest.json')).getFile().then(file => file.text())) !== record.environmentHash) throw new Error('渲染清单写入校验失败。');
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
  if (file.size > STYLE_LIMITS.cssBytes) throw new Error('渲染清单过大。');
  const text = await file.text();
  if (await contentHash(text) !== record.environmentHash) throw new Error('历史渲染版本缺失或校验失败。');
  const manifest = JSON.parse(text) as RenderManifest;
  if (manifest.owner !== OWNER || manifest.schemaVersion !== 1 || canonicalFormatJson(manifest.rawFormatter) !== canonicalFormatJson(record.rawFormatter) ||
      canonicalFormatJson(manifest.assets) !== canonicalFormatJson(record.assets) || !manifest.rawFiles || !Array.isArray(manifest.candidates) || manifest.candidates.some(value => typeof value !== 'string' || value.length > 256)) throw new Error('历史依赖清单无效。');
  return manifest;
}
export async function restoreRenderEnvironment(root: FileSystemDirectoryHandle, value: RenderRecord, live = getFormatSnapshot()): Promise<{ snapshot: FormatSnapshot; html: string; css: string; dispose: () => void }> {
  const record = validateRenderRecord(value), manifest = await readManifest(root, record);
  const files = new Map<string, Blob>();
  let bytes = 0;
  for (const asset of record.assets) {
    const file = await readLibraryFile(root, 'assets/.objects/' + asset.hash);
    bytes += file.size;
    if (bytes > STYLE_LIMITS.assetBytes || await contentHash(file) !== asset.hash) throw new Error('历史渲染资源缺失或校验失败：' + asset.path);
    files.set(asset.path, new Blob([await file.arrayBuffer()], { type: asset.mime }));
  }
  for (const [path, css] of Object.entries(manifest.rawFiles)) {
    if (typeof css !== 'string' || normalizeLibraryPath(path) !== path) throw new Error('历史CSS路径无效。');
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
      if (!blob) throw new DOMException('历史资源缺失：' + path, 'NotFoundError');
      return { async getFile() { return new File([blob], name, { type: blob.type }); } } as FileSystemFileHandle;
    },
    async *entries() { /* no host enumeration */ },
  } as unknown as FileSystemDirectoryHandle);
  const environment = manifest.policy ? await loadStylesheetEnvironment(virtual(), manifest.policy) : undefined;
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
  const snapshot: FormatSnapshot = { ...live, rawFormatter: record.rawFormatter, bundle: { ...live.bundle, formatter: record.formatter },
    ...(environment ? { environment: { ...environment, get assets() { return [...environment.assets, ...extraAssets]; }, rawFiles: manifest.rawFiles, candidates: manifest.candidates, fingerprint: record.environmentHash } } : { environment: undefined }) };
  return { snapshot, html, css, dispose };
}
export const materializeRenderRecord = restoreRenderEnvironment;
