import postcss from 'postcss';
import { ProductError, productCause } from '../i18n/productMessages';
import { canonicalFormatJson } from './config';
import { getFormatSnapshot, type FormatSnapshot } from './runtime';
import { PACKAGE_LIMITS, readRendererPackage, validateRendererPackage, rendererFilePath, rendererPackageData } from './package';
import { verifiesSha256 } from './resourcePaths';
import { resolveLibraryConfiguration, validateLibraryConfiguration } from './libraryConfiguration';
import { contentHash, normalizeLibraryPath, readLibraryFile, STYLE_LIMITS } from './styles';

export type LibraryCssSource = Readonly<{
  root: FileSystemDirectoryHandle; snapshot: FormatSnapshot; path: string;
  text: string; hash: string; configText: string | null;
}>;

/** File declarations identify editable sources, not a reverse mapping of generated CSS. */
export function libraryCssPaths(snapshot: FormatSnapshot): string[] {
  if (snapshot.error) return [];
  return snapshot.renderer
    ? snapshot.renderer.declaration.files.filter(file => /\.css$/i.test(file.path) && !file.encoding).map(file => rendererFilePath(snapshot.renderer!.declaration, file.path))
    : Object.keys(snapshot.environment?.rawFiles ?? {}).filter(path => /\.css$/i.test(path));
}
async function fileHandle(root: FileSystemDirectoryHandle, path: string) {
  const parts = normalizeLibraryPath(path).split('/'); let directory = root;
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
  return directory.getFileHandle(parts.at(-1)!);
}
function assertCurrent(snapshot: FormatSnapshot, isCurrent: () => boolean) {
  if (!isCurrent() || snapshot.id !== getFormatSnapshot().id) throw new ProductError('libraryCss.changed');
}

export async function readLibraryCss(root: FileSystemDirectoryHandle, snapshot: FormatSnapshot, path: string, isCurrent: () => boolean): Promise<LibraryCssSource> {
  assertCurrent(snapshot, isCurrent);
  if (!libraryCssPaths(snapshot).includes(path)) throw new ProductError('libraryCss.notDeclared');
  const file = await readLibraryFile(root, path);
  if (file.size > (snapshot.renderer ? PACKAGE_LIMITS.fileBytes : STYLE_LIMITS.cssFileBytes)) throw new ProductError('libraryCss.tooLarge');
  const hash = await contentHash(file);
  let configText: string | null = null;
  if (snapshot.renderer) {
    const ref = snapshot.renderer.declaration.files.find(file => rendererFilePath(snapshot.renderer!.declaration, file.path) === path)!;
    configText = await (await readLibraryFile(root, 'format/config.json')).text();
    const config = validateLibraryConfiguration(JSON.parse(configText));
    if (hash !== await contentHash(snapshot.renderer.files[ref.path]) || canonicalFormatJson(config.renderer) !== canonicalFormatJson(snapshot.renderer.declaration)
      || !snapshot.rawBundle || canonicalFormatJson(resolveLibraryConfiguration(snapshot.rawBundle, config)) !== canonicalFormatJson(snapshot.configuration)) throw new ProductError('libraryCss.changed');
  } else if (await file.text() !== snapshot.environment?.rawFiles[path]) throw new ProductError('libraryCss.changed');
  // Keep BOM bytes in the editable source; File.text() deliberately strips them.
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
  assertCurrent(snapshot, isCurrent);
  return { root, snapshot, path, text, hash, configText };
}

