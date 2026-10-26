import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { createUII18n } from '../../src/lib/i18n/runtime.ts';
import * as citations from '../../src/lib/knowledge/citations.ts';

async function fixture(locale = 'en-US', body = 'Keep this argument.') {
  const cells = [], changes = [], instance = createUII18n(locale);
  let cursor = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = initial; return [cells[i], value => { cells[i] = value; }]; },
    useRef(initial) { const i = cursor++; return cells[i] ??= { current: initial }; },
    useMemo: callback => callback(), useEffect() {},
  };
  const area = { value: body, selectionStart: 0, selectionEnd: body.length, setSelectionRange() {} };
  const props = { body, textareaRef: { current: area }, onChange(value) { props.body = value; changes.push(value); }, request: null, onConsumed() {}, disabled: false, scope: 'test' };
  const module = { exports: {} };
  const source = await readFile(new URL('../../src/components/knowledge/CitationTools.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, document: { body: {} }, requestAnimationFrame: callback => callback(), require(id) {
      if (id === 'react') return react;
      if (id.endsWith('/SelectField')) return { SelectField: 'select-field' };
      if (id === 'react/jsx-runtime') return jsx;
      if (id === 'react-dom') return { createPortal: node => node };
      if (id.endsWith('/UILocaleProvider')) return { useUITranslation: () => ({ t: instance.getFixedT(locale, 'knowledge') }) };
      if (id.endsWith('/DialogFrame')) return Object.fromEntries(['DialogFrame', 'DialogHeader', 'DialogFooter', 'DialogActions', 'DialogButton'].map(name => [name, name === 'DialogButton' ? 'button' : 'section']));
      if (id.endsWith('/TooltipButton')) return { TooltipButton: 'button' };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/ContentIcon')) return { ContentIcon: 'content-icon' };
      if (id.endsWith('/knowledge/citations')) return citations;
      if (id.endsWith('/nativeTextareaEdit')) return { insertUndoableText(target, value, _start, _end, _current, onChange) { target.value = value; onChange(value); return true; } };
      throw new Error(id);
    },
  });
  const all = node => Array.isArray(node) ? node.flatMap(all) : node?.props ? [node, ...all(node.props.children)] : [];
  const render = () => { cursor = 0; return all(module.exports.CitationTools(props)); };
  const label = key => instance.t(key, { ns: 'knowledge' });
  const button = key => render().find(node => node.type === 'button' && [node.props.children].flat().includes(label(key)));
  const change = (type, value) => render().find(node => node.type === type).props.onChange(type === 'select-field' ? value : { target: { value } });
  button('citation').props.onClick();
  return { props, area, changes, render, button, change, label };
}

test('new references allow insertion but cannot save an existing entry, with short bilingual renumber labels', async () => {
  for (const locale of ['en-US', 'zh-CN']) {
    const f = await fixture(locale);
    assert.ok([f.button('citationTidy').props.children].flat().includes(locale === 'en-US' ? 'Renumber' : '整理编号'));
    assert.match(f.button('citationTidy').props.tooltip, locale === 'en-US' ? /remove unused/ : /清除未使用/);
    f.change('textarea', 'A free-form source');
    assert.equal(f.button('citationSave').props.disabled, true);
    assert.equal(f.button('citationInsert').props.disabled, false);
    await f.button('citationSave').props.onClick();
    assert.equal(f.changes.length, 0);
    await f.button('citationInsert').props.onClick();
    assert.equal(citations.readCitations(f.props.body).entries[0].text, 'A free-form source');
    assert.ok(f.props.body.startsWith('Keep this argument.'));
  }
});

test('editing and reverting an existing reference toggles actions; save changes text without inserting another marker', async () => {
  const original = citations.insertCitation('An argument.', { start: 12, end: 12 }, 'Reference A', '## References');
  const f = await fixture('en-US', original.body);
  f.change('select-field', original.id);
  assert.equal(f.button('citationSave').props.disabled, true);
  assert.equal(f.button('citationInsert').props.disabled, false);
  f.change('textarea', 'Reference A edited');
  assert.equal(f.button('citationSave').props.disabled, false);
  assert.equal(f.button('citationInsert').props.disabled, true);
  await f.button('citationInsert').props.onClick();
  assert.equal(f.changes.length, 0);
  f.change('textarea', 'Reference A');
  assert.equal(f.button('citationSave').props.disabled, true);
  assert.equal(f.button('citationInsert').props.disabled, false);
  f.change('textarea', 'Reference A edited');
  await f.button('citationSave').props.onClick();
  assert.equal(citations.readCitations(f.props.body).entries[0].text, 'Reference A edited');
  assert.equal(f.props.body.split('](#' + original.id + ')').length, original.body.split('](#' + original.id + ')').length);
});

test('read-only, stale and malformed bodies keep every reference action disabled', async () => {
  for (const state of ['read-only', 'stale', 'malformed']) {
    const f = await fixture('en-US', state === 'malformed' ? '<!-- rainy-citations --> broken' : undefined);
    if (state === 'read-only') f.props.disabled = true;
    if (state === 'stale') f.props.body += '\nAn external edit';
    for (const key of ['citationTidy', 'citationSave', 'citationInsert']) assert.equal(f.button(key).props.disabled, true, state + ': ' + key);
    await f.button('citationInsert').props.onClick();
    assert.equal(f.changes.length, 0);
  }
});
