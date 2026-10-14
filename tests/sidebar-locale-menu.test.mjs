import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { createUII18n } from '../src/lib/i18n/runtime.ts';

const source = await readFile(new URL('../src/components/global/MainSidebar.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function sidebar() {
  const instance = createUII18n('en-US');
  let cursor = 0; const cells = [], effects = [], localeChanges = [], colorChanges = [];
  const locale = { locale: 'en-US', preferenceSaved: true, setLocale: async value => { localeChanges.push(value); locale.locale = value; await instance.changeLanguage(value); } };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react') return {
      useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = initial; return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; },
      useEffect(effect, deps) { const i = cursor++; if (cells[i]?.every((value, j) => Object.is(value, deps[j]))) return; cells[i] = deps; effects.push(effect); },
    };
    if (id.endsWith('/appVersion')) return { APP_VERSION: '0.2.2', APP_VERSION_COMPACT: '0.2' };
    if (id.endsWith('/IconPopover')) return { IconPopover: 'popover' };
    if (id.endsWith('/UILocaleProvider')) return { useUILocale: () => locale, useUITranslation: () => ({ t: instance.t.bind(instance) }) };
    if (id.endsWith('/i18n/preferences')) return { UI_LOCALES: ['zh-CN', 'en-US'] };
    throw new Error('Unexpected import ' + id);
  } });
  let collapsed = false;
  const render = () => { cursor = 0; const tree = module.exports.MainSidebar({ view: 'articles', mediaOperation: null, collapsed, colorMode: 'system', onNavigate: () => assert.fail('must not navigate'), onToggleCollapsed() {}, onSetColorMode: value => colorChanges.push(value), onOpenChangelog() {} }); while (effects.length) effects.shift()(); return tree; };
  const nodes = (tree, predicate) => {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, predicate));
    return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
  };
  const popovers = () => nodes(render(), node => node.type === 'popover');
  return { popovers, localeChanges, colorChanges, collapse() { collapsed = true; render(); }, nodes, render };
}

test('language and appearance menus are mutually exclusive; collapse closes them', () => {
  const page = sidebar();
  let [mode, language] = page.popovers();
  language.props.onToggle(); [mode, language] = page.popovers();
  assert.equal(language.props.open, true); assert.equal(mode.props.open, false);
  mode.props.onToggle(); [mode, language] = page.popovers();
  assert.equal(language.props.open, false); assert.equal(mode.props.open, true);
  page.collapse(); assert.ok(page.popovers().every(menu => menu.props.open === false));
});

test('choosing a native-named language closes its menu without changing appearance or navigating', async () => {
  const page = sidebar(); const language = page.popovers()[1];
  assert.equal(language.props.triggerVariant, 'preference');
  language.props.onToggle();
  const options = page.nodes(page.popovers()[1], node => node.props?.role === 'menuitemradio');
  assert.deepEqual(options.map(node => node.props.lang), ['zh-CN', 'en-US']);
  await options[0].props.onClick();
  assert.deepEqual(page.localeChanges, ['zh-CN']); assert.deepEqual(page.colorChanges, []);
  assert.equal(page.popovers()[1].props.open, false);
});
