import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import * as messages from '../src/lib/i18n/productMessages.ts';

async function fixture() {
  const clicked = [], revoked = [], code = await readFile(new URL('../src/components/media/MediaGallery.tsx', import.meta.url), 'utf8');
  const module = { exports: {} }; let afterClick = () => {};
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports,
    URL: { createObjectURL: file => 'blob:' + file.name, revokeObjectURL: url => revoked.push(url) },
    document: { createElement() { return { click() { clicked.push(this.download); afterClick(); }, remove() {} }; }, body: { append() {} } },
    window: { setTimeout(callback) { callback(); } },
    require(id) {
      if (id === 'react') return React; if (id === 'react/jsx-runtime') return jsx;
      if (id.endsWith('/productMessages')) return messages;
      if (id.endsWith('/articleMedia')) return { libraryMediaAssetKey: asset => asset.fileName };
      return {};
    },
  });
  const asset = name => ({ fileName: name, handle: { async getFile() { return { name }; } } });
  return { ...module.exports, asset, clicked, revoked, afterClick(callback) { afterClick = callback; } };
}

test('batch download reports initiated items and per-file failures instead of claiming completion', async () => {
  const f = await fixture(), first = f.asset('a.png'), broken = f.asset('bad.png');
  broken.handle.getFile = async () => { throw new Error('test read failure'); };
  const result = await f.downloadMediaAssets([first, broken], () => true);
  assert.equal(result.ok, false); assert.deepEqual([...result.failedKeys], ['bad.png']);
  assert.deepEqual(f.clicked, ['a.png']); assert.deepEqual(f.revoked, ['blob:a.png']);
  assert.equal(result.messageParams.started, 1); assert.equal(result.messageParams.failed, 1);
  assert.match(result.message, /已发起1项/); assert.match(result.message, /test read failure/);
});

test('switching libraries prevents every remaining file read and download in a batch', async () => {
  const f = await fixture(), first = f.asset('a.png'), second = f.asset('b.png'); let current = true, reads = 0;
  f.afterClick(() => { current = false; }); second.handle.getFile = async () => { reads++; return { name:'b.png' }; };
  const result = await f.downloadMediaAssets([first, second], () => current);
  assert.equal(reads, 0); assert.deepEqual(f.clicked, ['a.png']); assert.deepEqual([...result.failedKeys], ['b.png']);
  assert.equal(result.messageParams.started, 1); assert.equal(result.messageParams.failed, 1);
  assert.match(result.message, /资料库已切换/);
});


test('an entirely failed batch carries error while a completed batch carries success', async () => {
  const f = await fixture(), broken = f.asset('missing.png');
  broken.handle.getFile = async () => { throw new Error('missing'); };
  assert.equal((await f.downloadMediaAssets([broken], () => true)).tone, 'error');
  assert.equal((await f.downloadMediaAssets([f.asset('ok.png')], () => true)).tone, 'success');
});