export async function saveLibraryCss(source: LibraryCssSource, text: string, isCurrent: () => boolean): Promise<void> {
  const { root, snapshot, path } = source;
  assertCurrent(snapshot, isCurrent);
  if (!libraryCssPaths(snapshot).includes(path)) throw new ProductError('libraryCss.notDeclared');
  const nextFile = new Blob([text]);
  const maxBytes = snapshot.renderer ? PACKAGE_LIMITS.fileBytes : STYLE_LIMITS.cssFileBytes;
  if (nextFile.size > maxBytes) throw new ProductError('libraryCss.tooLarge');
  postcss.parse(text, { from: path });
  const permission = root as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
  };
  if (permission.queryPermission && await permission.queryPermission({ mode: 'readwrite' }) !== 'granted'
    && (!permission.requestPermission || await permission.requestPermission({ mode: 'readwrite' }) !== 'granted')) throw new ProductError('libraryCss.permission');
  const cssHandle = await fileHandle(root, path);
  const original = await cssHandle.getFile();
  if (original.size > maxBytes || await contentHash(original) !== source.hash) throw new ProductError('libraryCss.changed');
  const nextHash = await contentHash(nextFile);
  let configHandle: FileSystemFileHandle | null = null, nextConfig: string | null = null;
  if (snapshot.renderer && source.configText !== null) {
    configHandle = await fileHandle(root, 'format/config.json');
    if (await (await configHandle.getFile()).text() !== source.configText) throw new ProductError('libraryCss.changed');
    const config = validateLibraryConfiguration(JSON.parse(source.configText));
    const current = await readRendererPackage(root, config.renderer!, config);
    if (current.fingerprint !== snapshot.renderer.fingerprint) throw new ProductError('libraryCss.changed');
    const ref = config.renderer!.files.find(file => rendererFilePath(config.renderer!, file.path) === path)!;
    if (verifiesSha256(config)) config.renderer = { ...config.renderer!, files: config.renderer!.files.map(file => file.path === ref.path ? { ...file, sha256: nextHash } : file) };
    validateLibraryConfiguration(config);
    const candidate = rendererPackageData({ ...current, declaration: config.renderer!, files: { ...current.files, [ref.path]: text } });
    await validateRendererPackage({ ...candidate, fingerprint: await contentHash(canonicalFormatJson(candidate)) });
    if (verifiesSha256(config)) nextConfig = JSON.stringify(config, null, 2) + '\n';
  }
  const check = async () => {
    assertCurrent(snapshot, isCurrent);
    if (await contentHash(await cssHandle.getFile()) !== source.hash || configHandle && await (await configHandle.getFile()).text() !== source.configText) throw new ProductError('libraryCss.changed');
    assertCurrent(snapshot, isCurrent);
  };
  let cssStream: FileSystemWritableFileStream | null = null, configStream: FileSystemWritableFileStream | null = null;
  let committed = false;
  try {
    await check(); cssStream = await cssHandle.createWritable();
    if (configHandle && nextConfig !== null) configStream = await configHandle.createWritable();
    await cssStream.write(nextFile);
    if (configStream) await configStream.write(nextConfig!);
    await check();
    await cssStream.close(); cssStream = null; committed = true;
    if (configStream) {
      assertCurrent(snapshot, isCurrent);
      if (await (await configHandle!.getFile()).text() !== source.configText || await contentHash(await cssHandle.getFile()) !== nextHash) throw new ProductError('libraryCss.changed');
      assertCurrent(snapshot, isCurrent);
      await configStream.close(); configStream = null;
    }
    if (await contentHash(await cssHandle.getFile()) !== nextHash || configHandle && await (await configHandle.getFile()).text() !== (nextConfig ?? source.configText)) throw new ProductError('libraryCss.changed');
  } catch (error) {
    try { await cssStream?.abort(); } catch { /* Keep the original failure. */ }
    try { await configStream?.abort(); } catch { /* Keep the original failure. */ }
    // A file close is atomic, but two independent file closes are not a transaction.
    const hash = await cssHandle.getFile().then(contentHash).catch(() => null);
    const config = configHandle ? await configHandle.getFile().then(file => file.text()).catch(() => null) : null;
    if (hash === nextHash && (!configHandle || config === (nextConfig ?? source.configText))) return;
    if (committed || hash !== source.hash) {
      try {
        assertCurrent(snapshot, isCurrent);
        if (hash !== nextHash || configHandle && config !== source.configText) throw error;
        const rollback = await cssHandle.createWritable();
        try {
          await rollback.write(original);
          assertCurrent(snapshot, isCurrent);
          if (await contentHash(await cssHandle.getFile()) !== nextHash || configHandle && await (await configHandle.getFile()).text() !== source.configText) throw error;
          await rollback.close();
        } catch (failure) { try { await rollback.abort(); } catch { /* Preserve rollback failure. */ } throw failure; }
      } catch { throw new ProductError('libraryCss.partial', { path, cause: productCause(error) }); }
    }
    throw error;
  }
}
