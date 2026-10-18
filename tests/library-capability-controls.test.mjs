import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { jsx, jsxs } from 'react/jsx-runtime';
import { withUILocaleImports } from './ui-locale-fixture.mjs';
import { DEFAULT_FORMAT_BUNDLE } from '../src/lib/article-format/config.ts';
import { DEFAULT_ALGORITHMS } from '../src/lib/article-format/algorithms.ts';
import { activateFormatBundle } from '../src/lib/article-format/runtime.ts';

async function component(path, name) {
  const source = await readFile(new URL('../src/components/' + path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: withUILocaleImports(id => {
    if (id.endsWith('/ModeSwitch')) return { ModeSwitch };
    if (id.endsWith('/TooltipButton')) return { TooltipButton: 'tooltip-button' };
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    throw new Error(id);
  }) });
  return module.exports[name];
}
const ModeSwitch = await component('global/ModeSwitch.tsx', 'ModeSwitch');
const PreviewModeSwitch = await component('editor/PreviewModeSwitch.tsx', 'PreviewModeSwitch');
const ArticleThemeSelect = await component('themes/ArticleThemeSelect.tsx', 'ArticleThemeSelect');
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value?.props ? [value, ...nodes(value.props.children)] : [];
test.afterEach(() => activateFormatBundle(structuredClone(DEFAULT_FORMAT_BUNDLE), null, 'built-in'));

test('disabled theme and preview controls expose the configured reason and do not dispatch actions', () => {
  const raw = structuredClone(DEFAULT_FORMAT_BUNDLE), reason = 'The library owns this choice';
  activateFormatBundle(raw, 'locked', 'library', undefined, DEFAULT_ALGORITHMS, 'library', { schemaVersion: 1, meta: { id: raw.support.meta.id }, capabilities: { articleTheme: { enabled: false, reason }, previewMode: { enabled: false, reason } } });
  let changes = 0;
  const preview = PreviewModeSwitch({ dark: false, onToggle: () => changes++ });
  assert.equal(preview.props.reason, reason);
  const button = preview.type(preview.props);
  assert.equal(button.props.tooltip, reason);
  assert.equal(button.props.disabled, true);
  button.props.onClick();
  const picker = ArticleThemeSelect({ themes: [{ id: 'one', name: 'One' }], value: 'one', onChange: () => changes++ });
  assert.equal(picker.props.title, reason);
  const select = nodes(picker).find(node => node.type === 'select');
  assert.equal(select.props.disabled, true);
  select.props.onChange({ target: { value: 'another' } });
  assert.equal(changes, 0);
});

test('undeclared capabilities keep the original controls, labels and dispatch behavior', () => {
  let changes = 0;
  const preview = PreviewModeSwitch({ dark: true, onToggle: () => changes++ });
  const button = preview.type(preview.props);
  assert.equal(button.props.disabled, false); assert.equal(button.props['aria-checked'], true);
  button.props.onClick();
  const picker = ArticleThemeSelect({ themes: [{ id: 'one', name: 'One' }], value: 'one', onChange: () => changes++ });
  nodes(picker).find(node => node.type === 'select').props.onChange({ target: { value: 'another' } });
  assert.equal(changes, 2);
  assert.equal(preview.props.reason, undefined);
});
