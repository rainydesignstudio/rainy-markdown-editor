import { productCause, ProductError, productJoin, productReference, productText } from "../i18n/productMessages";
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import selectorParser from 'postcss-selector-parser';
import type { StylesheetsPolicy } from './styleTypes';
import { resolveLibraryResource, assertDeclaredResource, type ResourceResolution } from './resourcePaths';

export const STYLE_LIMITS = Object.freeze({ cssBytes: 8 * 1024 * 1024, cssFileBytes: 1024 * 1024, cssFiles: 256, depth: 32, assets: 2048, assetBytes: 256 * 1024 * 1024, sourceFiles: 256 });
export type CssAsset = Readonly<{ path: string; hash: string; mime: string; blob: Blob; url: string }>;
export type StyleSource = Readonly<{ base: string; pattern: string; negative: boolean }>;
export type StylesheetEnvironment = Readonly<{
  policy: StylesheetsPolicy;
  files: Readonly<Record<string, string>>;
  rawFiles: Readonly<Record<string, string>>;
  assets: readonly CssAsset[];
  classes: ReadonlySet<string>;
  sources: readonly StyleSource[];
  candidates: readonly string[];
  fingerprint: string;
  resolution?: ResourceResolution;
  resolveCss: (css: string, source: string) => Promise<string>;
  dispose: () => void;
}>;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf' };
const encoder = new TextEncoder();
export async function contentHash(value: string | Blob): Promise<string> {
  const bytes = typeof value === 'string' ? encoder.encode(value) : await value.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function normalizeLibraryPath(input: string, base = ''): string {
  let decoded: string;
  try { decoded = decodeURIComponent(input); } catch { throw new ProductError("styles.resourcePathEncodingIsInvalid"); }
  if (/^[a-z][a-z\d+.-]*:/i.test(decoded) || /[\\\u0000-\u001f]/.test(decoded)) throw new ProductError('shared.compose', { parts: productJoin([productReference("styles.invalidResourcePath"), input]) });
  const parts = decoded.startsWith('/') ? [] : base.split('/').filter(Boolean);
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new ProductError('shared.compose', { parts: productJoin([productReference("styles.resourcePathLeavesTheAuthorizedLibrary"), input]) });
      parts.pop();
    } else parts.push(part);
  }
  if (!parts.length) throw new ProductError("styles.aResourcePathCannotReferToTheLibraryRootDirectory");
  return parts.join('/');
}
export function stylesheetAssetPath(uri: string, file: string, publicRoot: string, resolution?: ResourceResolution): { path: string; suffix: string } | null {
  if (!uri || uri.startsWith('#')) return null;
  if (/^data:/i.test(uri)) {
    if (!/^data:(?:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)|font\/(?:woff2?|ttf|otf));/i.test(uri)) throw new ProductError("styles.theTypeOfTheInlineStylesheetResourceIsUnsupported");
    return null;
  }
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(uri)) throw new ProductError('shared.compose', { parts: productJoin([productReference("styles.stylesheetResourcesMustBeWithinTheAuthorizedLibrary"), uri]) });
  const match = /^([^?#]*)(.*)$/.exec(uri)!;
  const suffix = match[2].includes('#') ? match[2].slice(match[2].indexOf('#')) : '';
  const path = resolution ? resolveLibraryResource(match[1], resolution) : uri.startsWith('/') ? normalizeLibraryPath(publicRoot + '/' + match[1].slice(1)) : normalizeLibraryPath(match[1], file.split('/').slice(0, -1).join('/'));
  assertDeclaredResource(path, resolution);
  if (!resolution && uri.startsWith('/') && !path.startsWith(normalizeLibraryPath(publicRoot) + '/')) throw new ProductError('shared.compose', { parts: productJoin([productReference("styles.resourcePathLeavesTheVirtualWebsiteRoot"), uri]) });
  return { path, suffix };
}
export async function readLibraryFile(root: FileSystemDirectoryHandle, path: string): Promise<File> {
  const parts = normalizeLibraryPath(path).split('/');
  let directory = root;
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
  return (await directory.getFileHandle(parts.at(-1)!)).getFile();
}
export function isTailwindImport(id: string): boolean {
  return /^tailwindcss(?:\/(?:index|theme|preflight|utilities)\.css)?$/.test(id);
}
function importId(params: string): string {
  const nodes = valueParser(params).nodes.filter(node => node.type !== 'space' && node.type !== 'comment');
  const first = nodes[0];
  if (first?.type === 'string' || first?.type === 'word') return first.value;
  if (first?.type === 'function' && first.value.toLowerCase() === 'url') return valueParser.stringify(first.nodes).replace(/^(['"])(.*)\1$/, '$2');
  throw new ProductError("styles.cssImportRequiresAnExplicitFilePath");
}
function urls(value: string, visit: (uri: string) => string): string {
  const parsed = valueParser(value);
  parsed.walk(node => {
    if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
    const uri = valueParser.stringify(node.nodes).trim().replace(/^(['"])(.*)\1$/, '$2');
    const replacement = visit(uri);
    if (replacement !== uri) node.nodes = [{ type: 'string', quote: '"', value: replacement, sourceIndex: node.sourceIndex, sourceEndIndex: node.sourceEndIndex ?? node.sourceIndex + replacement.length }];
    return false;
  });
  return parsed.toString();
}
export function definedCssClasses(css: string): Set<string> {
  const classes = new Set<string>();
  postcss.parse(css).walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test((rule.parent as postcss.AtRule).name)) return;
    selectorParser(selectors => selectors.walkClasses(node => { classes.add(node.value); })).processSync(rule.selector);
  });
  return classes;
}
export function assertPortableStyles(css: string) {
  const sheet = postcss.parse(css);
  sheet.walkAtRules(rule => { if (['import', 'plugin', 'config'].includes(rule.name)) throw new ProductError("styles.aRenderedDocumentCannotIntroduceAdditionalCodeOrStyles"); });
  sheet.walkDecls(declaration => {
    if (/^(?:behavior|-moz-binding)$/i.test(declaration.prop) || /expression\s*\(|(?:javascript|vbscript)\s*:/i.test(declaration.value)) throw new ProductError("styles.theRenderedDocumentContainsExecutableDeclarations");
    urls(declaration.value, uri => {
      if (/^article-asset:[a-f0-9]{64}(?:#.*)?$/.test(uri) || uri.startsWith('#')) return uri;
      if (/^data:/i.test(uri)) { stylesheetAssetPath(uri, 'styles/render.css', 'assets'); return uri; }
      throw new ProductError('shared.compose', { parts: productJoin([productReference("styles.theRenderedDocumentContainsUnsavedResources"), uri]) });
    });
  });
}
function sourcePattern(params: string, base: string, resolution?: ResourceResolution): StyleSource | null {
  const parsed = valueParser(params).nodes.filter(node => node.type !== 'space' && node.type !== 'comment');
  const negative = parsed[0]?.type === 'word' && parsed[0].value === 'not';
  const first = parsed[negative ? 1 : 0];
  if (first?.type === 'function' && first.value === 'inline') return null;
  if (first?.type !== 'string') throw new ProductError("styles.directorySourceRequiresAnExplicitPathWithinTheLibrary");
  return { base, pattern: resolution ? resolveLibraryResource(first.value, resolution) : normalizeLibraryPath(first.value, base), negative };
}
function globPattern(pattern: string): RegExp {
  let result = '';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') { result += '(?:.*/)?'; i += 2; } else { result += '.*'; i++; }
    } else if (pattern[i] === '*') result += '[^/]*';
    else if (pattern[i] === '?') result += '[^/]';
    else if (pattern[i] === '{') {
      const end = pattern.indexOf('}', i);
      if (end < 0) throw new ProductError("styles.theSourceGlobBracketIsNotClosed");
      result += '(?:' + pattern.slice(i + 1, end).split(',').map(value => value.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')).join('|') + ')'; i = end;
    } else result += pattern[i].replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + result + '$');
}
async function sourceCandidates(root: FileSystemDirectoryHandle, sources: StyleSource[]): Promise<string[]> {
  const matches = new Set<string>(), candidates = new Set<string>();
  const excluded = sources.filter(source => source.negative).map(source => globPattern(source.pattern));
  let enumerated = 0;
  for (const source of sources.filter(item => !item.negative)) {
    const parts = source.pattern.split('/');
    const wildcard = parts.findIndex(part => /[*?{]/.test(part));
    let directoryPath = wildcard < 0 ? parts.slice(0, -1) : parts.slice(0, wildcard);
    let pattern = globPattern(source.pattern);
    let recurse = wildcard >= 0;
    if (wildcard < 0) {
      try {
        let exact = root; for (const part of parts) exact = await exact.getDirectoryHandle(part);
        directoryPath = parts; pattern = globPattern(source.pattern + '/**'); recurse = true;
      } catch (error) { if (!(error instanceof DOMException && ['NotFoundError', 'TypeMismatchError'].includes(error.name))) throw error; }
    }
    let directory = root;
    for (const part of directoryPath) directory = await directory.getDirectoryHandle(part);
    const scan = async (node: FileSystemDirectoryHandle, base: string): Promise<void> => {
      for await (const [name, entry] of node.entries()) {
        if (++enumerated > 50000) throw new ProductError("styles.theExplicitSourceEnumerationRangeExceedsTheLimit");
        if (name.startsWith('.') || name === 'node_modules' || name === 'history') continue;
        const path = base ? base + '/' + name : name;
        if (entry.kind === 'directory') {
          if (recurse) await scan(await node.getDirectoryHandle(name), path);
        } else if (pattern.test(path) && !excluded.some(exclude => exclude.test(path))) matches.add(path);
        if (matches.size > STYLE_LIMITS.sourceFiles) throw new ProductError("styles.theExplicitSourceFileCountExceedsTheLimit");
      }
    };
    await scan(directory, directoryPath.join('/'));
  }
  for (const path of matches) {
    const file = await readLibraryFile(root, path);
    if (file.size > STYLE_LIMITS.cssFileBytes) throw new ProductError('shared.compose', { parts: productJoin([productReference("styles.theSourceFileIsTooLarge"), path]) });
    const text = await file.text();
    for (const candidate of text.split(/[\s"'<>={}]+/)) if (candidate && candidate.length <= 256) candidates.add(candidate);
  }
  return [...candidates];
}
export async function loadStylesheetEnvironment(root: FileSystemDirectoryHandle, policy: StylesheetsPolicy, resolution?: ResourceResolution): Promise<StylesheetEnvironment> {
  if (!/\.css$/i.test(policy.entry)) throw new ProductError("styles.theStyleEntryMustBeACssFile");
  const rawFiles: Record<string, string> = {}, files: Record<string, string> = {};
  const assetPaths = new Set<string>(), sources: StyleSource[] = [];
  const assetOrigins = new Map<string, string>();
  const visiting = new Set<string>(), complete = new Set<string>();
  const assets: CssAsset[] = [];
  let cssBytes = 0, assetBytes = 0;
  const load = async (path: string, chain: string[]): Promise<void> => {
    assertDeclaredResource(path, resolution);
    if (!/\.css$/i.test(path)) throw new ProductError('shared.compose', { parts: productJoin([productReference("styles.onlyCssFilesCanBeImported"), path]) });
    if (visiting.has(path)) throw new ProductError('shared.compose', { parts: productJoin([productReference("styles.circularCssImport"), [...chain, path].join(' → ')]) });
    if (complete.has(path)) return;
    if (chain.length >= STYLE_LIMITS.depth || complete.size + visiting.size >= STYLE_LIMITS.cssFiles) throw new ProductError("styles.cssImportDepthOrFileCountExceedsTheLimit");
    visiting.add(path);
    let file: File;
    try { file = await readLibraryFile(root, path); }
    catch (error) { throw new ProductError('shared.compose', { parts: productJoin([productJoin([productJoin([productReference("styles.cssReadingFailed"), [...chain, path].join(' → ')]), '；']), productCause(error)]) }); }
    cssBytes += file.size;
    if (file.size > STYLE_LIMITS.cssFileBytes || cssBytes > STYLE_LIMITS.cssBytes) throw new ProductError('shared.compose', { parts: productJoin([productReference("styles.cssExceedsTheSizeLimit"), path]) });
    const css = await file.text();
    rawFiles[path] = css;
    const sheet = postcss.parse(css, { from: path });
    const imports: string[] = [];
    sheet.walkAtRules(rule => {
      if (['plugin', 'config'].includes(rule.name)) throw rule.error(productText("styles.libraryCssDoesNotExecuteJsPluginsOrConfiguration"));
      if (rule.name === 'import') {
        const id = importId(rule.params);
        if (!isTailwindImport(id)) {
          if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(id)) throw rule.error(productText("styles.cssImportsMustRemainWithinTheAuthorizedLibrary"));
          const dependency = resolution ? resolveLibraryResource(id, resolution) : normalizeLibraryPath(id, path.split('/').slice(0, -1).join('/'));
          assertDeclaredResource(dependency, resolution);
          imports.push(dependency);
          if (resolution) rule.params = rule.params.replace(id, dependency);
        }
      } else if (rule.name === 'source') {
        const source = sourcePattern(rule.params, path.split('/').slice(0, -1).join('/'), resolution);
        if (source) sources.push(source);
      }
    });
    sheet.walkDecls(declaration => {
      if (/^(?:behavior|-moz-binding)$/i.test(declaration.prop) || /expression\s*\(|(?:javascript|vbscript)\s*:/i.test(declaration.value)) throw declaration.error(productText("styles.cssContainsExecutableContent"));
      urls(declaration.value, uri => {
        const asset = stylesheetAssetPath(uri, path, policy.publicRoot, resolution);
        if (asset) { assetPaths.add(asset.path); assetOrigins.set(asset.path, [...chain, path].join(' → ')); }
        return uri;
      });
    });
    if (assetPaths.size > STYLE_LIMITS.assets) throw new ProductError("styles.theStylesheetResourceCountExceedsTheLimit");
    for (const dependency of imports) await load(dependency, [...chain, path]);
    visiting.delete(path); complete.add(path);
  };
  try {
    const effectivePolicy = resolution ? { ...policy, entry: resolveLibraryResource(policy.entry, resolution) } : policy;
    await load(normalizeLibraryPath(effectivePolicy.entry), []);
    for (const path of assetPaths) {
      const mime = MIME[path.split('.').at(-1)?.toLowerCase() ?? ''];
      if (!mime) throw new ProductError('shared.compose', { parts: productJoin([productReference("styles.unsupportedStylesheetResourceType"), path]) });
      let file: File;
      try { file = await readLibraryFile(root, path); }
      catch (error) { throw new ProductError('shared.compose', { parts: productJoin([productJoin([productJoin([productJoin([productJoin([productReference("styles.stylesheetResourceReadingFailed"), assetOrigins.get(path)]), ' → ']), path]), '；']), productCause(error)]) }); }
      assetBytes += file.size;
      if (assetBytes > STYLE_LIMITS.assetBytes) throw new ProductError("styles.stylesheetResourcesExceed256MbInTotal");
      const blob = new Blob([await file.arrayBuffer()], { type: mime });
      const hash = await contentHash(blob);
      assets.push(Object.freeze({ path, hash, mime, blob, url: URL.createObjectURL(blob) }));
    }
    const byPath = new Map(assets.map(asset => [asset.path, asset]));
    const classes = new Set<string>();
    for (const [path, css] of Object.entries(rawFiles)) {
      const sheet = postcss.parse(css, { from: path });
      sheet.walkDecls(declaration => {
        declaration.value = urls(declaration.value, uri => {
          const ref = stylesheetAssetPath(uri, path, policy.publicRoot, resolution);
          return ref ? byPath.get(ref.path)!.url + ref.suffix : uri;
        });
      });
      if (resolution) sheet.walkAtRules('import', rule => {
        const id = importId(rule.params);
        if (!isTailwindImport(id)) rule.params = rule.params.replace(id, resolveLibraryResource(id, resolution));
      });
      files[path] = sheet.toString();
      definedCssClasses(css).forEach(name => classes.add(name));
    }
    const fingerprint = await contentHash(JSON.stringify({ policy: effectivePolicy, ...(resolution ? { resolution } : {}), files: rawFiles, assets: assets.map(asset => ({ path: asset.path, hash: asset.hash })) }));
    const candidates = await sourceCandidates(root, sources);
    const pendingAssets = new Map<string, Promise<CssAsset>>();
    let disposed = false;
    const resolveAsset = (path: string): Promise<CssAsset> => {
      const known = byPath.get(path);
      if (known) return Promise.resolve(known);
      let pending = pendingAssets.get(path);
      if (!pending) {
        pending = (async () => {
          if (byPath.size >= STYLE_LIMITS.assets) throw new ProductError("styles.theStylesheetResourceCountExceedsTheLimit");
          const mime = MIME[path.split('.').at(-1)?.toLowerCase() ?? ''];
          if (!mime) throw new ProductError('shared.compose', { parts: productJoin([productReference("styles.unsupportedStylesheetResourceType"), path]) });
          const file = await readLibraryFile(root, path);
          assetBytes += file.size;
          if (assetBytes > STYLE_LIMITS.assetBytes) throw new ProductError("styles.stylesheetResourcesExceed256MbInTotal");
          const blob = new Blob([await file.arrayBuffer()], { type: mime });
          if (disposed) throw new ProductError("styles.theLibraryStylesheetEnvironmentIsClosed");
          const asset = Object.freeze({ path, mime, blob, hash: await contentHash(blob), url: URL.createObjectURL(blob) });
          byPath.set(path, asset); assets.push(asset); return asset;
        })();
        pendingAssets.set(path, pending);
        pending.catch(() => pendingAssets.delete(path));
      }
      return pending;
    };
    const resolveCss = async (css: string, source: string) => {
      const sheet = postcss.parse(css, { from: source });
      const references = new Map<string, { path: string; suffix: string }>();
      sheet.walkDecls(declaration => {
        if (/^(?:behavior|-moz-binding)$/i.test(declaration.prop) || /expression\s*\(|(?:javascript|vbscript)\s*:/i.test(declaration.value)) throw declaration.error(productText("styles.cssContainsExecutableContent"));
        urls(declaration.value, uri => {
          if (assets.some(asset => uri === asset.url || uri.startsWith(asset.url + '#'))) return uri;
          const ref = stylesheetAssetPath(uri, source, policy.publicRoot, resolution);
          if (ref) references.set(uri, ref); return uri;
        });
      });
      await Promise.all([...references.values()].map(ref => resolveAsset(ref.path)));
      sheet.walkDecls(declaration => { declaration.value = urls(declaration.value, uri => { const ref = references.get(uri); return ref ? byPath.get(ref.path)!.url + ref.suffix : uri; }); });
      return sheet.toString();
    };
    return Object.freeze({ policy: Object.freeze(effectivePolicy), ...(resolution ? { resolution } : {}), rawFiles: Object.freeze(rawFiles), files: Object.freeze(files), get assets() { return Object.freeze([...assets]); }, classes, sources: Object.freeze(sources), candidates: Object.freeze(candidates), fingerprint, resolveCss,
      dispose: () => { disposed = true; for (const asset of assets) URL.revokeObjectURL(asset.url); } });
  } catch (error) {
    for (const asset of assets) URL.revokeObjectURL(asset.url);
    throw new ProductError('shared.compose', { parts: productJoin([productReference("styles.libraryStylesAreUnavailable"), productCause(error)]) });
  }
}
