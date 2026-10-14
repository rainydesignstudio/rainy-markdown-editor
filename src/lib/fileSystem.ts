import { ProductError, productCause, productMessage, productReference, productText } from "./i18n/productMessages";
import { initializeLibraryFormat } from './article-format/library';
import { readRenderRecord, renderRecordMatches, writeRenderRecord, type RenderRecord } from './article-format/renderRecords';
import { parseArticle, updateFrontMatter } from './frontMatter';
import { getTheme } from './themes';
import { parseThemeConfigJson, validateThemeConfig, validateThemeFormat } from './themeValidation';
import { getThemeDirectory } from './themeDirectories';
import type { ArticleDiagnostic, ArticleMeta, ArticleSummary, ArticleIndexIssue, SaveResult, StoredArticle, ThemeConfig } from './types';

type DirectoryHandle = FileSystemDirectoryHandle;

function isDirectoryHandle(value: unknown): value is DirectoryHandle {
  return typeof value === 'object' && value !== null && (value as { kind?: string }).kind === 'directory';
}

function diagnostic(message: string): ArticleDiagnostic {
  return { level: 'error', message };
}

function isValidMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function assertMonthKey(value: string): string {
  if (!isValidMonthKey(value)) throw new ProductError("fileSystem.invalidArticleMonthDirectoryOnlyYyyyMmIsAccepted", { "value": value });
  return value;
}

async function ensurePermission(handle: DirectoryHandle): Promise<void> {
  const candidate = handle as DirectoryHandle & {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };
  if (!candidate.queryPermission) return;
  const descriptor = { mode: 'readwrite' as const };
  let permission = await candidate.queryPermission(descriptor);
  if (permission !== 'granted' && candidate.requestPermission) permission = await candidate.requestPermission(descriptor);
  if (permission !== 'granted') throw new ProductError("fileSystem.theLibraryLacksReadWritePermissionAuthorizeItAgainBeforeSaving");
}

