import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import * as productMessages from '../src/lib/i18n/productMessages.ts';
import { getFormatSnapshot, invalidateFormatBundle } from '../src/lib/article-format/runtime.ts';

async function directoryLoadFailure(duringLoad = () => {}) {
  const source = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  const openAuthorizedDirectory = useCallback(');
  const end = source.indexOf('\n\n  const rememberAuthorizedDirectory', start);
  const root = { name: 'startup-test' }, statuses = [], states = [], appearance = [];
  const context = { ...productMessages, Error,
    useCallback: callback => callback, view: 'articles',
    directorySelectionRef: { current: 1 }, directoryRef: { current: root },
    articleListAbortRef: { current: null }, historyBaselineRef: { current: null },
    articleRef: { current: {} }, editorWorkspaceRef: { current: {} }, editorWorkspaceSnapshotRef: { current: {} },
    getDirectoryBookmarkId: () => null, displayDirectoryName: handle => handle.name,
    getFormatSnapshot, invalidateFormatBundle, articleId: () => 'fixture', createDefaultEditorWorkspace: () => ({}),
    DEFAULT_ARTICLE_SNIPPETS: [], DEFAULT_SNIPPET_CATEGORIES: [], DEFAULT_ARTICLE_TEMPLATES: [], DEFAULT_TEMPLATE_CATEGORIES: [], DEFAULT_ARTICLE_SETTINGS: {},
    setStatus: value => statuses.push(value), setContentLibrariesState: value => states.push(value),
    setEditorAppearanceLoaded: value => appearance.push(value),
    ensureArticleDirectories: async () => { duringLoad(context); throw new Error('directory denied'); },
  };
  for (const name of ['setEditorAppearanceVerified', 'setEditorDirectoryId', 'activateEditorThemeDirectory', 'invalidateThemePreviewSample', 'setDirectory', 'setDirectoryName', 'setThemeLibrary', 'setThemeIssues', 'setEditorThemes', 'setEditorThemeIssues', 'setSnippets', 'setSnippetCategories', 'setSnippetIssues', 'setTemplates', 'setTemplateCategories', 'setTemplateIssues', 'setArticleChecks', 'setArticleIndexIssues', 'setArticleIndexMonths', 'setArticleListNotice', 'setStoredArticles', 'setArticleSettings', 'setEditorWorkspace', 'setEditorWorkspaceIssue', 'setEditorWorkspaceBusy', 'setSettingsIssue', 'setSettingsBusy', 'setSettingsNotice', 'openDocument', 'advanceContentLibraryRootSession', 'navigateArticleMode', 'refreshArticles', 'setPreferredArticleMode']) context[name] = () => {};
  vm.runInNewContext(ts.transpileModule(source.slice(start, end) + '\nglobalThis.open = openAuthorizedDirectory;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  await context.open(root, 1);
  return { context, root, statuses, states, appearance };
}

test('early directory failure finishes format loading and exposes an invalid configuration for recovery', async () => {
  const result = await directoryLoadFailure();
  assert.deepEqual(result.states, ['loading', 'failed']);
  assert.equal(result.appearance.at(-1), true);
  assert.equal(result.statuses.at(-1).tone, 'error');
  assert.notEqual(getFormatSnapshot().loading, true);
  assert.equal(getFormatSnapshot().source, 'invalid');
  assert.match(getFormatSnapshot().error, /directory denied/);
});

test('a cancelled directory load cannot finish the replacement library loading state', async () => {
  let replacement;
  const result = await directoryLoadFailure(context => {
    context.directorySelectionRef.current++;
    context.directoryRef.current = { name: 'replacement' };
    replacement = invalidateFormatBundle('replacement', 'replacement loading', { loading: true });
  });
  assert.deepEqual(result.states, ['loading']);
  assert.equal(getFormatSnapshot(), replacement);
  assert.equal(getFormatSnapshot().loading, true);
});

test('a later error does not replace an already settled format diagnostic', async () => {
  let settled;
  const result = await directoryLoadFailure(() => { settled = invalidateFormatBundle('startup-test', 'existing format diagnostic'); });
  assert.equal(result.states.at(-1), 'failed');
  assert.equal(getFormatSnapshot(), settled);
  assert.equal(getFormatSnapshot().error, 'existing format diagnostic');
});

test('loading remains full-screen until ready, fades for 300ms, and a new load cancels removal', async () => {
  const file = await readFile(new URL('../src/components/global/AppProviders.tsx', import.meta.url), 'utf8');
  const source = file.slice(file.indexOf('function StartupLoading('), file.indexOf('export function useEditorControllerContext')) + '\nglobalThis.component = StartupLoading;';
  let cursor = 0, previous, cleanup; const cells = [], effects = [], timers = new Map(); let timerId = 0, localeReady = false;
  const context = { require: () => ({ jsx, jsxs }), exports: {},
    useUITranslation: () => ({ t: key => key }),
    useUILocale: () => ({ ready: localeReady }),
    useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = initial; return [cells[i], value => { cells[i] = value; }]; },
    useEffect(effect, dependencies) { if (!previous || previous[0] !== dependencies[0]) { effects.push(() => { cleanup?.(); previous = dependencies; cleanup = effect(); }); } },
    window: { setTimeout(fn, duration) { assert.equal(duration, 300); timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } },
  };
  vm.runInNewContext(ts.transpileModule(source, { fileName: 'loading.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const render = loading => { cursor = 0; const node = context.component({ loading }); while (effects.length) effects.shift()(); return node; };
  assert.equal(render(true).props['data-fading'], false);
  assert.equal(render(true).props['aria-label'], undefined, 'wrong-language loading text is not exposed before locale readiness');
  assert.equal(render(true).props.children.props.children[1].props.hidden, true);
  localeReady = true;
  assert.equal(render(true).props.children.props.children[1].props.hidden, false);
  assert.equal(timers.size, 0);
  render(false);
  assert.equal(render(false).props['data-fading'], true);
  assert.equal(timers.size, 1);
  render(true);
  assert.equal(timers.size, 0, 'new loading cancels the previous fade removal');
  assert.equal(render(true).props['data-fading'], false);
  render(false); [...timers.values()][0]();
  assert.equal(render(false), null);
});
