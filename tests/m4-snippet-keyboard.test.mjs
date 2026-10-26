import { withTextInputHistory } from './text-input-history-fixture.mjs';
const sourceSearch = await import('../src/lib/sourceSearch.ts');
const sourceViewport = await import('../src/lib/sourceViewport.ts');
import * as nativeEdit from '../src/lib/nativeTextareaEdit.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import * as composer from '../src/lib/snippetComposer.ts';
import * as highlighter from '../src/lib/editorSourceHighlight.ts';
import * as lineDiagnostics from '../src/lib/sourceLineDiagnostics.ts';
import * as frontMatter from '../src/lib/frontMatter.ts';

const source = await readFile(new URL('../src/components/content/SnippetTextarea.tsx', import.meta.url), 'utf8');
const walk = n => Array.isArray(n) ? n.flatMap(walk) : n?.props ? [n, ...walk(n.props.children)] : [];
function inputFixture(value, snippets, synchronousCommit = true, extras = {}) {
  let cursor = 0, cells = [], effects = [], input, tree, frames = 0, inserted = [];
  const history = [];
  const listeners = new Set();
  const document = { activeElement: null, addEventListener(_name, listener) { listeners.add(listener); }, removeEventListener(_name, listener) { listeners.delete(listener); }, execCommand(command, _ui, text) {
    if (command === 'undo' || command === 'redo') {
      const event = { inputType: command === 'undo' ? 'historyUndo' : 'historyRedo', preventDefault() { this.defaultPrevented = true; } };
      listeners.forEach(listener => listener(event));
      if (event.defaultPrevented) return true;
    }
    if (command === 'insertText') {
      history.push(element.value); inserted.push(text);
      const start = element.selectionStart;
      element.value = element.value.slice(0, start) + text + element.value.slice(element.selectionEnd);
      element.setSelectionRange(start + text.length, start + text.length);
    } else if (command === 'undo') element.value = history.pop();
    else return false;
    input.props.onChange({ currentTarget: element });
    if (synchronousCommit) render();
    return true;
  } };
  const element = { tagName: 'TEXTAREA', ownerDocument: document, value, selectionStart: value.length, selectionEnd: value.length, selectionDirection: 'none', scrollTop: 0, scrollLeft: 0, focus() { document.activeElement = this; }, setSelectionRange(start, end, direction = 'none') { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }, setRangeText(text, start, end) { inserted.push(text); this.value = this.value.slice(0, start) + text + this.value.slice(end); this.setSelectionRange(start + text.length, start + text.length); } };
  const overlay = { scrollTop: 0, scrollLeft: 0, querySelector() { return null; } };
  const menu = { scrollTop: 0, clientHeight: 160, clientTop: 1, firstElementChild: { offsetHeight: 32 }, getBoundingClientRect() { return { top: 100, bottom: 262 }; }, querySelector() {
    const options = walk(tree).filter(n => n.props.role === 'treeitem');
    const i = options.findIndex(n => n.props['aria-selected']);
    return i < 0 ? null : { getBoundingClientRect: () => ({ top: 133 + i * 52 - menu.scrollTop, bottom: 185 + i * 52 - menu.scrollTop }) };
  } };
  const props = { value, snippets, ...extras, onChange(next) { props.value = next; if (synchronousCommit) render(); } };
  const react = {
    forwardRef: fn => fn, useMemo: fn => fn(),
    useRef(initial) { const i = cursor++; return cells[i] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = initial; return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; },
    useLayoutEffect(effect, deps) { const i = cursor++; if (!cells[i] || deps.some((d, j) => !Object.is(d, cells[i][j]))) { cells[i] = deps; effects.push(effect); } },
  };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, document,
    requestAnimationFrame() { frames++; throw new Error('Caret restoration must not queue a stale animation frame'); },
    require: withTextInputHistory(function require(id) {
      if (id.endsWith('/useFormatSnapshot')) return { useFormatSnapshot: () => ({ id: 'test-format' }) };
      if (id.endsWith('/frontMatter')) return frontMatter;
      if (id.endsWith('/ScrollViewport')) return { ScrollViewport: 'scroll-viewport' };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/SourceFindBar')) return { SourceFindBar: 'source-find', FindIcon: 'find-icon' };
      if (id.endsWith('/sourceSearch')) return sourceSearch;
      if (id.endsWith('/sourceViewport')) return sourceViewport;
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id === 'react-dom') return { createPortal: children => children };
      if (id.endsWith('/nativeTextareaEdit')) return nativeEdit;
      if (id.endsWith('/snippetComposer')) return composer;
      if (id.endsWith('/SnippetCategoryDialog')) return { CategoryIcon: 'category-icon' };
      if (id.endsWith('/editorSourceHighlight')) return highlighter;
      if (id.endsWith('/sourceLineDiagnostics')) return lineDiagnostics;
      throw new Error(id);
    }),
  });
  function render() {
    cursor = 0; tree = module.exports.SnippetTextarea(props, null);
    const nodes = walk(tree); input = nodes.find(n => n.type === 'textarea'); input.props.ref(element);
    nodes.find(n => n.props['aria-hidden'] && typeof n.props.ref === 'object').props.ref.current = overlay;
    const popup = nodes.find(n => n.props.className === 'snippet-command-menu'); if (popup) popup.props.ref.current = menu;
    while (effects.length) effects.shift()();
    return tree;
  }
  function key(key, rest = {}, commit = true) {
    let prevented = false;
    input.props.onKeyDown({ key, keyCode: 0, currentTarget: element, nativeEvent: { isComposing: false }, get defaultPrevented() { return prevented; }, preventDefault() { prevented = true; }, stopPropagation() {}, ...rest });
    if (commit) render(); return prevented;
  }
  render(); element.focus(); input.props.onSelect({ currentTarget: element }); render();
  return { element, props, document, menu, render, key, nodes: () => walk(tree), frames: () => frames, inserted, input: () => input };
}
const opening = { id: 'zixu-opening', name: '开场卡', description: '', trigger: '//zixu-opening', content: '<section class="mt-0 mb-7 border-0 bg-[#F5F5F7] px-5 py-6">\r\n<h1 class="text-[26px]/[1.5]">▌文章标题😀</h1>\r\n</section>\r\n' };

