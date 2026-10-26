import * as productMessages from '../src/lib/i18n/productMessages.ts';
import { withUILocaleImports } from "./ui-locale-fixture.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { normalizeDataDirectoryName } from '../src/lib/fileSystem.ts';
import { DEFAULT_PLATFORM_PRESET_ID, PUBLIC_PLATFORM_PRESETS, getPublicPlatformPreset } from '../src/lib/article-format/library.ts';

const source = await readFile(new URL('../src/components/settings/CreateLibraryDialog.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : typeof node === 'string' ? node : '';

function dialog(onCreate = async () => ({ status: 'created' })) {
  const cells = [], requests = [], presets = [];
  let cursor = 0, tree, closes = 0;
  const module = { exports: {} };
  vm.runInNewContext(code, {
...productMessages, module, exports: module.exports, Error, require: withUILocaleImports(function(id){
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id.endsWith('/fileSystem')) return { normalizeDataDirectoryName };
    if (id.endsWith('/article-format/library')) return { DEFAULT_PLATFORM_PRESET_ID, PUBLIC_PLATFORM_PRESETS };
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'frame', DialogHeader: 'header', DialogFooter: 'footer', DialogActions: 'actions', DialogButton: 'dialog-button' };
    if (id === 'react') return {
      useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = initial; return [cells[index], value => { cells[index] = value; }]; },
      useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
    };
    throw new Error(id);
  }) });
  const render = () => { cursor = 0; tree = nodes(module.exports.CreateLibraryDialog({ onCreate: (name, presetId) => { requests.push(name); presets.push(presetId); return onCreate(name, presetId); }, onClose: () => closes++ })); };
  const find = predicate => { const node = tree.find(predicate); assert.ok(node); return node; };
  const result = { render, find, all: () => tree, requests, presets, get closes() { return closes; }, input: () => find(node => node.type === 'input'),
    frame: () => find(node => node.type === 'frame'), submit: () => find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }),
    button: label => find(node => node.type === 'dialog-button' && text(node) === label),
    name(value) { result.input().props.onChange({ target: { value } }); render(); },
  };
  render(); return result;
}

test('library creation reuses the dialog shell, focuses the name, previews the destination and validates before choosing a directory', async () => {
  const view = dialog();
  assert.equal(view.input().props.autoFocus, true);
  const preset = view.find(node => node.type === 'select-field');
  assert.equal(preset.props.value, 'wechat-article');
  assert.deepEqual(Array.from(preset.props.options, option => option.value), ['wechat-article', 'empty']);
  assert.equal(view.button('选择父目录并创建').props.disabled, true);
  for (const value of [' ', '../文稿', '..', '文稿.', 'a:']) {
    view.name(value); assert.equal(view.button('选择父目录并创建').props.disabled, true);
    await view.submit(); assert.equal(view.requests.length, 0);
  }
  view.name('  ｍｙ－ａｒｔｉｃｌｅｓ  ');
  assert.match(text(view.find(node => node.props['aria-label'] === '资料库保存位置预览')), /所选父目录 \/ my-articles/);
  assert.equal(view.input().props['aria-invalid'], false);
  await view.submit(); assert.deepEqual(view.requests, ['my-articles']); assert.equal(view.closes, 1);
  assert.deepEqual(view.presets, ['wechat-article']);
});

test('the empty validator selection reaches creation without changing the default or losing a cancelled choice', async () => {
  const responses = [{ status: 'cancelled' }, { status: 'created' }];
  const view = dialog(async () => responses.shift()); view.name('空规则资料库');
  view.find(node => node.type === 'select-field').props.onChange('empty'); view.render();
  assert.equal(view.find(node => node.type === 'select-field').props.options.find(option => option.value === 'empty').label, '空校验器');
  await view.submit(); view.render();
  assert.equal(view.find(node => node.type === 'select-field').props.value, 'empty');
  assert.equal(view.closes, 0);
  await view.submit();
  assert.deepEqual(view.presets, ['empty', 'empty']);
  assert.equal(view.closes, 1);
});

