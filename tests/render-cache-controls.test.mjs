import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';
import { withUILocaleImports } from './ui-locale-fixture.mjs';

const source = await readFile(new URL('../src/components/settings/RenderCacheControls.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : typeof node === 'string' ? node : '';
const settled = () => new Promise(resolve => setImmediate(resolve));

function settings({ scanRenderStorage, clearBrowserCache = async () => {}, migrateRenderStorage }) {
  let cursor = 0;
  const cells = [], notices = [], root = {};
  const queue = { run: action => action() };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, document: { body: {} }, require: withUILocaleImports(id => {
    if (id === 'react') return {
      useEffect() {},
      useRef(value) { const index = cursor++; return cells[index] ??= { current: value }; },
      useState(value) { const index = cursor++; if (!(index in cells)) cells[index] = value; return [cells[index], next => { cells[index] = next; }]; },
    };
    if (id === 'react/jsx-runtime') return { jsx, jsxs };
    if (id === 'react-dom') return { createPortal: node => node };
    if (id.endsWith('/Toast')) return { useToast: () => notice => notices.push(notice) };
    if (id.endsWith('/DialogFrame')) return { DialogFrame: 'dialog', DialogHeader: 'header', DialogFooter: 'footer', DialogActions: 'div', DialogButton: 'button' };
    if (id.endsWith('/ButtonBar')) return { ButtonBar: 'group' };
    if (id.endsWith('/browserCache')) return { clearBrowserCache, browserCacheUsage: async () => ({ persistent: true, bytes: 0 }) };
    if (id.endsWith('/renderer')) return { clearArticleStyleCache() {} };
    if (id.endsWith('/imageCache')) return { clearArticleImageCache() {} };
    if (id.endsWith('/renderMaintenance')) return { scanRenderStorage, migrateRenderStorage };
    throw new Error(id);
  }) });
  const button = (label, variant) => {
    cursor = 0;
    return walk(module.exports.RenderCacheControls({ root, queue })).find(node => node.type === 'button' && text(node) === label && node.props.variant === variant);
  };
  return { button, notices };
}

test('browser cache clearing stays busy until completion and cannot be cancelled after starting', async () => {
  const pending = Promise.withResolvers();
  const f = settings({ clearBrowserCache: () => pending.promise });
  f.button('清理浏览器缓存').props.onClick();
  assert.equal(f.button('正在清理浏览器缓存…').props.disabled, true);
  assert.equal(f.button('取消'), undefined);
  assert.equal(f.notices.length, 0);
  pending.resolve();
  await settled();
  assert.equal(f.notices[0].label, '浏览器缓存已清理');
  assert.equal(f.button('清理浏览器缓存').props.disabled, false);
});

for (const interrupted of [false, true]) {
  test(interrupted ? 'a stopped migration reports committed work and checks usage after settling'
    : 'a failed readback preserves the completed migration result', async () => {
    let scans = 0;
    const pending = Promise.withResolvers();
    const f = settings({
      async scanRenderStorage() {
        if (++scans === 2 && !interrupted) throw new Error('fixture readback failed');
        return { bytes: 10, legacyRecords: 2, candidates: [], reclaimBytes: 0 };
      },
      async migrateRenderStorage(_root, current, onCommit) {
        onCommit(1);
        if (!interrupted) return 2;
        await pending.promise;
        assert.equal(current(), false);
        throw new Error('stopped at next write');
      },
    });
    f.button('检查占用').props.onClick();
    await settled();
    f.button('迁移旧留存').props.onClick();
    f.button('迁移旧留存', 'primary').props.onClick();
    if (interrupted) {
      f.button('取消').props.onClick();
      assert.equal(f.button('正在停止…').props.disabled, true);
      pending.resolve();
    }
    await settled();
    assert.equal(scans, 2);
    const notice = f.notices[0];
    assert.equal(notice.tone, 'warning');
    assert.equal(notice.label, interrupted ? '缓存操作部分完成' : '操作已完成，占用检查失败');
    assert.equal(notice.details[0].messageParams.count, interrupted ? 1 : 2);
  });
}