test('body-only editing displays file line numbers and diagnostic labels without changing body offsets', () => {
  const original = 'First\nSecond\nThird';
  const f = inputFixture(original, [], true, { showLineNumbers: true, lineOffset: 11, sourceHeader: jsx('details', { children: 'Metadata' }), lineConcerns: new Map([[2, { severity: 'error', messages: ['Concern'] }]]) });
  assert.equal(f.input().props.value, original);
  const nodes = f.nodes();
  assert.ok(nodes.some(n => n.type === 'span' && n.props.children === 12));
  assert.ok(nodes.some(n => n.type === 'span' && n.props.children === 14));
  assert.ok(nodes.some(n => n.type === 'button' && n.props.children === 13 && n.props['aria-label'].includes('13')));
  const viewport = nodes.find(n => n.props['data-source-viewport']);
  assert.equal(walk(viewport).some(n => n.type === 'details'), false, 'metadata spans the full panel outside the source scrollbar gutter');
  assert.ok(nodes.findIndex(n => n.type === 'details') < nodes.indexOf(viewport));
  assert.equal(f.props.value, original);
});

test('read-only sources allow finding while every replacement path preserves the source', () => {
  const openFindRef = { current: null }, original = 'Alpha alpha';
  const f = inputFixture(original, [], true, { readOnly: true, openFindRef });
  openFindRef.current(); f.render();
  let bar = f.nodes().find(n => n.type === 'source-find' && n.props.open);
  bar.props.onQuery('alpha'); f.render();
  bar = f.nodes().find(n => n.type === 'source-find' && n.props.open);
  assert.equal(bar.props.count, 2);
  assert.equal(bar.props.disabled, true);
  bar.props.onReplacement('Beta'); f.render();
  bar = f.nodes().find(n => n.type === 'source-find' && n.props.open);
  bar.props.onReplace(); bar.props.onReplaceAll();
  assert.equal(f.props.value, original);
  assert.equal(f.inserted.length, 0);
});

