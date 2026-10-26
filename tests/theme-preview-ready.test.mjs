import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { BASIC_THEME } from '../src/lib/themes.ts';
import { withUILocaleImports } from './ui-locale-fixture.mjs';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

test('package reloads replace a legacy shadow host so a successful retry cannot leave its iframe hidden', async t => {
  const dom = new JSDOM('<main id="root"></main>'), descriptors = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let snapshot = { id: 'first', renderer: { fingerprint: 'package-a' } };
  const packageHosts = [], module = { exports: {} }, code = ts.transpileModule(await readFile(new URL('../src/components/themes/ThemeLibrary.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const sample = { status: 'ready', markdown: '# Sample' };
  vm.runInNewContext(code, { module, exports: module.exports, document: dom.window.document, require: withUILocaleImports(id => {
    if (id === 'react') return React;
    if (id === 'react/jsx-runtime') return jsx;
    if (id.endsWith('/useFormatSnapshot')) return { useFormatSnapshot: () => snapshot };
    if (id.endsWith('/useThemePreviewSample')) return { useThemePreviewSample: () => sample };
    if (id.endsWith('/useResourcePreviewStyles')) return { useResourcePreviewStyles: () => ({ css: '', ready: true }) };
    if (id.endsWith('/useArticleRenderMount')) return { useArticleRenderMount(hostRef, format) {
      React.useLayoutEffect(() => {
        const host = hostRef.current;
        if (format.renderer) { host.append(dom.window.document.createElement('iframe')); packageHosts.push(host); }
        else host.attachShadow({ mode: 'open' }).append(dom.window.document.createElement('div'));
        return () => host.replaceChildren();
      }, [format]);
      return { target: null, native: Boolean(format.renderer), darkColors: { status: 'ready' }, darkFrameRef: { current: null } };
    } };
    if (id.endsWith('/article-format/preview')) return { previewSurfaceStyle: () => ({}), articlePreviewStyle: css => css, resourcePreviewWidth: () => 'default', resourcePreviewHostClass: () => '' };
    if (id.endsWith('/PreviewCssDetails')) return { PreviewCssDetails: () => null };
    if (id.endsWith('/OperationFeedback')) return { OperationFeedback: () => null };
    return {};
  }) });
  const root = createRoot(dom.window.document.getElementById('root'));
  t.after(async () => { await React.act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const render = () => React.act(async () => root.render(React.createElement(module.exports.ThemePreview, { theme: BASIC_THEME })));
  await render();
  snapshot = { id: 'invalid', renderer: null }; await render();
  snapshot = { id: 'retry', renderer: { fingerprint: 'package-b' } }; await render();
  assert.equal(packageHosts.length, 2); assert.notEqual(packageHosts[0], packageHosts[1]);
  assert.equal(packageHosts[1].shadowRoot, null, 'the opaque legacy shadow tree must not hide the package iframe');
  assert.ok(packageHosts[1].querySelector('iframe'));
});

test('theme inspection waits for the existing preview document head and installs its utility sheet once on load', async () => {
  const cells = [], effects = [], listeners = new Map(), inserted = []; let cursor = 0;
  const doc = { head:null, querySelector: () => inserted[0] ?? null, createElement: () => ({ dataset:{} }) };
  const frame = { contentDocument:doc, addEventListener: (name,fn) => listeners.set(name,fn), removeEventListener: name => listeners.delete(name) };
  const colors = {status:'ready',values:{}}, snapshot = {id:'fixture'};
  const react = {
    useId: () => 'theme-ready',
    useRef(initial) { const i=cursor++; return cells[i] ??= {current:initial}; },
    useState(initial) { const i=cursor++; if(!(i in cells))cells[i]=initial; return [cells[i],value=>cells[i]=typeof value==='function'?value(cells[i]):value]; },
    useEffect(callback,deps) { const i=cursor++, old=cells[i]; if(old && deps.every((v,n)=>Object.is(v,old.deps[n])))return;effects.push(()=>{old?.cleanup?.();cells[i]={deps,cleanup:callback()};}); },
  };
  const module = {exports:{}}, code = ts.transpileModule(await readFile(new URL('../src/components/themes/ThemeLibrary.tsx', import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,document:{},require:withUILocaleImports(id=>{
    if(id==='react')return react;
    if(id==='react/jsx-runtime')return jsx;
    if(id.endsWith('/useFormatSnapshot'))return {useFormatSnapshot:()=>snapshot};
    if(id.endsWith('/useThemePreviewSample'))return {useThemePreviewSample:()=>({status:'ready',markdown:'# Sample'})};
    if(id.endsWith('/useResourcePreviewStyles'))return {useResourcePreviewStyles:()=>({css:'.actual{}',issue:'',ready:true,result:{}})};
    if(id.endsWith('/useArticleRenderMount'))return {useArticleRenderMount:()=>({target:null,darkIssue:'',darkColors:colors,darkFrameRef:{current:frame}})};
    if(id.endsWith('/article-format/preview'))return {previewSurfaceStyle:()=>({}),articlePreviewStyle:css=>css,resourcePreviewWidth:()=> 'default',resourcePreviewHostClass:()=> ''};
    if(id.endsWith('/article-format/renderer'))return {compileThemeInspectionUtilities:async()=>'.inspection{}'};
    if(id.endsWith('/ThemeInspection'))return {ThemeInspectionPreview:'inspection'};
    return {};
  })});
  const props={theme:BASIC_THEME,dark:true,inspection:{}};
  const render=()=>{cursor=0;module.exports.ThemePreview(props);while(effects.length)effects.shift()();};
  assert.doesNotThrow(render);await new Promise(setImmediate);assert.doesNotThrow(render);
  assert.equal(inserted.length,0);assert.equal(typeof listeners.get('load'),'function');
  doc.head={append:style=>inserted.push(style)};listeners.get('load')();render();
  assert.equal(inserted.length,1);assert.equal(inserted[0].textContent,'.inspection{}');
  listeners.get('load')();assert.equal(inserted.length,1);
  cells.forEach(cell=>cell?.cleanup?.());
});