async function getOrCreateDirectory(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

async function getOrCreateFile(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemFileHandle> {
  return parent.getFileHandle(name, { create: true });
}

async function readText(parent: FileSystemDirectoryHandle, name: string): Promise<string> {
  const file = await parent.getFileHandle(name);
  return (await file.getFile()).text();
}

async function writeText(parent: FileSystemDirectoryHandle, name: string, content: string): Promise<void> {
  const file = await getOrCreateFile(parent, name);
  const writable = await file.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickDataDirectory(): Promise<DirectoryHandle> {
  if (!supportsFileSystemAccess()) throw new ProductError("fileSystem.thisBrowserDoesNotSupportDirectoryAuthorizationUseDesktopChromeOrEdge");
  const picker = (window as unknown as Window & {
    showDirectoryPicker: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker;
  const handle = await picker({ mode: 'readwrite' });
  await ensurePermission(handle);
  return handle;
}

const DATA_DIRECTORY_NAMES = ['themes', 'snippets', 'templates', 'articles'] as const;

export async function assertExistingDataDirectory(handle: DirectoryHandle): Promise<void> {
  await ensurePermission(handle);
  const names = new Set<string>();
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === 'directory') names.add(name);
  }
  if (DATA_DIRECTORY_NAMES.some(name => !names.has(name))) {
    throw new ProductError("fileSystem.theSelectedDirectoryIsNotACompleteLibraryToCreateOneEnter");
  }
}

export function normalizeDataDirectoryName(input: string): string {
  const name = input.normalize('NFKC').trim();
  if (!name || name.length > 80 || name === '.' || name === '..' || /[\\/:*?"<>|\u0000-\u001f]|[. ]$/.test(name)) {
    throw new ProductError("fileSystem.theLibraryNameMustContain180CharactersWithoutPathSeparatorsReserved");
  }
  return name;
}

export async function createNamedDataDirectory(parent: DirectoryHandle, input: string): Promise<DirectoryHandle> {
  await ensurePermission(parent);
  const name = normalizeDataDirectoryName(input);
  for await (const [existing] of parent.entries()) {
    if (existing.normalize('NFKC').toLowerCase() === name.toLowerCase()) {
      throw new ProductError("fileSystem.alreadyExistsInTheParentDirectoryChooseAnotherNameOrOpenThe", { "name": name });
    }
  }
  const child = await parent.getDirectoryHandle(name, { create: true });
  for await (const _entry of child.entries()) {
    throw new ProductError("fileSystem.alreadyContainsFilesTheDirectoryIsUnchangedChooseAnotherNameOrOpen", { "name": name });
  }
  try {
    await ensureArticleDirectories(child);
    await initializeLibraryFormat(child);
  } catch (error) {
    let rollbackSafe = true;
    for await (const [entryName, entry] of child.entries()) {
      if (entry.kind !== 'directory' || !DATA_DIRECTORY_NAMES.some(expected => expected === entryName)) {
        rollbackSafe = false;
        break;
      }
      const generated = await child.getDirectoryHandle(entryName);
      for await (const _entry of generated.entries()) {
        rollbackSafe = false;
        break;
      }
      if (!rollbackSafe) break;
    }
    if (!rollbackSafe) {
      throw new ProductError("fileSystem.libraryInitializationFailedNewDirectoryContainsOtherContentAndWasNotCleaned", { "name": name, "cause": productCause(error) });
    }
    try {
      await parent.removeEntry(name, { recursive: true });
    } catch (rollbackError) {
      throw new ProductError("fileSystem.libraryInitializationFailedAndNewDirectoryCouldNotBeCleaned", { "name": name, "cause": productCause(rollbackError) });
    }
    throw error;
  }
  return child;
}

export function displayDirectoryName(handle: DirectoryHandle): string {
  return handle.name || productText("fileSystem.authorizedLibraryDirectory");
}

export function monthKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function sanitizeFolderName(value: string): string {
  const normalized = value.normalize('NFKC');
  const cleaned = normalized
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim();
  return (cleaned || '未命名文稿').slice(0, 80);
}

async function uniqueFolderName(monthDirectory: FileSystemDirectoryHandle, desired: string): Promise<string> {
  const base = sanitizeFolderName(desired);
  const names = new Set<string>();
  for await (const [name, entry] of monthDirectory.entries()) {
    if (entry.kind === 'directory') names.add(name.normalize('NFKC').toLowerCase());
  }
  if (!names.has(base.normalize('NFKC').toLowerCase())) return base;
  let count = 2;
  while (names.has(`${base}-${count}`.normalize('NFKC').toLowerCase())) count += 1;
  return `${base}-${count}`;
}

function isThemeConfig(value: unknown): value is ThemeConfig {
  return validateThemeConfig(value).length === 0;
}

export type ThemeLibraryIssue = { file: string; message: string };
export type ThemeLibraryResult = { themes: ThemeConfig[]; issues: ThemeLibraryIssue[] };

function assertThemeId(id: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) throw new ProductError("fileSystem.theThemeIdIsUnsafeOnlyLowercaseLettersNumbersAndHyphensAre");
  return id;
}

async function writeThemeFile(directory: DirectoryHandle, theme: ThemeConfig): Promise<void> {
  const filename = `${assertThemeId(theme.id)}.json`;
  let file: FileSystemFileHandle;
  let created = false;
  try {
    file = await directory.getFileHandle(filename);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    file = await directory.getFileHandle(filename, { create: true });
    created = true;
  }
  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await file.createWritable();
    await writable.write(JSON.stringify(theme, null, 2));
    await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch { /* keep the original write error */ }
    if (created) {
      try { await directory.removeEntry(filename); } catch { /* report the original write error */ }
    }
    throw new ProductError("fileSystem.themeFileCouldNotBeSaved", { "filename": filename, "cause": productCause(error) });
  }
}

function stableThemeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableThemeValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableThemeValue(item)]));
}

function themeContentChanged(previous: ThemeConfig, next: ThemeConfig): boolean {
  const { version: _previousVersion, ...previousContent } = previous;
  const { version: _nextVersion, ...nextContent } = next;
  return JSON.stringify(stableThemeValue(previousContent)) !== JSON.stringify(stableThemeValue(nextContent));
}

function nextThemeVersion(version: string): string {
  const parts = version.split('.').map((part) => Number(part));
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join('.');
}

export async function loadThemeLibrary(root: DirectoryHandle): Promise<ThemeLibraryResult> {
  await ensurePermission(root);
  const { directory, issues } = await getThemeDirectory(root, 'article-themes');
  const entries: Array<[string, FileSystemFileHandle | FileSystemDirectoryHandle]> = [];
  for await (const [name, entry] of directory.entries()) entries.push([name, entry]);

  const themes: ThemeConfig[] = [];
  const seenIds = new Set<string>();
  for (const [filename, entry] of entries) {
    if (entry.kind !== 'file' || !filename.endsWith('.json')) continue;
    if (!/^[a-z0-9][a-z0-9-]{0,47}\.json$/.test(filename)) {
      issues.push({ file: filename, ...productMessage("fileSystem.theThemeFilenameIsUnsafeUseIdJsonWithoutAPath") });
      continue;
    }
    try {
      const theme = parseThemeConfigJson(await readText(directory, filename));
      if (theme.id !== filename.slice(0, -5)) throw new ProductError("editorThemeLibrary.theFilenameDoesNotMatchTheThemeId");
      if (seenIds.has(theme.id)) throw new ProductError("fileSystem.themeIdIsDuplicated", { "themeId": theme.id });
      seenIds.add(theme.id);
      themes.push(theme);
    } catch (error) {
      issues.push({ file: filename, message: error instanceof Error ? error.message : String(error) });
    }
  }
  themes.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  return { themes, issues };
}