test('replace-all requires confirmation, cancels without edits, refreshes changed content, and restores it in one undo', () => {
  const openFindRef = { current: null }, original = 'Alpha alpha';
  const f = inputFixture(original, [], true, { openFindRef });
  openFindRef.current(); f.render();
  let bar = () => f.nodes().find(n => n.type === 'source-find' && n.props.open);
  bar().props.onQuery('alpha'); bar().props.onReplacement(''); f.render();
  bar().props.onReplaceAll(); f.render();
  assert.equal(f.props.value, original);
  assert.equal(bar().props.decision.count, 2);
  bar().props.onCancelAll(); f.render(); assert.equal(f.props.value, original);
  bar().props.onReplaceAll(); f.render();
  f.props.value = f.element.value = 'Alpha alpha alpha'; f.render(); f.render();
  assert.equal(bar().props.decision.changed, true);
  assert.equal(bar().props.decision.count, 3);
  bar().props.onConfirmAll(); f.render();
  assert.equal(f.props.value, '  ');
  assert.equal(bar().props.decision, null);
  f.element.focus(); f.key('z', { metaKey: true });
  assert.equal(f.props.value, 'Alpha alpha alpha');
  f.key('z', { metaKey: true, shiftKey: true }); assert.equal(f.props.value, '  ');
});

test('Cmd/Ctrl+G cycles matches in both directions, reopens the bar without claiming query focus, and ignores IME', () => {
  const openFindRef = { current: null };
  const f = inputFixture('Alpha alpha ALPHA', [], true, { openFindRef });
  const bar = () => f.nodes().find(n => n.type === 'source-find' && n.props.open);
  const capture = (modifiers = {}) => {
    const event = { key: 'g', metaKey: true, target: f.element, nativeEvent: { isComposing: false }, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...modifiers };
    f.nodes().find(n => n.props.onKeyDownCapture).props.onKeyDownCapture(event); f.render(); return event;
  };
  capture(); assert.equal(bar().props.autoFocusQuery, true);
  bar().props.onQuery('alpha'); f.render();
  capture(); assert.equal(bar().props.index, 1); assert.equal(f.element.selectionStart, 6);
  capture({ metaKey: false, ctrlKey: true, shiftKey: true }); assert.equal(bar().props.index, 0);
  capture({ nativeEvent: { isComposing: true } }); assert.equal(bar().props.index, 0);
  bar().props.onClose(); f.render(); capture();
  assert.equal(bar().props.autoFocusQuery, false);
  assert.equal(f.document.activeElement, f.element);
  assert.equal(bar().props.index, 1);
});

test('input and highlight share one scrolling ancestor, with no independently scrolling text mirrors', () => {
  const f = inputFixture('甲\n\n乙', []);
  const viewport = f.nodes().find(n => n.props['data-source-viewport']);
  assert.equal(viewport.type, 'scroll-viewport', 'the shared viewport owns source scrolling');
  const content = walk(viewport).find(n => n.props['data-source-content']);
  assert.ok(walk(content).some(n => n.type === 'pre'));
  assert.ok(walk(content).includes(f.input()));
  assert.ok(f.input().props.className.includes('overflow-hidden'));
  assert.equal(f.input().props.className.includes('overflow-y-auto'), false);
  const passive = f.nodes().find(n => n.props['aria-hidden'] && n.props.ref);
  assert.equal(passive.props.className.includes('overflow-hidden'), false);
  f.element.scrollTop = 80;
  f.input().props.onScroll({ currentTarget: f.element });
  assert.equal(f.element.scrollTop, 0);
});

