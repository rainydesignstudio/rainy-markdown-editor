import { ProductError, productCause, productText } from "./i18n/productMessages";
import { parseArticle } from './frontMatter';
import { readRenderRecord, renderRecordMatches, writeRenderRecord, type RenderRecord } from './article-format/renderRecords';
import { sanitizeFolderName } from './fileSystem';
import { parseThemeConfigJson, validateThemeConfig } from './themeValidation';
import type { ParsedArticle, ThemeConfig } from './types';

export type ArticleHistoryKind = 'automatic' | 'manual' | 'before-restore' | 'before-theme-change';

export type ArticleHistorySnapshot = {
  renderRecord?: RenderRecord | null;
  renderIssue?: string;
  id: string;
  createdAt: string;
  kind: ArticleHistoryKind;
  retained: boolean;
  title: string;
  source: string;
  theme: ThemeConfig;
  parsed: ParsedArticle;
  themeMatches: boolean;
};

export type ArticleHistoryIssue = { snapshotId: string; message: string };
export type ArticleHistoryListResult = { snapshots: ArticleHistorySnapshot[]; issues: ArticleHistoryIssue[] };
export type CreateArticleSnapshotOptions = {
  renderRecord?: RenderRecord | null;
  id?: string;
  kind: ArticleHistoryKind;
  retained?: boolean;
  maxAutoSnapshots?: number;
  now?: () => Date;
};
export type CreateArticleSnapshotResult = { snapshot: ArticleHistorySnapshot; created: boolean; cleanupIssues: string[] };

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function changedThemeSnapshotFields(previous: ThemeConfig, current: ThemeConfig): string[] {
  const labels: Record<string, string> = {
    id: 'ID',
    name: productText("articleHistory.themeName"),
    version: productText("articleHistory.version"),
    formatVersion: productText("articleHistory.dataFormat"),
    tokens: productText("articleHistory.typographyTokens"),
    css: productText("articleHistory.customCss"),
    nodes: productText("articleHistory.nodeTypography"),
  };
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return [...keys]
    .filter((key) => stableSerialize(previous[key as keyof ThemeConfig]) !== stableSerialize(current[key as keyof ThemeConfig]))
    .sort()
    .map((key) => labels[key] ?? key);
}

type SnapshotManifest = {
  owner: 'wechat-article-editor';
  version: 1;
  id: string;
  createdAt: string;
  kind: ArticleHistoryKind;
  retained: boolean;
};

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

function assertArticleTarget(month: string, folder: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ProductError("articleHistory.invalidArticleMonthDirectoryOnlyYyyyMmIsAccepted", { "month": month });
  if (!folder || sanitizeFolderName(folder) !== folder || folder === '.' || folder === '..') {
    throw new ProductError("articleHistory.theArticleDirectoryNameIsUnsafeAccessToHistoricalSnapshotsWasRejected");
  }
}

function assertSnapshotId(id: string): string {
  if (!/^snapshot-[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(id)) throw new ProductError("articleHistory.theHistoricalSnapshotIdIsUnsafe");
  return id;
}

async function ensurePermission(root: FileSystemDirectoryHandle): Promise<void> {
  const candidate = root as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };
  if (!candidate.queryPermission) return;
  const descriptor = { mode: 'readwrite' as const };
  let permission = await candidate.queryPermission(descriptor);
  if (permission !== 'granted' && candidate.requestPermission) permission = await candidate.requestPermission(descriptor);
  if (permission !== 'granted') throw new ProductError("articleHistory.theLibraryLacksReadWritePermissionAuthorizeItAgainToManageSnapshots");
}

async function getArticleDirectory(root: FileSystemDirectoryHandle, month: string, folder: string): Promise<FileSystemDirectoryHandle> {
  assertArticleTarget(month, folder);
  const articles = await root.getDirectoryHandle('articles');
  const monthDirectory = await articles.getDirectoryHandle(month);
  return monthDirectory.getDirectoryHandle(folder);
}

async function writeNewText(directory: FileSystemDirectoryHandle, name: string, content: string): Promise<void> {
  let file: FileSystemFileHandle;
  try {
    await directory.getFileHandle(name);
    throw new ProductError("articleHistory.snapshotFileAlreadyExistsAndWasNotOverwritten", { "name": name });
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  file = await directory.getFileHandle(name, { create: true });
  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch { /* preserve the original failure */ }
    try { await directory.removeEntry(name); } catch { /* outer cleanup removes the incomplete snapshot */ }
    throw error;
  }
}

