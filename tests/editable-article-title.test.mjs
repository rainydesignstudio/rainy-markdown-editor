import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

test('shared title editing grows through utilities, supports IME, and Escape restores the original without blur recommitting', async () => {
  const source = await readFile(new URL('../src/components/editor/EditableArticleTitle.tsx', import.meta.url), 'utf8');
  const cells = []; let cursor = 0, value = 'Original', prevented = 0;
  const module = { exports: {} };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = initial; return [cells[i], next => { cells[i] = next; }]; },
    useRef(initial) { const i = cursor++; return cells[i] ??= { current: initial }; }, useEffect() {},
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs } : name.endsWith('/ContentIcon') ? { ContentIcon: 'svg' } : { useUITranslation: () => ({ t: key => key }) },
  });
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  const render = () => { cursor = 0; return walk(module.exports.EditableArticleTitle({ value, onChange: next => { value = next; } })); };
  render().find(n => n.type === 'button').props.onClick();
  let input = render().find(n => n.type === 'textarea');
  assert.match(input.props.className, /field-sizing-content/); assert.equal(input.props.style, undefined);
  input.props.onChange({ target: { value: 'Long title\nwith a line break' } });
  assert.equal(value, 'Long title with a line break', 'typing updates the draft and immediately enables article saving');
  input = render().find(n => n.type === 'textarea');
  const event = { key: 'Enter', nativeEvent: { isComposing: true }, preventDefault: () => prevented++, stopPropagation() {} };
  input.props.onKeyDown(event); assert.equal(prevented, 0); assert.ok(render().some(n => n.type === 'textarea'));
  input.props.onKeyDown({ ...event, key: 'Escape', nativeEvent: { isComposing: false } });
  input.props.onBlur(); assert.equal(value, 'Original'); assert.ok(render().some(n => n.type === 'button'));
});