test('current search matches keep a yellow layer through navigation and blur without changing ordinary selections', () => {
  const openFindRef = { current: null }, f = inputFixture('Alpha alpha', [], true, { openFindRef });
  const bar = () => f.nodes().find(n => n.type === 'source-find' && n.props.open);
  const marks = () => f.nodes().filter(n => n.type === 'mark');
  openFindRef.current(); f.render(); bar().props.onQuery('alpha'); f.render();
  assert.ok(marks().every(n => n.props.className.includes('bg-search-hit') && n.props.className.includes('text-search-hit-ink')));
  assert.ok(marks().length);
  bar().props.onMove(1); f.render();
  assert.equal(f.input().props['data-find-active'], true);
  assert.equal(f.element.selectionStart, 6);
  f.input().props.onBlur(); f.render();
  assert.equal(f.input().props['data-find-active'], true);
  f.element.setSelectionRange(1, 3); f.input().props.onSelect({ currentTarget: f.element }); f.render();
  assert.equal(f.input().props['data-find-active'], false);
  bar().props.onQuery('absent'); f.render(); assert.equal(marks().length, 0);
  assert.equal(f.props.value, 'Alpha alpha');
});

test('pointer focus preserves the scrolled viewport before the click places a new caret', () => {
  const f = inputFixture('First\nLast', []);
  const viewport = { scrollTop: 900, scrollLeft: 0 };
  f.nodes().find(n => n.props['data-source-viewport']).props.ref.current = viewport;
  f.element.setSelectionRange(0, 0);
  f.input().props.onPointerDown();
  viewport.scrollTop = 0; // Browser focus attempted to reveal the old caret.
  f.input().props.onFocus();
  assert.equal(viewport.scrollTop, 900);
  f.element.setSelectionRange(8, 8);
  f.input().props.onSelect({ currentTarget: f.element });
  f.input().props.onPointerUp();
  f.input().props.onClick({ currentTarget: f.element });
  assert.equal(viewport.scrollTop, 900);
  assert.equal(f.element.selectionStart, 8);
});

test('typing a valid snippet trigger closes find, retains form values, and opens the snippet tree', () => {
  const openFindRef = { current: null }, f = inputFixture('Body', [opening], true, { openFindRef });
  const bar = () => f.nodes().find(n => n.type === 'source-find' && n.props.open);
  openFindRef.current(); f.render();
  bar().props.onQuery('Body'); bar().props.onReplacement('Text'); f.render();
  f.element.value = 'Body\n//'; f.element.setSelectionRange(7, 7);
  f.input().props.onChange({ currentTarget: f.element }); f.render();
  assert.equal(bar(), undefined);
  assert.equal(f.input().props['aria-expanded'], true);
  openFindRef.current(); f.render();
  assert.equal(bar().props.query, 'Body'); assert.equal(bar().props.replacement, 'Text');
});

test('snippet picker also closes find, while URLs, code fences and IME keep their ordinary behavior', () => {
  const openFindRef = { current: null }, openPickerRef = { current: null };
  const f = inputFixture('Body', [opening], true, { openFindRef, openPickerRef });
  openFindRef.current(); f.render(); openPickerRef.current(); f.render();
  assert.equal(f.nodes().some(n => n.type === 'source-find' && n.props.open), false);
  assert.equal(f.input().props['aria-expanded'], true);
  for (const value of ['https://example.test//', '```md\n//']) {
    const opener = { current: null }, g = inputFixture('Body', [opening], true, { openFindRef: opener });
    opener.current(); g.render(); g.element.value = value; g.element.setSelectionRange(value.length, value.length);
    g.input().props.onChange({ currentTarget: g.element }); g.render();
    assert.equal(g.nodes().some(n => n.type === 'source-find' && n.props.open), true);
  }
});

test('an active IME composition blocks stale replacement callbacks until composition finishes', () => {
  const openFindRef = { current: null }, original = 'Alpha alpha';
  const f = inputFixture(original, [], true, { openFindRef });
  openFindRef.current(); f.render();
  let bar = f.nodes().find(n => n.type === 'source-find' && n.props.open);
  bar.props.onQuery('alpha'); bar.props.onReplacement('Beta'); f.render();
  f.input().props.onCompositionStart({ currentTarget: f.element }); f.render();
  bar = f.nodes().find(n => n.type === 'source-find' && n.props.open);
  assert.equal(bar.props.composing, true);
  bar.props.onReplace(); bar.props.onReplaceAll();
  assert.equal(f.props.value, original);
  assert.equal(f.inserted.length, 0);
  f.input().props.onCompositionEnd({ currentTarget: f.element }); f.render();
  f.nodes().find(n => n.type === 'source-find' && n.props.open).props.onReplace();
  assert.equal(f.props.value, 'Beta alpha');
});