test('pending directory creation blocks duplicate submissions, cancellation and dismissal', async () => {
  let finish;
  const view = dialog(() => new Promise(resolve => { finish = resolve; }));
  view.name('测试资料库'); const pending = view.submit(); view.render();
  assert.equal(view.frame().props.dismissible, false);
  assert.equal(view.all().some(node => node.props.role === 'status'), false);
  assert.equal(view.button('创建中…').props.disabled, true);
  assert.equal(view.input().props.disabled, true);
  assert.equal(view.find(node => node.type === 'select-field').props.disabled, true);
  assert.equal(view.button('取消').props.disabled, true);
  assert.equal(view.find(node => node.type === 'header').props.closeDisabled, true);
  await view.submit(); view.frame().props.onClose();
  assert.equal(view.requests.length, 1); assert.equal(view.closes, 0);
  finish({ status: 'created' }); await pending; assert.equal(view.closes, 1);
});

test('picker cancellation and a creation failure retain the name and permit retry; only success closes', async () => {
  const responses = [{ status: 'cancelled' }, { status: 'error', message: '已有同名文件夹' }, { status: 'created' }];
  const view = dialog(async () => responses.shift()); view.name('我的文稿');
  await view.submit(); view.render();
  assert.equal(view.closes, 0); assert.equal(view.input().props.value, '我的文稿');
  assert.equal(view.all().some(node => node.props.role === 'status' || node.props.role === 'alert'), false);
  await view.submit(); view.render();
  assert.equal(text(view.find(node => node.props.role === 'alert')), '已有同名文件夹');
  assert.equal(view.input().props.value, '我的文稿'); assert.equal(view.button('选择父目录并创建').props.disabled, false);
  await view.submit(); assert.equal(view.closes, 1);
});

test('unexpected creation errors remain inside the dialog and cancel returns without writes', async () => {
  const view = dialog(async () => { throw new Error('写入失败'); }); view.name('我的文稿');
  await view.submit(); view.render();
  assert.equal(text(view.find(node => node.props.role === 'alert')), '写入失败');
  view.button('取消').props.onClick(); assert.equal(view.closes, 1); assert.equal(view.requests.length, 1);
});