export async function saveThemeLibraryTheme(root: DirectoryHandle, input: ThemeConfig): Promise<ThemeConfig> {
  await ensurePermission(root);
  const errors = [...validateThemeConfig(input), ...validateThemeFormat(input)];
  if (errors.length) throw new ProductError("fileSystem.themeConfigurationValidationFailed", { "details": errors.join('；') });
  const { directory } = await getThemeDirectory(root, 'article-themes');
  const filename = `${assertThemeId(input.id)}.json`;
  let previous: ThemeConfig | null = null;
  try {
    previous = parseThemeConfigJson(await readText(directory, filename));
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
      throw new ProductError("fileSystem.theExistingThemeFileCannotBeUpdatedSafely", { "cause": productCause(error) });
    }
  }
  const saved = previous
    ? { ...input, version: themeContentChanged(previous, input) ? nextThemeVersion(previous.version) : previous.version }
    : input;
  await writeThemeFile(directory, saved);
  return saved;
}

export async function deleteThemeLibraryTheme(root: DirectoryHandle, id: string): Promise<void> {
  await ensurePermission(root);
  assertThemeId(id);
  const library = await loadThemeLibrary(root);
  if (!library.themes.some((theme) => theme.id === id)) throw new ProductError("fileSystem.themeWasNotFound", { "id": id });
  if (library.themes.length <= 1) throw new ProductError("fileSystem.theThemeLibraryMustRetainAtLeastOneThemeImportOrCopy");
  const { directory } = await getThemeDirectory(root, 'article-themes');
  await directory.removeEntry(`${id}.json`);
}

type ThemeReadResult = {
  theme: ThemeConfig;
  valid: boolean;
  diagnostics: ArticleDiagnostic[];
};

async function readTheme(articleDirectory: FileSystemDirectoryHandle, metadata: ArticleMeta): Promise<ThemeReadResult> {
  let raw: string;
  try {
    raw = await readText(articleDirectory, 'theme.json');
  } catch {
    return {
      theme: getTheme(metadata.theme?.id),
      valid: false,
      diagnostics: [diagnostic(productText("fileSystem.theArticleHasNoThemeJsonSnapshotBindAThemeAgainAnd"))],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      theme: getTheme(metadata.theme?.id),
      valid: false,
      diagnostics: [diagnostic(productText("fileSystem.themeJsonIsNotValidJson", { "cause": productCause(error) }))],
    };
  }
  if (!isThemeConfig(parsed)) {
    return {
      theme: getTheme(metadata.theme?.id),
      valid: false,
      diagnostics: [diagnostic(productText("fileSystem.themeJsonIsIncompleteTheLatestGlobalThemeWasNotSubstitutedSilently"))],
    };
  }
  const diagnostics: ArticleDiagnostic[] = [];
  if (parsed.id !== metadata.theme?.id || parsed.version !== metadata.theme?.version) {
    diagnostics.push(diagnostic(productText("fileSystem.articleFrontMatterBindsButTheThemeSnapshotIsBindTheTheme", { "value": (metadata.theme?.id ?? productReference("fileSystem.unknown")), "value2": (metadata.theme?.version ?? productReference("fileSystem.unknown")), "parsedId": parsed.id, "parsedVersion": parsed.version })));
  }
  return { theme: parsed, valid: diagnostics.length === 0, diagnostics };
}

function withThemeDiagnostics(stored: Omit<StoredArticle, 'themeValid'>, themeResult: ThemeReadResult): StoredArticle {
  return {
    ...stored,
    theme: themeResult.theme,
    themeValid: themeResult.valid,
    parse: {
      ...stored.parse,
      diagnostics: [...stored.parse.diagnostics, ...themeResult.diagnostics],
      canCopy: stored.parse.canCopy && themeResult.valid,
    },
  };
}

async function readStoredArticle(month: string, folder: string, articleDirectory: FileSystemDirectoryHandle): Promise<StoredArticle> {
  let source = '';
  let parse = parseArticle('');
  try {
    source = await readText(articleDirectory, 'article.md');
    parse = parseArticle(source);
  } catch (error) {
    parse = {
      ...parse,
      diagnostics: [diagnostic(productText("fileSystem.theArticleHasNoArticleMdOrItCouldNotBeRead", { "cause": productCause(error) }))],
      canCopy: false,
    };
  }
  const themeResult = await readTheme(articleDirectory, parse.metadata);
  return withThemeDiagnostics(
    {
      id: `${month}/${folder}`,
      folder,
      month,
      source,
      theme: themeResult.theme,
      filePath: `articles/${month}/${folder}/article.md`,
      parse,
    },
    themeResult,
  );
}

