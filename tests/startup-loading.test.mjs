import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import * as productMessages from '../src/lib/i18n/productMessages.ts';
import { getFormatSnapshot, invalidateFormatBundle } from '../src/lib/article-format/runtime.ts';

async function directoryLoad(duringLoad = () => {}, { successful = false, keepRoute = false } = {}) {
  const source = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  const openAuthorizedDirectory = useCallback(');
  const end = source.indexOf('\n\n  const rememberAuthorizedDirectory', start);
  const root = { name: 'startup-test' }, statuses = [], states = [], appearance = [], navigation = [], preferredModes = [];
  const context = { ...productMessages, Error, manualLibraryLoad: { current: null },
    useCallback: callback => callback, view: 'articles', resumeIntentRef: { current: { active: false } }, routePathRef: { current: '/articles' }, applyStoredArticle() {}, notifyToast() {},
    directorySelectionRef: { current: 1 }, directoryRef: { current: root },
    articleListAbortRef: { current: null }, historyBaselineRef: { current: null },
    articleRef: { current: {} }, editorWorkspaceRef: { current: {} }, editorWorkspaceSnapshotRef: { current: {} },
    getDirectoryBookmarkId: () => null, displayDirectoryName: handle => handle.name,
    getFormatSnapshot, invalidateFormatBundle, articleId: () => 'fixture', createDefaultEditorWorkspace: () => ({}),
    DEFAULT_ARTICLE_SNIPPETS: [], DEFAULT_SNIPPET_CATEGORIES: [], DEFAULT_ARTICLE_TEMPLATES: [], DEFAULT_TEMPLATE_CATEGORIES: [], DEFAULT_ARTICLE_SETTINGS: {},
    setStatus: value => statuses.push(value), setContentLibrariesState: value => states.push(value),
    setEditorAppearanceLoaded: value => appearance.push(value),
    ensureArticleDirectories: async () => { duringLoad(context); if (!successful) throw new Error('directory denied'); },
  };
  for (const name of ['setLibraryLoadIssue', 'setEditorAppearanceVerified', 'setEditorDirectoryId', 'activateEditorThemeDirectory', 'invalidateThemePreviewSample', 'setDirectory', 'setDirectoryName', 'setThemeLibrary', 'setThemeIssues', 'setEditorThemes', 'setEditorThemeIssues', 'setSnippets', 'setSnippetCategories', 'setSnippetIssues', 'setTemplates', 'setTemplateCategories', 'setTemplateIssues', 'setArticleChecks', 'setArticleIndexIssues', 'setArticleIndexMonths', 'setArticleListNotice', 'setStoredArticles', 'setArticleSettings', 'setEditorWorkspace', 'setEditorWorkspaceIssue', 'setEditorWorkspaceBusy', 'setSettingsIssue', 'setSettingsBusy', 'setSettingsNotice', 'openDocument', 'advanceContentLibraryRootSession', 'navigateArticleMode', 'refreshArticles', 'setPreferredArticleMode']) context[name] = () => {};
  if (successful) Object.assign(context, {
    fontSessionDisposeRef: { current() {} }, initializeLocalFonts: async () => {}, loadLocalFonts: async () => () => {}, initializeThemeDefaults: async () => {}, activateThemePreviewSample: async () => {},
    activateLibraryFormat: async () => ({ snapshot: {}, message: null }), loadThemeLibrary: async () => ({ themes: [], issues: [] }),
    loadArticleSnippets: async () => ({ snippets: [], categories: [], issues: [] }), loadArticleTemplates: async () => ({ templates: [], categories: [], issues: [] }),
    loadArticleSettings: async () => ({ settings: {}, issue: null }), loadEditorWorkspace: async () => ({ workspace: {}, issue: null, fileExists: false, rawContent: null }),
    loadEditorThemeLibrary: async () => ({ themes: [], issues: [] }), migrateLegacyEditorAppearance: async (_root, loaded, themes) => ({ loaded, themes, issue: null }),
    refreshArticles: async () => [], navigateArticleMode: mode => navigation.push(mode), setPreferredArticleMode: mode => preferredModes.push(mode),
  });
  vm.runInNewContext(ts.transpileModule(source.slice(start, end) + '\nglobalThis.open = openAuthorizedDirectory;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const loaded = await context.open(root, 1, false, keepRoute);
  return { context, root, statuses, states, appearance, loaded, navigation, preferredModes };
}

test('early directory failure finishes format loading and exposes an invalid configuration for recovery', async () => {
  const result = await directoryLoad();
  assert.deepEqual(result.states, ['loading', 'failed']);
  assert.equal(result.appearance.at(-1), true);
  assert.equal(result.statuses.at(-1).tone, 'error');
  assert.notEqual(getFormatSnapshot().loading, true);
  assert.equal(getFormatSnapshot().source, 'invalid');
  assert.match(getFormatSnapshot().error, /directory denied/);
});

test('a cancelled directory load cannot finish the replacement library loading state', async () => {
  let replacement;
  const result = await directoryLoad(context => {
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
  const result = await directoryLoad(() => { settled = invalidateFormatBundle('startup-test', 'existing format diagnostic'); });
  assert.equal(result.states.at(-1), 'failed');
  assert.equal(getFormatSnapshot(), settled);
  assert.equal(getFormatSnapshot().error, 'existing format diagnostic');
});

test('entry loading returns readiness without navigating away; ordinary library opening still navigates', async () => {
  for (const keepRoute of [true, false]) {
    const result = await directoryLoad(() => {}, { successful: true, keepRoute });
    assert.equal(result.loaded, true);
    assert.deepEqual(result.states, ['loading', 'ready']);
    assert.deepEqual(result.navigation, keepRoute ? [] : ['overview']);
    assert.deepEqual(result.preferredModes, keepRoute ? ['overview'] : []);
  }
});

async function startupPanel({fromGuide=false,reduced=false}={}) {
  const file=await readFile(new URL('../src/components/global/AppProviders.tsx',import.meta.url),'utf8');
  const source=file.slice(file.indexOf('function StartupLoading('),file.indexOf('export function useEditorControllerContext'))+'\nglobalThis.component = StartupLoading;';
  let cursor=0,previous,cleanup,timerId=0,localeReady=false,retries=0,choices=0;
  const cells=[],effects=[],timers=new Map(),delays=new Map(),readiness=[],mediaListeners=new Set();
  const context={...productMessages,ContentIcon:()=>null,GuideArrival:'guide-arrival',exports:{},require:()=>({jsx,jsxs}),useUITranslation:()=>({t:key=>key}),useUILocale:()=>({ready:localeReady}),
    useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
    useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return[cells[i],value=>{cells[i]=value;}];},
    useEffect(effect,deps){if(!previous||deps.some((v,i)=>v!==previous[i]))effects.push(()=>{cleanup?.();previous=deps;cleanup=effect();});},
    window:{matchMedia:()=>({get matches(){return reduced;},addEventListener:(_,fn)=>mediaListeners.add(fn),removeEventListener:(_,fn)=>mediaListeners.delete(fn)}),setTimeout(fn,ms){timers.set(++timerId,fn);delays.set(timerId,ms);return timerId;},clearTimeout(id){timers.delete(id);delays.delete(id);}}};
  vm.runInNewContext(ts.transpileModule(source,{fileName:'loading.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
  const onReady=value=>readiness.push(value),onRetry=()=>retries++,onChoose=()=>choices++;
  const render=(loading,issue=null)=>{cursor=0;const node=context.component({loading,issue,onReady,onRetry,onChoose,fromGuide});while(effects.length)effects.shift()();return node;};
  const walk=node=>Array.isArray(node)?node.flatMap(walk):node?.props?[node,...walk(node.props.children)]:[];
  return{render,walk,timers,delays,readiness,setReduced:value=>{reduced=value;for(const fn of [...mediaListeners])fn();},setLocaleReady:()=>localeReady=true,get retries(){return retries;},get choices(){return choices;}};
}

test('loading remains full-screen until ready, fades for 300ms, and a new load cancels removal', async () => {
  const f=await startupPanel();
  assert.equal(f.render(true).props['data-fading'],false);
  assert.equal(f.render(true).props['aria-label'],undefined);
  assert.equal(f.walk(f.render(true)).find(n=>n.type==='p').props.hidden,true);
  f.setLocaleReady();assert.equal(f.walk(f.render(true)).find(n=>n.type==='p').props.hidden,false);
  assert.equal(f.timers.size,0);
  f.render(false);assert.equal(f.render(false).props['data-fading'],true);assert.equal(f.timers.size,1);assert.equal([...f.delays.values()][0],300);
  f.render(true);assert.equal(f.timers.size,0);assert.equal(f.render(true).props['data-fading'],false);
  f.render(false);[...f.timers.values()][0]();assert.equal(f.render(false),null);assert.equal(f.readiness.at(-1),true);
});

test('a failed startup stays at the loading location with recovery actions and an explicit non-blocking continue', async () => {
  const f=await startupPanel();f.setLocaleReady();f.render(true);
  let tree=f.render(false,{label:'directory denied'});tree=f.render(false,{label:'directory denied'});
  assert.equal(f.timers.size,0);assert.equal(f.readiness.at(-1),false);
  assert.ok(f.walk(tree).some(n=>n.type==='p'&&n.props.children==='directory denied'));
  assert.equal(f.walk(tree).some(n=>n.type==='details'),false);
  assert.deepEqual(f.walk(tree).filter(n=>n.props.name).map(n=>n.props.name),['reset','folder','expand']);
  const button=key=>f.walk(tree).find(n=>n.type==='button'&&[].concat(n.props.children).includes(key));
  button('common:loading.retry').props.onClick();button('common:loading.choose').props.onClick();assert.equal(f.retries,1);assert.equal(f.choices,1);
  button('common:loading.continue').props.onClick();f.render(false,{label:'directory denied'});assert.equal(f.timers.size,1);
  [...f.timers.values()][0]();assert.equal(f.render(false,{label:'directory denied'}),null);assert.equal(f.readiness.at(-1),true);
});


test('guide arrival waits for real readiness, then reveals once; an interrupted load cancels its timers', async () => {
  const f=await startupPanel({fromGuide:true});
  const arrival=tree=>f.walk(tree).some(node=>node.type==='guide-arrival');
  assert.equal(arrival(f.render(true)),false);assert.equal(f.timers.size,0);
  f.render(false);assert.equal(arrival(f.render(false)),true);
  assert.deepEqual([...f.delays.values()],[720,1020]);assert.equal(f.readiness.at(-1),false);
  f.render(true);assert.equal(f.timers.size,0);
  f.render(false);for(const fn of [...f.timers.values()])fn();
  assert.equal(f.render(false),null);assert.equal(f.readiness.at(-1),true);
  f.render(true);f.render(false);
  assert.equal(arrival(f.render(false)),false);assert.deepEqual([...f.delays.values()],[300]);
});

test('reduced motion removes the guide arrival hold without bypassing readiness', async () => {
  const f=await startupPanel({fromGuide:true,reduced:true});
  f.render(true);assert.equal(f.timers.size,0);
  f.render(false);assert.deepEqual([...f.delays.values()],[0]);
  [...f.timers.values()][0]();assert.equal(f.render(false),null);assert.equal(f.readiness.at(-1),true);
});


test('enabling reduced motion during workspace arrival ends only the already-ready transition', async () => {
  const f=await startupPanel({fromGuide:true});f.render(true);f.render(false);
  assert.equal(f.timers.size,2);assert.equal(f.readiness.at(-1),false);
  f.setReduced(true);assert.equal(f.timers.size,0);assert.equal(f.render(false),null);assert.equal(f.readiness.at(-1),true);
  f.render(true);assert.equal(f.readiness.at(-1),false);f.setReduced(false);f.setReduced(true);
  assert.equal(f.readiness.at(-1),false,'motion changes must not finish a new pending load');
});