test('standard insert-menu text replaces the selection in one source undo step and keeps inline formatting inline', () => {
  const insertTextRef = { current: null };
  const original = '正文 selected 结尾';
  const f = inputFixture(original, [], true, { insertTextRef });
  f.element.setSelectionRange(3, 11);
  assert.equal(insertTextRef.current('**粗体**', 2), true);
  assert.equal(f.props.value, '正文 **粗体** 结尾');
  assert.equal(f.element.selectionStart, 5);
  assert.equal(f.inserted.length, 1);
  f.document.execCommand('undo');
  assert.equal(f.props.value, original);
  f.element.setSelectionRange(original.length, original.length);
  assert.equal(insertTextRef.current('\n## 标题', 4), true);
  f.document.execCommand('undo');
  assert.equal(f.props.value, original);
});

test('the source toolbar uses the same undoable insert ref as the input', async () => {
  const code = ts.transpileModule(await readFile(new URL('../src/components/editor/SourcePanel.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  let lineToggles = 0;
  vm.runInNewContext(code, {
    module, exports: module.exports, require: withTextInputHistory(function require(id) {
      if (id.endsWith('/useFormatSnapshot')) return { useFormatSnapshot: () => ({ id: 'test-format' }) };
      if (id.endsWith('/CollapsiblePanel')) return { PanelHeading: 'panel-heading' };
      if (id.endsWith('/frontMatter')) return frontMatter;
      if (id.endsWith('/sourceViewport')) return sourceViewport;
      if (id.endsWith('/ScrollViewport')) return { ScrollViewport: 'scroll-viewport' };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/SourceFindBar')) return { SourceFindBar: 'source-find', FindIcon: 'find-icon' };
      if (id.endsWith('/usePreviewPreferences')) return { usePreviewPreferences: () => ({ preferences: { saveOnly: false } }) };
      if (id === 'react') return { useRef: value => ({ current: value }), useState: value => [value, () => {}], useMemo: fn => fn(), useEffect() {}, useLayoutEffect() {} };
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id.endsWith('/articleAuthoringFormat')) return { validateArticleAuthoringMarkdown: async () => [] };
      if (id.endsWith('/sourceLineDiagnostics')) return lineDiagnostics;
      if (id.endsWith('/mediaManagement')) return { inspectLocalArticleImages: async () => [] };
      if (id.endsWith('/resources/inspection')) return { inspectArticleResources: async () => [] };
      if (id.endsWith('/useResourceVersion')) return { useResourceDocumentVersion: () => 0 };
      if (id.endsWith('/useMediaPreferences')) return { useAuthoringChecks: () => [true, () => {}] };
      if (id.endsWith('/useSourceLineNumbers')) return { useSourceLineNumbers: () => ({ showLineNumbers: false, toggle() { lineToggles++; } }) };
      if (id.endsWith('/SnippetTextarea')) return { SnippetTextarea: 'snippet-input' };
      if (id.endsWith('/InsertElementsMenu')) return { InsertElementsMenu: 'insert-menu' };
      if (id.endsWith('/InformationButton')) return { InformationButton: 'information', InformationIcon: 'icon' };
      throw new Error(id);
    }),
  });
  const parsed = frontMatter.parseArticle('---\ntitle: Test\n---\nKept source\nCard two\nCard three');
  const tree = module.exports.SourcePanel({ article: {}, parsed, sourceFormatIssues: [{ kind: 'element', name: 'width', source: '当前正文实际渲染', tier: 'error', line: 2, message: '横向溢出' }], sourceTextareaRef: { current: {} }, status: {}, citationTools: jsx('citation-tools', {}), onChangeBody() { throw new Error('Toolbar must not replace controlled source directly'); } });
  const nodes = walk(tree), input = nodes.find(n => n.type === 'snippet-input'), menu = nodes.find(n => n.type === 'insert-menu'), calls = [];
  assert.equal(input.props.lineConcerns.get(2).severity, 'error', 'the existing gutter receives rendered body findings');
  assert.equal(input.props.lineOffset, 3);
  assert.equal(input.props.value, parsed.body);
  const metadata = module.exports.SourceMetadataHeader(input.props.sourceHeader.props);
  assert.equal(metadata.type, 'details');
  assert.equal(metadata.props.open, undefined, 'metadata starts collapsed');
  assert.equal(walk(metadata).find(node => node.type === 'panel-heading').props.compact, true);
  assert.ok(nodes.findIndex(node => node.type === 'icon-button' && node.props.icon?.type === 'find-icon') < nodes.findIndex(node => node.type === 'citation-tools'));
  assert.ok(nodes.findIndex(node => node.type === 'citation-tools') < nodes.findIndex(node => node.type === 'insert-menu'));
  assert.equal(walk(metadata).some(node => ['input', 'textarea'].includes(node.type) || node.props.contentEditable), false);
  assert.equal(parsed.source, '---\ntitle: Test\n---\nKept source\nCard two\nCard three');
  input.props.insertTextRef.current = (...args) => calls.push(args);
  menu.props.onInsert('**bold**', 2);
  assert.deepEqual(calls, [['**bold**', 2]]);
  const inside = {}, outside = {};
  const shortcut = overrides => {
    const event = { key: '/', ctrlKey: true, nativeEvent: { isComposing: false }, target: inside,
      currentTarget: { contains: target => target === inside }, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...overrides };
    tree.props.onKeyDownCapture(event);
    return event;
  };
  assert.equal(shortcut({ ctrlKey: false, metaKey: true }).defaultPrevented, true);
  assert.equal(shortcut({}).defaultPrevented, true);
  assert.equal(lineToggles, 2);
  for (const event of [{ ctrlKey: false }, { key: '?' }, { altKey: true }, { repeat: true }, { nativeEvent: { isComposing: true } }, { keyCode: 229 }, { target: outside }]) {
    assert.equal(shortcut(event).defaultPrevented, undefined);
  }
  assert.equal(lineToggles, 2, 'ordinary typing, IME, repeated keys and portal dialogs do not toggle line numbers');
  assert.ok(nodes.some(node => node.props.tooltip === '显示行号（⌘/ / Ctrl+/）'));
  const longParsed = frontMatter.parseArticle('---\ntitle: Test\n---\n' + Array(998).fill('Body').join('\n'));
  const longTree = module.exports.SourcePanel({ article: {}, parsed: longParsed, sourceTextareaRef: { current: {} }, status: {}, onChangeBody() {} });
  const warning = walk(longTree).find(node => node.type === 'p' && node.props.className?.includes('bg-warning-surface'));
  assert.ok(warning, 'long-document warning counts metadata as part of the file');
  assert.match(String(warning.props.children), /1,?001/);
});

test('Tab inserts a long Unicode HTML snippet and preserves its marker through a synchronous controlled update and undo', () => {
  const original = '前文😀 //zixu-opening';
  let compiled = 0;
  const f = inputFixture(original, [opening], true, { onSnippetInserted: () => { compiled++; } });
  assert.equal(f.key('Tab'), true);
  assert.equal(compiled, 1);
  const caret = f.element.value.indexOf('文章标题😀');
  assert.equal(f.element.selectionStart, caret);
  assert.equal(f.element.selectionEnd, caret);
  assert.equal(f.element.value.includes('\r'), false);
  assert.ok(f.element.value.startsWith('前文😀 \n<section'));
  assert.equal(f.inserted.length, 1);
  assert.equal(f.frames(), 0);
  assert.ok(!f.nodes().some(n => n.props.role === 'treeitem'));
  f.document.execCommand('undo');
  assert.equal(f.props.value, original);
});

test('keyboard navigation scrolls the selected item inside the popup, wraps, and Enter inserts that item', () => {
  const snippets = Array.from({ length: 11 }, (_, i) => ({ id: `item-${i}`, name: `item-${i}`, description: '', trigger: `//item-${i}`, content: `item-${i}▌` }));
  const f = inputFixture('//', snippets);
  f.key('ArrowRight'); f.key('ArrowRight');
  for (let i = 0; i < 10; i++) assert.equal(f.key('ArrowDown'), true);
  assert.ok(f.menu.scrollTop > 0);
  assert.equal(f.input().props['aria-activedescendant'], 'snippet-option-item-10');
  assert.equal(f.document.activeElement, f.element);
  f.key('ArrowDown');
  assert.equal(f.input().props['aria-activedescendant'], 'snippet-category-uncategorized');
  assert.equal(f.menu.scrollTop, 0);
  f.key('ArrowUp');
  assert.equal(f.input().props['aria-activedescendant'], 'snippet-option-item-10');
  assert.ok(f.menu.scrollTop > 0);
  f.key('ArrowLeft'); f.key('ArrowLeft');
  assert.equal(f.nodes().filter(n => n.props.role === 'treeitem').length, 1);
  f.key('ArrowRight'); f.key('ArrowUp');
  f.key('Enter');
  assert.equal(f.props.value, 'item-10');
});

test('Shift-Tab, IME and no-match Tab retain native behavior; moving focus cancels pending restoration', () => {
  const f = inputFixture('//zixu-opening', [opening], false);
  assert.equal(f.key('Tab', { shiftKey: true }), false);
  assert.equal(f.key('Tab', { nativeEvent: { isComposing: true } }), false);
  assert.equal(f.inserted.length, 0);
  f.key('Escape'); assert.equal(f.key('Tab'), false);
  const second = inputFixture('//zixu-opening', [opening], false);
  second.key('Tab', {}, false);
  second.element.setSelectionRange(1, 1);
  second.input().props.onBlur(); second.document.activeElement = {};
  second.render();
  assert.equal(second.element.selectionStart, 1);
  assert.equal(second.frames(), 0);
});

test('picker entry inserts // at a line start, otherwise adds one newline, and opens category navigation', () => {
  for (const [original, expected] of [['正文', '正文\n//'], ['正文\n', '正文\n//']]) {
    const opener = { current: null };
    let compiled = 0;
    const f = inputFixture(original, [opening], true, { openPickerRef: opener, onSnippetInserted: () => { compiled++; } });
    opener.current(); f.render();
    assert.equal(f.props.value, expected);
    assert.equal(compiled, 0, 'opening the snippet picker is not a completed snippet insertion');
    assert.equal(f.element.selectionStart, expected.length);
    const category = f.nodes().find(n => n.props.role === 'treeitem');
    assert.equal(category.props['aria-level'], 1);
    assert.equal(category.props['aria-expanded'], false);
    assert.equal(f.input().props['aria-haspopup'], 'tree');
  }
});

test('grouping follows directory index metadata and search opens only matching groups', () => {
  const snippets = [{ ...opening, categoryId: 'zixu', icon: 'quote' }, { ...opening, id: 'image', trigger: '//image', categoryId: 'uncategorized' }];
  const categories = [{ id: 'zixu', name: '紫序', description: '', order: 2, icon: 'book' }, { id: 'uncategorized', name: '通用', description: '', order: 0 }];
  const grouped = composer.groupSnippetMatches(snippets, categories);
  assert.deepEqual(grouped.map(g => g.name), ['通用', '紫序']);
  assert.equal(grouped[1].icon, 'book');
  assert.equal(composer.snippetTreeRows(grouped, []).length, 2);
  const f = inputFixture('//zixu-o', snippets, true, { categories });
  assert.equal(f.nodes().filter(n => n.props.role === 'treeitem').length, 2);
  assert.equal(f.input().props['aria-activedescendant'], 'snippet-option-zixu-opening');
  const snippetRow = f.nodes().find(n => n.props.id === 'snippet-option-zixu-opening');
  assert.equal(walk(snippetRow).find(n => n.type === 'category-icon').props.name, 'quote');
  assert.equal(snippetRow.props.className.includes('ml-6'), false, 'the icon and text use the same left column as the category row');
});

test('article formatting keys and menu ref use one native undoable source edit; other editors and guarded input are unchanged', () => {
  for (const [key, expected] of [['b', '**selected**'], ['i', '*selected*'], ['u', '<u>selected</u>']]) {
    const formatSelectionRef = { current: null }, f = inputFixture('selected', [], true, { formatSelectionRef });
    f.element.setSelectionRange(0, 8);
    assert.equal(f.key(key, { metaKey: true }), true);
    assert.equal(f.props.value, expected);
    assert.equal(f.element.value.slice(f.element.selectionStart, f.element.selectionEnd), 'selected');
    f.document.execCommand('undo'); assert.equal(f.props.value, 'selected');
  }
  const ref = { current: null }, menu = inputFixture('chosen', [], true, { formatSelectionRef: ref });
  menu.element.setSelectionRange(0, 6); assert.equal(ref.current('bold'), true);
  assert.equal(menu.props.value, '**chosen**'); menu.document.execCommand('undo'); assert.equal(menu.props.value, 'chosen');
  for (const extras of [{}, { readOnly: true, formatSelectionRef: { current: null } }, { disabled: true, formatSelectionRef: { current: null } }]) {
    const f = inputFixture('kept', [], true, extras); assert.equal(f.key('b', { ctrlKey: true }), false); assert.equal(f.props.value, 'kept');
  }
  const f = inputFixture('kept', [], true, { formatSelectionRef: { current: null } });
  assert.equal(f.key('b', { ctrlKey: true, nativeEvent: { isComposing: true } }), false); assert.equal(f.props.value, 'kept');
});

test('insert menu labels expose B/I/U and formatting routes through the shared selection action', async () => {
  const module = { exports: {} }, calls = [];
  const menuSource = await readFile(new URL('../src/components/editor/InsertElementsMenu.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(menuSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require: withTextInputHistory(id => {
      if (id === 'react') return { useRef: value => ({ current: value }), useEffect() {} };
      if (id === 'react/jsx-runtime') return { jsx, jsxs };
      if (id.endsWith('/ScrollViewport')) return { ScrollViewport: 'scroll-viewport' };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      throw new Error(id);
    }),
  });
  const tree = module.exports.InsertElementsMenu({ disabled: false, readOnly: false, onFormat: kind => calls.push(kind), onInsert() { throw new Error('format must preserve the chosen text'); } });
  const nodes = walk(tree), kbd = nodes.filter(node => node.type === 'kbd');
  const content = node => Array.isArray(node) ? node.map(content).join('') : node?.props ? content(node.props.children) : typeof node === 'string' ? node : '';
  assert.deepEqual(kbd.map(content), ['⌘ B / Ctrl + B', '⌘ I / Ctrl + I', '⌘ U / Ctrl + U']);
  for (const label of ['粗体', '斜体', '下划线']) {
    const button = nodes.find(node => node.type === 'button' && content(node).startsWith(label));
    assert.ok(button); button.props.onClick({ currentTarget: { closest: () => ({ open: true }) } });
  }
  assert.deepEqual(calls, ['bold', 'italic', 'underline']);
});

test('keyboard snippet scrolling does not let a stationary pointer reselect an earlier visible row', () => {
  const snippets = Array.from({ length: 12 }, (_, index) => ({ ...opening, id: 'item-' + index, name: 'Item ' + index, trigger: '//item-' + index }));
  const f = inputFixture('//', snippets), options = () => f.nodes().filter(node => node.props.role === 'treeitem');
  f.key('ArrowRight');
  for (let index = 0; index < 9; index++) f.key('ArrowDown');
  const selected = options().find(node => node.props['aria-selected']).props.id;
  assert.ok(f.menu.scrollTop > 0);
  const earlier = options()[3];
  earlier.props.onMouseEnter?.();
  earlier.props.onMouseMove?.({ movementX: 0, movementY: 0 }); f.render();
  assert.equal(options().find(node => node.props['aria-selected']).props.id, selected);
  f.key('ArrowDown');
  assert.notEqual(options().find(node => node.props['aria-selected']).props.id, selected);
  earlier.props.onMouseMove({ movementX: 1, movementY: 0 }); f.render();
  assert.equal(options().find(node => node.props['aria-selected']).props.id, earlier.props.id);
  assert.equal(f.document.activeElement, f.element);
  assert.equal(f.props.value, '//');
});
