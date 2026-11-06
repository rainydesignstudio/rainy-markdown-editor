import { ProductError, productCause, productErrorMessage, productJoin, productMessage, productText } from "./i18n/productMessages";
import { BASE_EDITOR_THEME, parseEditorThemeJson, inspectEditorTheme, sortEditorThemes, resolveEditorThemeColors, resolveEditorThemeSurfaces, editorSurfaceTokens, type EditorTheme } from './editorThemes';
import { getThemeDirectory } from './themeDirectories';

export const EDITOR_THEME_DIRECTORY = 'themes/editor-themes';
export type EditorThemeIssue = { file: string; message: string };
export type EditorThemeLibrary = { themes: EditorTheme[]; issues: EditorThemeIssue[] };

function notFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

function safeId(id: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) throw new ProductError("editorThemeLibrary.theEditorThemeIdIsUnsafe");
}

export async function loadEditorThemeLibrary(root: FileSystemDirectoryHandle): Promise<EditorThemeLibrary> {
  const themes: EditorTheme[] = [];
  const issues: EditorThemeIssue[] = [];
  const migrated = await getThemeDirectory(root, 'editor-themes');
  const directory = migrated.directory;
  issues.push(...migrated.issues);
  for await (const [filename, handle] of directory.entries()) {
    if (!filename.endsWith('.json')) continue;
    if (handle.kind !== 'file' || !/^[a-z0-9][a-z0-9-]{0,47}\.json$/.test(filename)) {
      issues.push({ file: filename, ...productMessage("editorThemeLibrary.invalidFilenameUseASafeIdJson") });
      continue;
    }
    try {
      const theme = parseEditorThemeJson(await (await handle.getFile()).text());
      if (theme.id !== filename.slice(0, -5)) throw new ProductError("editorThemeLibrary.theFilenameDoesNotMatchTheThemeId");
      if (themes.some((item) => item.id === theme.id)) throw new ProductError("editorThemeLibrary.theThemeIdIsDuplicated");
      themes.push(theme);
    } catch (error) {
      issues.push({ file: filename, ...productErrorMessage(error) });
    }
  }
  return { themes: sortEditorThemes(themes), issues };
}

function themeContent(theme: EditorTheme): string {
  const normalized = { ...theme, palette: Object.fromEntries(Object.entries(theme.palette).map(([key, value]) => [key,
    (value.length === 4 ? '#' + value.slice(1).split('').map(channel => channel + channel).join('') : value).toLowerCase(),
  ])) };
  const surfaces = resolveEditorThemeSurfaces(normalized);
  return JSON.stringify({
    version: theme.version,
    fonts: Object.fromEntries(Object.entries(theme.fonts).sort(([left], [right]) => left.localeCompare(right))),
    schemes: (['light', 'dark'] as const).map(mode => {
      const colors = resolveEditorThemeColors(normalized, mode);
      return { colors, surfaces: editorSurfaceTokens(colors, surfaces?.[mode]) };
    }),
  });
}

// Preserve user themes: a guide selection carries its content, not just a possibly reused ID.
export async function ensureEditorThemeSnapshot(root: FileSystemDirectoryHandle, input: EditorTheme, isCurrent = () => true): Promise<EditorTheme> {
  const selected = parseEditorThemeJson(JSON.stringify(input)), content = themeContent(selected);
  const check = () => { if (!isCurrent()) throw new DOMException('Theme selection changed', 'AbortError'); };
  check();
  const { directory } = await getThemeDirectory(root, 'editor-themes');
  check();
  const read = async (id: string): Promise<{ exists: boolean; theme?: EditorTheme }> => {
    let file: FileSystemFileHandle;
    try { file = await directory.getFileHandle(`${id}.json`); }
    catch (error) { if (notFound(error)) return { exists: false }; throw error; }
    const raw = await (await file.getFile()).text();
    check();
    try {
      const theme = parseEditorThemeJson(raw);
      return { exists: true, ...(theme.id === id ? { theme } : {}) };
    } catch { return { exists: true }; }
  };
  const existing = await read(selected.id);
  check();
  if (existing.theme && themeContent(existing.theme) === content) return existing.theme;
  const prefix = `entry-${selected.id.slice(0, 20)}-`;
  const library = await loadEditorThemeLibrary(root);
  check();
  const previousCopy = library.themes.find(theme => theme.id.startsWith(prefix) && themeContent(theme) === content);
  if (previousCopy) return previousCopy;
  let id = selected.id;
  if (existing.exists) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    check();
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 12);
    const base = `${prefix}${hash}`;
    for (let index = 0; ; index++) {
      const suffix = index ? `-${index + 1}` : '';
      id = base.slice(0, 48 - suffix.length) + suffix;
      const candidate = await read(id);
      check();
      if (!candidate.exists) break;
      if (candidate.theme && themeContent(candidate.theme) === content) return candidate.theme;
    }
  }
  check();
  const saved = await saveEditorTheme(root, { ...selected, id });
  check();
  return saved;
}

type RenameHooks = { commit: () => Promise<void>; rollback: () => Promise<void> };