async function listMonthDirectories(articlesDirectory: FileSystemDirectoryHandle): Promise<string[]> {
  const months: string[] = [];
  for await (const [name, entry] of articlesDirectory.entries()) {
    if (entry.kind === 'directory' && isValidMonthKey(name)) months.push(name);
  }
  return months.sort().reverse();
}

export async function listStoredArticles(root: DirectoryHandle): Promise<StoredArticle[]> {
  await ensurePermission(root);
  const articlesDirectory = await getOrCreateDirectory(root, 'articles');
  const results: StoredArticle[] = [];
  for (const month of await listMonthDirectories(articlesDirectory)) {
    const monthDirectory = await articlesDirectory.getDirectoryHandle(month);
    for await (const [folder, entry] of monthDirectory.entries()) {
      if (entry.kind !== 'directory') continue;
      const articleDirectory = await monthDirectory.getDirectoryHandle(folder);
      results.push(await readStoredArticle(month, folder, articleDirectory));
    }
  }
  return results.sort((a, b) => (b.parse.metadata.updatedAt || '').localeCompare(a.parse.metadata.updatedAt || ''));
}

export function articleSummary(article: StoredArticle): ArticleSummary {
  return {
    id: article.id, folder: article.folder, month: article.month, filePath: article.filePath,
    parse: { metadata: article.parse.metadata, diagnostics: article.parse.diagnostics },
    theme: { id: article.theme.id, name: article.theme.name, version: article.theme.version },
    indexState: 'ready',
  };
}

export async function readStoredArticleById(root: DirectoryHandle, month: string, folder: string): Promise<StoredArticle> {
  const directory = await getStoredArticleDirectory(root, month, folder);
  const article = await readStoredArticle(month, folder, directory);
  try {
    article.renderRecord = await readRenderRecord(directory);
    if (article.renderRecord && !await renderRecordMatches(article.renderRecord, article.source, article.theme)) article.renderIssue = productText("fileSystem.theRenderRecordDoesNotMatchTheBodyOrThemeUpdateStyles");
  } catch (error) { article.renderIssue = productText("fileSystem.theRenderRecordCouldNotBeRead") + (error instanceof Error ? error.message : String(error)); }
  return article;
}

