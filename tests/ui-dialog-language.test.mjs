import * as uiFormatters from '../src/lib/i18n/formatters.ts';
import * as productMessages from '../src/lib/i18n/productMessages.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { createUII18n } from '../src/lib/i18n/runtime.ts';
import { themeBindingLabel, themeBindingToken } from '../src/lib/i18n/themeLabels.ts';
import { SNIPPET_CATEGORY_ICONS } from '../src/lib/snippetCategoryIcons.ts';
import { TAILWIND_ENDPOINTS, TAILWIND_PALETTE, TAILWIND_SHADES, tailwindColorToHex } from '../src/lib/tailwindPalette.ts';

const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree?.props ? text(tree.props.children) : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';

async function dialog(file, imports = {}) {
  const source = await readFile(new URL('../src/components/' + file, import.meta.url), 'utf8');
  const instance = createUII18n('en-US'), module = { exports: {} }, state = [], refs = [];
  let locale = 'en-US', stateIndex = 0, refIndex = 0;
  const react = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
    },
    useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
    useId: () => 'test-dialog', useEffect() {}, useMemo: callback => callback(),
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
...productMessages,
    module, exports: module.exports, require(id) {
if (id.endsWith('/i18n/productMessages')) return productMessages;
      if (id === 'react') return react;
      if (id.endsWith('/SelectField')) return { SelectField: 'select-field' };
      if (id === 'react/jsx-runtime') return { jsx, jsxs, Fragment };
      if (id.endsWith('/i18n/formatters')) return uiFormatters;
      if (id.endsWith('/UILocaleProvider')) return { useUILocale: () => ({ locale: locale }), useUITranslation: namespace => ({ t: instance.getFixedT(locale, namespace) }) };
      if (id.endsWith('/i18n/themeLabels')) return { themeBindingLabel, themeBindingToken };
      if (id.endsWith('/DialogFrame')) return { DialogFrame: 'frame', DialogHeader: 'header', DialogActions: 'actions', DialogButton: 'button', DialogFooter: 'footer' };
      for (const [suffix, value] of Object.entries(imports)) if (id.endsWith(suffix)) return value;
      throw new Error(id);
    },
  });
  return {
    render(name, props) { stateIndex = refIndex = 0; return module.exports[name](props); },
    language(next) { locale = next; },
  };
}

test('unsaved error and default actions change language without saving again or changing user labels', async () => {
  const ui = await dialog('global/UnsavedChangesDialog.tsx');
  let saves = 0, discarded = 0;
  const props = { entries: [{ label: '我的文稿', detail: '用户的说明' }], description: '自定义说明', onCancel() {}, onDiscard() { discarded++; }, async onSave() { saves++; return false; } };
  let tree = ui.render('UnsavedChangesDialog', props);
  assert.ok(text(tree).includes('我的文稿'));
  await nodes(tree).find(node => node.type === 'button' && text(node) === 'Save and leave').props.onClick();
  // The click handler starts an asynchronous save; allow its resolved promise to settle.
  await new Promise(resolve => setImmediate(resolve));
  tree = ui.render('UnsavedChangesDialog', props);
  assert.ok(text(nodes(tree).find(node => node.props.role === 'alert')).includes('Your changes are retained'));
  ui.language('zh-CN'); tree = ui.render('UnsavedChangesDialog', props);
  assert.equal(text(nodes(tree).find(node => node.props.role === 'alert')), '保存未完成，修改已保留。请检查后重试。');
  assert.ok(text(tree).includes('用户的说明')); assert.ok(text(tree).includes('保存并离开'));
  assert.equal(saves, 1); assert.equal(discarded, 0);
});

test('unsaved action labels translate the product verb while retaining the authored manuscript title', async () => {
  const ui = await dialog('editor/UnsavedDialog.tsx', { '/UnsavedChangesDialog': { UnsavedChangesDialog: 'unsaved' } });
  const props = { label: productMessages.productText('controller.open', { stored_parse_metadataTitle: '我的文稿' }), onCancel() {}, onSave() {}, onDiscard() {} };
  let tree = ui.render('UnsavedDialog', props);
  assert.ok(tree.props.description.includes('open “我的文稿”'));
  assert.ok(tree.props.description.includes('我的文稿'));
  assert.equal(tree.props.description.includes('打开'), false);
  ui.language('zh-CN'); tree = ui.render('UnsavedDialog', props);
  assert.ok(tree.props.description.includes('打开「我的文稿」'));
});

test('category icon labels are translated while selection and callback IDs stay canonical', async () => {
  const ui = await dialog('content/SnippetCategoryDialog.tsx', { '/snippetCategoryIcons': { SNIPPET_CATEGORY_ICONS }, '/CollapsiblePanel': { PanelHeading: 'heading' } });
  const selected = [], props = { name: 'my-category', value: 'table', onChange: id => selected.push(id) };
  let tree = ui.render('IconChoiceGrid', props);
  let choices = nodes(tree).filter(node => node.type === 'input');
  assert.equal(choices.find(node => node.props.value === 'table').props['aria-label'], 'Table');
  assert.equal(choices.find(node => node.props.value === 'table').props.checked, true);
  choices.find(node => node.props.value === 'sparkles').props.onChange(); assert.deepEqual(selected, ['sparkles']);
  ui.language('zh-CN'); tree = ui.render('IconChoiceGrid', props);
  choices = nodes(tree).filter(node => node.type === 'input');
  assert.equal(choices.find(node => node.props.value === 'table').props['aria-label'], '表格');
  assert.equal(choices.find(node => node.props.value === 'table').props.checked, true);
});

