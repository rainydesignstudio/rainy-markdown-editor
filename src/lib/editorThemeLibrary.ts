import { ProductError, productCause, productErrorMessage, productJoin, productMessage, productText } from "./i18n/productMessages";
import { BASE_EDITOR_THEME, parseEditorThemeJson, inspectEditorTheme, type EditorTheme } from './editorThemes';
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
  return { themes, issues };
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