export async function saveEditorTheme(root: FileSystemDirectoryHandle, input: EditorTheme, previous?: EditorTheme, renameHooks?: RenameHooks): Promise<EditorTheme> {
  const errors = inspectEditorTheme(input);
  if (errors.length) throw new ProductError('shared.compose', { parts: productJoin(errors, '；') });
  safeId(input.id);
  if (previous) safeId(previous.id);
  const { directory } = await getThemeDirectory(root, 'editor-themes');
  const filename = `${input.id}.json`;
  if (previous && previous.id !== input.id) {
    const preserveBase = previous.id === BASE_EDITOR_THEME.id;
    const oldName = `${previous.id}.json`;
    let oldRaw: string;
    try { oldRaw = await (await (await directory.getFileHandle(oldName)).getFile()).text(); }
    catch (error) { if (notFound(error)) throw new ProductError("editorThemeLibrary.theThemeBeingEditedWasRemovedTheOriginalFileIsUnchanged"); throw error; }
    const stored = parseEditorThemeJson(oldRaw);
    if (stored.id !== previous.id || JSON.stringify(stored) !== JSON.stringify(previous)) throw new ProductError("editorThemeLibrary.theOriginalThemeChangedExternallyItWasNotRenamed");
    try { await directory.getFileHandle(filename); throw new ProductError("editorThemeLibrary.filenameAlreadyExistsTheOriginalFileIsUnchanged", { "filename": filename }); }
    catch (error) { if (!notFound(error)) throw error; }
    if (input.version === stored.version) {
      const parts = stored.version.split('.').map(Number);
      parts[2]++;
      input = { ...input, version: parts.join('.') };
    }
    const target = await directory.getFileHandle(filename, { create: true });
    let committed = false;
    try {
      if ((await target.getFile()).size) throw new ProductError("editorThemeLibrary.filenameAlreadyExistsTheOriginalFileIsUnchanged", { "filename": filename });
      const writable = await target.createWritable();
      try { await writable.write(JSON.stringify(input, null, 2)); await writable.close(); }
      catch (error) { try { await writable.abort(); } catch { /* retain failure */ } throw error; }
      if (!preserveBase) {
        if (renameHooks) { committed = true; await renameHooks.commit(); }
        if (await (await (await directory.getFileHandle(oldName)).getFile()).text() !== oldRaw) throw new ProductError("editorThemeLibrary.theOriginalThemeChangedExternallyTheOriginalFileWasNotRemoved");
        await directory.removeEntry(oldName);
      }
      return input;
    } catch (error) {
      const rollbackIssues: string[] = [];
      let keepNewForReferences = false;
      if (committed) try { await renameHooks?.rollback(); } catch (failure) { keepNewForReferences = true; rollbackIssues.push(productText("editorThemeLibrary.appearanceReferenceRollbackFailedNewFileIsRetainedToAvoidABroken", { "filename": filename, "cause": productCause(failure) })); }
      if (!keepNewForReferences) try { await directory.removeEntry(filename); } catch (failure) { rollbackIssues.push(productText("editorThemeLibrary.newFileCouldNotBeCleaned", { "filename": filename, "cause": productCause(failure) })); }
      throw new ProductError("editorThemeLibrary.editorThemeRenamingFailedTheOriginalFileIsRetained", { "cause": productCause(error), "details": (rollbackIssues.length ? `；${rollbackIssues.join('；')}` : '') });
    }
  }
  let existingRaw: string | null = null;
  try {
    const existing = await directory.getFileHandle(filename);
    const current = await (await existing.getFile()).text();
    const stored = parseEditorThemeJson(current);
    if (JSON.stringify(stored) === JSON.stringify(input)) return stored;
    if (!previous || JSON.stringify(stored) !== JSON.stringify(previous)) throw new ProductError("editorThemeLibrary.themeAlreadyExistsOrWasModifiedTheOriginalFileWasNotOverwritten", { "inputId": input.id });
    existingRaw = current;
    if (input.version === stored.version) {
      const parts = stored.version.split('.').map(Number);
      parts[2]++;
      input = { ...input, version: parts.join('.') };
    }
  } catch (error) {
    if (!notFound(error)) throw error;
    if (previous) throw new ProductError("editorThemeLibrary.theThemeBeingEditedWasRemovedItWasNotRecreated");
  }
  const file = await directory.getFileHandle(filename, { create: true });
  if (existingRaw !== null && await (await file.getFile()).text() !== existingRaw) throw new ProductError("editorThemeLibrary.theThemeFileChangedExternallyAndWasNotOverwritten");
  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await file.createWritable();
    await writable.write(JSON.stringify(input, null, 2));
    await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch { /* retain original error */ }
    if (existingRaw === null) try { await directory.removeEntry(filename); } catch { /* retain original error */ }
    throw new ProductError("editorThemeLibrary.editorThemeSavingFailed", { "cause": productCause(error) });
  }
  return input;
}

export async function deleteEditorTheme(root: FileSystemDirectoryHandle, id: string): Promise<void> {
  safeId(id);
  if (id === BASE_EDITOR_THEME.id) throw new ProductError("editorThemeLibrary.theBasicEditorThemeCannotBeDeleted");
  const { directory } = await getThemeDirectory(root, 'editor-themes');
  const file = await directory.getFileHandle(`${id}.json`);
  const theme = parseEditorThemeJson(await (await file.getFile()).text());
  if (theme.id !== id) throw new ProductError("editorThemeLibrary.theThemeFileDoesNotMatchItsIdNothingWasDeleted");
  await directory.removeEntry(`${id}.json`);
}