function manifestOf(value: unknown, directoryName: string): SnapshotManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProductError("articleHistory.theSnapshotManifestIsNotAnObject");
  const candidate = value as Record<string, unknown>;
  if (candidate.owner !== 'wechat-article-editor' || candidate.version !== 1 || candidate.id !== directoryName || !['automatic', 'manual', 'before-restore', 'before-theme-change'].includes(String(candidate.kind)) || typeof candidate.retained !== 'boolean') {
    throw new ProductError("articleHistory.snapshotManifestFieldsAreInvalidOrDoNotMatchTheDirectoryName");
  }
  if (typeof candidate.createdAt !== 'string' || Number.isNaN(Date.parse(candidate.createdAt))) throw new ProductError("articleHistory.theSnapshotCreationTimeIsInvalid");
  return {
    owner: 'wechat-article-editor',
    version: 1,
    id: candidate.id as string,
    createdAt: candidate.createdAt,
    kind: candidate.kind as ArticleHistoryKind,
    retained: candidate.retained,
  };
}

async function readSnapshot(directory: FileSystemDirectoryHandle, directoryName: string): Promise<ArticleHistorySnapshot> {
  const manifestText = await (await directory.getFileHandle('snapshot.json')).getFile().then((file) => file.text());
  const manifest = manifestOf(JSON.parse(manifestText), directoryName);
  const source = await (await directory.getFileHandle('article.md')).getFile().then((file) => file.text());
  const theme = parseThemeConfigJson(await (await directory.getFileHandle('theme.json')).getFile().then((file) => file.text()));
  const themeErrors = validateThemeConfig(theme);
  if (themeErrors.length) throw new ProductError("articleHistory.theThemeSnapshotIsInvalid", { "details": themeErrors.join('；') });
  const parsed = parseArticle(source);
  const themeMatches = parsed.metadata.theme?.id === theme.id && parsed.metadata.theme?.version === theme.version;
  let renderRecord: RenderRecord | null = null, renderIssue: string | undefined;
  try {
    renderRecord = await readRenderRecord(directory);
    if (renderRecord && !await renderRecordMatches(renderRecord, source, theme)) renderIssue = productText("articleHistory.theHistoricalRenderRecordDoesNotMatchTheBodyOrTheme");
  } catch (error) { renderIssue = error instanceof Error ? error.message : String(error); }
  return {
    ...manifest,
    title: parsed.metadata.title || productText("articleHistory.untitledManuscript"),
    source,
    theme,
    parsed,
    themeMatches,
    renderRecord, renderIssue,
  };
}

export async function listArticleHistory(
  root: FileSystemDirectoryHandle,
  month: string,
  folder: string,
): Promise<ArticleHistoryListResult> {
  await ensurePermission(root);
  const articleDirectory = await getArticleDirectory(root, month, folder);
  let historyDirectory: FileSystemDirectoryHandle;
  try {
    historyDirectory = await articleDirectory.getDirectoryHandle('history');
  } catch (error) {
    if (isNotFound(error)) return { snapshots: [], issues: [] };
    throw error;
  }

  const snapshots: ArticleHistorySnapshot[] = [];
  const issues: ArticleHistoryIssue[] = [];
  for await (const [name, entry] of historyDirectory.entries()) {
    if (entry.kind !== 'directory' || !name.startsWith('snapshot-')) continue;
    try {
      snapshots.push(await readSnapshot(await historyDirectory.getDirectoryHandle(name), name));
    } catch (error) {
      issues.push({ snapshotId: name, message: error instanceof Error ? error.message : String(error) });
    }
  }
  snapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
  return { snapshots, issues };
}

async function cleanupAutomaticSnapshots(
  historyDirectory: FileSystemDirectoryHandle,
  snapshots: ArticleHistorySnapshot[],
  maximum: number,
): Promise<string[]> {
  const removable = snapshots
    .filter((snapshot) => snapshot.kind === 'automatic' && !snapshot.retained)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const issues: string[] = [];
  while (removable.length > maximum) {
    const oldest = removable.shift()!;
    try {
      await historyDirectory.removeEntry(oldest.id, { recursive: true });
    } catch (error) {
      issues.push(productText("articleHistory.automaticSnapshotCouldNotBeCleaned", { "oldestId": oldest.id, "cause": productCause(error) }));
      break;
    }
  }
  return issues;
}

function generatedSnapshotId(now: Date): string {
  const timestamp = now.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z');
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12) ?? Math.random().toString(36).slice(2, 14);
  return `snapshot-${timestamp}-${random}`;
}

