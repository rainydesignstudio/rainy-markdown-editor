import * as uiFormatters from '../src/lib/i18n/formatters.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { createUII18n } from '../src/lib/i18n/runtime.ts';

const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];

test('English asset toolbar preserves user search and option names and submits canonical sorting IDs', async () => {
  const source = await readFile(new URL('../src/components/media/MediaToolbar.tsx', import.meta.url), 'utf8');
  const instance = createUII18n('en-US'), module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require(id) {
      if (id.endsWith('/SelectField')) return { SelectField: 'select-field' };
      if (id === 'react/jsx-runtime') return { jsx, jsxs, Fragment };
      if (id.endsWith('/i18n/formatters')) return uiFormatters;
      if (id.endsWith('/UILocaleProvider')) return { useUILocale: () => ({ locale: 'en-US' }), useUITranslation: ns => ({ t: instance.getFixedT('en-US', ns) }) };
      if (id.endsWith('/SnippetCategoryDialog')) return { CategoryIcon: 'category-icon' };
      if (id.endsWith('/resources/types')) return { RESOURCE_TYPES: [] };
      if (id.endsWith('/IconPopover')) return { IconPopover: 'popover' };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/MediaGallery')) return { MediaIcon: 'icon', MediaSourceSwitch: 'source-switch' };
      throw new Error(id);
    },
  });
  const query = '紫序/图 1', values = [], preferences = { columns: 3, sort: 'name', descending: false };
  const groups = { value: 'project:user', options: [{ value: 'project:user', label: '我的项目' }], onChange() {} };
  const tree = module.exports.MediaToolbar({ source: 'article', query, groups, preferences, activeControl: 'sort', disabled: false, onControlChange() {}, onPreferencesChange: next => values.push(next), onQueryChange() {}, onSourceChange() {} });
  const nodes = walk(tree);
  assert.equal(nodes.find(node => node.type === 'input').props.value, query);
  assert.equal(nodes.some(node => node.type === 'popover' && node.props.label === 'Project group'), false, 'article navigation now owns grouping');
  const modified = nodes.find(node => node.type === 'button' && node.props.children?.some?.(child => child?.props?.children === 'Modified time'));
  assert.ok(modified); modified.props.onClick();
  assert.equal(values[0].sort, 'modified');
  assert.equal(values[0].columns, 3); assert.equal(values[0].descending, false);
});

test('registered content and settings tabs keep IDs separate from localized labels', () => {
  for (const locale of ['zh-CN', 'en-US']) {
    const instance = createUII18n(locale);
    for (const [ns,ids] of [['content',['snippets','templates']],['settings',['library','appearance','workflow']]]) {
      for (const id of ids) assert.ok(instance.exists(ns + ':tabs.' + id));
    }
    for (const id of ['light','dark','system']) assert.ok(instance.exists('settings:colorModes.' + id));
  }
});