test('switching color picker language retains custom hex input and makes no palette change', async () => {
  const ui = await dialog('settings/EditorColorPicker.tsx', {
    '/tailwindPalette': { TAILWIND_ENDPOINTS, TAILWIND_PALETTE, TAILWIND_SHADES, tailwindColorToHex },
    '/ButtonBar': { ButtonBar: 'button-bar' },
    '/ColorSwatchButton': { ColorSwatchButton: 'swatch', useTailwindColorInformation: value => ({ hex: value, name: null }) },
  });
  const changes = [], props = { label: '主要文字', token: '--color-primary', modeLabel: 'Light', value: '#123456', onSelect: color => changes.push(color), onClose() {} };
  let tree = ui.render('EditorColorPicker', props);
  assert.equal(nodes(tree).find(node => node.type === 'header').props.title, 'Primary text · Light');
  nodes(tree).find(node => node.type === 'input').props.onChange({ target: { value: '#abcdef' } });
  ui.language('zh-CN'); tree = ui.render('EditorColorPicker', { ...props, modeLabel: '浅色' });
  const field = nodes(tree).find(node => node.type === 'input');
  assert.equal(field.props.value, '#abcdef'); assert.equal(field.props['aria-label'], '自定义 HEX');
  assert.equal(nodes(tree).find(node => node.type === 'header').props.title, '主要文字 · 浅色');
  assert.deepEqual(changes, []);
});

test('registered theme bindings translate by IDs and preserve authored CSS labels', () => {
  const t = createUII18n('en-US').getFixedT('en-US', 'dialogs');
  assert.equal(themeBindingLabel({ key: 'primary', token: '--color-primary', label: '主要文字' }, t), 'Primary text');
  assert.equal(themeBindingLabel({ key: 'node:h2', token: 'h2', label: '二级标题' }, t), 'Heading 2 text color');
  assert.equal(themeBindingLabel({ key: 'surface:light:custom', token: '--editor-field-background', label: '表单底色' }, t), 'Input background');
  assert.equal(themeBindingToken({ key: 'css:12:color', kind: 'css', token: 'CSS · 第 3 行' }, t), 'CSS · Line 3');
  assert.equal(themeBindingToken({ key: 'custom', kind: 'css', token: '我的 CSS' }, t), '我的 CSS');
  assert.equal(themeBindingLabel({ key: 'css:12:color', kind: 'css', token: 'CSS · 第 3 行', label: '固定色' }, t), 'Fixed color');
  assert.equal(themeBindingLabel({ key: 'custom', kind: 'css', token: '--my-label', label: '用户自定义标题' }, t), '用户自定义标题');
  assert.equal(themeBindingLabel({ key: 'custom', token: '--my-label', label: '用户自定义标题' }, t), '用户自定义标题');
});

test('delete confirmation renders plural titles without translating manuscript names or paths', async () => {
  const ui = await dialog('articles/ArticleDialogs.tsx', { '/fileSystem': { monthKey: () => '2026-10' } });
  const article = { id: 'user-id', month: '2026-10', folder: '原始目录', parse: { metadata: { title: '我的文稿' } } };
  const props = { articles: [article], archived: false, trashEnabled: false, onClose() {}, onConfirm() {} };
  let tree = ui.render('DeleteDialog', props);
  assert.equal(nodes(tree).find(node => node.type === 'header').props.title, 'Permanently delete this manuscript?');
  assert.ok(text(tree).includes('我的文稿')); assert.ok(text(tree).includes('2026-10/原始目录'));
  tree = ui.render('DeleteDialog', { ...props, articles: [article, { ...article, id: 'two' }], archived: true });
  assert.equal(nodes(tree).find(node => node.type === 'header').props.title, 'Delete 2 selected archived manuscripts?');
  ui.language('zh-CN'); tree = ui.render('DeleteDialog', props);
  assert.equal(nodes(tree).find(node => node.type === 'header').props.title, '永久删除文稿？');
});

 test('default article deletion promises reversible trash and invalid settings block confirmation', async () => {
  const ui = await dialog('articles/ArticleDialogs.tsx', { '/fileSystem': { monthKey: () => '2026-10' } });
  const article = { id: 'one', month: '2026-10', folder: 'original', parse: { metadata: { title: 'My article' } } };
  const tree = ui.render('DeleteDialog', { articles: [article], archived: false, disabled: true, onClose() {}, onConfirm() {} });
  assert.equal(nodes(tree).find(node => node.type === 'header').props.title, 'Move articles to trash');
  assert.match(text(tree), /can be restored/);
  assert.ok(nodes(tree).some(node => node.props.disabled === true && text(node) === 'Move to trash'));
 });