export async function createArticleSnapshot(
  root: FileSystemDirectoryHandle,
  month: string,
  folder: string,
  source: string,
  theme: ThemeConfig,
  options: CreateArticleSnapshotOptions,
): Promise<CreateArticleSnapshotResult> {
  await ensurePermission(root);
  const themeErrors = validateThemeConfig(theme);
  if (themeErrors.length) throw new ProductError("articleHistory.themeSnapshotValidationFailed", { "details": themeErrors.join('；') });
  if (!['automatic', 'manual', 'before-restore', 'before-theme-change'].includes(options.kind)) throw new ProductError("articleHistory.theHistoricalSnapshotTypeIsInvalid");
  const parsed = parseArticle(source);
  const articleDirectory = await getArticleDirectory(root, month, folder);
  const existing = await listArticleHistory(root, month, folder);
  const serializedTheme = JSON.stringify(theme);
  const storedRender = options.renderRecord !== undefined ? options.renderRecord : await readRenderRecord(articleDirectory);
  const renderRecord = storedRender && await renderRecordMatches(storedRender, source, theme) ? storedRender : null;
  const duplicate = options.kind === 'automatic'
    ? existing.snapshots.find((snapshot) => snapshot.source === source && JSON.stringify(snapshot.theme) === serializedTheme && snapshot.renderRecord?.environmentHash === renderRecord?.environmentHash)
    : undefined;
  const maxAutoSnapshots = options.maxAutoSnapshots ?? 20;
  if (!Number.isInteger(maxAutoSnapshots) || maxAutoSnapshots < 1 || maxAutoSnapshots > 100) {
    throw new ProductError("articleHistory.automaticSnapshotRetentionMustBeAnIntegerFrom1To100");
  }
  if (duplicate) {
    const historyDirectory = await articleDirectory.getDirectoryHandle('history');
    const cleanupIssues = await cleanupAutomaticSnapshots(historyDirectory, existing.snapshots, maxAutoSnapshots);
    return { snapshot: duplicate, created: false, cleanupIssues };
  }
  const historyDirectory = await articleDirectory.getDirectoryHandle('history', { create: true });
  const now = options.now?.() ?? new Date();
  const id = assertSnapshotId(options.id ?? generatedSnapshotId(now));
  try {
    await historyDirectory.getDirectoryHandle(id);
    throw new ProductError("articleHistory.snapshotDirectoryAlreadyExistsAndWasNotOverwritten", { "id": id });
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const retained = options.kind === 'automatic' ? options.retained ?? false : true;
  const manifest: SnapshotManifest = { owner: 'wechat-article-editor', version: 1, id, createdAt: now.toISOString(), kind: options.kind, retained };
  const snapshotDirectory = await historyDirectory.getDirectoryHandle(id, { create: true });
  try {
    await writeNewText(snapshotDirectory, 'article.md', source);
    await writeNewText(snapshotDirectory, 'theme.json', JSON.stringify(theme, null, 2));
    if (renderRecord) await writeRenderRecord(snapshotDirectory, renderRecord);
    // The manifest is written last; readers never expose a partial snapshot.
    await writeNewText(snapshotDirectory, 'snapshot.json', JSON.stringify(manifest, null, 2));
    const snapshot = await readSnapshot(snapshotDirectory, id);
    const allSnapshots = [...existing.snapshots, snapshot];
    const cleanupIssues = await cleanupAutomaticSnapshots(historyDirectory, allSnapshots, maxAutoSnapshots);
    return { snapshot, created: true, cleanupIssues };
  } catch (error) {
    try { await historyDirectory.removeEntry(id, { recursive: true }); } catch (cleanupError) {
      throw new ProductError("articleHistory.snapshotWritingFailedCleanupOfTheIncompleteDirectoryAlsoFailed", { "cause": productCause(error), "cause2": productCause(cleanupError) });
    }
    throw new ProductError("articleHistory.snapshotWritingFailedTheOriginalManuscriptIsUnchanged", { "cause": productCause(error) });
  }
}

export async function setArticleSnapshotRetained(
  root: FileSystemDirectoryHandle,
  month: string,
  folder: string,
  id: string,
  retained: boolean,
): Promise<ArticleHistorySnapshot> {
  await ensurePermission(root);
  assertArticleTarget(month, folder);
  assertSnapshotId(id);
  const history = await listArticleHistory(root, month, folder);
  const snapshot = history.snapshots.find((item) => item.id === id);
  if (!snapshot) throw new ProductError("articleHistory.completeHistoricalSnapshotWasNotFoundNoFilesWereModified", { "id": id });
  if (snapshot.kind !== 'automatic') {
    if (!retained) throw new ProductError("articleHistory.manualSnapshotsAndCheckpointsBeforeRestoreAreAlwaysProtectedProtectionCannotBe");
    return snapshot;
  }
  if (snapshot.retained === retained) return snapshot;

  const articleDirectory = await getArticleDirectory(root, month, folder);
  const historyDirectory = await articleDirectory.getDirectoryHandle('history');
  const snapshotDirectory = await historyDirectory.getDirectoryHandle(id);
  const manifest = manifestOf(
    JSON.parse(await (await snapshotDirectory.getFileHandle('snapshot.json')).getFile().then((file) => file.text())),
    id,
  );
  const nextManifest = { ...manifest, retained };
  const file = await snapshotDirectory.getFileHandle('snapshot.json');
  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await file.createWritable();
    await writable.write(JSON.stringify(nextManifest, null, 2));
    await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch { /* preserve the original write failure */ }
    throw new ProductError("articleHistory.snapshotProtectionCouldNotBeSavedTheOriginalStateIsUnchanged", { "cause": productCause(error) });
  }
  return { ...snapshot, retained };
}