const controllerSource = await readFile(new URL('../src/hooks/useEditorController.ts', import.meta.url), 'utf8');
function action(name, next, context) {
  context.Error = Error;
  const start = controllerSource.indexOf(`  const ${name} = useCallback(`);
  const end = controllerSource.indexOf(`\n\n  const ${next}`, start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(ts.transpileModule(controllerSource.slice(start, end) + `\nglobalThis.action = ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, Object.assign(context, productMessages));
  return context.action;
}

test('opening and cancelling the library picker is silent; actual selection failures report once', async () => {
  let operation, rejectPicker;
  const statuses = [], notices = [], opened = [], root = { name: 'chosen-library' };
  const context = { useCallback: callback => callback, DOMException, resumeIntentRef: { current: { active: false } }, directorySelectionRef: { current: 0 },
    runAfterDraftDecision: value => { operation = value; }, pickDataDirectory: () => new Promise((_, reject) => { rejectPicker = reject; }),
    assertExistingDataDirectory: async () => {}, rememberAuthorizedDirectory() {}, openAuthorizedDirectory: async (...args) => opened.push(args),
    setStatus: value => statuses.push(value), notifyToast: value => notices.push(value),
  };
  const choose = action('authorizeDirectory', 'requestCreateDataDirectory', context);
  choose(); const pending = operation.run();
  assert.equal(statuses.length, 0); assert.equal(notices.length, 0);
  rejectPicker(new DOMException('cancelled', 'AbortError')); await pending;
  assert.equal(statuses.length, 0); assert.equal(notices.length, 0); assert.equal(opened.length, 0);
  context.pickDataDirectory = async () => root;
  context.assertExistingDataDirectory = async () => { throw new Error('not a library'); };
  choose(); await operation.run();
  assert.equal(notices.length, 1); assert.equal(notices[0].tone, 'error'); assert.match(notices[0].label, /not a library/);
  assert.equal(statuses.at(-1).notify, false, 'the editor must not announce the same failure again');
  context.assertExistingDataDirectory = async () => {};
  choose(); await operation.run();
  assert.equal(notices.length, 1); assert.equal(opened.length, 1); assert.equal(opened[0][2], true);
});

test('remembered-library permission failures keep their explicit feedback after removing the shared status relay', async () => {
  const statuses = [], notices = [], opened = [], root = { name: 'remembered-library' };
  let permission = Promise.resolve('denied');
  const context = { useCallback: callback => callback, rememberedDirectory: root, directorySelectionRef: { current: 0 },
    requestDirectoryReadWritePermission: () => permission, setDirectoryRestoreState() {}, openAuthorizedDirectory: async (...args) => opened.push(args),
    setStatus: value => statuses.push(value), notifyToast: value => notices.push(value),
  };
  const reopen = action('reopenRememberedDirectory', 'confirmFormatCheck', context);
  reopen(); await permission;
  assert.equal(notices.length, 1); assert.equal(notices[0].tone, 'warning'); assert.equal(statuses[0].notify, false);
  permission = Promise.reject(new Error('permission unavailable'));
  reopen(); await permission.catch(() => {});
  assert.equal(notices.length, 2); assert.equal(notices[1].tone, 'error'); assert.match(notices[1].label, /permission unavailable/);
  permission = Promise.resolve('granted');
  reopen(); await permission;
  assert.equal(notices.length, 2); assert.equal(opened.length, 1); assert.equal(opened[0][2], true);
});

test('draft protection precedes the creation dialog and does not open the native picker until the form action', () => {
  let pending, opened = false;
  const request = action('requestCreateDataDirectory', 'createDataDirectory', {
    useCallback: callback => callback, runAfterDraftDecision: value => { pending = value; }, setCreateLibraryDialogOpen: value => { opened = value; },
  });
  request(); assert.equal(opened, false); assert.equal(pending.label, '新建资料库'); pending.run(); assert.equal(opened, true);
});

test('directory creation reports success, cancellation, stale selection and file collisions to the dialog', async () => {
  const statuses = [], opened = [], creates = [], root = { name: 'new-library' };
  const context = { useCallback: callback => callback, DOMException, resumeIntentRef: { current: { active: false } }, seedLocale: 'zh-CN', DEFAULT_PLATFORM_PRESET_ID, getPublicPlatformPreset, directorySelectionRef: { current: 0 },
    pickDataDirectory: async () => ({}), createNamedDataDirectory: async (...args) => { creates.push(args); return root; },
    setStatus: status => statuses.push(status), rememberAuthorizedDirectory: (handle, selection) => opened.push(['remember', handle, selection]),
    openAuthorizedDirectory: async (handle, selection) => opened.push(['open', handle, selection]),
  };
  const create = action('createDataDirectory', 'reopenRememberedDirectory', context);
  context.pickDataDirectory = async () => { throw new Error('picker must not open for a private preset'); };
  assert.equal((await create('new-library', 'unlisted-platform')).status, 'error');
  assert.equal(opened.length, 0);
  context.pickDataDirectory = async () => ({});
  assert.equal((await create('new-library')).status, 'created'); assert.equal(opened.length, 2);
  assert.equal(creates[0][3], 'zh-CN');
  context.pickDataDirectory = async () => { throw new DOMException('取消', 'AbortError'); };
  assert.equal((await create('new-library')).status, 'cancelled'); assert.equal(opened.length, 2);
  context.pickDataDirectory = async () => { context.directorySelectionRef.current++; return {}; };
  assert.equal((await create('new-library')).status, 'cancelled'); assert.equal(opened.length, 2);
  context.pickDataDirectory = async () => ({}); context.createNamedDataDirectory = async () => { throw new Error('已有同名目录'); };
  const failure = await create('new-library'); assert.equal(failure.status, 'error'); assert.equal(failure.message, '已有同名目录');
  assert.equal(statuses.at(-1).tone, 'error'); assert.equal(opened.length, 2);
  context.createNamedDataDirectory = async (...args) => { creates.push(args); return root; };
  assert.equal((await create('empty-library', 'empty')).status, 'created');
  assert.equal(creates.at(-1)[2], 'empty');
  assert.equal(opened.length, 4);
});