export async function listArticleSummaries(root: DirectoryHandle): Promise<{ articles: ArticleSummary[]; issues: ArticleIndexIssue[]; months: string[] }> {
  await ensurePermission(root);
  const articlesDirectory = await root.getDirectoryHandle('articles');
  const articles: ArticleSummary[] = [];
  const issues: ArticleIndexIssue[] = [];
  const months = await listMonthDirectories(articlesDirectory);
  for (const month of months) {
    const monthDirectory = await articlesDirectory.getDirectoryHandle(month);
    try {
      const value: unknown = JSON.parse(await readText(monthDirectory, 'index.json'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProductError("fileSystem.indexJsonIsNotAnObject");
      let incomplete = false;
      for (const [folder, raw] of Object.entries(value)) {
        assertStoredTarget(month, folder);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ProductError("fileSystem.indexEntryIsInvalid", { "folder": folder });
        const entry = raw as Record<string, unknown>;
        const binding = entry.theme as Record<string, unknown> | undefined;
        if (typeof entry.title !== 'string' || !Array.isArray(entry.categories) || entry.categories.some(item => typeof item !== 'string') || typeof entry.updatedAt !== 'string' || !binding || typeof binding.id !== 'string' || typeof binding.version !== 'string') throw new ProductError("fileSystem.requiredFieldsInIndexEntryAreInvalid", { "folder": folder });
        const ready = entry.summaryVersion === 1 && typeof entry.description === 'string' && typeof entry.author === 'string' && typeof entry.createdAt === 'string' && Array.isArray(entry.diagnostics);
        incomplete ||= !ready;
        const diagnostics = Array.isArray(entry.diagnostics) ? entry.diagnostics.filter((item): item is ArticleDiagnostic => Boolean(item && typeof item === 'object' && ['error', 'warning', 'info'].includes(item.level) && typeof item.message === 'string' && (item.line === undefined || Number.isInteger(item.line)))) : [];
        articles.push({
          id: `${month}/${folder}`, month, folder, filePath: `articles/${month}/${folder}/article.md`,
          parse: { metadata: { title: entry.title, description: typeof entry.description === 'string' ? entry.description : '', author: typeof entry.author === 'string' ? entry.author : '', categories: entry.categories as string[], createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '', updatedAt: entry.updatedAt, theme: { id: binding.id, version: binding.version } }, diagnostics },
          theme: { id: binding.id, version: binding.version, name: typeof binding.name === 'string' ? binding.name : binding.id },
          indexState: ready ? 'ready' : 'repair-needed',
        });
      }
      if (incomplete) issues.push({ month, ...productMessage("fileSystem.theOldMonthlyIndexLacksSummaryFieldsKnownTitlesAndCategoriesRemain") });
    } catch (error) {
      issues.push({ month, ...productMessage("fileSystem.theMonthlyIndexNeedsRepair", { "cause": productCause(error) }) });
    }
  }
  return { articles: articles.sort((a, b) => b.parse.metadata.updatedAt.localeCompare(a.parse.metadata.updatedAt)), issues, months };
}

export async function rebuildArticleIndexes(root: DirectoryHandle, months: string[], signal?: AbortSignal): Promise<void> {
  await ensurePermission(root);
  const articlesDirectory = await root.getDirectoryHandle('articles');
  for (const month of [...new Set(months)]) {
    signal?.throwIfAborted();
    assertMonthKey(month);
    const directory = await articlesDirectory.getDirectoryHandle(month);
    const rebuilt = await rebuildMonthIndex(directory, signal);
    signal?.throwIfAborted();
    await writeText(directory, 'index.json', JSON.stringify(rebuilt, null, 2));
  }
}

function assertStoredTarget(month: string, folder: string): void {
  assertMonthKey(month);
  if (!folder || sanitizeFolderName(folder) !== folder || folder === '.' || folder === '..') {
    throw new ProductError("fileSystem.theArticleDirectoryNameIsUnsafeFileOperationsWereRejected");
  }
}

export async function getStoredArticleDirectory(
  root: DirectoryHandle,
  month: string,
  folder: string,
): Promise<DirectoryHandle> {
  await ensurePermission(root);
  assertStoredTarget(month, folder);
  const articlesDirectory = await root.getDirectoryHandle('articles');
  const monthDirectory = await articlesDirectory.getDirectoryHandle(month);
  return monthDirectory.getDirectoryHandle(folder);
}

export async function getArticleMediaDirectory(
  root: DirectoryHandle,
  month: string,
  folder: string,
  create = false,
): Promise<DirectoryHandle> {
  const articleDirectory = await getStoredArticleDirectory(root, month, folder);
  const mediaDirectory = await articleDirectory.getDirectoryHandle('media', { create });
  return mediaDirectory.getDirectoryHandle('image', { create });
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

async function copyDirectoryContents(source: DirectoryHandle, destination: DirectoryHandle): Promise<void> {
  for await (const [name, entry] of source.entries()) {
    if (entry.kind === 'directory') {
      const sourceChild = await source.getDirectoryHandle(name);
      const destinationChild = await destination.getDirectoryHandle(name, { create: true });
      await copyDirectoryContents(sourceChild, destinationChild);
    } else {
      const sourceFile = await source.getFileHandle(name);
      const contents = await (await sourceFile.getFile()).arrayBuffer();
      const destinationFile = await destination.getFileHandle(name, { create: true });
      const writable = await destinationFile.createWritable();
      try {
        await writable.write(contents);
      } finally {
        await writable.close();
      }
    }
  }
}

type MonthIndexResult = { updated: boolean; error?: string };

async function writeMonthIndexEntry(
  monthDirectory: DirectoryHandle,
  folder: string,
  entry: Record<string, unknown> | null,
): Promise<MonthIndexResult> {
  try {
    const current = await readText(monthDirectory, 'index.json').catch(() => '{}');
    const parsed = JSON.parse(current) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ProductError("fileSystem.indexJsonIsNotAnObject");
    const next = parsed as Record<string, unknown>;
    if (entry) next[folder] = entry;
    else delete next[folder];
    await writeText(monthDirectory, 'index.json', JSON.stringify(next, null, 2));
    return { updated: true };
  } catch (error) {
    try {
      const rebuilt = await rebuildMonthIndex(monthDirectory);
      await writeText(monthDirectory, 'index.json', JSON.stringify(rebuilt, null, 2));
      return {
        updated: true,
        error: productText("fileSystem.theOriginalMonthlyIndexCouldNotBeReadAndWasRebuiltFrom", { "cause": productCause(error) }),
      };
    } catch (rebuildError) {
      return {
        updated: false,
        error: productText("fileSystem.theMonthlyIndexWasNotUpdated", { "cause": productCause(rebuildError) }),
      };
    }
  }
}

export type CopyStoredArticleResult = {
  article: StoredArticle;
  folderCollision: boolean;
  indexUpdated: boolean;
  indexError?: string;
};

export async function copyStoredArticle(
  root: DirectoryHandle,
  month: string,
  folder: string,
  title: string,
  targetMonth = month,
  applyTheme?: ThemeConfig,
  options: { sourceOverride?: string; themeOverride?: ThemeConfig } = {},
): Promise<CopyStoredArticleResult> {
  await ensurePermission(root);
  assertStoredTarget(month, folder);
  assertMonthKey(targetMonth);
  const selectedTheme = options.themeOverride ?? applyTheme;
  if (selectedTheme) {
    const themeErrors = validateThemeConfig(selectedTheme);
    if (themeErrors.length) throw new ProductError("fileSystem.targetThemeConfigurationValidationFailed", { "details": themeErrors.join('；') });
  }
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new ProductError("fileSystem.theCopySDisplayTitleCannotBeEmpty");

  const articlesDirectory = await getOrCreateDirectory(root, 'articles');
  const sourceMonth = await articlesDirectory.getDirectoryHandle(month);
  const sourceDirectory = await sourceMonth.getDirectoryHandle(folder);
  const sourceArticle = await readStoredArticle(month, folder, sourceDirectory);
  const source = options.sourceOverride ?? sourceArticle.source;
  const parsedSource = parseArticle(source);
  if (parsedSource.diagnostics.some((item) => item.level === 'error')) {
    throw new ProductError("fileSystem.theOriginalFrontMatterHasErrorsRepairItBeforeCopying");
  }
  if (!sourceArticle.themeValid && !selectedTheme) throw new ProductError("fileSystem.theArticleThemeSnapshotIsInvalidRepairItBeforeCopying");
  const copiedTheme = selectedTheme ?? sourceArticle.theme;

  const targetMonthDirectory = await getOrCreateDirectory(articlesDirectory, targetMonth);
  const targetFolder = await uniqueFolderName(targetMonthDirectory, cleanTitle);
  try {
    await targetMonthDirectory.getDirectoryHandle(targetFolder);
    throw new ProductError("fileSystem.copyDirectoryNowConflictsWithAnotherEntryTheOriginalManuscriptIsUnchanged", { "targetFolder": targetFolder });
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  let destinationDirectory: DirectoryHandle | null = null;
  try {
    destinationDirectory = await targetMonthDirectory.getDirectoryHandle(targetFolder, { create: true });
    const timestamp = new Date().toISOString();
    const nextSource = updateFrontMatter(source, {
      title: cleanTitle,
      createdAt: timestamp,
      updatedAt: timestamp,
      theme: { id: copiedTheme.id, version: copiedTheme.version },
    });
    if (nextSource === source) throw new ProductError("fileSystem.theCopyTitleCouldNotBeUpdatedTheOriginalManuscriptIsUnchanged");
    await writeText(destinationDirectory, 'article.md', nextSource);
    await writeText(destinationDirectory, 'theme.json', JSON.stringify(copiedTheme, null, 2));
    let sourceMedia: DirectoryHandle | null = null;
    try {
      sourceMedia = await sourceDirectory.getDirectoryHandle('media');
    } catch (error) {
      if (!isNotFound(error)) {
        throw new ProductError("fileSystem.localAssetCopyingFailed", { "cause": productCause(error) });
      }
    }
    if (sourceMedia) {
      try {
        const destinationMedia = await destinationDirectory.getDirectoryHandle('media', { create: true });
        await copyDirectoryContents(sourceMedia, destinationMedia);
      } catch (error) {
        throw new ProductError("fileSystem.localAssetCopyingFailed", { "cause": productCause(error) });
      }
    }

    const originalRender = await readRenderRecord(sourceDirectory);
    if (originalRender && await renderRecordMatches(originalRender, nextSource, copiedTheme)) await writeRenderRecord(destinationDirectory, originalRender);
    const copied = await readStoredArticleById(root, targetMonth, targetFolder);
    const index = await writeMonthIndexEntry(targetMonthDirectory, targetFolder, indexEntry(copied));
    return {
      article: copied,
      folderCollision: targetFolder !== sanitizeFolderName(cleanTitle),
      indexUpdated: index.updated,
      indexError: index.error,
    };
  } catch (error) {
    if (destinationDirectory) {
      try {
        await targetMonthDirectory.removeEntry(targetFolder, { recursive: true });
      } catch (cleanupError) {
        throw new ProductError("fileSystem.cleanupOfIncompleteCopyDirectoryAlsoFailedTheOriginalManuscriptIsUnchanged", { "cause": productCause(error), "targetFolder": targetFolder, "cause2": productCause(cleanupError) });
      }
    }
    throw error;
  }
}

export type DeleteStoredArticleResult = { indexUpdated: boolean; indexError?: string };

export async function deleteStoredArticle(root: DirectoryHandle, month: string, folder: string): Promise<DeleteStoredArticleResult> {
  await ensurePermission(root);
  assertStoredTarget(month, folder);
  const articlesDirectory = await getOrCreateDirectory(root, 'articles');
  const monthDirectory = await articlesDirectory.getDirectoryHandle(month);
  await monthDirectory.removeEntry(folder, { recursive: true });
  const index = await writeMonthIndexEntry(monthDirectory, folder, null);
  return { indexUpdated: index.updated, indexError: index.error };
}

// Storage primitive kept for callers that update a saved title without moving its folder.
export async function renameStoredArticle(
  root: DirectoryHandle,
  month: string,
  folder: string,
  title: string,
): Promise<SaveResult> {
  await ensurePermission(root);
  assertStoredTarget(month, folder);
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new ProductError("fileSystem.theDisplayTitleCannotBeEmpty");
  const articlesDirectory = await getOrCreateDirectory(root, 'articles');
  const monthDirectory = await articlesDirectory.getDirectoryHandle(month);
  const articleDirectory = await monthDirectory.getDirectoryHandle(folder);
  const stored = await readStoredArticle(month, folder, articleDirectory);
  if (parseArticle(stored.source).diagnostics.some((item) => item.level === 'error')) {
    throw new ProductError("fileSystem.frontMatterHasErrorsRepairItBeforeChangingTheDisplayTitle");
  }
  const source = updateFrontMatter(stored.source, { title: cleanTitle, updatedAt: new Date().toISOString() });
  if (source === stored.source) throw new ProductError("fileSystem.theDisplayTitleCouldNotBeUpdatedThePhysicalDirectoryIsUnchanged");
  return saveStoredArticle(root, source, stored.theme, folder, month, { writeTheme: stored.themeValid });
}

function parsedWithThemeDiagnostics(parsed: ReturnType<typeof parseArticle>, themeResult: ThemeReadResult) {
  return {
    ...parsed,
    diagnostics: [...parsed.diagnostics, ...themeResult.diagnostics],
    canCopy: parsed.canCopy && themeResult.valid,
  };
}

function indexEntry(article: StoredArticle): Record<string, unknown> {
  return {
    summaryVersion: 1,
    title: article.parse.metadata.title,
    description: article.parse.metadata.description,
    author: article.parse.metadata.author,
    createdAt: article.parse.metadata.createdAt,
    categories: article.parse.metadata.categories,
    updatedAt: article.parse.metadata.updatedAt,
    theme: { id: article.theme.id, version: article.theme.version, name: article.theme.name },
    diagnostics: article.parse.diagnostics,
  };
}

async function rebuildMonthIndex(monthDirectory: FileSystemDirectoryHandle, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const rebuilt: Record<string, unknown> = {};
  for await (const [folder, entry] of monthDirectory.entries()) {
    if (entry.kind !== 'directory') continue;
    signal?.throwIfAborted();
    if (sanitizeFolderName(folder) !== folder) continue;
    const articleDirectory = await monthDirectory.getDirectoryHandle(folder);
    rebuilt[folder] = indexEntry(await readStoredArticle('', folder, articleDirectory));
  }
  return rebuilt;
}

export async function saveStoredArticle(
  root: DirectoryHandle,
  source: string,
  theme: ThemeConfig,
  existingFolder?: string | null,
  existingMonth?: string | null,
  options: { writeTheme?: boolean; updateIndex?: boolean; expectedSource?: string; renderRecord?: RenderRecord | null } = {},
): Promise<SaveResult> {
  await ensurePermission(root);
  if (Boolean(existingFolder) !== Boolean(existingMonth)) throw new ProductError("fileSystem.existingArticlesRequireBothAFixedDirectoryNameAndAMonthDirectory");
  if (options.writeTheme !== false) {
    const themeErrors = validateThemeConfig(theme);
    if (themeErrors.length) throw new ProductError("articleHistory.themeSnapshotValidationFailed", { "details": themeErrors.join('；') });
  }
  const parsed = parseArticle(source);
  const month = existingMonth ? assertMonthKey(existingMonth) : monthKey();
  const articlesDirectory = options.expectedSource !== undefined ? await root.getDirectoryHandle('articles') : await getOrCreateDirectory(root, 'articles');
  const monthDirectory = options.expectedSource !== undefined ? await articlesDirectory.getDirectoryHandle(month) : await getOrCreateDirectory(articlesDirectory, month);
  let folder: string;
  if (existingFolder) {
    if (sanitizeFolderName(existingFolder) !== existingFolder) throw new ProductError("fileSystem.theExistingArticleDirectoryNameIsUnsafeRewritingWasRejected");
    folder = existingFolder;
  } else {
    folder = await uniqueFolderName(monthDirectory, parsed.metadata.title);
  }
  const articleDirectory = options.expectedSource !== undefined ? await monthDirectory.getDirectoryHandle(folder) : await getOrCreateDirectory(monthDirectory, folder);
  if (options.expectedSource !== undefined && await readText(articleDirectory, 'article.md') !== options.expectedSource) {
    throw new ProductError("fileSystem.theArticleChangedExternallyAndWasNotOverwrittenRefreshAndRetry");
  }
  try {
    await writeText(articleDirectory, 'article.md', source);
  } catch (error) {
    throw new ProductError("fileSystem.articleMdSavingFailed", { "cause": productCause(error) });
  }

  const writeTheme = options.writeTheme ?? true;
  let themeResult: ThemeReadResult;
  let themeWriteError: string | undefined;
  if (writeTheme) {
    try {
      await writeText(articleDirectory, 'theme.json', JSON.stringify(theme, null, 2));
      themeResult = await readTheme(articleDirectory, parsed.metadata);
    } catch (error) {
      themeWriteError = productText("fileSystem.themeJsonSavingFailed", { "cause": productCause(error) });
      themeResult = await readTheme(articleDirectory, parsed.metadata);
      themeResult = {
        ...themeResult,
        valid: false,
        diagnostics: [...themeResult.diagnostics, diagnostic(themeWriteError)],
      };
    }
  } else {
    themeResult = await readTheme(articleDirectory, parsed.metadata);
  }

  const storedParse = parsedWithThemeDiagnostics(parsed, themeResult);
  let renderIssue: string | undefined;
  if (options.renderRecord !== undefined) {
    try {
      if (options.renderRecord && !await renderRecordMatches(options.renderRecord, source, themeResult.theme)) throw new ProductError("fileSystem.theBodyOrThemeDoesNotMatchTheRenderRecord");
      await writeRenderRecord(articleDirectory, options.renderRecord);
    } catch (error) { renderIssue = productText("fileSystem.sourceSavedRenderDependenciesWereNotSaved") + (error instanceof Error ? error.message : String(error)); }
  }
  const savedArticle: StoredArticle = {
    id: `${month}/${folder}`,
    folder,
    month,
    source,
    theme: themeResult.theme,
    filePath: `articles/${month}/${folder}/article.md`,
    parse: storedParse,
    themeValid: themeResult.valid,
    ...(options.renderRecord !== undefined ? { renderRecord: options.renderRecord } : {}),
    ...(renderIssue ? { renderIssue } : {}),
  };

  let indexUpdated = false;
  let indexError: string | undefined;
  if (options.updateIndex === false) {
    // The batch owner commits the successful rows together, once per month.
  } else if (parsed.diagnostics.some((item) => item.level === 'error')) {
    indexError = productText("fileSystem.frontMatterValidationDidNotPassSourceWasSavedButTheIndex");
  } else if (!themeResult.valid) {
    indexError = productText("fileSystem.themeSnapshotValidationDidNotPassSourceWasSavedButTheIndex", { "details": themeResult.diagnostics.map((item) => item.message).join('；') });
  } else {
    try {
      const current = await readText(monthDirectory, 'index.json').catch(() => '{}');
      const index = JSON.parse(current) as unknown;
      if (!index || typeof index !== 'object' || Array.isArray(index)) throw new ProductError("fileSystem.indexJsonIsNotAnObjectItWillBeRebuiltFromArticle");
      (index as Record<string, unknown>)[folder] = indexEntry(savedArticle);
      await writeText(monthDirectory, 'index.json', JSON.stringify(index, null, 2));
      indexUpdated = true;
    } catch (error) {
      try {
        const rebuilt = await rebuildMonthIndex(monthDirectory);
        rebuilt[folder] = indexEntry(savedArticle);
        await writeText(monthDirectory, 'index.json', JSON.stringify(rebuilt, null, 2));
        indexUpdated = true;
        indexError = productText("fileSystem.theOriginalIndexJsonCouldNotBeReadAndWasRebuiltFrom", { "cause": productCause(error) });
      } catch (rebuildError) {
        indexError = productText("fileSystem.sourceSavedMonthlyIndexUpdateFailed", { "cause": productCause(rebuildError) });
      }
    }
  }

  return {
    article: savedArticle,
    sourceSaved: true,
    indexUpdated,
    indexError: themeWriteError && !indexError ? themeWriteError : indexError,
  };
}

export async function writeArticleSummaryBatch(root: DirectoryHandle, articles: StoredArticle[]): Promise<ArticleIndexIssue[]> {
  const byMonth = new Map<string, StoredArticle[]>();
  for (const article of articles) byMonth.set(article.month, [...byMonth.get(article.month) ?? [], article]);
  const issues: ArticleIndexIssue[] = [];
  for (const [month, rows] of byMonth) {
    try {
      const directory = await (await root.getDirectoryHandle('articles')).getDirectoryHandle(month);
      const raw = await readText(directory, 'index.json');
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProductError("fileSystem.theMonthlyIndexIsInvalidAndNeedsAManualRebuild");
      const index = value as Record<string, unknown>;
      for (const article of rows) index[article.folder] = indexEntry(article);
      await writeText(directory, 'index.json', JSON.stringify(index, null, 2));
    } catch (error) {
      issues.push({ month, ...productMessage("fileSystem.sourceSavedTheMonthlyIndexWasNotUpdated", { "cause": productCause(error) }) });
    }
  }
  return issues;
}

export async function ensureArticleDirectories(root: DirectoryHandle): Promise<void> {
  await ensurePermission(root);
  for (const name of DATA_DIRECTORY_NAMES) await getOrCreateDirectory(root, name);
}

export function isDirectoryHandleValue(value: unknown): value is DirectoryHandle {
  return isDirectoryHandle(value);
}
